/**
 * Smart-mode shell classifier — ported from `dsh-auto-approve` and adapted
 * for the `tools/pre-execute` waterfall.
 *
 * The pipeline runs four ordered checks for every shell-family tool call
 * under the smart approval mode:
 *
 *   1. Danger list — compiled deterministic regex; a hit hands off to human.
 *   2. Read-only command fast-path — a strictly-parsed chain of read-only git
 *      invocations (plus `echo` decoration lines) auto-approves here, without
 *      touching memory or the LLM (see `read-only-git.ts`). Ordered after the
 *      danger list on purpose.
 *   3. Session memory — `sha256(toolName + rawArguments)` key, 30-min TTL,
 *      per-session bounded cache; a hit auto-approves without LLM.
 *   4. LLM classifier — one-shot chat call against `ctx.llm` with the
 *      evidence JSON + classifier prompt; `approve` → allow + remember,
 *      anything else → ask.
 *   5. Fail-safe — every unexpected outcome (timeout, protocol error,
 *      missing seam, non-approve verdict, exception) routes to ask.
 *
 * The classifier intentionally does NOT keep an in-memory report row or
 * expose `/smart-report`. The DSH conversation log already carries every
 * `tool/call` and approval event; we treat that as the source of truth.
 */
import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_SMART_DANGER_PATTERNS } from './smart-danger-patterns.js';
import { matchReadOnlyGitCommand } from './read-only-git.js';
// ─── Danger patterns ────────────────────────────────────────────────────────
/** Compile the configured danger patterns. When `primary` is `null` the
 *  13 built-in `DEFAULT_SMART_DANGER_PATTERNS` run; when it is an array the
 *  deployer-supplied list REPLACES the built-ins entirely (mirrors the
 *  `dangerPatterns` switch on `dsh-auto-approve`). `extraPatterns` always
 *  appends on top of whichever primary list won. */
export function compileSmartDangerPatterns(primary, extraPatterns) {
    const base = primary ?? DEFAULT_SMART_DANGER_PATTERNS;
    const merged = [...base, ...extraPatterns];
    return merged.map((source) => {
        try {
            return Object.freeze({ source, regexp: new RegExp(source, 'i') });
        }
        catch (error) {
            throw new Error(`dsh-user-approval-mode[smart]: invalid danger pattern ${JSON.stringify(source)}: ${String(error)}`);
        }
    });
}
/** First compiled pattern whose regex matches `text` (case-insensitive). */
export function findSmartDangerMatch(text, patterns) {
    return patterns.find(({ regexp }) => regexp.test(text));
}
// ─── Verdict parser ─────────────────────────────────────────────────────────
/** Parse the classifier's deliberately tiny response vocabulary.
 *  Accepts the strictest shape only: `{"verdict":"approve"}` or
 *  `{"verdict":"ask"}`. Surrounding whitespace is tolerated. Any other
 *  shape (multi-key, non-approve value, non-JSON) returns undefined. */
