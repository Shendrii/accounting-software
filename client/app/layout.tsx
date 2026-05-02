import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SideNav from "./components/SideNav";
import { ProfileButton } from "./components/ProfileButton";
import { ToastProvider } from "./components/Toast";
import { AIChatPanel } from "./components/AIChatPanel";
import { AuthGate } from "./components/AuthGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Accounting System",
  description: "Modern bookkeeping and accounting system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-50 dark:bg-zinc-950`}
      >
        <AuthGate>
          <SideNav />
          <ProfileButton />
          <main className="min-h-screen">
            {children}
          </main>
          <ToastProvider />
          <AIChatPanel />
        </AuthGate>
      </body>
    </html>
  );
}
