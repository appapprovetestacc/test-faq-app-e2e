import {
  Badge,
  BlockStack,
  Banner,
  Box,
  Button,
  Card,
  EmptyState,
  FormLayout,
  IndexTable,
  InlineGrid,
  Layout,
  Modal,
  Page,
  Select,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonPage,
  Tabs,
  Text,
  TextField,
  useIndexResourceState,
} from "@shopify/polaris";
import { json } from "@remix-run/cloudflare";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "@remix-run/cloudflare";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import { resolveAdminShop } from "../faq/auth.server";
import { sanitizeAnswerHtml } from "../faq/sanitize";
import { ensureUniqueSlug, slugify } from "../faq/slug";
import { formatHelpfulPercent, summarizeVotes } from "../faq/votes";
import {
  countByStatus,
  countEntriesByCategory,
  createCategory,
  createEntry,
  deleteEntry,
  getSettings,
  listCategories,
  listEntries,
  shopViewsLast30Days,
  updateEntry,
  type FaqCategory,
  type FaqEntry,
} from "../db/queries.server";

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { id: "all", label: "All", filter: undefined },
  { id: "published", label: "Published", filter: "published" as const },
  { id: "draft", label: "Draft", filter: "draft" as const },
  { id: "hidden", label: "Hidden", filter: "hidden" as const },
];

interface EntryView {
  id: string;
  question: string;
  categoryId: string;
  categoryName: string;
  status: "published" | "draft" | "hidden";
  viewCount: number;
  helpfulCount: number;
  unhelpfulCount: number;
  helpfulLabel: string;
  updatedAt: number;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { shop } = await resolveAdminShop(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) {
    return json({
      shop,
      d1: false as const,
      tab: "all",
      page: 1,
      entries: [] as EntryView[],
      categories: [] as FaqCategory[],
      categoryCounts: {} as Record<string, number>,
      totalForTab: 0,
      metrics: { total: 0, views30d: 0, helpfulRatioLabel: "—" },
      settings: { searchEnabled: true, defaultCategory: null, maxAnswerLength: 4000 },
    });
  }
  const url = new URL(request.url);
  const tabId = url.searchParams.get("tab") ?? "all";
  const tab = STATUS_TABS.find((t) => t.id === tabId) ?? STATUS_TABS[0]!;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));

  const [categories, entries, counts, views30d, settings, byCategory] = await Promise.all([
    listCategories(env.D1, shop),
    listEntries(env.D1, shop, tab.filter ? { status: tab.filter } : undefined),
    countByStatus(env.D1, shop),
    shopViewsLast30Days(env.D1, shop),
    getSettings(env.D1, shop),
    countEntriesByCategory(env.D1, shop),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name] as const));
  const view: EntryView[] = entries
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((e) => {
      const summary = summarizeVotes({ helpful: e.helpful_count, unhelpful: e.unhelpful_count });
      return {
        id: e.id,
        question: e.question,
        categoryId: e.category_id,
        categoryName: categoryName.get(e.category_id) ?? "Uncategorized",
        status: e.status,
        viewCount: e.view_count,
        helpfulCount: e.helpful_count,
        unhelpfulCount: e.unhelpful_count,
        helpfulLabel: formatHelpfulPercent(summary),
        updatedAt: e.updated_at,
      };
    });

  const aggregate = summarizeVotes({ helpful: counts.helpful, unhelpful: counts.unhelpful });
  return json({
    shop,
    d1: true as const,
    tab: tab.id,
    page,
    entries: view,
    categories,
    categoryCounts: byCategory,
    totalForTab: entries.length,
    metrics: {
      total: counts.total,
      views30d,
      helpfulRatioLabel: formatHelpfulPercent(aggregate),
    },
    settings: {
      searchEnabled: settings.search_enabled === 1,
      defaultCategory: settings.default_category,
      maxAnswerLength: settings.max_answer_length,
    },
  });
}

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { shop } = await resolveAdminShop(request, context);
  const env = (context.cloudflare?.env ?? {}) as { D1?: D1Database };
  if (!env.D1) {
    return json({ ok: false, error: "D1 binding not bound" }, { status: 500 });
  }
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create-category") {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return json({ ok: false, error: "Category name required" }, { status: 400 });
    const existing = await listCategories(env.D1, shop);
    const slug = ensureUniqueSlug(name, existing.map((c) => c.slug));
    await createCategory(env.D1, {
      id: newId(),
      shop,
      name,
      slug,
      position: existing.length,
    });
    return json({ ok: true });
  }

  if (intent === "create-entry" || intent === "update-entry") {
    const question = String(form.get("question") ?? "").trim();
    const answer = sanitizeAnswerHtml(String(form.get("answer") ?? ""));
    const categoryId = String(form.get("categoryId") ?? "");
    const status = (String(form.get("status") ?? "published") as "published" | "draft" | "hidden");
    if (!question || !answer || !categoryId) {
      return json(
        { ok: false, error: "Question, answer, and category are required" },
        { status: 400 },
      );
    }
    if (intent === "update-entry") {
      const id = String(form.get("id") ?? "");
      if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });
      await updateEntry(env.D1, { id, shop, categoryId, question, answerHtml: answer, status });
    } else {
      const existing = await listEntries(env.D1, shop);
      await createEntry(env.D1, {
        id: newId(),
        shop,
        categoryId,
        question,
        answerHtml: answer,
        status,
        position: existing.length,
      });
    }
    return json({ ok: true });
  }

  if (intent === "delete-entry") {
    const id = String(form.get("id") ?? "");
    if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });
    await deleteEntry(env.D1, shop, id);
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

