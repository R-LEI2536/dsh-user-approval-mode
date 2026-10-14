import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ApprovalModeSettings: the settings.section page for editing the nine
 * user-facing Config fields. Bound to the plugin entry's volatile Config via
 * the injected configuration form; reads via `form.getSnapshot()`, writes via
 * `form.set()` (merge into the profile user layer) or `form.unset(field)`
 * (clear user override, re-inherit the deployer's cordis base).
 *
 * Visual layout follows the DSH settings-panel design language (see
 * ui-settings-models / ui-settings-plugins for the canonical reference):
 * page title + intro at the top, sub-sections below, each field a
 * vertical block (label row with a text Reset on the right, control,
 * hint) separated from its neighbours by a 1px hairline.
 *
 * Note: the other 8 Config fields are part of the schema but are
 * deliberately deployer-only — they live in `cordis.yml`, not here.
 */
import { useState, useEffect, useSyncExternalStore, useRef } from 'react';
import { Menu, Input, Switch, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatToolList, parseToolList, sameToolList } from './tool-list';
import css from './ApprovalModeSettings.module.css';
// ─── Defaults (mirror src/index.ts' schema; used when the value is undefined).
// The server-side copy is pinned by test/tool-family-defaults.test.ts — keep
// this one in step with it when either side changes. ───────────────────────
const FALLBACK = {
    default: 'off',
    editTools: ['write', 'edit', 'str_replace_editor', 'update_goal'],
    shellTools: ['bash', 'pwsh', 'tool:bash', 'tool:pwsh'],
    readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'reme_search', 'list_agents', 'job_list', 'get_goal'],
    autoAllowTools: ['ask_user_question', 'exit_plan_mode', 'job_output', 'skill', 'subagent', 'present', 'wait_agent', 'send_message', 'team_task_update', 'team_task_list'],
    unclassified: 'ask',
    readOnlyGitCommands: true,
    sandboxDefaults: { request: 'workspace-write', 'auto-edit': 'workspace-write', smart: 'workspace-write', yolo: 'workspace-write' },
    askReason: 'approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_directory instead of shell',
    smartProvider: null,
    smartModel: null,
    smartExtraDangerPatterns: [],
    smartDangerPatterns: null,
    smartSessionMemory: true,
    smartSessionMemoryTtlMs: 1_800_000,
    smartTimeoutMs: 15_000,
    smartClassifierPrompt: '',
};
/** Normalize a partial Config (TS view) into a fully-populated one. */
function readValue(snapshotValue) {
    const c = snapshotValue ?? {};
    return {
        default: c.default ?? FALLBACK.default,
        editTools: c.editTools ?? FALLBACK.editTools,
        shellTools: c.shellTools ?? FALLBACK.shellTools,
        readOnlyTools: c.readOnlyTools ?? FALLBACK.readOnlyTools,
        autoAllowTools: c.autoAllowTools ?? FALLBACK.autoAllowTools,
        unclassified: c.unclassified ?? FALLBACK.unclassified,
        readOnlyGitCommands: c.readOnlyGitCommands ?? FALLBACK.readOnlyGitCommands,
        sandboxDefaults: c.sandboxDefaults ?? FALLBACK.sandboxDefaults,
        askReason: c.askReason ?? FALLBACK.askReason,
        smartProvider: c.smartProvider ?? FALLBACK.smartProvider,
        smartModel: c.smartModel ?? FALLBACK.smartModel,
        smartExtraDangerPatterns: c.smartExtraDangerPatterns ?? FALLBACK.smartExtraDangerPatterns,
        smartDangerPatterns: c.smartDangerPatterns ?? FALLBACK.smartDangerPatterns,
        smartSessionMemory: c.smartSessionMemory ?? FALLBACK.smartSessionMemory,
        smartSessionMemoryTtlMs: c.smartSessionMemoryTtlMs ?? FALLBACK.smartSessionMemoryTtlMs,
        smartTimeoutMs: c.smartTimeoutMs ?? FALLBACK.smartTimeoutMs,
        smartClassifierPrompt: c.smartClassifierPrompt ?? FALLBACK.smartClassifierPrompt,
    };
}
/** One settings row in the DSH settings-panel design language: label + a
 *  text Reset on the right of the same row, then the control, then the
 *  description as a muted hint. The container draws a 1px hairline on top
 *  so consecutive rows read as a list, not as a stack of cards. */
