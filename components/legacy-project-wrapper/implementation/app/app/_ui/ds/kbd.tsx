import type { ReactNode } from "react";

/** A key or shortcut, e.g. <Kbd>Esc</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6em] items-center justify-center rounded-[6px] border border-(--line-strong) border-b-2 bg-(--bg-raised) px-1.5 font-mono text-[12px] leading-[1.6] text-(--text-2)">
      {children}
    </kbd>
  );
}
