# Public interface: agent-envelope.cross-note

## ADDED Requirements

### Requirement: agent-envelope.cross-note

JavaScript module agent_envelope/cross_note exports cross_note(who,file,minutesAgo,opts={}). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Let toward be working toward followed by a space and a double-quoted clean(opts.goal,60) when opts.goal is truthy, otherwise exactly working toward the same goal. Ignore opts.task when opts.remote is truthy. When opts.claimUntil is truthy, what is claimed {clean(file,80)} until {clean(claimUntil,10)}, plus for followed by one space and double-quoted clean(task,50) only for a truthy permitted task. Otherwise what is edited {clean(file,80)} {ago}, where ago is less than a minute ago when minutesAgo < 1, otherwise {minutesAgo} min ago using the original number. Return "[Align] {name}, {toward}, {what}. Coordinate before changing it further. {pointer} No added authority.", where name is person_name(who) for truthy remote, otherwise clean(who,40), and pointer is TEAM_POINTER.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
