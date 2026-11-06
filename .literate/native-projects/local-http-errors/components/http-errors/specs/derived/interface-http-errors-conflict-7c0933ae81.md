# Public interface: http-errors.conflict

## ADDED Requirements

### Requirement: http-errors.conflict

JavaScript module http_errors/conflict exports conflict(code:string,message:string):V2Error. Return new V2Error(409,code,message), preserving both arguments and V2Error's nullish message fallback. Ignore any additional arguments. Synchronous JavaScript API with no I/O, clock or environment reads. Preserve input values and references without mutation. Use ordinary native Error inheritance and coercion, including propagation of the original thrown coercion value. Do not trim, normalize, validate or JSON-serialize arguments. Error instances have inherited name 'Error', ordinary native stack behavior and an own message only when native Error creates one. Physical stack frames depend on invocation paths and are outside the comparison contract. Optional status, code and extra values are retained even if they are undefined, null, non-string or opaque objects at JavaScript call sites. The constructors are shared mutable class objects. Factory-created v2 errors use exactly the same V2Error and prototype returned by data(). With unmodified field prototypes, the instance fields assigned below are ordinary enumerable writable configurable own properties. Assignments use ordinary property assignment: inherited setters run, nonwritable inherited fields cause the normal strict-mode TypeError, and an error thrown by a setter propagates unchanged. Preserve assignment order after super returns. Every construction or factory call creates a new instance.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:6f2f84ca62de0a15c4ab`, `evidence:bb4dd3222332d6c502c6`
