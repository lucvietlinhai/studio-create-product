import sharp from "sharp";
import { ProductDetails, CalloutPoint, SampleStyleAnalysis } from "@/types/studio";
import { loadSettings } from "@/lib/config/settings-manager";

export interface AnalyzedProductData {
  category: string;
  material: string;
  cameraAngle: string;
  lightingDirection: string;
  dominantColors: string[];
  calloutPoints: CalloutPoint[];
  conceptSummary: string;
  productVisionSummary?: string;
  conceptVisionSummary?: string;
  sampleStyleAnalysis?: SampleStyleAnalysis;
}

/**
 * Automatically inspects the uploaded product photo using Vision AI (Gemini or heuristic fallback)
 * to perform OCR on packaging/labels, detect buttons, ports, specs, materials, and extract
 * structured technical commercial attributes.
 */
async function callGeminiVision(ai: any, contents: any[]): Promise<any> {
  const models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
  let lastErr: any = null;
  for (const model of models) {
    try {
      const res = await ai.models.generateContent({ model, contents });
      if (res && res.text) return res;
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to call Gemini Vision models");
}

export async function analyzeAndExtractProductVision(productBuffer: Buffer): Promise<{
  title: string;
  category: string;
  description: string;
  packagingHighlights: string;
  policyText: string;
  highlightFeatures: string[];
}> {
  const settings = loadSettings();
  const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const smallBuf = await sharp(productBuffer)
        .resize(1024, 1024, { fit: "inside" })
        .jpeg({ quality: 88 })
        .toBuffer();

      const prompt = `Bạn là chuyên gia thị giác máy tính và giám đốc nghệ thuật e-commerce cao cấp.
Nhiệm vụ: Quan sát cực kỳ kỹ lưỡng bức ảnh chụp sản phẩm từ điện thoại này, thực hiện OCR quét mọi chữ in trên thân sản phẩm và bao bì vỏ hộp (thương hiệu, mã hiệu model, thông số kỹ thuật như mAh, W, V, ml, g, dB, chip, vật liệu, chứng nhận), phân tích hình dáng, cổng cắm, nút bấm, đèn led, vòi xịt, kết cấu bề mặt.

Hãy trả về một đối tượng JSON thuần túy (KHÔNG dùng markdown code block, KHÔNG có văn bản nào ngoài JSON) theo cấu trúc:
{
  "title": "Tên thương mại chuẩn tiếng Việt của sản phẩm kèm thương hiệu, model & thông số chính đọc được từ ảnh (VD: 'Pin sạc dự phòng OH-P102 10000mAh 22.5W', 'Máy cạo râu điện thông minh Enchen BlackStone 3', 'Serum dưỡng ẩm phục hồi La Roche-Posay B5'...). Nếu có tên thương hiệu trên ảnh, BẮT BUỘC phải đưa thương hiệu vào tên.",
  "category": "Ngành hàng thương mại tiếng Việt phù hợp (VD: 'Phụ kiện Công nghệ & Điện tử', 'Thiết bị Chăm sóc Cá nhân', 'Mỹ phẩm & Chăm sóc Da', 'Thời trang & Phụ kiện', 'Đồ gia dụng thông minh')",
  "description": "Đoạn văn 2 câu súc tích bằng tiếng Việt làm nổi bật chất liệu hoàn thiện, công năng chính và tính ứng dụng thực tế của sản phẩm theo ảnh.",
  "packagingHighlights": "Mô tả bao bì hộp bán lẻ nếu có trong ảnh (màu sắc hộp, hình in, phụ kiện đi kèm) hoặc quy cách đóng gói thương mại sang trọng.",
  "policyText": "Cam kết bán hàng ngắn gọn (VD: 'Chính hãng 100% • Bảo hành 12 tháng 1 đổi 1')",
  "highlightFeatures": [
    "Đặc tính 1: Đọc thông số/tính năng cốt lõi rõ nhất trên sản phẩm (ngắn gọn dưới 7 từ)",
    "Đặc tính 2: Đọc thông số kỹ thuật/dung lượng/kích thước thứ hai (ngắn gọn dưới 7 từ)",
    "Đặc tính 3: Cổng kết nối/màn hình/cơ chế vận hành (ngắn gọn dưới 7 từ)",
    "Đặc tính 4: Vật liệu hoàn thiện/cảm giác cầm nắm (ngắn gọn dưới 7 từ)"
  ]
}`;

      const r = await callGeminiVision(ai, [
        { inlineData: { mimeType: "image/jpeg", data: smallBuf.toString("base64") } },
        { text: prompt },
      ]);

      if (r.text) {
        const cleanJson = r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed && typeof parsed === "object") {
          const rawFeatures = Array.isArray(parsed.highlightFeatures)
            ? parsed.highlightFeatures.filter((f: any) => typeof f === "string" && f.trim().length > 0)
            : [];
          return {
            title: parsed.title || "Sản Phẩm Thương Mại Cao Cấp",
            category: parsed.category || "Sản Phẩm & Phụ Kiện Tiêu Dùng",
            description: parsed.description || "Sản phẩm chính hãng với thiết kế tinh xảo, chất liệu hoàn thiện cao cấp mang lại trải nghiệm tối ưu cho người sử dụng.",
            packagingHighlights: parsed.packagingHighlights || "Hộp bao bì thương mại cao cấp, bảo vệ an toàn sản phẩm.",
            policyText: parsed.policyText || "Cam kết hàng chính hãng 100% • Bảo hành 12 tháng 1 đổi 1",
            highlightFeatures: rawFeatures.length > 0 ? rawFeatures.slice(0, 4) : [
              "Thiết kế công thái học cao cấp",
              "Chất liệu chống trầy xước",
              "Độ hoàn thiện tinh xảo",
              "Độ bền bỉ vượt trội",
            ],
          };
        }
      }
    } catch (e: any) {
      console.warn("Vision extraction via Gemini warning:", e?.message);
    }
  }

  // Heuristic Fallback
  return {
    title: "Sản Phẩm Thương Mại Cao Cấp",
    category: "Sản Phẩm & Phụ Kiện Tiêu Dùng",
    description: "Sản phẩm chính hãng với thiết kế tinh xảo, chất liệu hoàn thiện cao cấp mang lại trải nghiệm tối ưu cho người sử dụng.",
    packagingHighlights: "Hộp bao bì thương mại cao cấp, bảo vệ an toàn sản phẩm.",
    policyText: "Cam kết hàng chính hãng 100% • Bảo hành 12 tháng 1 đổi 1",
    highlightFeatures: [
      "Thiết kế công thái học cao cấp",
      "Chất liệu chống trầy xước",
      "Độ hoàn thiện tinh xảo",
      "Độ bền bỉ vượt trội",
    ],
  };
}

