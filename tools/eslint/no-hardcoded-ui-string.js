/**
 * Bans a hardcoded, prose-shaped string literal in the player-facing UI —
 * #52's own acceptance criterion ("no hardcoded UI strings anywhere"),
 * mechanically enforced the same way `content-is-data` and `sim-layering`
 * already enforce their own rules.
 *
 * ## The heuristic, and why it is this one
 *
 * A string literal is flagged when it contains a space and at least one
 * lowercase letter — "looks like a sentence a player would read," not "is
 * a string." Every other single-token string this codebase writes routinely
 * — a CSS class (`'kb-settings-tab'`), an id, an event name (`'click'`), a
 * key code (`'ArrowUp'`), a hex colour, a sprite key — has no space in it,
 * so the space alone already separates almost all of the false positives
 * from almost all of the real UI copy without this rule having to know
 * anything about *which* string is which. `docs/DECISIONS.md`'s own
 * culture is to prefer a rule that is right about the common case and has
 * an escape hatch, over one that tries to be right about every case and is
 * therefore too fragile to trust — the hot-allocation rule takes the same
 * trade (banning `.map`/`.filter` outright rather than trying to prove an
 * individual call is actually hot).
 *
 * Template literals are deliberately **not** checked. This project builds
 * every settings-screen tab as one large CSS template literal (`STYLE` in
 * `app/settings-screen.ts` and its siblings) — a real risk of flagging CSS
 * as prose — and the interpolated-sentence cases this would otherwise catch
 * (`` `${x} killed` ``) are exactly the shape `t()`'s own `{name}`
 * placeholder substitution replaces; a file still building one by hand is
 * either already caught by its plain-string pieces or is passing an
 * already-`t()`-resolved variable through, which this rule has no business
 * flagging.
 *
 * ## What is exempt
 *
 * - The key argument of a `t(locale, 'ui.foo.bar')` call — that string
 *   *is* the localisation key, not the text it resolves to, and a key
 *   conventionally contains no spaces anyway (so this almost never fires),
 *   but is skipped explicitly rather than relying on that.
 * - Anything under `src/i18n/` — the dictionaries are the one place literal
 *   UI text is supposed to live.
 * - A single disable comment for the rare genuine exception (a debug-only
 *   label that intentionally never localises, say) — same escape hatch
 *   every other project rule already has.
 */

const DOCS = 'CLAUDE.md, "The pixel font moved out" section, and #52';

/** A space plus a lowercase letter is what separates prose from a token like `'ArrowUp'` or `'kb-settings-tab'`. */
function looksLikeProse(value) {
  return value.includes(' ') && /[a-z]/.test(value);
}

function isTranslationKeyArgument(node) {
  const parent = node.parent;
  if (parent === undefined || parent.type !== 'CallExpression') {
    return false;
  }
  const callee = parent.callee;
  const calleeName =
    callee.type === 'Identifier'
      ? callee.name
      : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
        ? callee.property.name
        : null;
  return calleeName === 't' && parent.arguments[1] === node;
}

/** Console/Error text is a developer diagnostic, not something a player reads. */
const DIAGNOSTIC_CALLEES = new Set(['log', 'warn', 'error', 'info', 'debug']);

/** A callee name that itself says "this is a diagnostic" — `console.warn`, a private `warnProp` wrapper, `logSomething`. */
function isDiagnosticCalleeName(name) {
  return DIAGNOSTIC_CALLEES.has(name) || /^(warn|log)[A-Z]/.test(name) || name.endsWith('Error');
}

function isDiagnosticArgument(node) {
  // A string built with `+` (`'a ' + b + ' c'`) is one argument once assembled —
  // walk out through the concatenation to whatever it is ultimately passed to.
  let current = node;
  while (current.parent?.type === 'BinaryExpression' && current.parent.operator === '+') {
    current = current.parent;
  }
  const parent = current.parent;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === 'NewExpression' && parent.callee.type === 'Identifier') {
    return parent.callee.name === 'Error' || parent.callee.name.endsWith('Error');
  }
  if (parent.type === 'CallExpression') {
    if (parent.callee.type === 'Identifier') {
      return isDiagnosticCalleeName(parent.callee.name);
    }
    if (parent.callee.type === 'MemberExpression' && parent.callee.property.type === 'Identifier') {
      const object = parent.callee.object;
      const isConsole = object.type === 'Identifier' && object.name === 'console';
      return isConsole || isDiagnosticCalleeName(parent.callee.property.name);
    }
  }
  return false;
}

/** CSS properties/keywords, not player-facing prose — `.style.transform = '...'`, `cssText`, a className list. */
const CSS_MEMBER_NAMES = new Set(['cssText', 'className']);

function isCssAssignment(node) {
  // `foo.className = topCenter ? 'a b' : 'c'`: walk out through the ternary
  // to the assignment it is actually one branch of.
  let current = node;
  while (current.parent?.type === 'ConditionalExpression' && current.parent.test !== current) {
    current = current.parent;
  }
  const parent = current.parent;
  if (parent === undefined || parent.type !== 'AssignmentExpression' || parent.right !== current) {
    return false;
  }
  const left = parent.left;
  if (left.type !== 'MemberExpression' || left.property.type !== 'Identifier') {
    return false;
  }
  if (CSS_MEMBER_NAMES.has(left.property.name)) {
    return true;
  }
  // `foo.style.transform = '...'`: the object being assigned into is itself `X.style`.
  return (
    left.object.type === 'MemberExpression' &&
    left.object.property.type === 'Identifier' &&
    left.object.property.name === 'style'
  );
}

/** CSS function syntax and media-query strings, wherever they show up (a module-level constant, a bare argument). */
const LOOKS_LIKE_CSS_VALUE =
  /^(rgba?|hsla?|clamp|calc|translate[XYZ]?|rotate[XYZ]?|scale[XYZ]?|url|var|repeating-linear-gradient|linear-gradient)\(|^\([\w-]+\s*:/;

export const noHardcodedUiString = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow a hardcoded, prose-shaped string literal in player-facing UI code',
    },
    schema: [],
    messages: {
      hardcoded:
        'Hardcoded UI text: "{{text}}". Every player-facing string goes through the ' +
        'localisation layer (src/i18n/translate.ts) — add a key to src/i18n/dictionaries/' +
        `{en,de,bar}.ts and call t(locale, key) here instead. See ${DOCS}.`,
    },
  },

  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== 'string') {
          return;
        }
        if (!looksLikeProse(node.value)) {
          return;
        }
        if (isTranslationKeyArgument(node)) {
          return;
        }
        if (
          node.parent?.type === 'ImportDeclaration' ||
          node.parent?.type === 'ExportAllDeclaration'
        ) {
          return;
        }
        if (
          isDiagnosticArgument(node) ||
          isCssAssignment(node) ||
          LOOKS_LIKE_CSS_VALUE.test(node.value)
        ) {
          return;
        }
        context.report({ node, messageId: 'hardcoded', data: { text: node.value } });
      },
    };
  },
};
