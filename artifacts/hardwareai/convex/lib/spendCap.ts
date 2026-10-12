// Daily spend guard shared by every feature that calls a model
// (convex/projectChat.ts, convex/journeyAgent.ts). Pure: the caller reads the
// day's spend with `internal.tokenUsage.spendSince` and passes it in.

// Spend guard for a public, unauthenticated studio: once the day's model
// spend across all projects passes this, new turns are refused until 00:00 UTC.
const DEFAULT_DAILY_USD_CAP = 25;

export const DAILY_BUDGET_MESSAGE = "Fabware has reached its AI budget for today. It resets at midnight UTC.";

/** 00:00 UTC of the day `now` falls in, as epoch milliseconds. */
export function utcDayStartMs(now: number = Date.now()): number {
  return new Date(now).setUTCHours(0, 0, 0, 0);
}

/**
 * True once `spentTodayUsd` has reached the cap. The cap comes from
 * FABWARE_DAILY_USD_CAP; a value that isn't a number turns the guard off.
 */
export function isOverDailyBudget(
  spentTodayUsd: number,
  capEnv: string | undefined = process.env.FABWARE_DAILY_USD_CAP,
): boolean {
  const cap = Number(capEnv ?? DEFAULT_DAILY_USD_CAP);
  return Number.isFinite(cap) && spentTodayUsd >= cap;
}