function FieldShell({ label, descKey, t, onReset, resetLabel, children }) {
    const description = t(descKey);
    return (_jsxs("div", { className: css.field, children: [_jsxs("div", { className: css.head, children: [_jsx("span", { className: css.label, children: label }), _jsx("button", { type: "button", className: css.reset, onClick: onReset, children: resetLabel })] }), _jsx("div", { className: css.control, children: children }), _jsx("p", { className: css.hint, children: description })] }));
}
/** Anchored Menu used as a single-select dropdown. */
function EnumDropdown({ value, items, resolveLabel, onChange }) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef(null);
    return (_jsx(Menu, { open: open, anchor: (_jsxs("button", { ref: anchorRef, type: "button", className: `${css.dropdownTrigger} ${open ? css.open : ''}`, onClick: () => { setOpen(!open); }, children: [_jsx("span", { children: resolveLabel(value) }), _jsx(IconChevronDownOutlineRegular, { size: 14, className: css.dropdownChevron })] })), items: items.map(item => ({ id: item.id, label: resolveLabel(item.id) })), selectedId: value, onSelect: (id) => {
            setOpen(false);
            onChange(id);
        }, onClose: () => { setOpen(false); }, side: "bottom", align: "start" }));
}
/** Editable string[] as a comma-separated textarea. Treats the value as a set:
 *  on commit, splits on commas (or newlines, so a pasted list parses), trims
 *  each token, drops empties, and deduplicates (first occurrence wins).
 *
 *  Commit happens on blur or Enter, NOT on every keystroke. Live committing
 *  would round-trip through the settings form on each character; the
 *  dedup/trim pass can change the string shape, which would reset the
 *  controlled value and snap the caret to the end mid-typing. Holding the
 *  parsed result until commit keeps the cursor stable while the user edits. A
 *  commit whose parsed result equals the current value sends no write at all.
 *
 *  The box is a textarea rather than an input so that a long tool list wraps
 *  instead of scrolling sideways. Its height is pure CSS (`field-sizing:
 *  content` under a max-height cap — see `.listInput`), so no measuring
 *  effect is needed. */
