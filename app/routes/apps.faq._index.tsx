// Server-rendered storefront FAQ page. Served from /apps/faq via the
// app-proxy. Output is plain HTML (no Polaris, no app shell) — Shopify
// embeds it into the active theme as the page body. Theme CSS variables
// style everything so the page matches whatever theme the merchant is
// using.
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { verifyAppProxy, proxyHeaders } from "../faq/proxy.server";
import {
  getSettings,
  listCategories,
  listEntries,
  type FaqCategory,
  type FaqEntry,
} from "../db/queries.server";
import { htmlToPlainText, sanitizeAnswerHtml } from "../faq/sanitize";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { shop } = await verifyAppProxy(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) {
    return new Response(renderEmptyShell("Database not provisioned"), {
      headers: proxyHeaders("text/html; charset=utf-8"),
    });
  }
  const [categories, entries, settings] = await Promise.all([
    listCategories(env.D1, shop),
    listEntries(env.D1, shop, { status: "published" }),
    getSettings(env.D1, shop),
  ]);
  const html = renderFaqPage({
    categories,
    entries,
    searchEnabled: settings.search_enabled === 1,
    defaultCategoryId: settings.default_category,
  });
  return new Response(html, { headers: proxyHeaders("text/html; charset=utf-8") });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmptyShell(message: string): string {
  return `<section class="faq-app"><div class="faq-app__empty"><p>${escapeHtml(message)}</p></div></section>${STYLES}`;
}

function renderFaqPage(args: {
  categories: FaqCategory[];
  entries: FaqEntry[];
  searchEnabled: boolean;
  defaultCategoryId: string | null;
}): string {
  const { categories, entries, searchEnabled } = args;
  const byCategory = new Map<string, FaqEntry[]>();
  for (const e of entries) {
    const arr = byCategory.get(e.category_id) ?? [];
    arr.push(e);
    byCategory.set(e.category_id, arr);
  }

  const indexDocs = entries.map((e) => ({
    id: e.id,
    categoryId: e.category_id,
    question: e.question,
    answerText: htmlToPlainText(e.answer_html).slice(0, 400),
  }));

  const searchBar = searchEnabled
    ? `<form class="faq-app__search" role="search" data-faq-search>
        <label for="faq-search-input" class="faq-app__visually-hidden">Search FAQs</label>
        <input
          id="faq-search-input"
          type="search"
          autocomplete="off"
          placeholder="Search frequently asked questions..."
          data-faq-search-input
        />
      </form>`
    : "";

  const categoryNav =
    categories.length > 1
      ? `<nav class="faq-app__nav" aria-label="FAQ categories">
          ${categories
            .map(
              (c) =>
                `<a href="#category-${escapeHtml(c.slug)}" data-faq-nav-link>${escapeHtml(c.name)}</a>`,
            )
            .join("")}
        </nav>`
      : "";

  const sections = categories
    .map((c) => renderCategorySection(c, byCategory.get(c.id) ?? []))
    .join("");

  const noResults = `<div class="faq-app__no-results" data-faq-no-results hidden role="status" aria-live="polite">
    No FAQs match your search.
  </div>`;

  const dataScript = `<script type="application/json" data-faq-index>${JSON.stringify(
    indexDocs,
  ).replace(/</g, "\\u003c")}</script>`;

  return `
    <section class="faq-app" data-faq-app>
      <header class="faq-app__header">
        <h1 class="faq-app__title">Frequently asked questions</h1>
        ${searchBar}
        ${categoryNav}
      </header>
      ${noResults}
      <div class="faq-app__sections" data-faq-sections>
        ${sections.length > 0 ? sections : `<div class="faq-app__empty"><p>No FAQs have been published yet.</p></div>`}
      </div>
      ${dataScript}
      <script>${CLIENT_JS}</script>
    </section>
    ${STYLES}
  `;
}

function renderCategorySection(category: FaqCategory, entries: FaqEntry[]): string {
  if (entries.length === 0) return "";
  return `
    <section
      class="faq-app__category"
      id="category-${escapeHtml(category.slug)}"
      data-faq-category="${escapeHtml(category.id)}"
    >
      <h2 class="faq-app__category-title">${escapeHtml(category.name)}</h2>
      <ul class="faq-app__list" role="list">
        ${entries.map((e) => renderEntry(e)).join("")}
      </ul>
    </section>
  `;
}

