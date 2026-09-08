/**
 * Smart-mode shell classifier — ported from `dsh-auto-approve` and adapted
 * for the `tools/pre-execute` waterfall.
 *
 * The pipeline runs four ordered checks for every shell-family tool call
 * under the smart approval mode:
 *
 *   1. Danger list — compiled deterministic regex; a hit hands off to human.
 *   2. Session memory — `sha256(toolName + rawArguments)` key, 30-min TTL,
 *      per-session bounded cache; a hit auto-approves without LLM.
 *   3. LLM classifier — one-shot chat call against `ctx.llm` with the
 *      evidence JSON + classifier prompt; `approve` → allow + remember,
 *      anything else → ask.
 *   4. Fail-safe — every unexpected outcome (timeout, protocol error,
 *      missing seam, non-approve verdict, exception) routes to ask.
 *
 * The classifier intentionally does NOT keep an in-memory report row or
 * expose `/smart-report`. The DSH conversation log already carries every
 * `tool/call` and approval event; we treat that as the source of truth.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { DEFAULT_SMART_DANGER_PATTERNS } from './smart-danger-patterns.js'
import { DEFAULT_SMART_CLASSIFIER_PROMPT } from './smart-prompt.js'

// ─── Public types ───────────────────────────────────────────────────────────

/** One compiled danger pattern. The source is the raw regex string the
 *  plugin was configured with; `regexp` is what we test against. */
export interface CompiledSmartDangerPattern {
  readonly source: string
  readonly regexp: RegExp
}

/** Snapshot of the smart-mode config the evaluator reads per call. The
 *  server-side plugin re-reads this on every `tools/pre-execute` via its
 *  settings thunk, so values reflect the latest user/deployer edits. */
export interface SmartEvaluatorConfig {
  readonly smartExtraDangerPatterns: readonly string[]
  readonly smartSessionMemory: boolean
  readonly smartSessionMemoryTtlMs: number
  readonly smartTimeoutMs: number
  readonly smartClassifierPrompt: string
  readonly smartProvider: string | null
  readonly smartModel: string | null
}

/** The minimum surface we read off `ctx.llm.stream(options)`. Marked
 *  structural so we don't have to import the full dsh-llm types here —
 *  the host's `LlmRuntime` is compatible at runtime. */
export interface SmartLlmService {
  stream(options: {
    provider: string
    model: string
    messages: readonly { role: string; content: readonly { type: string; text: string }[] }[]
    system?: string
    sessionId?: string
    signal?: AbortSignal
  }): AsyncIterable<unknown>
}

/** The default-model seam. May be absent on the host (fall back to ask). */
export interface SmartDefaultModelService {
  currentSelection(): { provider: string; model: string } | undefined
}

/** Verdict for one shell call. `allow` means the plugin should return
 *  `{ kind: 'allow' }`; `ask` means it should fall through to the existing
 *  approval chain via `{ kind: 'ask' }`. */
export type SmartShellDecision =
  | { readonly kind: 'allow'; readonly source: 'remembered' | 'classifier' }
  | { readonly kind: 'ask'; readonly detail: string }

/** Factory return type. */
export type SmartShellEvaluator = (
  exec: { name: string; arguments: unknown },
  session: Session,
) => Promise<SmartShellDecision>

// ─── Danger patterns ────────────────────────────────────────────────────────

/** Compile the configured danger patterns. The 13 built-ins always run
 *  (unless the deployer explicitly overrides `dangerPatterns` — we do not
 *  expose that switch yet); `smartExtraDangerPatterns` appends. */
export function compileSmartDangerPatterns(
  extraPatterns: readonly string[],
): readonly CompiledSmartDangerPattern[] {
  const merged: readonly string[] = [...DEFAULT_SMART_DANGER_PATTERNS, ...extraPatterns]
  return merged.map((source) => {
    try {
      return Object.freeze({ source, regexp: new RegExp(source, 'i') })
    } catch (error) {
      throw new Error(
        `dsh-user-approval-mode[smart]: invalid danger pattern ${JSON.stringify(source)}: ${String(error)}`,
      )
    }
  })
}

/** First compiled pattern whose regex matches `text` (case-insensitive). */
export function findSmartDangerMatch(
  text: string,
  patterns: readonly CompiledSmartDangerPattern[],
): CompiledSmartDangerPattern | undefined {
  return patterns.find(({ regexp }) => regexp.test(text))
}

// ─── Verdict parser ─────────────────────────────────────────────────────────

