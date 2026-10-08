/**
 * Integration tests for the smart-mode shell evaluator.
 *
 * The evaluator is the orchestrator: it stitches together danger list,
 * session memory, LLM call (with timeout + abort), and fail-safe. Each
 * test pins one of those branches and asserts the resulting decision.
 *
 * The LLM seam is mocked by an inline fake that yields a configurable
 * stream. The session memory is the real implementation; only its TTL
 * is shortened where convenient.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  compileSmartDangerPatterns,
  createSmartSessionMemory,
  createSmartShellEvaluator,
  type SmartEvaluatorConfig,
  type SmartLlmService,
  type SmartDefaultModelService,
  type SmartSessionMemory,
} from '../src/smart-classifier.ts'

interface ExecStub {
  name: string
  arguments: unknown
  signal?: AbortSignal
}

interface HarnessOptions {
  configOverrides?: Partial<SmartEvaluatorConfig>
  streamFactory?: (selection: { provider: string; model: string }) => AsyncIterable<unknown>
  defaultModel?: SmartDefaultModelService | undefined
  llmAvailable?: boolean
  memory?: SmartSessionMemory
  lifetimeSignal?: AbortSignal
  /** When set, the harness attaches this events array to the session stub
   *  via `snapshotEvents()`. Used by the tooLong short-circuit test. */
  sessionEvents?: readonly unknown[]
}

interface Harness {
  evaluate: (exec: ExecStub) => Promise<{ kind: 'allow' | 'ask'; source?: string; detail?: string; subcommand?: string; selection?: { provider: string; model: string } }>
  memory: SmartSessionMemory
  streamCalls: number
  lastSelection: { provider: string; model: string } | undefined
  lastEvidence: { toolName?: string; command?: string | null; toolArguments?: string | null } | undefined
}

const baseConfig: SmartEvaluatorConfig = {
  smartExtraDangerPatterns: [],
  smartDangerPatterns: null,
  smartSessionMemory: true,
  smartSessionMemoryTtlMs: 60_000,
  smartTimeoutMs: 1_000,
  smartClassifierPrompt: 'mock prompt',
  smartProvider: 'mock-provider',
  smartModel: 'mock-model',
  readOnlyGitCommands: true,
}

function textStream(text: string): AsyncIterable<unknown> {
  return (async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
}

function hangingStream(): AsyncIterable<unknown> {
  return (async function* () {
    await new Promise<void>(() => { /* never resolves */ })
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const patterns = compileSmartDangerPatterns(
    options.configOverrides?.smartDangerPatterns ?? baseConfig.smartDangerPatterns,
    options.configOverrides?.smartExtraDangerPatterns ?? [],
  )
  const config: SmartEvaluatorConfig = { ...baseConfig, ...options.configOverrides }
  const memory = options.memory ?? createSmartSessionMemory(config.smartSessionMemoryTtlMs)
  const lifetimeSignal = options.lifetimeSignal ?? new AbortController().signal

  const streamCalls = { value: 0 }
  const lastSelectionRef: { value: { provider: string; model: string } | undefined } = { value: undefined }
  const lastEvidenceRef: { value: Harness['lastEvidence'] } = { value: undefined }
  const factory = options.streamFactory ?? (() => textStream('{"verdict":"approve"}'))

  const llm: SmartLlmService | undefined = options.llmAvailable === false
    ? undefined
    : {
        stream(options2) {
          streamCalls.value += 1
          lastSelectionRef.value = { provider: options2.provider, model: options2.model }
          try {
            const message = options2.messages[0]
            const firstBlock = message?.content?.[0]
            if (firstBlock && typeof firstBlock === 'object' && 'text' in firstBlock && typeof firstBlock.text === 'string') {
              try {
                const parsed = JSON.parse(firstBlock.text) as Record<string, unknown>
                lastEvidenceRef.value = {
                  toolName: parsed.toolName as string | undefined,
                  command: parsed.command as string | null | undefined,
                  toolArguments: parsed.toolArguments as string | null | undefined,
                }
              } catch { /* not JSON — ignore */ }
            }
          } catch { /* messages shape not as expected — ignore */ }
          return factory(lastSelectionRef.value ?? { provider: 'mock-provider', model: 'mock-model' })
        },
      }

  const evaluator = createSmartShellEvaluator({
    config,
    patterns,
    llm,
    defaultModel: options.defaultModel,
    memory,
    lifetimeSignal,
  })

  const sessionStub = options.sessionEvents !== undefined
    ? {
        id: 'session-stub',
        header: { cwd: '/tmp' },
        snapshotEvents: () => options.sessionEvents ?? [],
      }
    : {
        id: 'session-stub',
        header: { cwd: '/tmp' },
      }

  return {
    evaluate: async (exec) => evaluator(
      { name: exec.name, arguments: exec.arguments },
      sessionStub as never,
    ) as unknown as Promise<{ kind: 'allow' | 'ask'; source?: string; detail?: string; subcommand?: string; selection?: { provider: string; model: string } }>,
    memory,
    get streamCalls() { return streamCalls.value },
    get lastSelection() { return lastSelectionRef.value },
    get lastEvidence() { return lastEvidenceRef.value },
  }
}

test('evaluator: danger pattern hit short-circuits to ask (no LLM call)', async () => {
  const h = makeHarness({
    configOverrides: { smartExtraDangerPatterns: ['\\bNOPE\\b'] },
  })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'something NOPE here' } })
  assert.deepEqual(verdict, { kind: 'ask', detail: 'pattern=\\bNOPE\\b' })
  assert.equal(h.streamCalls, 0, 'danger hit must skip the LLM call entirely')
})

