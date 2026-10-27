import { contextBridge, ipcRenderer } from "electron";
const methods = [
  "loadWeek",
  "savePlans",
  "updatePlan",
  "deletePlan",
  "saveTargets",
  "copyPrevious",
  "setAlias",
  "getLedger",
  "recordEvent",
  "correctEvent",
  "chooseRoot",
  "listSources",
  "selectSources",
  "importNow",
  "importFile",
  "exportBackup",
  "restoreBackup",
  "exportCsv",
  "demo",
];
const api: Record<string, unknown> = {};
for (const name of methods)
  api[name] = (...args: unknown[]) => ipcRenderer.invoke("aw:" + name, ...args);
api.onSync = (callback: () => void) => {
  const listener = () => callback();
  ipcRenderer.on("aw:sync", listener);
  return () => ipcRenderer.removeListener("aw:sync", listener);
};
contextBridge.exposeInMainWorld("azerothWeekly", api);
