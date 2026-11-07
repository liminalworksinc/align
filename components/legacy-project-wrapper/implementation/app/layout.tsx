import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import { THEME_SCRIPT } from "./app/_ui/ds/theme-script";
import { NOSCRIPT } from "./app/_ui/words";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Align",
  description: "Goals that change only with their owners' approval, and the coding agents working on them kept current.",
};

// data-theme is set by THEME_SCRIPT before first paint, so the server's "dark" default is replaced in the DOM before
// React hydrates; suppressHydrationWarning keeps the DOM's value (next/dist/docs: preventing flash before hydration).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${spaceGrotesk.variable} ${spaceMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        <noscript>
          <p className="p-10 text-[16px] text-zinc-900">{NOSCRIPT}</p>
        </noscript>
        {children}
      </body>
    </html>
  );
}
