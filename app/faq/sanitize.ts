// Minimal HTML sanitizer for FAQ answers. Worker bundle stays dep-free
// by hand-rolling a whitelist scrubber instead of pulling sanitize-html
// (which drags in domhandler/htmlparser2 — ~150KB compressed). Behaviour
// model: strip everything not on the whitelist; for whitelisted tags,
// strip every attribute except `href` on <a>. Output is always closed
// and well-formed.

const ALLOWED_TAGS = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "em",
  "code",
  "br",
]);

const VOID_TAGS = new Set(["br"]);

interface Token {
  kind: "text" | "open" | "close" | "self";
  name?: string;
  href?: string;
  raw: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === "<") {
      const end = input.indexOf(">", i);
      if (end === -1) {
        tokens.push({ kind: "text", raw: input.slice(i) });
        break;
      }
      const raw = input.slice(i, end + 1);
      const inner = raw.slice(1, -1).trim();
      if (inner.startsWith("/")) {
        const name = inner.slice(1).split(/\s/)[0]?.toLowerCase() ?? "";
        tokens.push({ kind: "close", name, raw });
      } else if (inner.startsWith("!") || inner.startsWith("?")) {
        // strip doctypes / processing instructions / comments
      } else {
        const selfClose = inner.endsWith("/");
        const body = selfClose ? inner.slice(0, -1).trim() : inner;
        const name = body.split(/\s/)[0]?.toLowerCase() ?? "";
        let href: string | undefined;
        if (name === "a") {
          const m = body.match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i);
          const raw = m?.[1] ?? m?.[2];
          if (raw) {
            const sanitizedHref = sanitizeHref(raw);
            if (sanitizedHref) href = sanitizedHref;
          }
        }
        tokens.push({
          kind: selfClose || VOID_TAGS.has(name) ? "self" : "open",
          name,
          href,
          raw,
        });
      }
      i = end + 1;
    } else {
      const next = input.indexOf("<", i);
      const slice = next === -1 ? input.slice(i) : input.slice(i, next);
      tokens.push({ kind: "text", raw: slice });
      i = next === -1 ? input.length : next;
    }
  }
  return tokens;
}

function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  // Allow relative + http(s) + mailto + tel only. Block javascript:, data:, vbscript:.
  if (/^(https?:|mailto:|tel:|\/|#|\?)/i.test(trimmed)) {
    return escapeAttr(trimmed);
  }
  return null;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function sanitizeAnswerHtml(input: string): string {
  if (!input) return "";
  const tokens = tokenize(input);
  const stack: string[] = [];
  let out = "";
  for (const tok of tokens) {
    if (tok.kind === "text") {
      out += escapeText(tok.raw);
      continue;
    }
    if (!tok.name || !ALLOWED_TAGS.has(tok.name)) continue;
    if (tok.kind === "self") {
      out += tok.name === "br" ? "<br/>" : `<${tok.name}/>`;
      continue;
    }
    if (tok.kind === "open") {
      if (tok.name === "a") {
        out += tok.href ? `<a href="${tok.href}" rel="noopener noreferrer" target="_blank">` : `<a>`;
      } else {
        out += `<${tok.name}>`;
      }
      stack.push(tok.name);
      continue;
    }
    if (tok.kind === "close") {
      if (stack.length === 0) continue;
      const idx = stack.lastIndexOf(tok.name);
      if (idx === -1) continue;
      while (stack.length - 1 > idx) {
        const popped = stack.pop();
        if (popped) out += `</${popped}>`;
      }
      stack.pop();
      out += `</${tok.name}>`;
    }
  }
  while (stack.length) {
    const popped = stack.pop();
    if (popped) out += `</${popped}>`;
  }
  return out;
}

// Convenience: strip HTML to plain text for search indexing and excerpts.
export function htmlToPlainText(input: string): string {
  if (!input) return "";
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
