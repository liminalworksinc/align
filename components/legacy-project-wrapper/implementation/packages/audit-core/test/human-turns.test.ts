// The ported human-turn filters must agree with liminal-desktop's golden fixtures (copied from 41af8850).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classifyClaudeLine, classifyCodexLine, codexSessionMeta } from "../src/local/human-turns.ts";

const dir = new URL("./fixtures/human-turns/", import.meta.url);
const expected = JSON.parse(readFileSync(new URL("expected.json", dir), "utf8"));
const lines = (file: string) =>
  readFileSync(new URL(file, dir), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });

for (const c of expected.claude) {
  if (c.refused) continue; // a nested subagents/ log: the reader never opens it (see read.ts)
  test(`claude golden: ${c.file}`, () => {
    for (const [withAuto, want] of [[false, c.turns], [true, c.turns_with_automated]] as const) {
      const got: string[] = [];
      const counts = { synthetic: 0, sidechain: 0, automated: 0 };
      for (const line of lines(c.file)) {
        if (!line) continue;
        const k = classifyClaudeLine(line, { includeAutomated: withAuto });
        if (k.kind === "turn") got.push(k.turn.text);
        else if (k.kind in counts) counts[k.kind as keyof typeof counts]++;
      }
      assert.deepEqual(got, want);
      if (!withAuto) assert.deepEqual(counts, { synthetic: c.synthetic, sidechain: c.sidechain, automated: c.automated });
    }
  });
}

for (const c of expected.codex) {
  test(`codex golden: ${c.file}`, () => {
    for (const [withAuto, want] of [[false, c.turns], [true, c.turns_with_automated]] as const) {
      const all = lines(c.file);
      const meta = all[0] ? codexSessionMeta(all[0], { includeAutomated: withAuto }) : null;
      if (!withAuto) assert.equal(meta?.skip ?? null, c.skip);
      const got = meta?.skip ? [] : all.flatMap((l) => (l && classifyCodexLine(l).kind === "turn" ? [(classifyCodexLine(l) as { turn: { text: string } }).turn.text] : []));
      assert.deepEqual(got, want);
    }
  });
}
