const { test, expect } = require("@playwright/test");

test("普通文字、换行、旋转、富文本和缩放绘制与原版本一致", async ({ page }) => {
  test.skip(!require('fs').existsSync('tmp/baseline.js'),'画面对照需要 tmp/baseline.js 的修改前构建');
  const images = [];
  for (const path of ["/baseline", "/"]) {
    await page.goto(path);
    await page.evaluate(() =>
      luckysheet.create({
        container: "luckysheet",
        safeStrMode: true,
        lang: "zh",
        showtoolbar: false,
        showinfobar: false,
        showstatisticBar: false,
        defaultRowHeight: 32,
        defaultColWidth: 100,
        data: [
          {
            name: "兼容表",
            index: "visual",
            status: 1,
            order: 0,
            row: 100,
            column: 30,
            config: {},
            celldata: [
              {
                r: 1,
                c: 1,
                v: {
                  v: "中文 abc 001",
                  m: "中文 abc 001",
                  ct: { fa: "@", t: "s" },
                },
              },
              {
                r: 2,
                c: 1,
                v: {
                  v: "甲\n乙",
                  m: "甲\n乙",
                  tb: "2",
                  ct: { fa: "@", t: "s" },
                },
              },
              {
                r: 3,
                c: 1,
                v: { v: "abc", m: "abc", un: 1, ct: { fa: "@", t: "s" } },
              },
              {
                r: 4,
                c: 1,
                v: { v: "旋转", m: "旋转", rt: 45, ct: { fa: "@", t: "s" } },
              },
              {
                r: 5,
                c: 1,
                v: {
                  ct: {
                    t: "inlineStr",
                    s: [
                      { v: "甲", bl: 1, ff: "Arial", fs: 11 },
                      { v: "乙", fc: "#ff0000", fs: 11 },
                    ],
                  },
                },
              },
            ],
          },
        ],
      })
    );
    await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
    const captures = [];
    for (const zoom of [1, 1.25, 0.8]) {
      const result = await page.evaluate(zoom => {
        luckysheet.setSheetZoom(zoom);
        luckysheet.luckysheetrefreshgrid();
        const first = document
          .getElementById("luckysheetTableContent")
          .toDataURL();
        luckysheet.luckysheetrefreshgrid();
        return {
          first,
          second: document.getElementById("luckysheetTableContent").toDataURL(),
        };
      }, zoom);
      expect(result.second).toBe(result.first);
      captures.push(result.first);
    }
    images.push(captures);
  }
  expect(images[1]).toEqual(images[0]);
});

test("批量格式保留历史类型与公式，并作为一次操作撤销", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.events = [];
    luckysheet.create({
      container: "luckysheet",
      safeStrMode: true,
      lang: "zh",
      forceCalculation: false,
      hook: { sheetDataChanged: event => events.push(event) },
      data: [
        {
          name: "类型保留",
          index: "main",
          order: 0,
          status: 1,
          row: 100,
          column: 30,
          config: {},
          calcChain: [{ r: 3, c: 0, index: "main" }],
          celldata: [
            { r: 2, c: 0, v: { v: 0.12, m: "12%", ct: { fa: "0%", t: "n" } } },
            {
              r: 3,
              c: 0,
              v: { v: 3, m: "3", f: "=1+2", ct: { fa: "General", t: "n" } },
            },
          ],
        },
      ],
    });
  });
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const result = await page.evaluate(() => {
    luckysheet.setRangeFormat("bg", "#ddeeff", {
      range: { row: [2, 3], column: [0, 0] },
    });
    const saved = luckysheet.getAllSheets()[0],
      count = events.length;
    luckysheet.undo();
    const undone = luckysheet.getAllSheets()[0];
    return {
      number: saved.data[2][0].v,
      display: saved.data[2][0].m,
      formula: saved.data[3][0].f,
      chain: saved.calcChain.length,
      color: saved.data[3][0].bg,
      count,
      undone: undone.data[3][0].bg,
      originalFormula: undone.data[3][0].f,
    };
  });
  expect(result).toEqual({
    number: 0.12,
    display: "12%",
    formula: "=1+2",
    chain: 1,
    color: "#ddeeff",
    count: 1,
    undone: undefined,
    originalFormula: "=1+2",
  });
});

test("历史合并保留、新公式和合并拦截、冻结隐藏行缩放与旧 DOM 标识", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    luckysheet.create({
      container: "luckysheet",
      safeStrMode: true,
      lang: "zh",
      data: [
        {
          name: "兼容表",
          index: "main",
          order: 0,
          status: 1,
          row: 200,
          column: 30,
          config: {
            rowhidden: { 2: 0 },
            merge: { "5_2": { r: 5, c: 2, rs: 1, cs: 2 } },
          },
          celldata: [
            {
              r: 5,
              c: 2,
              v: { v: "历史合并", mc: { r: 5, c: 2, rs: 1, cs: 2 } },
            },
            { r: 5, c: 3, v: { mc: { r: 5, c: 2 } } },
          ],
        },
      ],
    })
  );
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const result = await page.evaluate(() => {
    luckysheet.setBothFrozen(true, {
      range: { row_focus: 3, column_focus: 1 },
    });
    luckysheet.setSheetZoom(1.25);
    luckysheet.setCellValue(8, 0, { f: "=1+1", v: 2 });
    luckysheet.setRangeMerge("mergeAll", {
      range: { row: [8, 8], column: [1, 2] },
    });
    const file = luckysheet.getAllSheets()[0];
    return {
      frozen: file.frozen,
      merge: Object.keys(file.config.merge),
      formula: luckysheet.getCellValue(8, 0),
      ids: [
        "luckysheet-sheettable_0",
        "luckysheetrowHeader_0",
        "luckysheet-scrollbar-x",
        "luckysheet-wa-editor",
        "luckysheet-input-box",
      ].every(id => !!document.getElementById(id)),
      classes: document
        .querySelector("#luckysheet-wa-editor")
        .classList.contains("toolbar"),
    };
  });
  expect(result).toEqual({
    frozen: { type: "rangeBoth", range: { row_focus: 3, column_focus: 1 } },
    merge: ["5_2"],
    formula: null,
    ids: true,
    classes: true,
  });
});
