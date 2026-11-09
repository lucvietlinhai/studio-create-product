import { NextResponse } from "next/server";
import { loadSettings, saveSettings, clearAllApiKeys } from "@/lib/config/settings-manager";
import { DEFAULT_PROVIDER_RESOLUTIONS, ImageResolution } from "@/types/studio";

export async function GET() {
  const settings = loadSettings();
  const supportedResolutionsByProvider = { ...DEFAULT_PROVIDER_RESOLUTIONS };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const modelsRes = await fetch("https://sangtao.ai/api/v2/models?category=image", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (modelsRes.ok) {
      const modelsJson = await modelsRes.json().catch(() => ({}));
      const gptImgModel = (modelsJson.data || []).find(
        (m: any) => m.slug === "chatgpt-image-sangtao"
      );
      const resOptions: any[] = gptImgModel?.config?.imageResolution?.options || [];
      if (resOptions.length > 0) {
        const parsed = resOptions
          .map((opt) => String(opt.value || opt.label || "").toUpperCase())
          .filter((val): val is ImageResolution => val === "1K" || val === "2K");
        if (parsed.length > 0) {
          supportedResolutionsByProvider.sangtao = Array.from(new Set(parsed));
        }
      }
    }
  } catch { }

  return NextResponse.json({
    ...settings,
    supportedResolutionsByProvider,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const updated = saveSettings(body);
    return NextResponse.json({ success: true, settings: updated, ...updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to save settings" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const updated = clearAllApiKeys();
    return NextResponse.json({
      success: true,
      message: "Đã xóa toàn bộ API Key trên máy này",
      settings: updated,
      ...updated,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to clear API keys" }, { status: 500 });
  }
}

