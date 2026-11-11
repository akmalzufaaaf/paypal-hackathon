import type { Metadata } from "next";
import { Geist_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rilis — Freelancer Money Agent",
  description:
    "An AI agent holds a client's PayPal sandbox milestone payment, verifies the freelancer's deliverable against the brief, and captures or escalates the payment under explicit policy guardrails.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
