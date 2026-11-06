#!/usr/bin/env python3
"""Describe observed schema shapes as proposed target requirements, without DDL."""

import argparse
import hashlib
import json
import re
from pathlib import Path

KEYWORDS = set("CHECK OR AND IS NOT NULL IN BETWEEN STRICT WITHOUT AUTOINCREMENT CREATE TRIGGER BEFORE UPDATE OF ON BEGIN SELECT RAISE ABORT END WHERE DEFERRABLE INITIALLY CONFLICT GENERATED VIRTUAL COLLATE PRIMARY KEY FOREIGN UNIQUE REFERENCES DEFAULT TABLE CONSTRAINT".split())


def tokens(text):
    result = []
    at = 0
    while at < len(text):
        if text[at].isspace():
            at += 1
            continue
        if text.startswith("--", at):
            end = text.find("\n", at)
            at = len(text) if end == -1 else end + 1
            continue
        if text.startswith("/*", at):
            end = text.find("*/", at + 2)
            if end == -1:
                raise ValueError("Unterminated comment")
            at = end + 2
            continue
        char = text[at]
        if char in "'\"":
            quote = char
            kind = "literal" if quote == "'" else "name"
            at += 1
            value = ""
            while at < len(text):
                if text[at] == quote:
                    at += 1
                    if at < len(text) and text[at] == quote:
                        value += quote
                        at += 1
                        continue
                    break
                value += text[at]
                at += 1
            else:
                raise ValueError("Unterminated quoted value")
            result.append((kind, value))
            continue
        match = re.match(r"[A-Za-z_][A-Za-z_0-9]*|\d+|<>|!=|<=|>=|[(),;=<>+-]", text[at:])
        if not match:
            raise ValueError(f"Unsupported token at {at}: {text[at:at + 24]!r}")
        value = match.group()
        result.append(("integer" if value.isdigit() else "word", value.upper() if value.upper() in KEYWORDS else value))
        at += len(value)
    return result


class Expression:
    def __init__(self, items):
        self.items = items
        self.at = 0

    def is_word(self, word):
        return self.at < len(self.items) and self.items[self.at] == ("word", word)

    def take(self, word):
        if not self.is_word(word):
            raise ValueError(f"Expected {word!r}, got {self.items[self.at:self.at + 1]!r}")
        self.at += 1

    def parse(self):
        result = self.boolean_or()
        if self.at != len(self.items):
            raise ValueError(f"Unconsumed expression tokens: {self.items[self.at:]!r}")
        return result

    def boolean_or(self):
        value = self.boolean_and()
        while self.is_word("OR"):
            self.at += 1
            value = {"op": "or", "args": [value, self.boolean_and()]}
        return value

    def boolean_and(self):
        value = self.compare()
        while self.is_word("AND"):
            self.at += 1
            value = {"op": "and", "args": [value, self.compare()]}
        return value

    def compare(self):
        value = self.primary()
        if self.is_word("IS"):
            self.at += 1
            inverse = self.is_word("NOT")
            if inverse:
                self.at += 1
            self.take("NULL")
            return {"op": "is_not_null" if inverse else "is_null", "arg": value}
        if self.is_word("IN"):
            self.at += 1
            self.take("(")
            choices = [self.primary()]
            while self.is_word(","):
                self.at += 1
                choices.append(self.primary())
            self.take(")")
            return {"op": "in", "arg": value, "choices": choices}
        if self.is_word("BETWEEN"):
            self.at += 1
            low = self.primary()
            self.take("AND")
            return {"op": "between", "arg": value, "low": low, "high": self.primary()}
        for spelling, operation in [("=", "equal"), ("<>", "not_equal"), ("!=", "not_equal"),
                                    ("<=", "at_most"), (">=", "at_least"),
                                    ("<", "less_than"), (">", "greater_than")]:
            if self.is_word(spelling):
                self.at += 1
                return {"op": operation, "args": [value, self.primary()]}
        return value

    def primary(self):
        if self.at >= len(self.items):
            raise ValueError("Missing expression operand")
        if self.is_word("("):
            self.at += 1
            result = self.boolean_or()
            self.take(")")
            return result
        if self.is_word("-"):
            self.at += 1
            result = self.primary()
            if not isinstance(result.get("literal"), int):
                raise ValueError("Only integer literal negation is supported")
            return {"literal": -result["literal"]}
        kind, value = self.items[self.at]
        self.at += 1
        if kind == "literal":
            return {"literal": value}
        if kind == "integer":
            return {"literal": int(value)}
        if kind == "word" and value == "NULL":
            return {"literal": None}
        if kind not in {"word", "name"} or not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", value):
            raise ValueError(f"Unsupported primary: {(kind, value)!r}")
        if self.is_word("("):
            if value.lower() not in {"length", "json_valid", "json_type"}:
                raise ValueError(f"Unsupported target function: {value}")
            self.at += 1
            arg = self.boolean_or()
            self.take(")")
            return {"function": value.lower(), "args": [arg]}
        return {"field": value}


