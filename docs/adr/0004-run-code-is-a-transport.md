# `run_code` is the PTC transport: allow the program, gate every sub-call

Status: accepted; revised 2026-11-20 — the top-level call is now classified by
its program's code structure (see "Revision" at the end).

Paths below without a `packages/` prefix are in this repository; a
`packages/…` path refers to the DSH host checkout this plugin targets
(`@deepseek-ai/dsh-tools`), and its exact line numbers drift between rc
releases, so the cited symbols matter more than the numbers.

The `ptc` agent preset exposes exactly one tool to the model: `run_code`. Every
other native tool (`write`, `bash`, `read`, …) is reachable only as a `tools.*`
binding called from inside the program. That inverts the plugin's assumption,
because the gate classifies a tool call by its name, and the tool the model
chooses is always the same one — the transport — while the actions that matter
are nested inside it.

We decided: **`run_code` is allowed by default, and the actions are gated.**
It ships in `autoAllowTools` (not in a family list, not hardcoded), so all five
modes allow the transport; each `tools.*` sub-call re-enters the same
`tools/pre-execute` waterfall under its real tool name and is classified by the
existing table (`write` asks under request, `bash` runs the smart-mode
five-step pipeline, `read` is exempt). Where the host cannot show the sub-call's
arguments in the approval dialog, the gate appends a short `[args: …]` summary
to the sub-call's ask reason.

## Considered options

1. **Do nothing.** PTC sessions would get one prompt per program. Rejected: the
   prompt is blind — the host approval panel renders only a top-level tool
   node's `command`, and under PTC that node is `run_code`, which carries no
   `command` — so the user would approve an opaque program and every action
   inside it. A blind prompt is worse than no prompt because it teaches the
   user to click through.