export function parseSmartClassifierVerdict(text) {
    const trimmed = text.trim();
    const exact = /^\{\s*"verdict"\s*:\s*"(approve|ask)"\s*\}$/.exec(trimmed);
    if (exact === null)
        return undefined;
    let value;
    try {
        value = JSON.parse(trimmed);
    }
    catch {
        return undefined;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const keys = Object.keys(value);
    if (keys.length !== 1 || keys[0] !== 'verdict')
        return undefined;
    const verdict = value.verdict;
    return verdict === 'approve' || verdict === 'ask' ? verdict : undefined;
}
// ─── Command extraction ─────────────────────────────────────────────────────
/** Pull a readable command string out of `exec.arguments`. DSH has already
 *  parsed the JSON; we just take `.command` if it looks like the tool
 *  schema's expected `{ command: string }` shape, otherwise stringify. */
export function commandFromArguments(args) {
    if (args === undefined)
        return undefined;
    if (args !== null && typeof args === 'object' && !Array.isArray(args)) {
        const candidate = args.command;
        if (typeof candidate === 'string')
            return candidate;
    }
    try {
        return JSON.stringify(args);
    }
    catch {
        return String(args);
    }
}
// ─── Latest user message ────────────────────────────────────────────────────
const LATEST_USER_MESSAGE_MAX_CHARS = 2000;
/** Result of reading the newest genuine user message: the joined text (or
 *  null when there is no message / it is image-only), plus a `tooLong`
 *  flag that fires when the budget is exceeded. Mirrors the
 *  `dsh-auto-approve` shape so the caller's tooLong short-circuit sits in
 *  the same place (after the danger list and session memory, before the
 *  LLM call). Truncating trusted context is worse than handing the
 *  classifier less of it. */
export function latestUserMessageText(events) {
    if (events === undefined)
        return { text: null, tooLong: false };
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type !== 'user/message')
            continue;
        const message = event.data;
        if (message === null || typeof message !== 'object')
            continue;
        const source = message.source;
        if (source?.kind !== 'user')
            continue;
        const content = message.content;
        if (!Array.isArray(content))
            return { text: null, tooLong: false };
        let text = '';
        let sawText = false;
        for (const block of content) {
            if (block === null || typeof block !== 'object')
                continue;
            const typed = block;
            if (typed.type !== 'text' || typeof typed.text !== 'string')
                continue;
            const part = `${sawText ? '\n' : ''}${typed.text}`;
            if (text.length + part.length > LATEST_USER_MESSAGE_MAX_CHARS) {
                return { text: null, tooLong: true };
            }
            text += part;
            sawText = true;
        }
        return { text: sawText ? text : null, tooLong: false };
    }
    return { text: null, tooLong: false };
}
// ─── Session memory ─────────────────────────────────────────────────────────
const SESSION_MEMORY_MAX_ENTRIES = 200;
/** Build a per-session memory with TTL pruning and a FIFO cap. */
export function createSmartSessionMemory(ttlMs) {
    const memoryBySession = new Map();
    function lookupEntry(sessionId, key, now) {
        const entries = memoryBySession.get(sessionId);
        if (entries === undefined)
            return undefined;
        const entry = entries.get(key);
        if (entry === undefined)
            return undefined;
        if (now - entry.at > ttlMs) {
            entries.delete(key);
            return undefined;
        }
        return Object.freeze({ source: entry.source, at: entry.at });
    }
    function storeEntry(sessionId, key, source, now) {
        let entries = memoryBySession.get(sessionId);
        if (entries === undefined) {
            entries = new Map();
            memoryBySession.set(sessionId, entries);
        }
        if (!entries.has(key) && entries.size >= SESSION_MEMORY_MAX_ENTRIES) {
            const firstKey = entries.keys().next().value;
            if (firstKey !== undefined)
                entries.delete(firstKey);
        }
        entries.set(key, { source, at: now });
    }
    return Object.freeze({
        lookup(sessionId, key) {
            try {
                return lookupEntry(sessionId, key, Date.now());
            }
            catch {
                return undefined;
            }
        },
        remember(sessionId, key, source) {
            try {
                storeEntry(sessionId, key, source, Date.now());
            }
            catch {
                // Memory is a convenience; a bookkeeping failure never changes an outcome.
            }
        },
    });
}
/** Key for "the same shell call again": tool name + the extracted command.
 *
 * Earlier versions hashed the entire `args` JSON blob, which made the key
 * diverge whenever the tool wrapper attached call-specific metadata
 * (description, callId, timestamp, …) that the agent or user did not write
 * into the shell command itself. Two semantically-identical shell calls
 * therefore missed the session-memory cache. The reference implementation
 * (`ref_codes/dsh-auto-approve-main/index.js`) avoids this by reading the
 * canonical `tool/call` event from the session log via `callId`; we do
 * not have that hook here, so we key on the extracted command string
 * (the same projection used to build classifier evidence). */
export function smartMemoryKey(toolName, args) {
    const content = commandFromArguments(args) ?? String(args);
    return createHash('sha256').update(`${toolName}\n${content}`).digest('hex');
}
/** Walk one LLM stream, accumulate text blocks, and return a strict
 *  classifier verdict. Any tool-call, protocol-invalid chunk, missing
 *  finish, non-stop finish kind, or non-approve verdict ⇒ ask. */
