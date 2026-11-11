// A reader for SQLite session changesets (https://www.sqlite.org/sessionintro.html, the binary format of
// sqlite3session_changeset), for the approval preview (lib/v2/foresight.ts): previewTx in lib/v2/db.ts records every row
// a decision changes with node:sqlite's createSession, reads the changeset here, then rolls the decision back.
// Pure: no database. Column names come from the caller (PRAGMA table_info order), since a changeset carries none.
//   table header  'T', varint column count, one primary-key flag byte per column, table name (NUL-terminated)
//   change        op byte (INSERT 18, DELETE 9, UPDATE 23), indirect byte, then the record(s):
//                 INSERT the new row; DELETE the old row; UPDATE the old values (primary key and changed columns), then
//                 the new values (changed columns); a column a record leaves out has type 0 (undefined)
//   value         type byte: 0 undefined, 1 integer (8 bytes, big-endian), 2 real (8 bytes), 3 text (varint length,
//                 UTF-8), 4 blob (varint length), 5 null

export type CsValue = number | bigint | string | Uint8Array | null;
/** One record: a value per column, `undefined` where the record leaves a column out (an UPDATE's unchanged columns). */
export type CsRecord = (CsValue | undefined)[];

export interface CsChange {
  table: string;
  op: "insert" | "update" | "delete";
  /** Which columns form the table's primary key, by position. */
  pk: boolean[];
  /** DELETE: the whole old row; UPDATE: the primary key and the old values of the changed columns. */
  old: CsRecord | null;
  /** INSERT: the whole new row; UPDATE: the new values of the changed columns. */
  new: CsRecord | null;
}

const OP = { 18: "insert", 9: "delete", 23: "update" } as const;

export function readChangeset(buf: Uint8Array): CsChange[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const text = new TextDecoder();
  let i = 0;
  const varint = (): number => {
    // SQLite's varint: up to 9 bytes, 7 bits each (big-endian), the ninth byte whole. Lengths here fit a double.
    let v = 0;
    for (let n = 0; n < 8; n++) {
      const b = buf[i++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    return v * 256 + buf[i++];
  };
  const value = (): CsValue | undefined => {
    const t = buf[i++];
    switch (t) {
      case 0:
        return undefined;
      case 1: {
        const v = view.getBigInt64(i);
        i += 8;
        return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
      }
      case 2: {
        const v = view.getFloat64(i);
        i += 8;
        return v;
      }
      case 3:
      case 4: {
        const n = varint();
        const bytes = buf.subarray(i, i + n);
        i += n;
        return t === 3 ? text.decode(bytes) : bytes.slice();
      }
      case 5:
        return null;
      default:
        throw new Error(`changeset: unknown value type ${t} at byte ${i - 1}`);
    }
  };
  const record = (n: number): CsRecord => Array.from({ length: n }, () => value());

  const out: CsChange[] = [];
  let table = "";
  let pk: boolean[] = [];
  while (i < buf.length) {
    const b = buf[i++];
    if (b === 0x54) {
      const n = varint();
      pk = Array.from(buf.subarray(i, i + n), (x) => x !== 0);
      i += n;
      const end = buf.indexOf(0, i);
      table = text.decode(buf.subarray(i, end));
      i = end + 1;
      continue;
    }
    const op = OP[b as keyof typeof OP];
    if (!op || !table) throw new Error(`changeset: unexpected byte ${b} at ${i - 1}`);
    i++; // indirect flag
    const n = pk.length;
    if (op === "insert") out.push({ table, op, pk, old: null, new: record(n) });
    else if (op === "delete") out.push({ table, op, pk, old: record(n), new: null });
    else {
      const old = record(n);
      out.push({ table, op, pk, old, new: record(n) });
    }
  }
  return out;
}
