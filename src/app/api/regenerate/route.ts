import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  getSessionFolderPath,
  getSessionMetadata,
  saveSessionMetadata,
  getPublicFileUrl,
  getNextVersionNumber,
} from "@/lib/storage/file-manager";
import { buildConceptDNA, compileStylePrompt } from "@/lib/agents/director-agent";
import { extractVisionSummaries } from "@/lib/agents/analyzer-agent";
import { orchestrateImageGeneration } from "@/lib/agents/image-orchestrator";
import { GeneratedImageRecord, ShotStyle, ImageResolution, EditRegionBox, ProcessLogEntry } from "@/types/studio";

export async function POST(req: NextRequest) {
  const logs: ProcessLogEntry[] = [];
  const addLog = (
    level: "info" | "success" | "warning" | "error",
    agent: ProcessLogEntry["agent"],
    stepName: string,
    message: string,
    details?: string
  ) => {
    const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });
    logs.push({
      id: `regen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: time,
      level,
      agent,
      stepName,
      message,
      details,
    });
  };

  try {
    const {
      dateFolder,
      sessionId,
      targetStyle, // "style1_hero" | "style2_grid2x2" | "style3_callout" | "all"
      customPromptModifier,
      editPrompt,
      editRegion,
      annotatedGuideDataUrl,
      resolution: reqResolution,
    }: {
      dateFolder: string;
      sessionId: string;
      targetStyle: ShotStyle | "all";
      customPromptModifier?: string;
      editPrompt?: string;
      editRegion?: EditRegionBox;
      annotatedGuideDataUrl?: string;
      resolution?: ImageResolution;
    } = await req.json();

    const cleanEditPrompt = (editPrompt || customPromptModifier || "").trim();
    let annotatedGuideBuffer: Buffer | undefined;
    if (annotatedGuideDataUrl && typeof annotatedGuideDataUrl === "string") {
      const b64 = annotatedGuideDataUrl.replace(/^data:image\/\w+;base64,/, "");
      if (b64.length > 50) {
        annotatedGuideBuffer = Buffer.from(b64, "base64");
      }
    }

    if (cleanEditPrompt) {
      const regionDesc = editRegion
        ? ` [Vùng khoanh: ${editRegion.zoneLabel} (${Math.round(editRegion.xPercent)}%..${Math.min(100, Math.round(editRegion.xPercent + editRegion.widthPercent))}%, ${Math.round(editRegion.yPercent)}%..${Math.min(100, Math.round(editRegion.yPercent + editRegion.heightPercent))}%)]`
        : " [Phạm vi: Toàn ảnh]";
      addLog(
        "info",
        "DirectorAgent",
        "Kích hoạt AI Image Editor (Sửa ảnh bằng Prompt & Vùng chọn)",
        `Áp dụng yêu cầu sửa: "${cleanEditPrompt}" cho ${targetStyle}${regionDesc}`
      );
    } else {
      addLog(
        "info",
        "System",
        "Yêu cầu tái sinh ảnh (Regenerate)",
        `Mục tiêu: ${targetStyle === "all" ? "Toàn bộ Lookbook 3-Pack" : targetStyle}`
      );
    }

    const session = await getSessionMetadata(dateFolder, sessionId);
    if (!session) {
      addLog("error", "System", "Kiểm tra phiên", "Không tìm thấy metadata của phiên làm việc này.");
      return NextResponse.json({ error: "Session not found", logs }, { status: 404 });
    }

    const sessionDir = getSessionFolderPath(dateFolder, sessionId);
    const originalsDir = path.join(sessionDir, "originals");

    // Load original photos buffers from disk
    const photoBuffers: Buffer[] = [];
    if (fs.existsSync(originalsDir)) {
      const files = await fs.promises.readdir(originalsDir);
      const photoFiles = files.filter((f) => f.startsWith("phone_photo_")).sort();
      for (const pFile of photoFiles) {
        photoBuffers.push(await fs.promises.readFile(path.join(originalsDir, pFile)));
      }
    }

    let bgBuffer: Buffer | undefined;
    const bgPath = path.join(originalsDir, "bg_reference.png");
    if (fs.existsSync(bgPath)) {
      bgBuffer = await fs.promises.readFile(bgPath);
    }

    let sampleBuffer: Buffer | undefined;
    const samplePath = path.join(originalsDir, "sample_reference.png");
    if (fs.existsSync(samplePath)) {
      sampleBuffer = await fs.promises.readFile(samplePath);
    }

    const visionSummaries =
      photoBuffers.length > 0
        ? await extractVisionSummaries({
            productBuffer: photoBuffers[0],
            conceptBuffer: sampleBuffer || bgBuffer,
          })
        : { productVisionSummary: "", conceptVisionSummary: "" };

    const conceptDNA = buildConceptDNA({
      conceptMode: session.conceptMode,
      conceptPresetId: session.conceptPresetId,
      conceptPrompt: customPromptModifier
        ? `${session.conceptPrompt || ""} ${customPromptModifier}`.trim()
        : session.conceptPrompt,
      productDetails: session.productDetails,
      packagingOption: session.packagingOption || "product_and_box",
      colorTone: session.colorTone || "auto",
      lockSameBackground: session.lockSameBackground ?? true,
      hasConceptRef: Boolean(sampleBuffer || bgBuffer),
      productVisionSummary: visionSummaries.productVisionSummary,
      conceptVisionSummary: visionSummaries.conceptVisionSummary,
    });

    const now = new Date().toISOString();
    const stylesToRegen: ShotStyle[] =
      targetStyle === "all"
        ? ["style1_hero", "style2_grid2x2", "style3_callout"]
        : [targetStyle as ShotStyle];

    for (const style of stylesToRegen) {
      const nextVer = getNextVersionNumber(session, style);
      addLog(
        "info",
        "Orchestrator",
        cleanEditPrompt ? `Chỉnh sửa ${style} (Phiên bản v${nextVer})` : `Tái sinh ${style} (Phiên bản v${nextVer})`,
        cleanEditPrompt ? `Đang áp dụng mô tả sửa: "${cleanEditPrompt}"...` : "Đang chạy lại 7-Part Multi-Modal Pipeline..."
      );

      // Read clean image buffer (without SVG vector text overlays) to prevent double-text ghosting!
      let currentImageBuffer: Buffer | undefined;
      const currentRec =
        style === "style1_hero"
          ? session.currentResults.style1
          : style === "style2_grid2x2"
          ? session.currentResults.style2
          : session.currentResults.style3;

      if (currentRec) {
        const cleanPath = currentRec.cleanLocalPath || currentRec.localPath?.replace(/\.png$/, "_clean.png");
        if (cleanPath && fs.existsSync(cleanPath)) {
          try {
            currentImageBuffer = await fs.promises.readFile(cleanPath);
          } catch {}
        } else if (currentRec.localPath && fs.existsSync(currentRec.localPath)) {
          try {
            // If editing Style 3 but no clean image exists, use clean Hero image as visual base
            // to avoid feeding burnt-in text back into the AI model!
            if (style === "style3_callout" && session.currentResults.style1?.localPath) {
              const heroClean =
                session.currentResults.style1.cleanLocalPath ||
                session.currentResults.style1.localPath.replace(/\.png$/, "_clean.png");
              if (heroClean && fs.existsSync(heroClean)) {
                currentImageBuffer = await fs.promises.readFile(heroClean);
              } else {
                currentImageBuffer = await fs.promises.readFile(session.currentResults.style1.localPath);
              }
            } else {
              currentImageBuffer = await fs.promises.readFile(currentRec.localPath);
            }
          } catch {}
        }
      }

      const shouldSkipOverlay =
        Boolean(cleanEditPrompt) &&
        /bỏ chữ|xóa chữ|ẩn chữ|nền sạch|không có text|no text|bỏ thông số/i.test(cleanEditPrompt);
      const effectiveUseOverlay = shouldSkipOverlay ? false : session.useHybridOverlay;

      const targetResolution: ImageResolution = reqResolution || currentRec?.resolution || session.resolution || "1K";
      session.resolution = targetResolution;

      const compiled = compileStylePrompt({
        style,
        conceptDNA,
        productDetails: session.productDetails,
        aspectRatio: session.aspectRatio,
        useHybridOverlay: effectiveUseOverlay,
        editPrompt: cleanEditPrompt || undefined,
        editRegion: editRegion || undefined,
      });

      const newRes = await orchestrateImageGeneration({
        style,
        prompt: compiled.prompt,
        negativePrompt: compiled.negativePrompt,
        aspectRatio: session.aspectRatio,
        resolution: targetResolution,
        provider: session.provider,
        originalPhotos: photoBuffers,
        backgroundRef: bgBuffer,
        sampleRef: sampleBuffer,
        currentImageRef: currentImageBuffer,
        annotatedGuideRef: annotatedGuideBuffer,
        editPrompt: cleanEditPrompt || undefined,
        editRegion: editRegion || undefined,
        productDetails: session.productDetails,
        useHybridOverlay: effectiveUseOverlay,
        onLog: (entry) => logs.push(entry),
      });

      if (newRes.warning) {
        session.generationWarning = newRes.warning;
        addLog("warning", "CriticAgent", "Ghi nhận lưu ý", newRes.warning);
      }

      const fileName = `v${nextVer}_${style}.png`;
      const filePath = path.join(sessionDir, fileName);
      await fs.promises.writeFile(filePath, newRes.buffer);
      let cleanFilePath: string | undefined;
      if (newRes.cleanBuffer) {
        cleanFilePath = path.join(sessionDir, `v${nextVer}_${style}_clean.png`);
        await fs.promises.writeFile(cleanFilePath, newRes.cleanBuffer);
      }

      let styleName = "Hero Design (Sản phẩm & Vỏ hộp chuẩn thương mại)";
      if (style === "style2_grid2x2")
        styleName = "Multi-Angle 2x2 (4 Góc Cận Cảnh Chi Tiết & Chất Liệu)";
      if (style === "style3_callout")
        styleName = "Infographic Line (Chú Thích Kỹ Thuật & Công Năng)";

      const newRecord: GeneratedImageRecord = {
        id: `${sessionId}_${style}_v${nextVer}`,
        style,
        styleName,
        version: nextVer,
        imageUrl: getPublicFileUrl(dateFolder, sessionId, fileName),
        localPath: filePath,
        cleanLocalPath: cleanFilePath,
        aspectRatio: session.aspectRatio,
        resolution: targetResolution,
        promptUsed: compiled.prompt,
        editPromptUsed: cleanEditPrompt || undefined,
        editRegionUsed: editRegion || undefined,
        provider: session.provider,
        createdAt: now,
      };

      if (style === "style1_hero") session.currentResults.style1 = newRecord;
      if (style === "style2_grid2x2") session.currentResults.style2 = newRecord;
      if (style === "style3_callout") session.currentResults.style3 = newRecord;

      session.history.push(newRecord);

      addLog(
        "success",
        cleanEditPrompt ? "DirectorAgent" : "Compositor",
        cleanEditPrompt ? `Hoàn tất Chỉnh sửa ${style} (v${nextVer})` : `Đã lưu v${nextVer}_${style}.png`,
        cleanEditPrompt
          ? `Đã áp dụng yêu cầu: "${cleanEditPrompt}". Phiên bản v${nextVer} đã sẵn sàng.`
          : `Lưu trữ không ghi đè vào lịch sử.`
      );
    }

    session.updatedAt = now;
    session.executionLogs = [...(session.executionLogs || []), ...logs];
    await saveSessionMetadata(session);

    return NextResponse.json({ success: true, session, logs });
  } catch (err: any) {
    console.error("Regenerate API error:", err);
    addLog(
      "error",
      "System",
      "Lỗi tái sinh ảnh",
      err.message || "Failed to regenerate image",
      err.stack
    );
    return NextResponse.json(
      { error: err.message || "Failed to regenerate image", logs },
      { status: 500 }
    );
  }
}
