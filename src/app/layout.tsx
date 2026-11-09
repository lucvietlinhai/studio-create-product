import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Công cụ thiết kế | Tạo Bộ Sưu Tập Ảnh Sản Phẩm Chuyên Nghiệp",
  description:
    "Nền tảng AI Multi-Agent biến 1-3 ảnh chụp điện thoại thành bộ sưu tập ảnh thương mại đồng nhất Concept.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

