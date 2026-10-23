"use client";
import { ErrorNotice } from "@/components/ErrorNotice";
import "./globals.css";

// An error in the root layout itself, which app/error.tsx can't catch. It replaces the layout, so it brings its own html.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <ErrorNotice digest={error.digest} reset={reset} />
      </body>
    </html>
  );
}