export async function collectSmartClassifierText(iterator, signal) {
    const asyncIterator = iterator[Symbol.asyncIterator]();
    const blocks = new Map();
    const blockOrder = [];
    let finishReason;
    let sawFinish = false;
    let emittedToolCall = false;
    let protocolInvalid = false;
    let completed = false;
    try {
        while (true) {
            const item = await nextWithSignal(asyncIterator, signal);
            if (item.done) {
                completed = true;
                break;
            }
            const chunk = item.value;
            if (sawFinish) {
                protocolInvalid = true;
                continue;
            }
            if (chunk === null || typeof chunk !== 'object') {
                protocolInvalid = true;
                continue;
            }
            const chunkType = chunk.type;
            if (chunkType === 'block-start') {
                const index = chunk.index;
                const blockType = chunk.blockType;
                const validIndex = Number.isSafeInteger(index) && index >= 0;
                const validType = blockType === 'text' || blockType === 'reasoning' || blockType === 'tool-call';
                if (!validIndex || !validType || blocks.has(index)) {
                    protocolInvalid = true;
                    continue;
                }
                blocks.set(index, { type: blockType, text: '', closed: false });
                blockOrder.push(index);
                if (blockType === 'tool-call')
                    emittedToolCall = true;
            }
            else if (chunkType === 'text-delta' || chunkType === 'reasoning-delta') {
                const state = blocks.get(chunk.index);
                const expected = chunkType === 'text-delta' ? 'text' : 'reasoning';
                if (state === undefined || state.closed || state.type !== expected
                    || typeof chunk.text !== 'string') {
                    protocolInvalid = true;
                    continue;
                }
                state.text += chunk.text;
            }
            else if (chunkType === 'tool-call-delta') {
                const state = blocks.get(chunk.index);
                emittedToolCall = true;
                if (state === undefined || state.closed || state.type !== 'tool-call')
                    protocolInvalid = true;
            }
            else if (chunkType === 'block-end') {
                const state = blocks.get(chunk.index);
                const block = chunk.block;
                if (state === undefined || state.closed
                    || block === null || typeof block !== 'object'
                    || block.type !== state.type) {
                    protocolInvalid = true;
                    continue;
                }
                state.closed = true;
                if (state.type === 'text') {
                    if (typeof block.text !== 'string')
                        protocolInvalid = true;
                    else
                        state.text = block.text;
                }
                else if (state.type === 'tool-call') {
                    emittedToolCall = true;
                }
            }
            else if (chunkType === 'finish') {
                const openBlocks = [...blocks.values()].some((b) => !b.closed);
                if (openBlocks)
                    protocolInvalid = true;
                sawFinish = true;
                finishReason = chunk.reason;
            }
            else if (chunkType === 'usage') {
                // Informational; multiple usage chunks are tolerated by the harness
                // (warmup vs. final), so we don't flag them as protocol-invalid.
            }
            else {
                protocolInvalid = true;
            }
        }
    }
    finally {
        if (!completed) {
            const cleanup = Promise.resolve()
                .then(() => asyncIterator.return?.())
                .catch(() => { });
            void cleanup;
        }
    }
    if (protocolInvalid)
        return { verdict: 'ask', detail: 'protocol-invalid' };
    if (!sawFinish || finishReason === undefined)
        return { verdict: 'ask', detail: 'missing-finish' };
    if (finishReason.kind !== 'stop') {
        return { verdict: 'ask', detail: `finish-${finishReason.kind}` };
    }
    if (emittedToolCall)
        return { verdict: 'ask', detail: 'tool-call' };
    const text = blockOrder
        .map((index) => blocks.get(index))
        .filter((b) => b?.type === 'text')
        .map((b) => b.text)
        .join('');
    const verdict = parseSmartClassifierVerdict(text);
    return verdict === undefined
        ? { verdict: 'ask', detail: 'invalid-response' }
        : { verdict, detail: verdict };
}
function nextWithSignal(iterator, signal) {
    if (signal.aborted) {
        return Promise.reject(signal.reason ?? new Error('classification aborted'));
    }
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason ?? new Error('classification aborted'));
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve()
            .then(() => iterator.next())
            .then((value) => { signal.removeEventListener('abort', onAbort); resolve(value); }, (error) => { signal.removeEventListener('abort', onAbort); reject(error); });
    });
}
function inlineSummary(value, maxChars) {
    const text = typeof value === 'string' ? value : String(value ?? '');
    const singleLine = text.replace(/\s+/g, ' ').trim();
    if (singleLine.length === 0)
        return '(not available)';
    return singleLine.length <= maxChars ? singleLine : `${singleLine.slice(0, maxChars - 1)}…`;
}
const COMMAND_SUMMARY_MAX_CHARS = 160;
/** One LLM call with timeout + lifetime signal + protocol aggregation. */
export async function classifySmartShell(llm, defaultModel, selection, evidence, sessionId, execSignal, lifetimeSignal, timeoutMs, classifierPrompt) {
    const timeoutController = new AbortController();
    const timeoutReason = new Error('classification timed out');
    const signals = [execSignal, lifetimeSignal, timeoutController.signal];
    const signal = AbortSignal.any(signals);
    const timer = setTimeout(() => { timeoutController.abort(timeoutReason); }, timeoutMs);
    try {
        const message = {
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text: JSON.stringify(evidence) }],
            source: { kind: 'plugin', plugin: 'dsh-user-approval-mode' },
        };
        const options = {
            provider: selection.provider,
            model: selection.model,
            messages: [message],
            system: classifierPrompt,
            sessionId,
            signal,
        };
        // Touch the seam only when both provider/model resolve. The caller
        // already gated on `selection`, but we keep the seam reference to
        // make the LLM pluggability point explicit.
        void llm;
        void defaultModel;
        const iterator = llm.stream(options);
        return await collectSmartClassifierText(iterator, signal);
    }
    catch (error) {
        if (signal.aborted) {
            if (lifetimeSignal.aborted && signal.reason === lifetimeSignal.reason) {
                return { verdict: 'ask', detail: 'unloaded' };
            }
            if (execSignal.aborted && signal.reason === execSignal.reason) {
                return { verdict: 'ask', detail: 'aborted' };
            }
            if (timeoutController.signal.aborted && signal.reason === timeoutReason) {
                return { verdict: 'ask', detail: 'timeout' };
            }
        }
        const detail = error instanceof Error ? error.message : 'llm-error';
        return { verdict: 'ask', detail: `llm-error:${inlineSummary(detail, 80)}` };
    }
    finally {
        clearTimeout(timer);
    }
}
// ─── Factory: full pipeline evaluator ───────────────────────────────────────
function resolveModelSelection(config, defaultModel) {
    const inheritsProvider = config.smartProvider == null;
    const inheritsModel = config.smartModel == null;
    const fallback = inheritsProvider || inheritsModel
        ? defaultModel?.currentSelection()
        : undefined;
    const provider = inheritsProvider ? fallback?.provider : config.smartProvider;
    const model = inheritsModel ? fallback?.model : config.smartModel;
    if (typeof provider !== 'string' || provider.length === 0
        || typeof model !== 'string' || model.length === 0) {
        return undefined;
    }
    return Object.freeze({ provider, model });
}
/** Resolve user events across the two DSH host generations. 0.1.2-rc.1
 *  has `snapshotEvents()`; we fall back to the legacy `events` getter if
 *  the runtime is on an older shape (mirrors `dsh-auto-approve`). */
