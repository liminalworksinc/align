"use client";
import { useEffect, useEffectEvent, useId, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Kbd } from "./kbd";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/** Has a box, is visible, and no closed <details> hides it. Closed content keeps its box (content-visibility), so that
 *  takes a walk up: at each closed <details>, only that details' own summary is reachable. */
function canTakeFocus(e: HTMLElement) {
  if (!e.getClientRects().length || getComputedStyle(e).visibility === "hidden") return false;
  for (let d = e.closest("details:not([open])"); d; d = d.parentElement?.closest("details:not([open])") ?? null) {
    if (!d.querySelector(":scope > summary")?.contains(e)) return false;
  }
  return true;
}

/** No document on the server: a drawer open at first paint (?review=) renders after hydration. */
const noSubscription = () => () => {};

/** A right-side detail drawer (full width on phones). While open it traps focus, closes on Esc or the backdrop, and
 *  returns focus to whatever opened it. It renders on document.body: mounted inside the sticky rail, z-50 would count
 *  only within the rail and the page would take its clicks. */
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
  const client = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  // Escape reads the latest onClose without being a dependency: a caller's inline onClose is a new function on each
  // render, and as a dependency it reran this effect on every re-render while open, whose cleanup and setup moved focus
  // to the opener and then the panel, so keystrokes in a field were lost mid-typing (Mini 0, LIM-2472 66fdddad). Focus
  // now moves only when the drawer opens and back when it closes.
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!open || !client) return;
    const opener = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // Read on every Tab, so a disclosure opening or closing counts. Only what can take focus now, or the first or last
      // here would be a control the browser skips, and focus would leave.
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(canTakeFocus);
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
  }, [open, client, initialFocusRef]);

  if (!open || !client) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end text-(--text-1) [overflow-wrap:anywhere]">
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
            className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-(--radius-s) border border-(--edge) px-3 text-[13px] whitespace-nowrap text-(--text-2) hover:text-(--text-1)"
          >
            {/* Never wrapped ("Clo / se" at 390); the Esc hint is for keyboards, so phones leave it out. */}
            Close
            <span className="max-sm:hidden">
              <Kbd>Esc</Kbd>
            </span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-(--line) px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
