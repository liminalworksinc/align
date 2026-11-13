# Private test configuration

This project qualifies `components/identifier-tools` for the selected
`identifier-tools-host-v1` target. Its private profile requires two clean runs
and independently checks 51 cases and 166 observations. Actual admitted package
and typed-consumer checks also run on macOS and Linux. Generated implementation
tests supply separate evidence.

Inspect the local recipe and current receipt with the project's actual commands:

```console
litai plan components/identifier-tools --target identifier-tools-host-v1
litai verify --json
```

Generation requires an authenticated coding CLI and an explicitly selected model.
Use the operator's private project configuration or the installed CLI's one-command
options. Keep the required host-execution acknowledgement when running generated
code. Read [getting started](getting-started.md) for the project's concrete flow.

`literate.test.example.json` and `literate.workers.example.json` are inert
configuration examples. `litai config paths` reports the platform-resolved user
locations. Private worker names, credentials, provisioning choices and routes
belong to operator or session configuration. Keep those files outside Git.

If the operator configures and authorizes remote workers, bind exact worker IDs,
platform requirements and the selected Component to that private configuration.
Use the installed `litai help` and the matching agent skill for supported worker
operations. Local validation does not attest to a remote worker or hosted CI run.

The qualification profile and independent library oracle are verifier inputs.
Keep their expected results and controlled fixtures outside source-generation
inputs. Preserve their original records when extending coverage. Complete parent
operator and application acceptance separately before claiming consumer transfer.
