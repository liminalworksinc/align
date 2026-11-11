# Node-Operator-Shortcuts implementation Flavor

## ADDED Requirements

### Requirement: Operator retention and local sign-in commands target binding [authored:node-operator-shortcuts-v1]

# Node binding for operator shortcuts

Use the selected Node 20 or later Standard build and test lifecycle.
Emit the CommonJS package operator_shortcuts with exactly package.json
and create_operator_shortcuts.js. Export only
./create_operator_shortcuts as the named synchronous function
create_operator_shortcuts(resources). Keep all runtime logic in that
JavaScript file. Import and factory construction have no command effects.

The resources object supplies process, console, fetch, AbortSignal and
runAdmin. Return an object with retention and signInLink. Both functions
are asynchronous and take no arguments. Each performs its command when
called. Read live argv and env values from the supplied process object.

Use the supplied process.exit and console.log or console.error methods.
Preserve receivers on argv methods, console methods, AbortSignal.timeout
and the response json method. Call the supplied fetch and runAdmin as
free functions with an undefined receiver. A process exit terminates the
command. Preserve propagation when a supplied exit operation throws.

## Retention

Read process.argv.slice(2) into args. If any argument differs from
--dry-run, pass the following single string to console.error and call
process.exit(2), before argv mutation or runAdmin.

```text
usage: node scripts/retention.mjs [--dry-run]   (the same as: node scripts/align-admin.mjs retention run [--dry-run])
```

Otherwise mutate the existing argv array with
splice(2, args.length, "retention", "run", ...args). Keep its first two
entries and array identity. Preserve every supplied dry-run argument in
order, including duplicates. Await runAdmin() and allow its rejection to
propagate. The host callback loads the existing admin command.

## Local sign-in link

Choose process.argv[2], then process.env.ALIGN_LOCAL_OWNER_EMAIL, then
owner@align.localhost, using JavaScript truthiness. Trim and lowercase
the chosen email. Derive base as http://127.0.0.1 followed by a colon and
the truthy process.env.PORT or 3100. Keep the loopback address.

In one try block, call fetch for
<base>/api/v2/auth/email-otp/send-verification-otp with these options.

- method is POST.
- headers contain content-type as application/json followed by origin as base.
- body is JSON.stringify({email, type: "sign-in"}), with email first.
- signal comes from AbortSignal.timeout(15000), evaluated while constructing
  the options before invoking fetch.

Await the response. If constructing or sending that request throws,
pass the following template to console.error, call process.exit(1), and
finish the command. Substitute the derived base.

```text
No Align server is running at <base>. Start it with npm start, then try again. If it runs on another port, name it: PORT=<port> npm run sign-in-link
```

First test response.status === 429. On that branch await response.json()
with its original receiver, substituting an empty object when its promise
rejects. Pass its truthy message, or the following fallback, directly to
console.error. Call process.exit(1).

```text
Too many codes were sent. Wait a few minutes, then try again.
```

Next test !response.ok. Read the JSON body with the same rejection
fallback. Pass the following template to console.error. The optional
message suffix is a colon and space followed by body.message, included
only when that field is truthy. Call process.exit(1).

```text
The server at <base> refused (<status><optional message suffix>).
```

For an ok response, pass the following success template to console.log.
Substitute the normalized email. Leave the response body unread. Every
ok status is accepted, including 204.

```text
A sign-in link for <email> was printed in the terminal running Align and saved in <data>/v2/sign-in.txt (data/v2/sign-in.txt by default). It works for 5 minutes.
```

Preserve the original successful completion and the original exit paths.
The host adapters own bootstrap and resource construction. This library
owns argument admission, request construction, response selection and
operator output.


#### Scenario: Preserve shortcut admission, delegation and response handling

- **WHEN** the portable JavaScript library target is selected
- **THEN** Preserve retention argument admission and argv mutation before admin delegation, plus local sign-in request construction, timeout, rate-limit precedence, response messages, privacy and process exits through the declared host resources.
