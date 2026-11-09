import {
  AspectRatio,
  ColorTone,
  ConceptMode,
  PackagingOption,
  ProductDetails,
  ShotStyle,
  SampleStyleAnalysis,
} from "@/types/studio";
import { BUILT_IN_PRESETS } from "@/lib/config/presets";

export interface ConceptDNA {
  surfaceSpec: string;
  environmentSpec: string;
  lightingSpec: string;
  reflectionAndShadow: string;
  paletteSpec: string;
  cameraSpec: string;
  colorToneDescription: string;
  packagingOption: PackagingOption;
  lockSameBackground: boolean;
  customPrompt?: string;
  hasConceptRef?: boolean;
  conceptVisionSummary?: string;
  sampleStyleAnalysis?: SampleStyleAnalysis;
  productVisionSummary?: string;
}

export const COLOR_TONE_CATALOG: Array<{
  id: ColorTone;
  name: string;
  swatches: string[];
  description: string;
}> = [
    {
      id: "auto",
      name: "Tự Động (AI Quyết Định)",
      swatches: ["#6366F1", "#A855F7"],
      description:
        "AI-harmonized commercial studio backdrop dynamically color-matched and balanced to highlight the authentic product materials, packaging colors, and lighting aesthetics",
    },
    {
      id: "sage_green",
      name: "Sage Green & Emerald Marble",
      swatches: ["#5F7464", "#1B3B2B"],
      description:
        "Sage Green silk drapery studio backdrop with a luxury dark emerald green veined marble podium, subtle organic botanical palm leaf shadows, warm studio rim lighting",
    },
    {
      id: "champagne_warm",
      name: "Champagne Warm & Travertine",
      swatches: ["#E6D2B5", "#C8A97E"],
      description:
        "Warm Champagne Gold & Cream luxury studio backdrop with a natural travertine limestone podium, soft golden-hour sunlight rays, warm specular highlights",
    },
    {
      id: "obsidian_black",
      name: "Obsidian Black & Dark Slate",
      swatches: ["#18181B", "#3F3F46"],
      description:
        "Matte Obsidian Black architectural studio backdrop with a brushed dark slate podium, dramatic silver-white rim lighting, crisp luxury reflections",
    },
    {
      id: "minimalist_white",
      name: "Minimalist White & Alabaster",
      swatches: ["#F8FAFC", "#E2E8F0"],
      description:
        "Pure Alabaster & Minimalist White architectural studio with a smooth matte white geometric pedestal, high-key commercial softbox lighting, soft ambient contact shadow",
    },
    {
      id: "terracotta_earth",
      name: "Terracotta Earth & Sandstone",
      swatches: ["#C27D56", "#8C583A"],
      description:
        "Warm Terracotta & Sandstone studio environment with a raw natural stone block podium, warm directional key lighting and organic shadows",
    },
    {
      id: "oceanic_blue",
      name: "Oceanic Sapphire & Granite",
      swatches: ["#1E3A5F", "#0F172A"],
      description:
        "Deep Oceanic Sapphire & Slate Blue studio backdrop with a polished dark granite podium, crisp cool-white studio rim lighting",
    },
    {
      id: "rose_quartz",
      name: "Rose Quartz & Carrara Marble",
      swatches: ["#F4C2C2", "#FFF0F5"],
      description:
        "Soft Pastel Rose Quartz & Blush silk studio backdrop with a white Carrara marble cylinder podium, diffused beauty dish lighting",
    },
  ];

