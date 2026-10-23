"use client";

// v6 "Say it as one sentence": the conflict read back as one line. Every blank is plain text (React escapes it); an
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
    <p className="text-[21px] leading-[2] text-zinc-900" aria-live="polite">
      <Blank value={asking} placeholder="The asking team" /> needs <Blank value={owning} placeholder="the owning team" /> to change{" "}
      <Blank value={measure} placeholder="the measure it works to" quote /> because <Blank value={because} placeholder="the company requirement that changed" />.
    </p>
  );
}
