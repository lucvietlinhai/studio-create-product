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
import { GeneratedImageRecord, ProcessLogEntry } from "@/types/studio";

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
      id: `concept_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: time,
      level,
      agent,
      stepName,
      message,
      details,
    });
  };

  try {
    const { sessionId, dateFolder } = await req.json();

    if (!sessionId || !dateFolder) {
      return NextResponse.json(
        { error: "Thiếu sessionId hoặc dateFolder!", logs },
        { status: 400 }
      );
    }

    addLog(
      "info",
      "System",
      "Khởi tạo Tạo Concept (Bước 2)",
      `Đang tải phiên: ${sessionId} (${dateFolder}) để sinh 2 ảnh còn lại trong bộ sưu tập.`
    );

    const session = await getSessionMetadata(dateFolder, sessionId);
    if (!session) {
      addLog("error", "System", "Kiểm tra phiên", "Không tìm thấy metadata của phiên làm việc này.");
      return NextResponse.json({ error: "Session not found", logs }, { status: 404 });
    }

    if (!session.currentResults.style1) {
      addLog("error", "System", "Kiểm tra điều kiện", "Cần có ảnh Phong Cách 1 (Hero) trước khi sinh Concept bộ sưu tập!");
      return NextResponse.json(
        { error: "Chưa có ảnh Phong Cách 1 (Hero). Vui lòng tạo ảnh Hero trước!", logs },
        { status: 400 }
      );
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

    // Use Style 1 as visual concept reference if no explicit sample reference exists
    let sampleBuffer: Buffer | undefined;
    const samplePath = path.join(originalsDir, "sample_reference.png");
    if (fs.existsSync(samplePath)) {
      sampleBuffer = await fs.promises.readFile(samplePath);
    } else if (session.currentResults.style1.localPath && fs.existsSync(session.currentResults.style1.localPath)) {
      // Inherit Hero render as style lock
      try {
        sampleBuffer = await fs.promises.readFile(session.currentResults.style1.localPath);
        addLog(
          "info",
          "DirectorAgent",
          "Kế thừa Aesthetic Hero",
          "Sử dụng ảnh Hero (Phong Cách 1) làm chuẩn bối cảnh, ánh sáng và bục 3D để đồng bộ Lookbook."
        );
      } catch (err) {
        console.warn("Could not read style1 as sampleBuffer:", err);
      }
    }

    const visionSummaries =
      photoBuffers.length > 0
        ? await extractVisionSummaries({
            productBuffer: photoBuffers[0],
            conceptBuffer: sampleBuffer || bgBuffer,
          })
        : { productVisionSummary: "", conceptVisionSummary: "" };

    const effectiveStyleAnalysis = session.sampleStyleAnalysis || visionSummaries.sampleStyleAnalysis;

    if (effectiveStyleAnalysis) {
      const s = effectiveStyleAnalysis;
      addLog(
        "success",
        "AnalyzerAgent",
        "Kế thừa phân tích phong cách thiết kế",
        `Đồng bộ phong cách từ ảnh mẫu:\n• Bục: ${s.surfaceAndPodium}\n• Bối cảnh: ${s.backgroundEnvironment}\n• Ánh sáng: ${s.lightingSetup}\n• Tone màu: ${s.colorPalette}`
      );
    }

    const conceptDNA = buildConceptDNA({
      conceptMode: session.conceptMode,
      conceptPresetId: session.conceptPresetId,
      conceptPrompt: session.conceptPrompt,
      productDetails: session.productDetails,
      packagingOption: session.packagingOption || "auto_detect",
      colorTone: session.colorTone || "auto",
      lockSameBackground: session.lockSameBackground ?? true,
      hasConceptRef: Boolean(sampleBuffer || bgBuffer),
      productVisionSummary: visionSummaries.productVisionSummary,
      conceptVisionSummary: visionSummaries.conceptVisionSummary,
      sampleStyleAnalysis: effectiveStyleAnalysis,
    });

    const createdAt = new Date().toISOString();

    // 1. Render Style 2: MULTI-ANGLE 2x2
    const s2Ver = getNextVersionNumber(session, "style2_grid2x2");
    addLog(
      "info",
      "Orchestrator",
      `Render Kiểu 2: MULTI-ANGLE 2x2 (v${s2Ver})`,
      "Sinh bố cục 2x2 Grid đồng nhất tone màu Lookbook: Chính diện, Macro tem mác, Góc 45°, Chi tiết cạnh & cáp..."
    );
    const style2Prompts = compileStylePrompt({
      style: "style2_grid2x2",
      conceptDNA,
      productDetails: session.productDetails,
      aspectRatio: session.aspectRatio,
      useHybridOverlay: session.useHybridOverlay,
    });
    const s2Res = await orchestrateImageGeneration({
      style: "style2_grid2x2",
      prompt: style2Prompts.prompt,
      negativePrompt: style2Prompts.negativePrompt,
      aspectRatio: session.aspectRatio,
      provider: session.provider,
      originalPhotos: photoBuffers,
      backgroundRef: bgBuffer,
      sampleRef: sampleBuffer,
      productDetails: session.productDetails,
      useHybridOverlay: session.useHybridOverlay,
      onLog: (entry) => logs.push(entry),
    });
    const s2FileName = `v${s2Ver}_style2_grid2x2.png`;
    const s2Path = path.join(sessionDir, s2FileName);
    await fs.promises.writeFile(s2Path, s2Res.buffer);
    let s2CleanPath: string | undefined;
    if (s2Res.cleanBuffer) {
      s2CleanPath = path.join(sessionDir, `v${s2Ver}_style2_grid2x2_clean.png`);
      await fs.promises.writeFile(s2CleanPath, s2Res.cleanBuffer);
    }
    const s2Record: GeneratedImageRecord = {
      id: `${sessionId}_s2_v${s2Ver}`,
      style: "style2_grid2x2",
      styleName: "Multi-Angle 2x2 (4 Góc Cận Cảnh Chi Tiết & Chất Liệu)",
      version: s2Ver,
      imageUrl: getPublicFileUrl(dateFolder, sessionId, s2FileName),
      localPath: s2Path,
      cleanLocalPath: s2CleanPath,
      aspectRatio: session.aspectRatio,
      promptUsed: style2Prompts.prompt,
      provider: session.provider,
      createdAt,
    };
    addLog(
      "success",
      "Compositor",
      "Hoàn tất Kiểu 2 (Multi-Angle 2x2)",
      `Đã lưu ${s2FileName} (${(s2Res.buffer.length / 1024).toFixed(1)} KB)`
    );

    // 2. Render Style 3: INFOGRAPHIC LINE
    const s3Ver = getNextVersionNumber(session, "style3_callout");
    addLog(
      "info",
      "Orchestrator",
      `Render Kiểu 3: INFOGRAPHIC LINE (v${s3Ver})`,
      "Sinh nền Studio tối giản đồng bộ và kết xuất đường chỉ dẫn công năng..."
    );
    const style3Prompts = compileStylePrompt({
      style: "style3_callout",
      conceptDNA,
      productDetails: session.productDetails,
      aspectRatio: session.aspectRatio,
      useHybridOverlay: session.useHybridOverlay,
    });
    const s3Res = await orchestrateImageGeneration({
      style: "style3_callout",
      prompt: style3Prompts.prompt,
      negativePrompt: style3Prompts.negativePrompt,
      aspectRatio: session.aspectRatio,
      provider: session.provider,
      originalPhotos: photoBuffers,
      backgroundRef: bgBuffer,
      sampleRef: sampleBuffer,
      productDetails: session.productDetails,
      useHybridOverlay: session.useHybridOverlay,
      onLog: (entry) => logs.push(entry),
    });
    const s3FileName = `v${s3Ver}_style3_callout.png`;
    const s3Path = path.join(sessionDir, s3FileName);
    await fs.promises.writeFile(s3Path, s3Res.buffer);
    let s3CleanPath: string | undefined;
    if (s3Res.cleanBuffer) {
      s3CleanPath = path.join(sessionDir, `v${s3Ver}_style3_callout_clean.png`);
      await fs.promises.writeFile(s3CleanPath, s3Res.cleanBuffer);
    }
    const s3Record: GeneratedImageRecord = {
      id: `${sessionId}_s3_v${s3Ver}`,
      style: "style3_callout",
      styleName: "Infographic Line (Chú Thích Kỹ Thuật & Công Năng)",
      version: s3Ver,
      imageUrl: getPublicFileUrl(dateFolder, sessionId, s3FileName),
      localPath: s3Path,
      cleanLocalPath: s3CleanPath,
      aspectRatio: session.aspectRatio,
      promptUsed: style3Prompts.prompt,
      provider: session.provider,
      createdAt,
    };
    addLog(
      "success",
      "Compositor",
      "Hoàn tất Kiểu 3 (Infographic Line)",
      `Đã lưu ${s3FileName} (${(s3Res.buffer.length / 1024).toFixed(1)} KB)`
    );

    const detectedWarning = s2Res.warning || s3Res.warning;
    if (detectedWarning) {
      session.generationWarning = detectedWarning;
      addLog("warning", "CriticAgent", "Ghi nhận lưu ý hệ thống", detectedWarning);
    }

    session.currentResults.style2 = s2Record;
    session.currentResults.style3 = s3Record;
    session.history.push(s2Record, s3Record);
    session.updatedAt = createdAt;
    session.executionLogs = [...(session.executionLogs || []), ...logs];

    await saveSessionMetadata(session);

    addLog(
      "success",
      "System",
      "Hoàn tất Bộ sưu tập Lookbook 3-Pack",
      "Cả 3 ảnh thương mại đã được đồng bộ bối cảnh và lưu vào ổ cứng."
    );

    return NextResponse.json({
      success: true,
      session,
      logs,
    });
  } catch (err: any) {
    console.error("Generate concept error:", err);
    addLog(
      "error",
      "System",
      "Lỗi tạo Concept",
      err.message || "Failed to generate concept images",
      err.stack
    );
    return NextResponse.json(
      { error: err.message || "Failed to generate concept images", logs },
      { status: 500 }
    );
  }
}

