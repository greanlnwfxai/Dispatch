import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./auth-context";

export const metadata: Metadata = {
  title: "Dispatch Admin Web",
  description: "Dispatch Admin Web — authentication foundation (AUTH-001).",
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
