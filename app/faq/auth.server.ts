// Thin auth helpers that wrap the existing shopify.server primitives
// with FAQ-blueprint-specific defaults. GET loaders only need to know
// "which shop is asking" — the heavy session-token verification kicks
// in on mutating actions where authenticate.admin() is used.
import type { AppLoadContext } from "@remix-run/cloudflare";
import { authenticate, isValidShop } from "../lib/shopify.server";

const PREVIEW_SHOP = "appapprove-preview.myshopify.com";

interface ShopResolution {
  shop: string;
  isPreview: boolean;
}

// Resolves the shop for a GET loader. Order:
//   1. Preview-mode bypass (PREVIEW_MODE=1 + ?preview=1) — returns mock shop.
//   2. Bearer-token shop (App Bridge fetches set the Authorization header).
//   3. ?shop= query param (Shopify embed iframe puts it on the initial doc URL).
//   4. ?host= query param (decodes to the shop domain — embedded admin always
//      includes this when no shop= param is present).
export async function resolveAdminShop(
  request: Request,
  context: AppLoadContext,
): Promise<ShopResolution> {
  const env = (context.cloudflare?.env ?? {}) as { PREVIEW_MODE?: string };
  const url = new URL(request.url);
  if (env.PREVIEW_MODE === "1" && url.searchParams.get("preview") === "1") {
    return { shop: PREVIEW_SHOP, isPreview: true };
  }

  const auth = request.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer (.+)$/i);
  if (m) {
    try {
      const result = await authenticate.admin(request, context);
      return { shop: result.shop, isPreview: false };
    } catch {
      // Fall through to query-param resolution.
    }
  }

  const explicitShop = url.searchParams.get("shop");
  if (explicitShop && isValidShop(explicitShop)) {
    return { shop: explicitShop, isPreview: false };
  }

  const host = url.searchParams.get("host");
  if (host) {
    try {
      const padded = host.padEnd(host.length + ((4 - (host.length % 4)) % 4), "=");
      const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
      const slashIdx = decoded.indexOf("/store/");
      if (slashIdx !== -1) {
        const handle = decoded.slice(slashIdx + "/store/".length).split(/[/?#]/)[0];
        if (handle) {
          const shopFromHost = `${handle}.myshopify.com`;
          if (isValidShop(shopFromHost)) return { shop: shopFromHost, isPreview: false };
        }
      }
    } catch {
      // not a base64 host — ignore.
    }
  }

  throw new Response("Missing shop context", { status: 401 });
}
