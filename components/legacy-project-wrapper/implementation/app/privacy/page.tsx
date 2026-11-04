import type { Metadata } from "next";
import { DocBlocks, TrustFrame } from "../_trust/doc";
import { trustBlocks, trustDoc } from "@/lib/trust/docs";

// /privacy: Align's privacy policy (docs/trust/privacy-policy.md), public in both modes and on the hosted allowlist.
export const metadata: Metadata = { title: "Privacy policy · Align", description: "What personal data Align collects, why, for how long, and your rights." };

export default function Page() {
  return (
    <TrustFrame>
      <DocBlocks blocks={trustBlocks(trustDoc("privacy"))} />
    </TrustFrame>
  );
}
