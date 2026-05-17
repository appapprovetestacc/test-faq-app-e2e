// Validates Shopify app-proxy signatures. Storefront requests routed
// through /apps/<prefix>/* arrive at the Worker with a `signature` query
// param + `shop`, `path_prefix`, `timestamp`. The signature is HMAC-SHA256
// over the sorted-key concatenation of every other query param. Spec:
// https://shopify.dev/docs/apps/build/online-store/app-proxies#verify-signatures
import type { AppLoadContext } from "@remix-run/cloudflare";

export interface ProxyRequest {
  shop: string;
  isPreview: boolean;
  loggedInCustomerId: string | null;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(message)),
  );
  return Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAppProxy(
  request: Request,
  context: AppLoadContext,
): Promise<ProxyRequest> {
  const env = (context.cloudflare?.env ?? {}) as {
    SHOPIFY_API_SECRET?: string;
    PREVIEW_MODE?: string;
  };
  const url = new URL(request.url);
  const isPreview =
    env.PREVIEW_MODE === "1" && url.searchParams.get("preview") === "1";
  const shop = url.searchParams.get("shop") ?? "";
  const signature = url.searchParams.get("signature") ?? "";
  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

  if (isPreview) {
    return {
      shop: shop || "appapprove-preview.myshopify.com",
      isPreview: true,
      loggedInCustomerId: loggedInCustomerId ?? null,
    };
  }

  if (!env.SHOPIFY_API_SECRET) {
    // No secret bound — fail closed so a misconfigured deploy doesn't
    // expose mutating endpoints. Read paths can be opt-into-fail-open at
    // their callsite by skipping the verifier (we don't, to keep one path).
    throw new Response("App proxy not configured", { status: 503 });
  }
  if (!shop || !signature) {
    throw new Response("Missing app-proxy signature", { status: 401 });
  }
  const params = Array.from(url.searchParams.entries())
    .filter(([k]) => k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("");
  const expected = await hmacSha256Hex(env.SHOPIFY_API_SECRET, params);
  if (expected.length !== signature.length) {
    throw new Response("Invalid app-proxy signature", { status: 401 });
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (mismatch !== 0) {
    throw new Response("Invalid app-proxy signature", { status: 401 });
  }
  return { shop, isPreview: false, loggedInCustomerId: loggedInCustomerId ?? null };
}

// Storefront FAQ surfaces serve HTML inside a Shopify theme via the
// app-proxy `Liquid` content-type — but we ship raw HTML because the
// theme injects it as-is. Use this helper so the CORS/cache headers are
// consistent across both the SSR page and the JSON category endpoint.
export function proxyHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    // Storefront iframes the embed JS, so we keep this self-only. The
    // accordion block fetches /apps/faq/category/<slug>.json from the
    // same origin (the shop's domain), so CORS isn't needed in that path.
    "Cache-Control": "public, max-age=60, s-maxage=300",
    "X-Robots-Tag": "all",
  };
}
