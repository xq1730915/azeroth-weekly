import type { CurrencyBalance } from "./types";

export const BONUS_ROLL_CURRENCY_KEY = "currency:3513";
export const BONUS_ROLL_CURRENCY_NAME = "晦暗虚空核心";

/** Legacy imports contain other currencies; list position never identifies a roll coin. */
export function selectBonusRollBalance(
  balances: CurrencyBalance[],
): CurrencyBalance | null {
  let latest: CurrencyBalance | null = null;
  for (const balance of balances) {
    if (balance.currencyKey !== BONUS_ROLL_CURRENCY_KEY) continue;
    if (
      !latest ||
      balance.observedAt > latest.observedAt ||
      (balance.observedAt === latest.observedAt && balance.quantity === null)
    )
      latest = balance;
  }
  // A newer unknown value must remain unknown, rather than falling back to an old balance.
  return latest;
}
