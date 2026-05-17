// POST /apps/faq/:id/view — increments the per-entry view counter and the
// daily rollup bucket. Storefront JS fires this once per session per
// expansion (sessionStorage gate) so we don't have to dedupe server-side.
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { verifyAppProxy } from "../faq/proxy.server";
import { getEntryPublic, recordView } from "../db/queries.server";

export async function loader() {
  return json({ ok: false, error: "POST required" }, { status: 405 });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const id = params.id;
  if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });
  const { shop } = await verifyAppProxy(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) return json({ ok: false, error: "Database not provisioned" }, { status: 503 });
  const entry = await getEntryPublic(env.D1, shop, id);
  if (!entry) return json({ ok: false, error: "Not found" }, { status: 404 });
  const today = new Date().toISOString().slice(0, 10);
  await recordView(env.D1, shop, id, today);
  return json({ ok: true });
}
