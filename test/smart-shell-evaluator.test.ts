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
}

interface Harness {
  evaluate: (exec: ExecStub) => Promise<{ kind: 'allow' | 'ask'; source?: string; detail?: string }>
  memory: SmartSessionMemory
  streamCalls: number
  lastSelection: { provider: string; model: string } | undefined
  lastEvidence: { toolName?: string; command?: string | null; toolArguments?: string | null } | undefined
}

const baseConfig: SmartEvaluatorConfig = {
  smartExtraDangerPatterns: [],
  smartSessionMemory: true,
  smartSessionMemoryTtlMs: 60_000,
  smartTimeoutMs: 1_000,
  smartClassifierPrompt: 'mock prompt',
  smartProvider: 'mock-provider',
  smartModel: 'mock-model',
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
  const patterns = compileSmartDangerPatterns(options.configOverrides?.smartExtraDangerPatterns ?? [])
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

  return {
    evaluate: async (exec) => evaluator(
      { name: exec.name, arguments: exec.arguments },
      // Cast the session stub — only `id` and `header` are read by the
      // pipeline; the test never feeds events or tools.
      { id: 'session-stub' as never, header: { cwd: '/tmp' } } as never,
    ) as unknown as Promise<{ kind: 'allow' | 'ask'; source?: string; detail?: string }>,
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
  assert.deepEqual(verdict, { kind: 'allow', source: 'classifier' })
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
