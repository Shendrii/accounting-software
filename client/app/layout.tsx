import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import SideNav from "./components/SideNav";
import { WorkspaceProvider } from "./components/WorkspaceProvider";
import { ToastProvider } from "./components/Toast";
import { AIChatPanel } from "./components/AIChatPanel";
import { AuthGate } from "./components/AuthGate";
import { PRODUCT_NAME } from "@/lib/brand";

const manrope = Manrope({ variable: '--font-workspace', subsets: ['latin'], display: 'swap' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Modern bookkeeping and accounting for teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} antialiased bg-zinc-50 text-zinc-900`}
      >
        <AuthGate>
          <WorkspaceProvider>
            <SideNav />
            <main>{children}</main>
            <ToastProvider />
            <AIChatPanel />
          </WorkspaceProvider>
        </AuthGate>
      </body>
    </html>
  );
}