function renderEntry(entry: FaqEntry): string {
  const id = escapeHtml(entry.id);
  const sanitized = sanitizeAnswerHtml(entry.answer_html);
  return `
    <li class="faq-app__entry" data-faq-entry="${id}" id="q-${id}">
      <details class="faq-app__details">
        <summary class="faq-app__summary">
          <span class="faq-app__question">${escapeHtml(entry.question)}</span>
          <span class="faq-app__chevron" aria-hidden="true">+</span>
        </summary>
        <div class="faq-app__answer">${sanitized}</div>
        <div class="faq-app__vote" data-faq-vote-entry="${id}">
          <span class="faq-app__vote-prompt">Was this helpful?</span>
          <button type="button" class="faq-app__vote-button" data-faq-vote="up" aria-label="Yes, this was helpful">
            👍 <span data-faq-vote-helpful-count>${entry.helpful_count}</span>
          </button>
          <button type="button" class="faq-app__vote-button" data-faq-vote="down" aria-label="No, this was not helpful">
            👎 <span data-faq-vote-unhelpful-count>${entry.unhelpful_count}</span>
          </button>
          <span class="faq-app__vote-status" role="status" aria-live="polite" data-faq-vote-status></span>
        </div>
      </details>
    </li>
  `;
}

// Minimal sanitizer-free inline matcher mirroring app/faq/search.ts. Kept
// inline so the storefront HTML has zero JS deps and ships ~3KB of JS.
const CLIENT_JS = String.raw`
(function() {
  var root = document.currentScript.closest('[data-faq-app]');
  if (!root) return;
  var idxNode = root.querySelector('[data-faq-index]');
  var docs = idxNode ? JSON.parse(idxNode.textContent || '[]') : [];
  var entries = Array.prototype.slice.call(root.querySelectorAll('[data-faq-entry]'));
  var sections = Array.prototype.slice.call(root.querySelectorAll('[data-faq-category]'));
  var noResults = root.querySelector('[data-faq-no-results]');

  function tokenize(s) {
    return s.toLowerCase().replace(/[^a-z0-9äöüß\s]/g, ' ').split(/\s+/).filter(Boolean);
  }
  function lev(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var v0 = new Array(n + 1), v1 = new Array(n + 1);
    for (var i = 0; i <= n; i++) v0[i] = i;
    for (var i = 0; i < m; i++) {
      v1[0] = i + 1;
      for (var j = 0; j < n; j++) {
        var cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
        v1[j+1] = Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
      }
      for (var j = 0; j <= n; j++) v0[j] = v1[j];
    }
    return v0[n];
  }
  function tokenScore(q, t) {
    if (t.indexOf(q) !== -1) {
      if (t === q) return 1;
      if (t.indexOf(q) === 0) return 0.85;
      return 0.7;
    }
    if (q.length < 3) return 0;
    var d = lev(q, t);
    var tol = q.length <= 5 ? 1 : 2;
    if (d <= tol) return Math.max(0, 0.6 - d * 0.15);
    return 0;
  }
  function fieldScore(qt, ft) {
    if (!qt.length || !ft.length) return 0;
    var sum = 0;
    for (var i = 0; i < qt.length; i++) {
      var best = 0;
      for (var j = 0; j < ft.length; j++) {
        var s = tokenScore(qt[i], ft[j]);
        if (s > best) best = s;
        if (best === 1) break;
      }
      sum += best;
    }
    return sum / qt.length;
  }
  function filter(q) {
    var qt = tokenize(q.trim());
    if (!qt.length) return null;
    var keep = {};
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      var qs = fieldScore(qt, tokenize(d.question));
      var as = fieldScore(qt, tokenize(d.answerText));
      if (qs * 1 + as * 0.5 > 0) keep[d.id] = true;
    }
    return keep;
  }
  function apply(keep) {
    var visibleByCategory = {};
    for (var i = 0; i < entries.length; i++) {
      var el = entries[i];
      var id = el.getAttribute('data-faq-entry');
      var show = !keep || keep[id];
      el.hidden = !show;
      if (show) {
        var section = el.closest('[data-faq-category]');
        if (section) visibleByCategory[section.getAttribute('data-faq-category')] = true;
      }
    }
    var anyVisible = false;
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      var on = !keep || !!visibleByCategory[sec.getAttribute('data-faq-category')];
      sec.hidden = !on;
      if (on) anyVisible = true;
    }
    if (noResults) noResults.hidden = !keep || anyVisible;
  }
  var input = root.querySelector('[data-faq-search-input]');
  if (input) {
    var t;
    input.addEventListener('input', function() {
      clearTimeout(t);
      var val = input.value;
      t = setTimeout(function() {
        apply(val ? filter(val) : null);
      }, 60);
    });
  }
  // Track expansions as views (one per entry per session)
  var seen = {};
  try { seen = JSON.parse(sessionStorage.getItem('faq-app-viewed') || '{}'); } catch(e) {}
  root.addEventListener('toggle', function(ev) {
    var d = ev.target;
    if (!d || d.tagName !== 'DETAILS' || !d.open) return;
    var li = d.closest('[data-faq-entry]');
    if (!li) return;
    var id = li.getAttribute('data-faq-entry');
    if (seen[id]) return;
    seen[id] = 1;
    try { sessionStorage.setItem('faq-app-viewed', JSON.stringify(seen)); } catch(e) {}
    var url = location.pathname.replace(/\/+$/, '') + '/' + id + '/view' + location.search;
    var fd = new FormData();
    fd.append('id', id);
    fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' }).catch(function(){});
  }, true);
  // Voting
  function anonToken() {
    try {
      var t = localStorage.getItem('faq-app-anon');
      if (t) return t;
      var bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      var nt = Array.prototype.map.call(bytes, function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
      localStorage.setItem('faq-app-anon', nt);
      return nt;
    } catch (e) { return 'anon-' + Date.now(); }
  }
  root.addEventListener('click', function(ev) {
    var btn = ev.target && ev.target.closest('[data-faq-vote]');
    if (!btn) return;
    var wrap = btn.closest('[data-faq-vote-entry]');
    if (!wrap) return;
    var id = wrap.getAttribute('data-faq-vote-entry');
    var vote = btn.getAttribute('data-faq-vote');
    var statusEl = wrap.querySelector('[data-faq-vote-status]');
    var buttons = wrap.querySelectorAll('[data-faq-vote]');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    var url = location.pathname.replace(/\/+$/, '') + '/' + id + '/vote' + location.search;
    var fd = new FormData();
    fd.append('vote', vote);
    fd.append('anonToken', anonToken());
    fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function(r){ return r.json().catch(function(){ return null; }); })
      .then(function(json){
        if (json && json.ok) {
          if (vote === 'up') {
            var el = wrap.querySelector('[data-faq-vote-helpful-count]');
            if (el) el.textContent = String(json.helpful);
          } else {
            var el2 = wrap.querySelector('[data-faq-vote-unhelpful-count]');
            if (el2) el2.textContent = String(json.unhelpful);
          }
          if (statusEl) statusEl.textContent = 'Thanks for the feedback!';
        } else {
          if (statusEl) statusEl.textContent = (json && json.error) || 'Vote already recorded.';
        }
      })
      .catch(function(){
        if (statusEl) statusEl.textContent = 'Could not record vote.';
        for (var i = 0; i < buttons.length; i++) buttons[i].disabled = false;
      });
  });
})();
`;