export default function FaqIndex() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EntryView | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const isLoading = navigation.state === "loading" && navigation.formData == null;

  if (isLoading) return <IndexSkeleton />;

  const tabIdx = Math.max(
    0,
    STATUS_TABS.findIndex((t) => t.id === data.tab),
  );

  const tabs = STATUS_TABS.map((t) => ({
    id: t.id,
    content: t.label,
    panelID: t.id,
  }));

  const totalEntries = data.metrics.total;
  const showEmpty = totalEntries === 0;

  return (
    <Page
      title="FAQ"
      primaryAction={{
        content: "New entry",
        onAction: () => {
          setEditing(null);
          setModalOpen(true);
        },
        disabled: data.categories.length === 0,
      }}
      secondaryActions={[
        {
          content: "New category",
          onAction: () => setCategoryModalOpen(true),
        },
        { content: "Settings", url: "/app/faq/settings" },
      ]}
    >
      <BlockStack gap="400">
        {!data.d1 ? (
          <Banner tone="warning" title="Database not yet provisioned">
            <p>
              Bind a Cloudflare D1 database (binding name <code>D1</code>) and
              redeploy to start storing FAQ entries. AppApprove provisions
              this automatically on first deploy.
            </p>
          </Banner>
        ) : null}

        <OnboardingChecklist
          categories={data.categories.length}
          entries={totalEntries}
          searchEnabled={data.settings.searchEnabled}
        />

        <MetricCardsRow
          metrics={[
            { label: "Total entries", value: data.metrics.total },
            { label: "Views (last 30d)", value: data.metrics.views30d },
            { label: "Helpful ratio", value: data.metrics.helpfulRatioLabel },
          ]}
        />

        <CategoryGrid
          categories={data.categories}
          counts={data.categoryCounts}
          onCreate={() => setCategoryModalOpen(true)}
        />

        {showEmpty ? (
          <Card>
            <EmptyState
              heading="Write your first FAQ entry"
              action={{
                content: data.categories.length === 0 ? "Create a category" : "New entry",
                onAction: () => {
                  if (data.categories.length === 0) setCategoryModalOpen(true);
                  else {
                    setEditing(null);
                    setModalOpen(true);
                  }
                },
              }}
              secondaryAction={{
                content: "FAQ writing tips",
                url: "https://shopify.dev/docs/apps/build/online-store/app-proxies",
                external: true,
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Categorize your most common customer questions and they'll
                appear on your storefront FAQ page and any accordion blocks
                you add to product or contact pages.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <Tabs
              tabs={tabs}
              selected={tabIdx}
              onSelect={(idx) => {
                const next = STATUS_TABS[idx]!;
                params.set("tab", next.id);
                params.delete("page");
                setParams(params, { replace: true });
              }}
            />
            <EntriesTable
              rows={data.entries}
              onRowClick={(id) => {
                const row = data.entries.find((e) => e.id === id);
                if (row) {
                  setEditing(row);
                  setModalOpen(true);
                }
              }}
              onOpenDetail={(id) => navigate(`/app/faq/${id}`)}
            />
          </Card>
        )}
      </BlockStack>

      <EntryModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        categories={data.categories}
        editing={editing}
        maxAnswerLength={data.settings.maxAnswerLength}
      />

      <CategoryModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
      />
    </Page>
  );
}

function OnboardingChecklist({
  categories,
  entries,
  searchEnabled,
}: {
  categories: number;
  entries: number;
  searchEnabled: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(window.localStorage.getItem("faq-onboarding-dismissed") === "1");
    }
  }, []);
  const allDone = categories > 0 && entries > 0 && searchEnabled;
  if (dismissed || allDone) return null;
  return (
    <Banner
      title="Finish setting up your FAQ"
      tone="info"
      onDismiss={() => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("faq-onboarding-dismissed", "1");
        }
        setDismissed(true);
      }}
    >
      <BlockStack gap="200">
        <Text as="p">A 2-minute setup unlocks the storefront FAQ page:</Text>
        <Box>
          <Text as="p" variant="bodySm">
            {categories > 0 ? "☑" : "☐"} Create at least one category
          </Text>
          <Text as="p" variant="bodySm">
            {entries > 0 ? "☑" : "☐"} Write your first FAQ entry
          </Text>
          <Text as="p" variant="bodySm">
            {searchEnabled ? "☑" : "☐"} Enable the storefront search bar
          </Text>
        </Box>
      </BlockStack>
    </Banner>
  );
}

