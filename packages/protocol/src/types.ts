export type Evidence = 'confirmed' | 'pending';
export type Availability = 'available' | 'unavailable' | 'unverified';
export interface CharacterIdentity {
  region: 'CN'; branch: 'retail'; guid: string;
  name: string; realm: string; classId: number | null;
}
export interface GameWeek { id: string; start: number; end: number; confirmed: boolean }
export interface VaultSlot {
  key: string; activityType: number; index: number;
  progress: number | null; threshold: number; itemLevel: number | null;
}
export interface EncounterFact {
  raidId: number; encounterId: number; difficultyId: number;
  killed: boolean | null; lootEligible: boolean | null; observedAt: number;
}
export interface CurrencyBalance {
  currencyKey: string; seasonId: string; quantity: number | null; observedAt: number;
}
export interface CurrencyEvent {
  id: string; guid: string; at: number; currencyKey: string; seasonId: string;
  kind: 'gain' | 'spend' | 'adjustment'; quantity: number | null;
  provenance: 'game' | 'manual'; evidence: Evidence;
  activity: 'raid' | 'dungeon' | 'delve' | 'other';
  raidId: number | null; encounterId: number | null; difficultyId: number | null;
  specId: number | null; rewardLink: string | null; itemLevel: number | null; note: string;
}
export interface CharacterCapture {
  identity: CharacterIdentity; capturedAt: number; week: GameWeek;
  vault: { slots: VaultSlot[]; previousRewardAvailable: boolean | null };
  encounters: EncounterFact[]; balances: CurrencyBalance[];
}
export interface RaidCatalog {
  version: string;
  /** IDs from the client Current Season tier; absent means unverified. */
  currentSeasonRaidIds?: number[];
  raids: { id: number; name: string; difficulties: { id: number; name: string }[];
    bosses: { encounterId: number; name: string }[] }[];
}
/** Optional addon diagnostics are evidence candidates, never accounting facts. */
export interface DiagnosticObservation {
  id: string; at: number; guid: string | null; event: string;
  payload: Record<string, string | number | boolean>;
}
export interface CaptureEnvelope {
  schemaVersion: 1; installationId: string; sequence: number;
  clientBuild: string; addonVersion: string;
  capabilities: Record<string, Availability>;
  characters: Record<string, CharacterCapture>; events: Record<string, CurrencyEvent>;
  catalog?: RaidCatalog;
  diagnostics?: DiagnosticObservation[];
}
export interface BossPlan {
  id: string; guid: string; weekId: string; raidId: number; encounterId: number;
  difficultyId: number; targetItemLink: string | null; planBonusRoll: boolean;
}
export interface VaultTarget {
  id: string; guid: string; weekId: string; slotKey: string; minimumItemLevel: number | null;
}
export interface ImportReport {
  charactersUpdated: number; eventsAdded: number; duplicateEvents: number; pendingEvents: number;
}
