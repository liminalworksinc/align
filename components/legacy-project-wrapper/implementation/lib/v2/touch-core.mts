// Which workspaces a write changed, announced only once the write is committed (LIM-2503; lib/v2/live.ts streams it).
// No database of its own: it is handed a way to ask whether the connection is inside a transaction, so
// scripts/test-v2.mjs can drive it with a real node:sqlite connection.
//
// The rule: a touch is announced only when the write it marks is durable.
//   - Outside any transaction (an autocommitted write): at once.
//   - Inside tx() (lib/v2/db.ts): held, announced after the outer COMMIT, dropped on ROLLBACK.
//   - Inside a transaction someone else opened (a preview that BEGINs, writes and rolls back, LIM-2422's previewTx):
//     dropped. Nothing here can see that transaction commit, so nothing is announced for it; a stream's own 30-second
//     re-check is the backstop if such a transaction ever does commit. A caller that opens its own transaction and
//     wants to say what happens to its touches holds them explicitly (hold(), then commit() or discard()).

export interface TouchDb {
  readonly isTransaction: boolean;
}
export type TouchListener = (ws: string) => void;
export interface TouchHold {
  /** The writes committed: announce what was touched (once). */
  commit(): void;
  /** The writes were rolled back (or never happened): announce nothing. Safe after commit(). */
  discard(): void;
}

export function createTouches(db: () => TouchDb) {
  const listeners = new Set<TouchListener>();
  let held: Set<string> | null = null;
  const announce = (list: Iterable<string>) => {
    for (const ws of list)
      for (const l of listeners) {
        try {
          l(ws);
        } catch {}
      }
  };
  const joined: TouchHold = { commit: () => undefined, discard: () => undefined };
  return {
    /** Mark a workspace as changed by the current write. */
    touch(ws: string | null | undefined) {
      if (!ws) return;
      if (held) held.add(ws);
      else if (!db().isTransaction) announce([ws]);
      // else: inside a transaction nobody holds touches for; dropped (see above).
    },
    /** Hold touches until commit() or discard(). A hold inside a hold joins the outer one: only the outer decides. */
    hold(): TouchHold {
      if (held) return joined;
      const mine = new Set<string>();
      held = mine;
      let done = false;
      return {
        commit() {
          if (done) return;
          done = true;
          if (held === mine) held = null;
          announce(mine);
        },
        discard() {
          if (done) return;
          done = true;
          if (held === mine) held = null;
        },
      };
    },
    /** Hear of every committed write to a workspace. Returns the unsubscribe. */
    onChange(l: TouchListener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export type Touches = ReturnType<typeof createTouches>;
