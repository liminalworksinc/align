"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { FormField, Panel, SelectInput, TextArea, TextInput } from "../../../_ui/ds";
import { ApiError, api, Btn, usd, useApi, when } from "../../../_ui/kit";
import { NoticeBox, useNotice, type Notice } from "../../../_ui/crparts";
import { Err, Loading, Note } from "../sessions/parts";
import type { Goal, MySession, WsDetail } from "../../../_ui/types";
import { spendMonth } from "@/lib/v2/spend-month";
import type { BudgetBurn, BudgetRequestView } from "@/lib/v2/budgets";

type Groups = { waiting_on_me: BudgetRequestView[]; mine: BudgetRequestView[]; others: BudgetRequestView[]; next_cursor: string | null };
export type HomeBudgets = Pick<Groups, "waiting_on_me" | "mine" | "next_cursor">;
type HomeTeam = { team: { id: string; name: string } | null; teams: { id: string; name: string }[]; can_choose: boolean };
const base = (ws: string) => `/api/v2/workspaces/${ws}`;
const dollars = (v: number | null | undefined) => v == null ? "" : v / 1_000_000;
const amount = (v: number | null, bound?: string | null) => v === null ? "Unknown" : `${bound === "lower" ? "At least " : bound === "upper" ? "At most " : ""}${usd(v)}`;
export const budgetHref = (ws: string, r: Pick<BudgetRequestView, "id" | "team" | "month">) => `/app/w/${ws}/spend?team=${encodeURIComponent(r.team.id)}&month=${r.month}&request=${encodeURIComponent(r.id)}`;

/** Keep the person's draft and visible refusal, and read current permissions again after a refused decision. */
function useBudgetWrite(after: () => void, key: string) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useNotice(key);
  const writing = useRef(false);
  const write = async (path: string, body?: unknown, method = "POST", recorded?: (data: unknown) => void) => {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true); setNotice(null);
    try {
      const result = await api(path, { method, ...(body === undefined ? {} : { body }) });
      recorded?.(result);
      setNotice({ kind: "done", text: "Recorded. Read the updated record below." }); after(); return true;
    } catch (e) {
      const messages: Record<string, string> = { stale_revision: "This request changed after you read it. Read the updated record and decide again.", month_closed: "This month has ended. Its budget cannot change.", budget_missing: "This team has no budget this month.", too_many_waiting_requests: "You already have five budget requests waiting for this team this month. Wait for a decision or withdraw one.", not_an_approver: "A different eligible person must decide this request.", wrong_state: "This request has already changed. Read its current record below.", no_eligible_approver: "No other owner is eligible to decide a second look.", read_only: "Viewers cannot change budgets or requests.", not_found: "You cannot read this team or request.", rate_limited: "Too many budget requests were recorded in the last hour. Try again later.", bad_request: "Check the fields and try again." };
      setNotice({ kind: "refused", text: `Not recorded. ${e instanceof ApiError ? messages[e.code] ?? "This action is unavailable. Read the updated record below." : "Align could not be reached. Try again."}` }); after(); return false;
    } finally { writing.current = false; setBusy(false); }
  };
  return { busy, notice, write };
}

function BudgetLinks({ ws, rows }: { ws: string; rows: BudgetRequestView[] }) {
  return <ul className="divide-y divide-(--line)">{rows.map((r) => <li key={r.id} className="py-2 text-[14px] [overflow-wrap:anywhere]">
    <Link className="inline-flex min-h-[44px] items-center text-(--accent-text) underline" href={budgetHref(ws, r)}>Review budget request for {r.team.name}</Link>
    <p>{r.requester.name} asked for {usd(r.amount_usd_micros)} estimated at list price. {r.state_note}</p>
    <p>Filed from the {r.filed_from === "browser" ? "browser" : "terminal"}.</p>
    <p className="text-(--text-2)">Requested budget: {r.team.name}, {r.month} UTC.</p>
    {r.decision_unavailable_reason && <p>{r.decision_unavailable_reason}</p>}
    {r.second_look_unavailable_reason && r.state === "declined" && <p>{r.second_look_unavailable_reason}</p>}
  </li>)}</ul>;
}