test('evaluator: danger pattern in `arguments` is detected, even without a reason', async () => {
  const h = makeHarness()
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'rm -rf /' } })
  assert.equal(verdict.kind, 'ask')
  assert.match(verdict.detail ?? '', /^pattern=/)
  assert.equal(h.streamCalls, 0)
})

test('evaluator: read-only git fast-path approves without an LLM call', async () => {
  // No LLM seam at all: the fast-path must not depend on it.
  const h = makeHarness({ llmAvailable: false })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'git status --short' } })
  assert.deepEqual(verdict, { kind: 'allow', source: 'read-only-git', subcommand: 'status' })
  assert.equal(h.streamCalls, 0)
})

test('evaluator: the danger list still wins over the read-only git fast-path', async () => {
  // A deployer can add a pattern that matches a read-only command; the
  // fast-path is positioned after the danger list, so the pattern wins.
  const h = makeHarness({ configOverrides: { smartExtraDangerPatterns: ['\\bgit\\b'] } })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'git status' } })
  assert.deepEqual(verdict, { kind: 'ask', detail: 'pattern=\\bgit\\b' })
  assert.equal(h.streamCalls, 0)
})

test('evaluator: the fast-path can be switched off', async () => {
  const h = makeHarness({ configOverrides: { readOnlyGitCommands: false }, llmAvailable: false })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'git status' } })
  assert.equal(verdict.kind, 'ask')
  assert.equal(verdict.detail, 'llm-unavailable')
})

test('evaluator: a chained command is not a fast-path match', async () => {
  const h = makeHarness({ llmAvailable: false })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'git status && rm -rf /' } })
  assert.equal(verdict.kind, 'ask')
  // The built-in danger list catches the `rm` half before the fast-path is
  // ever consulted, so this also pins the ordering.
  assert.match(verdict.detail ?? '', /^pattern=/)
})

test('evaluator: session memory hit approves without calling the LLM', async () => {
  const memory = createSmartSessionMemory(60_000)
  const args = { command: 'npm test' }
  memory.remember('session-stub', 'session-stub-arg-1', 'classifier')  // wrong key: must miss
  // Pre-seed the right key by going through the evaluator first.
  const setup = makeHarness({ memory })
  await setup.evaluate({ name: 'bash', arguments: args })
  assert.equal(setup.streamCalls, 1, 'first call must hit the LLM (classifier approve)')

  // Second harness shares the same memory and must skip the LLM.
  const cached = makeHarness({ memory })
  const verdict = await cached.evaluate({ name: 'bash', arguments: args })
  assert.deepEqual(verdict, { kind: 'allow', source: 'remembered' })
  assert.equal(cached.streamCalls, 0, 'memory hit must skip the LLM')
})

