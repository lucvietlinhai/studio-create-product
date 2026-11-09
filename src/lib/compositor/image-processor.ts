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
 * (Style 3: Sleek Architectural Leader Lines, Floating High-Contrast Typography, Zero Bulky Background Boxes).
 */
export function generateCalloutSvg(params: {
  width: number;
  height: number;
  calloutPoints: CalloutPoint[];
  productDetails: ProductDetails;
}): string {
  const { width: w, height: h, productDetails } = params;

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

  const primaryFontSize = Math.max(14, Math.round(w * 0.0172));
  const secondaryFontSize = Math.max(13, Math.round(w * 0.0155));
  const maxCharsPerLine = w < 700 ? 18 : 23;

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
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <!-- Crisp architectural leader line -->
        <path
          d="M ${slot.anchorX} ${slot.anchorY} L ${slot.elbowX} ${slot.elbowY} L ${slot.outerX} ${slot.elbowY}"
          fill="none"
          stroke="url(#${lineGradId})"
          stroke-width="1.4"
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
          stroke-width="2.6"
          stroke-linecap="round"
        />

        <!-- Elbow joint micro-node -->
        <circle cx="${slot.elbowX}" cy="${slot.elbowY}" r="2.2" fill="#e0f2fe" />

        <!-- Precision Target Node on Product -->
        <circle cx="${slot.anchorX}" cy="${slot.anchorY}" r="8.5" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1" />
        <circle cx="${slot.anchorX}" cy="${slot.anchorY}" r="5" fill="#090d16" fill-opacity="0.45" stroke="#38bdf8" stroke-width="1.4" />
        <circle cx="${slot.anchorX}" cy="${slot.anchorY}" r="2.4" fill="#ffffff" filter="url(#glowDot)" />

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
          stroke-width="3.8"
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
                stroke-width="3.5"
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

  const priceBadgeSvg = buildPriceBadgeSvg(w, productDetails, h);

  return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="calloutShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.75" />
        </filter>
        <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.65" />
        </filter>
        <filter id="glowDot" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="#38bdf8" flood-opacity="0.95" />
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
          font-size="${Math.max(11, Math.round(w * 0.013))}"
          fill="#7dd3fc"
          letter-spacing="2.4"
          stroke="#090d16"
          stroke-opacity="0.88"
          stroke-width="3.2"
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
          letter-spacing="0.4"
          stroke="#090d16"
          stroke-opacity="0.88"
          stroke-width="4.5"
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
          stroke-width="2"
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
          stroke-width="1.2"
        />
        <text
          x="${Math.round(w / 2)}"
          y="${Math.round(h * 0.95)}"
          text-anchor="middle"
          font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
          font-weight="700"
          font-size="${Math.max(12, Math.round(w * 0.015))}"
          fill="#f8fafc"
          stroke="#090d16"
          stroke-opacity="0.88"
          stroke-width="3.6"
          stroke-linejoin="round"
          paint-order="stroke fill"
          filter="url(#calloutShadow)"
        ><tspan fill="#34d399" font-weight="900">✓</tspan>  ${escapeXml(policyText)}</text>
      </g>

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
