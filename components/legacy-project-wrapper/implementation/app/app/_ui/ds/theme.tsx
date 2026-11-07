"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Segmented } from "./segmented";
import { THEME_KEY, type Theme, type ThemePref } from "./theme-script";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(pref: ThemePref) {
  const d = document.documentElement;
  d.setAttribute("data-theme", pref === "system" ? systemTheme() : pref);
  d.setAttribute("data-theme-pref", pref);
}

// The preference lives on <html data-theme-pref> (set before first paint), so every mounted control reads one source.
function subscribe(on: () => void) {
  const mo = new MutationObserver(on);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-pref"] });
  return () => mo.disconnect();
}
function readPref(): ThemePref {
  const p = document.documentElement.getAttribute("data-theme-pref");
  return p === "light" || p === "dark" ? p : "system";
}

/** The person's appearance choice for this browser. An explicit Light or Dark persists and wins; System follows the
 *  operating system and keeps following it while the page is open. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as ThemePref);

  useEffect(() => {
    if (pref !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    try {
      if (p === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, p);
    } catch {
      // Storage blocked (private window, policy): the choice still applies to this page.
    }
    apply(p);
  }, []);

  return { pref, setPref };
}

/** The account page's Appearance control. `hideLabel` when a heading already says "Appearance" (it stays the
 *  control's accessible name). */
export function ThemeSetting({ hideLabel = false }: { hideLabel?: boolean }) {
  const { pref, setPref } = useTheme();
  return (
    <div className="flex flex-col gap-2">
      <Segmented label="Appearance" hideLabel={hideLabel} options={OPTIONS} value={pref} onChange={setPref} />
      <p className="text-[13px] text-(--text-2)">System follows your device. Your choice is saved in this browser only.</p>
    </div>
  );
}

/** A compact appearance control for a shell header or menu. */
export function ThemeSettingCompact() {
  const { pref, setPref } = useTheme();
  return <Segmented label="Appearance" hideLabel size="s" options={OPTIONS} value={pref} onChange={setPref} />;
}
