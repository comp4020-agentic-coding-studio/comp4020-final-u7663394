// /readme/: README.md rendered once at boot, in full, as server-sent HTML (the
// shipped check reads it without running scripts).
import { readFileSync } from "node:fs";
import { marked } from "marked";

const REPO = "https://github.com/comp4020-agentic-coding-studio/comp4020-final-u7663394";

// Relative links that point into the repo (PROCESS.md, doc/adr/...) resolve
// on GitHub; images stay relative and are served from /readme/doc/.
function linkToRepo(href: string): string {
  if (/^([a-z]+:|\/|#)/i.test(href) || /\.(png|jpe?g|gif|svg|webp)$/i.test(href)) return href;
  const path = href.replace(/^\.\//, "");
  return `${REPO}/${path.endsWith("/") ? "tree" : "blob"}/main/${path}`;
}

export function renderReadme(path = "README.md"): string {
  const body = marked.parse(readFileSync(path, "utf8"), {
    async: false,
    walkTokens(token) {
      if (token.type === "link") token.href = linkToRepo(token.href);
    },
  });
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>About · Calligraphy Relay</title>
<style>
  :root { color-scheme: light; --ink: #1d1b19; --paper: #f5eedd; --seal: #b3261e; --muted: #6b6257; }
  body { margin: 0; background: var(--paper); color: var(--ink);
         font: 1.0625rem/1.65 "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", "Noto Serif CJK SC", serif; }
  main { max-width: 42rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  nav a { color: var(--seal); }
  h1 { font-size: 2rem; line-height: 1.2; margin: 1.5rem 0 0.5rem; }
  h2 { font-size: 1.3rem; margin-top: 2.25rem; border-bottom: 1px solid #d8ccb4; padding-bottom: 0.2rem; }
  a { color: var(--seal); }
  a:focus-visible { outline: 3px solid var(--seal); outline-offset: 2px; }
  blockquote { margin: 1rem 0; padding: 0.25rem 1rem; border-left: 4px solid var(--seal); color: var(--muted); }
  code { font-size: 0.9em; background: #ebe1cb; padding: 0 0.25em; border-radius: 3px; }
  img { max-width: 100%; }
  table { border-collapse: collapse; } td, th { border: 1px solid #d8ccb4; padding: 0.3rem 0.5rem; }
</style>
</head>
<body>
<main>
<nav><a href="/">← Back to the hall</a></nav>
${body}
</main>
</body>
</html>`;
}
