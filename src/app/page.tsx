"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Camera,
  Layers,
  Sliders,
  FolderOpen,
  Settings as SettingsIcon,
  History as HistoryIcon,
  RefreshCw,
  Tag,
  Check,
  CheckCircle2,
  AlertCircle,
  Upload,
  X,
  Grid2X2,
  ExternalLink,
  Download,
  Info,
  ChevronRight,
  ZoomIn,
  SlidersHorizontal,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Terminal,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Bug,
  Activity,
  CheckCheck,
  Package,
  Palette,
  Lock,
  Cpu,
  Pencil,
  Crosshair,
  Undo2,
  Square,
  Paintbrush,
} from "lucide-react";
import {
  ProductSession,
  ProductDetails,
  ConceptMode,
  AspectRatio,
  ImageResolution,
  EditRegionBox,
  AIProvider,
  PackagingOption,
  ColorTone,
  StudioSettings,
  ShotStyle,
  GeneratedImageRecord,
  ProcessLogEntry,
  SANGTAO_IMAGE_MODEL,
  DEFAULT_PROVIDER_RESOLUTIONS,
} from "@/types/studio";
import { BUILT_IN_PRESETS } from "@/lib/config/presets";
import { COLOR_TONE_CATALOG } from "@/lib/agents/director-agent";

const IMAGE_RESOLUTIONS: {
  id: ImageResolution;
  label: string;
  subLabel: string;
  badge: string;
}[] = [
  { id: "1K", label: "1K HD", subLabel: "1024px • Chuẩn TMĐT", badge: "Nhanh" },
  { id: "2K", label: "2K QHD", subLabel: "2048px • Sắc nét cao", badge: "Khuyên dùng" },
];

type RegionStroke =
  | {
      type: "brush";
      radiusNorm: number; // Normalized radius (0.015 .. 0.065)
      points: { x: number; y: number }[]; // Normalized 0..1
    }
  | {
      type: "box";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };

function computeRegionBoxFromStrokes(strokes: RegionStroke[]): EditRegionBox | null {
  if (!strokes || strokes.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const s of strokes) {
    if (s.type === "brush") {
      for (const pt of s.points) {
        minX = Math.min(minX, Math.max(0, pt.x - s.radiusNorm));
        minY = Math.min(minY, Math.max(0, pt.y - s.radiusNorm));
        maxX = Math.max(maxX, Math.min(1, pt.x + s.radiusNorm));
        maxY = Math.max(maxY, Math.min(1, pt.y + s.radiusNorm));
      }
    } else {
      const left = Math.min(s.x1, s.x2);
      const right = Math.max(s.x1, s.x2);
      const top = Math.min(s.y1, s.y2);
      const bottom = Math.max(s.y1, s.y2);
      minX = Math.min(minX, Math.max(0, left));
      minY = Math.min(minY, Math.max(0, top));
      maxX = Math.max(maxX, Math.min(1, right));
      maxY = Math.max(maxY, Math.min(1, bottom));
    }
  }

  if (maxX <= minX || maxY <= minY) return null;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const hZone = cx < 0.36 ? "Bên Trái (Left)" : cx > 0.64 ? "Bên Phải (Right)" : "Chính Giữa (Center)";
  const vZone = cy < 0.36 ? "Góc Trên (Top)" : cy > 0.64 ? "Góc Dưới (Bottom)" : "Trung Tâm (Middle)";

  return {
    xPercent: Math.round(minX * 100),
    yPercent: Math.round(minY * 100),
    widthPercent: Math.max(4, Math.round((maxX - minX) * 100)),
    heightPercent: Math.max(4, Math.round((maxY - minY) * 100)),
    zoneLabel: `${vZone} - ${hZone}`,
  };
}

async function generateAnnotatedGuideDataUrl(
  imageUrl: string,
  strokes: RegionStroke[],
  regionBox: EditRegionBox
): Promise<string | undefined> {
  if (!strokes || strokes.length === 0) return undefined;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const maxDim = 1024;
          const natW = img.naturalWidth || 1024;
          const natH = img.naturalHeight || 1024;
          const scale = Math.min(1, maxDim / Math.max(natW, natH));
          const w = Math.max(256, Math.round(natW * scale));
          const h = Math.max(256, Math.round(natH * scale));

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(undefined);
            return;
          }

          // 1. Draw clean base image
          ctx.drawImage(img, 0, 0, w, h);

          // 2. Render uniform mask on offscreen layer
          const maskCanvas = document.createElement("canvas");
          maskCanvas.width = w;
          maskCanvas.height = h;
          const mCtx = maskCanvas.getContext("2d");
          if (mCtx) {
            mCtx.fillStyle = "#38bdf8";
            mCtx.strokeStyle = "#38bdf8";
            mCtx.lineCap = "round";
            mCtx.lineJoin = "round";

            for (const s of strokes) {
              if (s.type === "brush") {
                const lineW = Math.max(12, s.radiusNorm * 2 * Math.min(w, h));
                mCtx.lineWidth = lineW;
                if (s.points.length === 1) {
                  mCtx.beginPath();
                  mCtx.arc(s.points[0].x * w, s.points[0].y * h, lineW / 2, 0, Math.PI * 2);
                  mCtx.fill();
                } else if (s.points.length > 1) {
                  mCtx.beginPath();
                  mCtx.moveTo(s.points[0].x * w, s.points[0].y * h);
                  for (let i = 1; i < s.points.length; i++) {
                    mCtx.lineTo(s.points[i].x * w, s.points[i].y * h);
                  }
                  mCtx.stroke();
                }
              } else {
                const bx = Math.min(s.x1, s.x2) * w;
                const by = Math.min(s.y1, s.y2) * h;
                const bw = Math.abs(s.x2 - s.x1) * w;
                const bh = Math.abs(s.y2 - s.y1) * h;
                mCtx.fillRect(bx, by, bw, bh);
              }
            }

            ctx.save();
            ctx.globalAlpha = 0.44;
            ctx.drawImage(maskCanvas, 0, 0);
            ctx.restore();
          }

          // 3. Draw crisp dashed target boundary around regionBox
          ctx.save();
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = Math.max(2.5, Math.round(Math.min(w, h) * 0.0035));
          ctx.setLineDash([10, 6]);
          ctx.strokeRect(
            (regionBox.xPercent / 100) * w,
            (regionBox.yPercent / 100) * h,
            (regionBox.widthPercent / 100) * w,
            (regionBox.heightPercent / 100) * h
          );
          ctx.restore();

          resolve(canvas.toDataURL("image/jpeg", 0.9));
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = imageUrl;
    } catch {
      resolve(undefined);
    }
  });
}

interface EditPromptCategory {
  title: string;
  badge: string;
  items: string[];
}

const EDIT_PROMPT_CATEGORIES: EditPromptCategory[] = [
  {
    title: "Bảng Giá, Tem & Thông Tin (Khoanh vùng để chèn)",
    badge: "🏷️",
    items: [
      "Thêm bảng giá Flash Sale 389.000đ (Giá gốc 590.000đ - Giảm 34%) tại vùng khoanh",
      "Chèn huy hiệu Luxury Gold ghi Giá Ưu Đãi & Freeship tại vùng chọn",
      "Thêm tem Bảo Hành Chính Hãng 12 Tháng 1 Đổi 1 tại vùng chọn",
      "Thêm nhãn Quà Tặng Kèm / Mua 1 Tặng 1 nổi bật tại vùng chọn",
    ],
  },
  {
    title: "Bối Cảnh & Không Gian",
    badge: "🏖️",
    items: [
      "Bãi biển nhiệt đới mùa hè, cát trắng, sóng biển",
      "Bục đá marble trắng cẩm thạch sang trọng",
      "Nền đen obsidian tối giản luxury huyền bí",
      "Thiên nhiên xanh tươi, lá cây & rêu ẩm mềm",
      "Bục gỗ sồi mộc mạc ấm cúng vintage",
      "Công nghệ cyberpunk, đèn neon tím xanh",
      "Không gian giáng sinh ấm cúng, quả thông & tuyết",
    ],
  },
  {
    title: "Hiệu Ứng & Ánh Sáng",
    badge: "✨",
    items: [
      "Thêm giọt nước đọng trên thân sản phẩm",
      "Ánh sáng hoàng hôn vàng warm golden hour",
      "Khói sương mờ ảo cinematic depth",
      "Đèn viền neon cyberpunk rực rỡ sắc nét",
      "Góc chiếu kim loại rực rỡ, phản quang cao cấp",
    ],
  },
  {
    title: "Bố Cục & Bao Bì",
    badge: "📦",
    items: [
      "Bỏ vỏ hộp, chỉ giữ lại sản phẩm chính",
      "Bố trí sản phẩm & vỏ hộp đứng cạnh nhau",
      "Góc cận cảnh macro đặc tả chất liệu",
      "Bỏ chữ và thông số để lấy nền sạch",
    ],
  },
];

const EDIT_PROMPT_SUGGESTIONS = EDIT_PROMPT_CATEGORIES.flatMap((c) => c.items);

