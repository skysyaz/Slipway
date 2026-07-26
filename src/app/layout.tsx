import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/slipway/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Slipway — Self-hosted deploys, without the yak shaving",
  description:
    "Slipway is an open-source, self-hosted deployment platform for apps and containers. Connect a repo, auto-detect the stack, ship to your own servers with built-in CI/CD, domains, SSL, databases, and rollbacks.",
  keywords: [
    "Slipway",
    "self-hosted",
    "deployment platform",
    "open source",
    "Docker",
    "CI/CD",
    "Coolify alternative",
    "Vercel alternative",
    "CapRover alternative",
  ],
  authors: [{ name: "Slipway Project" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Slipway — Self-hosted deploys",
    description: "Open-source deployment platform for apps and containers on your own Linux servers.",
    siteName: "Slipway",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Slipway",
    description: "Self-hosted deploys, without the yak shaving.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster />
          <SonnerToaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
