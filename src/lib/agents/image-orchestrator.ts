import sharp from "sharp";
import crypto from "crypto";
import { AspectRatio, AIProvider, ShotStyle, ProductDetails, ProcessLogEntry, SANGTAO_IMAGE_MODEL } from "@/types/studio";
import {
  getDimensionsForRatio,
  create2x2GridImage,
  overlayCalloutOnImage,
  overlayPriceBadgeOnImage,
} from "@/lib/compositor/image-processor";
import { loadSettings } from "@/lib/config/settings-manager";
import { detectProductBoxAndCrop } from "@/lib/agents/analyzer-agent";

export interface GenerateImageOptions {
  style: ShotStyle;
  prompt: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  provider: AIProvider;
  originalPhotos: Buffer[]; // 1-3 Product Reference Images
  backgroundRef?: Buffer;
  sampleRef?: Buffer; // Concept Reference Image (0-1)
  currentImageRef?: Buffer; // Existing rendered image being edited
  editPrompt?: string; // Specific user modification prompt
  productDetails: ProductDetails;
  useHybridOverlay: boolean;
  onLog?: (entry: ProcessLogEntry) => void;
}

export interface OrchestrationResult {
  buffer: Buffer;
  cleanBuffer?: Buffer;
  warning?: string;
  usedProvider: string;
}

type LogEmitter = (
  level: "info" | "success" | "warning" | "error",
  agent: ProcessLogEntry["agent"],
  stepName: string,
  message: string,
  details?: string
) => void;

function getFluxDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case "16:9":
      return { width: 1024, height: 576 };
    case "9:16":
      return { width: 576, height: 1024 };
    case "4:3":
      return { width: 1024, height: 768 };
    case "3:4":
      return { width: 768, height: 1024 };
    case "4:5":
      return { width: 832, height: 1024 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

export async function orchestrateImageGeneration(
  options: GenerateImageOptions
): Promise<OrchestrationResult> {
  const { style, aspectRatio, provider } = options;
  const settings = loadSettings();
  const effectiveProvider = provider || settings.defaultProvider;

  const emitLog: LogEmitter = (level, agent, stepName, message, details) => {
    if (options.onLog) {
      const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });
      options.onLog({
        id: `orch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: time,
        level,
        agent,
        stepName,
        message,
        details,
      });
    }
  };

  const sangtaoApiKey = settings.sangtaoApiKey || process.env.SANGTAO_API_KEY || "";
  const cfAccountId = (settings as any).cloudflareAccountId || process.env.CF_ACCOUNT_ID || "";
  const cfApiToken = (settings as any).cloudflareApiToken || process.env.CF_API_TOKEN || "";
  const isSangtaoConfigured = Boolean(sangtaoApiKey);
  const isCloudflareConfigured = Boolean(cfAccountId && cfApiToken);
  const isGeminiConfigured = Boolean(settings.geminiApiKey || process.env.GEMINI_API_KEY);
  const isOpenAIConfigured = Boolean(settings.openaiApiKey || process.env.OPENAI_API_KEY);

  let warning: string | undefined;

  // 1. SANGTAO.AI REST API v2 (https://sangtao.ai/vi/api-docs#image-gen)
  if (effectiveProvider === "sangtao" && isSangtaoConfigured && !settings.enableMockMode) {
    try {
      const selectedSangtaoModel = SANGTAO_IMAGE_MODEL;
      emitLog(
        "info",
        "SangtaoAI",
        `Khởi chạy Sangtao.ai Image Generation (${style})`,
        `Model: ${selectedSangtaoModel} | Tỷ lệ: ${aspectRatio} | Số ảnh tham chiếu: ${options.originalPhotos.length}`
      );
      const sangtaoRes = await generateWithSangtaoPipeline(
        options,
        sangtaoApiKey,
        selectedSangtaoModel,
        isCloudflareConfigured ? { accountId: cfAccountId, apiToken: cfApiToken } : undefined,
        emitLog
      );
      emitLog(
        "success",
        "SangtaoAI",
        `Hoàn tất Render ${style} trên Sangtao.ai`,
        `Đã nhận kết quả từ Sangtao.ai (${(sangtaoRes.buffer.length / 1024).toFixed(1)} KB)`
      );
      return {
        buffer: sangtaoRes.buffer,
        cleanBuffer: sangtaoRes.cleanBuffer,
        usedProvider: `sangtao (${selectedSangtaoModel})`,
      };
    } catch (err: any) {
      console.warn("Sangtao.ai API call failed:", err);
      warning = `Lỗi từ Sangtao.ai API: ${err.message?.slice(0, 160)}. Hệ thống đã chuyển sang Engine Multi-Modal dự phòng.`;
      emitLog(
        "error",
        "SangtaoAI",
        "Sangtao.ai gặp sự cố",
        err.message || "Lỗi gọi API Sangtao.ai",
        err.stack || JSON.stringify(err)
      );
      if (isCloudflareConfigured) {
        try {
          emitLog(
            "info",
            "Orchestrator",
            "Chuyển tiếp tự động sang FLUX.2 Multi-Modal",
            "Đang xử lý dự phòng qua @cf/black-forest-labs/flux-2-klein-9b..."
          );
          const cfBuf = await generateWithCloudflarePipeline(
            options,
            cfAccountId,
            cfApiToken,
            "@cf/black-forest-labs/flux-2-klein-9b",
            emitLog
          );
          return {
            buffer: cfBuf.buffer,
            cleanBuffer: cfBuf.cleanBuffer,
            warning,
            usedProvider: "cloudflare_flux2_multimodal",
          };
        } catch { }
      }
    }
  }

  // 2. CLOUDFLARE WORKERS AI (Multi-Modal FLUX.2 & Text-to-Image + Multi-Modal Fusion)
  if ((effectiveProvider as string) === "cloudflare" && isCloudflareConfigured && !settings.enableMockMode) {
    try {
      const selectedCfModel =
        (settings as any).cloudflareModel || "@cf/black-forest-labs/flux-2-klein-9b";
      emitLog(
        "info",
        "Orchestrator",
        `Khởi chạy Pipeline Multi-Modal (${style})`,
        `Model: ${selectedCfModel} | Tỷ lệ: ${aspectRatio} | Số ảnh sản phẩm gốc: ${options.originalPhotos.length}`
      );
      const cfRes = await generateWithCloudflarePipeline(
        options,
        cfAccountId,
        cfApiToken,
        selectedCfModel,
        emitLog
      );
      emitLog(
        "success",
        "Orchestrator",
        `Hoàn tất Render ${style}`,
        `Đã trích xuất sản phẩm thật & đồng bộ bối cảnh Studio 3D (${(cfRes.buffer.length / 1024).toFixed(1)} KB)`
      );
      return {
        buffer: cfRes.buffer,
        cleanBuffer: cfRes.cleanBuffer,
        usedProvider: `cloudflare (${selectedCfModel.split("/").pop()})`,
      };
    } catch (err: any) {
      console.warn("Cloudflare Workers AI call failed:", err);
      warning = `Lỗi từ Cloudflare Workers AI: ${err.message?.slice(0, 160)}. Đã chuyển sang xử lý dự phòng.`;
      emitLog(
        "error",
        "Orchestrator",
        "Cloudflare API gặp sự cố",
        err.message || "Lỗi gọi API Cloudflare",
        err.stack || JSON.stringify(err)
      );
    }
  }

  // 3. GOOGLE GEMINI (🍌 Nano Banana Pro / gemini-2.5-flash-image Multi-Modal Reference)
  if (effectiveProvider === "gemini" && isGeminiConfigured && !settings.enableMockMode) {
    try {
      const geminiModel = settings.geminiModel || "gemini-2.5-flash-image";
      emitLog(
        "info",
        "Orchestrator",
        `Gửi yêu cầu Multi-Modal tới Google Gemini (${geminiModel})`,
        `Truyền ${options.originalPhotos.length} ảnh sản phẩm gốc + ảnh Concept mẫu kèm 7-Part Prompt...`
      );
      const geminiRes = await generateWithGeminiMultiModal(
        options,
        settings.geminiApiKey || process.env.GEMINI_API_KEY!,
        geminiModel,
        emitLog
      );
      emitLog(
        "success",
        "Orchestrator",
        "Tạo ảnh Gemini Multi-Modal thành công",
        `Đã nhận kết quả Studio 3D từ Gemini (${(geminiRes.buffer.length / 1024).toFixed(1)} KB).`
      );
      return {
        buffer: geminiRes.buffer,
        cleanBuffer: geminiRes.cleanBuffer,
        usedProvider: `gemini (${geminiModel})`,
      };
    } catch (err: any) {
      console.warn("Gemini Image Generation API call failed:", err);
      const errMsg = err.message || "";
      const isQuotaError =
        errMsg.includes("limit: 0") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("429") ||
        errMsg.includes("404") ||
        errMsg.includes("not found");

      if (isQuotaError) {
        warning =
          "Google AI Studio giới hạn tạo ảnh trên gói Free Tier (Quota 429 / limit: 0). Hệ thống đã tự động chuyển tiếp sang Cloudflare FLUX.2 Multi-Modal để đảm bảo ảnh sản phẩm được tách nền 3D chuẩn xác.";
      } else {
        warning = `Gemini Image API thông báo: ${errMsg.slice(0, 140)}. Đã tự động chuyển tiếp sang Engine Multi-Modal dự phòng.`;
      }
      emitLog("warning", "Orchestrator", "Gemini Quota / Chuyển tiếp tự động", warning);

      if (isCloudflareConfigured) {
        try {
          emitLog(
            "info",
            "Orchestrator",
            "Chuyển tiếp sang FLUX.2 Multi-Modal",
            "Đang xử lý ảnh sản phẩm gốc + Concept bằng @cf/black-forest-labs/flux-2-klein-9b..."
          );
          const cfBuf = await generateWithCloudflarePipeline(
            options,
            cfAccountId,
            cfApiToken,
            "@cf/black-forest-labs/flux-2-klein-9b",
            emitLog
          );
          return {
            buffer: cfBuf.buffer,
            cleanBuffer: cfBuf.cleanBuffer,
            warning,
            usedProvider: "cloudflare_flux2_multimodal (Auto-Bridge)",
          };
        } catch (bridgeErr: any) {
          emitLog("error", "Orchestrator", "Lỗi Bridge Cloudflare", bridgeErr.message);
        }
      }
    }
  }

  // 4. OPENAI (gpt-image-1 / dall-e-3)
  if (effectiveProvider === "openai" && isOpenAIConfigured && !settings.enableMockMode) {
    try {
      const openaiModel = settings.openaiModel || "gpt-image-1";
      emitLog(
        "info",
        "Orchestrator",
        `Gửi yêu cầu OpenAI (${openaiModel})`,
        "Đang khởi tạo bối cảnh và đồng bộ sản phẩm gốc..."
      );
      const openAiRes = await generateWithOpenAIPipeline(
        options,
        settings.openaiApiKey || process.env.OPENAI_API_KEY!,
        openaiModel,
        isCloudflareConfigured ? { accountId: cfAccountId, apiToken: cfApiToken } : undefined,
        emitLog
      );
      emitLog("success", "Orchestrator", "OpenAI hoàn tất", "Đã nhận kết quả từ OpenAI.");
      return {
        buffer: openAiRes.buffer,
        cleanBuffer: openAiRes.cleanBuffer,
        usedProvider: `openai (${openaiModel})`,
      };
    } catch (err: any) {
      console.warn("OpenAI API call failed:", err);
      warning = `OpenAI API gặp sự cố (${err.message?.slice(0, 150)}).`;
      emitLog("error", "Orchestrator", "Lỗi OpenAI", err.message);
      if (isCloudflareConfigured) {
        try {
          const cfRes = await generateWithCloudflarePipeline(
            options,
            cfAccountId,
            cfApiToken,
            "@cf/black-forest-labs/flux-2-klein-9b",
            emitLog
          );
          return {
            buffer: cfRes.buffer,
            cleanBuffer: cfRes.cleanBuffer,
            warning,
            usedProvider: "cloudflare_flux2_multimodal",
          };
        } catch { }
      }
    }
  }

  // 5. Fallback Local Alpha-Isolated Studio Synthesis Engine
  emitLog(
    "info",
    "Compositor",
    "Khởi tạo Local Alpha-Cutout Studio Engine",
    "Tách nền trong suốt sản phẩm gốc (loại bỏ bàn gỗ/tường) và đặt lên bục Studio 3D..."
  );
  const localRes = await generateStudioSynthesizedImage(options);
  emitLog("success", "Compositor", "Hoàn tất Studio Synthesis", "Sản phẩm đã được tách nền và render hoàn chỉnh.");
  return {
    buffer: localRes.buffer,
    cleanBuffer: localRes.cleanBuffer,
    warning,
    usedProvider: "studio_alpha_compositor",
  };
}

/**
 * SANGTAO.AI Image Generation Pipeline (https://sangtao.ai/vi/api-docs#image-gen)
 * 1. Uploads reference images via POST https://sangtao.ai/api/v2/images/upload (field "File", <1MB JPEG)
 * 2. Calls POST https://sangtao.ai/api/v2/images/generate (or /api/v2/agents/jobs/create for chatgpt-image-sangtao)
 * 3. Polls GET https://sangtao.ai/api/v2/jobs/{jobId} until status === "complete"
 */
async function uploadRefImageToSangtao(
  imgBuffer: Buffer,
  apiKey: string,
  index: number,
  emitLog?: LogEmitter
): Promise<string | null> {
  try {
    // Resize to max 768x768 JPEG quality 82 so file size is ~70-130KB (well under the 1MB limit of /api/v2/images/upload)
    const compactJpeg = await sharp(imgBuffer)
      .resize(768, 768, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    const form = new FormData();
    form.append(
      "File",
      new Blob([new Uint8Array(compactJpeg)], { type: "image/jpeg" }),
      `ref_${index}_${Date.now()}.jpg`
    );

    const res = await fetch("https://sangtao.ai/api/v2/images/upload", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: form,
    });

    if (res.ok) {
      const data = await res.json();
      const uploadedUrl = data.data?.imageUrl || data.data?.publicUrl || data.imageUrl;
      if (uploadedUrl) {
        return uploadedUrl;
      }
    }
  } catch (err: any) {
    emitLog?.(
      "warning",
      "SangtaoAI",
      `Lưu ý upload ảnh tham chiếu #${index + 1}`,
      err.message || "Không thể upload ảnh tham chiếu"
    );
  }
  return null;
}

async function generateWithSangtaoPipeline(
  options: GenerateImageOptions,
  apiKey: string,
  modelName: string,
  cfBridge?: { accountId: string; apiToken: string },
  emitLog?: LogEmitter
): Promise<{ buffer: Buffer; cleanBuffer: Buffer }> {
  const conceptRef = options.sampleRef || options.backgroundRef;
  const rawRefs: Buffer[] = [];
  if (options.currentImageRef) {
    // In edit mode: The current studio render MUST be Reference 1 (Base canvas to modify)
    rawRefs.push(options.currentImageRef);
    // Reference 2 is the authentic original product photo for identity preservation
    if (options.originalPhotos.length > 0) {
      rawRefs.push(options.originalPhotos[0]);
    }
  } else {
    // Standard photoshoot: Product photo(s) first, then optional concept reference
    rawRefs.push(...options.originalPhotos.slice(0, 3));
    if (conceptRef) {
      rawRefs.push(conceptRef);
    }
  }

  if (options.editPrompt) {
    emitLog?.(
      "info",
      "SangtaoAI",
      "Kích hoạt chế độ Sửa ảnh (Prompt Edit)",
      `Áp dụng yêu cầu sửa: "${options.editPrompt}"`
    );
  }

  // Step 1: Upload reference images to sangtao.ai so we can pass refImageUrls
  const refImageUrls: string[] = [];
  if (rawRefs.length > 0) {
    emitLog?.(
      "info",
      "SangtaoAI",
      "Tải ảnh tham chiếu lên Sangtao.ai",
      `Đang đồng bộ ${rawRefs.length} ảnh gốc & Concept qua POST /api/v2/images/upload...`
    );
    for (let i = 0; i < rawRefs.length; i++) {
      const url = await uploadRefImageToSangtao(rawRefs[i], apiKey, i, emitLog);
      if (url) {
        refImageUrls.push(url);
      }
    }
    if (refImageUrls.length > 0) {
      emitLog?.(
        "success",
        "SangtaoAI",
        "Đã tải xong ảnh tham chiếu",
        `Đã lấy ${refImageUrls.length} link refImageUrls cho tiến trình tạo ảnh.`
      );
    }
  }

  // Step 2: Create Image Generation Job via POST https://sangtao.ai/api/v2/images/generate
  const generateUrl = "https://sangtao.ai/api/v2/images/generate";
  let promptToSend = options.prompt;
  if (options.editPrompt && options.currentImageRef) {
    if (refImageUrls.length >= 2) {
      promptToSend = `[IMAGE-TO-IMAGE EDITING SESSION - MAXIMUM PROMPT FIDELITY]:
- Reference Image 1 (PRIMARY BASE CANVAS): The current photoshoot image that you MUST transform and modify.
- Reference Image 2 (AUTHENTIC PRODUCT REFERENCE): The authentic physical product. Ensure 100% exact fidelity of the product's brand logo, label text, form factor, and materials.

USER'S EXPLICIT EDIT DIRECTIVE (CRITICAL - APPLY VISUALLY AND BOLDLY):
>>> "${options.editPrompt.trim()}" <<<

${options.prompt}`;
    } else if (refImageUrls.length === 1) {
      promptToSend = `[IMAGE-TO-IMAGE EDITING SESSION - MAXIMUM PROMPT FIDELITY]:
- Reference Image 1 (PRIMARY BASE CANVAS): The current photoshoot image that you MUST transform and modify according to the user's edit directive.

USER'S EXPLICIT EDIT DIRECTIVE (CRITICAL - APPLY VISUALLY AND BOLDLY):
>>> "${options.editPrompt.trim()}" <<<

${options.prompt}`;
    }
  } else if (conceptRef && refImageUrls.length >= 2) {
    promptToSend = `[IMAGE MAPPING DIRECTIVE]:
- Reference Image 1: Authentic physical commercial product and retail packaging.
- Reference Image 2: TARGET PHOTOSET & ARTISTIC DESIGN BLUEPRINT. You MUST analyze and faithfully recreate its exact studio set, background, podium surface, lighting direction, props, and color mood.

${options.prompt}`;
  }

  const requestBody: Record<string, any> = {
    model: modelName,
    prompt: promptToSend,
    numImages: 1,
    aspectRatio: options.aspectRatio,
    options: {
      aspectRatio: options.aspectRatio,
      outputFormat: "png",
      resolution: "1K",
    },
  };

  if (refImageUrls.length > 0) {
    requestBody.refImageUrls = refImageUrls;
    requestBody.referenceImages = refImageUrls;
  }

  let createRes: Response;
  let createData: any;

  if (modelName === "chatgpt-image-sangtao" || modelName.includes("sangtao")) {
    emitLog?.(
      "info",
      "SangtaoAI",
      "Gửi yêu cầu POST /api/v2/agents/jobs/create (GPT Image 2)",
      `Model: ${modelName} | Tỷ lệ: ${options.aspectRatio} | Tham chiếu: ${refImageUrls.length} ảnh`
    );
    createRes = await fetch("https://sangtao.ai/api/v2/agents/jobs/create", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "chatgpt-image-sangtao",
        prompt: promptToSend,
        aspectRatio: options.aspectRatio,
        format: "png",
        resolution: "1K",
        referenceImages: refImageUrls.length > 0 ? refImageUrls : undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    createData = await createRes.json().catch(() => ({}));
  } else {
    emitLog?.(
      "info",
      "SangtaoAI",
      "Gửi yêu cầu POST /api/v2/images/generate",
      `Model: ${modelName} | Tỷ lệ: ${options.aspectRatio}`
    );
    createRes = await fetch(generateUrl, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    createData = await createRes.json().catch(() => ({}));
  }

  if (!createRes.ok || !createData.success || !createData.data?.jobId) {
    const errMsg =
      createData.error ||
      createData.message ||
      `Sangtao.ai trả về mã HTTP ${createRes.status}`;
    throw new Error(errMsg);
  }

  const jobId = createData.data.jobId;
  emitLog?.(
    "info",
    "SangtaoAI",
    `Đã khởi tạo Job: ${jobId}`,
    "Đang theo dõi tiến độ qua GET /api/v2/jobs/{jobId}..."
  );

  // Step 3: Poll GET https://sangtao.ai/api/v2/jobs/{jobId} every 3.5 seconds
  const maxPolls = 40;
  let resultImageUrl: string | undefined;

  for (let attempt = 1; attempt <= maxPolls; attempt++) {
    await new Promise((r) => setTimeout(r, 3500));

    const pollRes = await fetch(`https://sangtao.ai/api/v2/jobs/${jobId}`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    if (!pollRes.ok) continue;

    const pollJson = await pollRes.json().catch(() => ({}));
    const jobData = pollJson.data || pollJson;
    const status = String(jobData.status || "").toLowerCase();

    if (status === "complete" || status === "completed" || status === "succeeded") {
      resultImageUrl =
        jobData.resultImages?.[0] ||
        jobData.resultUrl ||
        jobData.result ||
        jobData.output?.imageUrl ||
        jobData.images?.[0];
      break;
    }

    if (status === "error" || status === "failed" || status === "cancelled") {
      throw new Error(
        `Job ${jobId} thất bại trên Sangtao.ai: ${jobData.error || jobData.errorCode || "Lỗi không xác định"}`
      );
    }

    if (attempt % 3 === 0) {
      emitLog?.(
        "info",
        "SangtaoAI",
        `Đang đợi Job ${jobId} (${attempt * 3.5}s)`,
        `Trạng thái hiện tại: ${jobData.status || "processing"}`
      );
    }
  }

  if (!resultImageUrl) {
    throw new Error(`Hết thời gian chờ (Timeout) hoặc không tìm thấy URL ảnh từ Job ${jobId}.`);
  }

  emitLog?.(
    "info",
    "SangtaoAI",
    "Tải ảnh kết quả từ CDN Sangtao.ai",
    `URL: ${resultImageUrl}`
  );

  const imgRes = await fetch(resultImageUrl);
  if (!imgRes.ok) {
    throw new Error(`Không thể tải ảnh từ CDN Sangtao.ai (${imgRes.status})`);
  }

  let rawBuffer: Buffer = Buffer.from(await imgRes.arrayBuffer());

  // If reference upload wasn't supported by the selected model and originalPhotos exist, fuse via FLUX.2 if available
  if (refImageUrls.length === 0 && options.originalPhotos.length > 0 && cfBridge) {
    rawBuffer = await callCloudflareFlux2MultiModal({
      accountId: cfBridge.accountId,
      apiToken: cfBridge.apiToken,
      model: "@cf/black-forest-labs/flux-2-klein-9b",
      prompt: options.prompt,
      aspectRatio: options.aspectRatio,
      referenceImages: [...options.originalPhotos.slice(0, 3), rawBuffer],
      emitLog,
    });
  }

  return await finalizeCommercialPostProcessing(rawBuffer, options, emitLog);
}

/**
 * Multi-Modal FLUX.2 invocation on Cloudflare Workers AI
 * Passes up to 4 reference images (input_image_0..3) + 7-Part Prompt via multipart/form-data
 */
async function callCloudflareFlux2MultiModal(params: {
  accountId: string;
  apiToken: string;
  model: string;
  prompt: string;
  aspectRatio: AspectRatio;
  referenceImages: Buffer[];
  emitLog?: LogEmitter;
}): Promise<Buffer> {
  const { accountId, apiToken, model, prompt, aspectRatio, referenceImages, emitLog } = params;
  const { width, height } = getFluxDimensions(aspectRatio);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const form = new FormData();
  form.append("prompt", prompt.slice(0, 1980));
  form.append("width", String(width));
  form.append("height", String(height));

  const maxRefs = Math.min(referenceImages.length, 4);
  for (let i = 0; i < maxRefs; i++) {
    const resizedPng = await sharp(referenceImages[i])
      .resize(768, 768, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    form.append(
      `input_image_${i}`,
      new Blob([new Uint8Array(resizedPng)], { type: "image/png" }),
      `ref_${i}.png`
    );
  }

  emitLog?.(
    "info",
    "Orchestrator",
    `Truyền ${maxRefs} ảnh tham chiếu vào ${model.split("/").pop()}`,
    `Kích thước khung: ${width}x${height} | Chế độ: Multi-Modal Image-to-Image Conditioning`
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    emitLog?.("error", "Orchestrator", `Lỗi HTTP ${response.status}`, errText);
    throw new Error(`Cloudflare FLUX.2 Error (${response.status}): ${errText.slice(0, 220)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (!data.success || !data.result?.image) {
      const errMsg = data.errors?.[0]?.message || JSON.stringify(data.errors ?? data);
      throw new Error(`Cloudflare FLUX.2 Failed: ${errMsg}`);
    }
    return Buffer.from(data.result.image, "base64");
  } else {
    const arrBuf = await response.arrayBuffer();
    return Buffer.from(arrBuf);
  }
}

/**
 * Pure Text-to-Image invocation on Cloudflare Workers AI
 */
async function callCloudflareTextToImage(params: {
  accountId: string;
  apiToken: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  emitLog?: LogEmitter;
}): Promise<Buffer> {
  const { accountId, apiToken, model, prompt, negativePrompt, aspectRatio, emitLog } = params;
  const { width, height } = getFluxDimensions(aspectRatio);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const isFlux1 = model.includes("flux-1-schnell");
  const basePrompt = prompt.slice(0, 1900);
  const payload: Record<string, any> = isFlux1
    ? {
      prompt: `${basePrompt}. Empty center podium ready for product placement, studio commercial photography, no random bottles`,
      steps: 4,
    }
    : {
      prompt: `${basePrompt}. Empty center podium ready for product placement, commercial photography`,
      negative_prompt: negativePrompt ? negativePrompt.slice(0, 1000) : undefined,
      width,
      height,
      num_steps: model.includes("lightning") ? 4 : 20,
    };

  emitLog?.(
    "info",
    "Orchestrator",
    `Dựng bối cảnh Studio bằng ${model.split("/").pop()}`,
    `Đang sinh phông nền & ánh sáng bục trưng bày...`
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cloudflare T2I Error (${response.status}): ${errText.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (!data.success || !data.result?.image) {
      throw new Error(`Cloudflare T2I Failed: ${JSON.stringify(data.errors ?? data)}`);
    }
    return Buffer.from(data.result.image, "base64");
  } else {
    const arrBuf = await response.arrayBuffer();
    return Buffer.from(arrBuf);
  }
}

async function generateWithCloudflarePipeline(
  options: GenerateImageOptions,
  accountId: string,
  apiToken: string,
  modelName: string,
  emitLog?: LogEmitter
): Promise<{ buffer: Buffer; cleanBuffer: Buffer }> {
  const isFlux2MultiModal = modelName.includes("flux-2-");
  const conceptRef = options.sampleRef || options.backgroundRef;

  const referenceImages: Buffer[] = [...options.originalPhotos.slice(0, 3)];
  if (conceptRef) {
    referenceImages.push(conceptRef);
  }

  let rawGeneratedBuffer: Buffer;

  if (isFlux2MultiModal && referenceImages.length > 0) {
    rawGeneratedBuffer = await callCloudflareFlux2MultiModal({
      accountId,
      apiToken,
      model: modelName,
      prompt: options.prompt,
      aspectRatio: options.aspectRatio,
      referenceImages,
      emitLog,
    });
  } else if (!isFlux2MultiModal && options.originalPhotos.length > 0) {
    const stage1EnvBuffer = await callCloudflareTextToImage({
      accountId,
      apiToken,
      model: modelName,
      prompt: options.prompt,
      negativePrompt: options.negativePrompt,
      aspectRatio: options.aspectRatio,
      emitLog,
    });

    emitLog?.(
      "info",
      "Orchestrator",
      "Tách nền 3D & Đồng bộ sản phẩm thật (Stage 2)",
      "Đang trích xuất sản phẩm & hộp từ ảnh gốc và đặt lên bối cảnh vừa tạo..."
    );
    const stage2Refs = [...options.originalPhotos.slice(0, 3), stage1EnvBuffer];
    rawGeneratedBuffer = await callCloudflareFlux2MultiModal({
      accountId,
      apiToken,
      model: "@cf/black-forest-labs/flux-2-klein-9b",
      prompt: options.prompt,
      aspectRatio: options.aspectRatio,
      referenceImages: stage2Refs,
      emitLog,
    });
  } else {
    rawGeneratedBuffer = await callCloudflareTextToImage({
      accountId,
      apiToken,
      model: isFlux2MultiModal ? "@cf/black-forest-labs/flux-1-schnell" : modelName,
      prompt: options.prompt,
      negativePrompt: options.negativePrompt,
      aspectRatio: options.aspectRatio,
      emitLog,
    });
  }

  return await finalizeCommercialPostProcessing(rawGeneratedBuffer, options, emitLog);
}

/**
 * Google Gemini Multi-Modal Generation (🍌 Nano Banana Pro / gemini-2.5-flash-image)
 */
async function generateWithGeminiMultiModal(
  options: GenerateImageOptions,
  apiKey: string,
  modelName: string = "gemini-2.5-flash-image",
  emitLog?: LogEmitter
): Promise<{ buffer: Buffer; cleanBuffer: Buffer }> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const parts: any[] = [];
  parts.push({ text: "Product Reference (Image 0): The authentic commercial product and retail packaging to feature:" });
  for (const photoBuf of options.originalPhotos.slice(0, 3)) {
    const resized = await sharp(photoBuf)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: resized.toString("base64"),
      },
    });
  }

  if (options.currentImageRef && options.editPrompt) {
    parts.push({
      text: `Current Commercial Shot (Image to Edit): Modify this base shot according to the user's specific edit command: "${options.editPrompt.trim()}". Preserve authentic product design from Image 0.`,
    });
    const resizedCurrent = await sharp(options.currentImageRef)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: resizedCurrent.toString("base64"),
      },
    });
  } else {
    const conceptRef = options.sampleRef || options.backgroundRef;
    if (conceptRef) {
      parts.push({
        text: "Target Style Blueprint (Image 1): The MASTER PHOTOSHOOT SET REFERENCE. Analyze and faithfully reproduce its studio environment, podium surface, lighting direction, props, and color grading:",
      });
      const resizedConcept = await sharp(conceptRef)
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: resizedConcept.toString("base64"),
        },
      });
    }
  }

  parts.push({ text: options.prompt });

  const candidateModels = Array.from(
    new Set([modelName, "gemini-2.5-flash-image", "gemini-2.0-flash-exp-image-generation"])
  );

  let lastError: any = null;
  for (const m of candidateModels) {
    try {
      emitLog?.("info", "Orchestrator", `Gọi model ${m}`, "Đang truyền gói Multi-Modal...");
      const res = await ai.models.generateContent({
        model: m,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      });

      for (const part of res.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          const rawBuffer = Buffer.from(part.inlineData.data, "base64");
          return await finalizeCommercialPostProcessing(rawBuffer, options, emitLog);
        }
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("Gemini Multi-Modal did not return an image");
}

/**
 * OpenAI Pipeline (Supports gpt-image-1 and dall-e-3 + Multi-Modal Fusion)
 */
async function generateWithOpenAIPipeline(
  options: GenerateImageOptions,
  apiKey: string,
  modelName: string,
  cfBridge?: { accountId: string; apiToken: string },
  emitLog?: LogEmitter
): Promise<{ buffer: Buffer; cleanBuffer: Buffer }> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  const size =
    options.aspectRatio === "16:9"
      ? "1792x1024"
      : options.aspectRatio === "9:16"
        ? "1024x1792"
        : "1024x1024";

  const response = await client.images.generate({
    model: modelName === "dall-e-3" ? "dall-e-3" : "dall-e-3",
    prompt: `${options.prompt}. Empty center podium stage ready for product placement.`,
    n: 1,
    size: size as any,
    response_format: "b64_json",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("No image data returned from OpenAI API");
  }

  let sceneBuffer: Buffer = Buffer.from(b64, "base64");

  if (options.originalPhotos.length > 0 && cfBridge) {
    emitLog?.(
      "info",
      "Orchestrator",
      "Đồng bộ sản phẩm thật vào cảnh OpenAI",
      "Đang tách nền 3D sản phẩm gốc và ghép vào bối cảnh OpenAI..."
    );
    sceneBuffer = await callCloudflareFlux2MultiModal({
      accountId: cfBridge.accountId,
      apiToken: cfBridge.apiToken,
      model: "@cf/black-forest-labs/flux-2-klein-9b",
      prompt: options.prompt,
      aspectRatio: options.aspectRatio,
      referenceImages: [...options.originalPhotos.slice(0, 3), sceneBuffer],
      emitLog,
    });
  } else if (options.originalPhotos.length > 0) {
    sceneBuffer = await compositeAlphaProductOntoScene(sceneBuffer, options.originalPhotos[0]);
  }

  return await finalizeCommercialPostProcessing(sceneBuffer, options, emitLog);
}

/**
 * Ensures exact output resolution for the chosen AspectRatio and applies:
 * - Price Badge (if enabled on Style 1 Hero)
 * - Sleek Commercial Infographic Callout Lines & Typography (on Style 3 Callout)
 */
async function finalizeCommercialPostProcessing(
  rawBuffer: Buffer,
  options: GenerateImageOptions,
  emitLog?: LogEmitter
): Promise<{ buffer: Buffer; cleanBuffer: Buffer }> {
  const { width, height } = getDimensionsForRatio(options.aspectRatio);

  const cleanBuffer = await sharp(rawBuffer)
    .resize(width, height, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  let processedBuffer = cleanBuffer;

  if (options.style === "style3_callout" && options.useHybridOverlay) {
    emitLog?.(
      "info",
      "Compositor",
      "Vẽ Infographic Line Callout & Thông số kỹ thuật",
      "Đang kết xuất đường chỉ dẫn L-line, tiêu đề thương mại và cam kết chính sách..."
    );
    processedBuffer = await applyCalloutOverlay(cleanBuffer, options);
  } else if (options.style === "style1_hero" && options.productDetails.showPriceBadge) {
    const pos = options.productDetails.priceBadgePosition || "top-right";
    emitLog?.(
      "info",
      "Compositor",
      "Hiển thị giá sản phẩm",
      `Đang gắn nhãn giá niêm yết & ưu đãi lên ảnh tại vị trí: ${pos}...`
    );
    processedBuffer = await overlayPriceBadgeOnImage(
      cleanBuffer,
      options.productDetails
    );
  }

  return { buffer: processedBuffer, cleanBuffer };
}

async function applyCalloutOverlay(
  imageBuffer: Buffer,
  options: GenerateImageOptions
): Promise<Buffer> {
  const rawHighlights = options.productDetails.highlightFeatures || [];
  const calloutPoints = [
    {
      id: "1",
      title: rawHighlights[0] || "Thiết kế cao cấp, hoàn thiện tỉ mỉ",
      xPercent: 40,
      yPercent: 32,
      lineAngle: "top-left" as const,
    },
    {
      id: "2",
      title: rawHighlights[1] || "Vật liệu bền bỉ, chuẩn kiểm định",
      xPercent: 56,
      yPercent: 44,
      lineAngle: "top-right" as const,
    },
    {
      id: "3",
      title: rawHighlights[2] || "Hiệu năng vượt trội, tối ưu trải nghiệm",
      xPercent: 42,
      yPercent: 58,
      lineAngle: "bottom-left" as const,
    },
    {
      id: "4",
      title: rawHighlights[3] || "Công nghệ tiên tiến, độ bền dài lâu",
      xPercent: 58,
      yPercent: 68,
      lineAngle: "bottom-right" as const,
    },
  ];

  return await overlayCalloutOnImage({
    imageBuffer,
    calloutPoints,
    productDetails: options.productDetails,
    aspectRatio: options.aspectRatio,
  });
}

async function compositeAlphaProductOntoScene(
  sceneBuffer: Buffer,
  primaryPhoto: Buffer
): Promise<Buffer> {
  const { croppedBuffer } = await detectProductBoxAndCrop(primaryPhoto);
  const sceneMeta = await sharp(sceneBuffer).metadata();
  const sceneW = sceneMeta.width || 1024;
  const sceneH = sceneMeta.height || 1024;

  const prodTargetW = Math.round(sceneW * 0.5);
  const prodTargetH = Math.round(sceneH * 0.54);

  const fittedProduct = await sharp(croppedBuffer)
    .resize(prodTargetW, prodTargetH, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const fittedMeta = await sharp(fittedProduct).metadata();
  const pw = fittedMeta.width || prodTargetW;
  const ph = fittedMeta.height || prodTargetH;

  const left = Math.round((sceneW - pw) / 2);
  const top = Math.round(sceneH * 0.75 - ph);

  const shadowSvg = `
    <svg width="${pw}" height="44">
      <ellipse cx="${Math.round(pw / 2)}" cy="22" rx="${Math.round(pw * 0.44)}" ry="12" fill="#000000" fill-opacity="0.72" />
    </svg>
  `;

  return await sharp(sceneBuffer)
    .composite([
      {
        input: Buffer.from(shadowSvg),
        top: Math.max(0, top + ph - 18),
        left: Math.max(0, left),
      },
      {
        input: fittedProduct,
        top: Math.max(0, top),
        left: Math.max(0, left),
      },
    ])
    .png()
    .toBuffer();
}

async function generateStudioSynthesizedImage(
  options: GenerateImageOptions
): Promise<{ buffer: Buffer; cleanBuffer: Buffer }> {
  const { style, aspectRatio, originalPhotos, productDetails } = options;
  const { width, height } = getDimensionsForRatio(aspectRatio);

  const primaryPhoto = originalPhotos.length > 0 ? originalPhotos[0] : null;

  if (style === "style2_grid2x2") {
    const croppedFrames: Buffer[] = [];
    if (originalPhotos.length > 0) {
      for (let i = 0; i < 4; i++) {
        const rawPhoto = originalPhotos[i % originalPhotos.length];
        const { croppedBuffer } = await detectProductBoxAndCrop(rawPhoto);
        const studioCard = await sharp({
          create: {
            width: 600,
            height: 600,
            channels: 4,
            background: { r: 214, g: 224, b: 215, alpha: 1 },
          },
        })
          .composite([
            {
              input: await sharp(croppedBuffer)
                .resize(460, 460, { fit: "inside" })
                .png()
                .toBuffer(),
              gravity: "center",
            },
          ])
          .png()
          .toBuffer();
        croppedFrames.push(studioCard);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const placeholder = await sharp({
          create: {
            width: 600,
            height: 600,
            channels: 4,
            background: { r: 30, g: 41, b: 59, alpha: 1 },
          },
        })
          .png()
          .toBuffer();
        croppedFrames.push(placeholder);
      }
    }

    const gridBuf = await create2x2GridImage({
      frames: croppedFrames,
      aspectRatio,
      productTitle: productDetails.title,
      labels: ["CHÍNH DIỆN", "CẬN CẢNH TEM NHÃN", "GÓC NGHIÊNG 45°", "CHI TIẾT BAO BÌ"],
    });
    return { buffer: gridBuf, cleanBuffer: gridBuf };
  }

  const refBuf = options.sampleRef || options.backgroundRef;
  let finalOutput: Buffer;

  if (refBuf) {
    // When a sample/background reference is provided, use it directly as the target studio set
    finalOutput = await sharp(refBuf)
      .resize(width, height, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
  } else {
    const podiumY = Math.round(height * 0.75);
    const baseBackgroundSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="studioLight" cx="50%" cy="38%" r="68%">
            <stop offset="0%" stop-color="#e3ebe4" />
            <stop offset="55%" stop-color="#c5d3c8" />
            <stop offset="100%" stop-color="#96ab9b" />
          </radialGradient>
          <linearGradient id="podiumGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f1f5f2" />
            <stop offset="60%" stop-color="#cbd5ce" />
            <stop offset="100%" stop-color="#94a398" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#studioLight)" />
        <ellipse cx="${Math.round(width * 0.5)}" cy="${podiumY}" rx="${Math.round(width * 0.34)}" ry="${Math.round(height * 0.08)}" fill="url(#podiumGrad)" />
        <ellipse cx="${Math.round(width * 0.5)}" cy="${podiumY - 4}" rx="${Math.round(width * 0.2)}" ry="${Math.round(height * 0.03)}" fill="#1e2923" fill-opacity="0.45" />
      </svg>
    `;
    finalOutput = await sharp(Buffer.from(baseBackgroundSvg)).png().toBuffer();
  }
  if (primaryPhoto) {
    finalOutput = await compositeAlphaProductOntoScene(finalOutput, primaryPhoto);
  }

  return await finalizeCommercialPostProcessing(finalOutput, options);
}
