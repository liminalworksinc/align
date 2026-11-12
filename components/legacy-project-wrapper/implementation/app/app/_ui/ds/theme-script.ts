// The appearance setting, read before first paint (no flash). Server-safe: no "use client", shared by the root layout's
// inline script and the client setting so the key and values can't drift.

export const THEME_KEY = "align-theme";
export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

/** Runs synchronously in <head>: an explicit choice wins; otherwise System (prefers-color-scheme), dark when unknown. */
export const THEME_SCRIPT = `(function(){var p=null;try{p=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}var d=document.documentElement;var t=p==="light"||p==="dark"?p:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");d.setAttribute("data-theme",t);d.setAttribute("data-theme-pref",p==="light"||p==="dark"?p:"system")})();`;
