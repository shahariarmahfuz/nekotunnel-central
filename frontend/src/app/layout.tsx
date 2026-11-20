import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NekoTunnel Central",
  description: "Self-hosted Railway TCP Tunnel Control Panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        {children}
      </body>
    </html>
  );
}
