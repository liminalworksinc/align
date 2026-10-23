"use client";
import { ErrorNotice } from "@/components/ErrorNotice";

// A render error anywhere under the root layout (/, /setup, /new, /w/<id>), local and hosted alike.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorNotice digest={error.digest} reset={reset} />;
}
