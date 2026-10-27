import type {
  CaptureEnvelope,
  BossPlan,
  VaultTarget,
} from "@azeroth-weekly/protocol";
export function demoData() {
  const now = Math.floor(Date.now() / 1000),
    start = now - 3 * 86400,
    end = start + 604800,
    week = { id: "DEMO:week", start, end, confirmed: false };
  const envelope: CaptureEnvelope = {
    schemaVersion: 1,
    installationId: "DEMO",
    sequence: 10,
    clientBuild: "演示数据",
    addonVersion: "0.1.2",
    capabilities: {},
    characters: {},
    events: {},
    catalog: {
      version: "demo",
      currentSeasonRaidIds: [90001],
      raids: [
        {
          id: 90001,
          name: "示例团本 · 星陨之境",
          difficulties: [
            { id: 15, name: "英雄" },
            { id: 16, name: "史诗" },
          ],
          bosses: [
            { encounterId: 901, name: "守门者 · 示例 BOSS" },
            { encounterId: 902, name: "织星者 · 示例 BOSS" },
            { encounterId: 903, name: "暮光之心 · 示例 BOSS" },
          ],
        },
      ],
    },
  };
  const plans: BossPlan[] = [],
    targets: VaultTarget[] = [];
  ["月下星河", "晚风听雨", "霜语", "长夜"].forEach((name, i) => {
    const guid = `Player-DEMO-${i + 1}`,
      progress = [6, 8, 2, null][i] ?? null;
    envelope.characters[guid] = {
      identity: {
        region: "CN",
        branch: "retail",
        guid,
        name,
        realm: "示例服务器",
        classId: [2, 1, 8, 3][i]!,
      },
      capturedAt: now - i * 2700,
      week,
      vault: {
        previousRewardAvailable: i === 2,
        slots: [1, 3, 6].flatMap((type) =>
          [1, 2, 3].map((index) => ({
            key: `${type}:${index}`,
            activityType: type,
            index,
            progress,
            threshold: [2, 4, 8][index - 1]!,
            itemLevel: progress === null ? null : 318,
          })),
        ),
      },
      encounters: [901, 902].map((encounterId, j) => ({
        raidId: 90001,
        encounterId,
        difficultyId: 15,
        killed: i === 3 ? null : i === 1 || j === 0,
        lootEligible: null,
        observedAt: now,
      })),
      balances: [
        {
          currencyKey: "currency:3513",
          seasonId: "DEMO",
          quantity: [2, 1, 3, 0][i]!,
          observedAt: now,
        },
      ],
    };
    for (const boss of [901, 902])
      plans.push({
        id: `demo-plan-${i}-${boss}`,
        guid,
        weekId: week.id,
        raidId: 90001,
        encounterId: boss,
        difficultyId: 15,
        targetItemLink: null,
        planBonusRoll: boss === 902,
      });
    for (const key of ["1:1", "1:2", "1:3"])
      targets.push({
        id: `demo-target-${i}-${key}`,
        guid,
        weekId: week.id,
        slotKey: key,
        minimumItemLevel: null,
      });
  });
  return { envelope, plans, targets };
}
