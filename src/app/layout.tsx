import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hệ Thống Báo Cáo Bảo Hành Vivo CSKH",
  description: "Xử lý báo cáo chi tiết phiếu công tác sửa chữa cho 15 Trung tâm CSKH Vivo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased bg-slate-100 min-h-screen text-slate-900 font-sans">
        {children}
      </body>
    </html>
  );
}
