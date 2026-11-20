/**
 * Live model directory for the smart-classifier pickers.
 *
 * The Host already projects its LLM registry into a browser catalogue
 * (`remote.session.modelCatalog()`): every registered provider with the models
 * it advertises, plus the deployment default selection and per-provider
 * failures. That catalogue is a fact about the running Host, not a settings
 * value, so it does not ride `configForms` — the page re-reads it after an
 * adapter change or a reconnect, and the stored `smartProvider` /
 * `smartModel` / `smartReasoningEffort` strings are matched against it.
 *
 * Loading is lazy on purpose: the catalogue call resolves every provider's
 * model list, which can reach the network for API-key routes, so a settings
 * page nobody scrolls to should not pay for it. The page calls `ensure()` on
 * mount and the menu open path calls it again; `refresh()` reloads only once
 * something has already asked for a catalogue.
 *
 * The snapshot is immutable and replaced wholesale, which is what
 * `useSyncExternalStore` needs: an unchanged object between commits so React
 * can bail out of re-rendering.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/** One model as the catalogue advertises it. */
export interface SmartCatalogModel {
    readonly id: string;
    readonly name: string;
    /** Reasoning metadata, present only when the model advertises efforts. */
    readonly reasoning?: {
        readonly efforts: readonly {
            readonly id: string;
            readonly name: string;
        }[];
        readonly defaultEffort?: string;
    };
}
/** One provider group as the catalogue advertises it. */
export interface SmartCatalogGroup {
    readonly id: string;
    readonly name: string;
    readonly models: readonly SmartCatalogModel[];
}
/** Load state of the directory. */
export type SmartCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';
/** Immutable directory snapshot rendered by the page. */
export interface SmartCatalogSnapshot {
    readonly status: SmartCatalogStatus;
    /** Ready-only: provider groups, in the Host's registration order. */
    readonly groups: readonly SmartCatalogGroup[];
    /** The provider the Host default-model selection names, when it has one. */
    readonly defaultProvider: string | undefined;
    /** The model the Host default-model selection names, when it has one. */
    readonly defaultModel: string | undefined;
}
/** The face injected into the settings page. */
export interface SmartModelDirectoryFace {
    /** Subscribe to snapshot replacement; returns the unsubscribe function. */
    subscribe(listener: () => void): () => void;
    /** Current snapshot; stable between commits (useSyncExternalStore contract). */
    getSnapshot(): SmartCatalogSnapshot;
    /** Load once, only while nothing has been loaded yet. */
    ensure(): void;
    /** Reload after an adapter/model change; a no-op before the first load. */
    refresh(): void;
    /** Drop Host-specific state after a connection reset. */
    reset(): void;
    /** Stop publishing; late responses are ignored. */
    dispose(): void;
}
/** Snapshot before any load; also what a connection reset returns to. */
export declare const EMPTY_SMART_CATALOG: SmartCatalogSnapshot;
/** Directory controller: one per plugin instance, bound to the Client context. */
export declare class SmartModelDirectoryController implements SmartModelDirectoryFace {
    private readonly ctx;
    private snapshot;
    private readonly listeners;
    /** Latest load wins; an older response never overwrites a newer one. */
    private generation;
    private disposed;
    /**
     * @param ctx - the client context, whose `remote.session` namespace answers
     *   the Host model catalogue.
     */
    constructor(ctx: ClientContext);
    /** Subscribe to snapshot replacement. */
    subscribe: (listener: () => void) => (() => void);
    /** Current snapshot. */
    getSnapshot: () => SmartCatalogSnapshot;
    /** Load only while the directory is still untouched. */
    ensure: () => void;
    /** Reload only once someone has asked for a catalogue. */
    refresh: () => void;
    /** Drop the catalogue and start over; the next `ensure()` reloads it. */
    reset: () => void;
    /** Stop publishing; in-flight responses are dropped by the generation guard. */
    dispose: () => void;
    private publish;
    private load;
}
//# sourceMappingURL=model-directory.d.ts.map