export function resolveAutoColorTone(productDetails: ProductDetails, visionSummary?: string): ColorTone {
  const combined = `${productDetails.title || ""} ${productDetails.category || ""} ${productDetails.description || ""} ${visionSummary || ""}`.toLowerCase();

  if (/mỹ phẩm|skincare|serum|kem|son|nước hoa|perfume|beauty|blush|rose|phấn|collagen/i.test(combined)) {
    return "rose_quartz";
  }
  if (/pin|sạc|cáp|tai nghe|điện thoại|công nghệ|gadget|laptop|tech|loa|audio|black|obsidian/i.test(combined)) {
    return "obsidian_black";
  }
  if (/thiên nhiên|organic|thảo mộc|trà|tea|herbal|dược|green|detox|hoa quả|rau/i.test(combined)) {
    return "sage_green";
  }
  if (/cà phê|coffee|bánh|cake|thực phẩm|gốm|da|leather|warm|nắng|gỗ|wood/i.test(combined)) {
    return "terracotta_earth";
  }
  if (/nước|water|khoáng|aqua|biển|ocean|sport|lạnh|cool|sapphire/i.test(combined)) {
    return "oceanic_blue";
  }
  if (/luxury|sang trọng|vàng|gold|trang sức|jewelry|rượu|wine|champagne/i.test(combined)) {
    return "champagne_warm";
  }
  return "minimalist_white";
}

export const STRICT_NEGATIVE_PROMPT =
  "picture frame, photo frame border, wooden frame, canvas border, mock hanging poster, original wooden desk background, original room window, deformed product, altered text, gibberish typography, mutated logo, floating object, missing contact shadow, harsh cutout edges, oversaturated, watermark, cartoon, blurry foreground";

export function buildConceptDNA(params: {
  conceptMode: ConceptMode;
  conceptPresetId?: string;
  conceptPrompt?: string;
  productDetails: ProductDetails;
  packagingOption?: PackagingOption;
  colorTone?: ColorTone;
  lockSameBackground?: boolean;
  hasConceptRef?: boolean;
  conceptVisionSummary?: string;
  sampleStyleAnalysis?: SampleStyleAnalysis;
  productVisionSummary?: string;
}): ConceptDNA {
  const {
    conceptMode,
    conceptPresetId,
    conceptPrompt,
    packagingOption = "auto_detect",
    colorTone = "auto",
    lockSameBackground = true,
    hasConceptRef = false,
    conceptVisionSummary,
    sampleStyleAnalysis,
    productVisionSummary,
  } = params;

  let effectiveColorTone: ColorTone = colorTone;
  if (colorTone === "auto") {
    effectiveColorTone = resolveAutoColorTone(params.productDetails, params.productVisionSummary);
  }

  const toneEntry =
    COLOR_TONE_CATALOG.find((t) => t.id === effectiveColorTone) ||
    COLOR_TONE_CATALOG.find((t) => t.id === "minimalist_white") ||
    COLOR_TONE_CATALOG[0];

  // If a sample reference image is provided and analyzed, prioritize reproducing its exact design!
  if (hasConceptRef && sampleStyleAnalysis) {
    return {
      surfaceSpec: sampleStyleAnalysis.surfaceAndPodium,
      environmentSpec: `${sampleStyleAnalysis.backgroundEnvironment}. Decorative accents: ${sampleStyleAnalysis.decorativeProps}`,
      lightingSpec: sampleStyleAnalysis.lightingSetup,
      reflectionAndShadow: `Accurately match sample lighting and surface contact shadows: ${sampleStyleAnalysis.lightingSetup}`,
      paletteSpec: sampleStyleAnalysis.colorPalette,
      cameraSpec: `${sampleStyleAnalysis.cameraAngleAndComposition}, commercial advertising photography, 8k resolution`,
      colorToneDescription: `Sample Style Blueprint: ${sampleStyleAnalysis.colorPalette} (${sampleStyleAnalysis.overallStyleSummary})`,
      packagingOption,
      lockSameBackground,
      customPrompt: conceptPrompt,
      hasConceptRef: true,
      conceptVisionSummary: sampleStyleAnalysis.overallStyleSummary || conceptVisionSummary,
      sampleStyleAnalysis,
      productVisionSummary,
    };
  }

  if (conceptMode === "preset" && conceptPresetId) {
    const preset =
      BUILT_IN_PRESETS.find((p) => p.id === conceptPresetId) || BUILT_IN_PRESETS[0];
    return {
      surfaceSpec: preset.surface,
      environmentSpec: preset.environment,
      lightingSpec: preset.lighting,
      reflectionAndShadow:
        "Razor-sharp ambient occlusion contact shadow anchored beneath product base, soft realistic ground reflection",
      paletteSpec: toneEntry.description,
      cameraSpec:
        "85mm commercial prime lens, f/4 aperture, pin-sharp product details, 8k studio advertisement",
      colorToneDescription: `${toneEntry.description} (${preset.surface}, ${preset.environment})`,
      packagingOption,
      lockSameBackground,
      customPrompt: conceptPrompt,
      hasConceptRef,
      conceptVisionSummary,
      productVisionSummary,
    };
  }

  return {
    surfaceSpec: "Luxury architectural 3D studio podium",
    environmentSpec: toneEntry.description,
    lightingSpec:
      "Balanced commercial studio softbox key light and directional rim highlights",
    reflectionAndShadow:
      "Clean subtle podium reflections and tight ambient occlusion contact shadow",
    paletteSpec: toneEntry.description,
    cameraSpec:
      "Professional commercial advertising photography, 8k resolution, crisp edge sharpness",
    colorToneDescription: conceptVisionSummary
      ? `${toneEntry.description}. Reference atmosphere: ${conceptVisionSummary}`
      : toneEntry.description,
    packagingOption,
    lockSameBackground,
    customPrompt: conceptPrompt,
    hasConceptRef,
    conceptVisionSummary,
    productVisionSummary,
  };
}

