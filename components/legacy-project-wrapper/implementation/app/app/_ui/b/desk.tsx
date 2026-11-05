"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DataTable, EmptyState, EvidenceSummary, hasEvidence, NeedAction, Segmented, sendChoice, StatusPill, type Column, type SendResult } from "../ds";
import { useApi } from "../kit";
import type { ChangeRequest } from "../types";
import { needForChangeRequest } from "../home/needs";
import { useNarrow, waited } from "../home/needs-list";
import { actsFor, QuietBtn } from "./act";
import { crStatus, nameList, oneLine, PHASE_WORDS, phaseOf, versions, waitsOn, type Phase } from "./model";

// LIM-2472: the decision desk as one piece, mountable in any shell (the integrated candidate's Requests tab). One read,
// GET …/change-requests: every change request this person can read, filtered client-side into Waiting on me / Waiting on
// others / Decided / All with counts, searchable, sortable. Each row carries Home's label for it (KIND_WORDS, through
// needForChangeRequest) and one outlined action in Home's words ("Review", "Launch v<n>", a returned request's verb),
// shown only when its `can` flags give this person something to do. A row never decides: every action opens the
// review (`?review=<goal>.<id>`, no choice), where the evidence is and the one filled action lives, unless the page
// passes `onOpen`. No shell, no first run: the page around it owns those.

type Groups = { waiting_on_me: ChangeRequest[]; mine: ChangeRequest[]; others: ChangeRequest[] };
type Filter = Phase | "all";

/** "Mina Torres can decide": whose move an open request is, when it isn't this person's. */
function whoCan(r: ChangeRequest, me: string): string {
  const w = waitsOn(r);
  if (!w) return "No action";
  const verb = w.for === "decision" ? "decide" : w.for === "launch" ? "launch it" : w.for.startsWith("answer") ? "answer the suggested change" : w.for.startsWith("update") ? "update it" : "act on it";
  return `${nameList(w.people, me)} can ${verb}`;
}

