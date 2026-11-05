// Typed public names for the independently qualified wording library.
import * as native from "../native/.bindings/wording.js";

export interface FieldDiff {
    before: unknown;
    after: unknown;
    /** depends_on only: how many dependencies on each side the reader can't read (they are left out of before and
     *  after), so the words still count them (C5-3). */
    hidden?: {
        before: number;
        after: number;
    } | null;
}
export interface ChangeWordsOptions {
    /** Wraps a person's text (default: as is). */
    q?: (s: string) => string;
    /** A dependency's name (default: its id). */
    title?: (id: string) => string;
    arrow?: string;
}

const values = native.wording_data() as {
    DEPENDS_ON_MAX: 5;
    COUNTER_SAME_AS_PROPOSAL: "That's what the proposal already asks for: approve it instead.";
};

export const DEPENDS_ON_MAX = values.DEPENDS_ON_MAX;
export const COUNTER_SAME_AS_PROPOSAL = values.COUNTER_SAME_AS_PROPOSAL;

export const dependsOnFull = native.depends_on_full as (ticked: number, hidden: number) => string | null;
export const hiddenGoals = native.hidden_goals as (n: number) => string;
export const withHidden = native.with_hidden as (names: string[], hidden: number) => string;
export const changeWords = native.change_words as (field: string, d: FieldDiff, o?: ChangeWordsOptions) => string[];
export const diffWords = native.diff_words as (diff: Record<string, FieldDiff | undefined>, o?: ChangeWordsOptions) => string[];
export const counterNoChange = native.counter_no_change as (baseVersion: number, goalVersion: number) => string;
export const counterSameAsBase = native.counter_same_as_base as (baseVersion: number, goalVersion: number) => string;
export const counterSameAsRequest = native.counter_same_as_request as (requester: string, baseVersion: number, goalVersion: number) => string;
