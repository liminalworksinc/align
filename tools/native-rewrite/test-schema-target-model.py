#!/usr/bin/env python3
"""Check proposed target descriptions against real, isolated SQLite schemas."""

import argparse
import copy
import importlib.util
import json
import subprocess
from pathlib import Path

spec = importlib.util.spec_from_file_location("schema_target_model", Path(__file__).with_name("schema-target-model.py"))
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


def quoted(value):
    return '"' + value.replace('"', '""') + '"'


def expression(value):
    if "literal" in value:
        literal = value["literal"]
        return "NULL" if literal is None else str(literal) if isinstance(literal, int) else "'" + literal.replace("'", "''") + "'"
    if "field" in value:
        return quoted(value["field"])
    if "function" in value:
        return value["function"] + "(" + ",".join(expression(arg) for arg in value["args"]) + ")"
    op = value["op"]
    if op in {"is_null", "is_not_null"}:
        return "(" + expression(value["arg"]) + (" IS NULL)" if op == "is_null" else " IS NOT NULL)")
    if op == "in":
        return "(" + expression(value["arg"]) + " IN (" + ",".join(expression(item) for item in value["choices"]) + "))"
    if op == "between":
        return "(" + expression(value["arg"]) + " BETWEEN " + expression(value["low"]) + " AND " + expression(value["high"]) + ")"
    operator = {"or": "OR", "and": "AND", "equal": "=", "not_equal": "<>", "at_most": "<=", "at_least": ">=", "less_than": "<", "greater_than": ">"}[op]
    return "(" + (" " + operator + " ").join(expression(item) for item in value["args"]) + ")"


def shape_fixture(table):
    """Observer control only. Never use this reconstruction as application output."""
    definitions = []
    for field in table["columns"]:
        text = quoted(field["name"]) + " " + field["affinity"].upper()
        if field["name"] == table["rowid_alias"]:
            text += " PRIMARY KEY"
            if table["non_reusing_sequence"]:
                text += " AUTOINCREMENT"
        if field["explicit_not_null"]:
            text += " NOT NULL"
        if not field["default"].get("absent"):
            text += " DEFAULT " + expression(field["default"])
        definitions.append(text)
    automatic = sorted((item for item in table["indexes"] if item["origin"] in {"pk", "u"}), key=lambda item: int(item["name"].rsplit("_", 1)[1]))
    for item in automatic:
        kind = "PRIMARY KEY" if item["origin"] == "pk" else "UNIQUE"
        definitions.append(kind + " (" + ",".join(quoted(field["name"]) for field in item["fields"]) + ")")
    for check in table["checks"]:
        definitions.append("CHECK (" + expression(check) + ")")
    for ref in reversed(table["references"]):
        assert ref["match"] == "NONE"
        definitions.append("FOREIGN KEY (" + ",".join(map(quoted, ref["from"])) + ") REFERENCES " + quoted(ref["table"]) + " (" + ",".join(map(quoted, ref["to"])) + ") ON DELETE " + ref["on_delete"].replace("_", " ").upper() + " ON UPDATE " + ref["on_update"].replace("_", " ").upper())
    statements = ["CREATE TABLE " + quoted(table["name"]) + " (" + ",\n".join(definitions) + ");"]
    for item in table["indexes"]:
        if item["origin"] != "c":
            continue
        fields = ",".join(quoted(field["name"]) + " COLLATE " + field["collation"] + (" DESC" if field["descending"] else " ASC") for field in item["fields"])
        statements.append("CREATE " + ("UNIQUE " if item["unique"] else "") + "INDEX " + quoted(item["name"]) + " ON " + quoted(table["name"]) + " (" + fields + ")" + (" WHERE " + expression(item["when"]) if item["when"] else "") + ";")
    for trigger in table["triggers"]:
        assert trigger["before"] == "update" and trigger["effect"] == "abort_statement"
        statements.append("CREATE TRIGGER " + quoted(trigger["name"]) + " BEFORE UPDATE OF " + ",".join(map(quoted, trigger["fields"])) + " ON " + quoted(table["name"]) + " BEGIN SELECT RAISE(ABORT," + expression({"literal": trigger["message"]}) + "); END;")
    return "\n".join(statements)


OBSERVER = r'''
const fs = require("node:fs"), {DatabaseSync} = require("node:sqlite");
const fixtures = JSON.parse(fs.readFileSync(0,"utf8"));
const q = s => '"' + s.replaceAll('"','""') + '"';
const reports = [];
for (const fixture of fixtures) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY); PRAGMA foreign_keys=OFF;");
    for (const sql of fixture.statements) db.exec(sql);
    const tables = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name LIKE 'v2_%' ORDER BY name").all().map(t => ({
      ...t, columns:db.prepare(`PRAGMA table_xinfo(${q(t.name)})`).all(),
      foreign_keys:db.prepare(`PRAGMA foreign_key_list(${q(t.name)})`).all(),
      indexes:db.prepare(`PRAGMA index_list(${q(t.name)})`).all().sort((a,b)=>a.name.localeCompare(b.name)).map(i=>({...i,sql:db.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND name=?").get(i.name)?.sql??null,columns:db.prepare(`PRAGMA index_xinfo(${q(i.name)})`).all()})),
      triggers:db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name=? ORDER BY name").all(t.name)
    }));
    const broken = db.prepare("PRAGMA foreign_key_check").all();
    if (broken.length) throw Error("Broken fixture references");
    reports.push({version:fixture.version,tables});
  } finally {db.close();}
}
process.stdout.write(JSON.stringify({runtime:{node:process.version,sqlite:process.versions.sqlite},snapshots:reports}));
'''


