# Getting started

[Project guide](../README.md) -> getting started

## Availability

This is an unpublished qualified settings library. Two independent clean builds
pass all 62 acceptance cases, covering 18,156 observations and seven state traces.
A separate admitted build also passes. Qualification covers macOS Node; actual
consumer observations also match Linux Node 24. The parent owns complete
application and image acceptance.

There is no published package or standalone service to install. The parent build
consumes the exact qualified source-cache package through its native binding.
The library creates no files, opens no database and contacts no service.

## API

JavaScript module `runtime_settings/create_settings` exports
`create_settings(context)`. The context supplies `environment()`, `cwd()` and
`followUpProblem(env)`. Their references are captured once when the instance is
created. They are called without a receiver, and thrown values retain identity.
Use the qualified follow-up provider for the final callback.

The instance supplies 22 settings methods plus `LOOPBACK` and
`RECENT_SIGN_IN_MS`. Methods can be detached. Environment-aware methods use an
explicit environment without merging it with ambient settings. Each instance
has its own mutable loopback collection and cached startup-problem array;
`startupProblems()` returns that same array after its first call. Other settings
records and allowed-host collections are fresh. `assertStartupConfig()` performs
fresh validation independently of the startup cache.

The Component at `components/runtime-settings/component.md` and its selected
Node Flavor define every method, diagnostic, ordering rule and target behavior.
Keep the existing consumer types and bind one shared instance where consumers
previously shared module state. Operational caps constrain server use; they are
not financial budgets.

## Development

Use the framework runtime pinned in `literate.project.json`.

Read the [framework flow](framework-flow.md) and use the [project map](project-layout.md)
to find the owning authority. Planning does not execute generated code:

```console
litai project validate
litai lock components/runtime-settings --target runtime-settings-host-v4 --check
litai plan components/runtime-settings --target runtime-settings-host-v4
```

After host execution authorization, run the ordinary lifecycle and current receipt:

```console
CODING_CLI=codex litai rebuild components/runtime-settings --target runtime-settings-host-v4 --allow-host-execution --update-receipt
litai verify
```

All 62 independent acceptance cases must pass. These contributor commands do not
publish or install a package. The parent application retains its separate
consumer, operator, image and complete workflow gates.
