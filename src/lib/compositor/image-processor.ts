import sharp from "sharp";
import { AspectRatio, CalloutPoint, ImageResolution, ProductDetails } from "@/types/studio";

export function getDimensionsForRatio(
  ratio: AspectRatio,
  resolution: ImageResolution = "1K"
): { width: number; height: number } {
  const mult = resolution === "2K" ? 2 : 1;

  switch (ratio) {
    case "1:1":
      return { width: 1024 * mult, height: 1024 * mult };
    case "4:3":
      return { width: 1024 * mult, height: 768 * mult };
    case "3:4":
      return { width: 768 * mult, height: 1024 * mult };
    case "16:9":
      return { width: 1024 * mult, height: 576 * mult };
    case "9:16":
      return { width: 576 * mult, height: 1024 * mult };
    case "4:5":
      return { width: 832 * mult, height: 1024 * mult };
    default:
      return { width: 1024 * mult, height: 1024 * mult };
  }
}

function escapeXml(unsafe: string): string {
  return String(unsafe || "")
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[a-fA-F0-9]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = String(text || "").trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length <= maxCharsPerLine) {
      current = (current + " " + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Generates a 2x2 grid image from 4 buffers (or crops/angles of a base buffer)
 */
export async function create2x2GridImage(params: {
  frames: Buffer[];
  labels?: string[];
  aspectRatio: AspectRatio;
  resolution?: ImageResolution;
  productTitle: string;
}): Promise<Buffer> {
  const {
    frames,
    aspectRatio,
    resolution = "1K",
    labels = ["MẶT TRƯỚC", "CẬN CẢNH CHI TIẾT", "GÓC NGHIÊNG 45°", "PHỐI CẢNH ĐA CHIỀU"],
  } = params;
  const { width, height } = getDimensionsForRatio(aspectRatio, resolution);
  const s = Math.max(1, Math.min(width, height) / 1024);
  const gap = Math.round(16 * s);
  const pad = Math.round(4 * s);

  const cellW = Math.floor((width - gap) / 2);
  const cellH = Math.floor((height - gap) / 2);

  const processedCells: Buffer[] = [];
  for (let i = 0; i < 4; i++) {
    const rawFrame = frames[i % frames.length];
    const resized = await sharp(rawFrame)
      .resize(cellW, cellH, { fit: "cover", position: "center", kernel: sharp.kernel.lanczos3 })
      .toBuffer();

    const labelText = labels[i] || `GÓC ${i + 1}`;
    const badgeSvg = `
      <svg width="${cellW}" height="${cellH}">
        <rect x="${Math.round(14 * s)}" y="${Math.round(14 * s)}" width="${Math.round((labelText.length * 9 + 24) * s)}" height="${Math.round(26 * s)}" rx="${Math.round(6 * s)}" fill="#0f172a" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.4" stroke-width="${s}" />
        <text x="${Math.round(24 * s)}" y="${Math.round(31 * s)}" font-family="system-ui, sans-serif" font-weight="700" font-size="${Math.round(11 * s)}" fill="#f8fafc" letter-spacing="0.8">${escapeXml(labelText)}</text>
      </svg>
    `;

    const cellWithLabel = await sharp(resized)
      .composite([{ input: Buffer.from(badgeSvg), top: 0, left: 0 }])
      .png()
      .toBuffer();

    processedCells.push(cellWithLabel);
  }

  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 248, g: 250, b: 252, alpha: 1 },
    },
  });

  const compositions = [
    { input: processedCells[0], top: pad, left: pad },
    { input: processedCells[1], top: pad, left: cellW + Math.round(12 * s) },
    { input: processedCells[2], top: cellH + Math.round(12 * s), left: pad },
    { input: processedCells[3], top: cellH + Math.round(12 * s), left: cellW + Math.round(12 * s) },
  ];

  return canvas.composite(compositions).png().toBuffer();
}

