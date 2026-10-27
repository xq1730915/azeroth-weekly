import type {
  BossPlan,
  VaultTarget,
  CurrencyEvent,
} from "@azeroth-weekly/protocol";
import type { WeekView } from "../electron/backend/views";
import type { getLedger } from "../electron/backend/ledger";
export type LedgerView = ReturnType<typeof getLedger>;
export interface Source {
  id: string;
  label: string;
  selected: boolean;
  fileExists: boolean;
  lastStatus?: string;
  message?: string;
}
export interface ImportResult {
  sourceId: string;
  label: string;
  status: string;
  message: string;
  report: any;
}
export interface AppApi {
  loadWeek(id?: string): Promise<WeekView & { demoMode: boolean }>;
  savePlans(plans: BossPlan[]): Promise<{ added: number; skipped: number }>;
  updatePlan(plan: BossPlan): Promise<void>;
  deletePlan(id: string): Promise<void>;
  saveTargets(
    guid: string,
    weekId: string,
    targets: VaultTarget[],
  ): Promise<void>;
  copyPrevious(weekId: string): Promise<{ added: number; skipped: number }>;
  setAlias(guid: string, alias: string): Promise<void>;
  getLedger(guid: string, weekId: string): Promise<LedgerView>;
  recordEvent(event: CurrencyEvent): Promise<void>;
  correctEvent(event: CurrencyEvent): Promise<void>;
  chooseRoot(): Promise<Source[] | null>;
  listSources(): Promise<Source[]>;
  selectSources(ids: string[]): Promise<void>;
  importNow(): Promise<ImportResult[]>;
  importFile(): Promise<ImportResult | null>;
  exportBackup(): Promise<string | null>;
  restoreBackup(): Promise<boolean>;
  exportCsv(): Promise<string | null>;
  demo(enabled: boolean): Promise<void>;
  onSync(callback: () => void): () => void;
}
declare global {
  interface Window {
    azerothWeekly?: AppApi;
  }
}
