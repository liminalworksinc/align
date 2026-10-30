"use client";

// v6 "Say it as one sentence": the priority change read back as one line. Every blank is plain text (React escapes it); an
// empty blank shows its placeholder in a dimmer style so it reads as "not filled in yet".

function Blank({ value, placeholder, quote }: { value: string; placeholder: string; quote?: boolean }) {
  const v = value.trim();
  return (
    <span className={`inline border-b-[1.5px] border-violet-500 px-1 font-semibold ${v ? "text-zinc-900" : "text-zinc-500"}`}>
      {v ? (quote ? `“${v}”` : v) : placeholder}
    </span>
  );
}

export function ConflictSentence({ asking, owning, measure, because }: { asking: string; owning: string; measure: string; because: string }) {
  return (
    <p className="text-[21px] leading-[2] text-zinc-900">
      Because <Blank value={because} placeholder="the priority changed" />, <Blank value={asking} placeholder="whoever is changing the priority" /> needs{" "}
      <Blank value={owning} placeholder="whoever’s plan has to change" /> to change <Blank value={measure} placeholder="what they’re working to" quote />.
    </p>
  );
}
