import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { EmbedReadySignal } from "@/components/embed-ready-signal";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Physics Midterm Web",
  description: "A Next.js remake of a cannon-and-projectiles physics demo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <EmbedReadySignal />
        {children}
      </body>
    </html>
  );
}
