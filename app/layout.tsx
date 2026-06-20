import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import CompareTray from "@/components/CompareTray";

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
  metadataBase: new URL("https://jotsopan.vercel.app"),
  title: "좋소판별기 — 개인용 클론",
  description: "공공데이터(국민연금) 기반 중소기업 위험도 추정 · 참고용",
  openGraph: {
    title: "좋소판별기",
    description: "전국 국민연금 가입 사업장 위험도 추정 · 참고용",
    type: "website",
  },
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
        <Footer />
        <CompareTray />
      </body>
    </html>
  );
}
