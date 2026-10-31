import type { Metadata } from "next";
import { Anton, Space_Grotesk, Space_Mono } from "next/font/google";
import { NOSCRIPT } from "./app/_ui/words";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"] });
const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Align",
  description: "Goals that change only with their owners' approval, and the coding agents working on them kept current.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable} ${anton.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <noscript>
          <p className="p-10 text-[16px] text-zinc-900">{NOSCRIPT}</p>
        </noscript>
        {children}
      </body>
    </html>
  );
}
