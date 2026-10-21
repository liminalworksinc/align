import { Suspense } from "react";
import Home from "@/components/Home";

// A custom workspace. The id in the URL is a convenience, not access control: the passcodes are.
export default function Page({ params }: PageProps<"/w/[slug]">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Workspace params={params} />
    </Suspense>
  );
}

async function Workspace({ params }: { params: PageProps<"/w/[slug]">["params"] }) {
  const { slug } = await params;
  return <Home workspace={slug} />;
}