/**
 * Automatically inspects the uploaded product photo using Vision AI (Gemini or heuristic fallback)
 * to populate empty/unspecified product attributes (title, category, description,
 * packagingHighlights, policyText, and 4 highlightFeatures).
 */
export async function enrichProductDetailsFromVision(params: {
  productBuffer: Buffer;
  currentDetails: ProductDetails;
  onLog?: (entry: {
    level: "info" | "success" | "warning" | "error";
    agent: "AnalyzerAgent";
    stepName: string;
    message: string;
    details?: string;
  }) => void;
}): Promise<ProductDetails> {
  const current: ProductDetails = {
    ...params.currentDetails,
    highlightFeatures: [...(params.currentDetails.highlightFeatures || [])],
  };

  const needTitle = !current.title || current.title.trim().length === 0;
  const needCategory = !current.category || current.category.trim().length === 0;
  const needDescription = !current.description || current.description.trim().length === 0;
  const needPackaging = !current.packagingHighlights || current.packagingHighlights.trim().length === 0;
  const needPolicy = !current.policyText || current.policyText.trim().length === 0;

  const validExistingFeatures = current.highlightFeatures.filter(
    (f) => typeof f === "string" && f.trim().length > 0
  );
  const needFeatures = validExistingFeatures.length < 4;

  // If user has provided all details, return as is
  if (!needTitle && !needCategory && !needDescription && !needPackaging && !needPolicy && !needFeatures) {
    return current;
  }

  params.onLog?.({
    level: "info",
    agent: "AnalyzerAgent",
    stepName: "Phân tích đặc tính thông minh",
    message:
      "Phát hiện đặc tính sản phẩm chưa nhập đầy đủ. Đang kích hoạt Vision AI để tự động nhận diện thương hiệu, tên gọi và tính năng nổi bật...",
  });

  const visionResult = await analyzeAndExtractProductVision(params.productBuffer);

  if (needTitle) {
    current.title = visionResult.title;
  }
  if (needCategory) {
    current.category = visionResult.category;
  }
  if (needDescription) {
    current.description = visionResult.description;
  }
  if (needPackaging) {
    current.packagingHighlights = visionResult.packagingHighlights;
  }
  if (needPolicy) {
    current.policyText = visionResult.policyText;
  }

  if (needFeatures) {
    const aiFeatures = visionResult.highlightFeatures;
    const mergedFeatures: string[] = [...validExistingFeatures];
    for (const f of aiFeatures) {
      if (mergedFeatures.length >= 4) break;
      if (!mergedFeatures.includes(f)) {
        mergedFeatures.push(f);
      }
    }
    while (mergedFeatures.length < 4) {
      mergedFeatures.push(aiFeatures[mergedFeatures.length % aiFeatures.length]);
    }
    current.highlightFeatures = mergedFeatures;
  }

  params.onLog?.({
    level: "success",
    agent: "AnalyzerAgent",
    stepName: "Tự động phân tích sản phẩm hoàn tất",
    message: `Đã xác định: "${current.title}" (${current.category}) với 4 điểm nhấn callout.`,
    details: `Tên: ${current.title}\nNgành hàng: ${current.category}\nĐặc điểm: ${current.highlightFeatures.join(" • ")}`,
  });

  return current;
}

