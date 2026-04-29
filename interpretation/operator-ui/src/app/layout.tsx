import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Interpretation — Operator",
  description: "GMO Global Studio realtime multilingual interpretation operator UI",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh font-sans antialiased">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <h1 className="font-serif text-xl font-bold text-brand">
              リアルタイム多言語通訳
            </h1>
            <span className="text-sm text-stone-500">Operator Console</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
