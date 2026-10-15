/**
 * The classifier system prompt for the smart-mode shell pipeline.
 *
 * Originally lifted verbatim from `dsh-auto-approve/index.js` (lines 14-28),
 * then simplified because that plugin's framing does not hold for this gate:
 * the reference only classifies an approval request — a sandbox escalation the
 * agent already asked for — while this gate consults the classifier for any
 * unscreened call, deciding whether to prompt at all. The escalation premise
 * and the danger-list / force-push narration described other layers and are
 * gone; the git-push branch rule folded into the publishing concern. The
 * safety contract is unchanged: the five ask concerns, the trusted
 * `latestUserMessage` override, and the JSON-only verdict. Any change here is
 * a deployer-only override (`smartClassifierPrompt` config), never a
 * user-editable surface.
 */
export declare const DEFAULT_SMART_CLASSIFIER_PROMPT: string;
//# sourceMappingURL=smart-prompt.d.ts.map