/**
 * Uses Gemini Vision or fallback heuristic to extract accurate visual descriptions
 * and deep design evaluations of the Product Reference & Concept Reference images.
 */
export async function extractVisionSummaries(params: {
  productBuffer?: Buffer;
  conceptBuffer?: Buffer;
}): Promise<{
  productVisionSummary?: string;
  conceptVisionSummary?: string;
  sampleStyleAnalysis?: SampleStyleAnalysis;
}> {
  const settings = loadSettings();
  const geminiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;

  let productVisionSummary: string | undefined;
  let conceptVisionSummary: string | undefined;
  let sampleStyleAnalysis: SampleStyleAnalysis | undefined;

  // Use Gemini Vision if available
  if (geminiKey && (params.productBuffer || params.conceptBuffer)) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      if (params.productBuffer) {
        const smallProductBuf = await sharp(params.productBuffer)
          .resize(768, 768, { fit: "inside" })
          .jpeg({ quality: 85 })
          .toBuffer();

        const r = await callGeminiVision(ai, [
          { inlineData: { mimeType: "image/jpeg", data: smallProductBuf.toString("base64") } },
          {
            text: "Describe ONLY the commercial product and its retail packaging box in this image (brand logo, colors, form factor, item type, materials) in 2 concise English sentences. Ignore the desk/room background.",
          },
        ]);
        if (r.text) productVisionSummary = r.text.trim();
      }

      if (params.conceptBuffer) {
        const smallConceptBuf = await sharp(params.conceptBuffer)
          .resize(800, 800, { fit: "inside" })
          .jpeg({ quality: 85 })
          .toBuffer();

        const stylePrompt = `You are an elite commercial advertising art director and product photographer.
Analyze this REFERENCE SAMPLE IMAGE in meticulous detail so we can reproduce its exact visual style, lighting, set design, and photographic atmosphere for a different product.

Extract and output a valid JSON object strictly matching this schema (NO markdown \`\`\`json, just pure JSON):
{
  "surfaceAndPodium": "Precise description of the ground/podium/surface the product rests upon (material, geometry, texture, finish, color, bevels, reflections)",
  "backgroundEnvironment": "Detailed description of the background scenery, wall texture, architectural shapes, arches, windows, drapery, or studio backdrop",
  "lightingSetup": "Exact lighting physics: key light direction, softbox vs hard direct sunlight, rim highlight color/intensity, cast shadows, caustic water/glass refractions, window blind shadows",
  "decorativeProps": "All accompanying decorative elements and natural props (monstera leaves, dry grass, water droplets, botanical silhouettes, cosmetic swatches, citrus, geometric blocks, etc.)",
  "colorPalette": "Specific color grading, dominant background colors, complementary accent tones, warmth/coolness, saturation level",
  "cameraAngleAndComposition": "Camera angle (eye-level, 30-45 degree elevated studio view, top-down flatlay), lens perspective (macro, 85mm prime), depth of field, framing balance",
  "overallStyleSummary": "A concise 2-sentence summary synthesizing the core aesthetic mood, luxury tier, and atmosphere of this photoshoot for generative recreation"
}`;

        const r = await callGeminiVision(ai, [
          { inlineData: { mimeType: "image/jpeg", data: smallConceptBuf.toString("base64") } },
          { text: stylePrompt },
        ]);

        if (r.text) {
          const cleanJson = r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          try {
            const parsed = JSON.parse(cleanJson);
            sampleStyleAnalysis = parsed;
            conceptVisionSummary = parsed.overallStyleSummary || r.text.trim();
          } catch {
            conceptVisionSummary = r.text.trim();
          }
        }
      }
    } catch (e: any) {
      console.warn("Vision extraction error:", e?.message);
    }
  }

  // Fallback sampleStyleAnalysis if conceptBuffer was provided but Vision failed or had no key
  if (params.conceptBuffer && !sampleStyleAnalysis) {
    sampleStyleAnalysis = {
      surfaceAndPodium: "Minimalist architectural 3D studio podium with subtle ground reflections",
      backgroundEnvironment: "Clean, elegant commercial studio backdrop with subtle atmospheric depth",
      lightingSetup: "High-end commercial softbox key lighting with balanced rim highlights and soft ambient contact shadows",
      decorativeProps: "Subtle minimalist botanical or geometric accents echoing luxury product photography",
      colorPalette: "Neutral luxury tones, warm highlights, and harmonized commercial studio grading",
      cameraAngleAndComposition: "Eye-level 15-degree slight elevated studio perspective, razor-sharp focus",
      overallStyleSummary: conceptVisionSummary || "Harmonious luxury studio product photography inspired by reference composition",
    };
    if (!conceptVisionSummary) {
      conceptVisionSummary = sampleStyleAnalysis.overallStyleSummary;
    }
  }

  return { productVisionSummary, conceptVisionSummary, sampleStyleAnalysis };
}

