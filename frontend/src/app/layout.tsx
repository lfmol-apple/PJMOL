import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import ClientShell from "@/components/ClientShell";

export const metadata: Metadata = {
  title: "PJMOL",
  description: "Sistema de Gestão Jurídica - PJMOL",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased font-sans"
      >
        <Toaster position="top-center" />
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
