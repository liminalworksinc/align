// Typed public names for the independently qualified value-card library.
import * as native from "../native/.bindings/value_rules.js";

export type EstimateId = (typeof ESTIMATE_WORDS)[number]["id"];

const values = native.value_data() as {
    ESTIMATE_WORDS: readonly [
        {
            readonly id: "same_day";
            readonly label: "Same day";
            readonly said: "same day";
        },
        {
            readonly id: "two_to_three_days";
            readonly label: "2\u20133 days";
            readonly said: "2\u20133 days";
        },
        {
            readonly id: "about_a_week";
            readonly label: "About a week";
            readonly said: "about a week";
        },
        {
            readonly id: "longer";
            readonly label: "Longer";
            readonly said: "longer than a week";
        },
        {
            readonly id: "would_not_be_decided";
            readonly label: "It wouldn\u2019t get decided";
            readonly said: "it wouldn\u2019t get decided";
        }
    ];
    VALUE_QUESTION: "Before Align, how long would getting this decision usually take?";
    VALUE_NOTE_MAX: 500;
    VALUE_EDIT_DAYS: 7;
};

export const ESTIMATE_WORDS = values.ESTIMATE_WORDS;
export const VALUE_QUESTION = values.VALUE_QUESTION;
export const VALUE_NOTE_MAX = values.VALUE_NOTE_MAX;
export const VALUE_EDIT_DAYS = values.VALUE_EDIT_DAYS;

export const estimateSaid = native.estimate_said as (id: string) => string;
export const cleanValueText = native.clean_value_text as (s: string) => string;
export const safeFollowUpUrl = native.safe_follow_up_url as (v: string | null | undefined) => string | null;
export const loiUrlOk = native.loi_url_ok as (url: string) => boolean;
export const followUpUrl = native.follow_up_url as (env?: Record<string, string | undefined>) => string | null;
export const followUpProblem = native.follow_up_problem as (env?: Record<string, string | undefined>) => string | null;
export const spanWords = native.span_words as (ms: number) => string;
