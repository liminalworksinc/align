"use client";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { Kbd } from "./kbd";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** A right-side detail drawer (full width on phones). While open it traps focus, closes on Esc or the backdrop, and
 *  returns focus to whatever opened it. */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  footer,
  width = "m",
  initialFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  width?: "m" | "l";
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={`relative flex h-full w-full flex-col border-l border-(--line-strong) bg-(--bg-overlay) shadow-(--shadow-pop) outline-none ${width === "l" ? "sm:max-w-[720px]" : "sm:max-w-[480px]"}`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-(--line) px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">{eyebrow}</p>}
            <h2 id={id} className="text-[17px] font-semibold text-(--text-1)">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-(--radius-s) border border-(--edge) px-3 text-[13px] text-(--text-2) hover:text-(--text-1)"
          >
            Close <Kbd>Esc</Kbd>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-(--line) px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
