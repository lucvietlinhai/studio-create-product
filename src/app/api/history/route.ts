import { NextRequest, NextResponse } from "next/server";
import { listAllSessions, deleteSession, clearAllSessions } from "@/lib/storage/file-manager";

export async function GET() {
  try {
    const historyData = await listAllSessions();
    return NextResponse.json({ success: true, history: historyData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load history" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFolder = searchParams.get("dateFolder");
    const sessionId = searchParams.get("sessionId");

    if (dateFolder && sessionId) {
      // Delete a single session
      await deleteSession(dateFolder, sessionId);
      return NextResponse.json({
        success: true,
        message: `Đã xóa phiên ${sessionId} thành công`,
      });
    } else {
      // Clear all sessions across all dates
      const result = await clearAllSessions();
      return NextResponse.json({
        success: true,
        message: `Đã dọn dẹp sạch toàn bộ lịch sử (${result.deletedCount} thư mục ngày)`,
      });
    }
  } catch (err: any) {
    console.error("Delete history error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete history" }, { status: 500 });
  }
}

