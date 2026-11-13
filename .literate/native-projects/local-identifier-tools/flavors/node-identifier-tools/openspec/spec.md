# Node-Identifier-Tools implementation Flavor

## ADDED Requirements

### Requirement: Node identifier resource binding [authored:node-identifier-tools-contract-v1]

# Node identifier binding

The JavaScript module `identifier_tools/create_identifiers` exports synchronous
`create_identifiers(context)` with exactly one required parameter. It returns
an object with these functions, preserving their names and required arities:

| Name | Parameters | Required arity | Return |
| --- | --- | --- | --- |
| `rand32` | `bytes = 15` | 0 | string |
| `newId` | `prefix` | 1 | string |
| `secretToken` | `bytes = 32` | 0 | string |
| `sha256hex` | string or Buffer | 1 | string |
| `nowIso` | none | 0 | string |

The context supplies three real resource callbacks. Capture each reference
without calling it and invoke captured callbacks as bare functions:

- `randomBytes(bytes)` returns the actual Node Buffer of random bytes. The
  supplied Buffer owns its `base64url` encoding. Retain native byte-count
  refusals, including the same error object and original argument.
- `createHash(algorithm)` returns the actual Node Hash resource. Use its normal
  `update(input).digest("hex")` protocol, preserving method receivers and the
  exact input object. The input may be an empty string, arbitrary Unicode,
  embedded control characters or binary Buffer.
- `newDate()` constructs and returns the current real Date. The binding callback
  performs the construction; the native method invokes the returned object's
  `toISOString()` method. Preserve one construction and one format per call,
  fresh instances, receiver identity and construction/formatting errors.

The application binding uses its existing Node crypto exports and current Date.
The library itself uses only supplied resources. It imports no crypto, clock,
filesystem, networking, process or application module and reads no globals for
those resources. Returned methods remain independent of a method receiver.
Keep each bound context independent and preserve the captured references after
the caller replaces context properties. Construction makes no resource calls.

The existing TypeScript caller retains `IdPrefix` exactly:
`u`, `ws`, `pod`, `g`, `al`, `dv`, `dir`, `inv`, `m`, `dr`, `cr`, `ar`, `ev`,
`ask`, `vr`, `rq`, `rl`. The core and ID module expose the same `rand32` reference.
Existing core callers keep their fifteen- and twenty-byte requests, and goal
limit IDs retain their eight-byte request and subsequent slicing.

Support the application's Node 24 or newer runtime and Node-only operator
assembly. The shared service and its package must work in direct Node module
loading, in the web build and in the production operator closure. Avoid runtime
package dependencies beyond the caller's supplied built-in resources.
Preserve the normal generated-test diversity requirement using real dependency
contexts and operations. Fixture IDs and extra placeholder parameters do not
belong to the public interface.


#### Scenario: Existing helper consumers

- **WHEN** the Node target binding is selected
- **THEN** Preserve five public methods, real resources, natural arities, exact resource traces and caller types.