/**
 * Intelligent Commercial Edit Prompt Expander
 * Transforms short user edit requests (Vietnamese & English) into rich, high-fidelity
 * commercial photographic directives that diffusion models adhere to with maximum precision.
 */
export function expandCommercialEditPrompt(params: {
  editPrompt: string;
  productTitle?: string;
  style: ShotStyle;
  aspectRatio?: AspectRatio;
}): string {
  const raw = params.editPrompt.trim();
  if (!raw) return "";

  const enhancements: string[] = [];
  const lower = raw.toLowerCase();

  // 1. Detect Environment & Background changes
  if (/biển|bãi biển|cát|ocean|beach|sea|sóng|wave|summer|mùa hè/i.test(lower)) {
    enhancements.push(
      "ENVIRONMENT OVERHAUL (TROPICAL COASTAL BEACH): Recreate the entire background as a breathtaking sunny coastal tropical beach. Place the product firmly on a clean, sun-warmed natural coral or smooth limestone podium resting on pristine fine white sand. In the soft-focus distance, turquoise ocean waves with gentle sea foam and lush tropical palm fronds cast organic, dancing sun shadows. Golden-hour natural sunlight with realistic aquatic caustic reflections and crisp contact shadows."
    );
  } else if (/đá marble|cẩm thạch|hoa cương|marble|travertine/i.test(lower)) {
    enhancements.push(
      "SURFACE UPGRADE (LUXURY MARBLE PEDESTAL): Replace the base with a polished, heavy geometric slab of Italian Carrara white marble with delicate grey and golden veining. Physics-based contact ambient occlusion shadows and crystal-clear specular floor reflections under soft diffused key lights."
    );
  } else if (/đen|dark|tối|obsidian|huyền bí|black|luxury dark/i.test(lower)) {
    enhancements.push(
      "ATMOSPHERE (OBSIDIAN DARK LUXURY): Transform the scene into a prestigious high-end dark studio. Set the product on a matte black architectural slate or basalt podium against an ultra-deep charcoal backdrop with dramatic chiaroscuro rim lighting and subtle atmospheric studio smoke."
    );
  } else if (/thiên nhiên|lá|rừng|cây|organic|nature|botanical|rêu|moss|bamboo/i.test(lower)) {
    enhancements.push(
      "ORGANIC NATURE SANCTUARY: Introduce fresh botanical elements including lush Monstera leaves, green velvet moss accents, and bamboo textures softly blurred in the background. Fresh morning sunlight filtering through natural canopy (komorebi lighting) casting realistic organic leaf shadows."
    );
  } else if (/gỗ|mộc|oak|wood|rustic|vintage/i.test(lower)) {
    enhancements.push(
      "SURFACE (NATURAL OAK TIMBER): Set the product on a warm, organic textured solid oak wood block with authentic grain and bevel edges, complemented by warm earthy neutral studio lighting."
    );
  } else if (/neon|cyber|công nghệ|tech|sci-fi|tương lai|future/i.test(lower)) {
    enhancements.push(
      "LIGHTING (HIGH-TECH CYBERPUNK RIM): Electrifying high-tech studio environment with dynamic dual-tone neon edge lighting (vibrant cyan and electric magenta/violet highlights outlining product silhouette) on a sleek glossy dark reflective acrylic floor."
    );
  } else if (/giáng sinh|noel|christmas|tuyết|snow|mùa đông|winter/i.test(lower)) {
    enhancements.push(
      "FESTIVE HOLIDAY CELEBRATION: Cozy festive holiday scene featuring warm glowing fairy bokeh lights, fresh winter pine needles, subtle pinecone accents, and soft golden holiday sparkle accents."
    );
  } else if (/quán cafe|cà phê|coffee|bàn làm việc|desk|living room|phòng khách/i.test(lower)) {
    enhancements.push(
      "LIFESTYLE INDOOR CONTEXT: Elegant contemporary lifestyle interior with warm ambient room lighting, minimalist architectural furniture softly blurred in the background, conveying modern everyday luxury."
    );
  }

  // 2. Detect Special FX & Atmosphere
  if (/giọt nước|nước|water|droplet|splash|ẩm|mát lạnh/i.test(lower)) {
    enhancements.push(
      "SURFACE EFFECT (CRISP CONDENSATION & WATER DROPLETS): Embellish the exterior product casing with crystal-clear, hyper-realistic micro water droplets and fresh splash beads, glistening under studio highlights to emphasize freshness and durability."
    );
  }
  if (/khói|sương|fog|mist|smoke|mờ ảo/i.test(lower)) {
    enhancements.push(
      "ATMOSPHERIC DEPTH: Add gentle cinematic studio haze and soft volumetric light rays cutting through subtle mist in the background."
    );
  }
  if (/hoàng hôn|sunset|golden hour|nắng vàng|ấm áp/i.test(lower)) {
    enhancements.push(
      "LIGHTING (WARM GOLDEN HOUR): Infuse the entire scene with warm golden-hour directional sunlight (3200K color temperature), casting long elegant contact shadows and rich amber edge glows."
    );
  }

  // 3. Detect Composition & Packaging overrides
  if (/bỏ hộp|xóa hộp|không có hộp|chỉ sản phẩm|chỉ giữ sản phẩm|bỏ vỏ hộp|remove box|no box/i.test(lower)) {
    enhancements.push(
      "COMPOSITION OVERRIDE: REMOVE ANY PACKAGING BOX COMPLETELY. Showcase ONLY the authentic standalone physical product heroically centered on the podium with 100% clean isolation."
    );
  } else if (/thêm hộp|kèm hộp|cả hộp|cả sản phẩm và hộp|with box/i.test(lower)) {
    enhancements.push(
      "COMPOSITION OVERRIDE: Arrange BOTH the unboxed authentic product and its retail packaging box side-by-side in balanced commercial harmony on the podium."
    );
  }

  // 4. Style-specific guidance
  if (params.style === "style3_callout") {
    if (/bỏ chữ|không có chữ|xóa chữ|xóa thông số|ẩn chữ|nền sạch/i.test(lower)) {
      enhancements.push(
        "CLEAN BACKGROUND: Leave open, spotless studio space around the product without any text, graphic lines, or numbers."
      );
    } else {
      enhancements.push(
        "INFOGRAPHIC LAYOUT: Keep the right and upper areas of the image uncluttered (35% open background space) with soft clean lighting so that commercial typography indicators can be read clearly."
      );
    }
  }

  return enhancements.join("\n\n");
}

