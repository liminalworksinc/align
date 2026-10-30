import { redirect } from "next/navigation";

// `/` is not a page: the web app lives under /app. proxy.ts answers this redirect first; this is the fallback.
export default function Page() {
  redirect("/app");
}
