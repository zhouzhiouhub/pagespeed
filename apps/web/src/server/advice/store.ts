import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AdviceUserState = "open" | "acted" | "snoozed" | "dismissed";

export type AdviceItemRecord = {
  id: string;
  priority: "high" | "medium" | "growth";
  type: string;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  suggestedActions: string[];
  score: number;
  href: string | null;
  ctaLabel: string;
  userState: AdviceUserState;
};

export type AdviceRunRecord = {
  siteUrl: string;
  runId: string;
  generatedAt: string;
  greeting: string;
  headline: string;
  sources: string[];
  warning: string | null;
  model: string | null;
  items: AdviceItemRecord[];
};

type AdviceStore = {
  bySite: Record<string, AdviceRunRecord>;
};

const EMPTY: AdviceStore = { bySite: {} };

function storePath() {
  return path.join(process.cwd(), ".data", "advice-store.json");
}

async function readStore(): Promise<AdviceStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<AdviceStore>) };
  } catch {
    return { ...EMPTY };
  }
}

async function writeStore(next: AdviceStore): Promise<void> {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(next, null, 2), "utf8");
}

export async function readAdviceRun(
  siteUrl: string,
): Promise<AdviceRunRecord | null> {
  const store = await readStore();
  return store.bySite[siteUrl] ?? null;
}

export async function writeAdviceRun(run: AdviceRunRecord): Promise<void> {
  const store = await readStore();
  store.bySite[run.siteUrl] = run;
  await writeStore(store);
}

export async function patchAdviceItemState(
  siteUrl: string,
  itemId: string,
  userState: AdviceUserState,
): Promise<AdviceRunRecord | null> {
  const store = await readStore();
  const run = store.bySite[siteUrl];
  if (!run) return null;
  const item = run.items.find((i) => i.id === itemId);
  if (!item) return null;
  item.userState = userState;
  store.bySite[siteUrl] = run;
  await writeStore(store);
  return run;
}