test('evaluator: LLM approve → allow + memory written (classifier source)', async () => {
  const memory = createSmartSessionMemory(60_000)
  const h = makeHarness({ memory })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'npm test' } })
  assert.deepEqual(verdict, { kind: 'allow', source: 'classifier', selection: { provider: 'mock-provider', model: 'mock-model' } })
  assert.equal(h.streamCalls, 1)
  // Evidence sent to the LLM carries toolName + command.
  assert.equal(h.lastEvidence?.toolName, 'bash')
  assert.equal(h.lastEvidence?.command, 'npm test')
})

test('evaluator: LLM ask → ask (memory NOT written)', async () => {
  const memory = createSmartSessionMemory(60_000)
  const h = makeHarness({
    memory,
    streamFactory: () => textStream('{"verdict":"ask"}'),
  })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'something risky' } })
  assert.equal(verdict.kind, 'ask')
  assert.equal(verdict.detail, 'ask')
  // Re-running the same command must still call the LLM (memory wasn't written).
  const second = await h.evaluate({ name: 'bash', arguments: { command: 'something risky' } })
  assert.equal(second.kind, 'ask')
  assert.equal(h.streamCalls, 2)
})

test('evaluator: missing llm seam → ask (fail-safe)', async () => {
  const h = makeHarness({ llmAvailable: false })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(verdict.kind, 'ask')
  assert.equal(verdict.detail, 'llm-unavailable')
})

test('evaluator: missing default-model + user did not override → ask (no-default-model)', async () => {
  const h = makeHarness({
    configOverrides: { smartProvider: null, smartModel: null },
    defaultModel: undefined,
  })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(verdict.kind, 'ask')
  assert.equal(verdict.detail, 'no-default-model')
})

test('evaluator: default-model fallback when user left provider/model blank', async () => {
  const defaultModel: SmartDefaultModelService = {
    currentSelection: () => ({ provider: 'fallback-provider', model: 'fallback-model' }),
  }
  const h = makeHarness({
    configOverrides: { smartProvider: null, smartModel: null },
    defaultModel,
  })
  await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(h.lastSelection?.provider, 'fallback-provider')
  assert.equal(h.lastSelection?.model, 'fallback-model')
})

test('evaluator: user override beats default-model fallback', async () => {
  const defaultModel: SmartDefaultModelService = {
    currentSelection: () => ({ provider: 'fallback-provider', model: 'fallback-model' }),
  }
  const h = makeHarness({
    configOverrides: {},
    defaultModel,
  })
  await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(h.lastSelection?.provider, 'mock-provider')
  assert.equal(h.lastSelection?.model, 'mock-model')
})

test('evaluator: LLM timeout → ask with detail=timeout', async () => {
  const h = makeHarness({
    configOverrides: { smartTimeoutMs: 30 },
    streamFactory: () => hangingStream(),
  })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'sleep 1' } })
  assert.equal(verdict.kind, 'ask')
  assert.match(verdict.detail ?? '', /timeout/)
})

test('evaluator: lifetime signal pre-aborted → ask with detail=unloaded', async () => {
  const controller = new AbortController()
  controller.abort(new Error('plugin unloading'))
  const h = makeHarness({ lifetimeSignal: controller.signal })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(verdict.kind, 'ask')
  assert.equal(verdict.detail, 'unloaded')
  assert.equal(h.streamCalls, 0, 'lifetime-aborted evaluator must skip the LLM entirely')
})

test('evaluator: stream that throws → ask with llm-error detail', async () => {
  const h = makeHarness({
    streamFactory: () => {
      throw new Error('boom')
    },
  })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(verdict.kind, 'ask')
  assert.match(verdict.detail ?? '', /llm-error/)
})

test('evaluator: stream that emits tool-call → ask with detail=tool-call', async () => {
  const toolCallStream: AsyncIterable<unknown> = (async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: '{"verdict":"approve"}' }
    yield { type: 'block-start', index: 1, blockType: 'tool-call' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '{"verdict":"approve"}' } }
    yield { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'c1', name: 'x', arguments: '{}' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  const h = makeHarness({ streamFactory: () => toolCallStream })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(verdict.kind, 'ask')
  assert.equal(verdict.detail, 'tool-call')
})

