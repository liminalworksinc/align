import type { ReactNode } from "react";

/** A truthful empty state: what is empty, why, and the one next step if there is one. */
export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-(--radius-m) border border-dashed border-(--line-strong) bg-(--bg-inset) px-5 py-6">
      {icon && <div className="text-(--text-3)">{icon}</div>}
      <p className="text-[15px] font-semibold text-(--text-1)">{title}</p>
      {body && <div className="max-w-prose text-[14px] text-(--text-2)">{body}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
