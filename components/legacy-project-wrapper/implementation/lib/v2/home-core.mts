// Typed public names for the independently qualified Home attention library.
import * as native from "../native/.bindings/home_attention.js";

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];
export interface HomePerson {
    id: string;
    name: string;
}
/** What an open item needs next: an approver decides, the requester accepts (or withdraws) a counter, the requester
 *  updates the request to the goal's current version, an approver suggests a change to (or declines) a request that
 *  would close a dependency loop (C5-1), someone who may launch launches it (LAUNCH-001), a team lead accepts an ask,
 *  the team marks an accepted ask done. */
export type HomeNext = "decide" | "accept_counter" | "rebase" | "resolve_loop" | "launch" | "accept" | "done";
export type UnlaunchedState = (typeof UNLAUNCHED_STATES)[number];

const values = native.data() as {
    EVIDENCE_CLASSES: readonly [
        "delivery_receipt",
        "agent_reported",
        "not_observed"
    ];
    EVIDENCE_WORDS: Record<EvidenceClass, string>;
    UNLAUNCHED_STATES: readonly [
        "pending",
        "not_yet"
    ];
};

export const EVIDENCE_CLASSES = values.EVIDENCE_CLASSES;
export const EVIDENCE_WORDS = values.EVIDENCE_WORDS;
export const UNLAUNCHED_STATES = values.UNLAUNCHED_STATES;

export const appEvidence = native.app_evidence as (lastReadAt: string | null | undefined) => EvidenceClass;
export const activityEvidence = native.activity_evidence as (a: {
    sessions: number;
    last_activity_at: string | null;
}) => EvidenceClass;
export const answerEvidence = native.answer_evidence as (state: string, autoAccepted?: boolean) => EvidenceClass;
export const receiptEvidence = native.receipt_evidence as (receipts: number) => EvidenceClass;
export const appStatusWords = native.app_status_words as (a: {
    approved_at: string;
    last_used_at: string | null;
    last_read_at: string | null;
}, at: (iso: string) => string) => string;
export const changeWaits = native.change_waits as (v: {
    state: string;
    behind: boolean;
    requester: HomePerson;
    approvers: HomePerson[];
    dependency_loop?: string | null;
}) => {
    next: HomeNext;
    waiting_on: HomePerson[];
} | null;
export const alignmentWaits = native.alignment_waits as (a: {
    state: string;
    requester: HomePerson;
    requirements: {
        approvers: HomePerson[];
        approved_by: HomePerson | null;
    }[];
}) => {
    next: HomeNext;
    waiting_on: HomePerson[];
} | null;
export const launchWaits = native.launch_waits as (v: unknown) => {
    state: UnlaunchedState;
    can_launch: boolean;
    launchers: HomePerson[];
} | null;
