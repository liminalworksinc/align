# Public interface: share-again.stopped

## ADDED Requirements

### Requirement: share-again.stopped

JavaScript module share_again/stopped exports stopped(who, options), returning a string. These are synchronous JavaScript functions with no I/O or hidden state. Preserve every argument, array and object. All names and string parts are opaque strings, including empty, whitespace, Unicode, newlines and prototype-like names; do not trim, normalize, escape or relabel them. Return exact raw strings and ordered plain arrays/objects. ShareAgainPart is a string, {device:string}, or {devices_page:string}. who is null for the reader, or any string for another person's name. A device is null or {name:string,signed_out:boolean,has_workspace:boolean}. options is optional or undefined, or an object with optional deleted:boolean. Omitted or undefined deleted defaults to false. Let lead be 'You' for a null who, otherwise the unmodified who string, followed by ' stopped sharing this session, so a stop or resume can't reach it'. When deleted is true, return lead+'. Their account was deleted, so nothing can share it again.'. Otherwise return lead+', and it won't be shared again, even if its machine runs ::align share. To share ' followed by 'your' for null who or 'their' otherwise, then ' work again, ', then 'start' for null who or who+' starts' otherwise, then ' a new session and ', then 'run' for null who or 'runs' otherwise, then ' ::align share in it.'.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:ad183adc9f6afab3cc28`
