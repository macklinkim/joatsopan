import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "좋소판별기 — 개인용 클론",
  description: "공공데이터(국민연금) 기반 중소기업 위험도 추정 · 참고용",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${hanken.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-surface-paper text-primary font-body">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
