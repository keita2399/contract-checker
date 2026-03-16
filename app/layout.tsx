import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "契約書リスクチェッカー — AIが不利な条項を検出",
  description: "契約書をアップロードするだけで、AIが不利な条項・リスクを検出。自動更新・違約金・損害賠償・知的財産権・競業避止など、フリーランスが見落としがちなポイントを警告。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-950 text-gray-100 min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
