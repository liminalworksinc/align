# Node-Operator-Admin implementation Flavor

## ADDED Requirements

### Requirement: Align v2 admin command target binding [authored:node-operator-admin-v1]

# Node binding for the v2 admin command

Use the selected Node 20 or later Standard build and test lifecycle.
Emit exactly `package.json` and `create_operator_admin.js` in the
CommonJS package `operator_admin`. Export only `./create_operator_admin`.
The module exports only the named strict synchronous factory
`create_operator_admin(resources)`. Return exactly one own enumerable
member, `run`, a named async function of arity zero. Import and factory
construction perform no command, filesystem, database or process
effects. Emit no Makefile or dependency.

| Resource | Members used |
| --- | --- |
| fs | existsSync, readFileSync |
| path | resolve, join |
| core | CODE_DAYS, REQUEST_STATUSES, V1_CODE_RE, RESTORE_DAYS, SCHEMA_VERSION, accessRequest, approveAccessRequest, codeEmail, declineAccessRequest, importCreationCodes, insertCreationCode, listAccessRequests, listCreationCodes, postEmail, purgeWorkspace, revokeCreationCode, serverSecret, undoApproval, softDeleteWorkspace, workspaceSummaries |
| retention | describeCounts, retentionNow, runRetention |
| metrics | buildReport, formatReport, LOI_EVENTS, recordLoi |
| loadSqlite | async function returning an object with DatabaseSync |
| process | argv, env, cwd, listeners, removeAllListeners, on, exit |
| console | log, error, warn |
| Date | constructor and parse |
| URL | constructor |

Capture resources in table order. Call captured free functions with
undefined receiver. Preserve method receivers on process, console,
path, Date, SQLite connections and statements. Use the supplied
loadSqlite for the entry adapter's original lazy SQLite import.

## Startup and transactions

Read process.argv.slice(2). Preserve positional order. Treat print,
yes, purge, dry-run, help, json and verified-original as switches.
Other double-hyphen flags take the next non-option value. The option map
is an ordinary JavaScript object, preserving its property assignment and
lookup semantics. Help sends usage to console.error and exits 0. Missing values or too few positionals exit 2 before
loading SQLite. A report needs one initial positional and other
groups need two. Use Number and Number.isInteger for bounded
integer options with minimum one and each named maximum.

Save current warning listeners. Suppress only ExperimentalWarning
whose message matches SQLite case-insensitively. Forward the rest
to the saved listeners, each as a free function, or console.warn(String(warning)). Await loadSqlite. Resolve
ALIGN_DATA_DIR or the working directory's data folder, then append
v2/align.sqlite. Check existence and refuse ALIGN_TEST_NOW when
HOSTED equals "1". Open DatabaseSync with enableForeignKeyConstraints
true and timeout 5000. Execute one SQLite exec call with the exact string
`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`. Read
`PRAGMA user_version`, apply Number to its user_version field and
require SCHEMA_VERSION. On mismatch, explicitly close before issuing
the refusal. These startup steps precede the command dispatch
try/finally. Use the exact schema diagnostics below.

The database facade prepares SQL and invokes the corresponding
statement method. run returns Number(changes). An immediate
transaction uses BEGIN IMMEDIATE, synchronous operation and COMMIT,
or ROLLBACK then rethrow. Retention's transaction port delegates
synchronously to this transaction. Hosted secret lookup requires a
truthy ALIGN_SECRET before serverSecret(dataDir). The command dispatch alone has an outer database-close finally. Preserve
its behavior when a supplied exit operation throws. A real process exit
terminates the process. Startup failures retain their original close
boundaries.

## Code commands

Create maps a falsy email option to null; otherwise apply String, trim and
lowercase. Every non-null email must match the existing email format,
including refusing a supplied whitespace-only value. Bound days
by 365 and count by 50, and obtains the secret before one transaction.
Invoke insertCreationCode(db, secret, {email, days}) once per code.
Preserve the per-code output and count grammar.

