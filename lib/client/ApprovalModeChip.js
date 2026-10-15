import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ApprovalModeChip: the composer dock entry for switching approval modes.
 */
import { useState, useEffect } from 'react';
import { Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './ApprovalModeChip.module.css';
const DEFAULT_MODES = ['off', 'request', 'auto-edit', 'smart', 'yolo'];
/**
 * Render the approval mode selector chip.
 * @param props - composed slot props.
 * @returns the chip element.
 */
export function ApprovalModeChip({ cachedMode, switchMode, getDefaultMode, t }) {
    // Sync cache peek: revisit a previously seen session shows the right mode on the
    // very first frame, with no 'off' flicker and no fetch. First-time visit falls
    // back to 'off' until the effect below resolves.
    const [currentMode, setCurrentMode] = useState(() => cachedMode ?? 'off');
    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    // One-shot fetch on mount only. The previous `[getDefaultMode]` dep re-fired on
    // every chip re-render (inject factory mints a fresh closure per render),
    // so opening the menu or switching modes issued redundant server queries.
    // Empty deps + cache-hit early return covers the revisit case for free.
    useEffect(() => {
        if (cachedMode)
            return;
        getDefaultMode().then((mode) => {
            setCurrentMode(mode);
        }).catch(() => {
            // Keep default 'off' if failed to get mode
        });
    }, []);
    const options = DEFAULT_MODES;
    const handleSelect = async (mode) => {
        if (mode === currentMode || switching)
            return;
        setOpen(false);
        setSwitching(true);
        try {
            const error = await switchMode(mode);
            if (error === null) {
                setCurrentMode(mode); // UI immediately updates
            }
            else {
                console.error('Failed to switch approval mode:', error);
            }
        }
        catch (err) {
            console.error('Exception while switching approval mode:', err);
        }
        finally {
            setSwitching(false);
        }
    };
    const items = options.map((mode) => ({
        id: mode,
        label: t(`mode.${mode}`),
    }));
    return (_jsx("div", { className: css.container, children: _jsx(Menu, { open: open, items: items, selectedId: currentMode, onSelect: handleSelect, onClose: () => { setOpen(false); }, side: "top", anchor: (_jsxs("button", { type: "button", className: css.trigger, disabled: switching, "aria-label": t('label'), "aria-haspopup": "listbox", "aria-expanded": open, onClick: () => { setOpen(!open); }, children: [_jsx("span", { className: css.label, children: t('label') }), _jsx("span", { className: css.mode, children: t(`mode.${currentMode}`) }), _jsx(IconChevronDownOutlineRegular, { className: open ? `${css.chevron} ${css.chevronOpen}` : css.chevron })] })) }) }));
}
//# sourceMappingURL=ApprovalModeChip.js.map