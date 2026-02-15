import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTC Bots Royal",
  description: "Bitcoin multi-bot battle simulator"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
