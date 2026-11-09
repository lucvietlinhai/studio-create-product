import { NextRequest, NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import path from "path";
import fs from "fs";

function openSystemExplorer(nativePath: string) {
  if (process.platform === "win32") {
    // 1. Try cmd.exe start (reliable on Windows 10/11)
    try {
      const child = spawn("cmd.exe", ["/c", "start", '""', nativePath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    } catch {
      // 2. Fallback to PowerShell Invoke-Item
      const safePath = nativePath.replace(/'/g, "''");
      exec(`powershell.exe -NoProfile -Command "Invoke-Item -LiteralPath '${safePath}'"`);
    }
  } else if (process.platform === "darwin") {
    exec(`open "${nativePath}"`);
  } else {
    exec(`xdg-open "${nativePath}"`);
  }
}

function resolveTargetPath(folderPath?: string): string {
  // Always guarantee default output_collections exists
  const baseOutputDir = path.resolve(process.cwd(), "output_collections");
  if (!fs.existsSync(baseOutputDir)) {
    fs.mkdirSync(baseOutputDir, { recursive: true });
  }

  if (!folderPath) {
    return baseOutputDir;
  }

  const customPath = path.isAbsolute(folderPath)
    ? folderPath
    : path.resolve(process.cwd(), folderPath);

  if (fs.existsSync(customPath)) {
    return customPath;
  }

  // If subfolder doesn't exist yet, attempt to create it
  try {
    fs.mkdirSync(customPath, { recursive: true });
    return customPath;
  } catch {
    return baseOutputDir;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const folderPath = body?.folderPath;
    const targetPath = resolveTargetPath(folderPath);
    const nativePath = path.normalize(targetPath);

    openSystemExplorer(nativePath);

    return NextResponse.json({ success: true, openedPath: nativePath });
  } catch (err: any) {
    console.error("Open folder error:", err);
    return NextResponse.json({ error: err.message || "Lỗi mở thư mục" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folderParam = searchParams.get("folder") || undefined;
    const targetPath = resolveTargetPath(folderParam);
    const nativePath = path.normalize(targetPath);

    openSystemExplorer(nativePath);

    return NextResponse.json({ success: true, openedPath: nativePath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Lỗi mở thư mục" }, { status: 500 });
  }
}