def replay(proposal):
    current = {}
    snapshots = []
    for version in proposal["versions"]:
        for name in version["drop"]:
            del current[name]
        for table in version["create"]:
            current[table["name"]] = copy.deepcopy(table)
        for entry in version["change"]:
            table = current[entry["table"]]
            for key, value in entry["changes"].items():
                if key == "append_columns":
                    table["columns"].extend(copy.deepcopy(value))
                else:
                    table[key] = copy.deepcopy(value)
        snapshots.append({"version": version["version"], "tables": copy.deepcopy([current[name] for name in sorted(current)])})
    return snapshots


def mutation_controls(original):
    checks = []
    final = original["snapshots"][-1]["tables"]
    by_name = {table["name"]: table for table in final}
    for spelling in ["ON CONFLICT IGNORE", "DEFERRABLE INITIALLY DEFERRED", "COLLATE NOCASE", "GENERATED ALWAYS", "STRICT", "WITHOUT ROWID"]:
        changed = copy.deepcopy(by_name["v2_members"])
        changed["sql"] += " " + spelling
        try:
            model.table_model(changed)
        except ValueError:
            checks.append({"name": "reject-unmodeled/" + spelling, "passed": True})
        else:
            raise AssertionError("Unmodeled semantics were silently ignored: " + spelling)
    for name, mutate in [
        ("changed-enum", lambda t: t.update(sql=t["sql"].replace("'viewer'", "'operator'"))),
        ("missing-reference", lambda t: t["foreign_keys"].pop()),
        ("missing-unique-index", lambda t: t["indexes"].pop()),
        ("weaker-nullability", lambda t: t["columns"][0].update(notnull=0)),
    ]:
        changed = copy.deepcopy(by_name["v2_members"])
        baseline = model.table_model(changed)
        mutate(changed)
        assert model.table_model(changed) != baseline, name
        checks.append({"name": "detect/" + name, "passed": True})
    for text in ["length(note,1) < 5", "random() > 0", "note LIKE '%'", "x IN ()", "x BETWEEN 0", "x; SELECT 1"]:
        try:
            model.Expression(model.tokens(text)).parse()
        except ValueError:
            checks.append({"name": "reject-expression/" + text, "passed": True})
        else:
            raise AssertionError("Unsupported expression was silently accepted: " + text)
    assert model.Expression(model.tokens("x = 'O''Brien' OR y IS NULL")).parse() == {"op": "or", "args": [{"op": "equal", "args": [{"field": "x"}, {"literal": "O'Brien"}]}, {"op": "is_null", "arg": {"field": "y"}}]}
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inventory", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    original = json.loads(args.inventory.read_text())
    proposal = model.propose(original)
    snapshots = replay(proposal)
    controls = mutation_controls(original)
    inputs = [{"version": item["version"], "statements": [shape_fixture(table) for table in item["tables"]]} for item in snapshots]
    result = subprocess.run(["node", "--no-warnings", "-e", OBSERVER], input=json.dumps(inputs), text=True, capture_output=True, check=True)
    observed = json.loads(result.stdout)
    cases = []
    for source, replayed, candidate in zip(original["snapshots"], snapshots, observed["snapshots"], strict=True):
        expected = [model.table_model(table) for table in source["tables"]]
        actual = [model.table_model(table) for table in candidate["tables"]]
        assert replayed["tables"] == expected, "Target-description replay diverged"
        assert actual == expected, f"SQLite reconstruction diverged at version {source['version']}"
        cases.append({"version": source["version"], "tables": len(actual), "passed": True})
    report = {"schema": "align/storage-target-model-check@1", "passed": True, "runtime": observed["runtime"],
              "schema_versions": cases, "mutation_controls": controls, "counts": proposal["counts"],
              "scope": "All proposed shapes and predicates reconstruct in isolated SQLite and match the frozen observations. This does not validate populated upgrade execution or qualify a native implementation.",
              "generation_input": False, "release_authority_transferred": False}
    with args.report.open("x") as output:
        json.dump(report, output, indent=2)
        output.write("\n")
    print(json.dumps({"report": str(args.report), "schema_versions": len(cases), "mutation_controls": len(controls), "passed": True, "runtime": observed["runtime"]}))


if __name__ == "__main__":
    main()
