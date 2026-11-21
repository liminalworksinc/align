import fs from "node:fs";
import { gitInfo } from "../shared/anchors.ts";
import { layout, spoolWrite } from "../shared/layout.ts";
import { readJson, writeJsonAtomic } from "../shared/fsx.ts";
import { clean, LIMIT_WORDS } from "../shared/envelope.ts";
import { EVIDENCE_WORDS, type AnalysisNotice, type AnalysisTurn } from "../shared/analysis.ts";
import type { Harness, InjectedState } from "../shared/types.ts";

type LastNotice = { id: string; root: string; version: number; limit: string; digest: string }[];

export function rememberNotice(home: string, lid: string, notice: LastNotice) {
  if (notice.length) writeJsonAtomic(layout.analysisLast(home, lid), notice);
}

export function finishTurn(home: string, lid: string, root: string, version: number | null) {
  writeJsonAtomic(layout.analysisEnd(home, lid), { root, version });
}

function driftOn(home: string) {
  return readJson<{ drift?: boolean }>(layout.config(home))?.drift !== false;
}

export function rememberTurn(home: string, lid: string, state: AnalysisTurn) {
  try {
    if (readJson<AnalysisTurn>(layout.analysisTurn(home, lid))?.root === state.root) return;
    writeJsonAtomic(layout.analysisTurn(home, lid), { ...state, git: state.cwd ? gitInfo(state.cwd) : null });
  } catch {
    /* The analysis reference must not interrupt goal delivery. */
  }
}

/** The hook only records the reference. When the prompt supplied it, the worker owns all reading. */
export function queueTurn(home: string, lid: string, harness: Harness, session: string, root: string | undefined, file: string | null) {
  const turn = readJson<AnalysisTurn>(layout.analysisTurn(home, lid));
  if (!turn || (root && turn.root !== root && !turn.root.startsWith("ts:"))) return { queued: false, turn: null };
  finishTurn(home, lid, turn.root, turn.binding?.goal.version ?? null);
  const transcript = file || turn.transcript;
  if (!transcript && turn.binding) return { queued: false, turn };
  const ts = new Date().toISOString();
  const legacy = !transcript || (!!turn.binding && !turn.transcript);
  let endOffset: number | undefined;
  try {
    if (transcript) {
      const stat = fs.statSync(transcript);
      if (stat.isFile()) endOffset = stat.size;
    }
  } catch {
    /* The harness may finish writing after Stop. */
  }
  spoolWrite(home, { type: "analysis_turn", harness, native_id: session, turn: { ...turn, transcript, endOffset }, ts, legacy });
  return { queued: !legacy, turn };
}

type NoticeHistory = { seen: string[]; count: Record<string, number> };
const noticeHistory = (home: string, lid: string): NoticeHistory =>
  readJson<NoticeHistory>(layout.analysisSeen(home, lid)) ?? { seen: [], count: {} };

export function analysisNoticeSeen(home: string, lid: string) {
  return noticeHistory(home, lid).seen;
}

export function analysisNoticeCounts(home: string, lid: string) {
  return noticeHistory(home, lid).count;
}

export function takeAnalysisNotice(home: string, lid: string, inj: InjectedState, max: number, cap: number): string | null {
  if (!driftOn(home)) return null;
  const items = readJson<AnalysisNotice[]>(layout.analysis(home, lid));
  if (!items?.length || readJson<{ signed_out?: boolean }>(layout.me(home))?.signed_out) return null;
  const history = noticeHistory(home, lid);
  const counts = history.count;
  const seen = new Set([...history.seen, ...(inj.drift_seen ?? [])]);
  const eligible = items.filter((f) => (counts[f.limit.id] ?? 0) + (inj.drift_count?.[f.limit.id] ?? 0) < cap && !seen.has(`${f.limit.id}:${f.repeat ?? f.digest}`));
  if (!eligible.length) return null;
  const first = eligible[0];
  const named = new Map<string, AnalysisNotice[]>();
  for (const finding of eligible) {
    if (finding.root !== first.root) break;
    const group = named.get(finding.limit.id);
    if (group) group.push(finding);
    else if (named.size < max) named.set(finding.limit.id, [finding]);
  }
  const selected = [...named.values()];
  const last: LastNotice = selected.flatMap((group) => group.map((f) => ({ id: f.id, root: f.root, version: f.version, limit: f.limit.id, digest: f.digest })));
  rememberNotice(home, lid, last);
  for (const group of selected) {
    const id = group[0].limit.id;
    counts[id] = (counts[id] ?? 0) + 1;
    for (const finding of group) seen.add(`${id}:${finding.repeat ?? finding.digest}`);
  }
  writeJsonAtomic(layout.analysisSeen(home, lid), { seen: [...seen], count: counts });
  const detail = selected.map((group) => {
    const { limit } = group[0];
    const reasons = [...new Set(group.map((f) => EVIDENCE_WORDS[f.evidence]))];
    return `${LIMIT_WORDS[limit.type]} "${clean(limit.text, 160)}" (${limit.id}). ${reasons.join(" ")}`;
  });
  return [
    `Align: work may have crossed a limit on "${clean(first.title, 80)}" (version ${first.version}).`,
    ...detail,
    ...(selected.some((group) => group.some((finding) => finding.evidence === "model"))
      ? [`See the final reply on this machine with align analysis show ${lid.slice(0, 8)}.`] : []),
    "Type \`::align drift wrong\` to mark this notice as a false alarm, or add a limit id to mark one. \`align config drift off\` turns off these notices.",
  ].join("\n");
}

export function driftFeedback(home: string, lid: string, arg: string, ts: string): string {
  const [choice, id, extra] = arg.trim().split(/\s+/);
  if (!extra && choice === "missed" && !id) {
    const turn = readJson<{ root: string; version: number | null }>(layout.analysisEnd(home, lid));
    if (!turn) return "Align: there is no completed turn to mark.";
    spoolWrite(home, { type: "drift_feedback", local_id: lid, ts, feedback: { ...turn, kind: "missed", finding: null, at: ts } });
    return "Align: recorded a missed limit check on this machine.";
  }
  if (!extra && choice === "wrong") {
    const choices = readJson<LastNotice>(layout.analysisLast(home, lid)) ?? [];
    const findings = id ? choices.filter((f) => f.limit === id || f.id === id) : choices;
    if (!findings.length) return "Align: that limit was not in the last analysis notice.";
    for (const f of findings) spoolWrite(home, {
      type: "drift_feedback", local_id: lid, ts, feedback: { kind: "wrong", root: f.root, version: f.version, finding: f.id, digest: f.digest, at: ts },
    });
    return "Align: recorded false alarm feedback on this machine.";
  }
  return "Align: type `::align drift wrong [limit id]` or `::align drift missed`.";
}
