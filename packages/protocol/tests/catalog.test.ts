import { expect, it } from "vitest";
import { currentSeasonRaids, validateEnvelope } from "../src";
import { createEnvelope } from "../fixtures/sample";

it("filters all current-season raids and keeps the original archive intact", () => {
  const raids = [1, 2, 3, 4].map((id) => ({
    id,
    name: `Raid ${id}`,
    difficulties: [],
    bosses: [],
  }));
  const catalog = { version: "test", currentSeasonRaidIds: [2, 3], raids };
  expect(currentSeasonRaids(catalog).map((r) => r.id)).toEqual([2, 3]);
  expect(catalog.raids).toHaveLength(4);
  expect(currentSeasonRaids({ version: "legacy", raids })).toEqual([]);
  validateEnvelope(createEnvelope({ catalog }));
  expect(() =>
    validateEnvelope(
      createEnvelope({
        catalog: { ...catalog, currentSeasonRaidIds: ["2"] as any },
      }),
    ),
  ).toThrow();
});