const STYLES = `<style>
.faq-app { max-width: 760px; margin: 2rem auto; padding: 0 1rem; font-family: var(--font-body-family, inherit); color: var(--color-foreground, inherit); }
.faq-app__title { font-size: 1.75rem; margin: 0 0 1rem; }
.faq-app__search { margin: 0 0 1rem; }
.faq-app__search input { width: 100%; padding: 0.75rem 1rem; font-size: 1rem; border: 1px solid var(--color-foreground, #888); border-radius: 0.25rem; background: var(--color-background, transparent); color: inherit; }
.faq-app__search input:focus-visible { outline: 2px solid var(--color-button, #000); outline-offset: 2px; }
.faq-app__nav { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0 0 1.5rem; }
.faq-app__nav a { color: inherit; text-decoration: underline; }
.faq-app__category { margin: 1.5rem 0; }
.faq-app__category-title { font-size: 1.25rem; margin: 0 0 0.5rem; }
.faq-app__list { list-style: none; padding: 0; margin: 0; }
.faq-app__entry { border-bottom: 1px solid var(--color-foreground, #ddd); }
.faq-app__details { padding: 0.5rem 0; }
.faq-app__summary { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 0.5rem 0; font-weight: 600; list-style: none; }
.faq-app__summary::-webkit-details-marker { display: none; }
.faq-app__summary:focus-visible { outline: 2px solid var(--color-button, #000); outline-offset: 2px; }
.faq-app__details[open] .faq-app__chevron { transform: rotate(45deg); }
.faq-app__chevron { transition: transform 0.15s ease; font-size: 1.25rem; }
.faq-app__answer { padding: 0.5rem 0 1rem; line-height: 1.5; }
.faq-app__answer a { color: var(--color-button, inherit); }
.faq-app__vote { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; padding: 0 0 0.5rem; font-size: 0.9rem; }
.faq-app__vote-prompt { margin-right: 0.25rem; }
.faq-app__vote-button { background: var(--color-background, transparent); color: inherit; border: 1px solid var(--color-foreground, #888); padding: 0.35rem 0.75rem; border-radius: 0.25rem; cursor: pointer; font-family: inherit; font-size: inherit; }
.faq-app__vote-button:hover { background: var(--color-button, currentColor); color: var(--color-button-text, var(--color-background, #fff)); }
.faq-app__vote-button:disabled { opacity: 0.5; cursor: default; }
.faq-app__vote-status { margin-left: auto; font-style: italic; }
.faq-app__no-results { padding: 1rem; background: var(--color-background, transparent); border: 1px dashed currentColor; border-radius: 0.25rem; margin: 1rem 0; }
.faq-app__empty { padding: 1rem; text-align: center; }
.faq-app__visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 480px) {
  .faq-app__summary { font-size: 0.95rem; }
  .faq-app__title { font-size: 1.5rem; }
}
</style>`;
