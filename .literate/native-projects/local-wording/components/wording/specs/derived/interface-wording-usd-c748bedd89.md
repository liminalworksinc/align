# Public interface: wording.usd

## ADDED Requirements

### Requirement: wording.usd

JavaScript module wording/usd exports usd(micros:number):string. When !(micros>0), return '$'+(micros/1e6).toFixed(2), using ECMAScript numeric behavior. Otherwise let rounded=Math.round(micros/100). For rounded===0 return 'under $0.0001'. For rounded<100 return '$0.'+String(rounded).padStart(4,'0'). Otherwise return '$'+(Math.round(micros/10000)/100).toFixed(2). Preserve the exact rounding boundaries, including 9,949 versus 9,950 micro-dollars, and the NaN and infinity spellings. These are synchronous dependency-free JavaScript functions with no I/O, clock or environment access. Preserve caller arguments, their properties and nested object identities. Use ordinary JavaScript values and callbacks, with no JSON transport wrapper. Do not sanitize text beyond each function's explicit cleaning rule. Number inputs retain JavaScript NaN, infinities, negative zero, fractional values and strict equality behavior. Formatting and quoting callbacks run synchronously in the specified order; preserve their return values' normal string coercion, call counts and arguments. Propagate the original callback error object without cloning or replacing it. Never suppress callback errors or invoke a callback on unused data.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:a6432a6bd30fdcf21ebf`