test('evaluator: tooLong user message → ask, no LLM call', async () => {
  const oversized = 'x'.repeat(2001)
  const events = [{
    type: 'user/message',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: oversized }],
    },
  }]
  const h = makeHarness({ sessionEvents: events })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(verdict.kind, 'ask')
  assert.equal(verdict.detail, 'latest-user-message-too-long')
  assert.equal(h.streamCalls, 0, 'tooLong guard must skip the LLM call')
})

test('evaluator: tooLong user message still respects session memory', async () => {
  // When the same call already lives in session memory, the tooLong guard
  // sits AFTER memory lookup and must NOT override a remembered grant.
  const oversized = 'x'.repeat(2001)
  const events = [{
    type: 'user/message',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: oversized }],
    },
  }]
  const memory = createSmartSessionMemory(60_000)
  const args = { command: 'npm test' }
  // Seed via a clean evaluator first (without events so we don't trigger tooLong).
  const setup = makeHarness({ memory })
  await setup.evaluate({ name: 'bash', arguments: args })
  // Now ask again with an oversized user message — memory should still hit.
  const h = makeHarness({ memory, sessionEvents: events })
  const verdict = await h.evaluate({ name: 'bash', arguments: args })
  assert.equal(verdict.kind, 'allow')
  assert.equal(verdict.source, 'remembered')
  assert.equal(h.streamCalls, 0)
})

test('evaluator: under-budget user message reaches the LLM normally', async () => {
  const events = [{
    type: 'user/message',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'short message' }],
    },
  }]
  const h = makeHarness({ sessionEvents: events })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(verdict.kind, 'allow')
  assert.equal(h.streamCalls, 1)
})

test('evaluator: classifier allow verdict carries the configured model selection', async () => {
  const h = makeHarness()
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'npm test' } })
  assert.equal(verdict.kind, 'allow')
  assert.equal(verdict.source, 'classifier')
  assert.deepEqual(verdict.selection, { provider: 'mock-provider', model: 'mock-model' })
})

test('evaluator: classifier ask verdict carries the host-default fallback model', async () => {
  const defaultModel: SmartDefaultModelService = {
    currentSelection: () => ({ provider: 'fallback-provider', model: 'fallback-model' }),
  }
  const h = makeHarness({
    configOverrides: { smartProvider: null, smartModel: null },
    defaultModel,
    streamFactory: () => textStream('{"verdict":"ask"}'),
  })
  const verdict = await h.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(verdict.kind, 'ask')
  assert.deepEqual(verdict.selection, { provider: 'fallback-provider', model: 'fallback-model' })
})

test('evaluator: short-circuit verdicts carry no model selection', async () => {
  // Danger hit: no LLM call, hence no model resolution.
  const danger = makeHarness({
    configOverrides: { smartExtraDangerPatterns: ['\\bNOPE\\b'] },
  })
  const dangerVerdict = await danger.evaluate({ name: 'bash', arguments: { command: 'something NOPE here' } })
  assert.equal(dangerVerdict.selection, undefined)

  // Memory hit: approves without touching the LLM or resolving a model.
  const memory = createSmartSessionMemory(60_000)
  const args = { command: 'npm test' }
  const setup = makeHarness({ memory })
  await setup.evaluate({ name: 'bash', arguments: args })
  const cached = makeHarness({ memory })
  const cachedVerdict = await cached.evaluate({ name: 'bash', arguments: args })
  assert.equal(cachedVerdict.kind, 'allow')
  assert.equal(cachedVerdict.source, 'remembered')
  assert.equal(cachedVerdict.selection, undefined)

  // No default model: resolution fails before the LLM, no selection.
  const noModel = makeHarness({
    configOverrides: { smartProvider: null, smartModel: null },
    defaultModel: undefined,
  })
  const noModelVerdict = await noModel.evaluate({ name: 'bash', arguments: { command: 'ls' } })
  assert.equal(noModelVerdict.kind, 'ask')
  assert.equal(noModelVerdict.selection, undefined)
})
