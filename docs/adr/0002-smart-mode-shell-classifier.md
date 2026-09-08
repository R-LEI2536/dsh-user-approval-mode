# Smart mode — shell classifier pipeline + deployer/user config split

Status: accepted.

Add a fifth approval mode **`smart`** to `dsh-user-approval-mode`. Smart mode
is functionally "auto-edit with a shell upgrade": the only behavioral change
vs `auto-edit` is that the shell family stops being a hard approval wall and
goes through a four-step pipeline that auto-approves routine commands while
keeping dangerous or unclear ones in front of the user.

## Considered options

1. **Pure-rule shell auto-approve (no LLM)** — extend the danger list into a
   richer allow-list / block-list taxonomy. Easy to audit, but every new
   safe-but-uncommon pattern (e.g. `pueue add`, `nix develop`,
   `cargo install --git`) needs a manual rule. Doesn't scale.
2. **LLM-only shell auto-approve (no danger list)** — drop the regex step,
   let the classifier see everything. Lower latency (one LLM call per
   shell) but invites the classic LLM failure modes: tool-call emission,
   non-JSON responses, prompt-injection from command text, slow timeouts,
   expensive model mistakes.
3. **Hybrid: danger list → session memory → LLM classifier → fail-safe**
   (current). Deterministic regex catches catastrophic commands; session
   memory skips the LLM for re-runs; the LLM fills the long tail; every
   non-`approve` outcome falls back to manual review.

## Why option 3

- **Danger list is a hard floor.** It runs before any LLM call, so it
  cannot be bypassed by a jailbroken classifier or a prompt-injected
  command. Its 13 patterns cover the commands that are unambiguously
  destructive regardless of context (`rm -rf /`, `mkfs`,
  `curl ... | sh`, fork bomb, etc.). The patterns are inherited verbatim
  from `dsh-auto-approve` — the same community-reviewed safety floor that
  has been battle-tested for the same purpose upstream.
- **Session memory turns the LLM into a one-shot.** The first time a
  particular `sha256(toolName + arguments)` passes through the classifier,
  the LLM runs. Every subsequent call within the TTL (default 30 minutes)
  short-circuits to `allow`. For a typical 50-step setup loop, the LLM is
  consulted once per unique command — the 49 repeats cost zero model
  tokens. The bounded 200-entry FIFO and cross-session isolation prevent
  both memory bloat and cross-session privilege escalation.
- **Dedicated LLM seam is opt-in.** The classifier reads `ctx.llm` and
  `ctx.agentDefaultModel`; both are optional. When the host doesn't
  expose either, the classifier degrades cleanly to `ask` with
  `detail: 'llm-unavailable'` or `'no-default-model'` — never to silent
  allow. This keeps the plugin compatible with minimal DSH hosts.
- **Fail-safe is non-negotiable.** Every unexpected outcome (timeout,
  protocol violation, missing seam, non-`approve` verdict, exception)
  routes to manual review. The classifier never auto-allows anything
  outside the danger-list + classifier-approve path. This is the
  principle that distinguishes "smart" from "yolo": smart introduces
  automation with strict fallbacks; yolo is automation without any.

## Why the 8 smart config fields split 3 / 5

The smart mode introduces eight new fields; three are exposed in the
settings page (`smartProvider`, `smartModel`, `sandboxDefaults.smart`),
five stay deployer-only in `cordis.yml` (`smartExtraDangerPatterns`,
`smartSessionMemory`, `smartSessionMemoryTtlMs`, `smartTimeoutMs`,
`smartClassifierPrompt`).

- **Provider / model** are user-facing because users have legitimate
  reasons to pick a lighter / cheaper model for shell classification
  (e.g. a small model for `npm install` and a larger one for the main
  conversation). The user has the cost / quality trade-off in their
  hands; the deployer only has to make the default available.
- **Sandbox per mode** is user-facing for the same reason the other
  three modes' sandboxes are: the user has a per-mode security posture
  preference, and the deployer can still pin a floor via the `base`
  layer.
- **Danger patterns** stay deployer-only. These are the safety floor;
  exposing them to end users invites accidentally deleting the rules
  that catch `rm -rf /`. The deployer is responsible for security
  posture, not the end user.
- **Session memory + TTL** stay deployer-only. Tuning the TTL changes
  the security model (a longer TTL means a longer window where a
  remembered approval is reused). This is a deployment-level decision.
- **Timeout** stays deployer-only. A 0-ms timeout effectively disables
  the LLM step; a 60-s timeout wastes tokens on stuck calls. The
  deployer picks the ceiling based on model economics.
