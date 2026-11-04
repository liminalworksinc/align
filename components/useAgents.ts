"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/useAlign";

// Connected AI apps, as GET /api/workspaces/connections reports them (custom workspaces only; Northstar has none).
// Align knows two things about an app, never what it does: when it last called a tool (last_used_at; initialize,
// tools/list, ping and notifications don't count, app/api/mcp/route.ts), stamped with the plan revision current then
// ("seen since the latest change", lib/plan-rev.ts), and the last agreed plan Align sent it from
// align_get_accepted_plan (plan_receipt, lib/oauth/grants.ts notePlanReceipt). received_current_plan: that receipt is
// the plan agreed now, at the same launch state. An approved app Align hasn't seen isn't connected yet.
export interface PlanReceipt {
  proposal_id: string;
  accepted_version: string;
  launch: "pending" | "approved";
  at: string;
}
export interface AgentApp {
  id: string;
  name: string;
  role: string;
  approved_at: string;
  last_used_at: string | null;
  on_current_plan?: boolean;
  plan_receipt?: PlanReceipt | null;
  received_current_plan?: boolean;
}
export interface Agents {
  apps: AgentApp[];
  changedAt: string | null;
}
/** null = not checked yet; "unknown" = the check failed before any good read (never shown as zero apps). */
export type AgentsRead = Agents | "unknown" | null;

/** Polls the connections list every 15 s; pass no workspace (Northstar, a Mode L scenario) to skip it. */
export function useAgents(workspace?: string): AgentsRead {
  const [data, setData] = useState<AgentsRead>(null);
  useEffect(() => {
    if (!workspace) return;
    let live = true;
    const load = () =>
      api<{ apps: AgentApp[]; plan?: { changed_at: string | null } }>("/api/workspaces/connections", { workspace }).then(
        (d) => live && setData({ apps: d.apps, changedAt: d.plan?.changed_at ?? null }),
        () => live && setData((d) => (d && d !== "unknown" ? d : "unknown")), // keep the last good read; never guess
      );
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 15000);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [workspace]);
  return data;
}