/**
 * 7-Part Multi-Modal Prompt Engineering Engine (Matches Pipeline Specification 100%)
 */
export function compileStylePrompt(params: {
  style: ShotStyle;
  conceptDNA: ConceptDNA;
  productDetails: ProductDetails;
  aspectRatio: AspectRatio;
  useHybridOverlay?: boolean;
  editPrompt?: string;
}): { prompt: string; negativePrompt: string } {
  const {
    style,
    conceptDNA,
    productDetails,
    aspectRatio,
    useHybridOverlay = true,
    editPrompt,
  } = params;

  // 0. High-Priority User Edit Directive (Rule 0 for Image Modification)
  if (editPrompt && editPrompt.trim().length > 0) {
    const cleanEdit = editPrompt.trim();
    const expandedDetails = expandCommercialEditPrompt({
      editPrompt: cleanEdit,
      productTitle: productDetails.title,
      style,
      aspectRatio,
    });

    const editPromptText = `[PRIMARY MISSION - BOLD COMMERCIAL IMAGE EDITING]:
You are an expert commercial advertising director and CGI photographer performing a visual transformation of this photoshoot.

USER'S MANDATORY EDIT COMMAND:
>>> "${cleanEdit}" <<<

${expandedDetails ? `EXPANDED PHOTOGRAPHIC BLUEPRINT:\n${expandedDetails}\n` : ""}
EXECUTION MANDATES:
1. DOMINANT VISUAL TRANSFORMATION:
   - Faithfully, vividly, and boldly transform the photoshoot to match the user's edit command: "${cleanEdit}".
   - Completely discard any conflicting previous background or lighting if the user requested a new setting or theme.
   - If a new environment, surface, season, or lighting is specified, fully materialize it with commercial advertising quality.
2. ABSOLUTE PRODUCT FIDELITY:
   - Faithfully maintain the authentic physical product (${productDetails.title || "product"}) from Reference Image 2 (or Image 0).
   - Maintain 100% exact brand logo typography, buttons, ports, colors, and authentic material textures. Never mutate or alter authentic branding.
3. COMMERCIAL PHOTOGRAPHY STANDARDS:
   - Professional studio grade, razor-sharp focus on the product, seamless ambient occlusion contact shadows, realistic surface reflections, 8K commercial clarity, edge-to-edge full bleed (${aspectRatio} aspect ratio).
   - Zero picture frames, zero white borders, zero watermark, zero duplicate text, zero ghosting artifacts.`;

    return {
      prompt: editPromptText,
      negativePrompt: `${STRICT_NEGATIVE_PROMPT}, duplicate text, double typography, ghosting labels, blurry foreground, low quality, warped logos, picture frame, white border`,
    };
  }

  // 1. Anti-Frame Directive (Mandatory Rule 1)
  const rule1AntiFrame =
    "CRITICAL FRAMING RULE: DO NOT create a picture frame, photo frame border, mock hanging poster, wooden frame, canvas border, gallery border, or decorative photo edge. The image must be a full-bleed, edge-to-edge authentic 3D commercial studio shoot.";

  // 2. Packaging Composition Directive (Mandatory Rule 2)
  let rule2Packaging = "";
  if (style === "style3_callout") {
    // Style 3 (Infographic Callout) strictly focuses on the UNBOXED standalone product without packaging box
    rule2Packaging =
      "UNBOXED STANDALONE PRODUCT FOCUS (NO PACKAGING BOX): Completely unbox and separate the physical product from its outer cardboard box, carton, or retail packaging. Do NOT include any packaging box in the scene. Showcase ONLY the authentic standalone physical product itself positioned cleanly in the center of the studio podium, leaving generous open negative space around it for technical callout lines.";
  } else if (conceptDNA.packagingOption === "auto_detect" || !conceptDNA.packagingOption) {
    const hasBoxSignal =
      Boolean(
        conceptDNA.productVisionSummary &&
        /box|package|carton|packaging|hộp|bao bì/i.test(conceptDNA.productVisionSummary)
      ) ||
      Boolean(productDetails.packagingHighlights && productDetails.packagingHighlights.trim().length > 3);

    if (hasBoxSignal) {
      rule2Packaging =
        "INTELLIGENT COMPOSITION (AUTO-DETECTED PRODUCT & BOX): The authentic physical product item and its genuine retail packaging box/carton are seamlessly arranged side-by-side within the SAME SINGLE composite commercial image. Both the product itself and its packaging box are displayed together harmoniously in one frame on the studio podium, angled elegantly.";
    } else {
      rule2Packaging =
        "INTELLIGENT COMPOSITION (AUTO-DETECTED): Faithfully replicate the authentic product and packaging composition exactly as presented in the reference photos, arranged cleanly and harmoniously on the studio podium.";
    }
  } else if (conceptDNA.packagingOption === "product_and_box") {
    rule2Packaging =
      "HERO PRODUCT & PACKAGING COMPOSITION: The main authentic unboxed physical product item and its matching genuine retail packaging box/carton from the reference image are seamlessly designed and arranged side-by-side within the SAME SINGLE composite commercial image. Both the physical product itself and its authentic exterior packaging box are displayed together harmoniously in one frame on the studio podium, angled elegantly.";
  } else {
    rule2Packaging =
      "STANDALONE PRODUCT COMPOSITION: Showcase the main authentic physical product unit prominently as the singular hero centerpiece on the studio podium, cleanly isolated with zero background clutter.";
  }

  // 3. Strict Product Identity Directive (Mandatory Rule 3)
  const prodIdentityDesc = [
    productDetails.packagingHighlights,
    conceptDNA.productVisionSummary,
  ]
    .filter(Boolean)
    .join(". ");

  const rule3Identity = `STRICT REAL PRODUCT IDENTITY: Replicate the authentic design, typography, brand logo, label, cap, materials, and form factor from the product reference photo (image 0) with 100% precision.${prodIdentityDesc ? ` Authentic visual details: ${prodIdentityDesc}.` : ""
    } Completely remove the original phone photo table, wooden desk, wall, and room background. Zero fictional brand elements.`;

  // 4. Custom Prompt Directive (Rule 4)
  const rule4CustomPrompt =
    conceptDNA.customPrompt && conceptDNA.customPrompt.trim().length > 0
      ? `CUSTOM STUDIO SCENE PROMPT: ${conceptDNA.customPrompt.trim()}. Faithfully incorporate this described studio setting, lighting, props, and composition.`
      : "";

  // 5. Concept Reference Directive (Rule 5)
  let rule5ConceptRef = "";
  if (conceptDNA.hasConceptRef && conceptDNA.sampleStyleAnalysis) {
    const s = conceptDNA.sampleStyleAnalysis;
    rule5ConceptRef = `[CRITICAL STYLE-TRANSFER DIRECTIVE - REPRODUCE REFERENCE PHOTOGRAPHY]:
The sample reference image (Image 1) serves as the ABSOLUTE VISUAL BLUEPRINT for this photoshoot.
You must analyze Image 1 and faithfully reproduce its scene design, lighting, set staging, and art direction:
- SURFACE & PODIUM: Recreate ${s.surfaceAndPodium}. The product and packaging must rest realistically on this base.
- SCENE & BACKGROUND: Recreate ${s.backgroundEnvironment}.
- DECORATIVE PROPS: Recreate matching botanical/cosmetic/geometric props: ${s.decorativeProps}.
- LIGHTING PHYSICS & SHADOWS: Recreate the exact lighting setup (${s.lightingSetup}) with realistic ambient occlusion contact shadows and specular highlights.
- COLOR GRADING & MOOD: Grade the scene to match the exact tonal warmth, saturation, and palette: ${s.colorPalette}.
- CAMERA PERSPECTIVE: Match the camera angle and framing: ${s.cameraAngleAndComposition}.
INTEGRATION: Seamlessly place the authentic physical product from Image 0 inside this recreated set with 100% natural perspective, contact shadows, and surface reflections so it appears photographed in the exact same commercial studio session as Image 1.`;
  } else if (conceptDNA.hasConceptRef) {
    rule5ConceptRef = `[CONCEPT REFERENCE STYLE MATCH]: Harmonize and transfer the artistic atmosphere, studio lighting setup, podium styling, and aesthetic ambiance from the provided concept reference image${conceptDNA.conceptVisionSummary
      ? ` (${conceptDNA.conceptVisionSummary})`
      : ""
      }, while strictly showcasing the actual product and its packaging.`;
  }

  // 6. Lookbook Cohesion Directive (Rule 6)
  const rule6Lookbook = `UNIFIED STUDIO LOOKBOOK: Exact same background color tone: ${conceptDNA.colorToneDescription
    }. ${conceptDNA.lockSameBackground
      ? "Consistent lighting temperature, identical studio backdrop, and matching commercial podium surface across the entire 3-shot lookbook."
      : "Consistent lighting temperature and clean commercial surfaces."
    }`;

  // 7. Shot Type Specifics (Rule 7)
  let rule7ShotSpecific = "";
  if (style === "style1_hero") {
    rule7ShotSpecific = `SHOT TYPE (HERO COMMERCIAL DESIGN): Prestigious commercial advertising hero shoot (${aspectRatio} aspect ratio). Place the authentic product and its matching retail packaging box center-stage on ${conceptDNA.surfaceSpec} with lighting (${conceptDNA.lightingSpec}), subtle surface reflections, and realistic ambient occlusion contact shadows. Ultra-detailed 8k photorealistic masterpiece.`;
  } else if (style === "style2_grid2x2") {
    rule7ShotSpecific = `SHOT TYPE (2x2 MULTI-ANGLE GRID COLLAGE): High-end 2x2 grid collage showcasing 4 different studio angles in four neat quadrant panels separated by thin clean white divider lines on the identical studio background (${conceptDNA.paletteSpec}): Top-Left panel: direct front studio view on ${conceptDNA.surfaceSpec}; Top-Right panel: extreme macro close-up of authentic specification label, typography, and material texture; Bottom-Left panel: 45-degree angled three-quarter studio view on ${conceptDNA.surfaceSpec}; Bottom-Right panel: dynamic flatlay of product and packaging arranged cleanly on ${conceptDNA.surfaceSpec}.`;
  } else {
    // style3_callout: Unboxed standalone product centered with generous negative space
    if (useHybridOverlay) {
      rule7ShotSpecific = `SHOT TYPE (UNBOXED STANDALONE PRODUCT INFOGRAPHIC BASE): High-end minimalist commercial studio shoot on ${conceptDNA.surfaceSpec} with lighting (${conceptDNA.lightingSpec}). Showcase ONLY the unboxed standalone physical product (completely separated from and without any retail cardboard packaging box) centered on the studio podium, occupying ~38-42% of the center frame. Leave wide, clean, uncluttered studio background space on both the left side, right side, and top (60% open negative space) ready for sleek external technical indicator lines. CRITICAL: Do NOT render any text, letters, numbers, callout boxes, or graphic lines inside the AI generation itself—keep the background 100% pure studio photography.`;
    } else {
      const featuresList = (productDetails.highlightFeatures || [])
        .filter((f) => f.trim().length > 0)
        .join(" | ");
      rule7ShotSpecific = `SHOT TYPE (UNBOXED PRODUCT INFOGRAPHIC LINE CALLOUT): Modern minimalist commercial infographic breakdown poster on ${conceptDNA.surfaceSpec}. Showcase ONLY the unboxed standalone physical product centered on the podium without any packaging box. Ultra-thin, sleek graphic indicator lines, glowing technical callout dots, and crisp floating typography (with NO bulky dark background boxes) point directly to authentic features (${featuresList}) of the product.`;
    }
  }

  const compiledPrompt = [
    rule1AntiFrame,
    rule2Packaging,
    rule3Identity,
    rule4CustomPrompt,
    rule5ConceptRef,
    rule6Lookbook,
    rule7ShotSpecific,
  ]
    .filter((part) => part.length > 0)
    .join("\n");

  return {
    prompt: compiledPrompt,
    negativePrompt: STRICT_NEGATIVE_PROMPT,
  };
}