interface Metric {
  label: string;
  value: string | number;
}

function MetricCardsRow({ metrics }: { metrics: Metric[] }) {
  return (
    <InlineGrid columns={{ xs: 1, sm: metrics.length === 3 ? 3 : 4 }} gap="400">
      {metrics.map((m) => (
        <Card key={m.label}>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">
              {m.label}
            </Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">
              {m.value}
            </Text>
          </BlockStack>
        </Card>
      ))}
    </InlineGrid>
  );
}

function CategoryGrid({
  categories,
  counts,
  onCreate,
}: {
  categories: FaqCategory[];
  counts: Record<string, number>;
  onCreate: () => void;
}) {
  if (categories.length === 0) {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">
            Categories
          </Text>
          <Text as="p" tone="subdued">
            You need at least one category before you can add FAQ entries.
          </Text>
          <Box>
            <Button onClick={onCreate} variant="primary">
              Create a category
            </Button>
          </Box>
        </BlockStack>
      </Card>
    );
  }
  return (
    <BlockStack gap="200">
      <Text as="h2" variant="headingSm">
        Categories
      </Text>
      <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
        {categories.map((c) => (
          <Card key={c.id}>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                {c.name}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {counts[c.id] ?? 0} entries · /apps/faq/category/{c.slug}
              </Text>
              <Box>
                <Button url={`/app/faq/categories/${c.id}`} variant="plain">
                  Edit category
                </Button>
              </Box>
            </BlockStack>
          </Card>
        ))}
      </InlineGrid>
    </BlockStack>
  );
}