export default function StudioPage() {
  // --- Form Input States ---
  const [productPhotos, setProductPhotos] = useState<string[]>([]);
  const [backgroundRef, setBackgroundRef] = useState<string | null>(null);
  const [sampleRef, setSampleRef] = useState<string | null>(null);

  // --- Image Edit (Prompt & Interactive Region Inpainting) States ---
  const [editingStyle, setEditingStyle] = useState<ShotStyle | null>(null);
  const [editPromptInputs, setEditPromptInputs] = useState<Record<ShotStyle, string>>({
    style1_hero: "",
    style2_grid2x2: "",
    style3_callout: "",
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<ShotStyle | null>(null);

  // Interactive Region Selection (ChatGPT-style Brush & Box Inpainting)
  const [selectionTool, setSelectionTool] = useState<"brush" | "box">("brush");
  const [brushRadiusNorm, setBrushRadiusNorm] = useState<number>(0.036);
  const [regionStrokesByStyle, setRegionStrokesByStyle] = useState<Record<ShotStyle, RegionStroke[]>>({
    style1_hero: [],
    style2_grid2x2: [],
    style3_callout: [],
  });
  const [activeDrawingStroke, setActiveDrawingStroke] = useState<RegionStroke | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [packagingHighlights, setPackagingHighlights] = useState("");
  const [policyText, setPolicyText] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);

  const [packagingOption, setPackagingOption] = useState<PackagingOption>("auto_detect");
  const [colorTone, setColorTone] = useState<ColorTone>("auto");
  const [lockSameBackground, setLockSameBackground] = useState<boolean>(true);

  const [conceptMode, setConceptMode] = useState<ConceptMode>("preset");
  const [selectedPresetId, setSelectedPresetId] = useState("luxury_podium");
  const [conceptPrompt, setConceptPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [provider, setProvider] = useState<AIProvider>("sangtao");
  const [supportedResolutionsByProvider, setSupportedResolutionsByProvider] = useState<
    Record<AIProvider, ImageResolution[]>
  >(DEFAULT_PROVIDER_RESOLUTIONS);

  // Collapsible Accordion Sections in Left Sidebar
  const [openSections, setOpenSections] = useState({
    upload: true,
    specs: false,
    concept: false,
  });

  const toggleSection = (section: "upload" | "specs" | "concept") => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // --- Generation & Session States ---
  const [currentSession, setCurrentSession] = useState<ProductSession | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isGeneratingConcept, setIsGeneratingConcept] = useState(false);
  const [regeneratingStyle, setRegeneratingStyle] = useState<ShotStyle | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // --- History & Settings Drawers ---
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [historyList, setHistoryList] = useState<{ date: string; sessions: ProductSession[] }[]>([]);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);
  const [lightboxEditActive, setLightboxEditActive] = useState<boolean>(false);

  // --- API Testing & Persistence States ---
  const [showSangtaoKey, setShowSangtaoKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [isTestingSangtao, setIsTestingSangtao] = useState(false);
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [isTestingOpenAI, setIsTestingOpenAI] = useState(false);
  const [sangtaoTestResult, setSangtaoTestResult] = useState<{
    success: boolean;
    message: string;
    credits?: number;
  } | null>(null);
  const [geminiTestResult, setGeminiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [openAITestResult, setOpenAITestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string>("");

  // --- Live Execution Log & Console States ---
  const [executionLogs, setExecutionLogs] = useState<ProcessLogEntry[]>([
    {
      id: "log_init",
      timestamp: new Date().toLocaleTimeString("vi-VN", { hour12: false }),
      level: "info",
      agent: "System",
      stepName: "Sẵn sàng hoạt động",
      message: "Hệ thống AI Studio đã nạp xong các Agent: AnalyzerAgent, DirectorAgent, SangtaoAI, Orchestrator, Compositor.",
    },
  ]);
  const [logFilter, setLogFilter] = useState<"all" | "error" | "warning" | "success" | "info">("all");
  const [isLogConsoleExpanded, setIsLogConsoleExpanded] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isCopiedLog, setIsCopiedLog] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Hidden File Inputs
  const phonePhotoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);

  const appendLog = (
    level: ProcessLogEntry["level"],
    agent: ProcessLogEntry["agent"],
    stepName: string,
    message: string,
    details?: string
  ) => {
    const newEntry: ProcessLogEntry = {
      id: `ui_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString("vi-VN", { hour12: false }),
      level,
      agent,
      stepName,
      message,
      details,
    };
    setExecutionLogs((prev) => [...prev, newEntry]);
  };

  const handleCopyLogs = () => {
    const formatted = executionLogs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.agent}] ${l.stepName}: ${l.message}${l.details ? `\n--> Chi tiết: ${l.details}` : ""
          }`
      )
      .join("\n");
    navigator.clipboard.writeText(formatted);
    setIsCopiedLog(true);
    setTimeout(() => setIsCopiedLog(false), 2000);
  };

  // Auto-scroll log console
  useEffect(() => {
    if (logsContainerRef.current && isLogConsoleExpanded) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [executionLogs, isLogConsoleExpanded]);

  // Load Settings on Mount
  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        let data = await res.json();
        if (!data.sangtaoApiKey && typeof window !== "undefined") {
          const cached = localStorage.getItem("studio_api_settings");
          if (cached) {
            try {
              const parsedCached = JSON.parse(cached);
              if (
                parsedCached.sangtaoApiKey ||
                parsedCached.geminiApiKey ||
                parsedCached.openaiApiKey
              ) {
                data = { ...data, ...parsedCached };
                if (data.defaultProvider === "cloudflare" || data.defaultProvider === "stability") {
                  data.defaultProvider = "sangtao";
                }
                await fetch("/api/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
              }
            } catch (e) { }
          }
        }
        if (!data.defaultProvider || data.defaultProvider === "cloudflare" || data.defaultProvider === "stability") {
          data.defaultProvider = "sangtao";
        }
        if (data.supportedResolutionsByProvider) {
          setSupportedResolutionsByProvider((prev) => ({
            ...prev,
            ...data.supportedResolutionsByProvider,
          }));
        }
        setSettings(data);
        if (data.defaultProvider) setProvider(data.defaultProvider);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        if (data.history) setHistoryList(data.history);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveSettingsToServer = async (newSettings: Partial<StudioSettings>, silent = false) => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("studio_api_settings", JSON.stringify(newSettings));
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) {
        const data = await res.json();
        const savedSettings: StudioSettings = data?.settings || data;
        if (savedSettings && typeof savedSettings === "object") {
          setSettings(savedSettings);
          if (savedSettings.defaultProvider) {
            setProvider(savedSettings.defaultProvider);
          }
        }
        if (!silent) {
          setSaveNotice("Đã lưu vĩnh viễn cấu hình AI vào hệ thống cho các phiên tiếp theo!");
          setTimeout(() => setSaveNotice(""), 3500);
        }
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const handleClearAllApiKeys = async () => {
    if (
      !window.confirm(
        "CẢNH BÁO BẢO MẬT:\n\nBạn có chắc chắn muốn XÓA TOÀN BỘ API Key khỏi hệ thống (Sangtao.ai, Gemini, OpenAI)?\n\nThao tác này giúp bạn an tâm khi chia sẻ máy, cài đặt trên thiết bị mới hoặc xuất bản cài đặt."
      )
    ) {
      return;
    }

    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("studio_api_settings");
      }
      const res = await fetch("/api/settings", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const resetSettings: StudioSettings = data.settings || {
          ...settings,
          sangtaoApiKey: "",
          geminiApiKey: "",
          openaiApiKey: "",
        };
        setSettings(resetSettings);
        setSangtaoTestResult(null);
        setGeminiTestResult(null);
        setOpenAITestResult(null);
        setSaveNotice("Đã xóa sạch toàn bộ API Key khỏi hệ thống!");
        appendLog("info", "System", "Bảo mật API Key", "Đã xóa toàn bộ khóa bí mật khỏi hệ thống lưu trữ.");
        setTimeout(() => setSaveNotice(""), 4500);
      } else {
        alert(data.error || "Không thể xóa API key!");
      }
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi xóa API Key: " + (err?.message || err));
    }
  };

  const handleClearSingleApiKey = async (providerName: "sangtao" | "gemini" | "openai") => {
    if (!settings) return;
    const providerLabel =
      providerName === "sangtao"
        ? "Sangtao.ai"
        : providerName === "gemini"
          ? "Google Gemini"
          : "OpenAI";

    if (!window.confirm(`Bạn có chắc chắn muốn xóa làm trống API Key của ${providerLabel}?`)) {
      return;
    }

    const updated: StudioSettings = {
      ...settings,
      sangtaoApiKey: providerName === "sangtao" ? "" : settings.sangtaoApiKey,
      geminiApiKey: providerName === "gemini" ? "" : settings.geminiApiKey,
      openaiApiKey: providerName === "openai" ? "" : settings.openaiApiKey,
    };

    if (providerName === "sangtao") setSangtaoTestResult(null);
    if (providerName === "gemini") setGeminiTestResult(null);
    if (providerName === "openai") setOpenAITestResult(null);

    setSettings(updated);
    await saveSettingsToServer(updated, true);
    setSaveNotice(`Đã làm trống API Key của ${providerLabel}!`);
    appendLog("info", "System", "Bảo mật API Key", `Đã xóa khóa ${providerLabel} khỏi hệ thống.`);
    setTimeout(() => setSaveNotice(""), 3500);
  };

  const handleTestApi = async (testProvider: "sangtao" | "gemini" | "openai") => {
    let keyToTest = "";
    if (testProvider === "sangtao") keyToTest = settings?.sangtaoApiKey || "";
    else if (testProvider === "gemini") keyToTest = settings?.geminiApiKey || "";
    else if (testProvider === "openai") keyToTest = settings?.openaiApiKey || "";

    if (!keyToTest || keyToTest.trim().length === 0) {
      if (testProvider === "sangtao") {
        setSangtaoTestResult({
          success: false,
          message: "Vui lòng dán khóa Sangtao.ai API Key (X-Api-Key) trước khi kiểm tra!",
        });
      } else if (testProvider === "gemini") {
        setGeminiTestResult({
          success: false,
          message: "Vui lòng nhập Google Gemini API Key trước khi kiểm tra!",
        });
      } else {
        setOpenAITestResult({
          success: false,
          message: "Vui lòng nhập OpenAI API Key trước khi kiểm tra!",
        });
      }
      return;
    }

    if (testProvider === "sangtao") {
      setIsTestingSangtao(true);
      setSangtaoTestResult(null);
      appendLog("info", "SangtaoAI", "Xác thực API Sangtao.ai", "Đang kết nối API v2 kiểm tra số dư credit...");
    } else if (testProvider === "gemini") {
      setIsTestingGemini(true);
      setGeminiTestResult(null);
      appendLog("info", "System", "Xác thực API Gemini", "Đang kiểm tra kết nối Google Gemini...");
    } else {
      setIsTestingOpenAI(true);
      setOpenAITestResult(null);
      appendLog("info", "System", "Xác thực API OpenAI", "Đang kiểm tra kết nối OpenAI...");
    }

    try {
      const res = await fetch("/api/test-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: testProvider,
          apiKey: keyToTest,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.supportedResolutions) && data.supportedResolutions.length > 0) {
          setSupportedResolutionsByProvider((prev) => ({
            ...prev,
            [testProvider]: data.supportedResolutions,
          }));
          if (!data.supportedResolutions.includes(resolution)) {
            setResolution(data.supportedResolutions[0] || "1K");
          }
        }
        if (testProvider === "sangtao") {
          setSangtaoTestResult({
            success: true,
            message: data.message,
            credits: data.credits,
          });
          appendLog("success", "SangtaoAI", "Kết nối Sangtao.ai thành công", data.message);
          if (settings) {
            const updated = { ...settings, enableMockMode: false, defaultProvider: "sangtao" as const };
            setSettings(updated);
            setProvider("sangtao");
            await saveSettingsToServer(updated, true);
          }
        } else if (testProvider === "gemini") {
          setGeminiTestResult({ success: true, message: data.message });
          if (settings) {
            const updated = { ...settings, enableMockMode: false, defaultProvider: "gemini" as const };
            setSettings(updated);
            setProvider("gemini");
            await saveSettingsToServer(updated, true);
          }
        } else {
          setOpenAITestResult({ success: true, message: data.message });
          if (settings) {
            const updated = { ...settings, enableMockMode: false, defaultProvider: "openai" as const };
            setSettings(updated);
            setProvider("openai");
            await saveSettingsToServer(updated, true);
          }
        }
      } else {
        if (testProvider === "sangtao") {
          setSangtaoTestResult({ success: false, message: data.error || "Kết nối Sangtao.ai thất bại" });
          appendLog("error", "SangtaoAI", "Lỗi xác thực Sangtao.ai", data.error || "Kết nối thất bại");
        } else if (testProvider === "gemini") {
          setGeminiTestResult({ success: false, message: data.error || "Kết nối thất bại" });
        } else {
          setOpenAITestResult({ success: false, message: data.error || "Kết nối thất bại" });
        }
      }
    } catch (err: any) {
      if (testProvider === "sangtao") {
        setSangtaoTestResult({ success: false, message: err.message || "Lỗi kiểm tra kết nối" });
      } else if (testProvider === "gemini") {
        setGeminiTestResult({ success: false, message: err.message || "Lỗi kiểm tra kết nối" });
      } else {
        setOpenAITestResult({ success: false, message: err.message || "Lỗi kiểm tra kết nối" });
      }
    } finally {
      if (testProvider === "sangtao") setIsTestingSangtao(false);
      else if (testProvider === "gemini") setIsTestingGemini(false);
      else setIsTestingOpenAI(false);
    }
  };

  // Vision AI Auto-Extract specs, packaging, and commercial details from photo
  const triggerAutoAnalysis = async (photoBase64: string) => {
    if (!photoBase64 || isAnalyzingProduct) return;
    setIsAnalyzingProduct(true);
    appendLog(
      "info",
      "AnalyzerAgent",
      "Kích hoạt Vision OCR & Bóc tách đặc tính",
      "Đang quét văn bản trên sản phẩm/hộp, cổng kết nối, công suất và đặc tính nổi bật..."
    );

    try {
      const res = await fetch("/api/analyze-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: photoBase64 }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.details) {
        const d = data.details;
        setTitle((prev) => (prev.trim().length > 0 ? prev : d.title || ""));
        setCategory((prev) => (prev.trim().length > 0 ? prev : d.category || ""));
        setDescription((prev) => (prev.trim().length > 0 ? prev : d.description || ""));
        if (d.packagingHighlights) {
          setPackagingHighlights((prev) => (prev.trim().length > 0 ? prev : d.packagingHighlights));
        }
        if (d.policyText) {
          setPolicyText((prev) => (prev.trim().length > 0 ? prev : d.policyText));
        }
        if (Array.isArray(d.highlightFeatures) && d.highlightFeatures.length > 0) {
          setFeatures(d.highlightFeatures);
        }
        appendLog(
          "success",
          "AnalyzerAgent",
          "Bóc tách đặc tính thành công",
          `Nhận diện: "${d.title}" (${d.category})\nĐặc tính: ${d.highlightFeatures?.join(" • ")}`
        );
      }
    } catch (err: any) {
      console.warn("Auto analysis error:", err);
    } finally {
      setIsAnalyzingProduct(false);
    }
  };

  // Convert File to Base64
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "photos" | "bg" | "sample"
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (type === "photos") {
      const remainingSlots = 3 - productPhotos.length;
      const countToRead = Math.min(files.length, remainingSlots);
      for (let i = 0; i < countToRead; i++) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const base64 = event.target.result as string;
            setProductPhotos((prev) => [...prev, base64].slice(0, 3));
            if (i === 0 && (!title || features.length === 0)) {
              triggerAutoAnalysis(base64);
            }
          }
        };
        reader.readAsDataURL(files[i]);
      }
    } else if (type === "bg") {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) setBackgroundRef(event.target.result as string);
      };
      reader.readAsDataURL(files[0]);
    } else if (type === "sample") {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) setSampleRef(event.target.result as string);
      };
      reader.readAsDataURL(files[0]);
    }
  };

  // Generate Style 1 (Hero Showcase) first
  const handleGenerateAll = async () => {
    if (productPhotos.length === 0) {
      alert("Vui lòng tải lên ít nhất 1 ảnh chụp sản phẩm từ điện thoại!");
      return;
    }

    const activeProvider = settings?.defaultProvider || provider || "sangtao";
    setIsGeneratingAll(true);
    setIsLogConsoleExpanded(true);
    setStatusMessage("AI Vision đang phân tích sản phẩm và thiết kế ảnh Hero Showcase...");

    appendLog(
      "info",
      "System",
      "Khởi chạy tiến trình (Bước 1: Ảnh Hero)",
      `Sản phẩm: "${title || "Tự động nhận diện"}" | Tỷ lệ: ${aspectRatio} | Chất lượng: ${resolution} | Provider: ${activeProvider.toUpperCase()}`
    );
    appendLog(
      "info",
      "AnalyzerAgent",
      "Phân tích ảnh chụp",
      `Đã nạp ${productPhotos.length} ảnh điện thoại, định hướng concept: "${conceptMode}"`
    );

    try {
      const payload = {
        generateMode: "hero_only",
        productDetails: {
          title,
          category,
          description,
          packagingHighlights,
          policyText,
          highlightFeatures: features.filter((f) => f && f.trim().length > 0),
        },
        conceptMode,
        conceptPresetId: selectedPresetId,
        conceptPrompt,
        packagingOption,
        colorTone,
        lockSameBackground,
        aspectRatio,
        resolution,
        provider: activeProvider,
        useHybridOverlay: true, // Always true as requested
        originalPhotos: productPhotos,
        backgroundRef,
        sampleRef,
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (data.logs && Array.isArray(data.logs)) {
        setExecutionLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const newLogs = data.logs.filter((l: ProcessLogEntry) => !existingIds.has(l.id));
          return [...prev, ...newLogs];
        });
      }

      if (!res.ok || !data.success) {
        const errMsg = data.error || "Không thể tạo ảnh, vui lòng kiểm tra bảng Log để biết chi tiết!";
        appendLog("error", "System", "Tiến trình thất bại", errMsg, JSON.stringify(data, null, 2));
        throw new Error(errMsg);
      }

      if (data.session) {
        setCurrentSession(data.session);
        fetchHistory();

        // If inputs were blank, auto-populate with the AI-detected commercial details
        const pd = data.session.productDetails;
        if (pd) {
          if (!title && pd.title) setTitle(pd.title);
          if (!category && pd.category) setCategory(pd.category);
          if (!description && pd.description) setDescription(pd.description);
          if (!packagingHighlights && pd.packagingHighlights) setPackagingHighlights(pd.packagingHighlights);
          if (!policyText && pd.policyText) setPolicyText(pd.policyText);
          if (
            pd.highlightFeatures &&
            pd.highlightFeatures.length > 0 &&
            features.every((f) => !f || f.trim() === "")
          ) {
            setFeatures(pd.highlightFeatures.slice(0, 4));
          }
        }

        setStatusMessage("Đã tạo xong ảnh Hero! Bấm '✨ Tạo Concept' trên ảnh để sinh tiếp 2 ảnh còn lại.");
        appendLog(
          "success",
          "System",
          "Hoàn tất Bước 1",
          "Ảnh Hero đã sẵn sàng. Bạn có thể bấm '✨ Tạo Concept' trên thẻ Phong Cách 1 để sinh nốt 2 ảnh còn lại."
        );
      }
    } catch (err: any) {
      appendLog("error", "System", "Lỗi tạo ảnh", err.message || "Có lỗi xảy ra trong quá trình tạo ảnh!");
      alert(err.message || "Có lỗi xảy ra trong quá trình tạo ảnh!");
    } finally {
      setIsGeneratingAll(false);
      setTimeout(() => setStatusMessage(""), 4000);
    }
  };

  // Generate Remaining 2 Concept Images (Style 2 & Style 3)
  const handleGenerateConcept = async () => {
    if (!currentSession || !currentSession.currentResults.style1) {
      alert("Cần tạo ảnh Hero trước khi sinh Concept!");
      return;
    }

    setIsGeneratingConcept(true);
    setIsLogConsoleExpanded(true);
    setStatusMessage("AI đang đồng bộ Concept từ ảnh Hero để sinh Lưới 2x2 & Infographic Callout...");

    appendLog(
      "info",
      "DirectorAgent",
      "Khởi tạo Tạo Concept (Bước 2)",
      `Đồng bộ phong cách từ Phong Cách 1 cho "${currentSession.productDetails.title}"`
    );

    try {
      const res = await fetch("/api/generate-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSession.id,
          dateFolder: currentSession.dateFolder,
          resolution,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.logs && Array.isArray(data.logs)) {
        setExecutionLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const newLogs = data.logs.filter((l: ProcessLogEntry) => !existingIds.has(l.id));
          return [...prev, ...newLogs];
        });
      }

      if (!res.ok || !data.success) {
        const errMsg = data.error || "Không thể tạo Concept, vui lòng kiểm tra bảng Log!";
        appendLog("error", "System", "Tạo Concept thất bại", errMsg);
        throw new Error(errMsg);
      }

      if (data.session) {
        setCurrentSession(data.session);
        fetchHistory();
        setStatusMessage("Đã hoàn tất toàn bộ bộ sưu tập Lookbook 3 ảnh đồng nhất!");
        appendLog("success", "System", "Bộ sưu tập hoàn tất", "Cả 3 ảnh thương mại đã sẵn sàng.");
      }
    } catch (err: any) {
      appendLog("error", "System", "Lỗi tạo Concept", err.message);
      alert(err.message || "Có lỗi xảy ra khi tạo Concept!");
    } finally {
      setIsGeneratingConcept(false);
      setTimeout(() => setStatusMessage(""), 4000);
    }
  };

  // Regenerate Single Card Style
  const handleRegenerateStyle = async (style: ShotStyle) => {
    if (!currentSession) return;
    setRegeneratingStyle(style);
    setIsLogConsoleExpanded(true);
    appendLog(
      "info",
      "System",
      "Yêu cầu tạo lại ảnh",
      `Đang khởi chạy tạo lại phiên bản cho phong cách: ${style} (Chuẩn ${resolution})...`
    );

    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFolder: currentSession.dateFolder,
          sessionId: currentSession.id,
          targetStyle: style,
          resolution,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.logs && Array.isArray(data.logs)) {
        setExecutionLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const newLogs = data.logs.filter((l: ProcessLogEntry) => !existingIds.has(l.id));
          return [...prev, ...newLogs];
        });
      }

      if (!res.ok || !data.success) {
        const errMsg = data.error || "Tạo lại thất bại";
        appendLog("error", "System", "Lỗi tạo lại", errMsg, JSON.stringify(data, null, 2));
        throw new Error(errMsg);
      }

      if (data.session) {
        setCurrentSession(data.session);
        fetchHistory();
        appendLog("success", "System", "Tạo lại hoàn tất", `Đã lưu phiên bản mới của ${style}.`);
      }
    } catch (err: any) {
      appendLog("error", "System", "Lỗi ngoại lệ", err.message || "Lỗi tạo lại");
      alert(err.message || "Lỗi tạo lại");
    } finally {
      setRegeneratingStyle(null);
    }
  };

  // Toggle Edit Prompt Box for a specific style
  const handleToggleEdit = (style: ShotStyle) => {
    if (editingStyle === style) {
      setEditingStyle(null);
    } else {
      setEditingStyle(style);
    }
  };

  // Open Full Interactive Region Selection Canvas (ChatGPT-style Inpainting) in Lightbox
  const handleOpenRegionEditor = (style: ShotStyle) => {
    if (!currentSession) return;
    const rec =
      style === "style1_hero"
        ? currentSession.currentResults.style1
        : style === "style2_grid2x2"
          ? currentSession.currentResults.style2
          : currentSession.currentResults.style3;
    if (rec?.imageUrl) {
      setPreviewZoomImage(rec.imageUrl);
      setLightboxEditActive(true);
    }
  };

  // Apply Prompt Edit (+ Optional Selected Region Inpainting) to a specific style
  const handleApplyEdit = async (style: ShotStyle) => {
    if (!currentSession) return;
    const promptText = (editPromptInputs[style] || "").trim();
    if (!promptText) {
      alert("Vui lòng nhập mô tả hoặc yêu cầu chỉnh sửa cho bức ảnh!");
      return;
    }

    const activeRec =
      style === "style1_hero"
        ? currentSession.currentResults.style1
        : style === "style2_grid2x2"
          ? currentSession.currentResults.style2
          : currentSession.currentResults.style3;

    const strokes = regionStrokesByStyle[style] || [];
    const editRegion = computeRegionBoxFromStrokes(strokes);
    let annotatedGuideDataUrl: string | undefined;
    if (editRegion && activeRec?.imageUrl) {
      annotatedGuideDataUrl = await generateAnnotatedGuideDataUrl(activeRec.imageUrl, strokes, editRegion);
    }

    setIsSubmittingEdit(style);
    setRegeneratingStyle(style);
    setIsLogConsoleExpanded(true);
    appendLog(
      "info",
      "System",
      "Khởi chạy AI Chỉnh sửa ảnh",
      `Phong cách: ${style} | Chất lượng: ${resolution} | ${
        editRegion
          ? `Vùng khoanh: ${editRegion.zoneLabel} (X: ${editRegion.xPercent}%–${Math.min(100, editRegion.xPercent + editRegion.widthPercent)}%, Y: ${editRegion.yPercent}%–${Math.min(100, editRegion.yPercent + editRegion.heightPercent)}%)`
          : "Phạm vi: Toàn ảnh"
      } | Yêu cầu: "${promptText}"`
    );

    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFolder: currentSession.dateFolder,
          sessionId: currentSession.id,
          targetStyle: style,
          editPrompt: promptText,
          editRegion: editRegion || undefined,
          annotatedGuideDataUrl,
          resolution,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.logs && Array.isArray(data.logs)) {
        setExecutionLogs((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const newLogs = data.logs.filter((l: ProcessLogEntry) => !existingIds.has(l.id));
          return [...prev, ...newLogs];
        });
      }

      if (!res.ok || !data.success) {
        const errMsg = data.error || "Chỉnh sửa ảnh thất bại";
        appendLog("error", "System", "Lỗi chỉnh sửa", errMsg, JSON.stringify(data, null, 2));
        alert("Lỗi chỉnh sửa ảnh: " + errMsg);
        return;
      }

      if (data.session) {
        setCurrentSession(data.session);
        fetchHistory();
        appendLog(
          "success",
          "System",
          "Chỉnh sửa ảnh thành công",
          `Đã lưu phiên bản mới của ${style} theo mô tả: "${promptText}".`
        );
        setEditingStyle(null);
        // Clear region selection strokes after applying edit
        setRegionStrokesByStyle((prev) => ({ ...prev, [style]: [] }));
        // Automatically sync updated image URL in zoom preview
        const updatedRec =
          style === "style1_hero"
            ? data.session.currentResults?.style1
            : style === "style2_grid2x2"
              ? data.session.currentResults?.style2
              : data.session.currentResults?.style3;
        if (updatedRec?.imageUrl && previewZoomImage) {
          setPreviewZoomImage(updatedRec.imageUrl);
        }
      }
    } catch (err: any) {
      console.error(err);
      appendLog("error", "System", "Lỗi kết nối chỉnh sửa", err?.message || err);
      alert("Lỗi khi gửi yêu cầu sửa ảnh: " + (err?.message || err));
    } finally {
      setIsSubmittingEdit(null);
      setRegeneratingStyle(null);
    }
  };

  // Open Windows Explorer
  const handleOpenFolder = async () => {
    try {
      const folderPath = currentSession
        ? `output_collections/${currentSession.dateFolder}/${currentSession.id}`
        : "output_collections";
      const res = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        appendLog("info", "System", "Mở thư mục ổ cứng", `Đã gửi lệnh mở thư mục: ${data.openedPath}`);
      } else {
        alert(data.error || "Không thể mở thư mục trên hệ điều hành!");
      }
    } catch (e: any) {
      console.error(e);
      alert("Lỗi khi mở thư mục: " + (e?.message || e));
    }
  };

  // Delete a single session from history
  const handleDeleteSession = async (dateFolder: string, sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc chắn muốn xóa phiên thiết kế này? Thao tác này sẽ xóa toàn bộ ảnh trong phiên khỏi ổ cứng.")) {
      return;
    }

    try {
      const res = await fetch(`/api/history?dateFolder=${encodeURIComponent(dateFolder)}&sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (currentSession?.id === sessionId) {
          setCurrentSession(null);
        }
        await fetchHistory();
        appendLog("info", "System", "Xóa phiên thành công", `Đã xóa phiên: ${sessionId}`);
      } else {
        alert(data.error || "Không thể xóa phiên thiết kế!");
      }
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi xóa phiên: " + (err?.message || err));
    }
  };

  // Delete all history sessions
  const handleClearAllHistory = async () => {
    const totalSessions = historyList.reduce((acc, d) => acc + d.sessions.length, 0);
    if (totalSessions === 0) {
      alert("Hiện tại không có lịch sử nào để xóa.");
      return;
    }

    if (!window.confirm("CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ lịch sử và tất cả ảnh đã tạo? Thao tác này sẽ dọn sạch toàn bộ dữ liệu trên ổ cứng và không thể khôi phục.")) {
      return;
    }

    try {
      const res = await fetch("/api/history", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setCurrentSession(null);
        setHistoryList([]);
        appendLog("info", "System", "Xóa toàn bộ lịch sử", data.message || "Đã xóa toàn bộ lịch sử.");
      } else {
        alert(data.error || "Không thể xóa toàn bộ lịch sử!");
      }
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi xóa lịch sử: " + (err?.message || err));
    }
  };

  const handleDownloadAll = () => {
    if (!currentSession) return;
    const { style1, style2, style3 } = currentSession.currentResults;
    [style1, style2, style3].forEach((res, i) => {
      if (res) {
        const link = document.createElement("a");
        link.href = res.imageUrl;
        link.download = `${currentSession.id}_style${i + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  };

  const activeProvider = settings?.defaultProvider || provider || "sangtao";
  const activeSupportedResolutions: ImageResolution[] =
    supportedResolutionsByProvider[activeProvider] ||
    DEFAULT_PROVIDER_RESOLUTIONS[activeProvider] ||
    ["1K"];
  const availableResolutionOptions = IMAGE_RESOLUTIONS.filter((r) =>
    activeSupportedResolutions.includes(r.id)
  );

  useEffect(() => {
    if (!activeSupportedResolutions.includes(resolution)) {
      setResolution(activeSupportedResolutions[0] || "1K");
    }
  }, [activeProvider, activeSupportedResolutions, resolution]);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* ======================================================== */}
      {/* HEADER BAR (NAVBAR)                                     */}
      {/* ======================================================== */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#090d16]/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 ring-1 ring-white/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white uppercase">Công cụ thiết kế</h1>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/20">
                PRO COMMERCIAL
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Connection Status Badge */}
          {activeProvider === "sangtao" && settings?.sangtaoApiKey && !settings?.enableMockMode ? (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Sangtao.ai: GPT Image Đã Sẵn Sàng</span>
            </div>
          ) : activeProvider === "gemini" && settings?.geminiApiKey && !settings?.enableMockMode ? (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Gemini: Đã Kết Nối</span>
            </div>
          ) : activeProvider === "openai" && settings?.openaiApiKey && !settings?.enableMockMode ? (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>OpenAI: Đã Kết Nối</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              <span>Chế độ thử nghiệm offline</span>
            </div>
          )}

          {/* Output Folder Button */}
          <button
            onClick={handleOpenFolder}
            className="h-9 px-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-slate-200 transition-colors flex items-center gap-2"
            title="Mở thư mục lưu ảnh trên máy tính"
          >
            <FolderOpen className="h-4 w-4 text-slate-400" />
            <span className="hidden md:inline">Thư Mục Ổ Cứng</span>
          </button>

          {/* History Drawer Button */}
          <button
            onClick={() => setShowHistory(true)}
            className="h-9 px-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-slate-200 transition-colors flex items-center gap-2"
          >
            <HistoryIcon className="h-4 w-4 text-slate-400" />
            <span>Lịch Sử ({historyList.reduce((acc, d) => acc + d.sessions.length, 0)})</span>
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="h-9 px-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-300 transition-colors flex items-center gap-2"
          >
            <SettingsIcon className="h-4 w-4 text-indigo-400" />
            <span className="hidden sm:inline">Cài Đặt AI</span>
          </button>
        </div>
      </header>

      {/* --- MAIN STUDIO WORKSPACE --- */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 sm:p-6 max-w-[1920px] mx-auto w-full">
        {/* ======================================================== */}
        {/* LEFT PANEL: COMPACT FIXED SIDEBAR WITH COLLAPSIBLES      */}
        {/* ======================================================== */}
        <aside className="lg:col-span-4 xl:col-span-4 lg:sticky lg:top-20 lg:h-[calc(100vh-6.5rem)] flex flex-col gap-3 pb-2">
          {/* Scrollable Container for Accordion Cards (No clipping, natural height) */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 flex flex-col gap-3 custom-scrollbar">
            {/* SECTION 1: ẢNH CHỤP SẢN PHẨM & BAO BÌ (COLLAPSIBLE) */}
            <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-[#101524]/85 shadow-lg backdrop-blur-sm overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => toggleSection("upload")}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Camera className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span>1. Ảnh Chụp Sản Phẩm</span>
                      <span className="text-rose-500">*</span>
                    </h2>
                    <p className="text-[11px] text-slate-400">Ảnh camera thật 1–3 góc</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${productPhotos.length > 0
                      ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                      : "bg-white/[0.06] text-slate-400 border-white/[0.08]"
                    }`}>
                    {productPhotos.length}/3 ảnh
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${openSections.upload ? "rotate-180" : ""
                      }`}
                  />
                </div>
              </button>

              {openSections.upload && (
                <div className="p-4 pt-0 border-t border-white/[0.04] flex flex-col gap-3">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Chụp bằng camera điện thoại. Hệ thống tự động bóc tách vật thể và giữ nguyên tem mác gốc 100%.
                  </p>

                  {/* Grid 3 slot ảnh */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {productPhotos.map((imgUrl, index) => (
                      <div
                        key={index}
                        className="relative group aspect-square rounded-xl overflow-hidden border border-white/[0.08] bg-[#090d16]"
                      >
                        <img
                          src={imgUrl}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1 left-1 rounded bg-black/75 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-mono font-medium text-slate-200">
                          Ảnh {index + 1}
                        </div>
                        <button
                          onClick={() => setProductPhotos(productPhotos.filter((_, i) => i !== index))}
                          className="absolute top-1 right-1 rounded-md bg-rose-500/30 hover:bg-rose-500 text-rose-200 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Xóa ảnh"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    {productPhotos.length < 3 && (
                      <button
                        type="button"
                        onClick={() => phonePhotoInputRef.current?.click()}
                        className="aspect-square flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.15] hover:border-indigo-500/60 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer p-2 text-center group"
                      >
                        <Upload className="h-4 w-4 text-slate-400 group-hover:text-indigo-400 transition-colors mb-1" />
                        <span className="text-[11px] font-medium text-slate-300 group-hover:text-white">
                          + Thêm Ảnh
                        </span>
                        <span className="text-[9px] text-slate-500">JPG, PNG</span>
                      </button>
                    )}
                  </div>

                  <input
                    ref={phonePhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, "photos")}
                  />
                </div>
              )}
            </div>

            {/* SECTION 2: THÔNG SỐ & NHÃN HÀNG (COLLAPSIBLE) */}
            <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-[#101524]/85 shadow-lg backdrop-blur-sm overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => toggleSection("specs")}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                      2. Nhãn Hàng & Đặc Điểm
                    </h2>
                    <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                      {title || "AI tự động phân tích nếu để trống"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {title ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      Đã điền
                    </span>
                  ) : (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5 text-indigo-400" />
                      Tự Động AI
                    </span>
                  )}
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${openSections.specs ? "rotate-180" : ""
                      }`}
                  />
                </div>
              </button>

              {openSections.specs && (
                <div className="p-4 pt-0 border-t border-white/[0.04] flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 mb-1 block">
                        Tên Sản Phẩm
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="VD: Pin sạc dự phòng... (Để trống để AI tự nhận diện)"
                        className="w-full h-9 px-3 rounded-xl border border-white/[0.12] bg-[#0c101c] text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 mb-1 block">Ngành Hàng</label>
                      <input
                        type="text"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="VD: Phụ kiện số... (Để trống để AI tự phân loại)"
                        className="w-full h-9 px-3 rounded-xl border border-white/[0.12] bg-[#0c101c] text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-300 mb-1 block">
                      Mô Tả Sản Phẩm
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Mô tả công dụng, tính năng... (Để trống để AI tự viết mô tả thương mại)"
                      className="w-full rounded-xl border border-white/[0.12] bg-[#0c101c] p-2.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 3: BỐI CẢNH STUDIO & TỶ LỆ KHUNG HÌNH (COLLAPSIBLE) */}
            <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-[#101524]/85 shadow-lg backdrop-blur-sm overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => toggleSection("concept")}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Palette className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                      3. Không Gian, Tỷ Lệ & Chất Lượng
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {conceptMode === "sample_match"
                        ? `Ảnh Mẫu • ${sampleRef ? "Đã Khóa Phong Cách" : "Chưa Chọn Ảnh"}`
                        : `${aspectRatio} • Chuẩn ${resolution} • ${colorTone === "auto" ? "Tone Tự Động (AI)" : colorTone}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {aspectRatio}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {resolution}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${openSections.concept ? "rotate-180" : ""
                      }`}
                  />
                </div>
              </button>

              {openSections.concept && (
                <div className="p-4 pt-0 border-t border-white/[0.04] flex flex-col gap-3">
                  {/* 4 Chế độ Concept */}
                  <div className="grid grid-cols-4 gap-1 bg-[#0c101c] p-1 rounded-xl border border-white/[0.08] text-[11px] font-medium text-center">
                    <button
                      type="button"
                      onClick={() => setConceptMode("preset")}
                      className={`py-1.5 px-1 rounded-lg transition-all ${conceptMode === "preset"
                          ? "bg-indigo-600 text-white shadow-sm font-semibold"
                          : "text-slate-400 hover:text-white"
                        }`}
                    >
                      Preset
                    </button>
                    <button
                      type="button"
                      onClick={() => setConceptMode("background_ref")}
                      className={`py-1.5 px-1 rounded-lg transition-all ${conceptMode === "background_ref"
                          ? "bg-indigo-600 text-white shadow-sm font-semibold"
                          : "text-slate-400 hover:text-white"
                        }`}
                    >
                      Ảnh Nền
                    </button>
                    <button
                      type="button"
                      onClick={() => setConceptMode("prompt")}
                      className={`py-1.5 px-1 rounded-lg transition-all ${conceptMode === "prompt"
                          ? "bg-indigo-600 text-white shadow-sm font-semibold"
                          : "text-slate-400 hover:text-white"
                        }`}
                    >
                      Prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => setConceptMode("sample_match")}
                      className={`py-1.5 px-1 rounded-lg transition-all ${conceptMode === "sample_match"
                          ? "bg-indigo-600 text-white shadow-sm font-semibold"
                          : "text-slate-400 hover:text-white"
                        }`}
                    >
                      Ảnh Mẫu
                    </button>
                  </div>

                  {/* Chi tiết từng chế độ */}
                  {conceptMode === "preset" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                        <span className="font-medium text-slate-300">
                          Kho Concept Sáng Tạo ({BUILT_IN_PRESETS.length} phong cách):
                        </span>
                        <span className="text-indigo-400 text-[9.5px]">Cuộn xem thêm ↓</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                        {BUILT_IN_PRESETS.map((preset) => {
                          const isSelected = selectedPresetId === preset.id;
                          return (
                            <div
                              key={preset.id}
                              onClick={() => setSelectedPresetId(preset.id)}
                              className={`p-2.5 rounded-xl border cursor-pointer transition-all text-left relative flex flex-col justify-between gap-1.5 ${
                                isSelected
                                  ? "border-indigo-500 bg-indigo-500/15 text-white ring-2 ring-indigo-500/30 shadow-md shadow-indigo-500/10"
                                  : "border-white/[0.08] bg-[#0c101c] hover:border-white/[0.18] hover:bg-[#111728]"
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className={`h-2.5 w-2.5 rounded-full bg-gradient-to-br ${preset.previewColor} flex-shrink-0 border border-white/20`}
                                    />
                                    <span className="text-[11px] font-bold text-white truncate">
                                      {preset.name}
                                    </span>
                                  </div>
                                  {isSelected && (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
                                  )}
                                </div>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 font-medium inline-block mb-1">
                                  {preset.category.split(",")[0]}
                                </span>
                                <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                                  {preset.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {conceptMode === "background_ref" && (
                    <div className="flex flex-col gap-2">
                      {backgroundRef ? (
                        <div className="relative h-24 rounded-xl overflow-hidden border border-white/[0.08]">
                          <img src={backgroundRef} alt="Background" className="w-full h-full object-cover" />
                          <button
                            onClick={() => setBackgroundRef(null)}
                            className="absolute top-1.5 right-1.5 rounded-lg bg-rose-500/30 hover:bg-rose-500 text-rose-200 p-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => bgInputRef.current?.click()}
                          className="h-20 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.15] hover:border-indigo-500/60 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer"
                        >
                          <Upload className="h-4 w-4 text-slate-400 mb-1" />
                          <span className="text-[11px] font-medium text-slate-300">Tải Lên Ảnh Nền Tham Chiếu</span>
                        </button>
                      )}
                      <input
                        ref={bgInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, "bg")}
                      />
                    </div>
                  )}

                  {conceptMode === "prompt" && (
                    <textarea
                      rows={2}
                      value={conceptPrompt}
                      onChange={(e) => setConceptPrompt(e.target.value)}
                      placeholder="VD: Bục đá travertine sáng màu, nắng ban mai xiên qua rèm..."
                      className="w-full rounded-xl border border-white/[0.12] bg-[#0c101c] p-2.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none resize-none"
                    />
                  )}

                  {conceptMode === "sample_match" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300 leading-relaxed">
                        <Sparkles className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-white block mb-0.5">Bắt Chước Thiết Kế Ảnh Mẫu:</span>
                          <span>AI sẽ phân tích chi tiết bục 3D, nguồn sáng, bóng đổ, đạo cụ và bối cảnh từ ảnh mẫu để tái tạo phong cách thiết kế tương đồng nhất cho sản phẩm của bạn.</span>
                        </div>
                      </div>

                      {sampleRef ? (
                        <div className="relative rounded-xl overflow-hidden border border-indigo-500/30 bg-[#080b14] p-2 flex flex-col gap-1.5">
                          <div className="relative h-28 rounded-lg overflow-hidden border border-white/[0.08]">
                            <img src={sampleRef} alt="Sample" className="w-full h-full object-cover" />
                            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/75 border border-indigo-500/30 text-[9px] font-medium text-indigo-300 flex items-center gap-1 backdrop-blur-sm">
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                              <span>Đã khóa phong cách ảnh mẫu</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSampleRef(null)}
                              className="absolute top-1.5 right-1.5 rounded-lg bg-rose-500/40 hover:bg-rose-500 text-rose-200 p-1 transition-colors"
                              title="Xóa ảnh mẫu"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-400 text-center">
                            AI sẽ phân tích cấu trúc nghệ thuật & bối cảnh để tạo sản phẩm tương tự.
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => sampleInputRef.current?.click()}
                          className="h-24 flex flex-col items-center justify-center rounded-xl border border-dashed border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-500/[0.03] hover:bg-indigo-500/[0.06] transition-all cursor-pointer p-3 text-center"
                        >
                          <Upload className="h-5 w-5 text-indigo-400 mb-1.5" />
                          <span className="text-xs font-semibold text-white mb-0.5">Tải Lên Ảnh Mẫu Phong Cách</span>
                          <span className="text-[10px] text-slate-400">Chọn 1 bức ảnh studio bạn muốn sao chép phong cách</span>
                        </button>
                      )}
                      <input
                        ref={sampleInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, "sample")}
                      />
                    </div>
                  )}

                  {/* Tone màu chủ đạo */}
                  <div className="rounded-xl border border-white/[0.08] bg-[#0c101c]/80 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                        <Palette className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Tone Màu Chủ Đạo</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-indigo-400 font-medium">
                        <input
                          type="checkbox"
                          checked={lockSameBackground}
                          onChange={(e) => setLockSameBackground(e.target.checked)}
                          className="rounded border-white/[0.2] bg-[#090d16] text-indigo-600 focus:ring-0 h-3 w-3"
                        />
                        <Lock className="h-3 w-3" />
                        <span>Khóa đồng nhất nền</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {COLOR_TONE_CATALOG.map((toneInfo) => {
                        const isSelected = colorTone === toneInfo.id;
                        return (
                          <button
                            key={toneInfo.id}
                            type="button"
                            onClick={() => setColorTone(toneInfo.id)}
                            className={`px-2 py-1.5 rounded-lg border text-left flex items-center gap-1.5 transition-all ${isSelected
                                ? "border-indigo-500 bg-indigo-500/15 text-white ring-1 ring-indigo-500/30 shadow-sm"
                                : "border-white/[0.08] bg-[#090d16] text-slate-400 hover:text-white hover:bg-white/[0.02]"
                              }`}
                          >
                            {toneInfo.id === "auto" ? (
                              <Sparkles className="h-3 w-3 text-indigo-400 flex-shrink-0 animate-pulse" />
                            ) : (
                              <span
                                className="h-2.5 w-2.5 rounded-full border border-white/20 flex-shrink-0"
                                style={{ backgroundColor: toneInfo.swatches[0] }}
                              />
                            )}
                            <span className="text-[10px] font-medium truncate">
                              {toneInfo.name.split("&")[0].trim()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Chọn Tỷ Lệ Khung Hình */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-300 mb-1 block">
                      Tỷ Lệ Khung Hình (Aspect Ratio)
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                      {(["1:1", "4:3", "16:9", "9:16", "3:4", "4:5"] as AspectRatio[]).map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setAspectRatio(ratio)}
                          className={`py-1.5 px-1 rounded-lg border text-xs font-semibold transition-all flex flex-col items-center ${aspectRatio === ratio
                              ? "border-indigo-500 bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20"
                              : "border-white/[0.08] bg-[#0c101c] text-slate-400 hover:text-white"
                            }`}
                        >
                          <span>{ratio}</span>
                          <span className="text-[8px] font-normal text-slate-500 truncate max-w-full">
                            {ratio === "1:1"
                              ? "Shopee"
                              : ratio === "4:3"
                                ? "Ngang"
                                : ratio === "16:9"
                                  ? "Banner"
                                  : ratio === "9:16"
                                    ? "Reels"
                                    : ratio === "3:4"
                                      ? "Dọc"
                                      : "Insta"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chọn Chất Lượng & Độ Phân Giải Hình Ảnh Theo Model Đang Áp Dụng */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-slate-300">
                        Chất Lượng Ảnh (Theo Model Đang Dùng)
                      </label>
                      <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                        Hỗ trợ: {activeSupportedResolutions.join(", ")}
                      </span>
                    </div>
                    <div
                      className={`grid gap-1.5 ${
                        availableResolutionOptions.length > 1 ? "grid-cols-2" : "grid-cols-1"
                      }`}
                    >
                      {availableResolutionOptions.map((resOpt) => {
                        const isSelected = resolution === resOpt.id;
                        return (
                          <button
                            key={resOpt.id}
                            type="button"
                            onClick={() => setResolution(resOpt.id)}
                            className={`p-2 rounded-xl border text-left transition-all flex flex-col justify-between ${
                              isSelected
                                ? "border-emerald-500 bg-emerald-500/15 text-white ring-1 ring-emerald-500/30 shadow-md shadow-emerald-500/10"
                                : "border-white/[0.08] bg-[#0c101c] text-slate-400 hover:text-white hover:border-white/[0.16]"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full mb-0.5">
                              <span className="text-xs font-bold text-white">{resOpt.label}</span>
                              <span
                                className={`text-[8px] px-1.5 py-0.2 rounded font-semibold ${
                                  isSelected
                                    ? "bg-emerald-500 text-slate-950"
                                    : "bg-white/[0.06] text-slate-400"
                                }`}
                              >
                                {availableResolutionOptions.length === 1
                                  ? "Mặc định của Model"
                                  : resOpt.badge}
                              </span>
                            </div>
                            <span className="text-[9px] text-slate-400 truncate w-full">
                              {resOpt.subLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM ACTION PANEL: PINNED AT BOTTOM (SHRINK-0) */}
          <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-[#101524]/95 p-3.5 shadow-xl backdrop-blur-sm flex flex-col gap-2.5">
            {/* Active AI Engine Quick Summary */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#080b14] border border-white/[0.08]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-slate-400">Động cơ:</span>
                <span className="text-xs font-medium text-white">
                  {activeProvider === "sangtao"
                    ? "Sangtao.ai (GPT Image)"
                    : activeProvider === "gemini"
                      ? "Google Gemini"
                      : "OpenAI"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
              >
                <SettingsIcon className="h-3 w-3" />
                <span>Cấu hình</span>
              </button>
            </div>

            {/* Main Generate Button: STEP 1 (HERO) */}
            <button
              type="button"
              disabled={isGeneratingAll || productPhotos.length === 0}
              onClick={handleGenerateAll}
              className={`h-11 w-full rounded-xl font-semibold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg ${isGeneratingAll || productPhotos.length === 0
                  ? "bg-white/[0.06] text-slate-500 border border-white/[0.06] cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-indigo-600/20 active:scale-[0.99]"
                }`}
            >
              {isGeneratingAll ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-indigo-300" />
                  <span>Đang Thiết Kế Ảnh Hero (Kiểu 1)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Tạo Ảnh Hero (Phong Cách 1)</span>
                </>
              )}
            </button>

            {statusMessage && (
              <div className="text-center text-[11px] font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 py-2 px-3 rounded-xl animate-fade-in">
                {statusMessage}
              </div>
            )}
          </div>
        </aside>

        {/* ======================================================== */}
        {/* RIGHT PANEL: COMPACT RESULTS & CONSOLE                   */}
        {/* ======================================================== */}
        <section className="lg:col-span-8 xl:col-span-8 flex flex-col gap-4 pb-6">
          {/* Header of results panel */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Layers className="h-4 w-4" />
                </div>
                <span>Bộ Sưu Tập 3 Phong Cách Thương Mại (Lookbook 3-Pack)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {currentSession
                  ? `Phiên: "${currentSession.sessionName}" • Thư mục: ${currentSession.dateFolder}`
                  : "Tự động sinh 3 phong cách đồng nhất (Bục danh giá, Lưới 2x2, Infographic Callout)"}
              </p>
            </div>

            {currentSession && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenFolder}
                  className="h-8 px-3 rounded-xl border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-300 transition-colors flex items-center gap-1.5 shadow-sm"
                  title="Mở trực tiếp thư mục chứa các ảnh của phiên này trên máy tính"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-amber-400" />
                  <span>Mở Thư Mục Ảnh</span>
                </button>
                <button
                  onClick={handleDownloadAll}
                  className="h-8 px-3 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Tải Cả 3 Ảnh</span>
                </button>
              </div>
            )}
          </div>

          {/* Grid 3 Thẻ Kết Quả Gọn Gàng */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* ---------------------------------------------------- */}
            {/* THẺ 1: PHONG CÁCH 1 - HERO SHOWCASE                  */}
            {/* ---------------------------------------------------- */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#101524]/80 p-3 flex flex-col justify-between shadow-lg backdrop-blur-sm group hover:border-white/[0.14] transition-all">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    Phong Cách 1
                  </span>
                  {currentSession?.currentResults.style1 && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 border border-white/[0.08]">
                      v{currentSession.currentResults.style1.version}
                    </span>
                  )}
                </div>
                <h3 className="text-xs font-bold text-white mb-0.5">Hero Showcase</h3>
                <p className="text-[10px] text-slate-400 mb-2 truncate">
                  Bục danh giá, ánh sáng studio sang trọng
                </p>

                {/* Khung ảnh gọn gàng & Click để phóng to */}
                <div
                  onClick={() => {
                    if (currentSession?.currentResults.style1 && !isGeneratingAll && regeneratingStyle !== "style1_hero") {
                      setPreviewZoomImage(currentSession.currentResults.style1.imageUrl);
                    }
                  }}
                  className="relative aspect-square rounded-xl overflow-hidden bg-[#080b14] border border-white/[0.08] flex items-center justify-center cursor-pointer group"
                >
                  {isGeneratingAll || regeneratingStyle === "style1_hero" ? (
                    <div className="absolute inset-0 bg-[#090d16] flex flex-col items-center justify-center p-3 text-center overflow-hidden">
                      {/* Animated Shimmer Background */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-indigo-500/10 to-transparent animate-pulse" />

                      {/* Pulsing Podium Icon */}
                      <div className="relative mb-2.5 flex items-center justify-center">
                        <div className="absolute h-14 w-14 rounded-full bg-amber-500/20 animate-ping" />
                        <div className="h-11 w-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10 z-10">
                          <Sparkles className="h-5 w-5 text-amber-400 animate-spin" />
                        </div>
                      </div>

                      <span className="text-xs font-bold text-white mb-0.5 relative z-10 flex items-center gap-1.5">
                        <span>Đang Thiết Kế Hero</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                      </span>
                      <span className="text-[10px] text-slate-400 max-w-[170px] leading-tight relative z-10">
                        Dựng bục podium danh giá, đổ bóng tiếp xúc & phủ ánh sáng studio...
                      </span>

                      {/* Skeleton mockup bar */}
                      <div className="w-full mt-3 flex flex-col gap-1 max-w-[140px] opacity-40">
                        <div className="h-1.5 w-full rounded bg-white/20 animate-pulse" />
                        <div className="h-1.5 w-2/3 rounded bg-white/20 animate-pulse mx-auto" />
                      </div>
                    </div>
                  ) : currentSession?.currentResults.style1 ? (
                    <>
                      <img
                        src={currentSession.currentResults.style1.imageUrl}
                        alt="Style 1"
                        className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black/90 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-sm shadow-md">
                          <ZoomIn className="h-3.5 w-3.5" />
                          <span>Phóng to</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleEdit("style1_hero");
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-sm shadow-md transition-colors"
                          title="Chỉnh sửa chi tiết bức ảnh này"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Sửa ảnh</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-600 p-3 text-center">
                      <Sparkles className="h-6 w-6 mb-1 opacity-30" />
                      <span className="text-[11px] text-slate-500">Chờ tạo ảnh Hero</span>
                    </div>
                  )}
                </div>

                {/* Nút Tạo Concept (Bước 2) - Nổi bật trên Thẻ 1 */}
                {currentSession?.currentResults.style1 && !isGeneratingAll && regeneratingStyle !== "style1_hero" && (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      disabled={isGeneratingConcept}
                      onClick={handleGenerateConcept}
                      className={`w-full py-2 px-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-md ${isGeneratingConcept
                          ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 cursor-not-allowed"
                          : "bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white shadow-indigo-600/25 active:scale-[0.99] border border-indigo-400/30"
                        }`}
                    >
                      {isGeneratingConcept ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-200" />
                          <span>Đang Sinh 2 Ảnh Còn Lại...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 text-amber-300 animate-pulse" />
                          <span>
                            {currentSession.currentResults.style2 && currentSession.currentResults.style3
                              ? "✨ Tái Sinh Concept (Sinh 2 Ảnh)"
                              : "✨ Tạo Concept (Sinh 2 Ảnh Còn Lại)"}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                {/* Ô nhập prompt chỉnh sửa ảnh (Style 1) */}
                {editingStyle === "style1_hero" && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-[#090d16] border border-indigo-500/30 shadow-lg space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-300">
                        <Pencil className="h-3 w-3 text-indigo-400" />
                        <span>Chỉnh Sửa Bằng Prompt (AI)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenRegionEditor("style1_hero")}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-1"
                          title="Mở trình khoanh vùng trực tiếp trên ảnh như ChatGPT"
                        >
                          <span>🎯 Khoanh vùng trên ảnh</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingStyle(null)}
                          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const activeBox = computeRegionBoxFromStrokes(regionStrokesByStyle.style1_hero || []);
                      if (!activeBox) return null;
                      return (
                        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-[10px] text-cyan-300">
                          <span className="truncate">
                            🎯 Đã khoanh vùng: <strong>{activeBox.zoneLabel}</strong> ({activeBox.widthPercent}%×{activeBox.heightPercent}%)
                          </span>
                          <button
                            type="button"
                            onClick={() => setRegionStrokesByStyle((prev) => ({ ...prev, style1_hero: [] }))}
                            className="text-[9px] text-rose-300 hover:text-rose-200 underline ml-2 shrink-0"
                          >
                            Xóa vùng
                          </button>
                        </div>
                      );
                    })()}

                    <div className="relative">
                      <textarea
                        value={editPromptInputs.style1_hero}
                        onChange={(e) =>
                          setEditPromptInputs((prev) => ({ ...prev, style1_hero: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleApplyEdit("style1_hero");
                          }
                        }}
                        placeholder="Nhập yêu cầu sửa... (VD: Đổi mặt bàn sang đá marble đen, thêm giọt nước đọng, ánh sáng vàng ấm...)"
                        rows={2}
                        className="w-full px-2.5 py-2 text-xs rounded-lg bg-[#101524] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition-all"
                        autoFocus
                      />
                    </div>

                    {/* Gợi ý chỉnh sửa theo nhóm */}
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {EDIT_PROMPT_CATEGORIES.map((cat, cIdx) => (
                        <div key={cIdx}>
                          <span className="text-[9px] font-semibold text-indigo-300 flex items-center gap-1 mb-0.5">
                            <span>{cat.badge}</span>
                            <span>{cat.title}:</span>
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {cat.items.map((sug, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() =>
                                  setEditPromptInputs((prev) => ({
                                    ...prev,
                                    style1_hero: prev.style1_hero ? `${prev.style1_hero}, ${sug}` : sug,
                                  }))
                                }
                                className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-indigo-500/20 hover:text-indigo-200 text-slate-300 border border-white/[0.06] transition-colors"
                              >
                                + {sug}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Nút thao tác trong form sửa */}
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setEditingStyle(null)}
                        className="px-2 py-1 rounded-lg text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingEdit === "style1_hero" || !editPromptInputs.style1_hero?.trim()}
                        onClick={() => handleApplyEdit("style1_hero")}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isSubmittingEdit === "style1_hero" ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin text-white" />
                            <span>Đang Sửa...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3 text-amber-300" />
                            <span>Áp Dụng</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Nút thao tác dưới thẻ */}
              <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-1.5">
                <button
                  disabled={!currentSession || Boolean(regeneratingStyle)}
                  onClick={() => handleRegenerateStyle("style1_hero")}
                  className="h-8 flex-1 flex items-center justify-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-semibold text-slate-200 transition-colors disabled:opacity-50"
                  title="Tạo lại ảnh theo thông số ban đầu"
                >
                  <RefreshCw className="h-3 w-3 text-slate-400" />
                  <span>Tạo Lại</span>
                </button>

                {currentSession?.currentResults.style1 && (
                  <button
                    type="button"
                    disabled={Boolean(regeneratingStyle) || isGeneratingAll}
                    onClick={() => handleToggleEdit("style1_hero")}
                    className={`h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-xl border text-[11px] font-semibold transition-all ${editingStyle === "style1_hero"
                        ? "border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300"
                      } disabled:opacity-40`}
                    title="Chỉnh sửa chi tiết bức ảnh này bằng câu lệnh prompt"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Sửa Ảnh</span>
                  </button>
                )}

                {currentSession?.currentResults.style1 && (
                  <a
                    href={currentSession.currentResults.style1.imageUrl}
                    download={`style1_${currentSession.id}.png`}
                    className="h-8 w-8 flex items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 transition-colors"
                    title="Tải ảnh về máy"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* ---------------------------------------------------- */}
            {/* THẺ 2: PHONG CÁCH 2 - ẢNH 2X2 ĐA GÓC ĐỘ              */}
            {/* ---------------------------------------------------- */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#101524]/80 p-3 flex flex-col justify-between shadow-lg backdrop-blur-sm group hover:border-white/[0.14] transition-all">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
                    Phong Cách 2
                  </span>
                  {currentSession?.currentResults.style2 && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 border border-white/[0.08]">
                      v{currentSession.currentResults.style2.version}
                    </span>
                  )}
                </div>
                <h3 className="text-xs font-bold text-white mb-0.5">Lưới 2x2 Đa Góc Độ</h3>
                <p className="text-[10px] text-slate-400 mb-2 truncate">
                  Trước, Nghiêng 45°, Hông và Cận cảnh
                </p>

                {/* Khung ảnh gọn gàng & Click để phóng to */}
                <div
                  onClick={() => {
                    if (currentSession?.currentResults.style2 && !isGeneratingConcept && regeneratingStyle !== "style2_grid2x2") {
                      setPreviewZoomImage(currentSession.currentResults.style2.imageUrl);
                    }
                  }}
                  className="relative aspect-square rounded-xl overflow-hidden bg-[#080b14] border border-white/[0.08] flex items-center justify-center cursor-pointer group"
                >
                  {isGeneratingConcept || regeneratingStyle === "style2_grid2x2" ? (
                    <div className="absolute inset-0 bg-[#090d16] flex flex-col items-center justify-center p-3 text-center overflow-hidden">
                      {/* Animated Shimmer Background */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-sky-500/10 via-indigo-500/10 to-transparent animate-pulse" />

                      {/* 4 Quadrants Skeleton Grid */}
                      <div className="grid grid-cols-2 gap-1.5 w-20 h-20 mb-2 relative z-10">
                        <div className="rounded-lg bg-sky-500/15 border border-sky-500/25 flex items-center justify-center animate-pulse">
                          <span className="text-[8px] font-mono text-sky-300 font-semibold">Front</span>
                        </div>
                        <div className="rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center animate-pulse delay-75">
                          <span className="text-[8px] font-mono text-sky-300 font-semibold">45°</span>
                        </div>
                        <div className="rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center animate-pulse delay-150">
                          <span className="text-[8px] font-mono text-sky-300 font-semibold">Side</span>
                        </div>
                        <div className="rounded-lg bg-sky-500/25 border border-sky-500/35 flex items-center justify-center animate-pulse delay-200">
                          <span className="text-[8px] font-mono text-sky-300 font-semibold">Macro</span>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-white mb-0.5 relative z-10 flex items-center gap-1.5">
                        <span>Đang Dựng Lưới 2x2</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                      </span>
                      <span className="text-[10px] text-slate-400 max-w-[170px] leading-tight relative z-10">
                        Ghép 4 góc chụp cận cảnh & đồng nhất bối cảnh lookbook...
                      </span>
                    </div>
                  ) : currentSession?.currentResults.style2 ? (
                    <>
                      <img
                        src={currentSession.currentResults.style2.imageUrl}
                        alt="Style 2"
                        className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black/90 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-sm shadow-md">
                          <ZoomIn className="h-3.5 w-3.5" />
                          <span>Phóng to</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleEdit("style2_grid2x2");
                          }}
                          className="px-2.5 py-1 rounded-lg bg-sky-600/90 hover:bg-sky-600 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-sm shadow-md transition-colors"
                          title="Chỉnh sửa chi tiết bức ảnh này"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Sửa ảnh</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 p-3 text-center">
                      <Grid2X2 className="h-6 w-6 mb-1.5 opacity-30 text-sky-400" />
                      <span className="text-[11px] font-medium text-slate-300 mb-0.5">
                        {currentSession?.currentResults.style1 ? "Chờ Tạo Concept" : "Chờ Tạo Ảnh Hero"}
                      </span>
                      <span className="text-[9px] text-slate-500 max-w-[150px] leading-tight mb-2">
                        {currentSession?.currentResults.style1
                          ? "Bấm 'Tạo Concept' ở Kiểu 1 để đồng bộ ảnh 2x2"
                          : "Tạo ảnh Hero ở Bước 1 trước"}
                      </span>
                      {currentSession?.currentResults.style1 && !isGeneratingConcept && (
                        <button
                          type="button"
                          onClick={handleGenerateConcept}
                          className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 text-[10px] font-medium transition-colors flex items-center gap-1"
                        >
                          <Sparkles className="h-3 w-3 text-sky-400" />
                          <span>Tạo Concept</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* Ô nhập prompt chỉnh sửa ảnh (Style 2) */}
                {editingStyle === "style2_grid2x2" && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-[#090d16] border border-sky-500/30 shadow-lg space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-300">
                        <Pencil className="h-3 w-3 text-sky-400" />
                        <span>Chỉnh Sửa Bằng Prompt (AI)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenRegionEditor("style2_grid2x2")}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-1"
                          title="Mở trình khoanh vùng trực tiếp trên ảnh như ChatGPT"
                        >
                          <span>🎯 Khoanh vùng trên ảnh</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingStyle(null)}
                          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const activeBox = computeRegionBoxFromStrokes(regionStrokesByStyle.style2_grid2x2 || []);
                      if (!activeBox) return null;
                      return (
                        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-[10px] text-cyan-300">
                          <span className="truncate">
                            🎯 Đã khoanh vùng: <strong>{activeBox.zoneLabel}</strong> ({activeBox.widthPercent}%×{activeBox.heightPercent}%)
                          </span>
                          <button
                            type="button"
                            onClick={() => setRegionStrokesByStyle((prev) => ({ ...prev, style2_grid2x2: [] }))}
                            className="text-[9px] text-rose-300 hover:text-rose-200 underline ml-2 shrink-0"
                          >
                            Xóa vùng
                          </button>
                        </div>
                      );
                    })()}

                    <div className="relative">
                      <textarea
                        value={editPromptInputs.style2_grid2x2}
                        onChange={(e) =>
                          setEditPromptInputs((prev) => ({ ...prev, style2_grid2x2: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleApplyEdit("style2_grid2x2");
                          }
                        }}
                        placeholder="Nhập yêu cầu sửa... (VD: Đổi nền 4 ô sang bục gỗ sồi, làm nổi bật chi tiết chất liệu, thêm ánh sáng viền...)"
                        rows={2}
                        className="w-full px-2.5 py-2 text-xs rounded-lg bg-[#101524] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-none transition-all"
                        autoFocus
                      />
                    </div>

                    {/* Gợi ý chỉnh sửa theo nhóm */}
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {EDIT_PROMPT_CATEGORIES.map((cat, cIdx) => (
                        <div key={cIdx}>
                          <span className="text-[9px] font-semibold text-sky-300 flex items-center gap-1 mb-0.5">
                            <span>{cat.badge}</span>
                            <span>{cat.title}:</span>
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {cat.items.map((sug, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() =>
                                  setEditPromptInputs((prev) => ({
                                    ...prev,
                                    style2_grid2x2: prev.style2_grid2x2 ? `${prev.style2_grid2x2}, ${sug}` : sug,
                                  }))
                                }
                                className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-sky-500/20 hover:text-sky-200 text-slate-300 border border-white/[0.06] transition-colors"
                              >
                                + {sug}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Nút thao tác trong form sửa */}
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setEditingStyle(null)}
                        className="px-2 py-1 rounded-lg text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingEdit === "style2_grid2x2" || !editPromptInputs.style2_grid2x2?.trim()}
                        onClick={() => handleApplyEdit("style2_grid2x2")}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-all shadow-md shadow-sky-600/30 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isSubmittingEdit === "style2_grid2x2" ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin text-white" />
                            <span>Đang Sửa...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3 text-amber-300" />
                            <span>Áp Dụng</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Nút thao tác dưới thẻ */}
              <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-1.5">
                <button
                  disabled={!currentSession || Boolean(regeneratingStyle)}
                  onClick={() => handleRegenerateStyle("style2_grid2x2")}
                  className="h-8 flex-1 flex items-center justify-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-semibold text-slate-200 transition-colors disabled:opacity-50"
                  title="Tạo lại ảnh theo thông số ban đầu"
                >
                  <RefreshCw className="h-3 w-3 text-slate-400" />
                  <span>Tạo Lại</span>
                </button>

                {currentSession?.currentResults.style2 && (
                  <button
                    type="button"
                    disabled={Boolean(regeneratingStyle) || isGeneratingConcept}
                    onClick={() => handleToggleEdit("style2_grid2x2")}
                    className={`h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-xl border text-[11px] font-semibold transition-all ${editingStyle === "style2_grid2x2"
                        ? "border-sky-500 bg-sky-600 text-white shadow-md shadow-sky-600/30"
                        : "border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300"
                      } disabled:opacity-40`}
                    title="Chỉnh sửa chi tiết bức ảnh này bằng câu lệnh prompt"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Sửa Ảnh</span>
                  </button>
                )}

                {currentSession?.currentResults.style2 && (
                  <a
                    href={currentSession.currentResults.style2.imageUrl}
                    download={`style2_${currentSession.id}.png`}
                    className="h-8 w-8 flex items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 transition-colors"
                    title="Tải ảnh về máy"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* ---------------------------------------------------- */}
            {/* THẺ 3: PHONG CÁCH 3 - INFOGRAPHIC CALLOUT             */}
            {/* ---------------------------------------------------- */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#101524]/80 p-3 flex flex-col justify-between shadow-lg backdrop-blur-sm group hover:border-white/[0.14] transition-all">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Phong Cách 3
                  </span>
                  {currentSession?.currentResults.style3 && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 border border-white/[0.08]">
                      v{currentSession.currentResults.style3.version}
                    </span>
                  )}
                </div>
                <h3 className="text-xs font-bold text-white mb-0.5">Infographic Callout</h3>
                <p className="text-[10px] text-slate-400 mb-2 truncate">
                  Đường line chỉ dẫn & Typography công năng
                </p>

                {/* Khung ảnh gọn gàng & Click để phóng to */}
                <div
                  onClick={() => {
                    if (currentSession?.currentResults.style3 && !isGeneratingConcept && regeneratingStyle !== "style3_callout") {
                      setPreviewZoomImage(currentSession.currentResults.style3.imageUrl);
                    }
                  }}
                  className="relative aspect-square rounded-xl overflow-hidden bg-[#080b14] border border-white/[0.08] flex items-center justify-center cursor-pointer group"
                >
                  {isGeneratingConcept || regeneratingStyle === "style3_callout" ? (
                    <div className="absolute inset-0 bg-[#090d16] flex flex-col items-center justify-center p-3 text-center overflow-hidden">
                      {/* Animated Shimmer Background */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 via-indigo-500/10 to-transparent animate-pulse" />

                      {/* Animated Callout Mockup */}
                      <div className="relative w-24 h-16 mb-2 flex items-center justify-center">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                          <SlidersHorizontal className="h-4 w-4 text-emerald-400 animate-pulse" />
                        </div>
                        {/* Animated Callout pointers */}
                        <span className="absolute top-0 right-0 flex items-center gap-1 text-[7px] font-mono text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-1 py-0.5 rounded animate-pulse">
                          <span className="h-1 w-1 rounded-full bg-emerald-400" />
                          Feature
                        </span>
                        <span className="absolute bottom-0 left-0 flex items-center gap-1 text-[7px] font-mono text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-1 py-0.5 rounded animate-pulse delay-100">
                          <span className="h-1 w-1 rounded-full bg-emerald-400" />
                          Detail
                        </span>
                      </div>

                      <span className="text-xs font-bold text-white mb-0.5 relative z-10 flex items-center gap-1.5">
                        <span>Đang Thiết Kế Infographic</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      </span>
                      <span className="text-[10px] text-slate-400 max-w-[170px] leading-tight relative z-10">
                        Vẽ đường line chỉ dẫn L-callout & typography thương mại...
                      </span>

                      <div className="w-full mt-3 flex flex-col gap-1 max-w-[140px] opacity-40">
                        <div className="h-1.5 w-3/4 rounded bg-white/20 animate-pulse mx-auto" />
                      </div>
                    </div>
                  ) : currentSession?.currentResults.style3 ? (
                    <>
                      <img
                        src={currentSession.currentResults.style3.imageUrl}
                        alt="Style 3"
                        className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black/90 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-sm shadow-md">
                          <ZoomIn className="h-3.5 w-3.5" />
                          <span>Phóng to</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleEdit("style3_callout");
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-sm shadow-md transition-colors"
                          title="Chỉnh sửa chi tiết bức ảnh này"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Sửa ảnh</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 p-3 text-center">
                      <SlidersHorizontal className="h-6 w-6 mb-1.5 opacity-30 text-emerald-400" />
                      <span className="text-[11px] font-medium text-slate-300 mb-0.5">
                        {currentSession?.currentResults.style1 ? "Chờ Tạo Concept" : "Chờ Tạo Ảnh Hero"}
                      </span>
                      <span className="text-[9px] text-slate-500 max-w-[150px] leading-tight mb-2">
                        {currentSession?.currentResults.style1
                          ? "Bấm 'Tạo Concept' ở Kiểu 1 để đồng bộ Infographic"
                          : "Tạo ảnh Hero ở Bước 1 trước"}
                      </span>
                      {currentSession?.currentResults.style1 && !isGeneratingConcept && (
                        <button
                          type="button"
                          onClick={handleGenerateConcept}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[10px] font-medium transition-colors flex items-center gap-1"
                        >
                          <Sparkles className="h-3 w-3 text-emerald-400" />
                          <span>Tạo Concept</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* Ô nhập prompt chỉnh sửa ảnh (Style 3) */}
                {editingStyle === "style3_callout" && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-[#090d16] border border-emerald-500/30 shadow-lg space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
                        <Pencil className="h-3 w-3 text-emerald-400" />
                        <span>Chỉnh Sửa Bằng Prompt (AI)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenRegionEditor("style3_callout")}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-1"
                          title="Mở trình khoanh vùng trực tiếp trên ảnh như ChatGPT"
                        >
                          <span>🎯 Khoanh vùng trên ảnh</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingStyle(null)}
                          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const activeBox = computeRegionBoxFromStrokes(regionStrokesByStyle.style3_callout || []);
                      if (!activeBox) return null;
                      return (
                        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-[10px] text-cyan-300">
                          <span className="truncate">
                            🎯 Đã khoanh vùng: <strong>{activeBox.zoneLabel}</strong> ({activeBox.widthPercent}%×{activeBox.heightPercent}%)
                          </span>
                          <button
                            type="button"
                            onClick={() => setRegionStrokesByStyle((prev) => ({ ...prev, style3_callout: [] }))}
                            className="text-[9px] text-rose-300 hover:text-rose-200 underline ml-2 shrink-0"
                          >
                            Xóa vùng
                          </button>
                        </div>
                      );
                    })()}

                    <div className="relative">
                      <textarea
                        value={editPromptInputs.style3_callout}
                        onChange={(e) =>
                          setEditPromptInputs((prev) => ({ ...prev, style3_callout: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleApplyEdit("style3_callout");
                          }
                        }}
                        placeholder="Nhập yêu cầu sửa... (VD: Đổi font chữ kỹ thuật sang neon xanh ngọc, thêm icon cổng sạc, đổi nền sang phong cách công nghệ cao...)"
                        rows={2}
                        className="w-full px-2.5 py-2 text-xs rounded-lg bg-[#101524] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none transition-all"
                        autoFocus
                      />
                    </div>

                    {/* Gợi ý chỉnh sửa theo nhóm */}
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {EDIT_PROMPT_CATEGORIES.map((cat, cIdx) => (
                        <div key={cIdx}>
                          <span className="text-[9px] font-semibold text-emerald-300 flex items-center gap-1 mb-0.5">
                            <span>{cat.badge}</span>
                            <span>{cat.title}:</span>
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {cat.items.map((sug, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() =>
                                  setEditPromptInputs((prev) => ({
                                    ...prev,
                                    style3_callout: prev.style3_callout ? `${prev.style3_callout}, ${sug}` : sug,
                                  }))
                                }
                                className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-emerald-500/20 hover:text-emerald-200 text-slate-300 border border-white/[0.06] transition-colors"
                              >
                                + {sug}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Nút thao tác trong form sửa */}
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setEditingStyle(null)}
                        className="px-2 py-1 rounded-lg text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingEdit === "style3_callout" || !editPromptInputs.style3_callout?.trim()}
                        onClick={() => handleApplyEdit("style3_callout")}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/30 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isSubmittingEdit === "style3_callout" ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin text-white" />
                            <span>Đang Sửa...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3 text-amber-300" />
                            <span>Áp Dụng</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Nút thao tác dưới thẻ */}
              <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-1.5">
                <button
                  disabled={!currentSession || Boolean(regeneratingStyle)}
                  onClick={() => handleRegenerateStyle("style3_callout")}
                  className="h-8 flex-1 flex items-center justify-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-semibold text-slate-200 transition-colors disabled:opacity-50"
                  title="Tạo lại ảnh theo thông số ban đầu"
                >
                  <RefreshCw className="h-3 w-3 text-slate-400" />
                  <span>Tạo Lại</span>
                </button>

                {currentSession?.currentResults.style3 && (
                  <button
                    type="button"
                    disabled={Boolean(regeneratingStyle) || isGeneratingConcept}
                    onClick={() => handleToggleEdit("style3_callout")}
                    className={`h-8 px-2.5 flex items-center justify-center gap-1.5 rounded-xl border text-[11px] font-semibold transition-all ${editingStyle === "style3_callout"
                        ? "border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                        : "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300"
                      } disabled:opacity-40`}
                    title="Chỉnh sửa chi tiết bức ảnh này bằng câu lệnh prompt"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Sửa Ảnh</span>
                  </button>
                )}

                {currentSession?.currentResults.style3 && (
                  <a
                    href={currentSession.currentResults.style3.imageUrl}
                    download={`style3_${currentSession.id}.png`}
                    className="h-8 w-8 flex items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 transition-colors"
                    title="Tải ảnh về máy"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Dải Lịch Sử Phiên Bản Trong Session Này (Version Timeline) */}
          {currentSession && currentSession.history.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#101524]/80 p-3.5 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <HistoryIcon className="h-3 w-3" />
                  </div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Lịch Sử Các Bản Tạo Của Phiên Này
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {currentSession.history.length} phiên bản đã lưu
                </span>
              </div>

              <div className="flex gap-2.5 overflow-x-auto pb-1.5 custom-scrollbar">
                {currentSession.history.map((record, idx) => {
                  const isActive =
                    (record.style === "style1_hero" && currentSession.currentResults.style1?.id === record.id) ||
                    (record.style === "style2_grid2x2" && currentSession.currentResults.style2?.id === record.id) ||
                    (record.style === "style3_callout" && currentSession.currentResults.style3?.id === record.id);

                  return (
                    <div
                      key={record.id || idx}
                      onClick={() => {
                        const updated = { ...currentSession };
                        if (record.style === "style1_hero") updated.currentResults.style1 = record;
                        if (record.style === "style2_grid2x2") updated.currentResults.style2 = record;
                        if (record.style === "style3_callout") updated.currentResults.style3 = record;
                        setCurrentSession(updated);
                      }}
                      className={`flex-shrink-0 w-24 rounded-xl p-1.5 flex flex-col gap-1.5 cursor-pointer transition-all ${isActive
                          ? "border-2 border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20"
                          : "border border-white/[0.08] bg-[#090d16] hover:border-indigo-400/50 hover:bg-white/[0.04]"
                        }`}
                      title={`Bấm để hiển thị bản ${record.style === "style1_hero"
                          ? "Hero"
                          : record.style === "style2_grid2x2"
                            ? "2x2 Grid"
                            : "Callout"
                        } v${record.version}`}
                    >
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-black/40">
                        <img
                          src={record.imageUrl}
                          alt={`ver ${record.version}`}
                          className="w-full h-full object-cover transition-transform duration-200 hover:scale-105"
                        />
                        <span className="absolute top-1 left-1 bg-black/80 backdrop-blur-sm rounded px-1 text-[8px] font-mono font-medium text-slate-200 border border-white/10">
                          v{record.version}
                        </span>
                        {isActive && (
                          <span className="absolute bottom-1 right-1 bg-indigo-600 text-white rounded px-1 text-[8px] font-semibold flex items-center gap-0.5 shadow">
                            <Check className="h-2 w-2" />
                            <span>Đang chọn</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-0.5">
                        <span className="text-[10px] font-semibold text-slate-300 truncate">
                          {record.style === "style1_hero"
                            ? "Hero"
                            : record.style === "style2_grid2x2"
                              ? "2x2 Grid"
                              : "Callout"}
                        </span>
                        <span
                          className={`text-[9px] font-mono ${isActive ? "text-indigo-400 font-bold" : "text-slate-500"
                            }`}
                        >
                          v{record.version}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* BẢNG TIẾN TRÌNH THỰC THI & LIVE SYSTEM LOGS (CONSOLE)     */}
          {/* ======================================================== */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#101524]/80 shadow-xl backdrop-blur-md overflow-hidden transition-all">
            {/* Header bar */}
            <div className="px-4 py-3 bg-[#0c101c]/90 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Terminal className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Tiến Trình Thực Thi & Live System Logs
                    </h3>
                    {isGeneratingAll || Boolean(regeneratingStyle) ? (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                        <span>Đang xử lý</span>
                      </span>
                    ) : executionLogs.some((l) => l.level === "error") ? (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20 animate-pulse">
                        <AlertCircle className="h-2.5 w-2.5" />
                        <span>Phát hiện lỗi</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Sẵn sàng</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Theo dõi chi tiết Analyzer, Art Director, AI Engines & Compositor
                  </p>
                </div>
              </div>

              {/* Action Controls & Filter */}
              <div className="flex items-center gap-1.5">
                {/* Filter Pills */}
                <div className="hidden sm:flex items-center gap-1 bg-[#090d16] p-1 rounded-xl border border-white/[0.08] text-[10px] font-medium">
                  <button
                    onClick={() => setLogFilter("all")}
                    className={`px-2 py-1 rounded-lg transition-colors ${logFilter === "all" ? "bg-white/[0.08] text-white font-semibold" : "text-slate-400 hover:text-white"
                      }`}
                  >
                    Tất cả ({executionLogs.length})
                  </button>
                  <button
                    onClick={() => setLogFilter("error")}
                    className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${logFilter === "error"
                        ? "bg-rose-500/20 text-rose-300 font-semibold"
                        : "text-slate-400 hover:text-rose-300"
                      }`}
                  >
                    Lỗi ({executionLogs.filter((l) => l.level === "error").length})
                  </button>
                  <button
                    onClick={() => setLogFilter("warning")}
                    className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${logFilter === "warning"
                        ? "bg-amber-500/20 text-amber-300 font-semibold"
                        : "text-slate-400 hover:text-amber-300"
                      }`}
                  >
                    Cảnh báo ({executionLogs.filter((l) => l.level === "warning").length})
                  </button>
                  <button
                    onClick={() => setLogFilter("success")}
                    className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${logFilter === "success"
                        ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                        : "text-slate-400 hover:text-emerald-300"
                      }`}
                  >
                    Thành công ({executionLogs.filter((l) => l.level === "success").length})
                  </button>
                </div>

                {/* Copy logs */}
                <button
                  onClick={handleCopyLogs}
                  className="h-8 px-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                  title="Sao chép toàn bộ nhật ký"
                >
                  {isCopiedLog ? (
                    <>
                      <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-[11px] text-emerald-400">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-[11px]">Chép</span>
                    </>
                  )}
                </button>

                {/* Clear logs */}
                <button
                  onClick={() =>
                    setExecutionLogs([
                      {
                        id: `clear_${Date.now()}`,
                        timestamp: new Date().toLocaleTimeString("vi-VN", { hour12: false }),
                        level: "info",
                        agent: "System",
                        stepName: "Làm mới nhật ký",
                        message: "Bảng log đã được dọn sạch.",
                      },
                    ])
                  }
                  className="h-8 w-8 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-400 hover:text-white transition-colors flex items-center justify-center"
                  title="Xóa nhật ký"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                {/* Toggle Collapse */}
                <button
                  onClick={() => setIsLogConsoleExpanded(!isLogConsoleExpanded)}
                  className="h-8 w-8 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 transition-colors flex items-center justify-center"
                  title={isLogConsoleExpanded ? "Thu gọn bảng log" : "Mở rộng bảng log"}
                >
                  {isLogConsoleExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Log Body */}
            {isLogConsoleExpanded && (
              <div
                ref={logsContainerRef}
                className="max-h-64 overflow-y-auto p-3 font-mono text-xs flex flex-col gap-1.5 bg-[#090d16]/95 divide-y divide-white/[0.04]"
              >
                {executionLogs
                  .filter((l) => (logFilter === "all" ? true : l.level === logFilter))
                  .map((log) => {
                    const isError = log.level === "error";
                    const isWarning = log.level === "warning";
                    const isSuccess = log.level === "success";

                    let agentColor = "bg-white/[0.05] text-slate-300 border-white/[0.1]";
                    if (log.agent === "SangtaoAI")
                      agentColor = "bg-pink-500/10 text-pink-300 border-pink-500/20";
                    else if (log.agent === "AnalyzerAgent")
                      agentColor = "bg-sky-500/10 text-sky-300 border-sky-500/20";
                    else if (log.agent === "DirectorAgent")
                      agentColor = "bg-purple-500/10 text-purple-300 border-purple-500/20";
                    else if (log.agent === "Compositor")
                      agentColor = "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
                    else if (log.agent === "CriticAgent")
                      agentColor = "bg-rose-500/10 text-rose-300 border-rose-500/20";
                    else if (log.agent === "Orchestrator")
                      agentColor = "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";

                    return (
                      <div
                        key={log.id}
                        className={`pt-1.5 first:pt-0 flex flex-col gap-1 rounded-lg p-2 transition ${isError
                            ? "bg-rose-500/10 border border-rose-500/20"
                            : isWarning
                              ? "bg-amber-500/10 border border-amber-500/20"
                              : "hover:bg-white/[0.02]"
                          }`}
                      >
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="text-[11px] text-slate-500 font-mono flex-shrink-0 tabular-nums">
                            {log.timestamp}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${agentColor} flex-shrink-0`}
                          >
                            [{log.agent}]
                          </span>
                          {isError ? (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex-shrink-0">
                              <AlertCircle className="h-3 w-3" />
                              <span>LỖI</span>
                            </span>
                          ) : isWarning ? (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0">
                              <AlertCircle className="h-3 w-3" />
                              <span>CẢNH BÁO</span>
                            </span>
                          ) : isSuccess ? (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                              <Check className="h-3 w-3" />
                              <span>THÀNH CÔNG</span>
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.05] text-slate-400 border border-white/[0.08] flex-shrink-0">
                              THÔNG TIN
                            </span>
                          )}
                          <span className="text-slate-300 font-medium text-xs">{log.stepName}:</span>
                          <span className="text-slate-100 text-xs flex-1 break-words">{log.message}</span>
                        </div>
                        {log.details && (
                          <div className="pl-6 pt-1 text-[11px] text-slate-400 bg-black/40 rounded p-2 mt-0.5 whitespace-pre-wrap font-mono border border-white/[0.04]">
                            {log.details}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ======================================================== */}
      {/* DRAWER: LỊCH SỬ TẤT CẢ CÁC NGÀY (SIDE DRAWER)            */}
      {/* ======================================================== */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0c101c] border-l border-white/[0.08] h-full flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <HistoryIcon className="h-4 w-4" />
                </div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Lịch Sử Bộ Sưu Tập Theo Ngày
                </h3>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Action Bar for History: Clear All Button */}
            {historyList.length > 0 && (
              <div className="pt-3 pb-1 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Tổng cộng: {historyList.reduce((acc, d) => acc + d.sessions.length, 0)} phiên
                </span>
                <button
                  type="button"
                  onClick={handleClearAllHistory}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-medium transition-all"
                  title="Xóa toàn bộ các phiên thiết kế và giải phóng dung lượng ổ cứng"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  <span>Xóa toàn bộ lịch sử</span>
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
              {historyList.length === 0 ? (
                <div className="text-center text-slate-500 py-10 text-xs">
                  Chưa có lịch sử lưu trữ nào.
                </div>
              ) : (
                historyList.map((dayGroup) => (
                  <div key={dayGroup.date} className="flex flex-col gap-2">
                    <div className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>Ngày {dayGroup.date}</span>
                    </div>

                    <div className="flex flex-col gap-2 pl-2 border-l border-white/[0.08]">
                      {dayGroup.sessions.map((sess) => (
                        <div
                          key={sess.id}
                          onClick={() => {
                            setCurrentSession(sess);
                            setTitle(sess.productDetails.title);
                            setCategory(sess.productDetails.category);
                            setDescription(sess.productDetails.description);
                            setShowHistory(false);
                          }}
                          className="p-3 rounded-xl border border-white/[0.08] bg-[#101524]/60 hover:border-indigo-500/50 cursor-pointer transition flex items-center justify-between group"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="text-xs font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
                              {sess.sessionName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {sess.history.length} ảnh • {sess.aspectRatio}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(dayGroup.date, sess.id, e)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Xóa phiên này khỏi ổ cứng"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-white transition-colors" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CẤU HÌNH API SETTINGS GỌN GÀNG (3 NHÀ CUNG CẤP)    */}
      {/* ======================================================== */}
      {showSettings && settings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-[#0c101c] border border-white/[0.1] rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <SettingsIcon className="h-4 w-4" />
                </div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Cấu Hình AI Studio (Sangtao.ai • Gemini • OpenAI)
                </h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="h-8 w-8 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 3 Tab Chọn Nhà Cung Cấp */}
            <div className="grid grid-cols-3 gap-1.5 bg-[#080b14] p-1.5 rounded-xl border border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  setSettings({ ...settings, defaultProvider: "sangtao" });
                  setProvider("sangtao");
                }}
                className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all flex flex-col items-center gap-0.5 ${settings.defaultProvider === "sangtao"
                    ? "border border-indigo-500 bg-indigo-500/10 text-white ring-1 ring-indigo-500/20 shadow-sm"
                    : "text-slate-400 hover:text-white"
                  }`}
              >
                <span>Sangtao.ai</span>
                <span className="text-[9px] text-indigo-400 font-normal">GPT Image API</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettings({ ...settings, defaultProvider: "gemini" });
                  setProvider("gemini");
                }}
                className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all flex flex-col items-center gap-0.5 ${settings.defaultProvider === "gemini"
                    ? "border border-indigo-500 bg-indigo-500/10 text-white ring-1 ring-indigo-500/20 shadow-sm"
                    : "text-slate-400 hover:text-white"
                  }`}
              >
                <span>Google Gemini</span>
                <span className="text-[9px] text-indigo-400 font-normal">Banana Pro</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettings({ ...settings, defaultProvider: "openai" });
                  setProvider("openai");
                }}
                className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all flex flex-col items-center gap-0.5 ${settings.defaultProvider === "openai"
                    ? "border border-indigo-500 bg-indigo-500/10 text-white ring-1 ring-indigo-500/20 shadow-sm"
                    : "text-slate-400 hover:text-white"
                  }`}
              >
                <span>OpenAI</span>
                <span className="text-[9px] text-indigo-400 font-normal">DALL-E 3</span>
              </button>
            </div>

            {/* TAB 1: SANGTAO.AI (CHỈ DÙNG GPT IMAGE, KHÔNG CẦN CHỌN MODEL) */}
            {settings.defaultProvider === "sangtao" && (
              <div className="rounded-xl border border-white/[0.08] bg-[#101524]/60 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      Sangtao.ai — Tạo Ảnh AI (REST API v2)
                    </span>
                    {settings.sangtaoApiKey && (
                      <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Đã Lưu Key
                      </span>
                    )}
                  </div>
                  <a
                    href="https://sangtao.ai/vi/api-docs#image-gen"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
                  >
                    <span>Lấy API Key (sangtao.ai)</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showSangtaoKey ? "text" : "password"}
                    value={settings.sangtaoApiKey || ""}
                    onChange={(e) => {
                      setSettings({ ...settings, sangtaoApiKey: e.target.value });
                      setSangtaoTestResult(null);
                    }}
                    placeholder="Dán khóa X-Api-Key (VD: stai_a1b2c3d4...) từ Cài đặt → API Key"
                    className="w-full h-10 rounded-xl bg-[#080b14] border border-white/[0.12] pl-3.5 pr-16 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                  />
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 text-slate-400">
                    {Boolean(settings.sangtaoApiKey) && (
                      <button
                        type="button"
                        title="Xóa làm trống key này"
                        onClick={() => handleClearSingleApiKey("sangtao")}
                        className="p-0.5 hover:text-rose-400 text-slate-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSangtaoKey(!showSangtaoKey)}
                      className="p-0.5 hover:text-white transition-colors"
                    >
                      {showSangtaoKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-medium">Model mặc định:</span>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono font-medium">
                      GPT Image (chatgpt-image-sangtao)
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-semibold">
                      Chất lượng hỗ trợ: {(supportedResolutionsByProvider.sangtao || ["1K", "2K"]).join(", ")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {Boolean(settings.sangtaoApiKey) && (
                      <button
                        type="button"
                        onClick={() => handleClearSingleApiKey("sangtao")}
                        className="h-9 px-3 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-300 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        <span>Xóa Key</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isTestingSangtao || !settings.sangtaoApiKey}
                      onClick={() => handleTestApi("sangtao")}
                      className="h-9 px-3.5 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      {isTestingSangtao ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Đang Kiểm Tra...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                          <span>Kiểm Tra & Số Dư Credit</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {sangtaoTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${sangtaoTestResult.success
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                      }`}
                  >
                    {sangtaoTestResult.success ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{sangtaoTestResult.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: GOOGLE GEMINI */}
            {settings.defaultProvider === "gemini" && (
              <div className="rounded-xl border border-white/[0.08] bg-[#101524]/60 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      Google Gemini API (🍌 Banana Pro)
                    </span>
                    {settings.geminiApiKey && (
                      <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Đã Lưu
                      </span>
                    )}
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
                  >
                    <span>Lấy API Key Google AI Studio</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showGeminiKey ? "text" : "password"}
                    value={settings.geminiApiKey || ""}
                    onChange={(e) => {
                      setSettings({ ...settings, geminiApiKey: e.target.value });
                      setGeminiTestResult(null);
                    }}
                    placeholder="Dán khóa AIzaSy... vào đây"
                    className="w-full h-10 rounded-xl bg-[#080b14] border border-white/[0.12] pl-3.5 pr-16 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                  />
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 text-slate-400">
                    {Boolean(settings.geminiApiKey) && (
                      <button
                        type="button"
                        title="Xóa làm trống key này"
                        onClick={() => handleClearSingleApiKey("gemini")}
                        className="p-0.5 hover:text-rose-400 text-slate-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="p-0.5 hover:text-white transition-colors"
                    >
                      {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      Model: <strong className="text-white">{settings.geminiModel}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-semibold">
                      Chất lượng hỗ trợ: {(supportedResolutionsByProvider.gemini || ["1K"]).join(", ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {Boolean(settings.geminiApiKey) && (
                      <button
                        type="button"
                        onClick={() => handleClearSingleApiKey("gemini")}
                        className="h-9 px-3 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-300 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        <span>Xóa Key</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isTestingGemini || !settings.geminiApiKey}
                      onClick={() => handleTestApi("gemini")}
                      className="h-9 px-3.5 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {isTestingGemini ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Đang Kiểm Tra...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                          <span>Kiểm Tra Kết Nối</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {geminiTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${geminiTestResult.success
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                      }`}
                  >
                    {geminiTestResult.success ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{geminiTestResult.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: OPENAI */}
            {settings.defaultProvider === "openai" && (
              <div className="rounded-xl border border-white/[0.08] bg-[#101524]/60 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">OpenAI DALL-E 3 API</span>
                    {settings.openaiApiKey && (
                      <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Đã Lưu
                      </span>
                    )}
                  </div>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
                  >
                    <span>Lấy API Key OpenAI</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showOpenAIKey ? "text" : "password"}
                    value={settings.openaiApiKey || ""}
                    onChange={(e) => {
                      setSettings({ ...settings, openaiApiKey: e.target.value });
                      setOpenAITestResult(null);
                    }}
                    placeholder="Dán khóa sk-proj-... vào đây"
                    className="w-full h-10 rounded-xl bg-[#080b14] border border-white/[0.12] pl-3.5 pr-16 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                  />
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 text-slate-400">
                    {Boolean(settings.openaiApiKey) && (
                      <button
                        type="button"
                        title="Xóa làm trống key này"
                        onClick={() => handleClearSingleApiKey("openai")}
                        className="p-0.5 hover:text-rose-400 text-slate-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                      className="p-0.5 hover:text-white transition-colors"
                    >
                      {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      Model: <strong className="text-white">{settings.openaiModel}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-semibold">
                      Chất lượng hỗ trợ: {(supportedResolutionsByProvider.openai || ["1K"]).join(", ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {Boolean(settings.openaiApiKey) && (
                      <button
                        type="button"
                        onClick={() => handleClearSingleApiKey("openai")}
                        className="h-9 px-3 rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-300 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        <span>Xóa Key</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isTestingOpenAI || !settings.openaiApiKey}
                      onClick={() => handleTestApi("openai")}
                      className="h-9 px-3.5 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {isTestingOpenAI ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Đang Kiểm Tra...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                          <span>Kiểm Tra Kết Nối</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {openAITestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${openAITestResult.success
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                      }`}
                  >
                    {openAITestResult.success ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{openAITestResult.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* Thông báo Lưu vĩnh viễn */}
            {saveNotice && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span>{saveNotice}</span>
              </div>
            )}

            {/* Footer */}
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableMockMode}
                  onChange={(e) => setSettings({ ...settings, enableMockMode: e.target.checked })}
                  className="rounded border-white/[0.2] bg-[#090d16] text-indigo-600 focus:ring-0 h-3.5 w-3.5"
                />
                <span className="text-[11px] text-slate-400">Chế độ thử nghiệm offline</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await saveSettingsToServer(settings);
                  }}
                  className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/20 active:scale-95 flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Lưu Cấu Hình</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: XEM PHÓNG TO ẢNH (ZOOM PREVIEW LIGHTBOX)          */}
      {/* ======================================================== */}
      {previewZoomImage && (
        <div
          onClick={() => {
            setPreviewZoomImage(null);
            setLightboxEditActive(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-6 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl max-h-[94vh] rounded-2xl overflow-hidden shadow-2xl border border-white/[0.12] bg-[#090d16] flex flex-col"
          >
            {/* Modal Header Bar - Clean separate top bar, NEVER overlaps image or price badge */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0b101c] border-b border-white/[0.08] shrink-0 z-20">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold text-slate-200">
                  {currentSession && (() => {
                    const isStyle1 = currentSession.currentResults.style1?.imageUrl === previewZoomImage;
                    const isStyle2 = currentSession.currentResults.style2?.imageUrl === previewZoomImage;
                    const isStyle3 = currentSession.currentResults.style3?.imageUrl === previewZoomImage;
                    return isStyle1
                      ? "📸 Phong Cách 1: Hero Studio Shoot"
                      : isStyle2
                        ? "🖼️ Phong Cách 2: Multi-Angle 2x2"
                        : isStyle3
                          ? "📊 Phong Cách 3: Infographic Callout"
                          : "Xem Ảnh Đầy Đủ";
                  })()}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                  Chất lượng: {currentSession?.resolution || resolution} ({currentSession?.aspectRatio || aspectRatio})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {currentSession && (() => {
                  const matchingStyle: ShotStyle =
                    currentSession.currentResults.style1?.imageUrl === previewZoomImage
                      ? "style1_hero"
                      : currentSession.currentResults.style2?.imageUrl === previewZoomImage
                        ? "style2_grid2x2"
                        : "style3_callout";
                  return (
                    <button
                      type="button"
                      onClick={() => setLightboxEditActive(!lightboxEditActive)}
                      className={`rounded-xl p-2 text-white border transition-all flex items-center gap-1.5 text-xs font-semibold px-3 shadow-lg ${
                        lightboxEditActive
                          ? "bg-amber-600 hover:bg-amber-500 border-amber-400/40 shadow-amber-600/30"
                          : "bg-indigo-600 hover:bg-indigo-500 border-indigo-400/30 shadow-indigo-600/30"
                      }`}
                      title="Chỉnh sửa chi tiết bức ảnh này bằng câu lệnh prompt"
                    >
                      <Pencil className="h-4 w-4" />
                      <span>{lightboxEditActive ? "Thu gọn sửa" : "Sửa ảnh này (AI)"}</span>
                    </button>
                  );
                })()}
                <a
                  href={previewZoomImage}
                  download="commercial_studio_render.png"
                  className="rounded-xl bg-black/75 hover:bg-black p-2 text-white border border-white/[0.1] transition-colors flex items-center gap-1.5 text-xs font-medium px-3"
                  title="Tải ảnh gốc độ phân giải cao"
                >
                  <Download className="h-4 w-4" />
                  <span>Tải về</span>
                </a>
                <button
                  onClick={() => {
                    setPreviewZoomImage(null);
                    setLightboxEditActive(false);
                  }}
                  className="rounded-xl bg-black/75 hover:bg-black p-2 text-white border border-white/[0.1] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Main Image View + Interactive ChatGPT-style Brush / Box Region Inpainting Canvas */}
            {(() => {
              const matchingStyle: ShotStyle =
                currentSession?.currentResults.style1?.imageUrl === previewZoomImage
                  ? "style1_hero"
                  : currentSession?.currentResults.style2?.imageUrl === previewZoomImage
                    ? "style2_grid2x2"
                    : "style3_callout";

              const currentStrokes = regionStrokesByStyle[matchingStyle] || [];
              const allStrokes = activeDrawingStroke ? [...currentStrokes, activeDrawingStroke] : currentStrokes;
              const activeRegionBox = computeRegionBoxFromStrokes(allStrokes);

              const getNormalizedPoint = (e: React.PointerEvent<SVGSVGElement>) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
                const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
                return { x, y };
              };

              return (
                <>
                  {/* Thanh công cụ Khoanh Vùng Trực Tiếp (Hiển thị khi bật chế độ Sửa ảnh) */}
                  {lightboxEditActive && currentSession && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#0d1424] border-b border-cyan-500/20 shrink-0 z-20">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1 mr-1">
                          <span>🎯 Công cụ khoanh vùng:</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectionTool("brush")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                            selectionTool === "brush"
                              ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20"
                              : "bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]"
                          }`}
                        >
                          <span>🖌️ Cọ Tô Vùng (Brush)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectionTool("box")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                            selectionTool === "box"
                              ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20"
                              : "bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]"
                          }`}
                        >
                          <span>⬚ Khoanh Khung (Box)</span>
                        </button>

                        {selectionTool === "brush" && (
                          <div className="flex items-center gap-1 ml-1 pl-2 border-l border-white/10">
                            <span className="text-[10px] text-slate-400">Cỡ cọ:</span>
                            {[
                              { label: "Nhỏ", size: 0.022 },
                              { label: "Vừa", size: 0.036 },
                              { label: "Lớn", size: 0.062 },
                            ].map((b) => (
                              <button
                                key={b.label}
                                type="button"
                                onClick={() => setBrushRadiusNorm(b.size)}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                                  Math.abs(brushRadiusNorm - b.size) < 0.005
                                    ? "bg-indigo-500/30 border-indigo-400 text-white"
                                    : "bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                {b.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {currentStrokes.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setRegionStrokesByStyle((prev) => ({
                                  ...prev,
                                  [matchingStyle]: (prev[matchingStyle] || []).slice(0, -1),
                                }))
                              }
                              className="px-2 py-1 rounded-lg text-[10px] font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/10 transition-colors"
                            >
                              ↩️ Hoàn tác
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRegionStrokesByStyle((prev) => ({
                                  ...prev,
                                  [matchingStyle]: [],
                                }))
                              }
                              className="px-2 py-1 rounded-lg text-[10px] font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
                            >
                              🗑️ Xóa vùng chọn
                            </button>
                          </>
                        )}
                        <span
                          className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium ${
                            activeRegionBox
                              ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-200"
                              : "bg-white/[0.03] border-white/10 text-slate-400"
                          }`}
                        >
                          {activeRegionBox
                            ? `🎯 Vùng sửa: ${activeRegionBox.zoneLabel} (${activeRegionBox.widthPercent}%×${activeRegionBox.heightPercent}%)`
                            : "🌐 Đang chọn: Toàn bộ ảnh (Tô/khoanh trực tiếp lên ảnh để chỉ sửa 1 vùng)"}
                        </span>
                      </div>
                    </div>
                  )}

                  <div
                    className={`relative flex items-center justify-center p-3 sm:p-4 overflow-hidden transition-all duration-300 ${
                      lightboxEditActive ? "max-h-[44vh] sm:max-h-[48vh]" : "max-h-[82vh]"
                    }`}
                  >
                    <div className="relative inline-flex items-center justify-center max-h-full max-w-full">
                      <img
                        src={previewZoomImage}
                        alt="Zoom Preview"
                        draggable={false}
                        className={`w-auto max-w-full object-contain select-none rounded-lg shadow-2xl ${
                          lightboxEditActive ? "max-h-[41vh] sm:max-h-[45vh]" : "max-h-[78vh]"
                        }`}
                      />

                      {/* Lớp phủ SVG tương tác trực tiếp trên ảnh để khoanh vùng (Brush & Box) */}
                      {lightboxEditActive && currentSession && (
                        <svg
                          viewBox="0 0 1000 1000"
                          preserveAspectRatio="none"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            const pt = getNormalizedPoint(e);
                            if (selectionTool === "box") {
                              setActiveDrawingStroke({
                                type: "box",
                                x1: pt.x,
                                y1: pt.y,
                                x2: pt.x,
                                y2: pt.y,
                              });
                            } else {
                              setActiveDrawingStroke({
                                type: "brush",
                                points: [pt],
                                radiusNorm: brushRadiusNorm,
                              });
                            }
                          }}
                          onPointerMove={(e) => {
                            if (!activeDrawingStroke) return;
                            e.stopPropagation();
                            const pt = getNormalizedPoint(e);
                            setActiveDrawingStroke((prev) => {
                              if (!prev) return null;
                              if (prev.type === "box") {
                                return {
                                  ...prev,
                                  x2: pt.x,
                                  y2: pt.y,
                                };
                              }
                              return {
                                ...prev,
                                points: [...prev.points, pt],
                              };
                            });
                          }}
                          onPointerUp={(e) => {
                            if (!activeDrawingStroke) return;
                            e.stopPropagation();
                            setRegionStrokesByStyle((prev) => ({
                              ...prev,
                              [matchingStyle]: [...(prev[matchingStyle] || []), activeDrawingStroke],
                            }));
                            setActiveDrawingStroke(null);
                          }}
                          className="absolute inset-0 w-full h-full cursor-crosshair touch-none select-none z-10 rounded-lg"
                        >
                          {/* Render tất cả các nét cọ / khung chữ nhật */}
                          {allStrokes.map((stroke, idx) => {
                            if (stroke.type === "box") {
                              const x = Math.min(stroke.x1, stroke.x2) * 1000;
                              const y = Math.min(stroke.y1, stroke.y2) * 1000;
                              const w = Math.max(8, Math.abs(stroke.x2 - stroke.x1) * 1000);
                              const h = Math.max(8, Math.abs(stroke.y2 - stroke.y1) * 1000);
                              return (
                                <rect
                                  key={idx}
                                  x={x}
                                  y={y}
                                  width={w}
                                  height={h}
                                  rx={12}
                                  fill="rgba(0, 229, 255, 0.34)"
                                  stroke="#00E5FF"
                                  strokeWidth={4}
                                  strokeDasharray="10 6"
                                />
                              );
                            }

                            const pts = stroke.points;
                            if (!pts.length) return null;
                            const strokeWidth = Math.max(16, (stroke.radiusNorm || 0.036) * 2000);
                            if (pts.length === 1) {
                              return (
                                <circle
                                  key={idx}
                                  cx={pts[0].x * 1000}
                                  cy={pts[0].y * 1000}
                                  r={strokeWidth / 2}
                                  fill="rgba(0, 229, 255, 0.38)"
                                />
                              );
                            }
                            const d = pts
                              .map((p: { x: number; y: number }, i: number) => `${i === 0 ? "M" : "L"} ${(p.x * 1000).toFixed(1)} ${(p.y * 1000).toFixed(1)}`)
                              .join(" ");
                            return (
                              <path
                                key={idx}
                                d={d}
                                fill="none"
                                stroke="rgba(0, 229, 255, 0.42)"
                                strokeWidth={strokeWidth}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            );
                          })}

                          {/* Khung viền tổng hợp báo hiệu vùng AI Focus */}
                          {activeRegionBox && (
                            <g>
                              <rect
                                x={activeRegionBox.xPercent * 10}
                                y={activeRegionBox.yPercent * 10}
                                width={activeRegionBox.widthPercent * 10}
                                height={activeRegionBox.heightPercent * 10}
                                rx={10}
                                fill="none"
                                stroke="#00E5FF"
                                strokeWidth={3}
                                strokeDasharray="12 8"
                              />
                            </g>
                          )}
                        </svg>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Embedded AI Studio Editor Drawer */}
            {lightboxEditActive && currentSession && (() => {
              const matchingStyle: ShotStyle =
                currentSession.currentResults.style1?.imageUrl === previewZoomImage
                  ? "style1_hero"
                  : currentSession.currentResults.style2?.imageUrl === previewZoomImage
                    ? "style2_grid2x2"
                    : "style3_callout";

              const matchingStyleName =
                matchingStyle === "style1_hero"
                  ? "Hero Design (Bục & Vỏ hộp)"
                  : matchingStyle === "style2_grid2x2"
                    ? "Multi-Angle 2x2 (4 Góc Cận Cảnh)"
                    : "Infographic Callout (Chỉ dẫn kỹ thuật)";

              return (
                <div className="border-t border-white/[0.1] bg-[#0c101c]/95 backdrop-blur-xl p-3.5 sm:p-4 space-y-2.5 animate-in slide-in-from-bottom-3 duration-200 overflow-y-auto max-h-[42vh]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                        <Pencil className="h-3 w-3" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>AI Image Editor</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {matchingStyleName}
                          </span>
                        </h4>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      Bảo toàn 100% logo & thông số sản phẩm • Biến đổi bối cảnh, ánh sáng, hiệu ứng
                    </span>
                  </div>

                  <div className="relative">
                    <textarea
                      value={editPromptInputs[matchingStyle] || ""}
                      onChange={(e) =>
                        setEditPromptInputs((prev) => ({
                          ...prev,
                          [matchingStyle]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleApplyEdit(matchingStyle);
                        }
                      }}
                      placeholder="Tô/khoanh vùng trên ảnh ở trên rồi nhập yêu cầu sửa cho đúng vùng đó... (VD: Chèn bảng giá 299.000đ giảm 40% vào vùng đã khoanh, hoặc đổi mặt bàn sang đá marble, thêm giọt nước...)"
                      rows={2}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-[#080b14] border border-white/12 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition-all shadow-inner"
                      autoFocus
                    />
                  </div>

                  {/* Gợi ý chỉnh sửa theo nhóm */}
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {EDIT_PROMPT_CATEGORIES.map((cat, cIdx) => (
                      <div key={cIdx} className="flex flex-wrap items-center gap-1">
                        <span className="text-[9px] font-semibold text-slate-400 flex items-center gap-0.5 mr-1">
                          <span>{cat.badge}</span>
                          <span>{cat.title}:</span>
                        </span>
                        {cat.items.map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() =>
                              setEditPromptInputs((prev) => ({
                                ...prev,
                                [matchingStyle]: prev[matchingStyle] ? `${prev[matchingStyle]}, ${sug}` : sug,
                              }))
                            }
                            className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-indigo-500/20 hover:text-indigo-200 text-slate-300 border border-white/[0.06] transition-colors"
                          >
                            + {sug}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-400" />
                      <span>Nhấn Enter hoặc nút bên cạnh để AI bắt đầu render ngay trên ảnh này</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLightboxEditActive(false)}
                        className="px-2.5 py-1 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingEdit === matchingStyle || !editPromptInputs[matchingStyle]?.trim()}
                        onClick={() => handleApplyEdit(matchingStyle)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                      >
                        {isSubmittingEdit === matchingStyle ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
                            <span>Đang Render AI...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                            <span>Áp Dụng Thay Đổi</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