export function BudgetRequestsTab({ ws }: { ws: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)), [cursor, setCursor] = useState("");
  const d = useApi<Groups>(`${base(ws)}/budget-requests?month=${month}&limit=50&cursor=${encodeURIComponent(cursor)}`);
  const rows = d.data ? [...new Map([...d.data.waiting_on_me, ...d.data.mine, ...d.data.others].map((r) => [r.id, r])).values()] : [];
  return <Panel title="Budget requests" className="my-5">
    <FormField label="Request month (UTC)"><TextInput type="month" value={month} onChange={(e) => { setMonth(e.target.value); setCursor(""); }} /></FormField>
    {d.loading && <Loading />}<Err>{d.error}</Err>
    {!d.error && d.data && (rows.length ? <BudgetLinks ws={ws} rows={rows} /> : <p>No budget requests yet.</p>)}
    {d.data?.next_cursor && <Btn kind="secondary" onClick={() => setCursor(d.data!.next_cursor!)}>Next page</Btn>}{cursor && <Btn kind="secondary" onClick={() => setCursor("")}>First page</Btn>}
  </Panel>;
}

function HomeTeamChoice({ ws }: { ws: string }) {
  const d = useApi<HomeTeam>(`${base(ws)}/spend/home-team`);
  const action = useBudgetWrite(d.reload, `home-team:${ws}`);
  const [saved, setSaved] = useState<string | null>(() => { try { return sessionStorage.getItem(`align.homeTeamSaved:${ws}`); } catch { return null; } });
  return <Panel title="Your home team for work in no goal" className="mb-4">
    {d.loading && <Loading />}<Err>{d.error}</Err>
    {!d.error && d.data && <>
      <p className="text-[14px] text-(--text-2)">{d.data.team ? `Your home team is ${d.data.team.name}.` : "You belong to no team. Your spend in no goal stays unallocated."} Changing this choice affects future spending periods.</p>
      {d.data.can_choose && <form onSubmit={(e) => { e.preventDefault(); void action.write(`${base(ws)}/spend/home-team`, { team_id: new FormData(e.currentTarget).get("team_id") }, "PUT", (result) => { const id = (result as HomeTeam).team!.id; setSaved(id); try { sessionStorage.setItem(`align.homeTeamSaved:${ws}`, id); } catch { /* storage unavailable */ } }); }} className="mt-3 grid gap-3">
        <FormField label="Home team"><SelectInput name="team_id" defaultValue={d.data.team?.id} key={d.data.team?.id}>{d.data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectInput></FormField>
        <div><Btn kind="secondary" type="submit" disabled={action.busy}>Save home team</Btn></div>
      </form>}
    </>}
    {action.notice?.kind === "refused" ? <NoticeBox notice={action.notice} /> : saved && saved === d.data?.team?.id ? <NoticeBox notice={{ kind: "done", text: "Home team saved. This choice applies to future spending periods." }} /> : action.notice && <NoticeBox notice={action.notice} />}
  </Panel>;
}

export function TeamBudgets({ ws, detail }: { ws: string; detail: WsDetail | null }) {
  const query = useSearchParams();
  const [chosenTeam, setTeam] = useState(query.get("team") ?? "");
  const [month, setMonth] = useState(query.get("month") ?? new Date().toISOString().slice(0, 7));
  const home = useApi<HomeTeam>(`${base(ws)}/spend/home-team`);
  const [changed, setChanged] = useState(0);
  const team = chosenTeam || home.data?.team?.id || "";
  const request = query.get("request");
  const teams = detail?.teams.filter((t) => detail.role === "owner" || t.my_role !== null) ?? [];
  return <div data-team-spending className="min-w-0 [overflow-wrap:anywhere]">
    <HomeTeamChoice ws={ws} />
    <Panel title="Team budget" className="mb-4">
      <p className="mb-3 text-[14px] text-(--text-2)">Goal-bound spend counts toward the goal team&apos;s budget. Spend in no goal counts toward the home team&apos;s budget recorded when its spending period opened. All amounts are estimates at list price. Work continues when a budget is reached.</p>
      {!detail ? <Loading /> : teams.length === 0 ? <p>No team budgets are available to you.</p> : <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <FormField label="Budget team"><SelectInput value={team} onChange={(e) => setTeam(e.target.value)}><option value="">Choose a team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectInput></FormField>
        <FormField label="Budget month (UTC)"><TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} min="0001-01" max="9999-12" /></FormField>
      </div>}
    </Panel>
    {request && <BudgetRequestRecord key={request} ws={ws} id={request} onChanged={() => setChanged((n) => n + 1)} />}
    {team && month && <TeamMonth key={`${team}:${month}:${changed}`} ws={ws} team={team} month={month} />}
  </div>;
}

