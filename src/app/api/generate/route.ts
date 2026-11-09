import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  getTodayDateString,
  sanitizeFolderName,
  getSessionFolderPath,
  getOriginalsFolderPath,
  ensureDirectory,
  saveBase64Image,
  saveSessionMetadata,
  getPublicFileUrl,
} from "@/lib/storage/file-manager";
import { buildConceptDNA, compileStylePrompt } from "@/lib/agents/director-agent";
import { extractVisionSummaries, enrichProductDetailsFromVision } from "@/lib/agents/analyzer-agent";
import { orchestrateImageGeneration } from "@/lib/agents/image-orchestrator";
import {
  ProductSession,
  GeneratedImageRecord,
  ProductDetails,
  ConceptMode,
  AspectRatio,
  AIProvider,
  PackagingOption,
  ColorTone,
  ProcessLogEntry,
} from "@/types/studio";

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
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: time,
      level,
      agent,
      stepName,
      message,
      details,
    });
  };

  try {
    const body = await req.json();
    const {
      productDetails,
      generateMode = "hero_only",
      conceptMode = "preset",
      conceptPresetId = "luxury_podium",
      conceptPrompt = "",
      packagingOption = "auto_detect",
      colorTone = "auto",
      lockSameBackground = true,
      aspectRatio = "1:1",
      provider = "sangtao",
      useHybridOverlay = true,
      originalPhotos = [],
      backgroundRef = null,
      sampleRef = null,
    }: {
      productDetails: ProductDetails;
      generateMode?: "hero_only" | "full";
      conceptMode: ConceptMode;
      conceptPresetId?: string;
      conceptPrompt?: string;
      packagingOption?: PackagingOption;
      colorTone?: ColorTone;
      lockSameBackground?: boolean;
      aspectRatio: AspectRatio;
      provider: AIProvider;
      useHybridOverlay: boolean;
      originalPhotos: string[];
      backgroundRef?: string | null;
      sampleRef?: string | null;
    } = body;

    addLog(
      "info",
      "System",
      "Khởi tạo Multi-Modal Commercial Visual Pipeline",
      `Chế độ: ${generateMode === "hero_only" ? "Tạo Ảnh Hero Trước (Phong Cách 1)" : "Bộ 3 Ảnh Đầy Đủ"} | Sản phẩm: "${productDetails.title || "Tự động nhận diện"}" | Bao bì: ${packagingOption} | Tone màu: ${colorTone} | Tỷ lệ: ${aspectRatio} | Provider: ${provider}`
    );

    if (originalPhotos.length === 0) {
      addLog("error", "AnalyzerAgent", "Kiểm tra đầu vào", "Không tìm thấy ảnh sản phẩm tham chiếu (Product Reference Images)!");
      return NextResponse.json(
        { error: "Vui lòng tải lên ít nhất 1 ảnh chụp sản phẩm gốc!", logs },
        { status: 400 }
      );
    }

    const dateFolder = getTodayDateString();
    const safeTitle = sanitizeFolderName(productDetails.title || "product");
    const sessionId = `prod_${safeTitle}_${Date.now().toString().slice(-6)}`;
    const sessionDir = getSessionFolderPath(dateFolder, sessionId);
    const originalsDir = getOriginalsFolderPath(dateFolder, sessionId);

    ensureDirectory(sessionDir);
    ensureDirectory(originalsDir);

    addLog("info", "System", "Khởi tạo thư mục lưu trữ", `Lưu tại: output_collections/${dateFolder}/${sessionId}`);

    // Save Product Reference Images (1-3)
    const savedOriginalUrls: string[] = [];
    const photoBuffers: Buffer[] = [];

    for (let i = 0; i < originalPhotos.length; i++) {
      const fileName = `phone_photo_${i + 1}.png`;
      await saveBase64Image(originalsDir, fileName, originalPhotos[i]);
      savedOriginalUrls.push(getPublicFileUrl(dateFolder, sessionId, `originals/${fileName}`));
      const base64Data = originalPhotos[i].replace(/^data:image\/\w+;base64,/, "");
      photoBuffers.push(Buffer.from(base64Data, "base64"));
    }

    addLog(
      "success",
      "AnalyzerAgent",
      "Thu thập Product Reference Images",
      `Đã nạp ${photoBuffers.length} ảnh chụp sản phẩm gốc vào luồng tham chiếu Multi-Modal.`
    );

    let savedBgUrl: string | undefined;
    let bgBuffer: Buffer | undefined;
    if (backgroundRef) {
      await saveBase64Image(originalsDir, "bg_reference.png", backgroundRef);
      savedBgUrl = getPublicFileUrl(dateFolder, sessionId, "originals/bg_reference.png");
      bgBuffer = Buffer.from(backgroundRef.replace(/^data:image\/\w+;base64,/, ""), "base64");
      addLog("info", "AnalyzerAgent", "Nạp ảnh Background", "Đã nạp 1 ảnh bối cảnh tham chiếu từ người dùng.");
    }

    let savedSampleUrl: string | undefined;
    let sampleBuffer: Buffer | undefined;
    if (sampleRef) {
      await saveBase64Image(originalsDir, "sample_reference.png", sampleRef);
      savedSampleUrl = getPublicFileUrl(dateFolder, sessionId, "originals/sample_reference.png");
      sampleBuffer = Buffer.from(sampleRef.replace(/^data:image\/\w+;base64,/, ""), "base64");
      addLog("info", "AnalyzerAgent", "Nạp Concept Reference Image", "Đã nạp 1 ảnh mẫu định hình không gian & ánh sáng Studio.");
    }

    // 0. Auto-Enrich Product Details if fields are empty
    const finalProductDetails = await enrichProductDetailsFromVision({
      productBuffer: photoBuffers[0],
      currentDetails: productDetails,
      onLog: (entry) => addLog(entry.level, entry.agent, entry.stepName, entry.message, entry.details),
    });

    // 1. Vision AI Analysis of Product Identity & Concept Reference
    addLog(
      "info",
      "AnalyzerAgent",
      "Phân tích đặc trưng sản phẩm & bao bì bằng Vision AI",
      "Đang trích xuất màu sắc, logo, kiểu dáng hộp và phong cách Concept mẫu..."
    );
    const visionSummaries = await extractVisionSummaries({
      productBuffer: photoBuffers[0],
      conceptBuffer: sampleBuffer || bgBuffer,
    });
    addLog(
      "success",
      "AnalyzerAgent",
      "Trích xuất Vision Metadata thành công",
      `Nhận diện sản phẩm: ${(visionSummaries.productVisionSummary || "").slice(0, 120)}...`,
      `Product Summary: ${visionSummaries.productVisionSummary || "N/A"}\nConcept Summary: ${visionSummaries.conceptVisionSummary || "N/A"}`
    );

    if (visionSummaries.sampleStyleAnalysis) {
      const s = visionSummaries.sampleStyleAnalysis;
      addLog(
        "success",
        "AnalyzerAgent",
        "Phân tích chuyên sâu phong cách thiết kế ảnh mẫu",
        `Đã bóc tách cấu trúc nghệ thuật từ ảnh mẫu:\n• Bục & Bề mặt: ${s.surfaceAndPodium}\n• Bối cảnh: ${s.backgroundEnvironment}\n• Đạo cụ: ${s.decorativeProps}\n• Ánh sáng: ${s.lightingSetup}\n• Tone màu: ${s.colorPalette}`
      );
    }

    // 2. Art Director compiles 7-Part Multi-Modal Prompt Engine
    addLog(
      "info",
      "DirectorAgent",
      "Kích hoạt 7-Part Multi-Modal Prompt Engine",
      `Áp đặt Rule 1 (No-Frame), Rule 2 (${packagingOption}), Rule 3 (Strict Identity), Tone (${colorTone}), Lock Lookbook (${lockSameBackground ? "Bật" : "Tắt"})`
    );
    const conceptDNA = buildConceptDNA({
      conceptMode,
      conceptPresetId,
      conceptPrompt,
      productDetails: finalProductDetails,
      packagingOption,
      colorTone,
      lockSameBackground,
      hasConceptRef: Boolean(sampleBuffer || bgBuffer),
      productVisionSummary: visionSummaries.productVisionSummary,
      conceptVisionSummary: visionSummaries.conceptVisionSummary,
      sampleStyleAnalysis: visionSummaries.sampleStyleAnalysis,
    });

    const createdAt = new Date().toISOString();

    // 3. Render Style 1: HERO DESIGN (Sản phẩm + Vỏ hộp chuẩn thương mại edge-to-edge)
    addLog(
      "info",
      "Orchestrator",
      "Render Kiểu 1: HERO DESIGN (Edge-to-Edge Commercial Shoot)",
      "Tách bỏ nền ảnh chụp cũ, bố trí sản phẩm thật & vỏ hộp đứng cạnh nhau trên bục 3D..."
    );
    const style1Prompts = compileStylePrompt({
      style: "style1_hero",
      conceptDNA,
      productDetails: finalProductDetails,
      aspectRatio,
      useHybridOverlay,
    });
    const s1Res = await orchestrateImageGeneration({
      style: "style1_hero",
      prompt: style1Prompts.prompt,
      negativePrompt: style1Prompts.negativePrompt,
      aspectRatio,
      provider,
      originalPhotos: photoBuffers,
      backgroundRef: bgBuffer,
      sampleRef: sampleBuffer,
      productDetails: finalProductDetails,
      useHybridOverlay,
      onLog: (entry) => logs.push(entry),
    });
    const s1FileName = "v1_style1_hero.png";
    const s1Path = path.join(sessionDir, s1FileName);
    await fs.promises.writeFile(s1Path, s1Res.buffer);
    let s1CleanPath: string | undefined;
    if (s1Res.cleanBuffer) {
      s1CleanPath = path.join(sessionDir, "v1_style1_hero_clean.png");
      await fs.promises.writeFile(s1CleanPath, s1Res.cleanBuffer);
    }
    const s1Record: GeneratedImageRecord = {
      id: `${sessionId}_s1_v1`,
      style: "style1_hero",
      styleName: "Hero Design (Sản phẩm & Vỏ hộp chuẩn thương mại)",
      version: 1,
      imageUrl: getPublicFileUrl(dateFolder, sessionId, s1FileName),
      localPath: s1Path,
      cleanLocalPath: s1CleanPath,
      aspectRatio,
      promptUsed: style1Prompts.prompt,
      provider,
      createdAt,
      hasOverlayBadge: finalProductDetails.showPriceBadge,
    };
    addLog(
      "success",
      "Compositor",
      "Hoàn tất Kiểu 1 (Hero Design)",
      `Đã lưu ${s1FileName} (${(s1Res.buffer.length / 1024).toFixed(1)} KB)`
    );

    // If generateMode === "hero_only" (default workflow), complete Step 1 here
    if (generateMode === "hero_only") {
      const session: ProductSession = {
        id: sessionId,
        dateFolder,
        sessionName: finalProductDetails.title || "Sản phẩm",
        productDetails: finalProductDetails,
        conceptMode,
        conceptPresetId,
        conceptPrompt,
        packagingOption,
        colorTone,
        lockSameBackground,
        aspectRatio,
        provider,
        useHybridOverlay,
        generationWarning: s1Res.warning,
        executionLogs: logs,
        uploadedImages: {
          originalPhotos: savedOriginalUrls,
          backgroundRef: savedBgUrl,
          sampleRef: savedSampleUrl,
        },
        sampleStyleAnalysis: visionSummaries.sampleStyleAnalysis,
        currentResults: {
          style1: s1Record,
        },
        history: [s1Record],
        createdAt,
        updatedAt: createdAt,
      };

      await saveSessionMetadata(session);

      addLog(
        "success",
        "System",
        "Hoàn tất Bước 1: Tạo ảnh Hero (Phong cách 1)",
        "Đã tạo ảnh Hero thành công! Hãy bấm nút '✨ Tạo Concept' trên ảnh để sinh tiếp 2 ảnh còn lại trong bộ sưu tập."
      );

      return NextResponse.json({
        success: true,
        session,
        logs,
      });
    }

    // 4. Render Style 2: MULTI-ANGLE 2x2 (Ghép 4 góc cận cảnh chi tiết & chất liệu)
    addLog(
      "info",
      "Orchestrator",
      "Render Kiểu 2: MULTI-ANGLE 2x2 (4 Góc Cận Cảnh & Chất Liệu)",
      "Sinh bố cục 2x2 Grid đồng nhất tone màu Lookbook: Chính diện, Macro tem mác, Góc 45°, Chi tiết cạnh & cáp..."
    );
    const style2Prompts = compileStylePrompt({
      style: "style2_grid2x2",
      conceptDNA,
      productDetails: finalProductDetails,
      aspectRatio,
      useHybridOverlay,
    });
    const s2Res = await orchestrateImageGeneration({
      style: "style2_grid2x2",
      prompt: style2Prompts.prompt,
      negativePrompt: style2Prompts.negativePrompt,
      aspectRatio,
      provider,
      originalPhotos: photoBuffers,
      backgroundRef: bgBuffer,
      sampleRef: sampleBuffer,
      productDetails: finalProductDetails,
      useHybridOverlay,
      onLog: (entry) => logs.push(entry),
    });
    const s2FileName = "v1_style2_grid2x2.png";
    const s2Path = path.join(sessionDir, s2FileName);
    await fs.promises.writeFile(s2Path, s2Res.buffer);
    let s2CleanPath: string | undefined;
    if (s2Res.cleanBuffer) {
      s2CleanPath = path.join(sessionDir, "v1_style2_grid2x2_clean.png");
      await fs.promises.writeFile(s2CleanPath, s2Res.cleanBuffer);
    }
    const s2Record: GeneratedImageRecord = {
      id: `${sessionId}_s2_v1`,
      style: "style2_grid2x2",
      styleName: "Multi-Angle 2x2 (4 Góc Cận Cảnh Chi Tiết & Chất Liệu)",
      version: 1,
      imageUrl: getPublicFileUrl(dateFolder, sessionId, s2FileName),
      localPath: s2Path,
      cleanLocalPath: s2CleanPath,
      aspectRatio,
      promptUsed: style2Prompts.prompt,
      provider,
      createdAt,
    };
    addLog(
      "success",
      "Compositor",
      "Hoàn tất Kiểu 2 (Multi-Angle 2x2)",
      `Đã lưu ${s2FileName} (${(s2Res.buffer.length / 1024).toFixed(1)} KB)`
    );

    // 5. Render Style 3: INFOGRAPHIC LINE (Chú thích kỹ thuật, line callout công năng)
    addLog(
      "info",
      "Orchestrator",
      "Render Kiểu 3: INFOGRAPHIC LINE (Chú Thích Kỹ Thuật & Line Callout)",
      "Sinh nền Studio tối giản đồng bộ và kết xuất đường chỉ dẫn công năng..."
    );
    const style3Prompts = compileStylePrompt({
      style: "style3_callout",
      conceptDNA,
      productDetails: finalProductDetails,
      aspectRatio,
      useHybridOverlay,
    });
    const s3Res = await orchestrateImageGeneration({
      style: "style3_callout",
      prompt: style3Prompts.prompt,
      negativePrompt: style3Prompts.negativePrompt,
      aspectRatio,
      provider,
      originalPhotos: photoBuffers,
      backgroundRef: bgBuffer,
      sampleRef: sampleBuffer,
      productDetails: finalProductDetails,
      useHybridOverlay,
      onLog: (entry) => logs.push(entry),
    });
    const s3FileName = "v1_style3_callout.png";
    const s3Path = path.join(sessionDir, s3FileName);
    await fs.promises.writeFile(s3Path, s3Res.buffer);
    let s3CleanPath: string | undefined;
    if (s3Res.cleanBuffer) {
      s3CleanPath = path.join(sessionDir, "v1_style3_callout_clean.png");
      await fs.promises.writeFile(s3CleanPath, s3Res.cleanBuffer);
    }
    const s3Record: GeneratedImageRecord = {
      id: `${sessionId}_s3_v1`,
      style: "style3_callout",
      styleName: "Infographic Line (Chú Thích Kỹ Thuật & Công Năng)",
      version: 1,
      imageUrl: getPublicFileUrl(dateFolder, sessionId, s3FileName),
      localPath: s3Path,
      cleanLocalPath: s3CleanPath,
      aspectRatio,
      promptUsed: style3Prompts.prompt,
      provider,
      createdAt,
    };
    addLog(
      "success",
      "Compositor",
      "Hoàn tất Kiểu 3 (Infographic Line)",
      `Đã lưu ${s3FileName} (${(s3Res.buffer.length / 1024).toFixed(1)} KB)`
    );

    const detectedWarning = s1Res.warning || s2Res.warning || s3Res.warning;
    if (detectedWarning) {
      addLog("warning", "CriticAgent", "Ghi nhận lưu ý hệ thống", detectedWarning);
    }

    const session: ProductSession = {
      id: sessionId,
      dateFolder,
      sessionName: finalProductDetails.title || "Sản phẩm",
      productDetails: finalProductDetails,
      conceptMode,
      conceptPresetId,
      conceptPrompt,
      packagingOption,
      colorTone,
      lockSameBackground,
      aspectRatio,
      provider,
      useHybridOverlay,
      generationWarning: detectedWarning,
      executionLogs: logs,
      uploadedImages: {
        originalPhotos: savedOriginalUrls,
        backgroundRef: savedBgUrl,
        sampleRef: savedSampleUrl,
      },
      sampleStyleAnalysis: visionSummaries.sampleStyleAnalysis,
      currentResults: {
        style1: s1Record,
        style2: s2Record,
        style3: s3Record,
      },
      history: [s1Record, s2Record, s3Record],
      createdAt,
      updatedAt: createdAt,
    };

    await saveSessionMetadata(session);

    addLog(
      "success",
      "System",
      "Hoàn tất Bộ sưu tập Lookbook 3-Pack",
      "Cả 3 ảnh thương mại đã được đồng bộ tone màu, tách nền 3D và lưu vào ổ cứng."
    );

    return NextResponse.json({
      success: true,
      session,
      logs,
    });
  } catch (err: any) {
    console.error("Generate API error:", err);
    addLog(
      "error",
      "System",
      "Tiến trình gặp lỗi nghiêm trọng",
      err.message || "Failed to generate images",
      err.stack
    );
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to generate images",
        logs,
      },
      { status: 500 }
    );
  }
}
