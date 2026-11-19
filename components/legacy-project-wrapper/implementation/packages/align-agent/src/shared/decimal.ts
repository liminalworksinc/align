/** Normalize a plain decimal without converting its digits to a JavaScript number. */
export function decimalText(value: string): string | null {
  const parts = /^([+-]?)([0-9]*)(?:\.([0-9]*))?$/.exec(value);
  if (!parts || parts[0] !== value || !(parts[2] || parts[3])) return null;
  const whole = parts[2].replace(/^0+/, "") || "0";
  const fraction = (parts[3] ?? "").replace(/0+$/, "");
  const sign = parts[1] === "-" && (whole !== "0" || fraction) ? "-" : "";
  return sign + whole + (fraction ? `.${fraction}` : "");
}

/** Optional numeric projection for readers that can use it. Exact display uses the decimal text. */
export function plainDecimal(value: string): number | null {
  const exact = decimalText(value);
  if (exact === null) return null;
  const number = Number(exact);
  return String(number) === exact ? number : null;
}