function TeamMonth({ ws, team, month }: { ws: string; team: string; month: string }) {
  const d = useApi<BudgetBurn>(`${base(ws)}/teams/${team}/budget?month=${encodeURIComponent(month)}`);
  const [cursor, setCursor] = useState("");
  const requests = useApi<Groups>(`${base(ws)}/teams/${team}/budget-requests?month=${encodeURIComponent(month)}&limit=50&cursor=${encodeURIComponent(cursor)}`);
  const refresh = () => { d.reload(); requests.reload(); };
  const r = !d.error ? d.data : null;
  const rows = requests.data ? [...new Map([...requests.data.waiting_on_me, ...requests.data.mine, ...requests.data.others].map((r) => [r.id, r])).values()] : [];
  return <>
    <Panel title={r ? `${r.team.name}, ${month} UTC` : "Budget and estimates"} className="mb-4">
      {d.loading && <Loading />}<Err>{d.error}</Err>
      {r && <>
        {!r.budget && <p>No team budget for this month.</p>}
        {(r.reached_thresholds ?? []).map((threshold) => <p key={threshold} data-budget-threshold={threshold} className="my-2 text-[14px]">
          {r.team.name} has reached {threshold}% of its budget {r.month === new Date().toISOString().slice(0, 7) ? "this month" : `for ${r.month} UTC`}, estimated at list price. Computed {when(r.as_of)}.
        </p>)}
        <dl className="my-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-burn>
          {[["Base budget", r.budget ? usd(r.budget.amount_usd_micros) : "Not set"], ["Budget including grants", r.budget ? amount(r.effective_budget_usd_micros) : "No budget"], ["Spend estimate at list price", amount(r.estimated_spend_usd_micros, r.spend_bound)], ["Remaining estimate", r.budget ? amount(r.remaining_usd_micros, r.remaining_bound) : "No team budget"], ["Month-end forecast estimate", r.budget ? amount(r.forecast_usd_micros, r.forecast_bound) : "No team budget"], ["Allowance left this month", r.allowance_remaining_usd_micros === null ? "No allowance" : usd(r.allowance_remaining_usd_micros)], ["Spend in no goal, estimate", amount(r.no_goal.estimated_spend_usd_micros, r.no_goal.spend_bound)]].map(([label, value]) => <div key={label}><dt className="text-[13px] text-(--text-2)">{label}</dt><dd className="font-medium text-(--text-1)">{value}</dd></div>)}
        </dl>
        {r.no_goal.attribution_unknown && <Note>Team attribution is incomplete for this month. Complete amounts are unknown.</Note>}
        <Note>{r.pricing_note} {r.unpriced_requests === null ? `The complete unpriced count is unknown; ${r.known_unpriced_requests} known.` : `${r.unpriced_requests} unpriced ${r.unpriced_requests === 1 ? "request" : "requests"}.`}</Note>
        {r.runs_out_at && <p className="text-[14px]">Estimated date the budget is reached: {when(r.runs_out_at)}. This is an estimate.</p>}
        <p className="text-[13px] text-(--text-3)">Observed {when(r.as_of)}.</p>
        {r.can.manage && <BudgetForm key={r.budget?.updated_at ?? "absent"} ws={ws} r={r} after={refresh} />}
        {r.history.length > 0 && <details className="mt-3"><summary className="min-h-[44px] cursor-pointer">Budget history</summary><ul>{r.history.map((h) => <li key={h.id} className="py-2 text-[14px]">{h.actor.name} {h.action} the budget {when(h.at)}. {h.amount_usd_micros !== null && <>Estimated amount {usd(h.amount_usd_micros)}; allowance {h.allowance_usd_micros === null ? "none" : usd(h.allowance_usd_micros)}; monthly ceiling {h.allowance_ceiling_usd_micros === null ? "none" : usd(h.allowance_ceiling_usd_micros)}.</>}</li>)}</ul></details>}
      </>}
    </Panel>
    {r?.can.request && <RequestForm ws={ws} r={r} after={refresh} />}
    <Panel title="Requests for this team and month" className="mb-4">
      {requests.loading && <Loading />}<Err>{requests.error}</Err>
      {!requests.error && requests.data && (rows.length ? <BudgetLinks ws={ws} rows={rows} /> : <p>No budget requests for this month.</p>)}
      {requests.data?.next_cursor && <Btn kind="secondary" onClick={() => setCursor(requests.data!.next_cursor!)}>Next page</Btn>}{cursor && <Btn kind="secondary" onClick={() => setCursor("")}>First page</Btn>}
    </Panel>
  </>;
}

