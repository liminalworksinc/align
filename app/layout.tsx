import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./liminal-tokens.css";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"] });
const nineties = localFont({ src: "./fonts/nineties-headliner.otf", variable: "--font-nineties", display: "swap" });

export const metadata: Metadata = {
  title: "Align",
  description: "Cross-team goal changes, decided by the people who own them, with tested evidence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable} ${nineties.variable} h-full antialiased`}>
      <body data-product="team" data-relationship="peer" className="min-h-full font-sans">
        {children}
      </body>
    </html>
  );
}
