// Typed consumer names for the independently qualified paste-line library.
import {
  shq as nativeShq,
  safe_mcp_url,
  claude_code_line,
  codex_line,
} from "./native/.bindings/paste_lines.js";

export const shq = nativeShq as (value: string) => string;
export const safeMcpUrl = safe_mcp_url as (url: string) => string | null;
export const claudeCodeLine = claude_code_line as (url: string) => string | null;
export const codexLine = codex_line as (url: string) => string | null;