function moneyError(value: FormDataEntryValue | null, label: string, positive = false, optional = false) {
  const text = String(value ?? "").trim();
  if (!text) return optional ? null : `Enter ${label}${positive ? "." : ", or enter 0 explicitly."}`;
  const n = Number(text);
  return !/^\d+(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(n) || n < (positive ? 0.01 : 0) || n > 1_000_000 ? `Enter ${label} in dollars and cents${positive ? ", greater than zero" : ""}, up to 1,000,000.` : null;
}
const reasonError = (value: FormDataEntryValue | null) => !String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b]/g, "").trim() ? "Explain why this request is needed." : null;

function BudgetForm({ ws, r, after }: { ws: string; r: BudgetBurn; after: () => void }) {
  const savedKey = `align.budgetSaved:${ws}:${r.team.id}:${r.month}`;
  const [saved] = useState<Notice | null>(() => { try {
    const version = r.budget?.updated_at ?? r.history.at(-1)?.id;
    return version && sessionStorage.getItem(savedKey) === version ? { kind: "done", text: r.budget ? "Budget saved." : "Budget removed." } : null;
  } catch { return null; } });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const action = useBudgetWrite(after, `budget:${ws}:${r.team.id}:${r.month}`), path = `${base(ws)}/teams/${r.team.id}/budget?month=${r.month}`;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const errors = { amount: moneyError(f.get("amount"), "the budget amount"), allowance: moneyError(f.get("allowance"), "the allowance", false, true), ceiling: moneyError(f.get("ceiling"), "the monthly ceiling", false, true) };
    if (f.get("ceiling") && !f.get("allowance")) errors.allowance = "Enter an allowance before setting its monthly ceiling.";
    setErrors(errors); if (Object.values(errors).some(Boolean)) return;
    void action.write(path, { amount_usd: Number(f.get("amount")), allowance_usd: f.get("allowance") === "" ? null : Number(f.get("allowance")), allowance_ceiling_usd: f.get("ceiling") === "" ? null : Number(f.get("ceiling")) }, "PUT", (data) => { try { sessionStorage.setItem(savedKey, (data as BudgetBurn).budget!.updated_at); } catch { /* storage unavailable */ } });
  };
  return <form noValidate onSubmit={submit} className="mt-4 grid gap-3" data-budget-form>
    <h3 className="font-medium">{r.budget ? "Change budget" : "Set budget"}</h3>
    <FormField label="Budget estimate (USD), required" error={errors.amount}><TextInput name="amount" required type="number" min="0" max="1000000" step="0.01" defaultValue={dollars(r.budget?.amount_usd_micros)} /></FormField>
    <FormField label="Allowance per request (USD)" optional error={errors.allowance}><TextInput name="allowance" type="number" min="0" max="1000000" step="0.01" defaultValue={dollars(r.budget?.allowance_usd_micros)} /></FormField>
    <FormField label="Monthly allowance ceiling (USD)" optional error={errors.ceiling} hint="Leave blank to use the allowance amount. This never resets allowance grants already made this month."><TextInput name="ceiling" type="number" min="0" max="1000000" step="0.01" defaultValue={dollars(r.budget?.allowance_ceiling_usd_micros)} /></FormField>
    <div className="flex flex-wrap gap-3"><Btn kind="secondary" type="submit" disabled={action.busy}>Save budget</Btn>{r.budget && <Btn kind="secondary" disabled={action.busy} onClick={() => void action.write(path, undefined, "DELETE", (data) => { try { sessionStorage.setItem(savedKey, (data as BudgetBurn).history.at(-1)!.id); } catch { /* storage unavailable */ } })}>Remove budget</Btn>}</div>
    {(action.notice?.kind === "refused" ? action.notice : saved || action.notice) && <NoticeBox notice={(action.notice?.kind === "refused" ? action.notice : saved || action.notice)!} />}
  </form>;
}

