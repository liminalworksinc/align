# Public interface: share-again.words

## ADDED Requirements

### Requirement: share-again.words

JavaScript module share_again/words exports words(device, who), returning ShareAgainPart[]. These are synchronous JavaScript functions with no I/O or hidden state. Preserve every argument, array and object. All names and string parts are opaque strings, including empty, whitespace, Unicode, newlines and prototype-like names; do not trim, normalize, escape or relabel them. Return exact raw strings and ordered plain arrays/objects. ShareAgainPart is a string, {device:string}, or {devices_page:string}. who is null for the reader, or any string for another person's name. A device is null or {name:string,signed_out:boolean,has_workspace:boolean}. Let you mean who === null. If the device exists, signed_out is false and has_workspace is true, return exactly three parts: string 'Its machine, ', object {device:device.name}, and the string ', has this workspace again: to share it again, ' followed by 'run' for you or who+' runs' otherwise, followed by ' ::align share in the session.'. For every other case let back be 'To share it again now that ' followed by 'you are' for you or who+' is' otherwise, followed by ' back, '. If the device exists and signed_out is false, return exactly five parts: back followed by 'give' for you or who+' gives' otherwise, then ' its machine, '; {device:device.name}; ', this workspace on ' followed by 'your' for you or 'their' otherwise, then one space; {devices_page:'Devices page'}; and ' (Give this device the workspace), then ' followed by 'run' for you or 'runs' otherwise, then ' ::align share in the session.'. If the device is null or signed_out is true, return a one-element array. Its string is back followed by 'run' for you or who+' runs' otherwise, then ' align login on that machine (it has signed out of Align) and ', then 'give' for you or 'gives' otherwise, then ' it this workspace, then ::align share in the session.'. has_workspace is irrelevant for signed-out devices. Preserve the exact part boundaries as well as text.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:ad183adc9f6afab3cc28`
