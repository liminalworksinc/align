# ADR 0007: Consent for goal suggestions

- Status: Proposed, founder-reviewed 2026-11-25; awaiting her sign-off on the PR.
- Packet: LIM-2527. Rewritten under LIM-2529.
- Builds on [ADR 0006](0006-session-data-boundary.md) and the PR #117 grant model.

## The ordering (decided 2026-11-25)

The founder's words: "yes send that ordering".

1. **Goal suggestions: the agent's own session first.** The agent does the analysis in its existing session and account,
   and hands Align only the structured result through the MCP tool. No new vendor, no Liminal model cost. The person
   confirms the suggestion, and **that confirmation is the check**, so the earlier "abstain until the harness can prove
   the provider and account" gate is dropped for this use.
2. **Anything a person relies on to judge an agent uses an independent model, never the same agent grading itself.**
   That covers model limit checks (ADR 0008). It runs under the vendor rules below.
3. **No subscription login.** Align never offers Claude.ai login or routes through a person's Pro or Max credentials.
   Anthropic's terms forbid this for third-party apps
   ([legal and compliance, "Authentication and credential use"](https://code.claude.com/docs/en/legal-and-compliance.md)).
   MCP sampling: revisit when Claude Code or Codex documents support for it. As of 2026-11-25 the Claude Code MCP
   documentation does not mention it.
4. **Elicitation is not proof of a person,** because hooks can answer it in headless runs. Consent stays browser-only
   (ADR 0006).

## Decisions

| Decision | Ruling | Alternatives considered |
| --- | --- | --- |
| Metadata default | Keep the November 12 default. Rules are computed on this machine. | Revisit in a separate decision. |
| Own-session route (formerly "tier 3, session question") | **Kept, and first.** The agent's own session analyses its own work and returns a structured suggestion through MCP; the person confirms it. (Decided 2026-11-25. Her interview answer "Keep it" kept the route; the later ordering ruling removed its abstain gate for goal suggestions.) | Ask a separate fork, or omit this route. |
| Independent model (formerly "tier 3, decision provider") | **Liminal's account by default.** Off until the workspace owner picks a provider from a Liminal-supported list: Anthropic, OpenAI or Google. It then runs under Liminal's account, with Liminal as processor and the provider named as subprocessor. A workspace may bring its own key instead. **No default provider.** (Decided 2026-11-25; replaces "the person's own provider and key" and the TypeSafe Jev default.) | The person's own key; a default provider. |
| When the independent model is used | For anything a person relies on to judge an agent (ADR 0008's limit check). Goal suggestions use the own-session route. (Decided 2026-11-25.) | Use it for suggestions too. |
| Vendor rules | The author opts in or a goal rule covers it; secrets removed on the machine first; mostly-redacted payloads refused; the recipient named on the grant; every send on the receipt; the owner can veto. (Decided 2026-11-25; ADR 0006.) | |
| Dispatch permission | A server-issued, single-use grant per PR #117, bound to the current bindable goal set and policy, consumed with the write. A policy change voids it. Answers that arrive after a block are discarded. | A cached policy. |
| Branch provenance | Use the local Git snapshot from the turn, with unknown branch when a snapshot is missing. (Unchanged.) | Send only the saved repo alias and prompt. |
| Abstention | Start with an independent fit answer, a choice including none, and a conservative minimum score and margin. Keep any correction on the machine. (Unchanged.) | Labelled calibration before enabling. |

## Trust wording (proposed, for the trust page and the consent screen)

> **Goal suggestions.** Your own coding agent reads its session and suggests which goal it serves. Only the suggestion
> reaches Align, and you confirm it.
>
> **Independent checks.** When your workspace owner turns on checks, Align asks an independent model, from the provider
> the owner picked (Anthropic, OpenAI or Google), to check an agent's work. It runs under Liminal's account; Liminal is
> the processor and the provider is a subprocessor. Your workspace may use its own key instead. Secrets are removed on
> your machine first, each send names who receives it, and every send is on your weekly receipt. Nothing is sent from
> your words unless you allow it or a goal rule you set covers it.

Tier 2, deliberate excerpts and central transcripts stay under ADR 0006 and ADR 0008.
