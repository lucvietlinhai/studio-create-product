import sharp from "sharp";
import { AspectRatio, CalloutPoint, ProductDetails, PriceBadgePosition, PriceBadgeTheme } from "@/types/studio";

function parsePriceNum(val?: string): number | null {
  if (!val) return null;
  const digits = val.replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

function calculateDiscount(original?: string, sale?: string): number | null {
  const orig = parsePriceNum(original);
  const sl = parsePriceNum(sale);
  if (!orig || !sl || orig <= sl) return null;
  return Math.round(((orig - sl) / orig) * 100);
}

export function getDimensionsForRatio(ratio: AspectRatio): { width: number; height: number } {
  switch (ratio) {
    case "1:1":
      return { width: 1024, height: 1024 };
    case "4:3":
      return { width: 1024, height: 768 };
    case "3:4":
      return { width: 768, height: 1024 };
    case "16:9":
      return { width: 1024, height: 576 };
    case "9:16":
      return { width: 576, height: 1024 };
    case "4:5":
      return { width: 832, height: 1024 };
    default:
      return { width: 1024, height: 1024 };
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

export function getPriceBadgeCoordinates(
  width: number,
  height: number,
  badgeW: number,
  badgeH: number,
  position?: PriceBadgePosition | string
): { bx: number; by: number } {
  // Safe margins calibrated for commercial e-commerce (Shopee, Lazada, TikTok Shop, Amazon):
  // Safe margins prevent badges from touching canvas borders, being clipped by rounded card corners,
  // or truncated by platform UI bars and lightboxes.
  const padX = Math.max(44, Math.round(width * 0.048));
  const padYTop = Math.max(52, Math.round(height * 0.058));
  const padYBottom = Math.max(56, Math.round(height * 0.068));

  const raw = (position || "top-right").toLowerCase().trim();
  const pos = raw.replace(/[\s_]+/g, "-");

  let bx: number;
  let by: number;

  // Horizontal axis
  if (pos.includes("left") || pos === "left") {
    bx = padX;
  } else if (
    pos === "center" ||
    pos === "top-center" ||
    pos === "bottom-center" ||
    pos === "top" ||
    pos === "bottom"
  ) {
    bx = Math.round((width - badgeW) / 2);
  } else {
    // right, top-right, bottom-right, center-right
    bx = width - badgeW - padX;
  }

  // Vertical axis
  if (pos.startsWith("top") || pos === "top") {
    by = padYTop;
  } else if (pos.startsWith("bottom") || pos === "bottom") {
    by = height - badgeH - padYBottom;
  } else {
    // center, center-left, center-right, left, right
    by = Math.round((height - badgeH) / 2);
  }

  // Constrain inside image frame with guaranteed safe padding
  bx = Math.max(padX, Math.min(width - badgeW - padX, bx));
  by = Math.max(padYTop, Math.min(height - badgeH - padYBottom, by));

  return { bx, by };
}

export function buildPriceBadgeSvg(
  width: number,
  productDetails: ProductDetails,
  height?: number
): string {
  if (!productDetails.showPriceBadge || (!productDetails.salePrice && !productDetails.originalPrice)) {
    return "";
  }
  const badgeW = 236;
  const badgeH = 80;
  const h = height || width;
  const { bx, by } = getPriceBadgeCoordinates(
    width,
    h,
    badgeW,
    badgeH,
    productDetails.priceBadgePosition
  );

  const theme = productDetails.priceBadgeTheme || "flash_sale";
  const discountPct = calculateDiscount(productDetails.originalPrice, productDetails.salePrice);

  let bgStops = `
    <stop offset="0%" stop-color="#ff3333" />
    <stop offset="45%" stop-color="#dc2626" />
    <stop offset="100%" stop-color="#881337" />
  `;
  let borderStops = `
    <stop offset="0%" stop-color="#fde047" />
    <stop offset="50%" stop-color="#fb7185" />
    <stop offset="100%" stop-color="#f43f5e" />
  `;
  let glowColor = "#dc2626";
  let headerText = "🔥 FLASH SALE";
  let headerFill = "#fef08a";
  let chipBg = `
    <stop offset="0%" stop-color="#fef08a" />
    <stop offset="100%" stop-color="#f59e0b" />
  `;
  let chipTextFill = "#78350f";
  let chipBorder = "#fef08a";
  let priceFill = "#ffffff";
  let origFill = "#fca5a5";

  if (theme === "luxury_gold") {
    bgStops = `
      <stop offset="0%" stop-color="#292524" />
      <stop offset="50%" stop-color="#1c1917" />
      <stop offset="100%" stop-color="#09090b" />
    `;
    borderStops = `
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    `;
    glowColor = "#d97706";
    headerText = "👑 ĐẶC QUYỀN VIP";
    headerFill = "#fef08a";
    chipBg = `
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#eab308" />
    `;
    chipTextFill = "#451a03";
    chipBorder = "#fde047";
    priceFill = "#fef08a";
    origFill = "#a8a29e";
  } else if (theme === "tiktok_neon") {
    bgStops = `
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="50%" stop-color="#a855f7" />
      <stop offset="100%" stop-color="#2563eb" />
    `;
    borderStops = `
      <stop offset="0%" stop-color="#f472b6" />
      <stop offset="100%" stop-color="#60a5fa" />
    `;
    glowColor = "#ec4899";
    headerText = "⚡ TIKTOK DEAL";
    headerFill = "#ffffff";
    chipBg = `
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    `;
    chipTextFill = "#082f49";
    chipBorder = "#7dd3fc";
    priceFill = "#ffffff";
    origFill = "#e9d5ff";
  } else if (theme === "emerald_eco") {
    bgStops = `
      <stop offset="0%" stop-color="#059669" />
      <stop offset="55%" stop-color="#047857" />
      <stop offset="100%" stop-color="#064e3b" />
    `;
    borderStops = `
      <stop offset="0%" stop-color="#a7f3d0" />
      <stop offset="100%" stop-color="#34d399" />
    `;
    glowColor = "#059669";
    headerText = "🌿 GIÁ ƯU ĐÃI";
    headerFill = "#d1fae5";
    chipBg = `
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#84cc16" />
    `;
    chipTextFill = "#14532d";
    chipBorder = "#bef264";
    priceFill = "#ffffff";
    origFill = "#a7f3d0";
  }

  const chipLabel = discountPct ? `-${discountPct}%` : "HOT DEAL";
  const mainPrice = productDetails.salePrice || productDetails.originalPrice || "";
  const hasBothPrices = Boolean(productDetails.originalPrice && productDetails.salePrice);
  const priceLen = mainPrice.length;
  const mainFontSize = priceLen > 12 ? 18 : priceLen > 10 ? 21 : hasBothPrices ? 24 : 27;

  return `
    <g transform="translate(${bx}, ${by})">
      <defs>
        <linearGradient id="badgeBg_${theme}" x1="0%" y1="0%" x2="100%" y2="100%">
          ${bgStops}
        </linearGradient>
        <linearGradient id="badgeBorder_${theme}" x1="0%" y1="0%" x2="100%" y2="0%">
          ${borderStops}
        </linearGradient>
        <linearGradient id="badgeChip_${theme}" x1="0%" y1="0%" x2="100%" y2="100%">
          ${chipBg}
        </linearGradient>
        <linearGradient id="glassTopShine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02" />
        </linearGradient>
        <filter id="badgeShadow_${theme}" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000000" flood-opacity="0.55" />
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${glowColor}" flood-opacity="0.35" />
        </filter>
      </defs>

      <!-- Outer Box Shadow & Primary Container -->
      <rect
        width="${badgeW}"
        height="${badgeH}"
        rx="14"
        fill="url(#badgeBg_${theme})"
        stroke="url(#badgeBorder_${theme})"
        stroke-width="1.8"
        filter="url(#badgeShadow_${theme})"
      />

      <!-- Glass Specular Reflection Highlight (Upper Half) -->
      <path
        d="M 1.5 14 A 12.5 12.5 0 0 1 14 1.5 L ${badgeW - 14} 1.5 A 12.5 12.5 0 0 1 ${badgeW - 1.5} 14 L ${badgeW - 1.5} 36 L 1.5 36 Z"
        fill="url(#glassTopShine)"
      />

      <!-- Header Tag Label -->
      <text
        x="16"
        y="23"
        font-family="'Segoe UI', -apple-system, Arial, sans-serif"
        font-weight="900"
        font-size="11"
        fill="${headerFill}"
        letter-spacing="1.2"
      >${escapeXml(headerText)}</text>

      <!-- Golden Discount Chip -->
      <g transform="translate(${badgeW - 74}, 8)">
        <rect
          width="62"
          height="21"
          rx="6"
          fill="url(#badgeChip_${theme})"
          stroke="${chipBorder}"
          stroke-width="1"
        />
        <text
          x="31"
          y="14.5"
          text-anchor="middle"
          font-family="'Segoe UI', -apple-system, Arial, sans-serif"
          font-weight="900"
          font-size="11"
          fill="${chipTextFill}"
          letter-spacing="0.5"
        >${escapeXml(chipLabel)}</text>
      </g>

      <!-- Main Price Display -->
      <text
        x="16"
        y="${hasBothPrices ? 52 : 58}"
        font-family="'Segoe UI', -apple-system, Arial, sans-serif"
        font-weight="900"
        font-size="${mainFontSize}"
        fill="${priceFill}"
      >${escapeXml(mainPrice)}</text>

      <!-- Original Strike-through Price -->
      ${
        hasBothPrices
          ? `<text
              x="16"
              y="70"
              font-family="'Segoe UI', -apple-system, Arial, sans-serif"
              font-size="11.5"
              font-weight="600"
              fill="${origFill}"
            >Giá gốc: <tspan text-decoration="line-through" opacity="0.85">${escapeXml(
              productDetails.originalPrice || ""
            )}</tspan></text>`
          : ""
      }
    </g>
  `;
}

export async function overlayPriceBadgeOnImage(
  imageBuffer: Buffer,
  productDetails: ProductDetails
): Promise<Buffer> {
  if (!productDetails.showPriceBadge || (!productDetails.salePrice && !productDetails.originalPrice)) {
    return imageBuffer;
  }
  try {
    const meta = await sharp(imageBuffer).metadata();
    const w = meta.width || 1024;
    const h = meta.height || 1024;
    const badgeGroup = buildPriceBadgeSvg(w, productDetails, h);
    if (!badgeGroup) return imageBuffer;

    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${badgeGroup}</svg>`;
    return await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer();
  } catch (err) {
    console.error("Error overlaying price badge SVG onto image:", err);
    return imageBuffer;
  }
}

export async function create2x2GridImage(params: {
  frames: Buffer[];
  labels?: string[];
  aspectRatio: AspectRatio;
  productTitle: string;
}): Promise<Buffer> {
  const {
    frames,
    aspectRatio,
    labels = ["MẶT TRƯỚC", "CẬN CẢNH CHI TIẾT", "GÓC NGHIÊNG 45°", "PHỐI CẢNH ĐA CHIỀU"],
  } = params;
  const { width, height } = getDimensionsForRatio(aspectRatio);

  const cellW = Math.floor((width - 16) / 2);
  const cellH = Math.floor((height - 16) / 2);

  const processedCells: Buffer[] = [];
  for (let i = 0; i < 4; i++) {
    const rawFrame = frames[i % frames.length];
    const resized = await sharp(rawFrame)
      .resize(cellW, cellH, { fit: "cover", position: "center" })
      .toBuffer();

    const labelText = labels[i] || `GÓC ${i + 1}`;
    const badgeSvg = `
      <svg width="${cellW}" height="${cellH}">
        <rect x="14" y="14" width="${labelText.length * 9 + 24}" height="26" rx="6" fill="#0f172a" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1" />
        <text x="24" y="31" font-family="system-ui, sans-serif" font-weight="700" font-size="11" fill="#f8fafc" letter-spacing="0.8">${escapeXml(labelText)}</text>
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
    { input: processedCells[0], top: 4, left: 4 },
    { input: processedCells[1], top: 4, left: cellW + 12 },
    { input: processedCells[2], top: cellH + 12, left: 4 },
    { input: processedCells[3], top: cellH + 12, left: cellW + 12 },
  ];

  return canvas.composite(compositions).png().toBuffer();
}

/**
 * Generates the modern minimalist commercial Infographic Line Callout SVG
 * matching the Pipeline Specification (Style 3: Infographic Line Callout).
 */
export function generateCalloutSvg(params: {
  width: number;
  height: number;
  calloutPoints: CalloutPoint[];
  productDetails: ProductDetails;
}): string {
  const { width: w, height: h, productDetails } = params;

  const title = productDetails.title || "Sản phẩm chính hãng";
  const category = productDetails.category || "Commercial Edition";
  const features =
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
      : "Cam kết sản phẩm chính hãng 100% • Bảo hành chuẩn hãng";

  // Build spec items with numbering and clean spacing
  const blockX = Math.round(w * 0.58);
  const blockY = Math.round(h * 0.22);
  const blockW = Math.round(w * 0.38);

  let specItemsSvg = "";
  let currentY = blockY + Math.round(h * 0.045);

  features.slice(0, 4).forEach((feat, idx) => {
    const wrapped = wrapText(feat, 28);
    const itemNum = `0${idx + 1}`;

    specItemsSvg += `
      <!-- Feature Item ${idx + 1} -->
      <g transform="translate(${blockX + 12}, ${currentY})">
        <circle cx="6" cy="-4" r="3" fill="#6366f1" filter="url(#glowDot)" />
        <text x="16" y="0" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
              font-weight="700" font-size="${Math.round(w * 0.015)}" fill="#818cf8" letter-spacing="0.5">
          ${itemNum}
        </text>
        <text x="38" y="0" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
              font-weight="600" font-size="${Math.round(w * 0.0165)}" fill="#ffffff" filter="url(#textShadow)">
          ${escapeXml(wrapped[0] || feat)}
        </text>
        ${wrapped[1] ? `
          <text x="38" y="${Math.round(h * 0.022)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
                font-weight="500" font-size="${Math.round(w * 0.015)}" fill="#cbd5e1" filter="url(#textShadow)">
            ${escapeXml(wrapped[1])}
          </text>
        ` : ""}
      </g>
    `;
    currentY += wrapped.length > 1 ? Math.round(h * 0.062) : Math.round(h * 0.048);
  });

  const totalBlockHeight = currentY - blockY + Math.round(h * 0.02);

  // L-shaped Callout Line 1: From Product silhouette -> Spec Block
  const anchor1X = Math.round(w * 0.50);
  const anchor1Y = Math.round(h * 0.42);
  const elbow1X = Math.round(w * 0.54);
  const elbow1Y = blockY + Math.round(h * 0.06);
  const end1X = blockX - 10;

  // L-shaped Callout Line 2: From Product Base -> Policy Block
  const anchor2X = Math.round(w * 0.44);
  const anchor2Y = Math.round(h * 0.74);
  const elbow2Y = Math.round(h * 0.85);
  const end2X = Math.round(w * 0.52);

  const policyLines = wrapText(policyText, 36);
  let policyTspans = "";
  policyLines.slice(0, 2).forEach((line, idx) => {
    policyTspans += `<tspan x="${end2X + 16}" dy="${idx === 0 ? 0 : Math.round(h * 0.024)}">${escapeXml(line)}</tspan>`;
  });

  const priceBadgeSvg = buildPriceBadgeSvg(w, productDetails, h);

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.8" />
        </filter>
        <filter id="glowDot" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#818cf8" flood-opacity="0.95" />
        </filter>
        <linearGradient id="specHeaderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#a855f7" stop-opacity="0.4"/>
        </linearGradient>
      </defs>

      <!-- Top Product Title & Category Pill -->
      <g transform="translate(${Math.round(w * 0.06)}, ${Math.round(h * 0.08)})">
        <!-- Category Badge -->
        <rect x="0" y="0" width="${Math.min(300, category.length * 10 + 24)}" height="${Math.round(h * 0.028)}" rx="6" 
              fill="#090d16" fill-opacity="0.75" stroke="#6366f1" stroke-opacity="0.6" stroke-width="1" />
        <text x="10" y="${Math.round(h * 0.019)}" 
              font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
              font-weight="700" font-size="${Math.round(w * 0.013)}" fill="#a5b4fc" letter-spacing="0.6">
          ${escapeXml(category.toUpperCase())}
        </text>

        <!-- Main Title -->
        <text x="0" y="${Math.round(h * 0.068)}" 
              font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
              font-weight="800" font-size="${Math.round(w * 0.040)}" fill="#ffffff" 
              filter="url(#textShadow)" letter-spacing="0.3">
          ${escapeXml(title)}
        </text>
      </g>

      <!-- Callout Line 1 (Product -> Spec Block) -->
      <path d="M ${anchor1X} ${anchor1Y} L ${elbow1X} ${elbow1Y} L ${end1X} ${elbow1Y}" 
            stroke="#818cf8" stroke-width="2" stroke-opacity="0.9" fill="none" filter="url(#textShadow)" />
      <circle cx="${anchor1X}" cy="${anchor1Y}" r="5" fill="#ffffff" stroke="#6366f1" stroke-width="2" filter="url(#glowDot)" />
      <circle cx="${end1X}" cy="${elbow1Y}" r="4" fill="#a5b4fc" filter="url(#glowDot)" />

      <!-- Frosted Backdrop & Spec Block -->
      <rect x="${blockX}" y="${blockY}" width="${blockW}" height="${totalBlockHeight}" rx="14" 
            fill="#090d16" fill-opacity="0.78" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.2" />
      
      <!-- Spec Block Header -->
      <rect x="${blockX}" y="${blockY}" width="${blockW}" height="${Math.round(h * 0.034)}" rx="14" 
            fill="url(#specHeaderGrad)" />
      <text x="${blockX + 16}" y="${blockY + Math.round(h * 0.022)}" 
            font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
            font-weight="800" font-size="${Math.round(w * 0.014)}" fill="#ffffff" letter-spacing="0.6">
        ✦ THÔNG SỐ &amp; TÍNH NĂNG CỐT LÕI
      </text>

      <!-- Spec Items -->
      ${specItemsSvg}

      <!-- Callout Line 2 (Product Base -> Policy Block) -->
      <path d="M ${anchor2X} ${anchor2Y} L ${anchor2X} ${elbow2Y} L ${end2X} ${elbow2Y}" 
            stroke="#10b981" stroke-width="2" stroke-opacity="0.9" fill="none" filter="url(#textShadow)" />
      <circle cx="${anchor2X}" cy="${anchor2Y}" r="5" fill="#ffffff" stroke="#10b981" stroke-width="2" filter="url(#glowDot)" />
      <circle cx="${end2X}" cy="${elbow2Y}" r="4" fill="#6ee7b7" filter="url(#glowDot)" />

      <!-- Policy Block -->
      <rect x="${end2X + 8}" y="${elbow2Y - Math.round(h * 0.024)}" width="${Math.round(w * 0.42)}" height="${Math.round(h * 0.055)}" rx="10" 
            fill="#090d16" fill-opacity="0.75" stroke="#10b981" stroke-opacity="0.4" stroke-width="1" />
      <text x="${end2X + 16}" y="${elbow2Y - Math.round(h * 0.005)}" 
            font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
            font-weight="700" font-size="${Math.round(w * 0.015)}" fill="#34d399" 
            filter="url(#textShadow)">
        ✓ CHÍNH HÃNG &amp; CAM KẾT
      </text>
      <text x="${end2X + 16}" y="${elbow2Y + Math.round(h * 0.017)}" 
            font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
            font-weight="500" font-size="${Math.round(w * 0.0145)}" fill="#e2e8f0" 
            filter="url(#textShadow)">
        ${policyTspans}
      </text>

      <!-- Bottom-Left Commercial Summary -->
      <text x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.92)}" 
            font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
            font-weight="700" font-size="${Math.round(w * 0.017)}" fill="#ffffff" 
            filter="url(#textShadow)">
        ${escapeXml((productDetails.packagingHighlights || "COMMERCIAL STUDIO EDITION").toUpperCase())}
      </text>
      <text x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.95)}" 
            font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" 
            font-weight="500" font-size="${Math.round(w * 0.0145)}" fill="#94a3b8" 
            filter="url(#textShadow)">
        ${escapeXml(title)} • Official Lookbook
      </text>

      ${priceBadgeSvg}
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
