// The terminal lines the Connect dialog shows (components/ConnectAI.tsx). A person pastes them into a shell, so nothing
// that comes from a workspace (its company name) or from the request (the URL, built from the Host header) may reach
// the shell or the `node -e` script as code: every value is checked, reduced to safe characters and single-quoted.
// scripts/test-paste-lines.mjs runs the lines in sh, bash and zsh with hostile names and URLs.

/** POSIX single quotes: nothing inside is expanded (no $, `, \, ! or newline handling) in sh, bash or zsh. */
export function shq(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

/**
 * The MCP URL the dialog shows, or null if it isn't one Align could have made: http(s), a host of letters, digits, dots,
 * dashes, an optional port or bracketed IPv6, and the path /api/mcp. Anything else shows no command at all.
 */
export function safeMcpUrl(url: string): string | null {
  return /^https?:\/\/(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?\/api\/mcp$/.test(url) ? url : null;
}

/** A company name as the Codex line writes it: letters, digits, spaces and . & ' - only, at most 60 characters. */
export function codexCompanyName(company: string): string {
  const name = company
    .replace(/[^\p{L}\p{N} .&'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const capped = Array.from(name).slice(0, 60).join("").trim(); // by code point, so no half of a pair is left
  return capped || "this company";
}

/** The marker the Codex line looks for in AGENTS.md, so the rule is added once. */
export const CODEX_MARKER = "check Align first";

/**
 * The Codex line also adds one instruction to Codex's global AGENTS.md: live (10-27), Codex asked for a cutover
 * runbook searched Drive and Linear and used a date the teams had moved; with this line it read Align first and used
 * the agreed one. Claude Code read Align unprompted. The line is added once. The rule is written with printf '%s\n',
 * so its text is never a format string, and every value is single-quoted.
 */
export function codexLine(url: string, company: string): string | null {
  const u = safeMcpUrl(url);
  if (!u) return null;
  const rule = `- For any work for ${codexCompanyName(company)}'s teams, ${CODEX_MARKER}: call the align MCP server's align_get_directives and align_get_accepted_plan before planning. Its dates and commitments replace older documents.`;
  return `codex mcp add align --url ${shq(u)}; F="\${CODEX_HOME:-$HOME/.codex}/AGENTS.md"; grep -qsF ${shq(CODEX_MARKER)} "$F" || printf '%s\\n' ${shq(rule)} >> "$F"`;
}

/**
 * The Claude Code line also adds two hooks to .claude/settings.local.json in the folder it runs in. Each calls
 * align_get_brief on the Align server Claude Code already signed in to: on the session's first prompt (Claude Code
 * can't call an MCP tool from a hook at launch, before its servers connect), and again after it compacts its context,
 * so the limits come back word for word (live 10-27: with the hook the agent quoted the limit after a lossy compaction;
 * without it, it had none). The session id lets Align skip later prompts that already have the brief. Folder only, so
 * unrelated sessions don't carry it. The script adds each hook once and leaves a file that isn't plain JSON as it is.
 * The script is a constant: no workspace value is put into it.
 */
export const BRIEF_HOOKS = String.raw`const fs=require("fs"),p=require("path"),f=p.join(process.cwd(),".claude","settings.local.json");let s={};try{s=JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){if(e.code!=="ENOENT"){console.log("Align: left "+f+" as it is (not plain JSON). Add the hooks by hand: see docs/MCP.md.");process.exit(0)}}const H=(s.hooks??={}),add=(ev,m)=>{const a=(H[ev]??=[]);if(!JSON.stringify(a).includes("align_get_brief"))a.push({...m,hooks:[{type:"mcp_tool",server:"align",tool:"align_get_brief",input:{format:"hook",event:ev,session:"$"+"{session_id}"}}]})};add("UserPromptSubmit",{});add("SessionStart",{matcher:"compact"});fs.mkdirSync(p.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(s,null,2));console.log("Align: brief hooks in "+f)`;

export function claudeCodeLine(url: string): string | null {
  const u = safeMcpUrl(url);
  if (!u) return null;
  return `claude mcp add --transport http --scope user align ${shq(u)}; claude mcp login align; command -v node >/dev/null && node -e ${shq(BRIEF_HOOKS)}`;
}