Import requires string file and used options and explicit days.
Read the UTF-8 code file first. Read the spent file inside the JSON-parse
try block. Preserve that nested catch boundary, including when a supplied
exit operation throws after a read error. Require a JSON
array of lowercase 64-hex digests. Split lines on CRLF or LF,
preserve one-based line numbers, trim and discard blank lines and
hash comments. Split on comma and trim fields. A row with one field has null email. A second field is lowercased,
including retaining an empty second field for format refusal. Require
V1_CODE_RE, at most two fields and a valid email whenever it is non-null.
Refuse invalid rows and empty input before obtaining the secret.
Report line numbers without raw contents. In one transaction call
importCreationCodes with db, secret, ordered code/email records,
new Set of spent digests and days. Output only counts.

List reads listCreationCodes(db). Use the exact table field mapping below, including the service-supplied
state and redeemed_at and ws_id fields. Binding is "bound" or "(anyone)".
A date display is the first ten characters of a truthy supplied string,
otherwise "-". Preserve nullish and truthy fallback distinctions.
The table calculates widths from headings and String values, pads
each cell and joins columns with two spaces. Empty tables say
"(none)". Revoke requires ID and calls revokeCreationCode in an
immediate transaction.

## Other commands

List requests checks status whenever the option is not undefined, including
a supplied empty string, and preserves the existing
per-row lines, interest label, identity, optional organization,
collapsed use-case whitespace and decision details. Approve requires
ID and validates days. Email settings require all three values and
an HTTPS URL. Print disables email. A truthy public-origin setting is parsed with the supplied URL. Mode L
accepts any successfully parsed URL origin, while hosted mode requires
HTTPS. A valid configured origin has local:false. A missing or unusable
setting returns null when hosted, otherwise
{origin:"http://127.0.0.1:" + (process.env.PORT || "3100"),local:true}. Look up the request first and refuse a
missing or decided request. When email is configured, refuse a null link before mutation. Approve in one immediate transaction, with secret lookup inside the
transaction callback before the approval service call. For email, use the
exact argument shapes below, including the whole code object and options
object passed to codeEmail, and the single composed message object passed
to postEmail. Its label is "Access email". On failure use undoApproval in a new
transaction before reporting that the request is pending. Preserve
print, send and local-link notices. Decline uses the existing
pending-only transactional operation.

Workspace list uses the existing summary and table columns.
Delete requires ID and looks up the workspace with
`SELECT id, name, deleted_at FROM v2_workspaces WHERE id = ?`.
Refuse missing workspace. Purge needs yes and one immediate
purgeWorkspace transaction. Soft delete refuses an already deleted
workspace before checking yes, then calls softDeleteWorkspace
with db, ID, null and new Date().toISOString() in one transaction.

Retention gets the existing time, converts dry-run to Boolean and
awaits runRetention with db, synchronous transaction port, time and
one options object containing dryRun and secret. Print the "Would" or "Did" line then JSON with now, dry_run
and returned counts. A report dispatches only when group is report and command is undefined.
Validate its optional YYYY-MM-DD date with the format and
Date.parse(since + "T00:00:00Z") checks. Use buildReport with db and one
object containing nullishly defaulted since and retentionNow as now. Print two-space
JSON or formatReport.

Events only record LOI_EVENTS and require workspace. Refuse
verified-original on loi_sent. In the immediate transaction, call recordLoi with db, event, workspace
and one options object containing nullishly defaulted noteRef and Boolean
verifiedOriginal. Preserve the exact underscored reason values below,
refusal codes, success timestamp and verification marker.

The current source's exact diagnostics and output fragments are
part of this contract. Offline qualification uses synthetic host
ports and the immutable source-backed cases. Actual operator
assembly and the image commands remain integrated acceptance gates.

## Exit and dispatch protocol

A refusal writes its message to console.error, then calls process.exit
with default code 1. Only the following paths use a different code.

