import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
/** One compiled danger pattern. The source is the raw regex string the
 *  plugin was configured with; `regexp` is what we test against. */
export interface CompiledSmartDangerPattern {
    readonly source: string;
    readonly regexp: RegExp;
}
/** Snapshot of the smart-mode config the evaluator reads per call. The
 *  server-side plugin re-reads this on every `tools/pre-execute` via its
 *  settings thunk, so values reflect the latest user/deployer edits. */
export interface SmartEvaluatorConfig {
    readonly smartExtraDangerPatterns: readonly string[];
    readonly smartDangerPatterns: readonly string[] | null;
    readonly smartSessionMemory: boolean;
    readonly smartSessionMemoryTtlMs: number;
    readonly smartTimeoutMs: number;
    readonly smartClassifierPrompt: string;
    readonly smartProvider: string | null;
    readonly smartModel: string | null;
    /** Deployer kill switch for the read-only git fast-path. The fast-path is
     *  checked after the danger list and before the LLM classifier, so a
     *  configured danger pattern always wins (see `read-only-git.ts`). */
    readonly readOnlyGitCommands: boolean;
}
/** The minimum surface we read off `ctx.llm.stream(options)`. Marked
 *  structural so we don't have to import the full dsh-llm types here —
 *  the host's `LlmRuntime` is compatible at runtime. */
export interface SmartLlmService {
    stream(options: {
        provider: string;
        model: string;
        messages: readonly {
            role: string;
            content: readonly {
                type: string;
                text: string;
            }[];
        }[];
        system?: string;
        sessionId?: string;
        signal?: AbortSignal;
    }): AsyncIterable<unknown>;
}
/** The default-model seam. May be absent on the host (fall back to ask). */
export interface SmartDefaultModelService {
    currentSelection(): {
        provider: string;
        model: string;
    } | undefined;
}
/** The resolved provider/model the classifier used, present only when
 *  the LLM classification call actually ran. Lets the host render the
 *  effective model id (including host-default inheritance) in the same
 *  decision log line without a separate pre-call hook. */
export interface SmartModelSelection {
    readonly provider: string;
    readonly model: string;
}
/** Verdict for one shell call. `allow` means the plugin should return
 *  `{ kind: 'allow' }`; `ask` means it should fall through to the existing
 *  approval chain via `{ kind: 'ask' }`. `selection` is set only on the
 *  LLM-classifier paths; short-circuit outcomes (danger hit, read-only git
 *  fast-path, session memory, no-default-model, …) leave it undefined. */
export type SmartShellDecision = {
    readonly kind: 'allow';
    readonly source: 'remembered' | 'classifier';
    readonly selection?: SmartModelSelection;
} | {
    readonly kind: 'allow';
    readonly source: 'read-only-git';
    readonly label: string;
} | {
    readonly kind: 'ask';
    readonly detail: string;
    readonly selection?: SmartModelSelection;
};
/** Factory return type. */
export type SmartShellEvaluator = (exec: {
    name: string;
    arguments: unknown;
}, session: Session) => Promise<SmartShellDecision>;
/** Compile the configured danger patterns. When `primary` is `null` the
 *  13 built-in `DEFAULT_SMART_DANGER_PATTERNS` run; when it is an array the
 *  deployer-supplied list REPLACES the built-ins entirely (mirrors the
 *  `dangerPatterns` switch on `dsh-auto-approve`). `extraPatterns` always
 *  appends on top of whichever primary list won. */
export declare function compileSmartDangerPatterns(primary: readonly string[] | null, extraPatterns: readonly string[]): readonly CompiledSmartDangerPattern[];
/** First compiled pattern whose regex matches `text` (case-insensitive). */
export declare function findSmartDangerMatch(text: string, patterns: readonly CompiledSmartDangerPattern[]): CompiledSmartDangerPattern | undefined;
/** Parse the classifier's deliberately tiny response vocabulary.
 *  Accepts the strictest shape only: `{"verdict":"approve"}` or
 *  `{"verdict":"ask"}`. Surrounding whitespace is tolerated. Any other
 *  shape (multi-key, non-approve value, non-JSON) returns undefined. */
export declare function parseSmartClassifierVerdict(text: string): 'approve' | 'ask' | undefined;
/** Pull a readable command string out of `exec.arguments`. DSH has already
 *  parsed the JSON; we just take `.command` if it looks like the tool
 *  schema's expected `{ command: string }` shape, otherwise stringify. */
export declare function commandFromArguments(args: unknown): string | undefined;
/** Result of reading the newest genuine user message: the joined text (or
 *  null when there is no message / it is image-only), plus a `tooLong`
 *  flag that fires when the budget is exceeded. Mirrors the
 *  `dsh-auto-approve` shape so the caller's tooLong short-circuit sits in
 *  the same place (after the danger list and session memory, before the
 *  LLM call). Truncating trusted context is worse than handing the
 *  classifier less of it. */
export declare function latestUserMessageText(events: readonly SessionEvent[] | undefined): {
    text: string | null;
    tooLong: boolean;
};
export interface SmartSessionMemoryEntry {
    readonly source: 'classifier' | 'human';
    readonly at: number;
}
export interface SmartSessionMemory {
    lookup(sessionId: string, key: string): SmartSessionMemoryEntry | undefined;
    remember(sessionId: string, key: string, source: 'classifier' | 'human'): void;
}
/** Build a per-session memory with TTL pruning and a FIFO cap. */
export declare function createSmartSessionMemory(ttlMs: number): SmartSessionMemory;
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
export declare function smartMemoryKey(toolName: string, args: unknown): string;
interface CollectedSmartClassifierText {
    readonly verdict: 'approve' | 'ask';
    readonly detail: string;
}
/** Walk one LLM stream, accumulate text blocks, and return a strict
 *  classifier verdict. Any tool-call, protocol-invalid chunk, missing
 *  finish, non-stop finish kind, or non-approve verdict ⇒ ask. */
export declare function collectSmartClassifierText(iterator: AsyncIterable<unknown>, signal: AbortSignal): Promise<CollectedSmartClassifierText>;
interface ClassifierEvidence {
    readonly toolName: string;
    readonly command: string | null;
    readonly toolArguments: string | null;
    readonly justification: string | null;
    readonly workspacePath: string | null;
    readonly latestUserMessage: string | null;
}
/** One LLM call with timeout + lifetime signal + protocol aggregation. */
export declare function classifySmartShell(llm: SmartLlmService, defaultModel: SmartDefaultModelService | undefined, selection: {
    provider: string;
    model: string;
}, evidence: ClassifierEvidence, sessionId: string, execSignal: AbortSignal, lifetimeSignal: AbortSignal, timeoutMs: number, classifierPrompt: string): Promise<CollectedSmartClassifierText>;
/** Build the smart-mode shell evaluator. The factory closes over the
 *  current `SmartEvaluatorConfig`, the compiled patterns, the LLM seam,
 *  and the lifetime signal — all of which can be re-read on each plugin
 *  reload via a fresh `createSmartShellEvaluator` call. */
export declare function createSmartShellEvaluator(options: {
    config: SmartEvaluatorConfig;
    patterns: readonly CompiledSmartDangerPattern[];
    llm: SmartLlmService | undefined;
    defaultModel: SmartDefaultModelService | undefined;
    memory: SmartSessionMemory;
    lifetimeSignal: AbortSignal;
    /** Optional `reason` string passed through when the upstream asked the
     *  user to escalate. We surface it as `justification` in evidence. */
    reasonForExec?: (execName: string) => string | undefined;
}): SmartShellEvaluator;
export {};
//# sourceMappingURL=smart-classifier.d.ts.map