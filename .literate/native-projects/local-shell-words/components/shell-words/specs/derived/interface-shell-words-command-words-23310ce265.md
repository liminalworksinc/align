# Public interface: shell-words.command-words

## ADDED Requirements

### Requirement: shell-words.command-words

JavaScript module shell_words/command_words exports command_words(words), accepting string[] and returning a new string[]. These are synchronous pure JavaScript functions over local strings and arrays. Perform no I/O, environment access, clock access, command execution or hidden state changes. Preserve all inputs and array properties. Names and string fragments are opaque, case-sensitive JavaScript strings, including empty, Unicode, prototype-like and malformed shell text. This is a heuristic reader for hook hints. Preserve the specified heuristic behavior rather than expanding it into a shell interpreter or a more permissive wrapper parser. Skip leading elements while each is either an ASCII shell assignment matching ^[A-Za-z_][A-Za-z0-9_]*= or one of exactly sudo, env, command, nohup, time, exec, builtin, xargs. Stop at the first other element and return the remaining suffix in its original order. Matching is exact and case-sensitive. Assignment values may be empty or contain arbitrary characters. Do not skip wrapper options or the words after them: [sudo,-u,person,echo] returns [-u,person,echo]. A path such as /bin/env is not a recognized wrapper. An empty array or an entirely skipped prefix returns a new empty array. Do not mutate the original array.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:9efa7f1f8a1069bfa6a1`
