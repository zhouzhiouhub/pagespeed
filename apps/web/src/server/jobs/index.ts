/**
 * Background jobs / cron entrypoints (M0 skeleton).
 * Wire Inngest or BullMQ + Redis in M1–M2.
 */
export const JOB_NAMES = [
  "crawl.full",
  "crawl.delta",
  "sync.gsc",
  "sync.ga4",
  "insights.opportunities",
  "advice.daily",
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export async function enqueueJob(
  name: JobName,
  payload: Record<string, unknown> = {},
): Promise<{ accepted: boolean; name: JobName }> {
  console.info("[jobs] enqueue stub", name, payload);
  return { accepted: true, name };
}