| Path | Exit code |
| --- | --- |
| Help | 0 |
| Missing flag value, too few positionals, invalid bounded integer | 2 |
| Hosted ALIGN_TEST_NOW | 2 |
| Invalid supplied email | 2 |
| Import missing required options, malformed CSV rows or empty input | 2 |
| Missing ID for revoke, approve, decline or workspace deletion | 2 |
| Invalid supplied request status or report date | 2 |
| Unknown command, unsupported event, missing workspace option | 2 |
| verified-original on loi_sent, verified_original_required or bad_note_ref result | 2 |

Every other refusal uses code 1, including missing database, schema mismatch,
hosted secret or origin refusal, input file or spent JSON errors, absent
records, missing destructive-operation confirmation and failed email.
Retain each supplied exit throw and existing catch/finally boundary.
The integer helper returns its default unchanged when an option is undefined;
only supplied values are converted and checked.

## Exact service call shapes

These synchronous resource calls preserve their current argument order.
Only loadSqlite, postEmail and runRetention are awaited by this command.
Transaction callbacks remain synchronous.

| Service | Arguments |
| --- | --- |
| serverSecret | dataDir |
| insertCreationCode | db, secret, {email, days} |
| importCreationCodes | db, secret, ordered {code,email} records, new Set(used), days |
| listCreationCodes | db |
| revokeCreationCode | db, id |
| listAccessRequests | db, opt.status |
| accessRequest | db, id |
| approveAccessRequest | db, secret(), id, days, evaluated inside the transaction |
| codeEmail | link.origin, request.name, whole code object, {local:link.local} |
| postEmail | api, {to:request.email, ...codeEmail result}, "Access email" |
| undoApproval | db, request.id, code.id |
| declineAccessRequest | db, id |
| workspaceSummaries | db |
| purgeWorkspace | db, id |
| softDeleteWorkspace | db, id, null, new Date().toISOString() |
| runRetention | db, synchronous transaction port, now, {dryRun, secret:secret()} |
| describeCounts | returned counts |
| buildReport | db, {since:opt.since ?? null, now:retentionNow()} |
| formatReport | returned report |
| recordLoi | db, event, workspace, {noteRef:opt["note-ref"] ?? null, verifiedOriginal:Boolean(opt["verified-original"])} |

Compute the retention dryRun Boolean before retentionNow. Read code import
files before secret admission; stamp code creation secret before BEGIN.
Approval secret lookup follows BEGIN. On failed email, undoApproval runs in
a new transaction before the refusal.

## Table field mappings and result tags

Code listing headings and values, in order:
id from id; state from state; binding from truthy email as "bound" or
"(anyone)"; created from day(created_at); expires from day(expires_at);
used from day(redeemed_at); workspace from ws_id ?? "-"; request from
request_id ?? "-". Use the service-supplied state directly.

Workspace headings and values, in order:
id from id; name from name; created from day(created_at); deleted from
truthy deleted_at unchanged or "-"; members from members; owners from owners.
A nonempty table prints headings once, then the supplied row order, with
column widths from String values and two spaces between padded cells.
An empty table prints only "(none)".

LOI refusal tags are verified_original_required with exit 2,
bad_note_ref with exit 2, no_workspace with exit 1; any other not-ok result
uses the existing already-recorded message with exit 1.

The older-schema diagnostic is exactly:
"This database has not been migrated by this version of Align. Start the current server once so it migrates the database, then try again."
The newer-schema diagnostic is exactly:
"This database is newer than this script. Run the script from the same version of Align as the server."

## Environment names and output serialization

Read these exact keys on the supplied process.env object.

| Key | Role |
| --- | --- |
| HOSTED | Hosted mode exactly when value is "1" |
| ALIGN_DATA_DIR | Database directory, with the existing working-directory fallback |
| ALIGN_TEST_NOW | Truthy value refused in hosted mode before opening SQLite |
| ALIGN_SECRET | Truthy value required by hosted secret admission |
| ALIGN_EMAIL_API_URL | URL of configured email API, requiring HTTPS |
| ALIGN_EMAIL_API_KEY | Key of configured email API |
| ALIGN_EMAIL_FROM | Sender of configured email API |
| ALIGN_PUBLIC_ORIGIN | Public-link origin parsed according to the existing Mode L and hosted rules |
| PORT | Local-link fallback port, truthy value or "3100" |

