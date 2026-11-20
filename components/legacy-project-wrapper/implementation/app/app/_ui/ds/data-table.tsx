"use client";
import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Present for a sortable column: the value to sort by. */
  sortValue?: (row: T) => string | number | null;
  align?: "start" | "end";
  /** A CSS width for the column at desktop widths, e.g. "120px" or "30%". A hint: the header never wraps, so the
   *  column is at least as wide as its header. */
  width?: string;
};

/** A dense table with client-side sort and a row-actions slot. Below `stackBelow` each row becomes a stacked card with
 *  the header as its label, so the page never scrolls sideways; from 640px up, a card lays its fields out in a row
 *  under the first. A table too wide for 640px raises it. Inside the table,
 *  `stacked:` and `unstacked:` (app/globals.css) follow the same width. */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowActions,
  onRowOpen,
  selectedKey,
  empty,
  initialSort,
  stackBelow = 640,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowActions?: (row: T) => ReactNode;
  /** Opens a row (e.g. in a Drawer); the row's first cell becomes the button. */
  onRowOpen?: (row: T) => void;
  selectedKey?: string | null;
  empty?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** The viewport width in px below which rows stack. A new width needs a line in each variant in app/globals.css. */
  stackBelow?: 640 | 1200;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const v = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return x < y ? -1 : 1;
    });
    return sort!.dir === "desc" ? out.reverse() : out;
  }, [rows, columns, sort]);

  if (!rows.length) return <>{empty ?? <p className="text-[14px] text-(--text-2)">Nothing here.</p>}</>;

  return (
    <table data-stack={stackBelow} className="w-full border-collapse text-[14px]">
      <caption className="sr-only">{caption}</caption>
      <thead className="stacked:hidden">
        <tr className="border-b border-(--line-strong)">
          {columns.map((c) => {
            const dir = sort?.key === c.key ? sort.dir : null;
            return (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                className={`whitespace-nowrap px-3 py-2 font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-(--text-3) ${c.align === "end" ? "text-right" : "text-left"}`}
              >
                {c.sortValue ? (
                  <button
                    type="button"
                    onClick={() => setSort({ key: c.key, dir: dir === "asc" ? "desc" : "asc" })}
                    className="inline-flex items-center gap-1 uppercase hover:text-(--text-1)"
                  >
                    {c.header}
                    <span aria-hidden="true">{dir === "asc" ? "↑" : dir === "desc" ? "↓" : "↕"}</span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            );
          })}
          {rowActions && (
            <th scope="col" className="px-3 py-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          const k = rowKey(row);
          const on = selectedKey === k;
          return (
            <tr
              key={k}
              aria-selected={selectedKey !== undefined ? on : undefined}
              className={`border-b border-(--line) align-middle stacked:mb-3 stacked:flex stacked:flex-col stacked:gap-2 stacked:sm:flex-row stacked:sm:flex-wrap stacked:sm:items-end stacked:sm:gap-x-8 stacked:rounded-(--radius-m) stacked:border stacked:bg-(--bg-panel) stacked:p-3 ${on ? "bg-(--accent-soft) shadow-[inset_2px_0_0_var(--accent-text)]" : "hover:bg-(--bg-raised)"}`}
            >
              {columns.map((c, i) => (
                <td key={c.key} className={`px-3 py-2 stacked:p-0 ${i === 0 ? "stacked:sm:basis-full" : ""} ${c.align === "end" ? "unstacked:text-right" : ""}`}>
                  <span className="mb-0.5 hidden font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-3) stacked:block">{c.header}</span>
                  {i === 0 && onRowOpen ? (
                    <button type="button" onClick={() => onRowOpen(row)} className="min-h-[36px] text-left font-medium text-(--text-1) underline-offset-4 hover:underline stacked:min-h-[44px]">
                      {c.render(row)}
                    </button>
                  ) : (
                    c.render(row)
                  )}
                </td>
              ))}
              {rowActions && <td className="px-3 py-2 text-right stacked:p-0 stacked:text-left stacked:sm:ml-auto">{rowActions(row)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