function RequestForm({ ws, r, after }: { ws: string; r: BudgetBurn; after: () => void }) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const action = useBudgetWrite(after, `budget-request:${ws}:${r.team.id}`);
  const goals = useApi<{ goals: Goal[] }>(`${base(ws)}/goals`);
  const sessions = useApi<{ mine: MySession[] }>(`${base(ws)}/sessions`);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = e.currentTarget, f = new FormData(form);
    const errors = { amount: moneyError(f.get("amount"), "the requested amount", true), reason: reasonError(f.get("reason")) };
    setErrors(errors); if (Object.values(errors).some(Boolean)) return;
    void action.write(`${base(ws)}/teams/${r.team.id}/budget-requests`, { amount_usd: Number(f.get("amount")), reason: f.get("reason"), goal_id: f.get("goal") || null, session_keys: f.getAll("sessions") }, "POST", () => { form.reset(); setErrors({}); });
  };
  return <Panel title={`Ask for more from ${r.team.name}'s budget`} className="mb-4">
    <form noValidate onSubmit={submit} className="grid gap-3" data-budget-request-form>
      <FormField label="Amount requested, estimate (USD), required" error={errors.amount}><TextInput type="number" name="amount" min="0.01" max="1000000" step="0.01" /></FormField>
      <FormField label="Why more is needed, required" error={errors.reason}><TextArea name="reason" maxLength={1000} /></FormField>
      <FormField label="Goal this work serves" optional hint="Choose a readable goal when one applies. Its spend still counts toward that goal team's budget, even if you ask a different team here."><SelectInput name="goal"><option value="">No linked goal</option>{goals.data?.goals.map((g) => <option value={g.id} key={g.id}>{g.title} ({g.team?.name ?? "no team"})</option>)}</SelectInput></FormField>
      <Err>{goals.error}</Err><Err>{sessions.error}</Err>
      <fieldset className="min-w-0"><legend className="text-[13px] font-medium">Your shared sessions, optional</legend>{sessions.data?.mine.filter((s) => s.state === "shared").map((s) => <label key={s.session_key} className="flex min-h-[44px] items-start gap-2 py-2 text-[14px]"><input type="checkbox" name="sessions" value={s.session_key} className="mt-1" /><span>{s.title || s.repo_alias || `${s.harness} session`} · {when(s.started_at)}<span className="block text-(--text-2)">{s.team_budget_label}</span></span></label>)}</fieldset>
      <Note>Within the per-request allowance and remaining monthly ceiling, a grant is recorded under the team&apos;s allowance. Other requests wait for a decision. The requester cannot decide their own request. Nothing blocks work.</Note>
      <div><Btn kind="secondary" type="submit" disabled={action.busy}>Send budget request</Btn></div>{action.notice && <NoticeBox notice={action.notice} />}
    </form>
  </Panel>;
}

