window.__ModuleLoader__.load({
	id: "dsh-user-approval-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:D:\dsh-plugin\dsh-user-approval-mode\src\client\ApprovalModeChip.module.css.mjs
		const css$1 = ".Ydb_JG_container{align-items:center;display:inline-flex}.Ydb_JG_trigger{height:28px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);cursor:pointer;background:0 0;border-radius:999px;align-items:center;gap:6px;padding:0 8px 0 12px;font-size:13px;font-weight:500;line-height:20px;transition:all .15s;display:inline-flex}.Ydb_JG_trigger:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}.Ydb_JG_trigger:disabled{opacity:.5;cursor:not-allowed}.Ydb_JG_label{font-weight:500}.Ydb_JG_mode{color:var(--dsw-alias-brand-primary);font-weight:600}.Ydb_JG_chevron{width:14px;height:14px;color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s;display:inline-flex}.Ydb_JG_chevronOpen{transform:rotate(180deg)}@container (width<=460px){.Ydb_JG_trigger .Ydb_JG_label{display:none}}";
		const tagId$1 = "dsh-user-approval-mode/ApprovalModeChip.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-user-approval-mode";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ApprovalModeChip_module_css_default = {
			"mode": "Ydb_JG_mode",
			"trigger": "Ydb_JG_trigger",
			"container": "Ydb_JG_container",
			"chevronOpen": "Ydb_JG_chevronOpen",
			"chevron": "Ydb_JG_chevron",
			"label": "Ydb_JG_label"
		};
		//#endregion
		//#region src/client/ApprovalModeChip.tsx
		/**
		* ApprovalModeChip: the composer dock entry for switching approval modes.
		*/
		const DEFAULT_MODES = [
			"off",
			"request",
			"auto-edit",
			"smart",
			"yolo"
		];
		/**
		* Render the approval mode selector chip.
		* @param props - composed slot props.
		* @returns the chip element.
		*/
		function ApprovalModeChip({ cachedMode, switchMode, getDefaultMode, t }) {
			const [currentMode, setCurrentMode] = (0, react.useState)(() => cachedMode ?? "off");
			const [open, setOpen] = (0, react.useState)(false);
			const [switching, setSwitching] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (cachedMode) return;
				getDefaultMode().then((mode) => {
					setCurrentMode(mode);
				}).catch(() => {});
			}, []);
			const options = DEFAULT_MODES;
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
		//#region \0dsh-css:D:\dsh-plugin\dsh-user-approval-mode\src\client\ApprovalModeSettings.module.css.mjs
		const css = "._5EHSxW_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}._5EHSxW_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}._5EHSxW_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}._5EHSxW_subSection{flex-direction:column;margin-top:16px;display:flex}._5EHSxW_subSection:first-of-type{margin-top:4px}._5EHSxW_subSectionHeader{color:var(--dsw-alias-label-primary);margin:0 0 8px;font-size:14px;font-weight:500;line-height:20px}._5EHSxW_subSectionBody{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:10px;padding:0 16px}._5EHSxW_field{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:6px;padding:12px 0;display:flex}._5EHSxW_subSectionBody ._5EHSxW_field:first-child{border-top:none}._5EHSxW_head{align-items:center;gap:8px;display:flex}._5EHSxW_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}._5EHSxW_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-size:12px;line-height:1.5}._5EHSxW_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}._5EHSxW_reset:disabled{cursor:default;opacity:.4}._5EHSxW_control{display:flex}._5EHSxW_csvInput{width:100%}._5EHSxW_listInput{box-sizing:border-box;field-sizing:content;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;min-height:34px;max-height:134px;color:var(--dsw-alias-label-primary);font:inherit;overflow-wrap:break-word;resize:none;border-radius:8px;padding:6px 12px;font-size:13px;line-height:20px;overflow-y:auto}._5EHSxW_listInput::placeholder{color:var(--dsw-alias-label-dimmed)}._5EHSxW_listInput:focus{border-color:var(--dsw-alias-brand-primary);outline:none}._5EHSxW_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}._5EHSxW_dropdownTrigger{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:200px;max-width:240px;height:32px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;text-align:left;border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:0 12px;font-size:13px;line-height:1.5;display:inline-flex}._5EHSxW_dropdownTrigger:hover{border-color:var(--dsw-alias-border-l3)}._5EHSxW_dropdownChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .15s}._5EHSxW_open ._5EHSxW_dropdownChevron{transform:rotate(180deg)}._5EHSxW_textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;min-height:88px;color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;border-radius:8px;padding:8px 12px;font-size:13px;line-height:1.5}._5EHSxW_textarea:focus{border-color:var(--dsw-alias-brand-primary);outline:none}._5EHSxW_saveError{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}";
		const tagId = "dsh-user-approval-mode/ApprovalModeSettings.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-user-approval-mode";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ApprovalModeSettings_module_css_default = {
			"title": "_5EHSxW_title",
			"dropdownChevron": "_5EHSxW_dropdownChevron",
			"open": "_5EHSxW_open",
			"saveError": "_5EHSxW_saveError",
			"intro": "_5EHSxW_intro",
			"control": "_5EHSxW_control",
			"listInput": "_5EHSxW_listInput",
			"head": "_5EHSxW_head",
			"csvInput": "_5EHSxW_csvInput",
			"hint": "_5EHSxW_hint",
			"textarea": "_5EHSxW_textarea",
			"subSectionBody": "_5EHSxW_subSectionBody",
			"field": "_5EHSxW_field",
			"label": "_5EHSxW_label",
			"reset": "_5EHSxW_reset",
			"dropdownTrigger": "_5EHSxW_dropdownTrigger",
			"section": "_5EHSxW_section",
			"subSection": "_5EHSxW_subSection",
			"subSectionHeader": "_5EHSxW_subSectionHeader"
		};
		//#endregion
		//#region src/client/ApprovalModeSettings.tsx
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
				"reme_search",
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
				"present",
				"wait_agent",
				"send_message",
				"team_task_update",
				"team_task_list"
			],
			unclassified: "ask",
			readOnlyGitCommands: true,
			sandboxDefaults: {
				request: "workspace-write",
				"auto-edit": "workspace-write",
				smart: "workspace-write",
				yolo: "workspace-write"
			},
			askReason: "approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_directory instead of shell",
			smartProvider: null,
			smartModel: null,
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
				sandboxDefaults: c.sandboxDefaults ?? FALLBACK.sandboxDefaults,
				askReason: c.askReason ?? FALLBACK.askReason,
				smartProvider: c.smartProvider ?? FALLBACK.smartProvider,
				smartModel: c.smartModel ?? FALLBACK.smartModel,
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
		function EnumDropdown({ value, items, resolveLabel, onChange }) {
			const [open, setOpen] = (0, react.useState)(false);
			const anchorRef = (0, react.useRef)(null);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: anchorRef,
					type: "button",
					className: `${ApprovalModeSettings_module_css_default.dropdownTrigger} ${open ? ApprovalModeSettings_module_css_default.open : ""}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: resolveLabel(value) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
						size: 14,
						className: ApprovalModeSettings_module_css_default.dropdownChevron
					})]
				}),
				items: items.map((item) => ({
					id: item.id,
					label: resolveLabel(item.id)
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
		function ApprovalModeSettings({ form, t }) {
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
			const commitField = async (field, next) => {
				setSaveFailed(false);
				setBusy((prev) => new Set(prev).add(field));
				try {
					if (!await form.set(field, next)) setSaveFailed(true);
				} finally {
					setBusy((prev) => {
						const rest = new Set(prev);
						rest.delete(field);
						return rest;
					});
				}
			};
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
			const [smartProviderText, setSmartProviderText] = (0, react.useState)(value.smartProvider ?? "");
			(0, react.useEffect)(() => {
				setSmartProviderText(value.smartProvider ?? "");
			}, [value.smartProvider]);
			const commitSmartProvider = (next) => {
				const normalized = next === "" ? null : next;
				if (normalized !== value.smartProvider) commitField("smartProvider", normalized);
			};
			const [smartModelText, setSmartModelText] = (0, react.useState)(value.smartModel ?? "");
			(0, react.useEffect)(() => {
				setSmartModelText(value.smartModel ?? "");
			}, [value.smartModel]);
			const commitSmartModel = (next) => {
				const normalized = next === "" ? null : next;
				if (normalized !== value.smartModel) commitField("smartModel", normalized);
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
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
								label: t("field.smartProvider"),
								descKey: "desc.smartProvider",
								t,
								onReset: () => {
									reset("smartProvider");
								},
								resetLabel: t("reset.label"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									value: smartProviderText,
									placeholder: t("smartClassifier.provider.placeholder"),
									className: ApprovalModeSettings_module_css_default.csvInput,
									disabled: busy.has("smartProvider"),
									onChange: (e) => {
										setSmartProviderText(e.target.value);
									},
									onBlur: (e) => {
										commitSmartProvider(e.target.value);
									}
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, {
								label: t("field.smartModel"),
								descKey: "desc.smartModel",
								t,
								onReset: () => {
									reset("smartModel");
								},
								resetLabel: t("reset.label"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									value: smartModelText,
									placeholder: t("smartClassifier.model.placeholder"),
									className: ApprovalModeSettings_module_css_default.csvInput,
									disabled: busy.has("smartModel"),
									onChange: (e) => {
										setSmartModelText(e.target.value);
									},
									onBlur: (e) => {
										commitSmartModel(e.target.value);
									}
								})
							})]
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
			"field.sandboxRequest": "Request mode sandbox",
			"field.sandboxAutoEdit": "Auto-edit mode sandbox",
			"field.smartSandbox": "Smart mode sandbox",
			"field.sandboxYolo": "Yolo mode sandbox",
			"field.askReason": "Approval prompt text",
			"field.smartProvider": "Provider",
			"field.smartModel": "Model",
			"desc.editTools": "Tools classified as the \"edit\" family — file modifications. Auto-approved under auto-edit mode.",
			"desc.shellTools": "Tools classified as the \"shell\" family — command execution. Always require approval under request and auto-edit modes.",
			"desc.readOnlyTools": "Tools classified as the \"read-only\" family. Always allowed regardless of mode.",
			"desc.autoAllowTools": "Tools that bypass approval entirely, regardless of family. Overlapping with any family list is harmless (redundant, not conflicting).",
			"desc.readOnlyGitCommands": "Auto-allow a single strictly-parsed read-only git command (git status, git log, git diff, …) instead of prompting under request, auto-edit, and smart. Anything else — composed, quoted, or writing git commands — still asks.",
			"desc.sandbox": "Sandbox policy the plugin writes when switching into each mode. The \"off\" mode restores the composition default instead.",
			"desc.askReason": "Template shown in the approval dialog. Placeholders: {tool} (tool name), {mode} (current approval mode), {family} (edit | shell | readonly | other).",
			"desc.smartProvider": "LLM provider for the smart-mode shell classifier. Leave empty to inherit the host default model.",
			"desc.smartModel": "LLM model id for the smart-mode shell classifier. Leave empty to inherit the host default model. A lighter model reduces per-shell-call cost.",
			"sandbox.read-only": "Read-only",
			"sandbox.workspace-write": "Workspace write",
			"sandbox.danger-full-access": "Danger full access",
			"csv.placeholder": "{write, edit, str_replace_editor}",
			"smartClassifier.provider.placeholder": "e.g. deepseek-official",
			"smartClassifier.model.placeholder": "e.g. deepseek-chat",
			"reset.label": "Reset",
			"askReason.placeholder": "approval needed for {tool} under {mode} mode ({family})"
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
			"field.sandboxRequest": "Request 模式的 sandbox",
			"field.sandboxAutoEdit": "Auto-edit 模式的 sandbox",
			"field.smartSandbox": "Smart 模式的 sandbox",
			"field.sandboxYolo": "Yolo 模式的 sandbox",
			"field.askReason": "审批弹窗文案",
			"field.smartProvider": "Provider",
			"field.smartModel": "Model",
			"desc.editTools": "归为「编辑族」的工具——文件修改类。在 auto-edit 模式下自动放行。",
			"desc.shellTools": "归为「shell 族」的工具——命令执行类。在 request 和 auto-edit 模式下都需要审批。",
			"desc.readOnlyTools": "归为「只读族」的工具。任何模式下都放行。",
			"desc.autoAllowTools": "绕过审批的工具，与族无关。与任何族名单重叠无副作用（冗余但不冲突）。",
			"desc.readOnlyGitCommands": "在 request / auto-edit / smart 模式下，严格解析后的单条只读 git 命令（git status、git log、git diff 等）直接放行。其余命令（组合、带引号、写操作）仍会弹窗。",
			"desc.sandbox": "切到每个模式时插件联动写入的 sandbox 策略。off 模式则恢复为组合默认 sandbox。",
			"desc.askReason": "审批弹窗里显示的文案模板。占位符：{tool}（工具名）、{mode}（当前审批模式）、{family}（edit | shell | readonly | other）。",
			"desc.smartProvider": "smart 模式 shell 分类器使用的 LLM provider。留空则继承宿主默认模型。",
			"desc.smartModel": "smart 模式 shell 分类器使用的模型 id。留空则继承宿主默认模型；选轻量模型可降低每次 shell 调用的成本。",
			"sandbox.read-only": "Read-only",
			"sandbox.workspace-write": "Workspace write",
			"sandbox.danger-full-access": "Danger full access",
			"csv.placeholder": "{write, edit, str_replace_editor}",
			"smartClassifier.provider.placeholder": "e.g. deepseek-official",
			"smartClassifier.model.placeholder": "e.g. deepseek-chat",
			"reset.label": "重置",
			"askReason.placeholder": "工具 {tool} 需要审批（当前模式：{mode} | 工具类型：{family}）"
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
			"locale",
			"configForms"
		];
		/**
		* Per-session mode cache for the chip. Survives chip unmount/remount on session
		* switches so the chip can synchronously read the last displayed mode (no 'off'
		* flicker on revisit) and skip the server query entirely on cache hit. The Map
		* lives on the module scope, so a DSH restart (browser reload / HMR) drops it
		* along with everything else — no explicit cleanup needed. Bounded by the user's
		* active session count.
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
					getDefaultMode: async () => {
						const cached = sessionModeCache.get(sessionId);
						if (cached) return cached;
						const result = await ctx.remote.commands.execute(sessionId, "/approval-mode", []);
						if (result.ok && result.value?.result.kind === "success") {
							const text = result.value.result.text;
							if (text) {
								const match = text.match(/current approval mode: (\w+)/);
								const mode = match ? match[1] : "off";
								sessionModeCache.set(sessionId, mode);
								return mode;
							}
						}
						return "off";
					}
				})
			}, ApprovalModeChip));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: SETTINGS_ID,
				order: SETTINGS_ORDER,
				label: () => tPage("nav.label"),
				locale: NS_PAGE,
				inject: () => ({ form: ctx.configForms.get(ENTRY_ID) })
			}, ApprovalModeSettings));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map