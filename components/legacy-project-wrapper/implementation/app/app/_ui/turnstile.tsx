"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// The Cloudflare Turnstile widget (lib/v2/captcha.ts), shown only when the server passes a site key (hosted, with both
// Turnstile keys set). Its token goes in the x-captcha-response header of the one request it was solved for; a token
// works once, so reset() asks for a fresh one after every attempt.

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void; "error-callback": () => void }): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function load(): Promise<TurnstileApi> {
  return (loading ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(s);
  }));
}

/** The widget (null without a site key), its current token, the header to send it in, and reset(). */
export function useTurnstile(siteKey: string | null) {
  const el = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!siteKey || !el.current) return;
    let live = true;
    load().then(
      (t) => {
        if (!live || !el.current || id.current) return;
        id.current = t.render(el.current, { sitekey: siteKey, callback: setToken, "expired-callback": () => setToken(null), "error-callback": () => setToken(null) });
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [siteKey]);
  const reset = useCallback(() => {
    setToken(null);
    if (id.current) window.turnstile?.reset(id.current);
  }, []);
  const widget = siteKey ? (
    <div className="mb-3">
      <div ref={el} data-turnstile-sitekey={siteKey} />
      {failed && <p className="text-[14px] text-red-700">The check that you are a person didn&apos;t load. Reload the page to try again.</p>}
    </div>
  ) : null;
  return {
    widget,
    /** False until the widget has given a token (always true without Turnstile). */
    ready: !siteKey || !!token,
    headers: (token ? { "x-captcha-response": token } : {}) as Record<string, string>,
    reset,
  };
}
