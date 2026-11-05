import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JASC タスクマネージャー",
  description: "第79回日米学生会議 実行委員会（EC）業務ダッシュボード",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}