/** Parse the classifier's deliberately tiny response vocabulary.
 *  Accepts the strictest shape only: `{"verdict":"approve"}` or
 *  `{"verdict":"ask"}`. Surrounding whitespace is tolerated. Any other
 *  shape (multi-key, non-approve value, non-JSON) returns undefined. */
export function parseSmartClassifierVerdict(text: string): 'approve' | 'ask' | undefined {
  const trimmed = text.trim()
  const exact = /^\{\s*"verdict"\s*:\s*"(approve|ask)"\s*\}$/.exec(trimmed)
  if (exact === null) return undefined
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const keys = Object.keys(value as Record<string, unknown>)
  if (keys.length !== 1 || keys[0] !== 'verdict') return undefined
  const verdict = (value as { verdict: unknown }).verdict
  return verdict === 'approve' || verdict === 'ask' ? verdict : undefined
}

// ─── Command extraction ─────────────────────────────────────────────────────

/** Pull a readable command string out of `exec.arguments`. DSH has already
 *  parsed the JSON; we just take `.command` if it looks like the tool
 *  schema's expected `{ command: string }` shape, otherwise stringify. */
export function commandFromArguments(args: unknown): string | undefined {
  if (args === undefined) return undefined
  if (args !== null && typeof args === 'object' && !Array.isArray(args)) {
    const candidate = (args as Record<string, unknown>).command
    if (typeof candidate === 'string') return candidate
  }
  try {
    return JSON.stringify(args)
  } catch {
    return String(args)
  }
}

// ─── Latest user message ────────────────────────────────────────────────────

const LATEST_USER_MESSAGE_MAX_CHARS = 2000

/** Return the newest genuine user message text, or null when there is no
 *  such event, the message is image-only, or it overflows the budget.
 *  Overflow returns null (same strategy as `dsh-auto-approve`): truncating
 *  trusted context is worse than handing the classifier less of it. */
export function latestUserMessageText(
  events: readonly SessionEvent[] | undefined,
): string | null {
  if (events === undefined) return null
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'user/message') continue
    const message = event.data
    if (message === null || typeof message !== 'object') continue
    const source = (message as { source?: { kind?: string } }).source
    if (source?.kind !== 'user') continue
    const content = (message as { content?: unknown }).content
    if (!Array.isArray(content)) return null
    let text = ''
    let sawText = false
    for (const block of content) {
      if (block === null || typeof block !== 'object') continue
      const typed = block as { type?: unknown; text?: unknown }
      if (typed.type !== 'text' || typeof typed.text !== 'string') continue
      const part = `${sawText ? '\n' : ''}${typed.text}`
      if (text.length + part.length > LATEST_USER_MESSAGE_MAX_CHARS) return null
      text += part
      sawText = true
    }
    return sawText ? text : null
  }
  return null
}

// ─── Session memory ─────────────────────────────────────────────────────────

const SESSION_MEMORY_MAX_ENTRIES = 200

export interface SmartSessionMemoryEntry {
  readonly source: 'classifier' | 'human'
  readonly at: number
}

export interface SmartSessionMemory {
  lookup(sessionId: string, key: string): SmartSessionMemoryEntry | undefined
  remember(sessionId: string, key: string, source: 'classifier' | 'human'): void
}

interface MutableSessionMemoryEntry {
  source: 'classifier' | 'human'
  at: number
}

/** Build a per-session memory with TTL pruning and a FIFO cap. */
export function createSmartSessionMemory(ttlMs: number): SmartSessionMemory {
  const memoryBySession = new Map<string, Map<string, MutableSessionMemoryEntry>>()

  function lookupEntry(
    sessionId: string,
    key: string,
    now: number,
  ): SmartSessionMemoryEntry | undefined {
    const entries = memoryBySession.get(sessionId)
    if (entries === undefined) return undefined
    const entry = entries.get(key)
    if (entry === undefined) return undefined
    if (now - entry.at > ttlMs) {
      entries.delete(key)
      return undefined
    }
    return Object.freeze({ source: entry.source, at: entry.at })
  }

  function storeEntry(
    sessionId: string,
    key: string,
    source: 'classifier' | 'human',
    now: number,
  ): void {
    let entries = memoryBySession.get(sessionId)
    if (entries === undefined) {
      entries = new Map()
      memoryBySession.set(sessionId, entries)
    }
    if (!entries.has(key) && entries.size >= SESSION_MEMORY_MAX_ENTRIES) {
      const firstKey = entries.keys().next().value
      if (firstKey !== undefined) entries.delete(firstKey)
    }
    entries.set(key, { source, at: now })
  }

  return Object.freeze({
    lookup(sessionId: string, key: string) {
      try {
        return lookupEntry(sessionId, key, Date.now())
      } catch {
        return undefined
      }
    },
    remember(sessionId: string, key: string, source: 'classifier' | 'human') {
      try {
        storeEntry(sessionId, key, source, Date.now())
      } catch {
        // Memory is a convenience; a bookkeeping failure never changes an outcome.
      }
    },
  })
}

