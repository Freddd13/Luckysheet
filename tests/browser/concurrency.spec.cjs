const { test, expect } = require("@playwright/test");
async function create(page) {
  await page.goto("/");
  await page.evaluate(() => {
    window.events = [];
    luckysheet.create({
      container: "luckysheet",
      safeStrMode: true,
      lang: "zh",
      hook: { sheetDataChanged: e => events.push(e) },
      data: [
        {
          name: "业务表",
          index: "main",
          order: 0,
          status: 1,
          row: 200,
          column: 30,
          config: {},
          celldata: [],
        },
      ],
    });
  });
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
}
test("批量准备期间的协同更新使旧提交失效", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(async () => {
    const pending = luckysheet.setRangeValue(
      Array.from({ length: 2000 }, () => Array(100).fill("批量值")),
      { range: { row: [0, 1999], column: [0, 99] } }
    );
    testInternals.server.wsUpdateMsg({
      t: "v",
      i: "main",
      r: 20,
      c: 1,
      v: { v: "协同修订", m: "协同修订", ct: { fa: "@", t: "s" } },
    });
    return {
      committed: await pending,
      value: luckysheet.getCellValue(20, 1),
      rows: luckysheet.getWorkbookInfo().sheets[0].rowCount,
      events: events.length,
    };
  });
  expect(result).toEqual({
    committed: false,
    value: "协同修订",
    rows: 200,
    events: 1,
  });
});
test("反向选区焦点下的多行剪切可完整撤销", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(() => {
    luckysheet.setRangeValue([["001"], ["002"], ["003"]], {
      range: { row: [20, 22], column: [0, 0] },
    });
    luckysheet.setRangeShow({ row: [20, 22], column: [0, 0] });
    testInternals.selection.copy({
      originalEvent: { clipboardData: { setData() {} } },
    });
    luckysheet.setRangeShow({ row: [5, 9], column: [0, 0] });
    const range = testInternals.Store.luckysheet_select_save[0];
    range.row_focus = 9;
    range.column_focus = 0;
    testInternals.selection.pasteHandlerOfCutPaste(
      testInternals.Store.luckysheet_copy_save
    );
    testInternals.selection.clearcopy();
    const moved = [9, 10, 11].map(r => luckysheet.getCellValue(r, 0));
    luckysheet.undo();
    return {
      moved,
      restored: [20, 21, 22].map(r => luckysheet.getCellValue(r, 0)),
      undone: [9, 10, 11].map(r => luckysheet.getCellValue(r, 0)),
    };
  });
  expect(result).toEqual({
    moved: ["001", "002", "003"],
    restored: ["001", "002", "003"],
    undone: [null, null, null],
  });
});
test("就绪元数据不导出全表，旧创建 hook 保留快照且副本独立", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.ready = [];
    window.options = {
      container: "luckysheet",
      safeStrMode: true,
      lang: "zh",
      showtoolbarConfig: { font: true },
      data: [
        {
          name: "业务表",
          index: "main",
          status: 1,
          order: 0,
          row: 200,
          column: 30,
          config: {},
          celldata: [{ r: 0, c: 0, v: { v: "001", ct: { fa: "@", t: "s" } } }],
        },
      ],
      hook: { workbookReady: info => ready.push(info) },
    };
    luckysheet.create(options);
  });
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const first = await page.evaluate(() => ({
    count: ready.length,
    index: ready[0].activeSheetIndex,
    revision: Number.isInteger(ready[0].sheets[0].revision),
    snapshotStored: "data" in testInternals.Store.toJsonOptions,
  }));
  expect(first).toEqual({
    count: 1,
    index: "main",
    revision: true,
    snapshotStored: false,
  });
  await page.evaluate(() => {
    options.hook.workbookCreateAfter = snapshot => (window.snapshot = snapshot);
    luckysheet.create(options);
  });
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const second = await page.evaluate(() => {
    snapshot.showtoolbarConfig.font = false;
    snapshot.hook.workbookReady = null;
    snapshot.data[0].data[0][0].v = "副本";
    const fresh = luckysheet.toJson();
    return {
      count: ready.length,
      independent: fresh !== snapshot,
      font: fresh.showtoolbarConfig.font,
      hook: typeof testInternals.config.hook.workbookReady,
      value: luckysheet.getCellValue(0, 0),
      snapshotStored: "data" in testInternals.Store.toJsonOptions,
    };
  });
  expect(second).toEqual({
    count: 2,
    independent: true,
    font: true,
    hook: "function",
    value: "001",
    snapshotStored: false,
  });
});

