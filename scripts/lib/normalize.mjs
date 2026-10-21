// Normalizes captured Align output so two runs from a fresh state compare byte for byte.
// Masks timestamps, numbers random ids by first appearance, masks clock strings. Never sorts keys or arrays.

const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const RANDOM_ID = /\b(a|prop|push)-[0-9a-f]{8}\b/g; // lib/store.ts id(): `${prefix}-${randomUUID().slice(0, 8)}`
const CLOCK = /\b\d{1,2}:\d{2}:\d{2}\s?[AP]M\b/g; // lib/directives.ts toLocaleTimeString
const SID_KEY = /(^|_)(sid|session_id)$/;
const EPOCH_KEY = /(^|_)at$|_ms$|^ts$|time/;

export function createNormalizer() {
  const seen = new Map();
  const counters = {};
  const stable = (raw, kind) => {
    if (!seen.has(raw)) {
      counters[kind] = (counters[kind] || 0) + 1;
      seen.set(raw, `<${kind}#${counters[kind]}>`);
    }
    return seen.get(raw);
  };

  const text = (s) => s.replace(ISO, "<ts>").replace(RANDOM_ID, (m, kind) => stable(m, kind)).replace(CLOCK, "<clock>");

  const value = (v, key = "") => {
    if (typeof v === "string") {
      if (SID_KEY.test(key) && /^[0-9a-f]{8}$/.test(v)) return stable(v, "sid");
      return text(v);
    }
    if (typeof v === "number" && EPOCH_KEY.test(key) && v > 1e12) return "<epoch>";
    if (Array.isArray(v)) return v.map((x) => value(x, key));
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = value(x, k);
      return out;
    }
    return v;
  };

  return { text, value };
}
