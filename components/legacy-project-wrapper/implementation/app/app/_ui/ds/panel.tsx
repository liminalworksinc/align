import type { ReactNode } from "react";

const TONE = {
  default: "bg-(--bg-panel) border-(--line)",
  raised: "bg-(--bg-raised) border-(--line-strong)",
  inset: "bg-(--bg-inset) border-(--line)",
} as const;

/** A self-contained surface. Elevation is a lighter surface and a hairline, never a glow. */
export function Panel({
  title,
  eyebrow,
  actions,
  tone = "default",
  padded = true,
  as: As = "section",
  className = "",
  children,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  tone?: keyof typeof TONE;
  padded?: boolean;
  as?: "section" | "div" | "aside";
  className?: string;
  children: ReactNode;
}) {
  const head = title || eyebrow || actions;
  return (
    <As className={`min-w-0 rounded-(--radius-m) border ${TONE[tone]} ${className}`}>
      {head && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-(--line) px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">{eyebrow}</p>}
            {title && <h2 className="text-[15px] font-semibold text-(--text-1)">{title}</h2>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </As>
  );
}
