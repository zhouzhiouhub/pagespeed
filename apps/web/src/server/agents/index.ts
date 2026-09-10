/**
 * Agent orchestrator + sub-agents (M4).
 * Rules → structured context → LLM → validated action plans.
 */
export type AdviceContext = {
  siteId: string;
  runDate: string;
};

export async function generateDailyAdvice(
  _ctx: AdviceContext,
): Promise<{ headline: string; itemCount: number }> {
  return {
    headline: "Connect a site to receive today’s growth advice.",
    itemCount: 0,
  };
}
