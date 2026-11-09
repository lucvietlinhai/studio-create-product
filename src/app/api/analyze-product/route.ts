import { NextRequest, NextResponse } from "next/server";
import { analyzeAndExtractProductVision } from "@/lib/agents/analyzer-agent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { photo } = body;

    if (!photo || typeof photo !== "string") {
      return NextResponse.json(
        { error: "Vui lòng cung cấp dữ liệu ảnh sản phẩm để bóc tách." },
        { status: 400 }
      );
    }

    const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
    const productBuffer = Buffer.from(base64Data, "base64");

    const extracted = await analyzeAndExtractProductVision(productBuffer);

    if (!extracted) {
      return NextResponse.json(
        { error: "Không thể bóc tách nội dung sản phẩm từ hình ảnh này." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      details: extracted,
    });
  } catch (err: any) {
    console.error("Auto analyze product error:", err);
    return NextResponse.json(
      { error: err.message || "Lỗi khi phân tích và bóc tách đặc tính sản phẩm." },
      { status: 500 }
    );
  }
}

