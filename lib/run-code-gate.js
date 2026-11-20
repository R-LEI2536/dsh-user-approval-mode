/**
 * The PTC transport gate: classify a `run_code` program by its code
 * structure, not by its identity.
 *
 * `run_code` stays in `autoAllowTools` (the transport contract, ADR 0004),
 * but the top-level call is no longer allowed blindly. A program whose
 * every statement is a `tools.*` call (plus the variables and `return`
 * that receive its results) is allowed through — the sub-calls re-enter
 * this same gate under their real names. Anything else — arithmetic,
 * branching, imports, dynamic member access, or syntax the whitelist
 * does not recognize — asks the user, because a top-level dialog cannot
 * show the program and a silent `fs.rmSync` is exactly the hole this
 * closes (design page: docs/2026-11-07-run-code-approval-flow.html).
 *
 * The whitelist is deliberately strict: it recognizes rather than guesses.
 * An unrecognized construct fails closed to ask.
 */
import { parse } from 'acorn';
/** Longest code summary appended to a top-level `run_code` ask reason. */
export const RUN_CODE_PREVIEW_MAX_CHARS = 200;
/**
 * Read a `run_code` program's source text from its arguments.
 * @param args - the tool call's parsed arguments.
 * @returns The `code` string, or `undefined` when the arguments carry no
 * readable program (anything else is the caller's fail-safe case).
 */
export function runCodeProgramFromArguments(args) {
    if (args === null || typeof args !== 'object' || Array.isArray(args))
        return undefined;
    const code = args.code;
    return typeof code === 'string' ? code : undefined;
}
/**
 * Build the one-line code summary appended to a top-level `run_code` ask
 * reason. The host approval dialog shows no command block for `run_code`
 * (`ApprovalCommand.tsx` resolves only a bash `command`), so without this
 * suffix the prompt would be blind. Whitespace-collapsed for the same
 * reason as the PTC `[args: …]` summary: the dialog headline cannot
 * preserve line breaks. The full program is already durable in the
 * session log's tool-call event.
 */
export function runCodePreview(code) {
    const oneLine = code.replace(/\s+/gu, ' ').trim();
    if (oneLine.length === 0)
        return '(empty program)';
    return oneLine.length <= RUN_CODE_PREVIEW_MAX_CHARS
        ? oneLine
        : `${oneLine.slice(0, RUN_CODE_PREVIEW_MAX_CHARS)}…`;
}
/** Parse options mirror how the PTC runtime executes a program: a module-ish
 * body with top-level `await` and a final `return`. */
function parseProgramBody(code) {
    try {
        const program = parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true,
        });
        const body = program.body;
        return Array.isArray(body) ? body : undefined;
    }
    catch {
        // Unparseable code is unclassifiable: fail closed.
        return undefined;
    }
}
/** Ambient globals the design page singles out as ask-triggers. Reading any
 * other identifier is a pure reference (its binding is either a whitelisted
 * tool-call result or a runtime builtin the sandbox governs). */
const ASK_ONLY_IDENTIFIERS = new Set(['process', 'globalThis']);
function isPlainIdentifier(node) {
    return node.type === 'Identifier' && typeof node.name === 'string';
}
/**
 * A value expression the whitelist trusts: literals, identifiers, object /
 * array literals of trusted values, and non-computed member chains rooted
 * at an identifier. This is what tool-call arguments and a `return` may be
 * built from. Anything else — arithmetic, concatenation, template
 * expressions, calls, computed (dynamic) member access — asks.
 */
function isTrustedValue(node) {
    switch (node.type) {
        case 'Literal':
            return true;
        case 'Identifier':
            return !ASK_ONLY_IDENTIFIERS.has(node.name);
        case 'ObjectExpression': {
            const properties = node.properties;
            if (!Array.isArray(properties))
                return false;
            return properties.every((property) => {
                if (typeof property !== 'object' || property === null)
                    return false;
                const typed = property;
                // Spread properties (`{...src}`) and computed keys are not trusted.
                if (typed.type !== 'Property')
                    return false;
                if (typed.computed === true)
                    return false;
                const key = typed.key;
                if (key === undefined || (key.type !== 'Identifier' && key.type !== 'Literal'))
                    return false;
                return isTrustedValue(typed.value);
            });
        }
        case 'ArrayExpression': {
            const elements = node.elements;
            if (!Array.isArray(elements))
                return false;
            return elements.every((element) => element === null || isTrustedValue(element));
        }
        case 'MemberExpression':
            // Dynamic member access (`obj[expr]`) is a design-page ask trigger.
            if (node.computed === true)
                return false;
            return isTrustedValue(node.object) && isPlainIdentifier(node.property);
        default:
            return false;
    }
}
/**
 * A `tools.*` call, optionally awaited: `(await )? tools.<name>(args…)`.
 * The callee must be a plain, non-computed member of the `tools` binding
 * and every argument must be a trusted value.
 */
function isToolsCall(node) {
    const call = node.type === 'AwaitExpression'
        ? node.argument
        : node;
    if (call === undefined || call.type !== 'CallExpression')
        return false;
    const callee = call.callee;
    if (callee === undefined || callee.type !== 'MemberExpression' || callee.computed === true)
        return false;
    const object = callee.object;
    if (object === undefined || !isPlainIdentifier(object) || object.name !== 'tools')
        return false;
    const property = callee.property;
    if (property === undefined || !isPlainIdentifier(property))
        return false;
    const args = call.arguments;
    return Array.isArray(args) && args.every((argument) => isTrustedValue(argument));
}
/** One top-level statement the whitelist allows. Everything else asks. */
function isAllowedStatement(statement) {
    switch (statement.type) {
        case 'ExpressionStatement':
            return isToolsCall(statement.expression);
        case 'VariableDeclaration': {
            // Only "receive a tool-call result" declarations: every declarator
            // binds a plain identifier to a `tools.*` call.
            const declarations = statement.declarations;
            if (!Array.isArray(declarations) || declarations.length === 0)
                return false;
            return declarations.every((declarator) => {
                if (typeof declarator !== 'object' || declarator === null)
                    return false;
                const typed = declarator;
                if (typed.type !== 'VariableDeclarator')
                    return false;
                if (!isPlainIdentifier(typed.id))
                    return false;
                const init = typed.init;
                return init !== null && init !== undefined && isToolsCall(init);
            });
        }
        case 'ReturnStatement': {
            const argument = statement.argument;
            return argument === null || argument === undefined || isTrustedValue(argument);
        }
        default:
            // if / for / while / function / class / import / export / block /
            // try / throw / switch / assignment … all ask.
            return false;
    }
}
/**
 * Decide whether a `run_code` program is "tool calls only".
 *
 * True means the program has no effect the plugin cannot see: every
 * statement is a `tools.*` call (each re-enters the gate as a sub-call),
 * a variable receiving one, or a `return` of trusted values. False means
 * ask — including unparseable code.
 *
 * This is a syntactic whitelist, NOT a security boundary: it exists to
 * keep the strict modes quiet for honest orchestrating programs. The hard
 * boundary under PTC remains the sandbox (ADR 0004).
 */
export function isToolCallsOnly(code) {
    const body = parseProgramBody(code);
    if (body === undefined)
        return false;
    return body.every(isAllowedStatement);
}
//# sourceMappingURL=run-code-gate.js.map