import type { RaidCatalog } from "./types";

export function currentSeasonRaids(catalog: RaidCatalog): RaidCatalog["raids"] {
  const ids = new Set(catalog.currentSeasonRaidIds ?? []);
  return catalog.raids.filter((raid) => ids.has(raid.id));
}
