"use client";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export type SegmentedOption<V extends string> = { value: V; label: string; icon?: ReactNode };

/** A single choice among a few options (a radio group): arrow keys move and choose, one tab stop. 44px tall below
 *  640px; the active option is the pink selection. Options wrap onto more rows when the container is narrow, so five
 *  or more options never push the page sideways at 320. */
export function Segmented<V extends string>({
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  size = "m",
}: {
  label: string;
  hideLabel?: boolean;
  options: SegmentedOption<V>[];
  value: V;
  onChange: (v: V) => void;
  size?: "s" | "m";
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(0, options.findIndex((o) => o.value === value));

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (at + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className={hideLabel ? "sr-only" : "text-[13px] font-medium text-(--text-2)"}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} onKeyDown={onKey} className="inline-flex w-fit max-w-full flex-wrap gap-0.5 rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) p-0.5">
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={`inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-colors max-sm:min-h-[44px] ${size === "s" ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-1.5 text-[14px]"} ${on ? "bg-(--accent) text-(--text-on-accent)" : "text-(--text-2) hover:bg-(--bg-raised) hover:text-(--text-1)"}`}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