/**
 * Isolates the central product silhouette with edge-aware background removal for offline/local fallback.
 */
export async function detectProductBoxAndCrop(
  imageBuffer: Buffer
): Promise<{ croppedBuffer: Buffer; box?: { ymin: number; xmin: number; ymax: number; xmax: number } }> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const idx = (x: number, y: number) => (y * w + x) * 4;

    // Sample border background colors
    const bgSamples: Array<[number, number, number, number]> = [];
    for (let x = 0; x < w; x += 10) {
      for (const y of [2, Math.floor(h * 0.05), h - 3]) {
        const i = idx(x, y);
        bgSamples.push([data[i], data[i + 1], data[i + 2], y / h]);
      }
    }
    for (let y = 0; y < h; y += 10) {
      for (const x of [2, Math.floor(w * 0.05), w - 3]) {
        const i = idx(x, y);
        bgSamples.push([data[i], data[i + 1], data[i + 2], y / h]);
      }
    }

    // Compute gradient barrier
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }

    const grad = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx =
          -gray[(y - 1) * w + (x - 1)] +
          gray[(y - 1) * w + (x + 1)] -
          2 * gray[y * w + (x - 1)] +
          2 * gray[y * w + (x + 1)] -
          gray[(y + 1) * w + (x - 1)] +
          gray[(y + 1) * w + (x + 1)];
        const gy =
          -gray[(y - 1) * w + (x - 1)] -
          2 * gray[(y - 1) * w + x] -
          gray[(y - 1) * w + (x + 1)] +
          gray[(y + 1) * w + (x - 1)] +
          2 * gray[(y + 1) * w + x] +
          gray[(y + 1) * w + (x + 1)];
        grad[y * w + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    const visited = new Uint8Array(w * h);
    const isBg = new Uint8Array(w * h);
    const queue = new Int32Array(w * h * 2);
    let qHead = 0;
    let qTail = 0;

    const push = (x: number, y: number) => {
      const pos = y * w + x;
      if (visited[pos]) return;
      visited[pos] = 1;
      isBg[pos] = 1;
      queue[qTail++] = pos;
    };

    for (let x = 0; x < w; x++) {
      push(x, 0);
      push(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      push(0, y);
      push(w - 1, y);
    }

    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];

    while (qHead < qTail) {
      const curr = queue[qHead++];
      const cx = curr % w;
      const cy = (curr / w) | 0;
      const ci = curr * 4;
      const cr = data[ci];
      const cg = data[ci + 1];
      const cb = data[ci + 2];

      for (let d = 0; d < 4; d++) {
        const nx = cx + dx[d];
        const ny = cy + dy[d];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const npos = ny * w + nx;
        if (visited[npos]) continue;

        const ni = npos * 4;
        const nr = data[ni];
        const ng = data[ni + 1];
        const nb = data[ni + 2];

        const stepDiff =
          (nr - cr) * (nr - cr) + (ng - cg) * (ng - cg) + (nb - cb) * (nb - cb);
        const edgeStrength = grad[npos];

        if (stepDiff < 750 && edgeStrength < 80) {
          visited[npos] = 1;
          isBg[npos] = 1;
          queue[qTail++] = npos;
        }
      }
    }

    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pos = y * w + x;
        const p = pos * 4;
        if (isBg[pos]) {
          data[p + 3] = 0;
        } else {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX > minX + 40 && maxY > minY + 40) {
      const cropped = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
        .extract({
          left: Math.max(0, minX),
          top: Math.max(0, minY),
          width: Math.min(w - minX, maxX - minX + 1),
          height: Math.min(h - minY, maxY - minY + 1),
        })
        .png()
        .toBuffer();
      return { croppedBuffer: cropped };
    }
  } catch (err) {
    console.warn("Product background isolation fallback:", err);
  }

  return { croppedBuffer: imageBuffer };
}

