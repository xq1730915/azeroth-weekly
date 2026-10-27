import { expect, it } from "vitest";
import { selectBonusRollBalance } from "../src";

it("selects the latest current roll currency, never the first or newest unrelated currency", () => {
  const roll = {
    currencyKey: "currency:3513",
    seasonId: "unverified",
    quantity: 2,
    observedAt: 150,
  };
  const unrelated = {
    currencyKey: "currency:2000",
    seasonId: "unverified",
    quantity: 1560,
    observedAt: 180,
  };
  const oldSeason = {
    currencyKey: "currency:3418",
    seasonId: "old",
    quantity: 9,
    observedAt: 190,
  };
  expect(selectBonusRollBalance([unrelated, oldSeason, roll])).toEqual(roll);
  expect(selectBonusRollBalance([unrelated, oldSeason])).toBeNull();
  const zero = { ...roll, quantity: 0, observedAt: 200 };
  expect(selectBonusRollBalance([roll, unrelated, zero])?.quantity).toBe(0);
  const unknown = { ...roll, quantity: null, observedAt: 201 };
  expect(
    selectBonusRollBalance([zero, unknown, unrelated])?.quantity,
  ).toBeNull();
  expect(selectBonusRollBalance([])).toBeNull();
});
