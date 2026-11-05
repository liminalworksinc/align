# Public interface: share-again.text

## ADDED Requirements

### Requirement: share-again.text

JavaScript module share_again/text exports text(parts). These are synchronous JavaScript functions with no I/O or hidden state. Preserve every argument, array and object. All names and string parts are opaque strings, including empty, whitespace, Unicode, newlines and prototype-like names; do not trim, normalize, escape or relabel them. Return exact raw strings and ordered plain arrays/objects. ShareAgainPart is a string, {device:string}, or {devices_page:string}. who is null for the reader, or any string for another person's name. A device is null or {name:string,signed_out:boolean,has_workspace:boolean}. parts is an array of ShareAgainPart. Concatenate each part in order with no separator: a string contributes itself; an object with a device property contributes that value; otherwise contribute its devices_page value. Empty parts yield the empty string. Do not mutate parts or its objects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:ad183adc9f6afab3cc28`
