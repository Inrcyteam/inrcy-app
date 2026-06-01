import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import OrientationGuard from "./OrientationGuard";
import CookieConsentBanner from "./_components/CookieConsentBanner";
import InrcyDialogProvider from "./_components/InrcyDialogProvider";
import PullToRefresh from "./_components/PullToRefresh";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "iNrCy",
  description: "Générateur de contacts – Hub connecté",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  // 🔒 Bloque la traduction Google
  other: {
    "google": "notranslate",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" translate="no" className="notranslate">
      <head>
        {/* 🔒 Empêche Google Translate */}
        <meta name="google" content="notranslate" />
        <link rel="preload" href="/icons/inrcy.png" as="image" />
        <link rel="preload" href="/icons/site-web.jpg" as="image" />
        <link rel="preload" href="/icons/google.jpg" as="image" />
        <link rel="preload" href="/icons/facebook.png" as="image" />
        <link rel="preload" href="/icons/instagram.jpg" as="image" />
        <link rel="preload" href="/icons/linkedin.png" as="image" />
        <link rel="preload" href="/icons/tiktok.png" as="image" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        translate="no"
      >
        <OrientationGuard />
        <CookieConsentBanner />
        <InrcyDialogProvider />
        <PullToRefresh />
        {children}
      </body>
    </html>
  );
}