/** Key for "the same shell call again": tool name + lossless arguments. */
export function smartMemoryKey(toolName: string, args: unknown): string {
  let serialized: string
  try {
    serialized = JSON.stringify(args) ?? String(args)
  } catch {
    serialized = String(args)
  }
  return createHash('sha256').update(`${toolName}\n${serialized}`).digest('hex')
}

// ─── Streaming aggregator ───────────────────────────────────────────────────

interface CollectedSmartClassifierText {
  readonly verdict: 'approve' | 'ask'
  readonly detail: string
}

/** Walk one LLM stream, accumulate text blocks, and return a strict
 *  classifier verdict. Any tool-call, protocol-invalid chunk, missing
 *  finish, non-stop finish kind, or non-approve verdict ⇒ ask. */
export async function collectSmartClassifierText(
  iterator: AsyncIterable<unknown>,
  signal: AbortSignal,
): Promise<CollectedSmartClassifierText> {
  const asyncIterator = iterator[Symbol.asyncIterator]()
  const blocks = new Map<number, { type: string; text: string; closed: boolean }>()
  const blockOrder: number[] = []
  let finishReason: { kind: string } | undefined
  let sawFinish = false
  let emittedToolCall = false
  let protocolInvalid = false
  let completed = false
  try {
    while (true) {
      const item = await nextWithSignal(asyncIterator, signal)
      if (item.done) {
        completed = true
        break
      }
      const chunk = item.value as Record<string, unknown> | null
      if (sawFinish) {
        protocolInvalid = true
        continue
      }
      if (chunk === null || typeof chunk !== 'object') {
        protocolInvalid = true
        continue
      }
      const chunkType = chunk.type
      if (chunkType === 'block-start') {
        const index = chunk.index
        const blockType = chunk.blockType
        const validIndex = Number.isSafeInteger(index) && (index as number) >= 0
        const validType = blockType === 'text' || blockType === 'reasoning' || blockType === 'tool-call'
        if (!validIndex || !validType || blocks.has(index as number)) {
          protocolInvalid = true
          continue
        }
        blocks.set(index as number, { type: blockType as string, text: '', closed: false })
        blockOrder.push(index as number)
        if (blockType === 'tool-call') emittedToolCall = true
      } else if (chunkType === 'text-delta' || chunkType === 'reasoning-delta') {
        const state = blocks.get(chunk.index as number)
        const expected = chunkType === 'text-delta' ? 'text' : 'reasoning'
        if (
          state === undefined || state.closed || state.type !== expected
          || typeof chunk.text !== 'string'
        ) {
          protocolInvalid = true
          continue
        }
        state.text += chunk.text
      } else if (chunkType === 'tool-call-delta') {
        const state = blocks.get(chunk.index as number)
        emittedToolCall = true
        if (state === undefined || state.closed || state.type !== 'tool-call') protocolInvalid = true
      } else if (chunkType === 'block-end') {
        const state = blocks.get(chunk.index as number)
        const block = chunk.block as Record<string, unknown> | null | undefined
        if (
          state === undefined || state.closed
          || block === null || typeof block !== 'object'
          || (block.type as string | undefined) !== state.type
        ) {
          protocolInvalid = true
          continue
        }
        state.closed = true
        if (state.type === 'text') {
          if (typeof block.text !== 'string') protocolInvalid = true
          else state.text = block.text
        } else if (state.type === 'tool-call') {
          emittedToolCall = true
        }
      } else if (chunkType === 'finish') {
        const openBlocks = [...blocks.values()].some((b) => !b.closed)
        if (openBlocks) protocolInvalid = true
        sawFinish = true
        finishReason = chunk.reason as { kind: string }
      } else if (chunkType === 'usage') {
        // Informational; multiple usage chunks are tolerated by the harness
        // (warmup vs. final), so we don't flag them as protocol-invalid.
      } else {
        protocolInvalid = true
      }
    }
  } finally {
    if (!completed) {
      const cleanup = Promise.resolve()
        .then(() => asyncIterator.return?.())
        .catch(() => { /* already failing */ })
      void cleanup
    }
  }
  if (protocolInvalid) return { verdict: 'ask', detail: 'protocol-invalid' }
  if (!sawFinish || finishReason === undefined) return { verdict: 'ask', detail: 'missing-finish' }
  if (finishReason.kind !== 'stop') {
    return { verdict: 'ask', detail: `finish-${finishReason.kind}` }
  }
  if (emittedToolCall) return { verdict: 'ask', detail: 'tool-call' }
  const text = blockOrder
    .map((index) => blocks.get(index))
    .filter((b): b is { type: string; text: string; closed: boolean } => b?.type === 'text')
    .map((b) => b.text)
    .join('')
  const verdict = parseSmartClassifierVerdict(text)
  return verdict === undefined
    ? { verdict: 'ask', detail: 'invalid-response' }
    : { verdict, detail: verdict }
}