function EntriesTable({
  rows,
  onRowClick,
  onOpenDetail,
}: {
  rows: EntryView[];
  onRowClick: (id: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows.map((r) => ({ id: r.id })));
  const fetcher = useFetcher();
  const promotedBulkActions = [
    {
      content: "Delete",
      onAction: () => {
        for (const id of selectedResources) {
          const fd = new FormData();
          fd.append("intent", "delete-entry");
          fd.append("id", id);
          fetcher.submit(fd, { method: "post" });
        }
      },
    },
  ];
  return (
    <IndexTable
      resourceName={{ singular: "FAQ entry", plural: "FAQ entries" }}
      itemCount={rows.length}
      selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
      onSelectionChange={handleSelectionChange}
      promotedBulkActions={promotedBulkActions}
      selectable
      headings={[
        { title: "Question" },
        { title: "Category" },
        { title: "Status" },
        { title: "Views" },
        { title: "Helpful" },
      ]}
    >
      {rows.map((row, index) => (
        <IndexTable.Row
          id={row.id}
          key={row.id}
          position={index}
          selected={selectedResources.includes(row.id)}
          onClick={() => onOpenDetail(row.id)}
        >
          <IndexTable.Cell>
            <BlockStack gap="100">
              <Text variant="bodyMd" fontWeight="medium" as="span">
                {row.question}
              </Text>
              <Button variant="plain" onClick={() => onRowClick(row.id)}>
                Quick edit
              </Button>
            </BlockStack>
          </IndexTable.Cell>
          <IndexTable.Cell>{row.categoryName}</IndexTable.Cell>
          <IndexTable.Cell>
            <StatusBadge status={row.status} />
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" alignment="end">
              {row.viewCount}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" alignment="end">
              {row.helpfulLabel}
            </Text>
          </IndexTable.Cell>
        </IndexTable.Row>
      ))}
    </IndexTable>
  );
}

function StatusBadge({ status }: { status: "published" | "draft" | "hidden" }) {
  if (status === "published") return <Badge tone="success">Published</Badge>;
  if (status === "draft") return <Badge tone="attention">Draft</Badge>;
  return <Badge tone="info">Hidden</Badge>;
}

function EntryModal({
  open,
  onClose,
  categories,
  editing,
  maxAnswerLength,
}: {
  open: boolean;
  onClose: () => void;
  categories: FaqCategory[];
  editing: EntryView | null;
  maxAnswerLength: number;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [question, setQuestion] = useState(editing?.question ?? "");
  const [answer, setAnswer] = useState("");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? categories[0]?.id ?? "");
  const [status, setStatus] = useState<"published" | "draft" | "hidden">(
    editing?.status ?? "published",
  );
  const sanitizedPreview = useMemo(() => sanitizeAnswerHtml(answer), [answer]);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (open) {
      setQuestion(editing?.question ?? "");
      setAnswer("");
      setCategoryId(editing?.categoryId ?? categories[0]?.id ?? "");
      setStatus(editing?.status ?? "published");
    }
  }, [open, editing, categories]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === true) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  function submit() {
    const fd = new FormData();
    fd.append("intent", editing ? "update-entry" : "create-entry");
    if (editing) fd.append("id", editing.id);
    fd.append("question", question);
    fd.append("answer", answer);
    fd.append("categoryId", categoryId);
    fd.append("status", status);
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit FAQ entry" : "New FAQ entry"}
      primaryAction={{
        content: "Save & close",
        onAction: submit,
        loading: isSubmitting,
        disabled: isSubmitting || !question.trim() || !answer.trim(),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <FormLayout>
          {fetcher.data?.error ? (
            <Banner tone="critical">{fetcher.data.error}</Banner>
          ) : null}
          <TextField
            label="Question"
            value={question}
            onChange={setQuestion}
            autoComplete="off"
            requiredIndicator
          />
          <TextField
            label="Answer"
            value={answer}
            onChange={setAnswer}
            multiline={6}
            maxLength={maxAnswerLength}
            showCharacterCount
            helpText="Plain text + a small whitelist of HTML tags (p, ul, ol, li, a, strong, em, code, br). Scripts and unsafe attributes are stripped."
            autoComplete="off"
            requiredIndicator
          />
          {answer.trim() ? (
            <Box
              padding="300"
              borderColor="border"
              borderWidth="025"
              borderRadius="200"
            >
              <Text as="p" variant="bodySm" tone="subdued">
                Preview
              </Text>
              <div
                style={{ marginTop: 8 }}
                dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
              />
            </Box>
          ) : null}
          <Select
            label="Category"
            options={categories.map((c) => ({ label: c.name, value: c.id }))}
            onChange={setCategoryId}
            value={categoryId}
          />
          <Select
            label="Status"
            options={[
              { label: "Published", value: "published" },
              { label: "Draft", value: "draft" },
              { label: "Hidden", value: "hidden" },
            ]}
            value={status}
            onChange={(v) => setStatus(v as "published" | "draft" | "hidden")}
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}

function CategoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [name, setName] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === true) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  function submit() {
    const fd = new FormData();
    fd.append("intent", "create-category");
    fd.append("name", name);
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New category"
      primaryAction={{
        content: "Create category",
        onAction: submit,
        loading: isSubmitting,
        disabled: isSubmitting || !name.trim(),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <FormLayout>
          {fetcher.data?.error ? (
            <Banner tone="critical">{fetcher.data.error}</Banner>
          ) : null}
          <TextField
            label="Category name"
            value={name}
            onChange={setName}
            autoComplete="off"
            helpText={`Slug preview: /${slugify(name || "category")}`}
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}

function IndexSkeleton() {
  return (
    <SkeletonPage primaryAction title="FAQ">
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <Card>
              <SkeletonDisplayText size="small" />
            </Card>
            <Card>
              <SkeletonDisplayText size="small" />
            </Card>
            <Card>
              <SkeletonDisplayText size="small" />
            </Card>
          </InlineGrid>
          <Card>
            <SkeletonBodyText lines={8} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}