def checks(sql):
    source = tokens(sql)
    found = []
    at = 0
    while at < len(source):
        if source[at] != ("word", "CHECK"):
            at += 1
            continue
        if source[at + 1] != ("word", "("):
            raise ValueError("CHECK has no parenthesized expression")
        begin = at + 2
        at = begin
        depth = 1
        while at < len(source):
            if source[at] == ("word", "("):
                depth += 1
            elif source[at] == ("word", ")"):
                depth -= 1
                if depth == 0:
                    break
            at += 1
        if depth:
            raise ValueError("Unterminated CHECK expression")
        found.append(Expression(source[begin:at]).parse())
        at += 1
    return found


def index_model(index):
    source = tokens(index["sql"]) if index["sql"] else []
    where = next((at for at, item in enumerate(source) if item == ("word", "WHERE")), None)
    expression = source[where + 1:] if where is not None else []
    if expression and expression[-1] == ("word", ";"):
        expression.pop()
    if bool(expression) != bool(index["partial"]):
        raise ValueError("Partial-index predicate mismatch")
    fields = []
    for field in index["columns"]:
        if not field["key"]:
            continue
        if field["name"] is None or field["cid"] < 0:
            raise ValueError("Expression indexes require a separate reviewed mapping")
        fields.append({"name": field["name"], "descending": bool(field["desc"]), "collation": field["coll"]})
    return {"name": index["name"], "unique": bool(index["unique"]), "origin": index["origin"],
            "fields": fields, "when": Expression(expression).parse() if expression else None}


def trigger_model(trigger):
    source = tokens(trigger["sql"])
    # This observed schema has one update guard. Refuse any other trigger shape.
    words = [value for _, value in source]
    expected = ["CREATE", "TRIGGER", "v2_events_append_only", "BEFORE", "UPDATE", "OF", "id", ",", "name", ",", "at", ",", "props", "ON", "v2_events", "BEGIN", "SELECT", "RAISE", "(", "ABORT", ",", "v2_events is append-only", ")", ";", "END"]
    if words != expected or source[21][0] != "literal":
        raise ValueError(f"Unreviewed trigger: {trigger['name']}")
    return {"name": trigger["name"], "before": "update", "fields": ["id", "name", "at", "props"],
            "effect": "abort_statement", "message": "v2_events is append-only", "fires_when_values_unchanged": True}