test("历史公式结果在操作后可读，公式与撤销快照保持完整", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.observed = [];
    luckysheet.create({
      container: "luckysheet",
      safeStrMode: true,
      lang: "zh",
      forceCalculation: false,
      hook: {
        sheetDataChanged: () =>
          observed.push(String(luckysheet.getCellValue(5, 0))),
      },
      data: [
        {
          name: "业务表",
          index: "main",
          status: 1,
          order: 0,
          row: 100,
          column: 30,
          config: {},
          calcChain: [{ r: 5, c: 0, index: "main" }],
          celldata: [
            { r: 0, c: 0, v: { v: "1", m: "1", ct: { fa: "@", t: "s" } } },
            {
              r: 5,
              c: 0,
              v: { v: 1, m: "1", f: "=LEN(A1)", ct: { fa: "General", t: "n" } },
            },
          ],
        },
      ],
    });
  });
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const changed = await page.evaluate(() => {
    luckysheet.setCellValue(0, 0, "22");
    return {
      value: String(luckysheet.getCellValue(5, 0)),
      event: observed[observed.length - 1],
    };
  });
  expect(changed).toEqual({ value: "2", event: "2" });
  await page.evaluate(() => luckysheet.luckysheetrefreshgrid());
  const history = await page.evaluate(() => {
    const after = luckysheet.getAllSheets()[0].data[5][0];
    luckysheet.undo();
    const before = luckysheet.getAllSheets()[0].data[5][0];
    luckysheet.redo();
    const redone = luckysheet.getAllSheets()[0].data[5][0];
    return {
      after: { v: after.v, f: after.f },
      before: { v: before.v, f: before.f },
      redone: { v: redone.v, f: redone.f },
    };
  });
  expect(history).toEqual({
    after: { v: "2", f: "=LEN(A1)" },
    before: { v: 1, f: "=LEN(A1)" },
    redone: { v: "2", f: "=LEN(A1)" },
  });
});

test("历史布尔公式与跨表引用在提交时保持正确", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.formulaEvents = [];
    luckysheet.create({
      container: "luckysheet",
      safeStrMode: true,
      lang: "zh",
      forceCalculation: false,
      hook: { sheetDataChanged: e => formulaEvents.push(e) },
      data: [
        {
          name: "Source",
          index: "source",
          order: 0,
          status: 1,
          row: 100,
          column: 30,
          config: {},
          calcChain: [
            { r: 5, c: 0, index: "source" },
            { r: 5, c: 1, index: "source" },
            { r: 5, c: 2, index: "source" },
          ],
          celldata: [
            { r: 0, c: 0, v: { v: "1", m: "1", ct: { fa: "@", t: "s" } } },
            {
              r: 0,
              c: 3,
              v: { v: "旧门", m: "旧门", ct: { fa: "@", t: "s" } },
            },
            {
              r: 5,
              c: 0,
              v: { v: 1, m: "1", f: "=LEN(A1)", ct: { fa: "General", t: "n" } },
            },
            {
              r: 5,
              c: 1,
              v: {
                v: false,
                m: "FALSE",
                f: "=LEN(A1)>1",
                ct: { fa: "General", t: "b" },
              },
            },
            {
              r: 5,
              c: 2,
              v: {
                v: "旧门",
                m: "旧门",
                f: '=IF(B6,"长",D1)',
                ct: { fa: "General", t: "s" },
              },
            },
          ],
        },
        {
          name: "Derived",
          index: "derived",
          order: 1,
          status: 0,
          row: 100,
          column: 30,
          config: {},
          calcChain: [{ r: 0, c: 0, index: "derived" }],
          celldata: [
            {
              r: 0,
              c: 0,
              v: {
                v: 1,
                m: "1",
                f: "=LEN(Source!A1)",
                ct: { fa: "General", t: "n" },
              },
            },
          ],
        },
      ],
    });
  });
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const result = await page.evaluate(() => {
    const read = () => {
      const s = luckysheet.getAllSheets();
      return [
        s[0].data[5][0].v,
        s[0].data[5][1].v,
        s[0].data[5][2].v,
        s[1].data[0][0].v,
      ];
    };
    const revision = luckysheet.getWorkbookInfo().sheets[1].revision;
    luckysheet.setCellValue(0, 0, "22");
    const changed = read();
    const notifications = formulaEvents.map(e => e.sheetIndex);
    formulaEvents.length = 0;
    const rejected =
      luckysheet.setViewDecorations([{ id: "stale", range: { row: [0, 1] } }], {
        sheetIndex: "derived",
        revision,
      }) === false;
    luckysheet.undo();
    const restored = read();
    luckysheet.redo();
    const redone = read();
    luckysheet.setCellValue(0, 0, "1");
    luckysheet.setCellValue(0, 3, "新门");
    const later = read();
    return { changed, notifications, rejected, restored, redone, later };
  });
  expect(result.changed).toEqual(["2", "true", "长", "2"]);
  expect(result.notifications.sort()).toEqual(["derived", "source"]);
  expect(result.rejected).toBe(true);
  expect(result.restored.slice(0, 3)).toEqual([1, false, "旧门"]);
  expect(result.redone).toEqual(["2", "true", "长", "2"]);
  expect(result.later).toEqual(["1", "false", "新门", "1"]);
  await page.evaluate(() => luckysheet.setSheetActive(1));
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const inactive = await page.evaluate(() => {
    luckysheet.setCellValue(0, 0, "333", { order: 0 });
    return {
      source: luckysheet.getCellValue(5, 0, { order: 0 }),
      derived: luckysheet.getCellValue(0, 0, { order: 1 }),
    };
  });
  expect(inactive).toEqual({ source: "3", derived: "3" });
});