- **Classifier prompt** stays deployer-only because it IS the safety
  contract. Users must not be able to soften the prompt to "approve
  everything" — that would turn smart mode into yolo mode without the
  user noticing.

## Why port from `dsh-auto-approve` instead of writing from scratch

`dsh-auto-approve` is a sister plugin that does exactly this for the
`approval/request` waterfall; its classifier pipeline is production-grade
and has been audited by the wider DSH community. Re-implementing the
same logic from scratch would invite subtle divergences (a missed
protocol edge case, a less safe fail-safe default). The port is verbatim
where possible:

- `DEFAULT_DANGER_PATTERNS` — copied as `DEFAULT_SMART_DANGER_PATTERNS`.
- `CLASSIFIER_SYSTEM_PROMPT` — copied as `DEFAULT_SMART_CLASSIFIER_PROMPT`.
- `compileDangerPatterns` / `findDangerMatch` — copied as
  `compileSmartDangerPatterns` / `findSmartDangerMatch`.
- `parseClassifierVerdict` — copied as `parseSmartClassifierVerdict`.
- `commandMemoryKey` — copied as `smartMemoryKey`.
- Session memory factory + 200-entry FIFO + TTL eviction — copied
  structurally with `smart*` naming.
- Streaming aggregator — copied structurally (same `block-start /
  text-delta / block-end / finish / usage` protocol).
- `classify` (one LLM call with timeout + abort) — copied as
  `classifySmartShell`.
- `createApprovalHandler` (the orchestrator) — re-implemented as
  `createSmartShellEvaluator`, with two simplifications vs upstream:
    1. We integrate at `tools/pre-execute` (which already exposes
       `exec.arguments: unknown`), so we do NOT need
       `findToolArguments(events, callId)` — we read the parsed
       arguments directly. Upstream's `approval/request` event does not
       carry arguments and has to fish them out of session events.
    2. We do NOT keep an in-memory report row or expose an
       `/smart-report` command. The DSH conversation log is the
       authoritative record of every `tool/call` and approval event;
       a separate bookkeeping table is redundant. Upstream carries it
       because its `approval/request` integration is otherwise opaque;
       ours is observable through the existing event log.

## Consequences

- `ApprovalMode` widens from 4 to 5 values; downstream code that switches
  on the union (the chip menu, the `/approval-mode` command, the settings
  page sub-section) gains one entry each. Old user settings layer over
  the new schema unchanged — `default`, `unclassified`, the four tool
  lists, `sandboxDefaults`, and `askReason` are all preserved.
- `sandboxDefaults` gains a `smart` sub-key. The default mirrors
  `auto-edit` (`workspace-write`); the off-mode still restores the
  composition default. No other sandbox behavior changes.
- The classifier's `tools/pre-execute` branch runs only when
  `mode === 'smart' && family === 'shell'`. Every other code path is
  unchanged — request / auto-edit / yolo / off behavior is bit-for-bit
  identical to v0.3.2.
- Plugin reload aborts in-flight LLM calls via a per-plugin
  `AbortController` (see CONTEXT.md "Smart lifetime signal"). The teardown
  awaits all in-flight classifications via `Promise.allSettled` before
  the new plugin instance starts serving requests — a stalled request
  cannot survive a reload and pollute the next decision.
- The settings page adds one new sub-section (Smart classifier) and a
  4th dropdown (Smart mode sandbox) inside the existing Sandbox sub-
  section. Zero new CSS classes are required — the existing
  `FieldShell` / `EnumDropdown` / `csvInput` / sub-section card layout
  reuses without modification.
- Documentation: README's Approval Modes table gains a `smart` row;
  the "Configuration" section gains the three new user-editable fields;
  a "Smart Mode Risks" section is added under Known Limitations;
  CONTEXT.md gains six new glossary entries (pipeline, danger list,
  session memory, classifier prompt, LLM seam, lifetime signal).

## Known follow-ups

- The classifier currently feeds `exec.arguments` JSON-stringified as
  the LLM's user message. If we later add multimodal classification
  (e.g. screenshots of a suspicious UI), the LLM `messages` shape will
  need an image block, which means importing `@deepseek-ai/dsh-llm`'s
  `Message` types instead of the structural duck-type we use now.
- The session memory is in-process only; cross-restart, the cache is
  empty and the first shell call after restart pays one full LLM cost.
  This matches the rest of the plugin's in-memory philosophy
  (WeakMap-backed mode storage). If persistence is ever added to the
  plugin, the memory module is the right place to land the storage hook.
