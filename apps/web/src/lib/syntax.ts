/**
 * Small syntax highlighter for the text editor. It only needs to make config files and
 * scripts readable, so it recognises comments, strings, numbers and keywords per language
 * family instead of parsing real grammars.
 */
export type Language = "shell" | "js" | "json" | "python" | "yaml" | "ini" | "go" | "sql" | "plain";

export type TokenKind = "comment" | "string" | "number" | "keyword" | "key";
export type Token = { text: string; kind: TokenKind | null };

/** Files above this size are shown without colors to keep typing fast. */
export const HIGHLIGHT_LIMIT = 200_000;

const BY_EXTENSION: Record<string, Language> = {
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  env: "shell",
  js: "js",
  mjs: "js",
  cjs: "js",
  ts: "js",
  tsx: "js",
  jsx: "js",
  json: "json",
  py: "python",
  yml: "yaml",
  yaml: "yaml",
  ini: "ini",
  conf: "ini",
  cfg: "ini",
  service: "ini",
  toml: "ini",
  go: "go",
  sql: "sql",
};

const BY_NAME: Record<string, Language> = {
  ".bashrc": "shell",
  ".zshrc": "shell",
  ".profile": "shell",
  ".env": "shell",
  dockerfile: "shell",
  makefile: "shell",
  "nginx.conf": "ini",
  sshd_config: "ini",
  fstab: "ini",
  crontab: "shell",
};

export function languageForFile(fileName: string): Language {
  const name = fileName.split("/").pop()?.toLowerCase() ?? "";
  if (BY_NAME[name]) return BY_NAME[name];
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? (BY_EXTENSION[name.slice(dot + 1)] ?? "plain") : "plain";
}

const KEYWORDS: Record<Language, string[]> = {
  shell:
    "if then else elif fi for while until do done case esac in function return exit export local readonly source alias unset set cd echo sudo".split(
      " ",
    ),
  js: "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof this null undefined true false interface type enum".split(
    " ",
  ),
  json: ["true", "false", "null"],
  python:
    "def class return if elif else for while in not and or is import from as with try except finally raise lambda pass break continue None True False yield async await global".split(
      " ",
    ),
  yaml: ["true", "false", "null", "yes", "no", "on", "off"],
  ini: ["true", "false", "yes", "no", "on", "off"],
  go: "package import func return if else for range switch case default break continue go defer chan map struct interface type var const nil true false select".split(
    " ",
  ),
  sql: "select from where insert into values update set delete create table drop alter index join left right inner outer on group by order limit having and or not null as distinct union primary key foreign references".split(
    " ",
  ),
  plain: [],
};

type Rule = { kind: TokenKind; re: RegExp };

function rulesFor(language: Language): Rule[] {
  const rules: Rule[] = [];
  switch (language) {
    case "shell":
    case "yaml":
    case "python":
      rules.push({ kind: "comment", re: /#[^\n]*/y });
      break;
    case "ini":
      // ";" only starts a comment at the beginning of a line (nginx ends directives with it).
      rules.push({ kind: "comment", re: /#[^\n]*|(?<=^|\n);[^\n]*/y });
      break;
    case "js":
    case "go":
      rules.push({ kind: "comment", re: /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y });
      break;
    case "sql":
      rules.push({ kind: "comment", re: /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y });
      break;
    default:
      break;
  }
  if (language === "plain") return rules;
  rules.push({
    kind: "string",
    re:
      language === "js" || language === "go"
        ? /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?/y
        : /"(?:\\.|[^"\\\n])*"?|'[^'\n]*'?/y,
  });
  if (language === "yaml" || language === "ini" || language === "json") {
    rules.push({ kind: "key", re: /[A-Za-z_][\w.-]*(?=\s*[:=])/y });
  }
  rules.push({ kind: "number", re: /-?\b\d+(?:\.\d+)?\b/y });
  const words = KEYWORDS[language];
  if (words.length) {
    rules.push({
      kind: "keyword",
      re: new RegExp(`\\b(?:${words.join("|")})\\b`, language === "sql" ? "iy" : "y"),
    });
  }
  return rules;
}

const ruleCache = new Map<Language, Rule[]>();

export function tokenize(text: string, language: Language): Token[] {
  if (language === "plain" || text.length > HIGHLIGHT_LIMIT) return [{ text, kind: null }];
  let rules = ruleCache.get(language);
  if (!rules) {
    rules = rulesFor(language);
    ruleCache.set(language, rules);
  }
  const tokens: Token[] = [];
  let plainStart = 0;
  let i = 0;
  const flushPlain = (end: number) => {
    if (end > plainStart) tokens.push({ text: text.slice(plainStart, end), kind: null });
  };
  while (i < text.length) {
    let matched: Token | null = null;
    // Only try to start a token at a boundary: identifiers are skipped as one plain run.
    const ch = text[i];
    if (/[A-Za-z0-9_]/.test(ch) && i > 0 && /[A-Za-z0-9_]/.test(text[i - 1])) {
      i += 1;
      continue;
    }
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(text);
      if (m && m[0].length > 0) {
        matched = { text: m[0], kind: rule.kind };
        break;
      }
    }
    if (matched) {
      flushPlain(i);
      tokens.push(matched);
      i += matched.text.length;
      plainStart = i;
    } else {
      i += 1;
    }
  }
  flushPlain(text.length);
  return tokens;
}
