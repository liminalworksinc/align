# Getting started

[Project guide](../README.md) → getting started

## What is this project?

Storage schema is an internal library for the domain store's 22 historical
upgrades. Its specifications describe the logical preservation obligations;
the selected SQLite Flavor describes the physical schema and JavaScript binding.
The consuming application owns database connections, transactions and startup.

## Installation

The integration workflow admits the generated library by its exact package identity.
This directory provides no standalone service or end-user installer. The library
needs no credentials, configuration, persistence directory or network access.
Generation requires a non-editable framework installation matching the lifecycle
binding in `literate.project.json`.

## Usage

The public module `storage_schema/change_programs` exports `change_programs()`.
With no arguments it returns a fresh ordinary array containing 22 nonempty SQLite
program strings in version order. It opens no database and applies no changes.
The application coordinator runs those programs and owns reference checking,
version changes, commit and rollback.

## Development workflow

Run these commands from this project root with its matching installed CLI:

```console
litai project validate
litai lock components/storage-schema --target storage-schema-host-v2 --check
litai plan components/storage-schema --target storage-schema-host-v2
litai verify --json
```

With host execution authorized, generate and accept a fresh build:

```console
litai rebuild components/storage-schema --project . \
  --target storage-schema-host-v2 --model gpt-6-astra \
  --allow-host-execution --update-receipt
```

The normal lifecycle runs generated tests and the pinned independent oracle.
Its 51 case expectations remain the qualification contract. Edit specifications,
Flavors or verifier authority through their normal reviewed workflows; generated
package files remain disposable outputs. Passing library checks precede the
owning application's consumer and complete workflow checks.
