import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "VesperFrame — Direct the impossible.",
    template: "%s · VesperFrame",
  },
  description:
    "A private, capability-aware production workspace for directing durable image and video generations.",
  applicationName: "VesperFrame",
  openGraph: {
    type: "website",
    siteName: "VesperFrame",
    title: "VesperFrame — Direct the impossible.",
    description:
      "Direct image and video generations with exact controls, durable projects, and private assets.",
  },
  twitter: {
    card: "summary_large_image",
    title: "VesperFrame — Direct the impossible.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
