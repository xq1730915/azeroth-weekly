import { useEffect, useState } from "react";
import type { AppApi, Source, ImportResult } from "../api";
export function Settings({
  api,
  act,
}: {
  api: AppApi;
  act: (fn: () => Promise<unknown>, message: string) => Promise<boolean>;
}) {
  const [sources, setSources] = useState<Source[]>([]),
    [results, setResults] = useState<ImportResult[]>([]);
  useEffect(() => {
    api
      .listSources()
      .then(setSources)
      .catch(() => {});
  }, [api]);
  return (
    <div className="settings-layout">
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>游戏数据来源</h2>
            <p>仅在此配置导入来源，角色在其他页面统一呈现</p>
          </div>
          <button
            onClick={() =>
              act(async () => {
                const s = await api.chooseRoot();
                if (s) setSources(s);
              }, "游戏目录已读取")
            }
          >
            选择游戏目录
          </button>
        </header>
        <div className="settings-body">
          <p>选择实际使用的四个子账号来源。首次采集前，存档可能尚未生成。</p>
          {!sources.length ? (
            <div className="empty compact">
              <h3>尚未选择游戏目录</h3>
              <p>选择《魔兽世界》安装文件夹或其中的 _retail_ 文件夹。</p>
            </div>
          ) : (
            <>
              <div className="source-list">
                {sources.map((s) => (
                  <label key={s.id} className="source">
                    <input
                      type="checkbox"
                      checked={s.selected}
                      onChange={(e) =>
                        setSources(
                          sources.map((x) =>
                            x.id === s.id
                              ? { ...x, selected: e.target.checked }
                              : x,
                          ),
                        )
                      }
                    />
                    <span>
                      <strong>{s.label}</strong>
                      <small>
                        {s.lastStatus === "error"
                          ? s.message
                          : s.fileExists
                            ? "已发现插件存档"
                            : "尚未生成 AzerothWeekly 存档"}
                      </small>
                    </span>
                    <span className={"tag " + (s.fileExists ? "teal" : "")}>
                      {s.fileExists ? "可读取" : "待采集"}
                    </span>
                  </label>
                ))}
              </div>
              <div className="settings-actions">
                <small>
                  已选择 {sources.filter((s) => s.selected).length} /{" "}
                  {sources.length} 个来源
                </small>
                <button
                  className="primary"
                  onClick={() =>
                    act(
                      () =>
                        api.selectSources(
                          sources.filter((s) => s.selected).map((s) => s.id),
                        ),
                      "来源已保存，将自动读取变化",
                    )
                  }
                >
                  保存来源选择
                </button>
              </div>
            </>
          )}
          <div className="settings-actions">
            <button
              onClick={() =>
                act(async () => {
                  setResults(await api.importNow());
                }, "读取完成")
              }
            >
              ↻ 立即读取
            </button>
            <button
              onClick={() =>
                act(async () => {
                  const r = await api.importFile();
                  if (r) setResults([r]);
                }, "存档已读取")
              }
            >
              手动选择存档文件
            </button>
          </div>
          {results.length > 0 && (
            <div className="import-results">
              {results.map((r) => (
                <div key={r.sourceId}>
                  <strong>{r.label}</strong>
                  <span
                    className={r.status === "error" ? "error-text" : "muted"}
                  >
                    {r.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>本地备份</h2>
            <p>计划、角色备注、采集记录和用币流水一起保存</p>
          </div>
        </header>
        <div className="settings-body backup-actions">
          <button onClick={() => act(() => api.exportBackup(), "备份操作完成")}>
            导出完整备份
          </button>
          <button
            onClick={() => act(() => api.restoreBackup(), "恢复操作完成")}
          >
            从备份恢复
          </button>
          <button
            onClick={() => act(() => api.exportCsv(), "流水导出操作完成")}
          >
            导出币流水 CSV
          </button>
          <small>恢复前自动保存安全副本；恢复后请重新确认数据来源。</small>
        </div>
      </section>
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>首次使用</h2>
            <p>三个步骤，让每周计划与游戏进度连接起来</p>
          </div>
        </header>
        <ol className="guide">
          <li>
            <strong>安装采集插件</strong>
            <p>
              将插件包中的 AzerothWeekly 文件夹放入
              _retail_\Interface\AddOns，然后在游戏插件列表启用。
            </p>
          </li>
          <li>
            <strong>登录需要追踪的角色</strong>
            <p>
              分别登录四个子账号的角色。切换角色、正常退出或输入 /reload
              后，游戏才会更新磁盘存档。
            </p>
          </li>
          <li>
            <strong>设置目标并读取</strong>
            <p>
              保存来源选择后自动读取存档；宝库任意活动合计开 3 格即达标，在团本计划中勾选要打的
              BOSS。
            </p>
          </li>
        </ol>
        <p className="footnote">
          游戏命令 /azweekly
          显示采集诊断；额外拾取观察暂需核对，无法确认的历史不会被自动补成流水。
        </p>
      </section>
    </div>
  );
}