export async function analyzeProductAndConcept(params: {
  productImages: string[];
  productDetails: ProductDetails;
  conceptMode: string;
  conceptPrompt?: string;
  sampleImage?: string;
  apiKey?: string;
  provider?: string;
}): Promise<AnalyzedProductData> {
  const { productDetails } = params;

  const features =
    productDetails.highlightFeatures && productDetails.highlightFeatures.length > 0
      ? productDetails.highlightFeatures
      : [
        "Thiết kế công thái học cao cấp",
        "Chất liệu chống trầy xước",
        "Logo nhận diện thương hiệu tinh tế",
        "Đường nét hoàn thiện tỉ mỉ",
      ];

  const anglePositions: Array<{
    x: number;
    y: number;
    angle: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  }> = [
      { x: 30, y: 32, angle: "top-left" },
      { x: 70, y: 34, angle: "top-right" },
      { x: 28, y: 68, angle: "bottom-left" },
      { x: 72, y: 65, angle: "bottom-right" },
    ];

  const calloutPoints: CalloutPoint[] = features.slice(0, 4).map((feat, idx) => {
    const pos = anglePositions[idx % anglePositions.length];
    return {
      id: `pt_${idx + 1}`,
      title: feat,
      description: `Đặc điểm ${idx + 1} nổi bật theo mô tả sản phẩm`,
      xPercent: pos.x,
      yPercent: pos.y,
      lineAngle: pos.angle,
    };
  });

  return {
    category: productDetails.category || "General Commercial Goods",
    material: "high-grade matte & brushed finish",
    cameraAngle: "eye-level, 15-degree slight elevated studio perspective",
    lightingDirection: "top-left 45-degree diffused key light with gentle rim light",
    dominantColors: ["#1E293B", "#38BDF8", "#F8FAFC"],
    calloutPoints,
    conceptSummary:
      params.conceptPrompt ||
      "Modern e-commerce aesthetic, clean studio lighting, realistic contact shadow",
  };
}
