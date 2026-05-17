import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  Layout,
  Page,
  TextField,
} from "@shopify/polaris";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { resolveAdminShop } from "../faq/auth.server";
import { ensureUniqueSlug, slugify } from "../faq/slug";
import {
  deleteCategory,
  listCategories,
  updateCategory,
} from "../db/queries.server";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) throw new Response("Missing id", { status: 400 });
  const { shop } = await resolveAdminShop(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) throw new Response("D1 not bound", { status: 500 });
  const categories = await listCategories(env.D1, shop);
  const category = categories.find((c) => c.id === id);
  if (!category) throw new Response("Not found", { status: 404 });
  return json({
    category,
    otherSlugs: categories.filter((c) => c.id !== id).map((c) => c.slug),
  });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const id = params.id;
  if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });
  const { shop } = await resolveAdminShop(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) return json({ ok: false, error: "D1 not bound" }, { status: 500 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");
  if (intent === "delete") {
    await deleteCategory(env.D1, shop, id);
    return redirect("/app/faq");
  }
  const name = String(form.get("name") ?? "").trim();
  const requestedSlug = String(form.get("slug") ?? "").trim();
  if (!name) return json({ ok: false, error: "Name required" }, { status: 400 });
  const categories = await listCategories(env.D1, shop);
  const otherSlugs = categories.filter((c) => c.id !== id).map((c) => c.slug);
  const baseSlug = requestedSlug || slugify(name);
  const slug = ensureUniqueSlug(baseSlug, otherSlugs);
  await updateCategory(env.D1, { id, shop, name, slug });
  return json({ ok: true, slug });
}

export default function EditCategory() {
  const { category } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; error?: string; slug?: string }>();
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const isSubmitting = fetcher.state !== "idle";

  function save() {
    const fd = new FormData();
    fd.append("intent", "save");
    fd.append("name", name);
    fd.append("slug", slug);
    fetcher.submit(fd, { method: "post" });
  }

  function destroy() {
    const fd = new FormData();
    fd.append("intent", "delete");
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <Page
      backAction={{ content: "FAQ", url: "/app/faq" }}
      title={`Edit category: ${category.name}`}
      primaryAction={{ content: "Save", onAction: save, loading: isSubmitting }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {fetcher.data?.error ? (
                <Banner tone="critical">{fetcher.data.error}</Banner>
              ) : null}
              <FormLayout>
                <TextField
                  label="Name"
                  value={name}
                  onChange={setName}
                  autoComplete="off"
                />
                <TextField
                  label="Slug"
                  value={slug}
                  onChange={(v) => setSlug(slugify(v))}
                  autoComplete="off"
                  helpText={`Public URL: /apps/faq/category/${slug}`}
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <p>Removing this category deletes every FAQ entry inside it.</p>
              <Button tone="critical" onClick={destroy} loading={isSubmitting}>
                Delete category
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