Email is configured only when all three ALIGN_EMAIL_API_URL,
ALIGN_EMAIL_API_KEY and ALIGN_EMAIL_FROM values are truthy and the URL has
HTTPS protocol. Pass their values as {url,key,from}. These names retain their
ALIGN_ prefix. A configured email API with a null hosted link is refused
before secret lookup or any approval transaction.

Retention prints compact JSON using JSON.stringify with one argument. Its
object properties are now, then dry_run, then the spread of returned counts.
The now value is now.toISOString(). Reporting with --json instead uses
JSON.stringify(report, null, 2). Preserve these distinct console string values.
For report date validation, require the date regex and a non-NaN result from
Date.parse(since + "T00:00:00Z").

## Existing command text

Use these exact text and template values for the corresponding branches.
Template expressions name the values from the dispatch contract.

```text
usage at original line 62
`Usage: node scripts/align-admin.mjs <command>   (or npm run admin -- <command>)
  codes create [--email <address>] [--days <n>] [--count <n>]
  codes import --file <path> --used <path> --days <n>
  codes list
  codes revoke <id>
  requests list [--status pending|approved|declined]
  requests approve <id> [--days <n>] [--print]
  requests decline <id>
  workspaces list
  workspaces delete <id> --yes            (soft: its owners can restore it for ${RESTORE_DAYS} days)
  workspaces delete <id> --purge --yes    (every row, now and for good)
  retention run [--dry-run]
  report [--since YYYY-MM-DD] [--json]
  events record loi_sent --workspace <id> [--note-ref <ref>]
  events record loi_signed --workspace <id> --verified-original [--note-ref <ref>]
Runs against ALIGN_DATA_DIR (else ./data), with the server's environment.`

fail at original line 98
`--${k} needs a value\n\n${USAGE}`

fail at original line 105
`--${k} must be a whole number from 1 to ${max}`

fail at original line 122
`No Align database at ${file}. Set ALIGN_DATA_DIR, or start the server once to create it.`

fail at original line 123
"ALIGN_TEST_NOW is not allowed when hosted"

fail at original line 156
"ALIGN_SECRET is not set in this shell. Run this on the server machine (fly ssh console), where it is."

console.log at original line 161
"(none)"

fail at original line 197
"--email must be an email address"

console.log at original line 202
`Created ${count} creation code${count === 1 ? "" : "s"}. Each is shown only now and creates one workspace:`

console.log at original line 203
`${c.code}  (${c.id}, ${c.email ? `only for ${c.email}` : "anyone"}, until ${day(c.expires_at)})`

fail at original line 213
`Nothing imported. Can't read ${f}.`

fail at original line 221
`Nothing imported. ${opt.used} isn't JSON.`

fail at original line 223
`Nothing imported. ${opt.used} isn't v1's list of spent codes.`

fail at original line 230
`Nothing imported. Expected a v1 invite code (20 lowercase hex characters), optionally followed by a comma and an email address, on line${bad.length === 1 ? "" : "s"} ${bad.join(", ")}.`

fail at original line 231
"Nothing imported. The file holds no codes."

console.log at original line 234
`Imported ${r.imported}, for ${days} days. ${r.present} already here, left as they were (${r.used} of those used). ${r.spentOnV1} spent on v1, skipped.`

fail at original line 252
`No unused, unrevoked code ${arg}.`

console.log at original line 253
`Revoked ${arg}.`

fail at original line 257
`--status must be one of ${REQUEST_STATUSES.join(", ")}`

console.log at original line 259
"(none)"

console.log at original line 261
`${r.id}  ${r.status}  ${day(r.created_at)}  ${r.interest === "evaluate" ? "evaluate (asks for a follow-up / non-binding LOI)" : "try"}`

