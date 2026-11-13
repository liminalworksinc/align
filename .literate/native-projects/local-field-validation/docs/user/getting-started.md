# Getting started

[Project guide](../README.md) -> getting started

## Availability

This is an unpublished qualified library. FIELD-VALIDATION-001 records two clean
qualification builds, passing 15 and 6 generated tests, and a separate admitted
build with 10 passing tests. All fifty independent batches match 4,549,018 original
observations. The parent owns consumer integration and source retirement.
Qualification covers macOS Node. All
4,549,018 original observations also match Linux Node 24, with Unicode 17 and
ICU 78.3 on both targets. Eight controls test the independent observer itself.

## API

JavaScript module `field_validation/create_validators` exports `create_validators(context)`.
The context supplies `badRequest`, `cleanProse`, `dropInvisible`, `isBlankText`
and `BLANK_FILLERS` from the existing qualified providers. Their references are
captured when the instance is created. Each validation error throws the exact
object returned by that instance's supplied error factory.

The returned ordinary object contains `str`, `cleanName`, `charCount`, `oneLine`,
`optStr`, `oneOf`, `optOneOf`, `nonNegInt`, `revisionRead`,
`assertRevisionReached`, `optInt`, `iso`, `optIso`, `b64url` and `strList`, plus
`NAME_MARKS_PER_CHAR`, `NAME_PARTS_PER_CHAR`, `NO_REVISION`, `B64URL`, `ID_RE`
and `SESSION_KEY_RE`. The methods work as detached functions. Public regular
expressions remain shared mutable objects within the instance; different instances
have independent regex state. Body getters, inherited fields, numeric edge cases,
fresh list results and original dependency-call order remain observable.

The accepted contract defines every message, default, boundary, Unicode rule and
timestamp operation. Bind the factory once per consumer module and retain its
existing public type signatures, generic choices and revision overloads. Those
consumer types and the complete application remain separate integration evidence.

## Development

Read the [framework flow](framework-flow.md). Run `litai project validate` and
`litai lock --check`. With host execution authorization, use `CODING_CLI=codex
litai rebuild components/field-validation --target host --allow-host-execution
--update-receipt`. The fifty independent acceptance batches must all pass. The
baseline adapter erases only TypeScript types and binds the two original imports;
it never replaces the original validation algorithms. The observer's explicit
dependency bytes come from already qualified packages.