function CsvInput({ value, onChange, placeholder, disabled }) {
    // Local copy mirrors the value; resyncs only when the prop changes (e.g.,
    // an external reset or form update overrides the in-progress edit).
    const [text, setText] = useState(formatToolList(value));
    useEffect(() => { setText(formatToolList(value)); }, [value]);
    const commit = (next) => {
        const parts = parseToolList(next);
        if (!sameToolList(parts, value))
            onChange(parts);
    };
    return (_jsx("textarea", { rows: 1, value: text, placeholder: placeholder, className: css.listInput, disabled: disabled, onChange: (e) => { setText(e.target.value); }, onBlur: (e) => { commit(e.target.value); }, onKeyDown: (e) => {
            // A list value holds no newlines, so Enter commits instead of breaking
            // the line. Never intercept while an IME is composing.
            if (e.key !== 'Enter' || e.nativeEvent.isComposing)
                return;
            e.preventDefault();
            commit(text);
        } }));
}
// ─── Main component ─────────────────────────────────────────────────────────
export function ApprovalModeSettings({ form, t }) {
    // useSyncExternalStore on the form; getSnapshot returns a stable reference
    // until the next commit, so React bails out of unnecessary re-renders.
    const snapshot = useSyncExternalStore((cb) => form.subscribe(cb), () => form.getSnapshot());
    const value = readValue(snapshot.value);
    // Write-in-flight guard and refused-write alert (official DeveloperToolsRow
    // pattern): busy disables the control being committed, saveFailed renders an
    // inline alert so a rejected write never vanishes silently.
    const [busy, setBusy] = useState(new Set());
    const [saveFailed, setSaveFailed] = useState(false);
    // Always-visible reset: clears the user override for this top-level field,
    // letting it re-inherit the cordis `base`. No confirm — reset is reversible.
    const resetField = async (field) => {
        setSaveFailed(false);
        if (!await form.unset(field))
            setSaveFailed(true);
    };
    const reset = (field) => { void resetField(field); };
    // Official settings-page pattern (cf. DeveloperToolsRow): a commit disables
    // the control while in flight, and a refused write surfaces an alert instead
    // of silently reverting — the recovery re-read would otherwise erase the
    // field on screen without the user knowing why. No auto-retry: re-applying
    // could clobber a concurrent edit.
    const commitField = async (field, next) => {
        setSaveFailed(false);
        setBusy(prev => new Set(prev).add(field));
        try {
            if (!await form.set(field, next))
                setSaveFailed(true);
        }
        finally {
            setBusy(prev => { const rest = new Set(prev); rest.delete(field); return rest; });
        }
    };
    // SandboxDefaults is a single field; each mode row edits a sub-key.
    const setSandboxMode = (mode, sandboxMode) => {
        void commitField('sandboxDefaults', { ...value.sandboxDefaults, [mode]: sandboxMode });
    };
    // askReason is a free-form textarea. Live committing on every keystroke
    // round-trips through the settings form and snaps the caret to the end
    // mid-typing; hold the typed text in local state and commit on blur so
    // the caret stays where the user put it.
    const [askReasonText, setAskReasonText] = useState(value.askReason);
    useEffect(() => { setAskReasonText(value.askReason); }, [value.askReason]);
    const commitAskReason = (next) => {
        if (next !== value.askReason) {
            void commitField('askReason', next);
        }
    };
    // smartProvider/smartModel are single-line inputs. Same live-commit hazard
    // as askReason above: committing on every keystroke round-trips through the
    // settings form and snaps the caret to the end mid-typing (fast typing can
    // even drop characters). Hold each draft locally and commit on blur.
    const [smartProviderText, setSmartProviderText] = useState(value.smartProvider ?? '');
    useEffect(() => { setSmartProviderText(value.smartProvider ?? ''); }, [value.smartProvider]);
    const commitSmartProvider = (next) => {
        const normalized = next === '' ? null : next;
        if (normalized !== value.smartProvider) {
            void commitField('smartProvider', normalized);
        }
    };
    const [smartModelText, setSmartModelText] = useState(value.smartModel ?? '');
    useEffect(() => { setSmartModelText(value.smartModel ?? ''); }, [value.smartModel]);
    const commitSmartModel = (next) => {
        const normalized = next === '' ? null : next;
        if (normalized !== value.smartModel) {
            void commitField('smartModel', normalized);
        }
    };
    return (_jsxs("div", { className: css.section, children: [_jsx("h2", { className: css.title, children: t('nav.label') }), _jsx("p", { className: css.intro, children: t('intro') }), saveFailed && (_jsx("p", { className: css.saveError, role: "alert", children: t('save.conflict') })), _jsxs("div", { className: css.subSection, children: [_jsx("h3", { className: css.subSectionHeader, children: t('section.tools') }), _jsxs("div", { className: css.subSectionBody, children: [_jsx(FieldShell, { label: t('field.editTools'), descKey: "desc.editTools", t: t, onReset: () => { reset('editTools'); }, resetLabel: t('reset.label'), children: _jsx(CsvInput, { value: value.editTools, disabled: busy.has('editTools'), onChange: (v) => { void commitField('editTools', v); }, placeholder: t('csv.placeholder') }) }), _jsx(FieldShell, { label: t('field.shellTools'), descKey: "desc.shellTools", t: t, onReset: () => { reset('shellTools'); }, resetLabel: t('reset.label'), children: _jsx(CsvInput, { value: value.shellTools, disabled: busy.has('shellTools'), onChange: (v) => { void commitField('shellTools', v); }, placeholder: t('csv.placeholder') }) }), _jsx(FieldShell, { label: t('field.readOnlyTools'), descKey: "desc.readOnlyTools", t: t, onReset: () => { reset('readOnlyTools'); }, resetLabel: t('reset.label'), children: _jsx(CsvInput, { value: value.readOnlyTools, disabled: busy.has('readOnlyTools'), onChange: (v) => { void commitField('readOnlyTools', v); }, placeholder: t('csv.placeholder') }) }), _jsx(FieldShell, { label: t('field.autoAllowTools'), descKey: "desc.autoAllowTools", t: t, onReset: () => { reset('autoAllowTools'); }, resetLabel: t('reset.label'), children: _jsx(CsvInput, { value: value.autoAllowTools, disabled: busy.has('autoAllowTools'), onChange: (v) => { void commitField('autoAllowTools', v); }, placeholder: t('csv.placeholder') }) }), _jsx(FieldShell, { label: t('field.readOnlyGitCommands'), descKey: "desc.readOnlyGitCommands", t: t, onReset: () => { reset('readOnlyGitCommands'); }, resetLabel: t('reset.label'), children: _jsx(Switch, { checked: value.readOnlyGitCommands, disabled: busy.has('readOnlyGitCommands'), label: t('field.readOnlyGitCommands'), onChange: (next) => { void commitField('readOnlyGitCommands', next); } }) })] })] }), _jsxs("div", { className: css.subSection, children: [_jsx("h3", { className: css.subSectionHeader, children: t('section.sandbox') }), _jsxs("div", { className: css.subSectionBody, children: [_jsx(FieldShell, { label: t('field.sandboxRequest'), descKey: "desc.sandbox", t: t, onReset: () => { reset('sandboxDefaults'); }, resetLabel: t('reset.label'), children: _jsx(EnumDropdown, { value: value.sandboxDefaults.request ?? 'workspace-write', items: [
                                        { id: 'read-only', label: t('sandbox.read-only') },
                                        { id: 'workspace-write', label: t('sandbox.workspace-write') },
                                        { id: 'danger-full-access', label: t('sandbox.danger-full-access') },
                                    ], resolveLabel: (id) => t(`sandbox.${id}`), onChange: (next) => { setSandboxMode('request', next); } }) }), _jsx(FieldShell, { label: t('field.sandboxAutoEdit'), descKey: "desc.sandbox", t: t, onReset: () => { reset('sandboxDefaults'); }, resetLabel: t('reset.label'), children: _jsx(EnumDropdown, { value: value.sandboxDefaults['auto-edit'] ?? 'workspace-write', items: [
                                        { id: 'read-only', label: t('sandbox.read-only') },
                                        { id: 'workspace-write', label: t('sandbox.workspace-write') },
                                        { id: 'danger-full-access', label: t('sandbox.danger-full-access') },
                                    ], resolveLabel: (id) => t(`sandbox.${id}`), onChange: (next) => { setSandboxMode('auto-edit', next); } }) }), _jsx(FieldShell, { label: t('field.smartSandbox'), descKey: "desc.sandbox", t: t, onReset: () => { reset('sandboxDefaults'); }, resetLabel: t('reset.label'), children: _jsx(EnumDropdown, { value: value.sandboxDefaults.smart ?? 'workspace-write', items: [
                                        { id: 'read-only', label: t('sandbox.read-only') },
                                        { id: 'workspace-write', label: t('sandbox.workspace-write') },
                                        { id: 'danger-full-access', label: t('sandbox.danger-full-access') },
                                    ], resolveLabel: (id) => t(`sandbox.${id}`), onChange: (next) => { setSandboxMode('smart', next); } }) }), _jsx(FieldShell, { label: t('field.sandboxYolo'), descKey: "desc.sandbox", t: t, onReset: () => { reset('sandboxDefaults'); }, resetLabel: t('reset.label'), children: _jsx(EnumDropdown, { value: value.sandboxDefaults.yolo ?? 'workspace-write', items: [
                                        { id: 'read-only', label: t('sandbox.read-only') },
                                        { id: 'workspace-write', label: t('sandbox.workspace-write') },
                                        { id: 'danger-full-access', label: t('sandbox.danger-full-access') },
                                    ], resolveLabel: (id) => t(`sandbox.${id}`), onChange: (next) => { setSandboxMode('yolo', next); } }) })] })] }), _jsxs("div", { className: css.subSection, children: [_jsx("h3", { className: css.subSectionHeader, children: t('section.smartClassifier') }), _jsxs("div", { className: css.subSectionBody, children: [_jsx(FieldShell, { label: t('field.smartProvider'), descKey: "desc.smartProvider", t: t, onReset: () => { reset('smartProvider'); }, resetLabel: t('reset.label'), children: _jsx(Input, { value: smartProviderText, placeholder: t('smartClassifier.provider.placeholder'), className: css.csvInput, disabled: busy.has('smartProvider'), onChange: (e) => { setSmartProviderText(e.target.value); }, onBlur: (e) => { commitSmartProvider(e.target.value); } }) }), _jsx(FieldShell, { label: t('field.smartModel'), descKey: "desc.smartModel", t: t, onReset: () => { reset('smartModel'); }, resetLabel: t('reset.label'), children: _jsx(Input, { value: smartModelText, placeholder: t('smartClassifier.model.placeholder'), className: css.csvInput, disabled: busy.has('smartModel'), onChange: (e) => { setSmartModelText(e.target.value); }, onBlur: (e) => { commitSmartModel(e.target.value); } }) })] })] }), _jsxs("div", { className: css.subSection, children: [_jsx("h3", { className: css.subSectionHeader, children: t('section.dialog') }), _jsx("div", { className: css.subSectionBody, children: _jsx(FieldShell, { label: t('field.askReason'), descKey: "desc.askReason", t: t, onReset: () => { reset('askReason'); }, resetLabel: t('reset.label'), children: _jsx("textarea", { value: askReasonText, placeholder: t('askReason.placeholder'), className: css.textarea, disabled: busy.has('askReason'), onChange: (e) => { setAskReasonText(e.target.value); }, onBlur: (e) => { commitAskReason(e.target.value); } }) }) })] })] }));
}
//# sourceMappingURL=ApprovalModeSettings.js.map