console.log at original line 262
`  ${r.name} <${r.email}>${r.company ? `, ${r.company}` : ""}${r.team_size ? `, team ${r.team_size}` : ""}`

console.log at original line 263
`  ${r.use_case.replace(/\s+/g, " ")}`

console.log at original line 264
`  decided ${day(r.decided_at)}${r.code_id ? `, code ${r.code_id}` : ""}`

fail at original line 276
`No pending request ${arg}: no access request has that id, so nothing was approved. requests list shows them.`

fail at original line 277
`No pending request ${arg}: it was already ${found.status} on ${day(found.decided_at)}, so nothing was approved.`

fail at original line 281
`ALIGN_PUBLIC_ORIGIN is not set in this shell (or is not an https origin), so the email's sign-in link would point at this machine. Nothing was approved; ${arg} is still pending. Run this on the server machine (fly ssh console), where it is set, or add --print to show the code instead.`

fail at original line 285
`No pending request ${arg}.`

console.log at original line 288
`Approved ${request.id}. Give ${request.email} this creation code (shown only now; it works only for that address until ${day(code.expires_at)}):`

fail at original line 297
`The email to ${request.email} could not be sent, so ${request.id} is still pending. Try again, or add --print to show the code instead.`

console.log at original line 299
`Approved ${request.id}: emailed a creation code (${code.id}, until ${day(code.expires_at)}) to ${request.email}.`

console.log at original line 302
`Its sign-in link is ${link.origin}, this computer's local address: it opens only here, and the email says so. Set ALIGN_PUBLIC_ORIGIN to send a link others can open.`

fail at original line 309
`No pending request ${arg}.`

console.log at original line 310
`Declined ${arg}. Nothing was sent.`

fail at original line 327
`No workspace ${arg}.`

fail at original line 329
`This erases ${ws.id} ("${ws.name}") and everything in it now, for good: it can't be restored. Run it again with --purge --yes to go ahead.`

console.log at original line 331
`Purged ${ws.id} ("${ws.name}"): every row of it is gone.`

fail at original line 334
`${ws.id} ("${ws.name}") was already deleted at ${ws.deleted_at}. Add --purge --yes to erase it now.`

fail at original line 335
`This deletes ${ws.id} ("${ws.name}") for everyone at once; its owners can restore it for ${RESTORE_DAYS} days, then it is erased. Run it again with --yes to go ahead.`

console.log at original line 337
`Deleted ${ws.id} ("${ws.name}"). Its owners can restore it from Your workspaces for ${RESTORE_DAYS} days; then the retention job erases it.`

console.log at original line 347
`${dryRun ? "Would" : "Did"} (as of ${now.toISOString()}): ${describeCounts(counts)}`

fail at original line 353
"--since must be a date, YYYY-MM-DD"

fail at original line 359
`events record takes ${LOI_EVENTS.join(" or ")}: every other event is recorded by the app itself\n\n${USAGE}`

fail at original line 360
`--workspace <id> is required\n\n${USAGE}`

fail at original line 361
"--verified-original is only for loi_signed"

fail at original line 365
"loi_signed needs --verified-original: record a signed LOI only when you hold the countersigned original. A form, an email or a claim is not a signature, so nothing was recorded."

fail at original line 367
"--note-ref must be your own short reference (letters, digits and . _ : -, up to 64), never an email address, a URL or the document"

fail at original line 368
`No workspace ${opt.workspace}.`

fail at original line 369
`${arg} was already recorded for ${opt.workspace} at ${out.at}.`

console.log at original line 371
`Recorded ${arg} for ${opt.workspace} at ${out.at}${arg === "loi_signed" ? " (verified original)" : ""}.`

fail at original line 374
`Unknown command: ${key}\n\n${USAGE}`

```


#### Scenario: Preserve the v2 admin command guards and domain port calls

- **WHEN** the portable JavaScript library target is selected
- **THEN** Preserve command parsing, SQLite startup and cleanup, transactional domain dispatch, v2 invite import redaction and exact operator outputs.
