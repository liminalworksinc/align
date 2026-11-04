# Public interface: paste-lines.shq

## ADDED Requirements

### Requirement: paste-lines.shq

JavaScript module paste_lines/shq. It exports one function, shq(v), that quotes a string for a POSIX shell so that sh, bash and zsh expand nothing inside it (no $, backquote, backslash, ! or newline handling).

shq(v) takes a string v and returns a new string: one single quote ('), then v with every single quote character replaced by the four characters '\'' (single quote, backslash, single quote, single quote), then one single quote. Every other character of v, including newlines, $, backquotes, backslashes, double quotes, spaces and non-ASCII characters, is copied unchanged and in order. Replacement is applied to every occurrence, left to right, without rescanning inserted text. The empty string returns ''. The function has no side effects and never throws for a string argument. Examples: shq("abc") is 'abc'; shq("a'b") is 'a'\''b'; shq("'") is ''\'''.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:81632c69b2e209e90623`
