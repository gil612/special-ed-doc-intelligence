import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Document Intelligence Service",
  description: "IEP / ועדת שילוב document extraction",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-paper text-ink">{children}</body>
    </html>
  );
}