function nextWithSignal<T>(
  iterator: AsyncIterator<T>,
  signal: AbortSignal,
): Promise<IteratorResult<T>> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('classification aborted'))
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('classification aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve()
      .then(() => iterator.next())
      .then(
        (value) => { signal.removeEventListener('abort', onAbort); resolve(value) },
        (error) => { signal.removeEventListener('abort', onAbort); reject(error) },
      )
  })
}

// ─── LLM classification call ────────────────────────────────────────────────

interface ClassifierEvidence {
  readonly toolName: string
  readonly command: string | null
  readonly toolArguments: string | null
  readonly justification: string | null
  readonly workspacePath: string | null
  readonly latestUserMessage: string | null
}

function inlineSummary(value: unknown, maxChars: number): string {
  const text = typeof value === 'string' ? value : String(value ?? '')
  const singleLine = text.replace(/\s+/g, ' ').trim()
  if (singleLine.length === 0) return '(not available)'
  return singleLine.length <= maxChars ? singleLine : `${singleLine.slice(0, maxChars - 1)}…`
}

const COMMAND_SUMMARY_MAX_CHARS = 160

/** One LLM call with timeout + lifetime signal + protocol aggregation. */
export async function classifySmartShell(
  llm: SmartLlmService,
  defaultModel: SmartDefaultModelService | undefined,
  selection: { provider: string; model: string },
  evidence: ClassifierEvidence,
  sessionId: string,
  execSignal: AbortSignal,
  lifetimeSignal: AbortSignal,
  timeoutMs: number,
  classifierPrompt: string,
): Promise<CollectedSmartClassifierText> {
  const timeoutController = new AbortController()
  const timeoutReason = new Error('classification timed out')
  const signals = [execSignal, lifetimeSignal, timeoutController.signal]
  const signal = AbortSignal.any(signals)
  const timer = setTimeout(() => { timeoutController.abort(timeoutReason) }, timeoutMs)
  try {
    const message = {
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: JSON.stringify(evidence) }],
      source: { kind: 'plugin', plugin: 'dsh-user-approval-mode' },
    }
    const options = {
      provider: selection.provider,
      model: selection.model,
      messages: [message],
      system: classifierPrompt,
      sessionId,
      signal,
    }
    // Touch the seam only when both provider/model resolve. The caller
    // already gated on `selection`, but we keep the seam reference to
    // make the LLM pluggability point explicit.
    void llm
    void defaultModel
    const iterator = llm.stream(options)
    return await collectSmartClassifierText(iterator, signal)
  } catch (error) {
    if (signal.aborted) {
      if (lifetimeSignal.aborted && signal.reason === lifetimeSignal.reason) {
        return { verdict: 'ask', detail: 'unloaded' }
      }
      if (execSignal.aborted && signal.reason === execSignal.reason) {
        return { verdict: 'ask', detail: 'aborted' }
      }
      if (timeoutController.signal.aborted && signal.reason === timeoutReason) {
        return { verdict: 'ask', detail: 'timeout' }
      }
    }
    const detail = error instanceof Error ? error.message : 'llm-error'
    return { verdict: 'ask', detail: `llm-error:${inlineSummary(detail, 80)}` }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Factory: full pipeline evaluator ───────────────────────────────────────

function resolveModelSelection(
  config: SmartEvaluatorConfig,
  defaultModel: SmartDefaultModelService | undefined,
): { provider: string; model: string } | undefined {
  const inheritsProvider = config.smartProvider == null
  const inheritsModel = config.smartModel == null
  const fallback = inheritsProvider || inheritsModel
    ? defaultModel?.currentSelection()
    : undefined
  const provider = inheritsProvider ? fallback?.provider : config.smartProvider
  const model = inheritsModel ? fallback?.model : config.smartModel
  if (
    typeof provider !== 'string' || provider.length === 0
    || typeof model !== 'string' || model.length === 0
  ) {
    return undefined
  }
  return Object.freeze({ provider, model })
}

/** Resolve user events across the two DSH host generations. 0.1.2-rc.1
 *  has `snapshotEvents()`; we fall back to the legacy `events` getter if
 *  the runtime is on an older shape (mirrors `dsh-auto-approve`). */
function sessionEventsFor(session: Session): readonly SessionEvent[] | undefined {
  if (typeof (session as { snapshotEvents?: () => readonly SessionEvent[] }).snapshotEvents === 'function') {
    return (session as { snapshotEvents: () => readonly SessionEvent[] }).snapshotEvents()
  }
  const events = (session as { events?: readonly SessionEvent[] }).events
  return events
}

/** Read one LLM call's argument string. The classifier prompt and the
 *  session-memory key both consume it. */
function argumentsToString(args: unknown): string | undefined {
  if (args === undefined) return undefined
  try {
    return JSON.stringify(args) ?? undefined
  } catch {
    return String(args)
  }
}

/** Build the smart-mode shell evaluator. The factory closes over the
 *  current `SmartEvaluatorConfig`, the compiled patterns, the LLM seam,
 *  and the lifetime signal — all of which can be re-read on each plugin
 *  reload via a fresh `createSmartShellEvaluator` call. */
export function createSmartShellEvaluator(options: {
  config: SmartEvaluatorConfig
  patterns: readonly CompiledSmartDangerPattern[]
  llm: SmartLlmService | undefined
  defaultModel: SmartDefaultModelService | undefined
  memory: SmartSessionMemory
  lifetimeSignal: AbortSignal
  /** Optional `reason` string passed through when the upstream asked the
   *  user to escalate. We surface it as `justification` in evidence. */
  reasonForExec?: (execName: string) => string | undefined
}): SmartShellEvaluator {
  const { config, patterns, llm, defaultModel, memory, lifetimeSignal, reasonForExec } = options

  return async (exec, session) => {
    const command = commandFromArguments(exec.arguments)
    const toolArgumentsString = argumentsToString(exec.arguments)
    const matchText = `${reasonForExec?.(exec.name) ?? ''}\n${toolArgumentsString ?? ''}`
    const danger = findSmartDangerMatch(matchText, patterns)
    if (danger !== undefined) {
      return { kind: 'ask', detail: `pattern=${danger.source}` }
    }

    if (lifetimeSignal.aborted) return { kind: 'ask', detail: 'unloaded' }

    // Session memory is consulted only after the danger list so a danger
    // hit can never be replayed from memory.
    let memoryKey: string | undefined
    if (config.smartSessionMemory && toolArgumentsString !== undefined) {
      memoryKey = smartMemoryKey(exec.name, exec.arguments)
      const remembered = memory.lookup(session.id, memoryKey)
      if (remembered !== undefined) {
        return { kind: 'allow', source: 'remembered' }
      }
    }

    if (llm === undefined) return { kind: 'ask', detail: 'llm-unavailable' }
    const selection = resolveModelSelection(config, defaultModel)
    if (selection === undefined) return { kind: 'ask', detail: 'no-default-model' }

    const events = sessionEventsFor(session)
    const evidence: ClassifierEvidence = {
      toolName: exec.name,
      command: command ?? null,
      toolArguments: toolArgumentsString ?? null,
      justification: reasonForExec?.(exec.name) ?? null,
      workspacePath: session.header?.cwd ?? null,
      latestUserMessage: latestUserMessageText(events),
    }

    // Touch command summary so the linter doesn't drop the import. The
    // summary lives in evidence above as a single-line projection; the
    // helper is exported in case future iterations want to log it.
    void inlineSummary; void COMMAND_SUMMARY_MAX_CHARS

    if (lifetimeSignal.aborted) return { kind: 'ask', detail: 'unloaded' }

    // `exec.signal` is the per-call AbortSignal exposed by the DSH tool
    // execution; we thread it so the LLM call cancels if the user aborts
    // the agent turn mid-classification.
    const execSignal = (exec as { signal?: AbortSignal }).signal ?? new AbortController().signal

    const decision = await classifySmartShell(
      llm,
      defaultModel,
      selection,
      evidence,
      session.id,
      execSignal,
      lifetimeSignal,
      config.smartTimeoutMs,
      config.smartClassifierPrompt,
    )
    if (decision.verdict === 'approve') {
      if (lifetimeSignal.aborted) return { kind: 'ask', detail: 'unloaded' }
      if (memoryKey !== undefined) memory.remember(session.id, memoryKey, 'classifier')
      return { kind: 'allow', source: 'classifier' }
    }
    return { kind: 'ask', detail: decision.detail }
  }
}
