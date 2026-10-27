import { app, BrowserWindow, ipcMain, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as store from "./backend/store";
import {
  configureRoot,
  discoverSources,
  selectSources,
  importSelected,
  readImportFile,
} from "./backend/sources";
import { demoData } from "../src/demo";
import { setting, setSetting } from "./backend/database";

const smoke = process.argv.includes("--smoke-test"),
  screenshot = process.argv
    .find((a) => a.startsWith("--screenshot="))
    ?.slice(13);
const override = process.argv
  .find((a) => a.startsWith("--data-dir="))
  ?.slice(11);
if (override) app.setPath("userData", path.resolve(override));
let window: BrowserWindow | null = null,
  db: ReturnType<typeof store.openDatabase>,
  realDb: ReturnType<typeof store.openDatabase>,
  demoMode = false,
  busy = false,
  shuttingDown=false,
  timer: ReturnType<typeof setInterval> | undefined;
function seedDemo() {
  const d = demoData();
  const memory = store.openDatabase(":memory:");
  store.ingest(memory, "DEMO", d.envelope);
  store.addBossPlans(memory, d.plans);
  for (const c of Object.values(d.envelope.characters))
    store.saveVaultTargets(
      memory,
      c.identity.guid,
      c.week.id,
      d.targets.filter((t) => t.guid === c.identity.guid),
    );
  return memory;
}
function register(name: string, fn: (...args: any[]) => any) {
  ipcMain.handle("aw:" + name, (e, ...args) => {
    if (
      !window ||
      e.sender.id !== window.webContents.id ||
      e.senderFrame !== window.webContents.mainFrame
    )
      throw Error("请求来源不受信任");
    return fn(...args);
  });
}
async function sync() {
  if (demoMode || busy) return [];
  busy = true;
  try {
    const results = await importSelected(db);
    const previous = setting<any[]>(db, "lastImportResults", []);
    setSetting(db, "lastImportResults", results);
    if (
      results.some((r) => r.status === "ok") ||
      previous.filter((r) => r.status === "error").length !==
        results.filter((r) => r.status === "error").length
    )
      window?.webContents.send("aw:sync");
    return results;
  } finally {
    busy = false;
  }
}
async function waitForSync() {
  while (busy) await new Promise((r) => setTimeout(r, 50));
}
function hooks() {
  register("loadWeek", (id?: string) => ({
    ...store.loadWeek(db, id),
    demoMode,
    syncErrorCount: setting<any[]>(db, "lastImportResults", []).filter(
      (r) => r.status === "error",
    ).length,
  }));
  register("savePlans", (plans) => store.addBossPlans(db, plans));
  register("updatePlan", (p) => store.updateBossPlan(db, p));
  register("deletePlan", (id) => store.deleteBossPlan(db, id));
  register("saveTargets", (guid, w, targets) =>
    store.saveVaultTargets(db, guid, w, targets),
  );
  register("copyPrevious", (w) => store.copyPrevious(db, w));
  register("setAlias", (g, a) => store.setAlias(db, g, a));
  register("getLedger", (g, w) => store.getLedger(db, g, w));
  register("recordEvent", (e) => store.recordEvent(db, e));
  register("correctEvent", (e) => store.correctEvent(db, e));
  register("chooseRoot", async () => {
    if (demoMode) throw Error("请先退出演示模式");
    const r = await dialog.showOpenDialog(window!, {
      title: "选择魔兽世界安装目录",
      properties: ["openDirectory"],
      defaultPath: "D:\\World of Warcraft",
    });
    return r.canceled ? null : configureRoot(db, r.filePaths[0]!);
  });
  register("listSources", () => discoverSources(db));
  register("selectSources", (ids) => selectSources(db, ids));
  register("importNow", sync);
  register("importFile", async () => {
    if (demoMode) throw Error("请先退出演示模式");
    const r = await dialog.showOpenDialog(window!, {
      title: "选择 AzerothWeekly 插件存档",
      filters: [{ name: "插件存档", extensions: ["lua", "bak"] }],
      properties: ["openFile"],
    });
    if (r.canceled) return null;
    const file = r.filePaths[0]!,
      sourceId = createHash("sha256").update(file).digest("hex");
    return {
      sourceId,
      label: path.basename(file),
      ...(await readImportFile(db, file, sourceId)),
    };
  });
  register("demo", async (enabled: boolean) => {
    if (typeof enabled !== "boolean") throw Error("模式不正确");
    if (enabled === demoMode) return;
    await waitForSync();
    if (enabled) db = seedDemo();
    else {
      db.close();
      db = realDb;
    }
    demoMode = enabled;
  });
  register("exportBackup", async () => {
    const r = await dialog.showSaveDialog(window!, {
      defaultPath: "艾泽拉斯周计划-备份.json",
      filters: [{ name: "备份", extensions: ["json"] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(store.backup(db), null, 2));
    return r.filePath;
  });
  register("restoreBackup", async () => {
    if (demoMode) throw Error("请先退出演示模式");
    const r = await dialog.showOpenDialog(window!, {
      title: "恢复本地备份",
      filters: [{ name: "备份", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (r.canceled) return false;
    const confirm = await dialog.showMessageBox(window!, {
      type: "question",
      message: "将用备份替换当前数据。恢复前会自动保存一份安全备份。",
      buttons: ["取消", "恢复"],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) return false;
    const file = r.filePaths[0]!;
    if (fs.statSync(file).size > 64 * 1024 * 1024) throw Error("备份文件过大");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    await waitForSync();
    const safety = path.join(
      app.getPath("userData"),
      `before-restore-${Date.now()}.json`,
    );
    fs.writeFileSync(safety, JSON.stringify(store.backup(db)));
    store.restore(db, raw);
    return true;
  });
  register("exportCsv", async () => {
    const r = await dialog.showSaveDialog(window!, {
      defaultPath: "ROLL币流水.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, store.ledgerCsv(db));
    return r.filePath;
  });
}
app
  .whenReady()
  .then(async () => {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    realDb = store.openDatabase(
      path.join(app.getPath("userData"), "progress.db"),
    );
    db = realDb;
    if (process.argv.includes("--demo")) {
      db = seedDemo();
      demoMode = true;
    }
    window = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 1000,
      minHeight: 700,
      title: "艾泽拉斯周计划",
      backgroundColor: "#0e131a",
      show: !smoke && !screenshot,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (e) => e.preventDefault());
    hooks();
    const url = process.env.AW_DEV_URL;
    if (url && /^http:\/\/localhost:5173\/?$/.test(url))
      await window.loadURL(url);
    else await window.loadFile(path.join(__dirname, "../renderer/index.html"));
    if (smoke) {
      console.log(
        "AW_SMOKE " +
          JSON.stringify({
            sqlite: true,
            characters: store.loadWeek(db).characters.length,
            node: process.versions.node,
            electron: process.versions.electron,
          }),
      );
      app.quit();
      return;
    }
    if (screenshot) {
      await new Promise((r) => setTimeout(r, 1200));
      const pic = await window.webContents.capturePage();
      fs.mkdirSync(path.dirname(path.resolve(screenshot)), { recursive: true });
      fs.writeFileSync(screenshot, pic.toPNG());
      app.quit();
      return;
    }
    timer = setInterval(() => void sync().catch(() => {}), 8000);
    void sync().catch(() => {});
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
app.on("window-all-closed", () => {if(!shuttingDown)app.quit();});
app.on("before-quit", () => {
  if(shuttingDown)return;shuttingDown=true;
  if (timer) clearInterval(timer);
  if (demoMode) db?.close();
  realDb?.close();
});
