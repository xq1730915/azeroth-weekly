// @vitest-environment jsdom
import { afterEach, it, expect } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { PlanDialog } from "./features/Plans";
import { createBrowserApi } from "./browserApi";
afterEach(cleanup);
it("keeps unrelated currency out of the overview total and character balances", async () => {
  const api = createBrowserApi(),
    load = api.loadWeek;
  api.loadWeek = async (...args) => {
    const view = await load(...args);
    return {
      ...view,
      characters: view.characters.map((c) => ({
        ...c,
        balances: [
          {
            currencyKey: "currency:2032",
            seasonId: "unverified",
            quantity: 1560,
            observedAt: Date.now() / 1000,
          },
          ...c.balances,
        ],
      })),
    };
  };
  render(<App api={api} />);
  await screen.findByRole("button", { name: /月下星河/ });
  const metric = screen.getByText("最近采集持币").closest(".metric")!;
  expect(within(metric as HTMLElement).getByText("6")).toBeVisible();
  const row = screen.getByRole("button", { name: /月下星河/ }).closest("tr")!;
  expect(within(row).getByText("◈ 2")).toBeVisible();
  expect(screen.queryByText(/1560/)).not.toBeInTheDocument();
});
it("uses an any-three vault goal even when legacy selected targets are empty", async () => {
  const api = createBrowserApi(),
    load = api.loadWeek;
  api.loadWeek = async (...args) => ({
    ...(await load(...args)),
    vaultTargets: [],
  });
  render(<App api={api} />);
  expect(await screen.findByText("3 / 4 角色达标")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "查看宝库目标" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/3 个格子/)).toBeVisible();
  expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
});
it("offers all and only current-season raids, hiding earlier raids from the same expansion", async () => {
  const view = await createBrowserApi().loadWeek();
  const base = view.catalog.raids[0]!;
  view.catalog.raids = [
    { ...base, id: 1, name: "旧资料片团本" },
    { ...base, id: 2, name: "同资料片上赛季团本" },
    { ...base, id: 3, name: "本赛季主团本" },
    { ...base, id: 4, name: "本赛季新团本" },
  ];
  view.catalog.currentSeasonRaidIds = [3, 4];
  render(
    <PlanDialog view={view} onClose={() => {}} onSave={async () => true} />,
  );
  const raid = screen.getByLabelText("团队副本（当前赛季）");
  expect(
    within(raid)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["本赛季主团本", "本赛季新团本"]);
  expect(screen.queryByText("同资料片上赛季团本")).not.toBeInTheDocument();
});
it("asks for a fresh catalog instead of showing legacy archives as current-season choices", async () => {
  const view = await createBrowserApi().loadWeek();
  delete view.catalog.currentSeasonRaidIds;
  render(
    <PlanDialog view={view} onClose={() => {}} onSave={async () => true} />,
  );
  expect(screen.getByText(/当前赛季团本目录尚未采集/)).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /加入/ })).toBeDisabled();
});
it("presents all roles together and only adds a boss after the user selects it", async () => {
  const user = userEvent.setup();
  render(<App api={createBrowserApi()} />);
  expect(await screen.findByRole("button", { name: /月下星河/ })).toBeVisible();
  expect(
    screen.queryByRole("columnheader", { name: "子账号" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /团本周计划/ }));
  expect(screen.queryByText("暮光之心 · 示例 BOSS")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /添加 BOSS 计划/ }));
  const modal = screen.getByRole("dialog", { name: "添加 BOSS 计划" });
  await user.click(within(modal).getByRole("checkbox", { name: /暮光之心/ }));
  await user.click(
    within(modal).getByRole("button", { name: "加入 4 项计划" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getAllByText("暮光之心 · 示例 BOSS")).toHaveLength(4);
});
it("records a manual spend without changing captured balance", async () => {
  const api = createBrowserApi(),
    user = userEvent.setup();
  render(<App api={api} />);
  await screen.findByRole("button", { name: /月下星河/ });
  await user.click(screen.getByRole("button", { name: /ROLL 币账本/ }));
  await user.click(await screen.findByRole("button", { name: /记录一笔/ }));
  const modal = screen.getByRole("dialog", { name: "记录 ROLL 币流水" });
  await user.type(
    within(modal).getByLabelText("获取来源 / 备注"),
    "手动核对记录",
  );
  await user.click(within(modal).getByRole("button", { name: "保存流水" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(await screen.findByText("手动核对记录")).toBeVisible();
  const v = await api.loadWeek(),
    g = v.characters[0]!.identity.guid,
    ledger = await api.getLedger(g, v.week.id);
  expect(ledger.balance?.quantity).toBe(2);
  expect(ledger.recordedSpend).toBe(1);
});