export function Desk({
  ws,
  me,
  onOpen,
  selectedId = null,
  reloadToken = 0,
  empty,
}: {
  ws: string;
  me: string;
  /** Open a request's review. Default: navigate to `?review=<goal>.<id>`. */
  onOpen?: (cr: ChangeRequest) => void;
  selectedId?: string | null;
  /** Change it to read the requests again (after a decision made elsewhere on the page). */
  reloadToken?: number;
  /** What to show when this person can read no change request at all. */
  empty?: ReactNode;
}) {
  const router = useRouter();
  const feed = useApi<Groups>(`/api/v2/workspaces/${ws}/change-requests`);
  const { reload } = feed;
  useEffect(() => {
    if (reloadToken) reload();
  }, [reloadToken, reload]);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [q, setQ] = useState("");
  const narrow = useNarrow();
  const [notes, setNotes] = useState<Map<string, SendResult>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  const open = (r: ChangeRequest) => (onOpen ? onOpen(r) : router.push(`?review=${r.goal.id}.${r.id}`, { scroll: false }));

  const rows = useMemo(() => (feed.data ? [...feed.data.waiting_on_me, ...feed.data.mine, ...feed.data.others] : []), [feed.data]);
  const counts = useMemo(() => {
    const c: Record<Phase, number> = { on_me: 0, on_others: 0, decided: 0 };
    for (const r of rows) c[phaseOf(r)]++;
    return c;
  }, [rows]);
  // Until the person picks a filter: their own queue when anything waits on them, else everything.
  const f: Filter = filter ?? (counts.on_me ? "on_me" : "all");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (f !== "all" && phaseOf(r) !== f) return false;
      if (!needle) return true;
      return [r.goal.title, r.requester.name, r.reason, ...r.approvers.map((p) => p.name), crStatus(r).label].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, f, q]);

  const columns: Column<ChangeRequest>[] = [
    {
      key: "request",
      header: "Request",
      width: "26%",
      sortValue: (r) => r.goal.title.toLowerCase(),
      render: (r) => (
        <span className="flex min-w-0 flex-col gap-0.5" data-row={r.id}>
          <span className="text-[14px] font-medium text-(--text-1)">{r.goal.title}</span>
          <span className="text-[12px] font-normal text-(--text-3)">
            {oneLine(r)} · {r.requester.id === me ? "your request" : `${r.requester.name}'s request`}
          </span>
          {/* The one-click result reads on its own line under the title, the row's widest cell, never squeezed in
              beside the buttons. */}
          {rowNote(r)}
        </span>
      ),
    },
    {
      key: "state",
      header: "State",
      sortValue: (r) => needForChangeRequest(r, me)?.word ?? crStatus(r).label,
      width: "210px",
      render: (r) => {
        const n = needForChangeRequest(r, me);
        return (
          <span className="sm:whitespace-nowrap">
            <StatusPill kind={n?.tone ?? crStatus(r).kind} label={n?.word ?? crStatus(r).label} size="s" />
          </span>
        );
      },
    },
    {
      key: "waiting",
      header: "Waits on",
      render: (r) => {
        const w = waitsOn(r);
        return <span className="text-[13px] text-(--text-2) sm:whitespace-nowrap">{w ? nameList(w.people, me) : "Decided"}</span>;
      },
    },
    {
      key: "versions",
      header: "Versions",
      render: (r) => {
        const v = versions(r);
        return (
          <span className="flex flex-col font-mono text-[12px] text-(--text-2) sm:whitespace-nowrap">
            <span>{v.launched}</span>
            <span className="text-(--text-3)">{v.approvedLine}</span>
          </span>
        );
      },
    },
    {
      key: "evidence",
      header: "Evidence",
      width: "200px",
      sortValue: (r) => r.evidence_count,
      // The same chips the review shows, beside the click they back; none for a request not launched reads no delivery.
      // One chip ("+N more" says the rest). Whether its words wrap inside the chip is EvidenceLabel's (foundation).
      render: (r) => (
        <span className="block">
          <EvidenceSummary ws={ws} cr={r} variant="inline" max={1} value={r.launch === "launched" ? undefined : null} />
        </span>
      ),
    },
    { key: "age", header: "Updated", align: "end", width: "116px", sortValue: (r) => r.updated_at, render: (r) => <span className="font-mono text-[12px] text-(--text-3) sm:whitespace-nowrap">{waited(r.updated_at)}</span> },
  ];

  /** The row shortcut (founder ruling, LIM-2472 eaa5cf92): a quiet "Approve only" beside Review, only when the request has
   *  evidence on its current revision and this person's `cr.can` allows approve; never on a row whose action is a
   *  launch. One click sends Approve only through the review's own send path (sendChoice), which re-reads first and,
   *  with requireEvidence, sends nothing if the evidence was removed meanwhile. Never a launch from a row. */
  const shortcut = (r: ChangeRequest, label: string) => r.can.approve && hasEvidence(r) && label === "Review";
  const approveRow = async (r: ChangeRequest) => {
    setBusy(r.id);
    const res = await sendChoice(ws, r, "approve", null, { requireEvidence: true, launchNote: true });
    setBusy(null);
    setNotes((m) => new Map(m).set(r.id, res));
    if (res.reread) feed.reload();
  };
  const rowNote = (r: ChangeRequest) => {
    const note = notes.get(r.id);
    if (!note) return null;
    return (
      <span
        role={note.kind === "done" ? "status" : "alert"}
        data-row-notice={note.kind}
        className={`mt-1 block text-[12px] font-normal ${note.kind === "done" ? "text-(--text-2)" : note.kind === "retry" ? "text-(--st-retry)" : "text-(--st-declined)"}`}
      >
        {note.text}
      </span>
    );
  };
  const rowActions = (r: ChangeRequest) => {
    const n = needForChangeRequest(r, me);
    const label = n?.action?.label ?? (actsFor(r).length ? "Review" : null);
    if (!label)
      return (
        <span className="flex flex-col items-end max-sm:items-start">
          <span className="text-[12px] text-(--text-3)">{phaseOf(r) === "decided" ? "No action" : whoCan(r, me)}</span>
        </span>
      );
    const review = onOpen ? <NeedAction onClick={() => onOpen(r)}>{label}</NeedAction> : <NeedAction href={`?review=${r.goal.id}.${r.id}`}>{label}</NeedAction>;
    return (
      <span className="flex flex-col items-end max-sm:items-start">
        <span className="inline-flex items-center gap-1">
          {shortcut(r, label) && (
            <NeedAction quiet name={`Approve only: ${r.goal.title}. This does not launch it.`} disabled={busy === r.id} onClick={() => void approveRow(r)}>
              {busy === r.id ? "Approving…" : "Approve only"}
            </NeedAction>
          )}
          {review}
        </span>
      </span>
    );
  };

  // Below 400px the same short words as Home's filter ("Waiting"), so the row stays on one line at 320.
  const filters: { value: Filter; label: string }[] = [
    { value: "on_me", label: `${narrow ? "On me" : PHASE_WORDS.on_me} ${counts.on_me}` },
    { value: "on_others", label: `${narrow ? "Waiting" : PHASE_WORDS.on_others} ${counts.on_others}` },
    { value: "decided", label: `${PHASE_WORDS.decided} ${counts.decided}` },
    { value: "all", label: `All ${rows.length}` },
  ];
  const loading = feed.loading && !feed.data;

  return (
    <div data-desk className="flex min-w-0 flex-col gap-3">
      <p className="text-[14px] text-(--text-2)" data-desk-summary>
        {loading
          ? "Reading the change requests…"
          : feed.error
            ? "Align couldn't read the change requests just now, so what is waiting is unknown."
            : counts.on_me
              ? `${counts.on_me} decision${counts.on_me === 1 ? "" : "s"} waiting on you. ${counts.on_others} waiting on others.`
              : `Nothing is waiting on you. ${counts.on_others} waiting on others.`}
      </p>
      {feed.error && (
        <EmptyState
          title="Change requests unknown"
          body="Align couldn't read the change requests just now. Nothing here means nothing is waiting; it means the read failed."
          action={<QuietBtn onClick={feed.reload}>Try again</QuietBtn>}
        />
      )}
      {feed.data && !rows.length && (empty ?? <EmptyState title="No change requests yet" body="Nobody has asked to change a goal you can see. When someone does, it lands here with who decides and what they may do." />)}
      {!!rows.length && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Segmented label="Show" hideLabel size="s" options={filters} value={f} onChange={setFilter} />
            <label className="ml-auto flex min-w-[220px] flex-1 flex-col gap-1 sm:max-w-[320px]">
              <span className="sr-only">Search change requests</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search goal, person, reason"
                className="min-h-[36px] rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) px-3 text-[14px] text-(--text-1) placeholder:text-(--text-3) max-sm:min-h-[44px]"
              />
            </label>
          </div>
          <div className="rounded-(--radius-m) border border-(--line) bg-(--bg-panel) max-sm:border-0 max-sm:bg-transparent">
            <DataTable
              caption={`Change requests: ${filters.find((x) => x.value === f)?.label ?? ""}`}
              columns={columns}
              rows={shown}
              rowKey={(r) => r.id}
              onRowOpen={(r) => open(r)}
              selectedKey={selectedId}
              rowActions={rowActions}
              initialSort={{ key: "age", dir: "desc" }}
              empty={
                <div className="p-4">
                  <EmptyState
                    title={q ? "No change requests match" : f === "on_me" ? "Nothing is waiting on you" : f === "on_others" ? "Nothing is waiting on others" : "No decided requests"}
                    body={q ? `Nothing in this view mentions "${q}".` : "Pick another view above."}
                  />
                </div>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
