export const EPOCH_ORIGINS = ["hand", "folder_rule", "anchor_hint", "alignment", "switch_request", "past_import", "suggested_agent", "suggested_model"] as const;
export type EpochOrigin = (typeof EPOCH_ORIGINS)[number];

const labels: Record<EpochOrigin, string> = {
  hand: "Shared by hand",
  folder_rule: "Folder rule",
  anchor_hint: "After a repo hint",
  alignment: "Alignment",
  switch_request: "Switch request accepted",
  past_import: "Past sessions import",
  suggested_agent: "Suggested by an agent",
  suggested_model: "Suggested by a model",
};

export function epochOriginLabel(origin: EpochOrigin | null | undefined): string {
  return origin ? labels[origin] : "Not recorded";
}