/**
 * Generates the modern minimalist commercial Infographic Line Callout SVG
 * (Style 3: Sleek Architectural Leader Lines, Floating High-Contrast Typography, Zero Bulky Background Boxes).
 * Scales natively across 1K, 2K, and 4K resolutions.
 */
export function generateCalloutSvg(params: {
  width: number;
  height: number;
  calloutPoints: CalloutPoint[];
  productDetails: ProductDetails;
}): string {
  const { width: w, height: h, productDetails } = params;
  const s = Math.max(0.75, Math.min(w, h) / 1024);

  const title = (productDetails.title || "Sản phẩm chính hãng").trim();
  const category = (productDetails.category || "Commercial Studio Edition").trim();
  const rawFeatures =
    productDetails.highlightFeatures && productDetails.highlightFeatures.filter((f) => f.trim()).length > 0
      ? productDetails.highlightFeatures.filter((f) => f.trim())
      : [
          "Thiết kế công thái học cao cấp",
          "Vật liệu hoàn thiện tinh xảo",
          "Hiệu năng vượt trội dài lâu",
          "Độ bền đạt chuẩn thương mại",
        ];

  const policyText =
    productDetails.policyText && productDetails.policyText.trim().length > 0
      ? productDetails.policyText.trim()
      : "Cam kết chính hãng 100% • Bảo hành tiêu chuẩn";

  // 4 symmetric floating callout slots (Left-Top, Right-Top, Left-Bottom, Right-Bottom)
  // Keeping the center product zone (x: 33%..67%) 100% unobstructed.
  const slots = [
    {
      num: "01",
      isLeft: true,
      anchorX: Math.round(w * 0.41),
      anchorY: Math.round(h * 0.37),
      elbowX: Math.round(w * 0.34),
      elbowY: Math.round(h * 0.28),
      outerX: Math.round(w * 0.048),
    },
    {
      num: "02",
      isLeft: false,
      anchorX: Math.round(w * 0.59),
      anchorY: Math.round(h * 0.37),
      elbowX: Math.round(w * 0.66),
      elbowY: Math.round(h * 0.28),
      outerX: Math.round(w * 0.952),
    },
    {
      num: "03",
      isLeft: true,
      anchorX: Math.round(w * 0.40),
      anchorY: Math.round(h * 0.60),
      elbowX: Math.round(w * 0.34),
      elbowY: Math.round(h * 0.67),
      outerX: Math.round(w * 0.048),
    },
    {
      num: "04",
      isLeft: false,
      anchorX: Math.round(w * 0.60),
      anchorY: Math.round(h * 0.60),
      elbowX: Math.round(w * 0.66),
      elbowY: Math.round(h * 0.67),
      outerX: Math.round(w * 0.952),
    },
  ];

  const primaryFontSize = Math.max(Math.round(14 * s), Math.round(w * 0.0172));
  const secondaryFontSize = Math.max(Math.round(13 * s), Math.round(w * 0.0155));
  const maxCharsPerLine = w / s < 700 ? 18 : 23;

  let calloutsSvg = "";

  rawFeatures.slice(0, 4).forEach((feat, idx) => {
    const slot = slots[idx];
    if (!slot) return;

    const lines = wrapText(feat, maxCharsPerLine);
    const line1 = lines[0] || feat;
    const line2 = lines.slice(1).join(" ");
    const textAnchor = slot.isLeft ? "start" : "end";
    const accentEndX = slot.isLeft ? slot.outerX + Math.round(w * 0.028) : slot.outerX - Math.round(w * 0.028);
    const lineGradId = slot.isLeft ? "lineGradLeft" : "lineGradRight";

    calloutsSvg += `
      <!-- Sleek Floating Callout ${slot.num} -->
      <g>
        <!-- Subtle contrast under-stroke for visibility on bright backgrounds -->
        <path
          d="M ${slot.anchorX} ${slot.anchorY} L ${slot.elbowX} ${slot.elbowY} L ${slot.outerX} ${slot.elbowY}"
          fill="none"
          stroke="#090d16"
          stroke-opacity="0.5"
          stroke-width="${(3 * s).toFixed(1)}"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <!-- Crisp architectural leader line -->
        <path
          d="M ${slot.anchorX} ${slot.anchorY} L ${slot.elbowX} ${slot.elbowY} L ${slot.outerX} ${slot.elbowY}"
          fill="none"
          stroke="url(#${lineGradId})"
          stroke-width="${(1.4 * s).toFixed(1)}"
          stroke-linecap="round"
          stroke-linejoin="round"
          filter="url(#lineGlow)"
        />
        <!-- Accent highlight bar on outer edge of shelf line -->
        <line
          x1="${slot.outerX}"
          y1="${slot.elbowY}"
          x2="${accentEndX}"
          y2="${slot.elbowY}"
          stroke="#38bdf8"
          stroke-width="${(2.6 * s).toFixed(1)}"
          stroke-linecap="round"
        />

        <!-- Elbow joint micro-node -->
        <circle cx="${slot.elbowX}" cy="${slot.elbowY}" r="${(2.2 * s).toFixed(1)}" fill="#e0f2fe" />

        <!-- Precision Target Node on Product -->
        <circle cx="${slot.anchorX}" cy="${slot.anchorY}" r="${(8.5 * s).toFixed(1)}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="${(1 * s).toFixed(1)}" />
        <circle cx="${slot.anchorX}" cy="${slot.anchorY}" r="${(5 * s).toFixed(1)}" fill="#090d16" fill-opacity="0.45" stroke="#38bdf8" stroke-width="${(1.4 * s).toFixed(1)}" />
        <circle cx="${slot.anchorX}" cy="${slot.anchorY}" r="${(2.4 * s).toFixed(1)}" fill="#ffffff" filter="url(#glowDot)" />

        <!-- Floating Typography Above Shelf Line (No background box!) -->
        <text
          x="${slot.outerX}"
          y="${slot.elbowY - Math.round(h * 0.012)}"
          text-anchor="${textAnchor}"
          font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
          font-weight="800"
          font-size="${primaryFontSize}"
          fill="#ffffff"
          stroke="#090d16"
          stroke-opacity="0.88"
          stroke-width="${(3.8 * s).toFixed(1)}"
          stroke-linejoin="round"
          paint-order="stroke fill"
          filter="url(#calloutShadow)"
        >${
          slot.isLeft
            ? `<tspan fill="#38bdf8" font-weight="900">${slot.num}</tspan>  ${escapeXml(line1)}`
            : `${escapeXml(line1)}  <tspan fill="#38bdf8" font-weight="900">${slot.num}</tspan>`
        }</text>

        <!-- Secondary Line Below Shelf Line (if wrapped) -->
        ${
          line2
            ? `<text
                x="${slot.outerX}"
                y="${slot.elbowY + Math.round(h * 0.025)}"
                text-anchor="${textAnchor}"
                font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
                font-weight="700"
                font-size="${secondaryFontSize}"
                fill="#f1f5f9"
                stroke="#090d16"
                stroke-opacity="0.88"
                stroke-width="${(3.5 * s).toFixed(1)}"
                stroke-linejoin="round"
                paint-order="stroke fill"
                filter="url(#calloutShadow)"
              >${escapeXml(line2)}</text>`
            : ""
        }
      </g>
    `;
  });

  const titleFontSize =
    title.length > 28
      ? Math.round(w * 0.027)
      : title.length > 20
      ? Math.round(w * 0.032)
      : Math.round(w * 0.037);

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="calloutShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="${Math.round(2 * s)}" stdDeviation="${(3 * s).toFixed(1)}" flood-color="#000000" flood-opacity="0.75" />
        </filter>
        <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="${Math.round(1 * s)}" stdDeviation="${(2 * s).toFixed(1)}" flood-color="#000000" flood-opacity="0.65" />
        </filter>
        <filter id="glowDot" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="${(3.5 * s).toFixed(1)}" flood-color="#38bdf8" flood-opacity="0.95" />
        </filter>
        <linearGradient id="lineGradLeft" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="70%" stop-color="#e0f2fe" stop-opacity="0.88" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.95" />
        </linearGradient>
        <linearGradient id="lineGradRight" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="70%" stop-color="#e0f2fe" stop-opacity="0.88" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.95" />
        </linearGradient>
        <linearGradient id="headerAccentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0" />
          <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Minimalist Editorial Top Header (Centered, No Bulky Box) -->
      <g>
        <text
          x="${Math.round(w / 2)}"
          y="${Math.round(h * 0.058)}"
          text-anchor="middle"
          font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
          font-weight="800"
          font-size="${Math.max(Math.round(11 * s), Math.round(w * 0.013))}"
          fill="#7dd3fc"
          letter-spacing="${(2.4 * s).toFixed(1)}"
          stroke="#090d16"
          stroke-opacity="0.88"
          stroke-width="${(3.2 * s).toFixed(1)}"
          stroke-linejoin="round"
          paint-order="stroke fill"
          filter="url(#calloutShadow)"
        >${escapeXml(category.toUpperCase())}</text>

        <text
          x="${Math.round(w / 2)}"
          y="${Math.round(h * 0.102)}"
          text-anchor="middle"
          font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
          font-weight="900"
          font-size="${titleFontSize}"
          fill="#ffffff"
          letter-spacing="${(0.4 * s).toFixed(1)}"
          stroke="#090d16"
          stroke-opacity="0.88"
          stroke-width="${(4.5 * s).toFixed(1)}"
          stroke-linejoin="round"
          paint-order="stroke fill"
          filter="url(#calloutShadow)"
        >${escapeXml(title)}</text>

        <line
          x1="${Math.round(w * 0.36)}"
          y1="${Math.round(h * 0.12)}"
          x2="${Math.round(w * 0.64)}"
          y2="${Math.round(h * 0.12)}"
          stroke="url(#headerAccentGrad)"
          stroke-width="${(2 * s).toFixed(1)}"
          stroke-linecap="round"
        />
      </g>

      <!-- 4 Sleek Distributed Callout Lines & Floating Text -->
      ${calloutsSvg}

      <!-- Minimalist Single-Line Bottom Footer (No Bulky Box) -->
      <g>
        <line
          x1="${Math.round(w * 0.22)}"
          y1="${Math.round(h * 0.918)}"
          x2="${Math.round(w * 0.78)}"
          y2="${Math.round(h * 0.918)}"
          stroke="url(#headerAccentGrad)"
          stroke-width="${(1.2 * s).toFixed(1)}"
        />
        <text
          x="${Math.round(w / 2)}"
          y="${Math.round(h * 0.95)}"
          text-anchor="middle"
          font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
          font-weight="700"
          font-size="${Math.max(Math.round(12 * s), Math.round(w * 0.015))}"
          fill="#f8fafc"
          stroke="#090d16"
          stroke-opacity="0.88"
          stroke-width="${(3.6 * s).toFixed(1)}"
          stroke-linejoin="round"
          paint-order="stroke fill"
          filter="url(#calloutShadow)"
        ><tspan fill="#34d399" font-weight="900">✓</tspan>  ${escapeXml(policyText)}</text>
      </g>
    </svg>
  `;
}

export async function overlayCalloutOnImage(params: {
  imageBuffer: Buffer;
  calloutPoints: CalloutPoint[];
  productDetails: ProductDetails;
  aspectRatio: AspectRatio;
}): Promise<Buffer> {
  const { imageBuffer, calloutPoints, productDetails } = params;
  try {
    const meta = await sharp(imageBuffer).metadata();
    const width = meta.width || 1024;
    const height = meta.height || 1024;

    const svgString = generateCalloutSvg({
      width,
      height,
      calloutPoints,
      productDetails,
    });

    return await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svgString), top: 0, left: 0 }])
      .png()
      .toBuffer();
  } catch (err) {
    console.error("Error overlaying callout SVG onto image:", err);
    return imageBuffer;
  }
}
