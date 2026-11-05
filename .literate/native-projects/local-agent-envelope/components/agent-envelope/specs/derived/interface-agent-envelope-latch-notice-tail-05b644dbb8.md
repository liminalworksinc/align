# Public interface: agent-envelope.latch-notice-tail

## ADDED Requirements

### Requirement: agent-envelope.latch-notice-tail

JavaScript module agent_envelope/latch_notice_tail exports latch_notice_tail(lid,reshare,release=null,again={}). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. What is stopped and held when reshare is falsy, release.goals is nonempty and release.stopped is truthy; held when reshare is falsy and release.goals is nonempty without stopped; otherwise stopped or held. For falsy reshare and truthy again.login return " It was {what} from the web, so tools stay blocked until it is shared again that way, after which the stop or hold, if still in place, can be lifted from the web, or until you run `align stop-sharing {id}` in a terminal.", using lid.slice(0,8). Otherwise return " It was {what} from the web, so {way-out}", where way-out is latch_way_out(lid,reshare,user,release,again), with user as that literal reader. Preserve the leading space.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
