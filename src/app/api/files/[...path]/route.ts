import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const BASE_OUTPUT_DIR = path.join(process.cwd(), "output_collections");

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const segments = resolvedParams.path || [];

  // Prevent directory traversal
  const safeRelativePath = path.normalize(segments.join("/")).replace(/^(\.\.[\/\\])+/, "");
  const fullPath = path.join(BASE_OUTPUT_DIR, safeRelativePath);

  if (!fs.existsSync(fullPath)) {
    return new NextResponse("File Not Found", { status: 404 });
  }

  const stat = await fs.promises.stat(fullPath);
  if (!stat.isFile()) {
    return new NextResponse("Not a file", { status: 400 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  let contentType = "application/octet-stream";
  if (ext === ".png") contentType = "image/png";
  else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
  else if (ext === ".webp") contentType = "image/webp";
  else if (ext === ".svg") contentType = "image/svg+xml";
  else if (ext === ".json") contentType = "application/json";

  const fileBuffer = await fs.promises.readFile(fullPath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": stat.size.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

