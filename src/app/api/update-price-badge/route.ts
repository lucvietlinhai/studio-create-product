import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  getSessionMetadata,
  saveSessionMetadata,
  getSessionFolderPath,
} from "@/lib/storage/file-manager";
import { overlayPriceBadgeOnImage } from "@/lib/compositor/image-processor";
import { PriceBadgePosition, PriceBadgeTheme, ProductSession } from "@/types/studio";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      dateFolder,
      sessionId,
      priceBadgePosition,
      priceBadgeTheme,
      salePrice,
      originalPrice,
      showPriceBadge,
    } = body;

    if (!dateFolder || !sessionId) {
      return NextResponse.json(
        { success: false, error: "Thiếu dateFolder hoặc sessionId" },
        { status: 400 }
      );
    }

    const session = await getSessionMetadata(dateFolder, sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy session" },
        { status: 404 }
      );
    }

    const s1 = session.currentResults.style1;
    if (!s1 || !s1.localPath) {
      return NextResponse.json(
        { success: false, error: "Chưa có ảnh Phong Cách 1 (Hero Shoot)" },
        { status: 400 }
      );
    }

    // Determine clean source buffer
    let sourceBuffer: Buffer | null = null;
    const sessionDir = getSessionFolderPath(dateFolder, sessionId);

    // 1. Try cleanLocalPath
    if (s1.cleanLocalPath && fs.existsSync(s1.cleanLocalPath)) {
      sourceBuffer = await fs.promises.readFile(s1.cleanLocalPath);
    } else {
      // 2. Try conventional _clean.png pattern
      const candidateClean = s1.localPath.replace(/\.png$/, "_clean.png");
      if (fs.existsSync(candidateClean)) {
        sourceBuffer = await fs.promises.readFile(candidateClean);
      } else if (fs.existsSync(s1.localPath)) {
        sourceBuffer = await fs.promises.readFile(s1.localPath);
      }
    }

    if (!sourceBuffer) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy file ảnh gốc trên đĩa" },
        { status: 404 }
      );
    }

    // Update productDetails in session
    session.productDetails.showPriceBadge = showPriceBadge !== undefined ? Boolean(showPriceBadge) : true;
    if (priceBadgePosition) session.productDetails.priceBadgePosition = priceBadgePosition as PriceBadgePosition;
    if (priceBadgeTheme) session.productDetails.priceBadgeTheme = priceBadgeTheme as PriceBadgeTheme;
    if (salePrice !== undefined) session.productDetails.salePrice = salePrice;
    if (originalPrice !== undefined) session.productDetails.originalPrice = originalPrice;

    // Composite price badge with freshly calibrated safe margins
    const compositedBuffer = await overlayPriceBadgeOnImage(
      sourceBuffer,
      session.productDetails
    );

    // Overwrite target image file
    await fs.promises.writeFile(s1.localPath, compositedBuffer);

    // Ensure clean backup is preserved
    const cleanBackupPath = path.join(
      sessionDir,
      `v${s1.version}_style1_hero_clean.png`
    );
    if (!fs.existsSync(cleanBackupPath)) {
      await fs.promises.writeFile(cleanBackupPath, sourceBuffer);
      s1.cleanLocalPath = cleanBackupPath;
    }

    s1.hasOverlayBadge = session.productDetails.showPriceBadge;
    session.updatedAt = new Date().toISOString();

    await saveSessionMetadata(session);

    // Append cache buster to URL for instant UI refresh
    const freshImageUrl = `${s1.imageUrl.split("?")[0]}?t=${Date.now()}`;
    s1.imageUrl = freshImageUrl;

    return NextResponse.json({
      success: true,
      imageUrl: freshImageUrl,
      session,
      message: "Đã cập nhật vị trí bảng giá trên ảnh thành công!",
    });
  } catch (err: any) {
    console.error("Lỗi cập nhật bảng giá:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Lỗi cập nhật bảng giá" },
      { status: 500 }
    );
  }
}

