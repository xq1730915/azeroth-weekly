import { DatabaseSync } from "node:sqlite";
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  const version = (db.prepare("PRAGMA user_version").get() as any).user_version;
  if (version > 1) {
    db.close();
    throw Error("数据库版本较新，请更新软件");
  }
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS characters(guid TEXT PRIMARY KEY, identity TEXT NOT NULL, alias TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,label TEXT NOT NULL,file TEXT NOT NULL,selected INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS character_sources(guid TEXT NOT NULL,source_id TEXT NOT NULL,PRIMARY KEY(guid,source_id));
    CREATE TABLE IF NOT EXISTS weeks(id TEXT PRIMARY KEY,start REAL NOT NULL,end REAL NOT NULL,confirmed INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS captures(guid TEXT NOT NULL REFERENCES characters(guid),week_id TEXT NOT NULL REFERENCES weeks(id),captured_at REAL NOT NULL,data TEXT NOT NULL,PRIMARY KEY(guid,week_id));
    CREATE TABLE IF NOT EXISTS balances(guid TEXT NOT NULL,currency_key TEXT NOT NULL,season_id TEXT NOT NULL,observed_at REAL NOT NULL,data TEXT NOT NULL,PRIMARY KEY(guid,currency_key,season_id));
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,guid TEXT NOT NULL,at REAL NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS event_corrections(event_id TEXT PRIMARY KEY REFERENCES events(id),corrected_at REAL NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS diagnostics(id TEXT PRIMARY KEY,guid TEXT,at REAL NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,guid TEXT NOT NULL,week_id TEXT NOT NULL,raid_id INTEGER NOT NULL,encounter_id INTEGER NOT NULL,difficulty_id INTEGER NOT NULL,data TEXT NOT NULL,UNIQUE(guid,week_id,raid_id,encounter_id,difficulty_id));
    CREATE TABLE IF NOT EXISTS targets(id TEXT PRIMARY KEY,guid TEXT NOT NULL,week_id TEXT NOT NULL,slot_key TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(guid,week_id,slot_key));
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    PRAGMA user_version=1;
  `);
  return db;
}
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = fn();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export const rows = (db: DatabaseSync, sql: string, ...args: any[]): any[] =>
  db.prepare(sql).all(...args);
export const jsonRows = <T>(
  db: DatabaseSync,
  sql: string,
  ...args: any[]
): T[] => rows(db, sql, ...args).map((r) => JSON.parse(r.data));
export function setting<T>(db: DatabaseSync, key: string, fallback: T): T {
  const r = db
    .prepare("SELECT value FROM settings WHERE key=?")
    .get(key) as any;
  return r ? JSON.parse(r.value) : fallback;
}
export function setSetting(db: DatabaseSync, key: string, value: unknown) {
  db.prepare("INSERT OR REPLACE INTO settings VALUES(?,?)").run(
    key,
    JSON.stringify(value),
  );
}
