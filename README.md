# AI E-Commerce Product Image Studio

Hệ thống AI Studio tự động hóa thiết kế bộ ảnh sản phẩm thương mại điện tử (Shopee, Lazada, TikTok Shop, Amazon, Website) từ ảnh chụp điện thoại thô:
- **Phong cách 1 (Hero Studio Shoot):** Dựng bục Podium 3D, ánh sáng Studio chuyên nghiệp, giữ nguyên 100% nhận diện sản phẩm & bao bì, gắn nhãn giá khuyến mãi.
- **Phong cách 2 (Multi-Angle 2x2 Grid):** Bố cục 4 góc cận cảnh đồng nhất tone màu Lookbook.
- **Phong cách 3 (Infographic Line Callout):** Tự động bóc tách đặc tính kỹ thuật bằng Vision OCR và vẽ đường dẫn chỉ số thương mại.

---

## Cách Khởi Động Nhanh (2 Command)

Yêu cầu máy tính đã cài đặt [Node.js](https://nodejs.org) (phiên bản 18 trở lên).

### 1. Trên Windows (`run.bat`)
Click đúp vào file **`run.bat`** (hoặc chạy trong Terminal):
```bat
.\run.bat
```
- Tự động kiểm tra và chạy `npm install` nếu chưa có thư viện.
- Tự động biên dịch `npm run build` nếu chạy lần đầu.
- Tự động khởi chạy máy chủ và mở trình duyệt tại `http://localhost:3000`.

### 2. Trên macOS (`run-mac.command`)
Click đúp vào file **`run-mac.command`** (hoặc chạy trong Terminal):
```bash
chmod +x run-mac.command
./run-mac.command
```
- Tự động gỡ cờ cách ly Gatekeeper (`xattr -cr`), tự động cài đặt `node_modules` và thư viện xử lý ảnh `sharp` chuẩn kiến trúc chip Mac (`arm64` / `x64`).
- Tự động biên dịch và mở trình duyệt tại `http://localhost:3000`.

---

## Cấu Hình API Key
- Sau khi giao diện mở lên tại `http://localhost:3000`, bấm nút **Cài đặt API Key** ở góc phải trên cùng để nhập API Key (`Sangtao.ai`, `Google Gemini`, hoặc `OpenAI`).
- API Key được lưu cục bộ trên máy cá nhân (`studio-settings.json` / `.env.local`) và đã được loại trừ hoàn toàn trong `.gitignore` để bảo mật tuyệt đối.
