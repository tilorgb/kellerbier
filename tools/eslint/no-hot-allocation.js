/**
 * Bans allocation in files marked `@hot`.
 *
 * The frame loop is not allowed to produce garbage. A `{x, y}` here and a
 * `.map` there is the defining failure mode of a JavaScript game: the garbage
 * is collected in a pause that lands exactly when the screen is busiest, and it
 * shows up as a periodic frame spike that nobody can attribute to the change
 * that caused it. See docs/TECH_STACK.md §2.
 *
 * The marker is a comment rather than a directory, because "hot" is a property
 * of what a file does, not of where it lives — and a file that stops being hot
 * should have the marker removed deliberately.
 *
 * Constructors are exempt. Preallocating storage is the entire point of the
 * pooling design; it happens once, at setup, and banning it there would ban
 * the fix along with the problem.
 *
 * ## The one that is not a literal
 *
 * A module-level `let` holding a number is also banned, and it is the reason
 * this rule grew: it is the only entry on the list that allocates without
 * anything in the source looking like an allocation. A module binding is a
 * tagged slot and cannot hold a raw double, so every store of one boxes a
 * sixteen-byte `HeapNumber`. The collision system kept six of them and wrote
 * all six per projectile — half a megabyte of garbage a tick at the budget
 * population, from a file whose header says it produces none. A module-level
 * typed array with named index constants is the same code to read and boxes
 * nothing, because the array stores raw numbers.
 *
 * Small integers are not boxed today, so the ban is wider than the bug. That is
 * deliberate: nothing marks which of these holds an integer, the answer changes
 * with one tuning edit, and the failure is silent.
 */

const DOCS = 'docs/TECH_STACK.md §2';

/** Array methods that allocate an array, an iterator, or a closure per call. */
const ALLOCATING_METHODS = new Set(['map', 'filter', 'reduce', 'flatMap', 'concat', 'slice']);

function isInConstructor(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'MethodDefinition' && current.kind === 'constructor') {
      return true;
    }
  }
  return false;
}

/** True when the node sits inside something that runs, rather than at module top level. */
function isInsideFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return true;
    }
  }
  return false;
}

export const noHotAllocation = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow allocation inside files marked @hot',
    },
    schema: [],
    messages: {
      allocation:
        'Allocation in a @hot file: {{what}}. The frame loop must not produce garbage — ' +
        'the collection lands exactly when the screen is busiest. Preallocate it, ' +
        `or hoist it out of the call. See ${DOCS}.`,
      moduleNumber:
        'Module-level mutable binding {{name}} holds a number in a @hot file. A module ' +
        'binding is a tagged slot, so every store boxes a HeapNumber — invisible in the ' +
        'source, and hundreds of kilobytes a tick out of a hot loop. Put it in a ' +
        `module-level typed array with a named index instead. See ${DOCS}.`,
    },
  },

  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    const isHot = source.getAllComments().some((comment) => comment.value.includes('@hot'));
    if (!isHot) {
      return {};
    }

    const report = (node, what) => {
      if (isInConstructor(node) || !isInsideFunction(node)) {
        return;
      }
      context.report({ node, messageId: 'allocation', data: { what } });
    };

    return {
      VariableDeclaration: (node) => {
        if (node.kind === 'const' || isInsideFunction(node)) {
          return;
        }
        for (const declarator of node.declarations) {
          if (
            declarator.id.type === 'Identifier' &&
            declarator.init &&
            declarator.init.type === 'Literal' &&
            typeof declarator.init.value === 'number'
          ) {
            context.report({
              node: declarator,
              messageId: 'moduleNumber',
              data: { name: declarator.id.name },
            });
          }
        }
      },
      ArrayExpression: (node) => {
        report(node, 'an array literal');
      },
      ObjectExpression: (node) => {
        report(node, 'an object literal');
      },
      SpreadElement: (node) => {
        report(node, 'a spread');
      },
      ArrowFunctionExpression: (node) => {
        report(node, 'a closure created per call');
      },
      FunctionExpression: (node) => {
        report(node, 'a closure created per call');
      },
      CallExpression: (node) => {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          ALLOCATING_METHODS.has(node.callee.property.name)
        ) {
          report(node, `a call to .${node.callee.property.name}()`);
        }
      },
    };
  },
};

export const kellerbierPlugin = {
  rules: {
    'no-hot-allocation': noHotAllocation,
  },
};
