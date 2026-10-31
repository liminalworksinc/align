"use client";
import { ErrorNotice } from "./app/_ui/error-notice";

// A render error anywhere under the root layout (every /app page and the OAuth consent page), local and hosted alike.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorNotice digest={error.digest} reset={reset} />;
}
