import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dispatch Admin Web",
  description: "Dispatch Admin Web — repository and tooling foundation (DEV-FOUNDATION-001).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
