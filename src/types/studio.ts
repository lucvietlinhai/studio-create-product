export type AspectRatio = "1:1" | "4:3" | "16:9" | "9:16" | "3:4" | "4:5";

export type ConceptMode = "preset" | "background_ref" | "prompt" | "sample_match";

export type AIProvider = "sangtao" | "gemini" | "openai";

/** Sangtao.ai chỉ cung cấp duy nhất model GPT Image cho tạo ảnh */
export const SANGTAO_IMAGE_MODEL = "chatgpt-image-sangtao";

export type ShotStyle = "style1_hero" | "style2_grid2x2" | "style3_callout";

export type PackagingOption = "product_and_box" | "auto_detect" | "product_only";

export type ColorTone =
  | "auto"
  | "sage_green"
  | "champagne_warm"
  | "obsidian_black"
  | "minimalist_white"
  | "terracotta_earth"
  | "oceanic_blue"
  | "rose_quartz";

export interface ConceptPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  previewColor: string;
  surface: string;
  lighting: string;
  environment: string;
}

export interface SampleStyleAnalysis {
  surfaceAndPodium: string;
  backgroundEnvironment: string;
  lightingSetup: string;
  decorativeProps: string;
  colorPalette: string;
  cameraAngleAndComposition: string;
  overallStyleSummary: string;
}

export type PriceBadgePosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type PriceBadgeTheme = "flash_sale" | "luxury_gold" | "tiktok_neon" | "emerald_eco";

export interface ProductDetails {
  title: string;
  category: string;
  description: string;
  packagingHighlights?: string; // Điểm nhấn bao bì / vỏ hộp
  policyText?: string; // Chính sách cam kết / bảo hành
  highlightFeatures: string[]; // For Callout lines (Style 3)
  originalPrice?: string;
  salePrice?: string;
  showPriceBadge: boolean;
  priceBadgePosition?: PriceBadgePosition;
  priceBadgeTheme?: PriceBadgeTheme;
}

export interface CalloutPoint {
  id: string;
  xPercent: number; // 0 - 100% on image
  yPercent: number; // 0 - 100% on image
  title: string;
  description?: string;
  lineAngle?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export interface ProcessLogEntry {
  id: string;
  timestamp: string; // HH:mm:ss
  level: "info" | "success" | "warning" | "error";
  agent:
    | "AnalyzerAgent"
    | "DirectorAgent"
    | "SangtaoAI"
    | "Orchestrator"
    | "Compositor"
    | "CriticAgent"
    | "System";
  stepName: string;
  message: string;
  details?: string;
}

export interface GeneratedImageRecord {
  id: string;
  style: ShotStyle;
  styleName: string;
  version: number; // v1, v2, v3...
  imageUrl: string;
  localPath: string;
  cleanLocalPath?: string; // Path to clean AI render before SVG vector overlays (prevents double-text ghosting on edit)
  aspectRatio: AspectRatio;
  promptUsed: string;
  editPromptUsed?: string;
  provider: AIProvider;
  createdAt: string;
  calloutPoints?: CalloutPoint[];
  hasOverlayBadge?: boolean;
}

export interface ProductSession {
  id: string;
  dateFolder: string; // YYYY-MM-DD
  sessionName: string;
  productDetails: ProductDetails;
  conceptMode: ConceptMode;
  conceptPresetId?: string;
  conceptPrompt?: string;
  packagingOption?: PackagingOption;
  colorTone?: ColorTone;
  lockSameBackground?: boolean;
  aspectRatio: AspectRatio;
  provider: AIProvider;
  useHybridOverlay: boolean; // True: Smart SVG/Canvas for text/callout, False: Pure AI
  uploadedImages: {
    originalPhotos: string[]; // 1-3 user photos
    backgroundRef?: string;
    sampleRef?: string;
  };
  sampleStyleAnalysis?: SampleStyleAnalysis;
  currentResults: {
    style1?: GeneratedImageRecord;
    style2?: GeneratedImageRecord;
    style3?: GeneratedImageRecord;
  };
  history: GeneratedImageRecord[];
  generationWarning?: string;
  executionLogs?: ProcessLogEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface StudioSettings {
  defaultProvider: AIProvider;
  sangtaoApiKey: string;
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;
  enableMockMode: boolean; // Allows previewing full UI & flows without immediate API keys
  outputDirectory: string;
}

