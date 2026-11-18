const ESLINT_DIRECTIVE = /^\s*(?:eslint-disable(?:-next-line|-line)?|eslint-enable)(?=\s|$)/;
const ESLINT_DESCRIPTION_SEPARATOR = /\s-{2,}\s/;
const JS_FILE = /\.[cm]?js$/;
const JS_TYPE_ANNOTATION = /^\*\s*@(?:type|typedef|satisfies)\s*\{/;

const TOOLCHAIN_DIRECTIVES = [
  /^\s*@ts-(?:expect-error|ignore|nocheck|check)(?=\W|$)/,
  /^\s*biome-ignore(?:-all|-start|-end)?(?=\s|$)/,
  /^\s*\*?\s*@vitest-environment(?:-options)?\s+\S+\s*$/,
  /^\/\s*<reference\s[^>]*\/>\s*$/,
  /^\s*(?:c8|v8|istanbul)\s+ignore(?=\s|$)/,
  /^\s*(?:webpack|turbopack)[A-Z]\w*\s*:/,
  /^\s*@vite-ignore\s*$/,
  /^\s*\*?\s*@jsx(?:ImportSource|Runtime|Frag)?\s+\S+\s*$/,
];

export const COMMENT_KIND = {
  directive: "directive",
  describedDirective: "described-directive",
  comment: "comment",
};

export function classifyComment(comment, filename) {
  if (comment.type === "Shebang") return COMMENT_KIND.directive;
  if (ESLINT_DIRECTIVE.test(comment.value)) {
    return ESLINT_DESCRIPTION_SEPARATOR.test(comment.value)
      ? COMMENT_KIND.describedDirective
      : COMMENT_KIND.directive;
  }
  if (TOOLCHAIN_DIRECTIVES.some((pattern) => pattern.test(comment.value))) {
    return COMMENT_KIND.directive;
  }
  if (
    comment.type === "Block" &&
    JS_FILE.test(filename) &&
    JS_TYPE_ANNOTATION.test(comment.value)
  ) {
    return COMMENT_KIND.directive;
  }
  return COMMENT_KIND.comment;
}

export function withoutDirectiveDescription(value) {
  return value.split(ESLINT_DESCRIPTION_SEPARATOR)[0].trimEnd();
}

const noComments = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      comment:
        "Comments are not allowed. Put the explanation in a name, a type, a test or a named constant, or in docs/ (see AGENTS.md).",
      describedDirective:
        "Keep the eslint directive to the directive itself: drop the `-- description`.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const kind = classifyComment(comment, context.filename);
          if (kind === COMMENT_KIND.directive) continue;
          context.report({
            loc: comment.loc,
            messageId: kind === COMMENT_KIND.comment ? "comment" : "describedDirective",
          });
        }
      },
    };
  },
};

export const noCommentsPlugin = { rules: { "no-comments": noComments } };
