// POST /apps/faq/:id/vote — records a helpful/unhelpful vote. Idempotent
// per anon_token: duplicate votes return ok=false with reason=duplicate so
// the client can swap the UI to "already voted". Logged-in customers
// use their customer id instead of the anon_token; both are accepted.
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { verifyAppProxy, proxyHeaders } from "../faq/proxy.server";
import { getEntryPublic, recordVote } from "../db/queries.server";

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function loader() {
  return json({ ok: false, error: "POST required" }, { status: 405 });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const id = params.id;
  if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });
  const { shop, loggedInCustomerId } = await verifyAppProxy(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) {
    return json({ ok: false, error: "Database not provisioned" }, { status: 503 });
  }
  const entry = await getEntryPublic(env.D1, shop, id);
  if (!entry) return json({ ok: false, error: "Not found" }, { status: 404 });

  const form = await request.formData();
  const voteRaw = String(form.get("vote") ?? "");
  if (voteRaw !== "up" && voteRaw !== "down") {
    return json({ ok: false, error: "Invalid vote" }, { status: 400 });
  }
  const anonToken = loggedInCustomerId
    ? `customer-${loggedInCustomerId}`
    : String(form.get("anonToken") ?? "").trim().slice(0, 64) || `ip-${request.headers.get("cf-connecting-ip") ?? "unknown"}-${Date.now()}`;

  const result = await recordVote(env.D1, {
    id: newId(),
    shop,
    entryId: id,
    vote: voteRaw,
    anonToken,
  });
  if (!result.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: "You have already voted on this entry." }),
      { status: 409, headers: proxyHeaders("application/json; charset=utf-8") },
    );
  }
  const helpful = voteRaw === "up" ? entry.helpful_count + 1 : entry.helpful_count;
  const unhelpful = voteRaw === "down" ? entry.unhelpful_count + 1 : entry.unhelpful_count;
  return new Response(JSON.stringify({ ok: true, helpful, unhelpful }), {
    headers: proxyHeaders("application/json; charset=utf-8"),
  });
}
