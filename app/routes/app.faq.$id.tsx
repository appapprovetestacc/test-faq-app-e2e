import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  DescriptionList,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { resolveAdminShop } from "../faq/auth.server";
import { sanitizeAnswerHtml } from "../faq/sanitize";
import {
  entryViewsLast30Days,
  getEntry,
  listCategories,
  type FaqDailyView,
} from "../db/queries.server";
import { formatHelpfulPercent, summarizeVotes } from "../faq/votes";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) throw new Response("Missing id", { status: 400 });
  const { shop } = await resolveAdminShop(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) throw new Response("D1 not bound", { status: 500 });

  const entry = await getEntry(env.D1, shop, id);
  if (!entry) throw new Response("Not found", { status: 404 });
  const [categories, daily] = await Promise.all([
    listCategories(env.D1, shop),
    entryViewsLast30Days(env.D1, shop, id),
  ]);
  const category = categories.find((c) => c.id === entry.category_id);
  const summary = summarizeVotes({
    helpful: entry.helpful_count,
    unhelpful: entry.unhelpful_count,
  });
  return json({
    entry: {
      id: entry.id,
      question: entry.question,
      answerHtml: sanitizeAnswerHtml(entry.answer_html),
      status: entry.status,
      categoryName: category?.name ?? "Uncategorized",
      categorySlug: category?.slug ?? "",
      viewCount: entry.view_count,
      helpfulCount: entry.helpful_count,
      unhelpfulCount: entry.unhelpful_count,
      createdAt: new Date(entry.created_at).toISOString(),
      updatedAt: new Date(entry.updated_at).toISOString(),
    },
    summary: {
      total: summary.total,
      helpful: summary.helpful,
      unhelpful: summary.unhelpful,
      label: formatHelpfulPercent(summary),
    },
    daily,
  });
}

export default function FaqDetail() {
  const { entry, summary, daily } = useLoaderData<typeof loader>();
  return (
    <Page
      backAction={{ content: "FAQ", url: "/app/faq" }}
      title={entry.question}
      titleMetadata={<StatusBadge status={entry.status} />}
      primaryAction={{ content: "Edit", url: `/app/faq?edit=${entry.id}` }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Answer
              </Text>
              {entry.answerHtml ? (
                <div dangerouslySetInnerHTML={{ __html: entry.answerHtml }} />
              ) : (
                <Banner tone="warning">This entry has no answer yet.</Banner>
              )}
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Storefront preview
              </Text>
              <Text as="p" tone="subdued">
                Live URL:{" "}
                <code>
                  /apps/faq/category/{entry.categorySlug || "uncategorized"}
                  #q-{entry.id}
                </code>
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Performance
              </Text>
              <DescriptionList
                items={[
                  { term: "Helpful", description: `${summary.helpful} votes` },
                  { term: "Unhelpful", description: `${summary.unhelpful} votes` },
                  { term: "Helpful ratio", description: summary.label },
                  { term: "Total views", description: String(entry.viewCount) },
                ]}
              />
              <ViewSparkline daily={daily} />
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Metadata
              </Text>
              <DescriptionList
                items={[
                  { term: "Category", description: entry.categoryName },
                  { term: "Created", description: entry.createdAt },
                  { term: "Updated", description: entry.updatedAt },
                ]}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function StatusBadge({ status }: { status: "published" | "draft" | "hidden" }) {
  if (status === "published") return <Badge tone="success">Published</Badge>;
  if (status === "draft") return <Badge tone="attention">Draft</Badge>;
  return <Badge tone="info">Hidden</Badge>;
}

function ViewSparkline({ daily }: { daily: FaqDailyView[] }) {
  if (daily.length === 0) {
    return (
      <Box>
        <Text as="p" variant="bodySm" tone="subdued">
          No views yet in the last 30 days.
        </Text>
      </Box>
    );
  }
  const max = Math.max(...daily.map((d) => d.count), 1);
  const W = 160;
  const H = 40;
  const step = daily.length > 1 ? W / (daily.length - 1) : 0;
  const points = daily
    .map((d, i) => {
      const x = i * step;
      const y = H - (d.count / max) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <Box>
      <Text as="p" variant="bodySm" tone="subdued">
        Last 30 days
      </Text>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Daily views sparkline"
      >
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={points}
        />
      </svg>
      <InlineStack gap="200">
        <Text as="span" variant="bodySm" tone="subdued">
          {daily[0]?.day ?? ""}
        </Text>
        <Text as="span" variant="bodySm" tone="subdued">
          → {daily[daily.length - 1]?.day ?? ""}
        </Text>
      </InlineStack>
    </Box>
  );
}