2. **Put `run_code` in `shellTools`.** Rejected: under smart mode the shell
   family sends the tool arguments to the LLM classifier, so the whole program
   source would go to a third-party classifier on every call, and the answer
   would still be a single verdict about the entire program. It also makes
   request/auto-edit prompt once per program (option 1's blindness again).
3. **A new `programTools` family.** Rejected as YAGNI: a family exists to give
   a group of tool names a shared verdict, and this "family" would have exactly
   one member whose verdict is "allow". `autoAllowTools` already means "bypass
   approval regardless of family" and is checked first, so the transport needs
   no new concept — only a default entry.
4. **Hardcode the exception in the gate** (always allow the name `run_code`).
   Rejected: it would make the transport un-gateable. Shipping it in
   `autoAllowTools` keeps the escape hatch — remove the entry and the plugin
   asks once per program again — and keeps one classification mechanism rather
   than two.
5. **Send the sub-call's command to the classifier under smart** even though
   the program is not sent. Rejected as duplicate work: the sub-call is already
   a normal `bash` call and reaches the same evaluator through the same gate; a
   second classifier call from the transport layer would double the cost and
   could disagree with the verdict the gate already applied.

## Why

- **The preset's collapse is the host's, not the plugin's.** The host rejects a
  model-direct call to a collapsed native tool before the policy pipeline runs
  (the `collapses(...)` denial in `packages/core/tools/src/index.ts`), so the
  only call the gate ever sees at the top level is `run_code`. That is why
  gating the transport is useless as a security measure: the security-relevant
  calls are the sub-calls.
- **Sub-calls are ordinary calls.** They re-enter `prepareExecution` with the
  real tool name, the caller's agent, a `parent` token, the outer `rootCallId`,
  a `<runCallId>:ptc:<n>` call id and the same signal (the dispatch block in
  `packages/core/tools/src/ptc.ts`; `packages/core/tool-executor-ptc/src/ptc.ts`
  on the 0.2.2-rc.1 host), so the gate, the read-only git fast path, the smart
  evaluator, the danger list and session memory all apply without plugin
  changes. The only missing piece is visibility in the dialog.
- **The visibility gap has a cheap fix.** The dialog resolves the command from
  the top-level node only
  (`packages/client/ui-chat/src/client/chat/ApprovalCommand.tsx:16-39`), so a
  PTC sub-call shows nothing. The gate appends `[args: …]` to the ask reason
  using the same argument keys the shell/read tools use, collapsed to one line
  and capped at 200 characters. It adds no exposure: the same arguments are
  already in the durable `tool/ptc-dispatch-start` session event.
- **The official precedent does the same.** `experimental/auto-review` skips
  the top-level `run_code` and reviews each inner call
  (`packages/experimental/auto-review/src/index.ts:686`), and its README states
  that the outer transport does not pass through inner-tool review. We follow
  the same split, with a plugin-local gate instead of a review model.

## Consequences

- `autoAllowTools` gains `run_code` in the schema defaults, in
  `cordis.patch.yml`, and in the client `FALLBACK`, so bundle installs, manual
  inserts and the settings page agree. A deployer who pins `autoAllowTools`
  explicitly keeps that list and does not get the transport entry — that is
  the documented escape hatch, not a bug.
- **Existing limitation, accepted not closed:** a PTC program's direct
  `import('node:fs')` or `node:child_process` effects never reach the gate, so
  under PTC the sandbox mode is the only write boundary. Request mode therefore
  does not mean "every write is approved" in a PTC session. Closing it would
  require sandboxing the program host itself, which is the host's job and
  outside a policy plugin.
- A denied sub-call is a catchable `ToolCallError` for that binding only: the
  program can retry or route around it as long as some other call satisfies the
  gate, and every retry re-prompts. Approval waits count against the `run_code`
  run budget (default 120 s, capped at 600 s), so a long approval queue can end
  the program as `aborted`/`cancelled`.
- A model-direct call to a collapsed native tool stays rejected by the host
  before the gate; the plugin neither allows nor intercepts it, and the
  rejection reason does not come from this plugin.
- The reason suffix is PTC-only (`exec.parent !== undefined`): native dialogs
  already show the arguments, so their prompt text is unchanged. No new config
  field was added; the summary cap is a module constant.
- `test/tool-family-defaults.test.ts` pins the new default, and
  `test/gate-ptc.test.ts` covers the transport allow in every mode, the
  per-family sub-call verdicts, the read-only git fast path on a sub-call, the
  smart-mode danger list and `llm-unavailable` fallback, the escape hatch, and
  the summary truncation.
- The terminology lives in CONTEXT.md under **PTC transport**, **PTC sub-call**
  and **PTC argument summary**, and both READMEs state the transport rules and
  the direct-Node limitation under Known Limitations.

## Revision 2026-11-20: classify the top-level program by its code structure

The accepted limitation above — a program's direct Node effects never reach
the gate, so request mode under PTC is not per-write approval — had one
consequence the design page (`docs/2026-11-07-run-code-approval-flow.html`)
refused to leave open: `rmSync('./dist')` in a program with zero `tools.*`
calls executes silently, because the transport is auto-allowed and nothing
else sees the code.

We decided: **the top-level `run_code` call is classified by the program's
code, not by its identity.** `run_code` stays in `autoAllowTools`; a
dedicated branch in the gate runs before the auto-allow return and only for
top-level calls (`exec.parent === undefined`). `src/run-code-gate.ts`
(parsed with the `acorn` dependency this revision adds) returns one of four
verdicts: `tools-only`, `tools-and-pure`, `pure`, `ask`.

- **request / auto-edit**: `tools-only` always allows — the actions are the
  sub-calls, which re-enter the gate unchanged — and `pure` /
  `tools-and-pure` allow while the `runCodePureExpressions` switch is on
  (default, settings page, volatile). Anything else asks, with a one-line
  `[code: …]` summary (collapsed, capped at 200 chars) appended after the
  (bilingual) ask copy, because the host dialog shows no command block for
  `run_code`. Unparseable or missing code asks too: the grammar recognizes,
  it does not guess.
- **smart**: the program text rides the existing five-step pipeline as the
  classifier's command (`commandFromArguments` gains a `run_code` branch, the
  session-memory key follows), and the SAME verdict is a fast-allow inside
  it, positioned exactly like the read-only git fast-path (ADR 0003): after
  the danger list (a configured pattern can never be bypassed by the
  grammar), before memory and the LLM. A recognized program needs neither —
  no LLM call, and the source never leaves the machine. Unrecognized
  programs fall through untouched, so smart keeps its fail-safes. Before the
  LLM call, `src/run-code-strip.ts` splits the program: gated `tools.*`
  sub-calls become `[gated sub-call]` markers (each sub-call faces its own
  gate at execution time, so the classifier reviews the direct code only)
  and the duplicated `toolArguments` evidence field is nulled; a program
  that could divert the `tools` binding (a shadowing binding, `eval` /
  `Function`, dynamic `import()`, member writes, the object-reflection hijack
  surfaces) is handed to the classifier raw — not splitting only means the
  classifier sees more, never less. The danger list, session memory and the
  `[code: …]` summary keep the original source everywhere.
