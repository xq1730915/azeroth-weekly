import type { AppApi } from "./api";
import {
  selectBonusRollBalance,
  BONUS_ROLL_CURRENCY_KEY,
} from "@azeroth-weekly/protocol";
import { demoData } from "./demo";
export function createBrowserApi(): AppApi {
  const d = demoData(),
    week = Object.values(d.envelope.characters)[0]!.week;
  let plans = d.plans,
    targets = d.targets,
    events = Object.values(d.envelope.events);
  const aliases: Record<string, string> = {};
  const desktop = async (): Promise<any> => {
    throw Error("请在桌面软件中使用文件导入和备份功能");
  };
  return {
    loadWeek: async () => ({
      week,
      weeks: [week],
      characters: Object.values(d.envelope.characters),
      bossPlans: plans,
      vaultTargets: targets,
      currencyEvents: events,
      aliases,
      catalog: d.envelope.catalog!,
      demoMode: true,
    }),
    savePlans: async (p) => {
      let added = 0;
      for (const x of p)
        if (
          !plans.some(
            (q) =>
              q.guid === x.guid &&
              q.weekId === x.weekId &&
              q.raidId === x.raidId &&
              q.encounterId === x.encounterId &&
              q.difficultyId === x.difficultyId,
          )
        ) {
          plans.push(x);
          added++;
        }
      return { added, skipped: p.length - added };
    },
    updatePlan: async (p) => {
      plans = plans.map((q) => (q.id === p.id ? p : q));
    },
    deletePlan: async (id) => {
      plans = plans.filter((p) => p.id !== id);
    },
    saveTargets: async (g, w, t) => {
      targets = targets.filter((x) => x.guid !== g || x.weekId !== w).concat(t);
    },
    copyPrevious: async () => {
      throw Error("演示只有一个周期，请在实际使用中复制上周计划");
    },
    setAlias: async (g, a) => {
      aliases[g] = a;
    },
    getLedger: async (g) => {
      const ev = events.filter((e) => e.guid === g),
        balances = d.envelope.characters[g]?.balances ?? [];
      return {
        balance: selectBonusRollBalance(balances),
        balances,
        events: ev,
        recordedGain: ev
          .filter(
            (e) =>
              e.currencyKey === BONUS_ROLL_CURRENCY_KEY &&
              e.kind === "gain" &&
              e.evidence === "confirmed",
          )
          .reduce((n, e) => n + (e.quantity ?? 0), 0),
        recordedSpend: ev
          .filter(
            (e) =>
              e.currencyKey === BONUS_ROLL_CURRENCY_KEY &&
              e.kind === "spend" &&
              e.evidence === "confirmed",
          )
          .reduce((n, e) => n + (e.quantity ?? 0), 0),
        pendingCount: ev.filter((e) => e.evidence === "pending").length,
        observations: [],
        coverageStart: ev[0]?.at ?? null,
      };
    },
    recordEvent: async (e) => {
      events.push(e);
    },
    correctEvent: async (e) => {
      events = events.map((x) => (x.id === e.id ? e : x));
    },
    chooseRoot: desktop,
    listSources: async () => [],
    selectSources: desktop,
    importNow: async () => [],
    importFile: desktop,
    exportBackup: desktop,
    restoreBackup: desktop,
    exportCsv: desktop,
    demo: async () => {},
    onSync: () => () => {},
  };
}
