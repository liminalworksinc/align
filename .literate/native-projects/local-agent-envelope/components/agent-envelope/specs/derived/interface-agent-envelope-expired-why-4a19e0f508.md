# Public interface: agent-envelope.expired-why

## ADDED Requirements

### Requirement: agent-envelope.expired-why

JavaScript module agent_envelope/expired_why exports expired_why(q). Synchronous JavaScript library API with no I/O, environment access, clock access, command execution or hidden state. Preserve inputs, their properties and the documented returned aliases. Strings are opaque UTF-16 strings unless a named cleaning operation says otherwise. Do not validate or reject older string values merely because a current TypeScript enum is narrower. Support omitted and undefined optional arguments exactly as their defaults. The only mutable module data is the public LIMIT_WORDS record and SAFE_REQUESTS Set returned by envelope_data; every call observes their current shared objects. Return ordinary JavaScript values without a JSON transport envelope. Accept null, undefined or an object with optional expired_reason,refused_answer,refused_error. For expired_reason device_signed_out, return "this session's share ended when this machine signed out of Align, and the Align server expired the request". For receipt_refused, use "the Align server did not take the answer {answer} here ({error}): this session's share there has ended", where answer is declined only when refused_answer is exactly declined, otherwise accepted, and error is String(refused_error || not_found).slice(0,40), with not_found as that literal default string. For member_removed return "this session's share ended when this machine lost access to its workspace, and the Align server expired the request". For sharing_stopped return "this session's sharing was stopped (Stop sharing on the web, or `align stop-sharing`), and the Align server expired the request". Otherwise return "this session's share ended, and the Align server expired the request".

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:030769b466ebbed7615f`, `evidence:17a1481125521529c10b`, `evidence:4d8225c9aee7ac35e27c`