function sessionEventsFor(session) {
    if (typeof session.snapshotEvents === 'function') {
        return session.snapshotEvents();
    }
    const events = session.events;
    return events;
}
/** Read one LLM call's argument string. The classifier prompt and the
 *  session-memory key both consume it. */
function argumentsToString(args) {
    if (args === undefined)
        return undefined;
    try {
        return JSON.stringify(args) ?? undefined;
    }
    catch {
        return String(args);
    }
}
/** Build the smart-mode shell evaluator. The factory closes over the
 *  current `SmartEvaluatorConfig`, the compiled patterns, the LLM seam,
 *  and the lifetime signal — all of which can be re-read on each plugin
 *  reload via a fresh `createSmartShellEvaluator` call. */
export function createSmartShellEvaluator(options) {
    const { config, patterns, llm, defaultModel, memory, lifetimeSignal, reasonForExec } = options;
    return async (exec, session) => {
        const command = commandFromArguments(exec.arguments);
        const toolArgumentsString = argumentsToString(exec.arguments);
        const matchText = `${reasonForExec?.(exec.name) ?? ''}\n${toolArgumentsString ?? ''}`;
        const danger = findSmartDangerMatch(matchText, patterns);
        if (danger !== undefined) {
            return { kind: 'ask', detail: `pattern=${danger.source}` };
        }
        // Read-only command fast-path. Positioned AFTER the danger list so no
        // deployer-configured pattern can be bypassed by it, and BEFORE the
        // lifetime check / session memory / LLM call because a pure text match
        // needs none of those resources and is cheaper than all of them.
        // Deliberately not written to session memory: the match is O(1) and a
        // remembered entry would only evict something useful from the cache.
        if (config.readOnlyGitCommands && command !== undefined) {
            const label = matchReadOnlyGitCommand(command);
            if (label !== undefined)
                return { kind: 'allow', source: 'read-only-git', label };
        }
        if (lifetimeSignal.aborted)
            return { kind: 'ask', detail: 'unloaded' };
        // Session memory is consulted only after the danger list so a danger
        // hit can never be replayed from memory.
        let memoryKey;
        if (config.smartSessionMemory && toolArgumentsString !== undefined) {
            memoryKey = smartMemoryKey(exec.name, exec.arguments);
            const remembered = memory.lookup(session.id, memoryKey);
            if (remembered !== undefined) {
                return { kind: 'allow', source: 'remembered' };
            }
        }
        if (llm === undefined)
            return { kind: 'ask', detail: 'llm-unavailable' };
        const selection = resolveModelSelection(config, defaultModel);
        if (selection === undefined)
            return { kind: 'ask', detail: 'no-default-model' };
        const events = sessionEventsFor(session);
        const userMessage = latestUserMessageText(events);
        // TooLong guard: when the newest genuine user message exceeds the
        // 2000-char budget we route to manual review rather than feed the
        // classifier a truncated trusted context. Position mirrors
        // `dsh-auto-approve`: AFTER session memory (so a remembered grant
        // still wins) and BEFORE the LLM call (so we never invoke it).
        if (userMessage.tooLong)
            return { kind: 'ask', detail: 'latest-user-message-too-long' };
        const evidence = {
            toolName: exec.name,
            command: command ?? null,
            toolArguments: toolArgumentsString ?? null,
            justification: reasonForExec?.(exec.name) ?? null,
            workspacePath: session.header?.cwd ?? null,
            latestUserMessage: userMessage.text,
        };
        // Touch command summary so the linter doesn't drop the import. The
        // summary lives in evidence above as a single-line projection; the
        // helper is exported in case future iterations want to log it.
        void inlineSummary;
        void COMMAND_SUMMARY_MAX_CHARS;
        if (lifetimeSignal.aborted)
            return { kind: 'ask', detail: 'unloaded' };
        // `exec.signal` is the per-call AbortSignal exposed by the DSH tool
        // execution; we thread it so the LLM call cancels if the user aborts
        // the agent turn mid-classification.
        const execSignal = exec.signal ?? new AbortController().signal;
        const decision = await classifySmartShell(llm, defaultModel, selection, evidence, session.id, execSignal, lifetimeSignal, config.smartTimeoutMs, config.smartClassifierPrompt);
        // Every return past this point ran the LLM classifier, so the verdict
        // carries the resolved model selection for the host's decision log.
        if (decision.verdict === 'approve') {
            if (lifetimeSignal.aborted)
                return { kind: 'ask', detail: 'unloaded', selection };
            if (memoryKey !== undefined)
                memory.remember(session.id, memoryKey, 'classifier');
            return { kind: 'allow', source: 'classifier', selection };
        }
        return { kind: 'ask', detail: decision.detail, selection };
    };
}
//# sourceMappingURL=smart-classifier.js.map