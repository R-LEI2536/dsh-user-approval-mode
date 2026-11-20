window.__ModuleLoader__.load({
	id: "dsh-user-approval-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/mode-text.ts
		/** Modes the chip offers, in menu order. Mirrors the server's mode list. */
		const APPROVAL_MODES = [
			"off",
			"request",
			"auto-edit",
			"smart",
			"yolo"
		];
		/**
		* Parse the mode out of a no-arg `/approval-mode` answer.
		* @param text - the command result text, or undefined when the host sent none.
		* @returns the parsed mode, or null when the text is missing or names no known mode.
		*/
		function parseApprovalMode(text) {
			if (text === void 0) return null;
			const match = text.match(/current approval mode: ([\w-]+)/);
			if (match === null) return null;
			const mode = match[1];
			return APPROVAL_MODES.includes(mode) ? mode : null;
		}
		//#endregion
		//#region \0dsh-css:/Users/vren/projects/dsh_plugin_dev/dsh-user-approval-mode/src/client/ApprovalModeChip.module.css.mjs
		const css$1 = ".FvT6ua_container{align-items:center;display:inline-flex}.FvT6ua_trigger{height:28px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);cursor:pointer;background:0 0;border-radius:999px;align-items:center;gap:6px;padding:0 8px 0 12px;font-size:13px;font-weight:500;line-height:20px;transition:all .15s;display:inline-flex}.FvT6ua_trigger:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}.FvT6ua_trigger:disabled{opacity:.5;cursor:not-allowed}.FvT6ua_label{font-weight:500}.FvT6ua_mode{color:var(--dsw-alias-brand-primary);font-weight:600}.FvT6ua_chevron{width:14px;height:14px;color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s;display:inline-flex}.FvT6ua_chevronOpen{transform:rotate(180deg)}@container (width<=460px){.FvT6ua_trigger .FvT6ua_label{display:none}}";
		const tagId$1 = "dsh-user-approval-mode/ApprovalModeChip.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-user-approval-mode";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ApprovalModeChip_module_css_default = {
			"chevron": "FvT6ua_chevron",
			"chevronOpen": "FvT6ua_chevronOpen",
			"container": "FvT6ua_container",
			"label": "FvT6ua_label",
			"mode": "FvT6ua_mode",
			"trigger": "FvT6ua_trigger"
		};
		//#endregion
		//#region src/client/ApprovalModeChip.tsx
		/**
		* ApprovalModeChip: the composer dock entry for switching approval modes.
		*
		* The slot lives in the composer tool row (`conversation.input.left`), which
		* clips overflow. DSH 0.2.2 states the rule on the slot contract itself: fixed
		* overlays in a composer slot must portal to the document body, because the
		* docked composer contains them. The mode menu is a fixed overlay, so it is
		* rendered with `portal` — without it the list can be clipped by the composer.
		*/
		/**
		* Render the approval mode selector chip.
		* @param props - composed slot props.
		* @returns the chip element.
		*/
		function ApprovalModeChip({ cachedMode, switchMode, refreshMode, t }) {
			const [currentMode, setCurrentMode] = (0, react.useState)(() => cachedMode ?? "off");
			const [open, setOpen] = (0, react.useState)(false);
			const [switching, setSwitching] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				refreshMode().then((mode) => {
					if (mode !== null) setCurrentMode(mode);
				}).catch(() => {});
			}, []);
			const options = APPROVAL_MODES;
			const handleSelect = async (mode) => {
				if (mode === currentMode || switching) return;
				setOpen(false);
				setSwitching(true);
				try {
					const error = await switchMode(mode);
					if (error === null) setCurrentMode(mode);
					else console.error("Failed to switch approval mode:", error);
				} catch (err) {
					console.error("Exception while switching approval mode:", err);
				} finally {
					setSwitching(false);
				}
			};
			const items = options.map((mode) => ({
				id: mode,
				label: t(`mode.${mode}`)
			}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ApprovalModeChip_module_css_default.container,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open,
					items,
					selectedId: currentMode,
					onSelect: handleSelect,
					onClose: () => {
						setOpen(false);
					},
					side: "top",
					portal: true,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: ApprovalModeChip_module_css_default.trigger,
						disabled: switching,
						"aria-label": t("label"),
						"aria-haspopup": "listbox",
						"aria-expanded": open,
						onClick: () => {
							setOpen(!open);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ApprovalModeChip_module_css_default.label,
								children: t("label")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ApprovalModeChip_module_css_default.mode,
								children: t(`mode.${currentMode}`)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: open ? `${ApprovalModeChip_module_css_default.chevron} ${ApprovalModeChip_module_css_default.chevronOpen}` : ApprovalModeChip_module_css_default.chevron })
						]
					})
				})
			});
		}
		//#endregion
		//#region src/client/tool-list.ts
		/**
		* The wire format of the four tool-family Config fields (`editTools`,
		* `shellTools`, `readOnlyTools`, `autoAllowTools`): one comma-separated
		* string. The settings control renders it in a textarea and hands the typed
		* text back here, so these three functions are that format's only definition —
		* and, being React- and CSS-free, they are what `test/tool-list.test.ts` can
		* pin down without a DOM.
		*/
		/**
		* Parse edited text into the stored set: split on commas (and on newlines, so
		* a pasted multi-line list parses too), trim every token, drop empty tokens,
		* and deduplicate keeping the first occurrence.
		*
		* @param text - the raw textarea contents.
		* @returns The normalized tool list, in first-seen order.
		*/
		function parseToolList(text) {
			return [...new Set(text.split(/[,\n\r]+/).map((s) => s.trim()).filter((s) => s.length > 0))];
		}
		/**
		* Render the stored set back into the editable text.
		*
		* @param list - the stored tool names.
		* @returns The comma-and-space joined text.
		*/
		function formatToolList(list) {
			return list.join(", ");
		}
		/**
		* Element-wise list equality: the commit no-op guard. A blur whose parsed
		* result equals the current value must not write at all.
		*
		* @param a - one list.
		* @param b - the other list.
		* @returns Whether both lists hold the same entries in the same order.
		*/
		function sameToolList(a, b) {
			return a.length === b.length && a.every((entry, index) => entry === b[index]);
		}
		//#endregion
		//#region \0dsh-css:/Users/vren/projects/dsh_plugin_dev/dsh-user-approval-mode/src/client/ApprovalModeSettings.module.css.mjs
		const css = ".KZMDBG_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.KZMDBG_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}.KZMDBG_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}.KZMDBG_subSection{flex-direction:column;margin-top:16px;display:flex}.KZMDBG_subSection:first-of-type{margin-top:4px}.KZMDBG_subSectionHeader{color:var(--dsw-alias-label-primary);margin:0 0 8px;font-size:14px;font-weight:500;line-height:20px}.KZMDBG_subSectionBody{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:10px;padding:0 16px}.KZMDBG_field{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:6px;padding:12px 0;display:flex}.KZMDBG_subSectionBody>.KZMDBG_field:first-of-type{border-top:none}.KZMDBG_head{align-items:center;gap:8px;display:flex}.KZMDBG_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.KZMDBG_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-size:12px;line-height:1.5}.KZMDBG_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.KZMDBG_reset:disabled{cursor:default;opacity:.4}.KZMDBG_control{display:flex}.KZMDBG_listInput{box-sizing:border-box;field-sizing:content;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;min-height:34px;max-height:134px;color:var(--dsw-alias-label-primary);font:inherit;overflow-wrap:break-word;resize:none;border-radius:8px;padding:6px 12px;font-size:13px;line-height:20px;overflow-y:auto}.KZMDBG_listInput::placeholder{color:var(--dsw-alias-label-dimmed)}.KZMDBG_listInput:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.KZMDBG_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.KZMDBG_dropdownTrigger{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:200px;max-width:240px;height:32px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;text-align:left;border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:0 12px;font-size:13px;line-height:1.5;display:inline-flex}.KZMDBG_dropdownTrigger:hover{border-color:var(--dsw-alias-border-l3)}.KZMDBG_dropdownChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .15s}.KZMDBG_open .KZMDBG_dropdownChevron{transform:rotate(180deg)}.KZMDBG_dropdownValue{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.KZMDBG_dropdownTrigger:disabled{cursor:default;opacity:.55}.KZMDBG_dropdownTrigger:disabled:hover{border-color:var(--dsw-alias-border-l2)}.KZMDBG_catalogStatus{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.KZMDBG_retry{font:inherit;color:var(--dsw-alias-brand-primary);cursor:pointer;background:0 0;border:none;margin-left:6px;padding:0;font-size:12px;text-decoration:underline}.KZMDBG_retry:hover{color:var(--dsw-alias-label-primary)}.KZMDBG_textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;min-height:88px;color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;border-radius:8px;padding:8px 12px;font-size:13px;line-height:1.5}.KZMDBG_textarea:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.KZMDBG_saveError{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}";
		const tagId = "dsh-user-approval-mode/ApprovalModeSettings.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-user-approval-mode";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ApprovalModeSettings_module_css_default = {
			"catalogStatus": "KZMDBG_catalogStatus",
			"control": "KZMDBG_control",
			"dropdownChevron": "KZMDBG_dropdownChevron",
			"dropdownTrigger": "KZMDBG_dropdownTrigger",
			"dropdownValue": "KZMDBG_dropdownValue",
			"field": "KZMDBG_field",
			"head": "KZMDBG_head",
			"hint": "KZMDBG_hint",
			"intro": "KZMDBG_intro",
			"label": "KZMDBG_label",
			"listInput": "KZMDBG_listInput",
			"open": "KZMDBG_open",
			"reset": "KZMDBG_reset",
			"retry": "KZMDBG_retry",
			"saveError": "KZMDBG_saveError",
			"section": "KZMDBG_section",
			"subSection": "KZMDBG_subSection",
			"subSectionBody": "KZMDBG_subSectionBody",
			"subSectionHeader": "KZMDBG_subSectionHeader",
			"textarea": "KZMDBG_textarea",
			"title": "KZMDBG_title"
		};
		//#endregion
		//#region src/client/ApprovalModeSettings.tsx
		/**
		* ApprovalModeSettings: the settings.section page for editing the ten
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
		* The smart-classifier provider/model/effort rows are dropdowns fed by the
		* live Host model directory (see model-directory.ts) rather than free-text
		* inputs, so a configured route is always one the Host actually advertises.
		*
		* Note: the other 8 Config fields are part of the schema but are
		* deliberately deployer-only — they live in `cordis.yml`, not here.
		*/
		const FALLBACK = {
			default: "off",
			editTools: [
				"write",
				"edit",
				"str_replace_editor",
				"update_goal"
			],
			shellTools: [
				"bash",
				"pwsh",
				"tool:bash",
				"tool:pwsh"
			],
			readOnlyTools: [
				"read",
				"glob",
				"grep",
				"read_image",
				"list_directory",
				"todo_write",
				"list_subagent_models",
				"schedule_list",
				"schedule_view",
				"working_directory",
				"list_agents",
				"job_list",
				"get_goal"
			],
			autoAllowTools: [
				"ask_user_question",
				"exit_plan_mode",
				"job_output",
				"skill",
				"subagent",
				"subagent_fork",
				"present",
				"wait_agent",
				"send_message",
				"job_kill",
				"team_task_create",
				"team_task_get",
				"team_task_list",
				"team_task_update",
				"run_code",
				"mnemon_document_create",
				"mnemon_document_manage",
				"mnemon_document_search",
				"mnemon_forget",
				"mnemon_link",
				"mnemon_memory_bodies",
				"mnemon_memory_body_create",
				"mnemon_memory_body_merge",
				"mnemon_memory_body_update",
				"mnemon_recall",
				"mnemon_related",
				"mnemon_remember",
				"mnemon_runtime_memory",
				"mnemon_status",
				"mnemon_subagent_result",
				"mnemon_view_action",
				"mnemon_view_route"
			],
			unclassified: "ask",
			readOnlyGitCommands: true,
			runCodePureExpressions: true,
			sandboxDefaults: {
				request: "workspace-write",
				"auto-edit": "workspace-write",
				smart: "workspace-write",
				yolo: "workspace-write"
			},
			askReason: "[{family}] Tool: {tool} | Mode: {mode}",
			smartProvider: null,
			smartModel: null,
			smartReasoningEffort: null,
			smartExtraDangerPatterns: [],
			smartDangerPatterns: null,
			smartSessionMemory: true,
			smartSessionMemoryTtlMs: 18e5,
			smartTimeoutMs: 15e3,
			smartClassifierPrompt: ""
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
				runCodePureExpressions: c.runCodePureExpressions ?? FALLBACK.runCodePureExpressions,
				sandboxDefaults: c.sandboxDefaults ?? FALLBACK.sandboxDefaults,
				askReason: c.askReason ?? FALLBACK.askReason,
				smartProvider: c.smartProvider ?? FALLBACK.smartProvider,
				smartModel: c.smartModel ?? FALLBACK.smartModel,
				smartReasoningEffort: c.smartReasoningEffort ?? FALLBACK.smartReasoningEffort,
				smartExtraDangerPatterns: c.smartExtraDangerPatterns ?? FALLBACK.smartExtraDangerPatterns,
				smartDangerPatterns: c.smartDangerPatterns ?? FALLBACK.smartDangerPatterns,
				smartSessionMemory: c.smartSessionMemory ?? FALLBACK.smartSessionMemory,
				smartSessionMemoryTtlMs: c.smartSessionMemoryTtlMs ?? FALLBACK.smartSessionMemoryTtlMs,
				smartTimeoutMs: c.smartTimeoutMs ?? FALLBACK.smartTimeoutMs,
				smartClassifierPrompt: c.smartClassifierPrompt ?? FALLBACK.smartClassifierPrompt
			};
		}
		/** One settings row in the DSH settings-panel design language: label + a
		*  text Reset on the right of the same row, then the control, then the
		*  description as a muted hint. The container draws a 1px hairline on top
		*  so consecutive rows read as a list, not as a stack of cards. */
		function FieldShell({ label, descKey, t, onReset, resetLabel, children }) {
			const description = t(descKey);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ApprovalModeSettings_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ApprovalModeSettings_module_css_default.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ApprovalModeSettings_module_css_default.label,
							children: label
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: ApprovalModeSettings_module_css_default.reset,
							onClick: onReset,
							children: resetLabel
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ApprovalModeSettings_module_css_default.control,
						children
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ApprovalModeSettings_module_css_default.hint,
						children: description
					})
				]
			});
		}
		/** Anchored Menu used as a single-select dropdown. */
		function EnumDropdown({ value, items, resolveLabel, onChange, disabled, onOpen }) {
			const [open, setOpen] = (0, react.useState)(false);
			const anchorRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (disabled) setOpen(false);
			}, [disabled]);
			const triggerLabel = resolveLabel(value);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open: open && !disabled,
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: anchorRef,
					type: "button",
					className: `${ApprovalModeSettings_module_css_default.dropdownTrigger} ${open && !disabled ? ApprovalModeSettings_module_css_default.open : ""}`,
					disabled,
					title: triggerLabel,
					onClick: () => {
						if (disabled) return;
						if (!open) onOpen?.();
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ApprovalModeSettings_module_css_default.dropdownValue,
						children: triggerLabel
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
						size: 14,
						className: ApprovalModeSettings_module_css_default.dropdownChevron
					})]
				}),
				items: items.map((item) => ({
					id: item.id,
					label: item.label
				})),
				selectedId: value,
				onSelect: (id) => {
					setOpen(false);
					onChange(id);
				},
				onClose: () => {
					setOpen(false);
				},
				side: "bottom",
				align: "start"
			});
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
			const [text, setText] = (0, react.useState)(formatToolList(value));
			(0, react.useEffect)(() => {
				setText(formatToolList(value));
			}, [value]);
			const commit = (next) => {
				const parts = parseToolList(next);
				if (!sameToolList(parts, value)) onChange(parts);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
				rows: 1,
				value: text,
				placeholder,
				className: ApprovalModeSettings_module_css_default.listInput,
				disabled,
				onChange: (e) => {
					setText(e.target.value);
				},
				onBlur: (e) => {
					commit(e.target.value);
				},
				onKeyDown: (e) => {
					if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
					e.preventDefault();
					commit(text);
				}
			});
		}
		function ApprovalModeSettings({ form, directory, t }) {
			const value = readValue((0, react.useSyncExternalStore)((cb) => form.subscribe(cb), () => form.getSnapshot()).value);
			const [busy, setBusy] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [saveFailed, setSaveFailed] = (0, react.useState)(false);
			const resetField = async (field) => {
				setSaveFailed(false);
				if (!await form.unset(field)) setSaveFailed(true);
			};
			const reset = (field) => {
				resetField(field);
			};
			const commitFields = async (entries) => {
				if (entries.length === 0) return;
				setSaveFailed(false);
				const fields = entries.map(([field]) => field);
				setBusy((prev) => {
					const next = new Set(prev);
					for (const field of fields) next.add(field);
					return next;
				});
				try {
					for (const [field, next] of entries) if (!await form.set(field, next)) {
						setSaveFailed(true);
						return;
					}
				} finally {
					setBusy((prev) => {
						const rest = new Set(prev);
						for (const field of fields) rest.delete(field);
						return rest;
					});
				}
			};
			const commitField = (field, next) => commitFields([[field, next]]);
			const setSandboxMode = (mode, sandboxMode) => {
				commitField("sandboxDefaults", {
					...value.sandboxDefaults,
					[mode]: sandboxMode
				});
			};
			const [askReasonText, setAskReasonText] = (0, react.useState)(value.askReason);
			(0, react.useEffect)(() => {
				setAskReasonText(value.askReason);
			}, [value.askReason]);
			const commitAskReason = (next) => {
				if (next !== value.askReason) commitField("askReason", next);
			};
			const catalog = (0, react.useSyncExternalStore)((cb) => directory.subscribe(cb), () => directory.getSnapshot());
			(0, react.useEffect)(() => {
				directory.ensure();
			}, [directory, catalog.status]);
			const catalogReady = catalog.status === "ready";
			const providerGroup = value.smartProvider === null ? void 0 : catalog.groups.find((group) => group.id === value.smartProvider);
			const efforts = (providerGroup?.models.find((entry) => entry.id === value.smartModel))?.reasoning?.efforts ?? [];
			const inheritLabel = t("smartClassifier.inherit");
			const providerItems = [{
				id: "",
				label: catalog.defaultProvider === void 0 || catalog.defaultModel === void 0 ? inheritLabel : `${inheritLabel} · ${t("smartClassifier.hostDefaultLabel")}: ${catalog.defaultProvider} / ${catalog.defaultModel}`
			}, ...catalog.groups.map((group) => ({
				id: group.id,
				label: group.name
			}))];
			if (value.smartProvider !== null && catalogReady && providerGroup === void 0) providerItems.push({
				id: value.smartProvider,
				label: `${value.smartProvider} · ${t("smartClassifier.outOfCatalog")}`
			});
			const modelItems = (providerGroup?.models ?? []).map((entry) => ({
				id: entry.id,
				label: entry.name
			}));
			if (value.smartModel !== null && catalogReady && !modelItems.some((item) => item.id === value.smartModel)) modelItems.unshift({
				id: value.smartModel,
				label: `${value.smartModel} · ${t("smartClassifier.outOfCatalog")}`
			});
			const effortItems = [{
				id: "",
				label: t("smartClassifier.modelDefault")
			}, ...efforts.map((effort) => ({
				id: effort.id,
				label: effort.name
			}))];
			if (value.smartReasoningEffort !== null && catalogReady && !effortItems.some((item) => item.id === value.smartReasoningEffort)) effortItems.push({
				id: value.smartReasoningEffort,
				label: `${value.smartReasoningEffort} · ${t("smartClassifier.outOfCatalog")}`
			});
			const commitSmartSelection = (next) => {
				const entries = [];
				if (next.provider !== void 0 && next.provider !== value.smartProvider) entries.push(["smartProvider", next.provider]);
				if (next.model !== void 0 && next.model !== value.smartModel) entries.push(["smartModel", next.model]);
				if (next.effort !== void 0 && next.effort !== value.smartReasoningEffort) entries.push(["smartReasoningEffort", next.effort]);
				commitFields(entries);
			};
			/** Effort ids a model advertises inside one provider group. */
			const effortIdsIn = (group, model) => new Set((model === null ? [] : group?.models.find((entry) => entry.id === model)?.reasoning?.efforts ?? []).map((effort) => effort.id));
			const changeProvider = (next) => {
				if (next === "") {
					commitSmartSelection({
						provider: null,
						model: null,
						effort: null
					});
					return;
				}
				const group = catalog.groups.find((entry) => entry.id === next);
				const keepsModel = value.smartModel !== null && group?.models.some((entry) => entry.id === value.smartModel) === true;
				const model = keepsModel ? value.smartModel : group?.models[0]?.id ?? null;
				const keepsEffort = keepsModel && value.smartReasoningEffort !== null && effortIdsIn(group, model).has(value.smartReasoningEffort);
				commitSmartSelection({
					provider: next,
					model,
					effort: keepsEffort ? value.smartReasoningEffort : null
				});
			};
			const changeModel = (next) => {
				const keepsEffort = value.smartReasoningEffort !== null && effortIdsIn(providerGroup, next).has(value.smartReasoningEffort);
				commitSmartSelection({
					model: next,
					effort: keepsEffort ? value.smartReasoningEffort : null
				});
			};
			const changeEffort = (next) => {
				commitSmartSelection({ effort: next === "" ? null : next });
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ApprovalModeSettings_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: ApprovalModeSettings_module_css_default.title,
						children: t("nav.label")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ApprovalModeSettings_module_css_default.intro,
						children: t("intro")
					}),
					saveFailed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ApprovalModeSettings_module_css_default.saveError,
						role: "alert",
						children: t("save.conflict")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ApprovalModeSettings_module_css_default.subSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: ApprovalModeSettings_module_css_default.subSectionHeader,
							children: t("section.tools")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ApprovalModeSettings_module_css_default.subSectionBody,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.editTools"),
									descKey: "desc.editTools",
									t,
									onReset: () => {
										reset("editTools");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CsvInput, {
										value: value.editTools,
										disabled: busy.has("editTools"),
										onChange: (v) => {
											commitField("editTools", v);
										},
										placeholder: t("csv.placeholder")
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.shellTools"),
									descKey: "desc.shellTools",
									t,
									onReset: () => {
										reset("shellTools");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CsvInput, {
										value: value.shellTools,
										disabled: busy.has("shellTools"),
										onChange: (v) => {
											commitField("shellTools", v);
										},
										placeholder: t("csv.placeholder")
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.readOnlyTools"),
									descKey: "desc.readOnlyTools",
									t,
									onReset: () => {
										reset("readOnlyTools");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CsvInput, {
										value: value.readOnlyTools,
										disabled: busy.has("readOnlyTools"),
										onChange: (v) => {
											commitField("readOnlyTools", v);
										},
										placeholder: t("csv.placeholder")
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.autoAllowTools"),
									descKey: "desc.autoAllowTools",
									t,
									onReset: () => {
										reset("autoAllowTools");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CsvInput, {
										value: value.autoAllowTools,
										disabled: busy.has("autoAllowTools"),
										onChange: (v) => {
											commitField("autoAllowTools", v);
										},
										placeholder: t("csv.placeholder")
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.readOnlyGitCommands"),
									descKey: "desc.readOnlyGitCommands",
									t,
									onReset: () => {
										reset("readOnlyGitCommands");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
										checked: value.readOnlyGitCommands,
										disabled: busy.has("readOnlyGitCommands"),
										label: t("field.readOnlyGitCommands"),
										onChange: (next) => {
											commitField("readOnlyGitCommands", next);
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.runCodePureExpressions"),
									descKey: "desc.runCodePureExpressions",
									t,
									onReset: () => {
										reset("runCodePureExpressions");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
										checked: value.runCodePureExpressions,
										disabled: busy.has("runCodePureExpressions"),
										label: t("field.runCodePureExpressions"),
										onChange: (next) => {
											commitField("runCodePureExpressions", next);
										}
									})
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ApprovalModeSettings_module_css_default.subSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: ApprovalModeSettings_module_css_default.subSectionHeader,
							children: t("section.sandbox")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ApprovalModeSettings_module_css_default.subSectionBody,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.sandboxRequest"),
									descKey: "desc.sandbox",
									t,
									onReset: () => {
										reset("sandboxDefaults");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnumDropdown, {
										value: value.sandboxDefaults.request ?? "workspace-write",
										items: [
											{
												id: "read-only",
												label: t("sandbox.read-only")
											},
											{
												id: "workspace-write",
												label: t("sandbox.workspace-write")
											},
											{
												id: "danger-full-access",
												label: t("sandbox.danger-full-access")
											}
										],
										resolveLabel: (id) => t(`sandbox.${id}`),
										onChange: (next) => {
											setSandboxMode("request", next);
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.sandboxAutoEdit"),
									descKey: "desc.sandbox",
									t,
									onReset: () => {
										reset("sandboxDefaults");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnumDropdown, {
										value: value.sandboxDefaults["auto-edit"] ?? "workspace-write",
										items: [
											{
												id: "read-only",
												label: t("sandbox.read-only")
											},
											{
												id: "workspace-write",
												label: t("sandbox.workspace-write")
											},
											{
												id: "danger-full-access",
												label: t("sandbox.danger-full-access")
											}
										],
										resolveLabel: (id) => t(`sandbox.${id}`),
										onChange: (next) => {
											setSandboxMode("auto-edit", next);
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.smartSandbox"),
									descKey: "desc.sandbox",
									t,
									onReset: () => {
										reset("sandboxDefaults");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnumDropdown, {
										value: value.sandboxDefaults.smart ?? "workspace-write",
										items: [
											{
												id: "read-only",
												label: t("sandbox.read-only")
											},
											{
												id: "workspace-write",
												label: t("sandbox.workspace-write")
											},
											{
												id: "danger-full-access",
												label: t("sandbox.danger-full-access")
											}
										],
										resolveLabel: (id) => t(`sandbox.${id}`),
										onChange: (next) => {
											setSandboxMode("smart", next);
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.sandboxYolo"),
									descKey: "desc.sandbox",
									t,
									onReset: () => {
										reset("sandboxDefaults");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnumDropdown, {
										value: value.sandboxDefaults.yolo ?? "workspace-write",
										items: [
											{
												id: "read-only",
												label: t("sandbox.read-only")
											},
											{
												id: "workspace-write",
												label: t("sandbox.workspace-write")
											},
											{
												id: "danger-full-access",
												label: t("sandbox.danger-full-access")
											}
										],
										resolveLabel: (id) => t(`sandbox.${id}`),
										onChange: (next) => {
											setSandboxMode("yolo", next);
										}
									})
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ApprovalModeSettings_module_css_default.subSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: ApprovalModeSettings_module_css_default.subSectionHeader,
							children: t("section.smartClassifier")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ApprovalModeSettings_module_css_default.subSectionBody,
							children: [
								(catalog.status === "loading" || catalog.status === "error") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: ApprovalModeSettings_module_css_default.catalogStatus,
									role: catalog.status === "error" ? "alert" : void 0,
									children: [catalog.status === "error" ? t("smartClassifier.loadError") : t("smartClassifier.loading"), catalog.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ApprovalModeSettings_module_css_default.retry,
										onClick: () => {
											directory.refresh();
										},
										children: t("smartClassifier.retry")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.smartProvider"),
									descKey: "desc.smartProvider",
									t,
									onReset: () => {
										reset("smartProvider");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnumDropdown, {
										value: value.smartProvider ?? "",
										items: providerItems,
										resolveLabel: (id) => id === "" ? inheritLabel : id,
										disabled: !catalogReady || busy.has("smartProvider"),
										onChange: changeProvider
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.smartModel"),
									descKey: "desc.smartModel",
									t,
									onReset: () => {
										reset("smartModel");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnumDropdown, {
										value: value.smartModel ?? "",
										items: modelItems,
										resolveLabel: () => value.smartModel ?? t("smartClassifier.modelInherited"),
										disabled: value.smartProvider === null || !catalogReady || busy.has("smartModel"),
										onChange: changeModel
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
									label: t("field.smartReasoningEffort"),
									descKey: "desc.smartReasoningEffort",
									t,
									onReset: () => {
										reset("smartReasoningEffort");
									},
									resetLabel: t("reset.label"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnumDropdown, {
										value: value.smartReasoningEffort ?? "",
										items: effortItems,
										resolveLabel: (id) => id === "" ? t("smartClassifier.modelDefault") : id,
										disabled: value.smartModel === null || efforts.length === 0 || busy.has("smartReasoningEffort"),
										onChange: changeEffort
									})
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ApprovalModeSettings_module_css_default.subSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: ApprovalModeSettings_module_css_default.subSectionHeader,
							children: t("section.dialog")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ApprovalModeSettings_module_css_default.subSectionBody,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
								label: t("field.askReason"),
								descKey: "desc.askReason",
								t,
								onReset: () => {
									reset("askReason");
								},
								resetLabel: t("reset.label"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									value: askReasonText,
									placeholder: t("askReason.placeholder"),
									className: ApprovalModeSettings_module_css_default.textarea,
									disabled: busy.has("askReason"),
									onChange: (e) => {
										setAskReasonText(e.target.value);
									},
									onBlur: (e) => {
										commitAskReason(e.target.value);
									}
								})
							})
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/model-directory.ts
		/** Snapshot before any load; also what a connection reset returns to. */
		const EMPTY_SMART_CATALOG = Object.freeze({
			status: "idle",
			groups: [],
			defaultProvider: void 0,
			defaultModel: void 0
		});
		/** Directory controller: one per plugin instance, bound to the Client context. */
		var SmartModelDirectoryController = class {
			ctx;
			snapshot = EMPTY_SMART_CATALOG;
			listeners = /* @__PURE__ */ new Set();
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
				return () => {
					this.listeners.delete(listener);
				};
			};
			/** Current snapshot. */
			getSnapshot = () => this.snapshot;
			/** Load only while the directory is still untouched. */
			ensure = () => {
				if (this.snapshot.status === "idle") this.load();
			};
			/** Reload only once someone has asked for a catalogue. */
			refresh = () => {
				if (this.snapshot.status === "idle") return;
				this.load();
			};
			/** Drop the catalogue and start over; the next `ensure()` reloads it. */
			reset = () => {
				if (this.disposed) return;
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
				for (const listener of [...this.listeners]) listener();
			}
			async load() {
				if (this.disposed) return;
				const generation = ++this.generation;
				this.publish({
					...this.snapshot,
					status: "loading"
				});
				const response = await this.ctx.remote.session.modelCatalog();
				if (this.disposed || generation !== this.generation) return;
				if (!response.ok) {
					this.publish({
						...this.snapshot,
						status: "error"
					});
					return;
				}
				this.publish({
					status: "ready",
					groups: response.value.groups,
					defaultProvider: response.value.default?.provider,
					defaultModel: response.value.default?.model
				});
			}
		};
		//#endregion
		//#region src/client/locales.ts
		const en = {
			"label": "Approval",
			"mode.off": "Off",
			"mode.request": "Request",
			"mode.auto-edit": "Auto-edit",
			"mode.smart": "Smart",
			"mode.yolo": "Yolo"
		};
		const zh = {
			"label": "审批",
			"mode.off": "关闭",
			"mode.request": "请求授权",
			"mode.auto-edit": "自动编辑",
			"mode.smart": "智能",
			"mode.yolo": "Yolo"
		};
		const enPage = {
			"nav.label": "Approval Modes",
			"intro": "Configure tool classification, sandbox policy, the approval dialog template, and the smart-mode shell classifier. The default mode and unclassified strategy are set in cordis.yml.",
			"save.conflict": "Save failed: the configuration document was changed by another session. Your change was not saved.",
			"section.tools": "Tool classification",
			"section.sandbox": "Sandbox policy",
			"section.dialog": "Approval prompt",
			"section.smartClassifier": "Smart classifier",
			"field.editTools": "Edit tools",
			"field.shellTools": "Shell tools",
			"field.readOnlyTools": "Read-only tools",
			"field.autoAllowTools": "Auto-allow tools",
			"field.readOnlyGitCommands": "Read-only git commands",
			"field.runCodePureExpressions": "run_code pure expressions",
			"field.sandboxRequest": "Request mode sandbox",
			"field.sandboxAutoEdit": "Auto-edit mode sandbox",
			"field.smartSandbox": "Smart mode sandbox",
			"field.sandboxYolo": "Yolo mode sandbox",
			"field.askReason": "Approval prompt text",
			"field.smartProvider": "Provider",
			"field.smartModel": "Model",
			"field.smartReasoningEffort": "Reasoning effort",
			"desc.editTools": "Tools classified as the \"edit\" family — file modifications. Auto-approved under auto-edit mode.",
			"desc.shellTools": "Tools classified as the \"shell\" family — command execution. Always require approval under request and auto-edit modes.",
			"desc.readOnlyTools": "Tools classified as the \"read-only\" family. Always allowed regardless of mode.",
			"desc.autoAllowTools": "Tools that bypass approval entirely, regardless of family. Overlapping with any family list is harmless (redundant, not conflicting). `run_code` ships here because the PTC preset uses it as a transport: a top-level call is classified by its program's code structure first (pure `tools.*` programs and call-free pure computation pass to the sub-call gate, other JS asks), and the program's tool sub-calls still pass the gate under their real names. Remove it to gate the transport itself (one blind prompt per program). Already compatible with dsh-mnemon: all 17 `mnemon_*` tools ship here, so memory-enabled sessions never prompt for them.",
			"desc.readOnlyGitCommands": "Auto-allow a strictly-parsed read-only command instead of prompting under request, auto-edit, and smart: a single git status / git log / git diff, the same commands chained with &&, ; or |, and echo \"=== x ===\" decoration lines. Redirection (>, 2>&1), quoted git arguments, and anything that writes still ask.",
			"desc.runCodePureExpressions": "Allow the widened grammar in a top-level run_code program (PTC preset) without prompting: call-free pure expressions, recognized control flow (if / for / while / switch / try, bodies recursively checked), and a written-down list of pure builtin methods (.map / .slice / .sort / JSON.parse …) whose callbacks are checked the same way — a tools.* sub-call stays gated wherever it hides, so such code cannot read files, reach the network, or call anything unrecognized. In smart mode this also becomes a fast-allow before the LLM classifier. Turn it off to restore the strict grammar: only tools.* calls, result variables, and returns of trusted values pass.",
			"desc.sandbox": "Sandbox policy the plugin writes when switching into each mode. The \"off\" mode restores the composition default instead.",
			"desc.askReason": "Template shown in the approval dialog. Placeholders: {tool} (tool name), {mode} (current approval mode), {family} (edit | shell | readonly | other). The default is bilingual: a zh UI shows the zh variant via the host displayReason channel while logs keep the English text; a custom template always displays verbatim. For a PTC program's inner tool calls the plugin appends a short argument summary, because the host dialog cannot show those arguments.",
			"desc.smartProvider": "LLM provider for the smart-mode shell classifier, chosen from the models this host currently advertises. \"Inherit host default\" leaves the classifier on the host default-model selection.",
			"desc.smartModel": "LLM model for the smart-mode shell classifier, limited to the selected provider's advertised models. A lighter model reduces per-shell-call cost.",
			"desc.smartReasoningEffort": "Reasoning effort for the classifier call, offered only by models that advertise efforts. \"Model default\" leaves the option unset. A lighter effort lowers each call's latency and cost.",
			"sandbox.read-only": "Read-only",
			"sandbox.workspace-write": "Workspace write",
			"sandbox.danger-full-access": "Danger full access",
			"csv.placeholder": "{write, edit, str_replace_editor}",
			"smartClassifier.inherit": "Inherit host default",
			"smartClassifier.hostDefaultLabel": "Host default",
			"smartClassifier.outOfCatalog": "not in the current catalog",
			"smartClassifier.modelDefault": "Model default",
			"smartClassifier.modelInherited": "Inherited with the provider",
			"smartClassifier.loading": "Loading model catalog…",
			"smartClassifier.loadError": "Model catalog unavailable; the saved values are kept.",
			"smartClassifier.retry": "Retry",
			"reset.label": "Reset",
			"askReason.placeholder": "[{family}] Tool: {tool} | Mode: {mode}"
		};
		const zhPage = {
			"nav.label": "审批模式",
			"intro": "配置工具族分类、各模式 sandbox 策略、审批弹窗文案模板，以及 smart 模式 shell 分类器。默认模式与未分类策略写在 cordis.yml 里。",
			"save.conflict": "保存失败：配置文档已被其他会话修改，本次修改未生效。",
			"section.tools": "工具族分类",
			"section.sandbox": "Sandbox 策略",
			"section.dialog": "审批弹窗",
			"section.smartClassifier": "Smart 分类器",
			"field.editTools": "编辑族工具",
			"field.shellTools": "Shell 族工具",
			"field.readOnlyTools": "只读族工具",
			"field.autoAllowTools": "自动放行工具",
			"field.readOnlyGitCommands": "只读 git 命令",
			"field.runCodePureExpressions": "run_code 纯表达式",
			"field.sandboxRequest": "Request 模式的 sandbox",
			"field.sandboxAutoEdit": "Auto-edit 模式的 sandbox",
			"field.smartSandbox": "Smart 模式的 sandbox",
			"field.sandboxYolo": "Yolo 模式的 sandbox",
			"field.askReason": "审批弹窗文案",
			"field.smartProvider": "Provider",
			"field.smartModel": "Model",
			"field.smartReasoningEffort": "Reasoning 档位",
			"desc.editTools": "归为「编辑族」的工具——文件修改类。在 auto-edit 模式下自动放行。",
			"desc.shellTools": "归为「shell 族」的工具——命令执行类。在 request 和 auto-edit 模式下都需要审批。",
			"desc.readOnlyTools": "归为「只读族」的工具。任何模式下都放行。",
			"desc.autoAllowTools": "绕过审批的工具，与族无关。与任何族名单重叠无副作用（冗余但不冲突）。默认带 `run_code`：PTC preset 下它是传输层，顶层调用先按程序代码结构裁决（纯 `tools.*` 程序与无调用的纯表达式放行交给子调用闸门，其余 JS 弹窗），程序内的工具子调用仍按真实工具名逐个过闸；把它从这个名单删掉，才会改为「每个程序盲弹一次」。已兼容 dsh-mnemon：其全部 17 个 `mnemon_*` 工具默认免审，启用记忆插件的会话不会再为它们弹审批。",
			"desc.readOnlyGitCommands": "在 request / auto-edit / smart 模式下，严格解析后的只读命令直接放行：单条 git status / git log / git diff、用 && / ; / | 串起来的同样命令，以及 echo \"=== x ===\" 这类装饰行。重定向（>、2>&1）、带引号的 git 参数和任何写操作仍会弹窗。",
			"desc.runCodePureExpressions": "PTC preset 下，顶层 run_code 程序的宽语法免弹放行：无调用的纯表达式；受识别的控制流（if / for / while / switch / try，体递归检查）；白名单内建方法（.map / .slice / .sort / JSON.parse 等，回调体同样递归检查）——tools.* 子调用藏在哪都照样过闸，所以这类代码读不了文件、连不了网、调不了任何没被识别的东西。smart 模式下它同时是 LLM 分类器之前的快放。关掉则恢复严格语法：只有 tools.* 调用、接结果变量与受信值 return 免弹。",
			"desc.sandbox": "切到每个模式时插件联动写入的 sandbox 策略。off 模式则恢复为组合默认 sandbox。",
			"desc.askReason": "审批弹窗里显示的文案模板。占位符：{tool}（工具名）、{mode}（当前审批模式）、{family}（edit | shell | readonly | other）。默认模板自带双语：中文 UI 经宿主 displayReason 通道显示中文版，日志仍记英文；自定义模板则单语原样显示。PTC 程序内的工具子调用会额外追加一段参数摘要，因为宿主弹窗无法显示这些参数。",
			"desc.smartProvider": "smart 模式 shell 分类器使用的 LLM provider，从宿主当前公布的模型目录里选。选「继承宿主默认」则跟随宿主默认模型。",
			"desc.smartModel": "smart 模式 shell 分类器使用的模型，只列所选 provider 公布的模型。选轻量模型可降低每次 shell 调用的成本。",
			"desc.smartReasoningEffort": "分类器调用使用的 reasoning 档位，仅模型公布档位时可选。选「模型默认」则不下传该选项。轻档位能降低单次调用的延迟与成本。",
			"sandbox.read-only": "Read-only",
			"sandbox.workspace-write": "Workspace write",
			"sandbox.danger-full-access": "Danger full access",
			"csv.placeholder": "{write, edit, str_replace_editor}",
			"smartClassifier.inherit": "继承宿主默认",
			"smartClassifier.hostDefaultLabel": "宿主当前默认",
			"smartClassifier.outOfCatalog": "不在当前目录中",
			"smartClassifier.modelDefault": "模型默认",
			"smartClassifier.modelInherited": "随 provider 一起继承",
			"smartClassifier.loading": "正在加载模型目录…",
			"smartClassifier.loadError": "模型目录不可用；已保存的值保持不变。",
			"smartClassifier.retry": "重试",
			"reset.label": "重置",
			"askReason.placeholder": "[{family}] 工具: {tool} | 模式: {mode}"
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by the chip. `dsh-user-approval-mode*` prefix
		*  avoids colliding with the official `@deepseek-ai/dsh-user-approval` package
		*  (which also registers a locale named `approval`). */
		const NS = "dsh-user-approval-mode";
		/** Dictionary namespace owned by the settings page. */
		const NS_PAGE = "dsh-user-approval-mode-page";
		/** Settings slot id (page key in the settings sidebar; distinct from the profile entry id). */
		const SETTINGS_ID = "approval-mode";
		/** Profile entry id = settings namespace key (`cordis.patch.yml` `id:`). */
		const ENTRY_ID = "dsh-user-approval-mode";
		/** Settings slot order: bottom of the sidebar, after the Plugins section. */
		const SETTINGS_ORDER = 1100;
		/** Required services: slot registry, commands Remote, locale registry, configuration forms. */
		const inject = [
			"slots",
			"remote",
			"remote.commands",
			"remote.session",
			"locale",
			"configForms"
		];
		/**
		* Per-session mode cache for the chip — a first-paint hint, not the source of
		* truth. Survives chip unmount/remount on session switches so a revisit paints
		* the last known mode with no 'off' flicker, while the mount effect revalidates
		* against the server and corrects the display. Written by a successful chip
		* switch and by a refresh that wins its race against a switch. The Map lives on
		* the module scope, so a DSH restart (browser reload / HMR) drops it along with
		* everything else — no explicit cleanup needed. Bounded by the user's active
		* session count.
		*/
		const sessionModeCache = /* @__PURE__ */ new Map();
		/**
		* Client plugin body: register both the composer chip and the settings page.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-user-approval: chip dictionary");
			ctx.effect(() => ctx.locale.register(NS_PAGE, {
				zh: zhPage,
				en: enPage
			}), "dsh-user-approval: settings page dictionary");
			const tPage = ctx.locale.bind(NS_PAGE);
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: SETTINGS_ID,
				order: 10,
				locale: NS,
				inject: (sessionId) => ({
					cachedMode: sessionModeCache.get(sessionId) ?? null,
					switchMode: async (mode) => {
						console.log("[approval-mode] Switching to mode:", mode);
						const result = await ctx.remote.commands.execute(sessionId, `/approval-mode ${mode}`, []);
						console.log("[approval-mode] Command result:", result);
						if (!result.ok) {
							console.error("[approval-mode] Command failed:", result.error);
							return `${result.error.message} (${result.error.code})`;
						}
						if (result.value === void 0) {
							console.error("[approval-mode] No result value");
							return "unknown command: /approval-mode";
						}
						if (result.value.result.kind === "error") {
							console.error("[approval-mode] Command handler error:", result.value.result.text);
							return result.value.result.text;
						}
						sessionModeCache.set(sessionId, mode);
						console.log("[approval-mode] Successfully switched to:", mode);
						return null;
					},
					refreshMode: async () => {
						const before = sessionModeCache.get(sessionId);
						const result = await ctx.remote.commands.execute(sessionId, "/approval-mode", []);
						if (!result.ok || result.value?.result.kind !== "success") return null;
						const mode = parseApprovalMode(result.value.result.text);
						if (mode === null) return null;
						if (sessionModeCache.get(sessionId) !== before) return null;
						sessionModeCache.set(sessionId, mode);
						if (mode !== before) console.log("[approval-mode] refreshed:", mode, "(was", before ?? "none", ")");
						return mode;
					}
				})
			}, ApprovalModeChip));
			const directory = new SmartModelDirectoryController(ctx);
			ctx.effect(() => ctx.remote.$on("llm/adapters-updated", () => {
				directory.refresh();
			}), "dsh-user-approval: adapter invalidations");
			ctx.effect(() => ctx.remote.$on("llm/models-updated", () => {
				directory.refresh();
			}), "dsh-user-approval: model invalidations");
			const onConnectionReset = ctx.on;
			ctx.effect(() => onConnectionReset.call(ctx, "connection/reset", () => {
				directory.reset();
			}), "dsh-user-approval: connection generation");
			ctx.effect(() => () => {
				directory.dispose();
			}, "dsh-user-approval: model directory");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: SETTINGS_ID,
				order: SETTINGS_ORDER,
				label: () => tPage("nav.label"),
				locale: NS_PAGE,
				inject: () => ({
					form: ctx.configForms.get(ENTRY_ID),
					directory
				})
			}, ApprovalModeSettings));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map