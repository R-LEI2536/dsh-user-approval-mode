/** Snapshot before any load; also what a connection reset returns to. */
export const EMPTY_SMART_CATALOG = Object.freeze({
    status: 'idle',
    groups: [],
    defaultProvider: undefined,
    defaultModel: undefined,
});
/** Directory controller: one per plugin instance, bound to the Client context. */
export class SmartModelDirectoryController {
    ctx;
    snapshot = EMPTY_SMART_CATALOG;
    listeners = new Set();
    /** Latest load wins; an older response never overwrites a newer one. */
    generation = 0;
    disposed = false;
    /**
     * @param ctx - the client context, whose `remote.session` namespace answers
     *   the Host model catalogue.
     */
    constructor(ctx) {
        this.ctx = ctx;
    }
    /** Subscribe to snapshot replacement. */
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    /** Current snapshot. */
    getSnapshot = () => this.snapshot;
    /** Load only while the directory is still untouched. */
    ensure = () => {
        if (this.snapshot.status === 'idle')
            void this.load();
    };
    /** Reload only once someone has asked for a catalogue. */
    refresh = () => {
        if (this.snapshot.status === 'idle')
            return;
        void this.load();
    };
    /** Drop the catalogue and start over; the next `ensure()` reloads it. */
    reset = () => {
        if (this.disposed)
            return;
        this.generation += 1;
        this.publish(EMPTY_SMART_CATALOG);
    };
    /** Stop publishing; in-flight responses are dropped by the generation guard. */
    dispose = () => {
        this.disposed = true;
        this.generation += 1;
        this.listeners.clear();
    };
    publish(next) {
        this.snapshot = next;
        for (const listener of [...this.listeners])
            listener();
    }
    async load() {
        if (this.disposed)
            return;
        const generation = ++this.generation;
        // Keep the previous groups while loading so an open menu does not empty out.
        this.publish({ ...this.snapshot, status: 'loading' });
        const response = await this.ctx.remote.session.modelCatalog();
        if (this.disposed || generation !== this.generation)
            return;
        if (!response.ok) {
            this.publish({ ...this.snapshot, status: 'error' });
            return;
        }
        this.publish({
            status: 'ready',
            groups: response.value.groups,
            defaultProvider: response.value.default?.provider,
            defaultModel: response.value.default?.model,
        });
    }
}
//# sourceMappingURL=model-directory.js.map