import {
  Banner,
  BlockStack,
  Card,
  Checkbox,
  FormLayout,
  Layout,
  Page,
  Select,
  TextField,
} from "@shopify/polaris";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { resolveAdminShop } from "../faq/auth.server";
import {
  getSettings,
  listCategories,
  upsertSettings,
} from "../db/queries.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { shop } = await resolveAdminShop(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) {
    return json({
      shop,
      settings: { default_category: null, search_enabled: 1, max_answer_length: 4000 },
      categories: [] as { id: string; name: string }[],
      d1: false as const,
    });
  }
  const [settings, categories] = await Promise.all([
    getSettings(env.D1, shop),
    listCategories(env.D1, shop),
  ]);
  return json({
    shop,
    settings,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    d1: true as const,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { shop } = await resolveAdminShop(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) return json({ ok: false, error: "D1 not bound" }, { status: 500 });
  const form = await request.formData();
  const rawCategory = String(form.get("defaultCategory") ?? "");
  const defaultCategory = rawCategory.length > 0 ? rawCategory : null;
  const searchEnabled = String(form.get("searchEnabled") ?? "") === "on";
  const maxAnswerLength = Math.max(
    200,
    Math.min(20000, Number(form.get("maxAnswerLength") ?? 4000)),
  );
  await upsertSettings(env.D1, {
    shop,
    defaultCategory,
    searchEnabled,
    maxAnswerLength,
  });
  return json({ ok: true });
}

export default function FaqSettings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const initial = {
    defaultCategory: data.settings.default_category ?? "",
    searchEnabled: data.settings.search_enabled === 1,
    maxAnswerLength: data.settings.max_answer_length,
  };
  const [form, setForm] = useState(initial);
  const initialRef = useRef(initial);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialRef.current);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      initialRef.current = form;
    }
  }, [fetcher.state, fetcher.data, form]);

  function save() {
    const fd = new FormData();
    fd.append("defaultCategory", form.defaultCategory);
    fd.append("searchEnabled", form.searchEnabled ? "on" : "off");
    fd.append("maxAnswerLength", String(form.maxAnswerLength));
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <Page
      backAction={{ content: "FAQ", url: "/app/faq" }}
      title="FAQ settings"
      primaryAction={{
        content: "Save",
        onAction: save,
        loading: isSubmitting,
        disabled: !isDirty || isSubmitting,
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {fetcher.data?.error ? (
                <Banner tone="critical">{fetcher.data.error}</Banner>
              ) : null}
              {fetcher.state === "idle" && fetcher.data?.ok ? (
                <Banner tone="success" onDismiss={() => undefined}>
                  Settings saved.
                </Banner>
              ) : null}
              <FormLayout>
                <Select
                  label="Default category"
                  options={[
                    { label: "None (show all categories)", value: "" },
                    ...data.categories.map((c) => ({ label: c.name, value: c.id })),
                  ]}
                  value={form.defaultCategory}
                  onChange={(v) => setForm((p) => ({ ...p, defaultCategory: v }))}
                  helpText="Pre-selected on the storefront FAQ page when the merchant lands on /apps/faq without a category filter."
                />
                <Checkbox
                  label="Show search bar on the storefront FAQ page"
                  checked={form.searchEnabled}
                  onChange={(checked) =>
                    setForm((p) => ({ ...p, searchEnabled: checked }))
                  }
                />
                <TextField
                  label="Max answer length (characters)"
                  type="number"
                  min={200}
                  max={20000}
                  value={String(form.maxAnswerLength)}
                  onChange={(v) =>
                    setForm((p) => ({ ...p, maxAnswerLength: Number(v) || 0 }))
                  }
                  autoComplete="off"
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <p>
                Settings here apply to the storefront FAQ surfaces — the
                dedicated <code>/apps/faq</code> page and every embedded
                accordion block.
              </p>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
