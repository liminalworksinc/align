"use client";
import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

// A short form: a few labelled fields and a summary of what will happen before it is sent. Errors are the server's
// words next to their field, marked by a word and a shape, and the person's draft stays. The caller moves focus to the
// failing field through its `ref`.

const CONTROL =
  "w-full rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) px-3 py-2 text-[14px] text-(--text-1) placeholder:text-(--text-3) aria-invalid:border-(--st-declined) max-sm:min-h-[44px]";

export function TextInput({ ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} className={`${CONTROL} min-h-[40px]`} />;
}
export function TextArea({ ref, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} rows={rows} {...props} className={`${CONTROL} resize-y`} />;
}
export function SelectInput({ ref, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return <select ref={ref} {...props} className={`${CONTROL} min-h-[40px]`} />;
}

/** One labelled control. The control takes the label as its name and the hint and error as its description. `count`
 *  shows the length only near the limit. `optional` says so in words; everything else is required. */
export function FormField({
  label,
  hint,
  error,
  optional = false,
  count,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  count?: { value: number; max: number };
  children: ReactElement;
}) {
  const id = useId();
  const described = [hint ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { id: `${id}-c`, "aria-describedby": described, "aria-invalid": error ? true : undefined, required: optional ? undefined : true }) : children;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${id}-c`} className="text-[13px] font-medium text-(--text-1)">
          {label}
          {optional && <span className="ml-1.5 font-normal text-(--text-3)">Optional</span>}
        </label>
        {count && count.value >= count.max * 0.8 && (
          <span className={`font-mono text-[12px] tabular-nums ${count.value > count.max ? "text-(--st-declined)" : "text-(--text-3)"}`}>
            {count.value} of {count.max}
          </span>
        )}
      </div>
      {control}
      {hint && (
        <p id={`${id}-h`} className="text-[12px] text-(--text-2)">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-e`} role="alert" className="flex items-start gap-1.5 text-[13px] font-medium text-(--st-declined)">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="mt-0.5 shrink-0">
            <circle cx="7" cy="7" r="5.5" />
            <path d="M7 4.2v3.4M7 9.8v.01" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

/** What will happen, before it is sent: a few facts, then the consequence. Not a second form. */
export function FormSummary({ title = "Before you send", rows, note }: { title?: string; rows: { label: string; value: ReactNode }[]; note?: ReactNode }) {
  return (
    <section className="rounded-(--radius-s) border border-(--line-strong) bg-(--bg-inset) p-3">
      <h4 className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">{title}</h4>
      <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-(--text-2)">{r.label}</dt>
            <dd className="min-w-0 text-(--text-1)">{r.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-2 text-[13px] text-(--text-1)">{note}</p>}
    </section>
  );
}
