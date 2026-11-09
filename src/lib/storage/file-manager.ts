import fs from "fs";
import path from "path";
import { ProductSession, GeneratedImageRecord, ShotStyle } from "@/types/studio";

const BASE_OUTPUT_DIR = path.join(process.cwd(), "output_collections");

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sanitizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40) || "product";
}

export function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getSessionFolderPath(dateFolder: string, sessionId: string): string {
  return path.join(BASE_OUTPUT_DIR, dateFolder, sessionId);
}

export function getOriginalsFolderPath(dateFolder: string, sessionId: string): string {
  return path.join(getSessionFolderPath(dateFolder, sessionId), "originals");
}

export async function saveBase64Image(
  targetDir: string,
  fileName: string,
  dataUrlOrBase64: string
): Promise<string> {
  ensureDirectory(targetDir);
  const base64Data = dataUrlOrBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const filePath = path.join(targetDir, fileName);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export async function saveSessionMetadata(session: ProductSession): Promise<void> {
  const sessionDir = getSessionFolderPath(session.dateFolder, session.id);
  ensureDirectory(sessionDir);
  const metaPath = path.join(sessionDir, "session.json");
  await fs.promises.writeFile(metaPath, JSON.stringify(session, null, 2), "utf-8");
}

export async function getSessionMetadata(
  dateFolder: string,
  sessionId: string
): Promise<ProductSession | null> {
  const metaPath = path.join(getSessionFolderPath(dateFolder, sessionId), "session.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const data = (await fs.promises.readFile(metaPath, "utf-8")).replace(/^\uFEFF/, "").trim();
    return JSON.parse(data) as ProductSession;
  } catch (err) {
    console.error("Failed to read session json", err);
    return null;
  }
}

export async function listAllSessions(): Promise<{ date: string; sessions: ProductSession[] }[]> {
  ensureDirectory(BASE_OUTPUT_DIR);
  const dateDirs = await fs.promises.readdir(BASE_OUTPUT_DIR, { withFileTypes: true });
  const result: { date: string; sessions: ProductSession[] }[] = [];

  // Sort dates descending
  const sortedDates = dateDirs
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const date of sortedDates) {
    const dayPath = path.join(BASE_OUTPUT_DIR, date);
    const sessionDirs = await fs.promises.readdir(dayPath, { withFileTypes: true });
    const sessions: ProductSession[] = [];

    for (const sDir of sessionDirs) {
      if (sDir.isDirectory()) {
        const meta = await getSessionMetadata(date, sDir.name);
        if (meta) {
          sessions.push(meta);
        }
      }
    }

    if (sessions.length > 0) {
      // Sort sessions by updatedAt descending
      sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      result.push({ date, sessions });
    }
  }

  return result;
}

export function getNextVersionNumber(session: ProductSession, style: ShotStyle): number {
  const existingWithStyle = session.history.filter((img) => img.style === style);
  if (existingWithStyle.length === 0) {
    return 1;
  }
  const maxVer = Math.max(...existingWithStyle.map((i) => i.version));
  return maxVer + 1;
}

export function getPublicFileUrl(dateFolder: string, sessionId: string, relativePath: string): string {
  return `/api/files/${dateFolder}/${sessionId}/${relativePath.replace(/\\/g, "/")}`;
}

export async function deleteSession(dateFolder: string, sessionId: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) {
    throw new Error("Invalid date folder format");
  }
  if (!sessionId || !/^[a-zA-Z0-9_\-]+$/.test(sessionId)) {
    throw new Error("Invalid session ID format");
  }

  const sessionPath = path.join(BASE_OUTPUT_DIR, dateFolder, sessionId);
  if (fs.existsSync(sessionPath)) {
    await fs.promises.rm(sessionPath, { recursive: true, force: true });
  }

  // Remove parent date folder if now empty
  const datePath = path.join(BASE_OUTPUT_DIR, dateFolder);
  if (fs.existsSync(datePath)) {
    const remaining = await fs.promises.readdir(datePath);
    if (remaining.length === 0) {
      await fs.promises.rmdir(datePath);
    }
  }

  return true;
}

export async function clearAllSessions(): Promise<{ deletedCount: number }> {
  if (!fs.existsSync(BASE_OUTPUT_DIR)) {
    return { deletedCount: 0 };
  }

  const entries = await fs.promises.readdir(BASE_OUTPUT_DIR, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(BASE_OUTPUT_DIR, entry.name);
      await fs.promises.rm(fullPath, { recursive: true, force: true });
      count++;
    }
  }

  return { deletedCount: count };
}

