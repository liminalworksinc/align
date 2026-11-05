"use client";
import { useState } from "react";
import { Desk } from "@/app/app/_ui/b/desk";
import { Shell } from "../../../_ui/kit";
import type { Me } from "../../../_ui/server";
import { ReviewDrawer, useReview } from "../review-drawer";

// The workspace Requests tab: the decision desk (every change request this person can read, by what it needs from them).
// A row opens the same review drawer Home uses (?review=<goal>.<id>, with &choice=<choice> from a row's action button).
export default function Requests({ me, ws }: { me: Me; ws: string }) {
  const [review, setReview] = useReview();
  const [reloadToken, setReloadToken] = useState(0);
  return (
    <Shell me={me} ws={ws} tab="Requests">
      <h1 className="mb-5 font-display text-[32px] leading-[1.1] text-(--text-1) max-sm:text-[28px]">Change requests</h1>
      <Desk ws={ws} me={me.id} selectedId={review?.id ?? null} reloadToken={reloadToken} />
      {/* The drawers break words only where needed, so a short label ("Close", "Esc") never splits at 320. */}
      <div className="[overflow-wrap:break-word]">
        {review && <ReviewDrawer key={`${review.id}:${review.choice ?? ""}`} ws={ws} goal={review.goal} id={review.id} me={me.id} choice={review.choice} onClose={() => setReview(null)} onChanged={() => setReloadToken((t) => t + 1)} />}
      </div>
    </Shell>
  );
}