def table_model(table):
    columns = []
    for column in table["columns"]:
        if column["hidden"] or column["type"] not in {"INTEGER", "TEXT"}:
            raise ValueError(f"Unreviewed column shape: {table['name']}.{column['name']}")
        default = column["dflt_value"]
        columns.append({"name": column["name"], "affinity": column["type"].lower(),
                        "explicit_not_null": bool(column["notnull"]), "primary_key_position": column["pk"],
                        "default": {"absent": True} if default is None else Expression(tokens(default)).parse()})
    groups = {}
    for ref in table["foreign_keys"]:
        groups.setdefault(ref["id"], []).append(ref)
    references = []
    for number, group in sorted(groups.items()):
        group.sort(key=lambda item: item["seq"])
        representative = group[0]
        for key in ["table", "on_update", "on_delete", "match"]:
            if any(item[key] != representative[key] for item in group):
                raise ValueError("Inconsistent foreign-key group")
        references.append({"introspection_id": number, "from": [item["from"] for item in group],
                           "table": representative["table"], "to": [item["to"] for item in group],
                           "on_delete": representative["on_delete"].lower().replace(" ", "_"),
                           "on_update": representative["on_update"].lower().replace(" ", "_"), "match": representative["match"]})
    primary = [column["name"] for column in sorted(table["columns"], key=lambda item: item["pk"]) if column["pk"]]
    rowid_alias = primary[0] if len(primary) == 1 and next(c for c in columns if c["name"] == primary[0])["affinity"] == "integer" else None
    source = tokens(table["sql"])
    unsupported = {"DEFERRABLE", "INITIALLY", "CONFLICT", "GENERATED", "VIRTUAL", "COLLATE"}
    if any(kind == "word" and value in unsupported for kind, value in source):
        raise ValueError("Unmodeled table clause requires a separate reviewed mapping")
    automatic = ("word", "AUTOINCREMENT") in source
    if automatic and rowid_alias is None:
        raise ValueError("AUTOINCREMENT without an integer rowid alias")
    if any(item == ("word", "STRICT") or item == ("word", "WITHOUT") for item in source):
        raise ValueError("Unreviewed strict or rowid-free table")
    return {"name": table["name"], "strict": False, "rowid_table": True, "rowid_alias": rowid_alias,
            "non_reusing_sequence": automatic, "columns": columns, "primary_key": primary,
            "checks": checks(table["sql"]), "references": references,
            "indexes": [index_model(item) for item in table["indexes"]],
            "triggers": [trigger_model(item) for item in table["triggers"]]}


def propose(inventory):
    if inventory["schema"] != "align/storage-schema-inventory@1" or not inventory["baseline_only_not_generation_input"]:
        raise ValueError("Requires the frozen diagnostic schema inventory")
    snapshots = inventory["snapshots"]
    if [item["version"] for item in snapshots] != list(range(23)):
        raise ValueError("Expected all 23 schema versions")
    previous = {}
    versions = []
    for snapshot in snapshots:
        current = {item["name"]: table_model(item) for item in snapshot["tables"]}
        created = [model for name, model in current.items() if name not in previous]
        dropped = sorted(set(previous) - set(current))
        changed = []
        for name, model in current.items():
            if name not in previous or model == previous[name]:
                continue
            delta = {key: value for key, value in model.items() if value != previous[name][key]}
            if "columns" in delta and model["columns"][:len(previous[name]["columns"])] == previous[name]["columns"]:
                delta["append_columns"] = delta.pop("columns")[len(previous[name]["columns"]):]
            changed.append({"table": name, "changes": delta})
        versions.append({"version": snapshot["version"], "create": created, "change": changed, "drop": dropped})
        previous = current
    final = list(previous.values())
    counts = {"tables": len(final), "columns": sum(len(item["columns"]) for item in final),
              "foreign_key_constraints": sum(len(item["references"]) for item in final),
              "indexes": sum(len(item["indexes"]) for item in final), "triggers": sum(len(item["triggers"]) for item in final),
              "checks": sum(len(item["checks"]) for item in final)}
    for key in ["tables", "columns", "indexes", "triggers"]:
        if counts[key] != inventory["counts"][key]:
            raise ValueError(f"Inventory count mismatch: {key}")
    if counts["foreign_key_constraints"] != 71:
        raise ValueError("Foreign-key inventory mismatch")
    return {"schema": "align/storage-target-model-proposal@1", "classification": "proposed SQLite mapping; review required",
            "generation_input": False, "release_authority_transferred": False,
            "source_sha256": inventory["source_sha256"], "schema_version": 22, "counts": counts,
            "limits": ["Shape transitions do not establish stored-data transformation behavior.",
                       "Logical entity rules and version-13 launch backfill require a separate authored contract.",
                       "Compatibility includes non-strict affinity, nullable non-integer primary keys and partial-index null behavior.",
                       "Auth tables are referenced external entities, not qualified by this model."],
            "versions": versions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inventory", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    content = args.inventory.read_bytes()
    proposal = propose(json.loads(content))
    proposal["inventory_sha256"] = hashlib.sha256(content).hexdigest()
    with args.output.open("x") as output:
        json.dump(proposal, output, separators=(",", ":"))
        output.write("\n")
    print(json.dumps({"output": str(args.output), "counts": proposal["counts"], "schema_versions": len(proposal["versions"]), "generation_input": False}))


if __name__ == "__main__":
    main()
