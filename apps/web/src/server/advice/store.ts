import { and, desc, eq } from "drizzle-orm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { isDatabaseAvailable } from "@/server/db/ready";
import { adviceItems, adviceRuns } from "@/server/db/schema";
import { ensureSite } from "@/server/sites/repo";

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
  /** UI locale used when this run was generated */
  locale?: string;
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

function toDbPriority(
  p: AdviceItemRecord["priority"],
): "high" | "medium" | "low" {
  if (p === "growth") return "low";
  return p;
}

function fromDbPriority(
  p: "high" | "medium" | "low",
): AdviceItemRecord["priority"] {
  if (p === "low") return "growth";
  return p;
}

function toDbUserState(
  s: AdviceUserState,
): "new" | "viewed" | "acted" | "dismissed" {
  if (s === "open") return "new";
  if (s === "snoozed") return "viewed";
  return s;
}

function fromDbUserState(
  s: "new" | "viewed" | "acted" | "dismissed",
): AdviceUserState {
  if (s === "new") return "open";
  if (s === "viewed") return "snoozed";
  return s;
}

export async function readAdviceRun(
  siteUrl: string,
): Promise<AdviceRunRecord | null> {
  const store = await readStore();
  const fileRun = store.bySite[siteUrl] ?? null;

  if (await isDatabaseAvailable()) {
    try {
      const site = await ensureSite(siteUrl);
      if (/^[0-9a-f-]{36}$/i.test(site.id)) {
        const [run] = await db
          .select()
          .from(adviceRuns)
          .where(eq(adviceRuns.siteId, site.id))
          .orderBy(desc(adviceRuns.createdAt))
          .limit(1);
        if (run) {
          const items = await db
            .select()
            .from(adviceItems)
            .where(eq(adviceItems.adviceRunId, run.id))
            .orderBy(adviceItems.sortOrder);
          const mapped: AdviceRunRecord = {
            siteUrl,
            runId: run.id,
            generatedAt: run.createdAt.toISOString(),
            greeting: "今日增长建议",
            headline: run.headline ?? "今日增长建议",
            sources: [],
            warning: null,
            model: null,
            items: items.map((item) => ({
              id: item.id,
              priority: fromDbPriority(item.priority),
              type: "advice",
              title: item.title,
              summary: item.body ?? "",
              evidence: {},
              suggestedActions: [],
              score: 0.5,
              href: null,
              ctaLabel: item.ctaLabel ?? "查看",
              userState: fromDbUserState(item.userState),
            })),
          };
          // Prefer richer file payload when same day / newer
          if (
            fileRun &&
            new Date(fileRun.generatedAt).getTime() >=
              new Date(mapped.generatedAt).getTime()
          ) {
            return fileRun;
          }
          return mapped;
        }
      }
    } catch (err) {
      console.warn("[advice] db read failed", err);
    }
  }

  return fileRun;
}

export async function writeAdviceRun(run: AdviceRunRecord): Promise<void> {
  const store = await readStore();
  store.bySite[run.siteUrl] = run;
  await writeStore(store);

  if (!(await isDatabaseAvailable())) return;
  try {
    const site = await ensureSite(run.siteUrl);
    if (!/^[0-9a-f-]{36}$/i.test(site.id)) return;

    const runDate = run.generatedAt.slice(0, 10);
    const existing = await db
      .select()
      .from(adviceRuns)
      .where(
        and(eq(adviceRuns.siteId, site.id), eq(adviceRuns.runDate, runDate)),
      )
      .limit(1);

    let runId = existing[0]?.id;
    if (runId) {
      await db
        .update(adviceRuns)
        .set({
          status: "ready",
          headline: run.headline,
        })
        .where(eq(adviceRuns.id, runId));
      await db.delete(adviceItems).where(eq(adviceItems.adviceRunId, runId));
    } else {
      const [inserted] = await db
        .insert(adviceRuns)
        .values({
          siteId: site.id,
          runDate,
          status: "ready",
          headline: run.headline,
        })
        .returning({ id: adviceRuns.id });
      runId = inserted?.id;
    }

    if (!runId) return;

    if (run.items.length) {
      await db.insert(adviceItems).values(
        run.items.map((item, index) => ({
          adviceRunId: runId!,
          priority: toDbPriority(item.priority),
          title: item.title,
          body: item.summary,
          ctaLabel: item.ctaLabel,
          sortOrder: index,
          userState: toDbUserState(item.userState),
        })),
      );
    }
  } catch (err) {
    console.warn("[advice] db write failed", err);
  }
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

  if (await isDatabaseAvailable()) {
    try {
      await db
        .update(adviceItems)
        .set({ userState: toDbUserState(userState) })
        .where(eq(adviceItems.id, itemId));
    } catch {
      // item ids from file may not be UUIDs
    }
  }

  return run;
}
