import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, apiKey } = body;

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập API Key trước khi kiểm tra!" },
        { status: 400 }
      );
    }

    const trimmedKey = apiKey.trim();

    if (provider === "sangtao") {
      try {
        const balanceRes = await fetch("https://sangtao.ai/api/v2/account/balance", {
          headers: {
            "X-Api-Key": trimmedKey,
          },
        });
        const balanceData = await balanceRes.json().catch(() => ({}));

        if (balanceRes.ok && balanceData.success) {
          const avail = balanceData.data?.availableCredit ?? 0;
          const free = balanceData.data?.freeCredit ?? 0;
          const purchased = balanceData.data?.purchasedCredit ?? 0;

          return NextResponse.json({
            success: true,
            provider: "sangtao",
            credits: avail,
            message: `Kết nối Sangtao.ai thành công! Số dư khả dụng: ${avail} credit (Miễn phí: ${free} • Đã mua: ${purchased}).`,
          });
        } else {
          const errMsg =
            balanceData.error ||
            (balanceRes.status === 401
              ? "Khóa X-Api-Key không hợp lệ hoặc đã hết hạn. Hãy lấy key tại Cài đặt → API Key trên sangtao.ai."
              : `Lỗi phản hồi từ Sangtao.ai (HTTP ${balanceRes.status})`);
          return NextResponse.json({ success: false, error: errMsg }, { status: 400 });
        }
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err.message || "Không thể kết nối đến máy chủ sangtao.ai." },
          { status: 400 }
        );
      }
    } else if (provider === "gemini") {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: trimmedKey });

        const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
        let testResponse: any = null;
        let lastErr: any = null;
        for (const m of candidateModels) {
          try {
            testResponse = await ai.models.generateContent({
              model: m,
              contents: "ping",
            });
            if (testResponse && testResponse.text) break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!testResponse && lastErr) throw lastErr;

        if (testResponse && testResponse.text) {
          return NextResponse.json({
            success: true,
            provider: "gemini",
            message: "Kết nối thành công! Khóa Google Gemini API hợp lệ và sẵn sàng hoạt động.",
          });
        }

        return NextResponse.json({
          success: true,
          provider: "gemini",
          message: "Kết nối thành công tới dịch vụ Google Gemini!",
        });
      } catch (err: any) {
        console.error("Gemini API Test Error:", err);
        let errorMsg = err.message || "Không thể kết nối đến Google Gemini API.";
        if (
          errorMsg.includes("API_KEY_INVALID") ||
          errorMsg.includes("403") ||
          errorMsg.includes("400")
        ) {
          errorMsg =
            "API Key không hợp lệ hoặc chưa được kích hoạt. Hãy kiểm tra lại khóa từ Google AI Studio.";
        } else if (errorMsg.includes("RESOURCE_EXHAUSTED")) {
          errorMsg = "Tài khoản Google Gemini đã hết hạn mức (Quota Exceeded).";
        }
        return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
      }
    } else if (provider === "openai") {
      try {
        const OpenAI = (await import("openai")).default;
        const client = new OpenAI({ apiKey: trimmedKey });

        const modelsList = await client.models.list();
        if (modelsList && modelsList.data) {
          return NextResponse.json({
            success: true,
            provider: "openai",
            message: "Kết nối thành công! Khóa OpenAI API hợp lệ và sẵn sàng hoạt động.",
          });
        }

        return NextResponse.json({
          success: true,
          provider: "openai",
          message: "Kết nối thành công tới dịch vụ OpenAI!",
        });
      } catch (err: any) {
        console.error("OpenAI API Test Error:", err);
        let errorMsg = err.message || "Không thể kết nối đến OpenAI API.";
        if (errorMsg.includes("401") || errorMsg.includes("Incorrect API key")) {
          errorMsg =
            "API Key OpenAI không chính xác hoặc đã bị thu hồi. Hãy kiểm tra lại từ OpenAI Platform.";
        }
        return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
      }
    }

    return NextResponse.json(
      { success: false, error: "Nhà cung cấp (provider) không hợp lệ." },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Lỗi hệ thống khi kiểm tra kết nối API." },
      { status: 500 }
    );
  }
}
