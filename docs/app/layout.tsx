import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ChonkieJsRootProvider } from "@/components/root-provider";
import { DOCS_SITE_URL, CHONKIE_LOGO_URL } from "@/lib/constants";
import { Lora } from "next/font/google";
import "./global.css";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
});

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_SITE_URL),
  title: "Chonkie Documentation",
  description:
    "The lightweight ingestion library for fast, efficient and robust RAG pipelines",
  icons: {
    icon: CHONKIE_LOGO_URL,
  },
  openGraph: {
    title: "Chonkie Documentation",
    description:
      "The lightweight ingestion library for fast, efficient and robust RAG pipelines",
    siteName: "Chonkie",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${lora.className} ${lora.variable}`}
        suppressHydrationWarning
      >
        <ChonkieJsRootProvider>{children}</ChonkieJsRootProvider>
      </body>
    </html>
  );
}
