// JSON endpoint feeding the theme-app-embed accordion block. Returns the
// shape `{ category: {name, slug}, entries: [{id, question, answerHtml,
// helpfulCount, unhelpfulCount}] }`. Theme block fetches this once on
// load and renders entries client-side. Sanitized answers, status filter
// excludes drafts and hidden.
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { verifyAppProxy, proxyHeaders } from "../faq/proxy.server";
import {
  getCategoryBySlug,
  listEntries,
} from "../db/queries.server";
import { sanitizeAnswerHtml } from "../faq/sanitize";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const slug = params.slug;
  if (!slug) throw new Response("Missing slug", { status: 400 });
  const { shop } = await verifyAppProxy(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) {
    return new Response(
      JSON.stringify({ category: null, entries: [] }),
      { headers: proxyHeaders("application/json; charset=utf-8") },
    );
  }
  const category = await getCategoryBySlug(env.D1, shop, slug);
  if (!category) {
    return new Response(
      JSON.stringify({ category: null, entries: [] }),
      { status: 404, headers: proxyHeaders("application/json; charset=utf-8") },
    );
  }
  const entries = await listEntries(env.D1, shop, {
    status: "published",
    categoryId: category.id,
  });
  const body = {
    category: { id: category.id, name: category.name, slug: category.slug },
    entries: entries.map((e) => ({
      id: e.id,
      question: e.question,
      answerHtml: sanitizeAnswerHtml(e.answer_html),
      helpfulCount: e.helpful_count,
      unhelpfulCount: e.unhelpful_count,
    })),
  };
  return new Response(JSON.stringify(body), {
    headers: proxyHeaders("application/json; charset=utf-8"),
  });
}