- **yolo / off**: unchanged, no inspection.

Every allow from the gate logs one greppable line,
`[dsh-user-approval[run-code-gate]] decision=allow detail=<verdict>`, the
same posture and convention as the read-only git fast-path it mirrors.

The grammar has two widths, both written down in
`test/run-code-gate.test.ts`:

- **Strict** (always allowed): every statement is a `tools.*` call, a
  variable receiving one, or a `return` of trusted values — literals,
  identifiers (except the ambient `process` / `globalThis`), non-computed
  member chains, and object/array literals of trusted values. Reading a
  result (`r.lines.length`) is part of a tool call.
- **Widened** (per the switch): statements may additionally be
  - call-free pure computation over the program's own data — arithmetic,
    comparisons, conditionals, template assembly, spreads, and member reads
    with a LITERAL index;
  - recognized control flow — `if` / `for` / `while` / `switch` / `try`
    whose tests and bodies are recursively classified against this same
    grammar (an `rmSync` hiding in a loop body or a callback still asks),
    with assignment / update allowed only for identifiers the program
    declares (loop counters; assignment can never reach anything outside
    the program's own memory);
  - calls on a written-down list of pure builtin functions and methods
    (`Object.keys`, `Math.max`, `.map` / `.filter` / `.slice` / `.sort`,
    `JSON.parse`, …) on pure receivers, where callback bodies go through
    the same recursive check — `list.map(x => rmSync('./x'))` asks. The
    list is deliberately closed: `eval`, `fetch`, `setTimeout` & co. are
    absent, and a name not on the list asks whatever the receiver.
  A `tools.*` sub-call stays a gated sub-call wherever it hides (a program
  that binds the name `tools` anywhere — variable, loop binding, catch or
  callback parameter — asks as a whole, because shadowing would turn
  would-be gated calls into unguarded plain calls). Imports, any call that
  is not `tools.*` or on the written-down lists, `new`, tagged templates,
  dynamic imports, destructuring, dynamic member access, and stray
  function / class declarations stay outside BOTH widths and ask.
  The control-flow widening was driven by devweb feedback: a test agent's
  honest read-only programs (a `for`-of over patterns, an
  `Object.keys(…).sort()`, an `r.entries.slice(0, 20).map(…)`) all hit the
  first widening's boundary in one session, which is the noise cost the
  switch exists to tune — loops and callbacks were added rather than
  letting every summarizing program prompt.

Costs, accepted explicitly:

- **Double prompt.** A mixed program asks at the top level and its gated
  sub-calls ask again. Skipping the inner prompts after a top-level approval
  would need an "already approved" token threaded through sub-call
  decisions — deliberately deferred, not forgotten.
- **Noise, paid down.** The strict width alone would ask every honest
  program that computes anything between calls; the widened width keeps
  that noise off by default while the switch lets a deployer restore the
  strict boundary in one setting. What still asks under the strict modes
  is code the grammar cannot vouch for — the price of closing the
  silent-`rmSync` hole with a static check.
- **Smart still leaky for unrecognized programs** (danger list is
  shell-biased, LLM can be fooled), and the sandbox remains the only hard
  boundary — the grammar is a syntactic classifier, not a security control.
- **The escape hatch changed shape**: removing `run_code` from
  `autoAllowTools` now restores one blind prompt per program with NO code
  inspection (the branch requires the autoAllowTools entry), which is
  worse than the default flow and kept only for deployers who want it.

Test coverage: `test/gate-ptc.test.ts` pins the mode matrix (tools-only and
pure allows with their gate logs, the switch restoring the strict grammar,
non-grammar asks with `[code: …]`, yolo/off allow, smart danger-list and
`llm-unavailable` fallbacks, the double prompt, the escape hatch, the
bilingual top-level ask, preview capping), `test/smart-shell-evaluator.test.ts`
pins the pipeline integration (fast-allow before the LLM, danger list first,
fall-through for unrecognized programs), and `test/run-code-gate.test.ts`
pins the grammar boundary itself.
