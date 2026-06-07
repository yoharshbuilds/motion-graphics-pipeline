import type { Metadata } from "next";
import { Bricolage_Grotesque, Archivo } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  weight: ["400","500","600","700","800"],
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const archivo = Archivo({
  weight: ["400","500","600","700"],
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MGFX — Motion Graphic Finder",
  description: "Find & generate motion graphics from curated reference libraries",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${archivo.variable}`}>
      <body style={{ margin: 0, minHeight: "100vh" }}>{children}</body>
    </html>
  );
}
