// Typed consumer names for the independently qualified heuristic shell reader.
import {
  parse as nativeParse,
  command_words as nativeCommandWords,
} from "../native/.bindings/shell_words.js";

export interface ShellCmd {
  words: string[];
  redirs: { op: string; target: string | null }[];
}

export const parseShell = nativeParse as (source: string) => ShellCmd[];
export const commandWords = nativeCommandWords as (words: string[]) => string[];
