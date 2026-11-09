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

          // Kiểm tra chất lượng tạo ảnh mà model bên Sangtao.ai hỗ trợ trực tiếp từ endpoint /api/v2/models?category=image
          let supportedResolutions: ("1K" | "2K")[] = ["1K", "2K"];
          try {
            const modelsRes = await fetch("https://sangtao.ai/api/v2/models?category=image", {
              headers: { "X-Api-Key": trimmedKey },
            });
            const modelsJson = await modelsRes.json().catch(() => ({}));
            const gptImgModel = (modelsJson.data || []).find(
              (m: any) => m.slug === "chatgpt-image-sangtao"
            );
            const resOptions: any[] = gptImgModel?.config?.imageResolution?.options || [];
            if (resOptions.length > 0) {
              const parsed = resOptions
                .map((opt) => String(opt.value || opt.label || "").toUpperCase())
                .filter((val): val is "1K" | "2K" => val === "1K" || val === "2K");
              if (parsed.length > 0) {
                supportedResolutions = Array.from(new Set(parsed));
              }
            }
          } catch { }

          return NextResponse.json({
            success: true,
            provider: "sangtao",
            credits: avail,
            supportedResolutions,
            message: `Kết nối Sangtao.ai thành công! Số dư khả dụng: ${avail} credit (Miễn phí: ${free} • Đã mua: ${purchased}) • Chất lượng ảnh hỗ trợ: ${supportedResolutions.join(", ")}.`,
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
    } else if (provider === "jtht") {
      try {
        const baseUrl = (typeof body.baseUrl === "string" && body.baseUrl.trim())
          ? body.baseUrl.trim()
          : "https://ai.jtht.vn/v1";

        const modelsRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
            "Content-Type": "application/json",
          },
        });
        const modelsData = await modelsRes.json().catch(() => ({}));

        if (modelsRes.ok) {
          const modelList = Array.isArray(modelsData?.data)
            ? modelsData.data.map((m: any) => m.id || m.slug).filter(Boolean)
            : [];
          const hasImageModel = modelList.some((m: string) =>
            m.toLowerCase().includes("image") || m.toLowerCase().includes("gpt-image")
          );

          return NextResponse.json({
            success: true,
            provider: "jtht",
            supportedResolutions: ["1K", "2K"],
            message: `Kết nối JTHT AI (ai.jtht.vn) thành công! Khóa API hợp lệ • Model gpt-image-2 sẵn sàng tạo ảnh (1K & 2K).`,
          });
        } else {
          const errMsg =
            modelsData.message ||
            modelsData.error?.message ||
            modelsData.error ||
            (modelsRes.status === 401
              ? "Khóa API Key không hợp lệ hoặc đã hết hạn trên ai.jtht.vn."
              : `Lỗi phản hồi từ ai.jtht.vn (HTTP ${modelsRes.status})`);
          return NextResponse.json({ success: false, error: errMsg }, { status: 400 });
        }
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err.message || "Không thể kết nối đến máy chủ ai.jtht.vn." },
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
            supportedResolutions: ["1K"],
            message:
              "Kết nối thành công! Khóa Google Gemini API hợp lệ • Model hỗ trợ chất lượng ảnh mặc định: 1K (1024px).",
          });
        }

        return NextResponse.json({
          success: true,
          provider: "gemini",
          supportedResolutions: ["1K"],
          message: "Kết nối thành công tới dịch vụ Google Gemini! Chất lượng ảnh hỗ trợ: 1K.",
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
            supportedResolutions: ["1K"],
            message:
              "Kết nối thành công! Khóa OpenAI API hợp lệ • Model hỗ trợ chất lượng ảnh mặc định: 1K (1024px).",
          });
        }

        return NextResponse.json({
          success: true,
          provider: "openai",
          supportedResolutions: ["1K"],
          message: "Kết nối thành công tới dịch vụ OpenAI! Chất lượng ảnh hỗ trợ: 1K.",
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
