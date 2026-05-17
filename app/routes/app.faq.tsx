// Parent layout for /app/faq/* admin routes. Mounts Polaris AppProvider
// + App Bridge so child routes can use Polaris components AND
// useAppBridge() hooks (saveBar, toast). All admin loaders authenticate
// via shopify.server's authenticate.admin() helper.
import {
  Outlet,
  useRouteError,
  isRouteErrorResponse,
  useLoaderData,
} from "@remix-run/react";
import { AppProvider, Banner, Frame, Page } from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const env = (context.cloudflare?.env ?? {}) as { SHOPIFY_API_KEY?: string };
  // App Bridge needs the API key on the client; expose it from the loader
  // rather than baking it into the bundle, so per-shop installs that
  // share the same Worker stay isolated.
  return json({ apiKey: env.SHOPIFY_API_KEY ?? "" });
}

export default function FaqAppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider i18n={polarisTranslations}>
      <Frame>
        <AppBridgeBootstrap apiKey={apiKey} />
        <Outlet />
      </Frame>
    </AppProvider>
  );
}

// Tiny inline bootstrap so the layout file owns the App Bridge script tag
// without pulling another dependency. The shopify-app-bridge CDN script
// exposes window.shopify.* which Polaris Toast + SaveBar hooks read from.
function AppBridgeBootstrap({ apiKey }: { apiKey: string }) {
  if (!apiKey) return null;
  return (
    <script
      src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
      data-api-key={apiKey}
    />
  );
}

export function ErrorBoundary() {
  const err = useRouteError();
  const message = isRouteErrorResponse(err)
    ? `${err.status} ${err.statusText}`
    : err instanceof Error
      ? err.message
      : "Unknown error";
  return (
    <AppProvider i18n={polarisTranslations}>
      <Page title="FAQ">
        <Banner tone="critical" title="Something went wrong">
          {message}
        </Banner>
      </Page>
    </AppProvider>
  );
}
