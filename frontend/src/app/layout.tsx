import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "NekoTunnel Central",
  description: "Self-hosted Railway TCP Tunnel Control Panel",
};

const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('nekotunnel-theme');
    var isDark = saved ? saved === 'dark' : !window.matchMedia('(prefers-color-scheme: light)').matches;
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased transition-colors selection:bg-emerald-500/30 selection:text-emerald-900 dark:bg-[#070b14] dark:text-slate-100 dark:selection:text-emerald-200">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
