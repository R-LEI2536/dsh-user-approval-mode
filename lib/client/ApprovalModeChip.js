import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ApprovalModeChip: the composer dock entry for switching approval modes.
 *
 * The slot lives in the composer tool row (`conversation.input.left`), which
 * clips overflow. DSH 0.2.2 states the rule on the slot contract itself: fixed
 * overlays in a composer slot must portal to the document body, because the
 * docked composer contains them. The mode menu is a fixed overlay, so it is
 * rendered with `portal` — without it the list can be clipped by the composer.
 */
import { useState, useEffect } from 'react';
import { Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { APPROVAL_MODES } from './mode-text';
import css from './ApprovalModeChip.module.css';
/**
 * Render the approval mode selector chip.
 * @param props - composed slot props.
 * @returns the chip element.
 */
export function ApprovalModeChip({ cachedMode, switchMode, refreshMode, t }) {
    // First frame paints the cached mode (no 'off' flicker on revisit); the
    // effect below revalidates against the server and corrects it if stale.
    const [currentMode, setCurrentMode] = useState(() => cachedMode ?? 'off');
    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    // Revalidate on every mount. The cache is only a first-paint hint: a mode
    // changed outside this chip (slash command, another window) must not stay
    // displayed after leaving this session and coming back. Empty deps: the slot
    // re-keys per session, so every revisit remounts the chip; the inject factory
    // mints a fresh closure per render and must not re-trigger the query.
    // refreshMode returns null when a chip click won the race or the query
    // failed; the displayed value then stays as-is.
    useEffect(() => {
        refreshMode().then((mode) => {
            if (mode !== null)
                setCurrentMode(mode);
        }).catch(() => {
            // Keep the cached/first-paint value if the server query failed.
        });
    }, []);
    const options = APPROVAL_MODES;
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
    return (_jsx("div", { className: css.container, children: _jsx(Menu, { open: open, items: items, selectedId: currentMode, onSelect: handleSelect, onClose: () => { setOpen(false); }, side: "top", portal: true, anchor: (_jsxs("button", { type: "button", className: css.trigger, disabled: switching, "aria-label": t('label'), "aria-haspopup": "listbox", "aria-expanded": open, onClick: () => { setOpen(!open); }, children: [_jsx("span", { className: css.label, children: t('label') }), _jsx("span", { className: css.mode, children: t(`mode.${currentMode}`) }), _jsx(IconChevronDownOutlineRegular, { className: open ? `${css.chevron} ${css.chevronOpen}` : css.chevron })] })) }) }));
}
//# sourceMappingURL=ApprovalModeChip.js.map