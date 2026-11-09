import { NextResponse } from "next/server";
import { loadSettings, saveSettings, clearAllApiKeys } from "@/lib/config/settings-manager";

export async function GET() {
  const settings = loadSettings();
  return NextResponse.json(settings);
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