export function BudgetRequestRecord({ ws, id, onChanged }: { ws: string; id: string; onChanged?: () => void }) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const d = useApi<BudgetRequestView>(`${base(ws)}/budget-requests/${id}`);
  const action = useBudgetWrite(() => { d.reload(); onChanged?.(); }, `budget-request:${id}`), r = !d.error ? d.data : null;
  const decide = (e: FormEvent<HTMLFormElement>, verb: "approve" | "decline") => {
    e.preventDefault(); if (!r) return; const f = new FormData(e.currentTarget);
    const errors: Record<string, string | null> = verb === "approve" ? { amount: moneyError(f.get("amount"), "the approved amount", true), expiry: !f.get("expiry") || !Number.isFinite(Date.parse(`${f.get("expiry")}:00.000Z`)) || Date.parse(`${f.get("expiry")}:00.000Z`) <= Date.now() || Date.parse(`${f.get("expiry")}:00.000Z`) > spendMonth(r.month).end ? "Enter a future UTC time within this month." : null } : { reason: reasonError(f.get("reason")) };
    if (verb === "approve" && Number(f.get("amount")) * 1_000_000 > r.amount_usd_micros) errors.amount = "The approved amount cannot exceed the requested amount.";
    setErrors(errors); if (Object.values(errors).some(Boolean)) return;
    void action.write(`${base(ws)}/budget-requests/${id}/${verb}`, { revision: r.revision, ...(verb === "approve" ? { amount_usd: Number(f.get("amount")), expires_at: `${f.get("expiry")}:00.000Z`, note: f.get("note") } : { reason: f.get("reason") }) });
  };
  return <div data-budget-request={id}><Panel title="Budget request record" className="mb-4">
    {d.loading && <Loading />}<Err>{d.error}</Err>{action.notice && <NoticeBox notice={action.notice} />}
    {r && <>
      <h3 className="font-medium">{r.requester.name} asked for {usd(r.amount_usd_micros)}, estimated at list price.</h3>
      <Note>Requested team budget: {r.team.name}, {r.month} UTC.</Note>
      <p>Filed from the {r.filed_from === "browser" ? "browser" : "terminal"}.</p>
      <p>{r.state_note}</p><p className="my-3 whitespace-pre-wrap">{r.reason}</p>
      {r.goal && <Link className="text-(--accent-text) underline" href={`/app/w/${ws}/goals/${r.goal.id}`}>Linked goal: {r.goal.title}</Link>}
      {r.goal_hidden && <p>The linked goal is not visible to you.</p>}
      <p className="text-[13px] text-(--text-2)">Requested {when(r.created_at)}. {r.session_count} attached {r.session_count === 1 ? "session" : "sessions"}.</p>
      {r.authority_label && <p>{r.authority_label} Granted estimate {amount(r.approved_usd_micros)}, expires {r.expires_at ? when(r.expires_at) : "unknown"}.</p>}
      <ul className="my-3 divide-y divide-(--line)" data-budget-decisions>{r.decisions.map((v) => <li key={v.round} className="py-2 text-[14px]">{v.round === 2 ? "Second look. " : ""}{v.actor.name} {v.decision === "granted" ? "granted this request as an approver" : "declined this request as an approver"} {when(v.at)}.{v.amount_usd_micros !== null && <> Estimated grant {usd(v.amount_usd_micros)} until {v.expires_at ? when(v.expires_at) : "unknown"}.</>}<p className="whitespace-pre-wrap">{v.note}</p></li>)}</ul>
      {r.decision_unavailable_reason && <Note>{r.decision_unavailable_reason}</Note>}
      {r.state === "waiting" && r.approvers.length > 0 && <p className="my-3 text-[14px]">Waiting on one of: {r.approvers.map((a) => a.name).join(", ")}.</p>}
      {r.can.approve && <form noValidate onSubmit={(e) => decide(e, "approve")} className="my-4 grid gap-3" data-budget-approve>
        <FormField label="Approved estimate (USD), required" error={errors.amount}><TextInput type="number" name="amount" step="0.01" min="0.01" max={dollars(r.amount_usd_micros)} defaultValue={dollars(r.amount_usd_micros)} /></FormField>
        <FormField label="Grant expiry (UTC), required" error={errors.expiry} hint="Enter a UTC date and time, no later than the first day of next month."><TextInput name="expiry" type="datetime-local" step="60" max={new Date(Date.UTC(Number(r.month.slice(0, 4)), Number(r.month.slice(5)), 1)).toISOString().slice(0, 16)} defaultValue={new Date(Date.UTC(Number(r.month.slice(0, 4)), Number(r.month.slice(5)), 1)).toISOString().slice(0, 16)} /></FormField>
        <FormField label="Approval note" optional><TextArea name="note" maxLength={1000} /></FormField>
        <div><Btn kind="secondary" type="submit" disabled={action.busy}>Approve budget request</Btn></div>
      </form>}
      {r.can.decline && <form noValidate onSubmit={(e) => decide(e, "decline")} className="my-4 grid gap-3" data-budget-decline>
        <FormField label="Why you are declining, required" error={errors.reason}><TextArea name="reason" maxLength={1000} /></FormField><div><Btn kind="secondary" type="submit" disabled={action.busy}>Decline budget request</Btn></div>
      </form>}
      <div className="flex flex-wrap gap-3">{r.can.withdraw && <Btn kind="secondary" disabled={action.busy} onClick={() => void action.write(`${base(ws)}/budget-requests/${id}/withdraw`, { revision: r.revision })}>Withdraw budget request</Btn>}
        {r.can.second_look && <Btn kind="secondary" disabled={action.busy} onClick={() => void action.write(`${base(ws)}/budget-requests/${id}/second-look`, { revision: r.revision })}>Ask for a second look</Btn>}</div>
      {r.state === "declined" && r.second_look_unavailable_reason && <Note>{r.second_look_unavailable_reason}</Note>}
    </>}
  </Panel></div>;
}
