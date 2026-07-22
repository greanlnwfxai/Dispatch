import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./auth-context";

export const metadata: Metadata = {
  title: "Dispatch Mobile/PWA",
  description: "Dispatch Internal Delivery Mobile/PWA — authentication foundation (AUTH-001).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
