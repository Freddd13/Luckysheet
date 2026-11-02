const { test, expect } = require("@playwright/test");
const browserErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => expect(browserErrors.get(page)).toEqual([]));
async function create(page, extra = {}) {
  await page.goto("/");
  await page.evaluate(extra => {
    window.events = [];
    luckysheet.create({
      container: "luckysheet",
      lang: "zh",
      showinfobar: false,
      safeStrMode: true,
      showstatisticBar: false,
      defaultRowHeight: 26,
      defaultColWidth: 86,
      defaultFontSize: 11,
      data: [
        {
          name: "业务表",
          index: "main",
          order: 0,
          status: 1,
          row: 200,
          column: 30,
          celldata: [{ r: 0, c: 0, v: { v: "旧值", ct: { fa: "@", t: "s" } } }],
          config: {},
        },
      ],
      hook: { sheetDataChanged: e => events.push(e) },
      ...extra,
    });
  }, extra);
  await page.waitForFunction(
    () =>
      document.querySelector("#luckysheetTableContent") &&
      luckysheet.getCellValue(0, 0) === "旧值"
  );
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
}
test("纯文本 API、范围写入、撤销及编辑提交", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(async () => {
    const values = [
      "001",
      "TRUE",
      "12%",
      "=1+2",
      "'abc",
      "甲\n乙",
      "900719925474099312345",
      "",
    ];
    luckysheet.setRangeValue(
      values.map(v => [v]),
      { range: { row: [1, values.length], column: [0, 0] } }
    );
    const read = values.map((_, i) => luckysheet.getCellValue(i + 1, 0));
    luckysheet.undo();
    const undone = luckysheet.getCellValue(1, 0);
    luckysheet.redo();
    const redone = luckysheet.getCellValue(1, 0);
    testInternals.formula.updatecell(0, 0, "=2+3");
    return { read, undone, redone, edit: luckysheet.getCellValue(0, 0) };
  });
  expect(result.read).toEqual([
    "001",
    "TRUE",
    "12%",
    "=1+2",
    "'abc",
    "甲\n乙",
    "900719925474099312345",
    "",
  ]);
  expect(result.undone).toBeNull();
  expect(result.redone).toBe("001");
  expect(result.edit).toBe("=2+3");
});
test("文本粘贴保留短行、多行及复制的两个 MIME", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(() => {
    luckysheet.setRangeShow({ row: [1, 1], column: [0, 0] });
    testInternals.selection.pasteHandler('"甲\n乙"\t001\t\r\nx\tTRUE');
    const values = luckysheet
      .getRangeValue({ range: { row: [1, 2], column: [0, 2] } })
      .map(row => row.map(cell => cell?.v));
    luckysheet.setRangeShow({ row: [1, 2], column: [0, 2] });
    const clip = {};
    testInternals.selection.copy({
      originalEvent: {
        clipboardData: { setData: (type, text) => (clip[type] = text) },
      },
    });
    return { values, clip };
  });
  expect(result.values).toEqual([
    ["甲\n乙", "001", ""],
    ["x", "TRUE", ""],
  ]);
  expect(result.clip["text/plain"]).toContain('"甲\n乙"');
  expect(result.clip["text/html"]).toContain("<table");
});
module.exports.create = create;

test("冻结包含指定行列、单轴保留另一轴、索引零与重载", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(() => {
    luckysheet.setHorizontalFrozen(true, {
      range: { row_focus: 2, column_focus: 0 },
    });
    luckysheet.setVerticalFrozen(true, {
      range: { row_focus: 0, column_focus: 1 },
    });
    const before = {
      row: testInternals.freezen.freezenhorizontaldata[1],
      column: testInternals.freezen.freezenverticaldata[1],
    };
    const saved = luckysheet.getAllSheets();
    luckysheet.cancelHorizontalFrozen();
    const after = {
      row: testInternals.freezen.freezenhorizontaldata,
      column: testInternals.freezen.freezenverticaldata[1],
    };
    window.frozenReloadData = saved;
    return { before, after };
  });
  await page.evaluate(() =>
    luckysheet.create({
      container: "luckysheet",
      lang: "zh",
      safeStrMode: true,
      data: window.frozenReloadData,
    })
  );
  await page.waitForFunction(
    () =>
      testInternals.freezen.freezenhorizontaldata &&
      testInternals.freezen.freezenverticaldata
  );
  const reloaded = await page.evaluate(() => ({
    row: testInternals.freezen.freezenhorizontaldata[1],
    column: testInternals.freezen.freezenverticaldata[1],
  }));
  expect({ ...result, reloaded }).toEqual({
    before: { row: 3, column: 2 },
    after: { row: null, column: 2 },
    reloaded: { row: 3, column: 2 },
  });
});
test("填充四方向、切换模式只占一次撤销", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(async () => {
    luckysheet.setRangeValue([["车次009"], ["车次010"]], {
      range: { row: [2, 3], column: [0, 0] },
    });
    const drop = testInternals.dropCell;
    const before = testInternals.Store.jfredo.length;
    drop.copyRange = { row: [2, 3], column: [0, 0] };
    drop.applyRange = { row: [4, 6], column: [0, 0] };
    drop.direction = "down";
    drop.applyType = "auto";
    await drop.update();
    const sequence = [4, 5, 6].map(r => luckysheet.getCellValue(r, 0));
    drop.applyType = "0";
    await drop.update();
    const copied = [4, 5, 6].map(r => luckysheet.getCellValue(r, 0));
    const after = testInternals.Store.jfredo.length;
    luckysheet.undo();
    return {
      sequence,
      copied,
      delta: after - before,
      undone: luckysheet.getCellValue(4, 0),
    };
  });
  expect(result).toEqual({
    sequence: ["车次011", "车次012", "车次013"],
    copied: ["车次009", "车次010", "车次009"],
    delta: 1,
    undone: null,
  });
});
test("区域强调无数据污染、提交后通知一次、旧异步结果被拒绝", async ({
  page,
}) => {
  await create(page);
  const result = await page.evaluate(() => {
    const initial = JSON.stringify(luckysheet.getAllSheets());
    const items = [
      {
        id: "A",
        range: { row: [2, 8] },
        label: "构型A",
        style: {
          fill: "#ecf5ff",
          boundary: "#409eff",
          headerMarker: "#409eff",
        },
      },
    ];
    luckysheet.setViewDecorations(items);
    const unchanged = JSON.stringify(luckysheet.getAllSheets()) === initial;
    const snapshot = luckysheet.getViewDecorations();
    snapshot[0].range.row[0] = 99;
    const isolated = luckysheet.getViewDecorations()[0].range.row[0] === 2;
    luckysheet.setRangeValue([["001"], ["002"]], {
      range: { row: [2, 3], column: [0, 0] },
    });
    const count = events.length,
      event = events[events.length - 1];
    const empty = luckysheet.getViewDecorations().length === 0;
    const stale = luckysheet.setViewDecorations(items, {
      revision: event.revision - 1,
    });
    const fresh = luckysheet.setViewDecorations(items, {
      revision: event.revision,
    });
    return {
      unchanged,
      isolated,
      count,
      empty,
      stale,
      fresh,
      value: luckysheet.getCellValue(2, 0),
      polluted: JSON.stringify(luckysheet.toJson()).includes("viewDecorations"),
    };
  });
  expect(result).toEqual({
    unchanged: true,
    isolated: true,
    count: 1,
    empty: true,
    stale: false,
    fresh: true,
    value: "001",
    polluted: false,
  });
});
test("整批拦截不留部分写入，保护已有历史数值", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(() => {
    testInternals.config.hook.cellUpdateBefore = (r, c) => r !== 3;
    luckysheet.setRangeValue([["A"], ["B"]], {
      range: { row: [2, 3], column: [0, 0] },
    });
    return [luckysheet.getCellValue(2, 0), luckysheet.getCellValue(3, 0)];
  });
  expect(result).toEqual([null, null]);
});

test("冻结菜单与 API 采用相同边界并保留另一轴", async ({ page }) => {
  await create(page, { showtoolbarConfig: ["frozenMode"] });
  await page.evaluate(() => {
    luckysheet.setVerticalFrozen(true, { range: { column_focus: 1 } });
    luckysheet.setRangeShow({ row: [2, 2], column: [0, 0] });
  });
  await page.locator("#luckysheet-icon-freezen-menu").click();
  await page
    .locator(
      '#luckysheet-icon-freezen-menu-menuButton [itemvalue="freezenRowRange"]'
    )
    .click();
  expect(
    await page.evaluate(() => ({
      row: testInternals.freezen.freezenhorizontaldata[1],
      column: testInternals.freezen.freezenverticaldata[1],
    }))
  ).toEqual({ row: 3, column: 2 });
  await page.locator("#luckysheet-icon-freezen-menu").click();
  await page
    .locator(
      '#luckysheet-icon-freezen-menu-menuButton [itemvalue="freezenCancelRow"]'
    )
    .click();
  expect(
    await page.evaluate(() => ({
      row: testInternals.freezen.freezenhorizontaldata,
      column: testInternals.freezen.freezenverticaldata[1],
    }))
  ).toEqual({ row: null, column: 2 });
});

test("大范围操作取消后保持原数据", async ({ page }) => {
  await create(page, {
    data: [
      {
        name: "业务表",
        index: "main",
        status: 1,
        order: 0,
        row: 3000,
        column: 100,
        celldata: [{ r: 0, c: 0, v: { v: "旧值", ct: { fa: "@", t: "s" } } }],
        config: {},
      },
    ],
  });
  const result = await page.evaluate(async () => {
    const pending = luckysheet.setRangeValue(
      Array.from({ length: 2000 }, () => Array(100).fill("批量新值")),
      { range: { row: [20, 2019], column: [0, 99] } }
    );
    document.querySelector(".luckysheet-operation-progress button").click();
    return {
      committed: await pending,
      first: luckysheet.getCellValue(20, 0),
      last: luckysheet.getCellValue(2019, 99),
    };
  });
  expect(result).toEqual({ committed: false, first: null, last: null });
});

test("HTML 粘贴保留 11pt、颜色和换行，合并来源明确展开", async ({ page }) => {
  await create(page);
  await page.evaluate(() => {
    luckysheet.setRangeShow({ row: [2, 2], column: [0, 0] });
    testInternals.selection.isPasteAction = true;
    const html =
      '<table><tr><td style="font-family:Arial;font-size:11pt;background-color:#ddeeff;color:#112233">001<br>甲</td><td>TRUE</td></tr></table>';
    const event = $.Event("paste");
    event.originalEvent = {
      clipboardData: {
        getData: type => (type === "text/html" ? html : "001\n甲\tTRUE"),
        files: [],
      },
      preventDefault() {},
      stopPropagation() {},
    };
    $("#luckysheet-rich-text-editor").trigger(event);
  });
  const values = await page.evaluate(
    () =>
      luckysheet.getRangeValue({ range: { row: [2, 2], column: [0, 1] } })[0]
  );
  expect(values[0].v).toBe("001\n甲");
  expect(values[0].fs).toBe(11);
  expect(values[0].ff).toBe("Arial");
  expect(values[0].bg).toBe("rgb(221, 238, 255)");
  expect(values[1].v).toBe("TRUE");
  page.once("dialog", dialog => dialog.accept());
  await page.evaluate(() => {
    luckysheet.setRangeShow({ row: [4, 4], column: [0, 0] });
    testInternals.selection.pasteHandler(
      [
        [{ v: "构型", mc: { r: 0, c: 0, rs: 2, cs: 1 } }],
        [{ mc: { r: 0, c: 0 } }],
      ],
      {}
    );
  });
  expect(
    await page.evaluate(() =>
      luckysheet
        .getRangeValue({ range: { row: [4, 5], column: [0, 0] } })
        .map(row => row[0])
    )
  ).toEqual([
    { v: "构型", m: "构型", ct: { fa: "@", t: "s" } },
    { v: "", m: "", ct: { fa: "@", t: "s" } },
  ]);
});

test("稀疏替换只写匹配格并统一通知；历史类型原样保留", async ({ page }) => {
  await create(page, {
    data: [
      {
        name: "业务表",
        index: "main",
        status: 1,
        order: 0,
        row: 200,
        column: 30,
        config: {},
        celldata: [
          { r: 0, c: 0, v: { v: "旧值", ct: { fa: "@", t: "s" } } },
          { r: 2, c: 0, v: { v: "目标" } },
          { r: 9, c: 2, v: { v: "目标" } },
          { r: 5, c: 1, v: { v: 0.12, m: "12%", ct: { fa: "0%", t: "n" } } },
        ],
      },
    ],
  });
  const result = await page.evaluate(() => {
    const old = luckysheet.getCellValue(5, 1);
    luckysheet.replace("目标", "001", { isWholeWord: true });
    const changed = [
        luckysheet.getCellValue(2, 0),
        luckysheet.getCellValue(9, 2),
      ],
      count = events.length;
    const untouched = luckysheet.getCellValue(5, 1);
    luckysheet.undo();
    return {
      old,
      untouched,
      changed,
      count,
      undone: luckysheet.getCellValue(2, 0),
    };
  });
  expect(result).toEqual({
    old: 0.12,
    untouched: 0.12,
    changed: ["001", "001"],
    count: 1,
    undone: "目标",
  });
});

test("内部复制识别转义、空白与换行，剪切按一次性移动", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(() => {
    luckysheet.setCellValue(2, 0, "  <A>&\n001  ");
    luckysheet.setRangeShow({ row: [2, 2], column: [0, 0] });
    const clip = {};
    testInternals.selection.copy({
      originalEvent: {
        clipboardData: { setData: (key, value) => (clip[key] = value) },
      },
    });
    luckysheet.setRangeShow({ row: [4, 4], column: [0, 0] });
    testInternals.Store.luckysheet_paste_iscut = true;
    testInternals.selection.isPasteAction = true;
    const event = $.Event("paste");
    event.originalEvent = {
      clipboardData: {
        getData: key => clip[key] || "",
        setData() {},
        files: [],
      },
      preventDefault() {},
      stopPropagation() {},
    };
    $("#luckysheet-rich-text-editor").trigger(event);
    const moved = {
      source: luckysheet.getCellValue(2, 0),
      target: luckysheet.getCellValue(4, 0),
      cut: testInternals.Store.luckysheet_paste_iscut,
    };
    luckysheet.undo();
    return {
      moved,
      restored: luckysheet.getCellValue(2, 0),
      target: luckysheet.getCellValue(4, 0),
    };
  });
  expect(result).toEqual({
    moved: { source: null, target: "  <A>&\n001  ", cut: false },
    restored: "  <A>&\n001  ",
    target: null,
  });
});

test("插入行后的冻结边界能保存重载", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(() => {
    luckysheet.setBothFrozen(true, {
      range: { row_focus: 2, column_focus: 1 },
    });
    luckysheet.insertRow(0, { number: 1 });
    return {
      row: testInternals.freezen.freezenhorizontaldata[1],
      saved: luckysheet.getAllSheets()[0].frozen,
    };
  });
  expect(result.row).toBe(4);
  expect(result.saved.range).toEqual({ row_focus: 3, column_focus: 1 });
});

test("文字测量缓存、字体恢复与编辑失效", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(() => {
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    ctx.font = "12px Arial";
    const first = measureTextForTest("abc", ctx, "16px Arial"),
      restored = ctx.font;
    const second = measureTextForTest("abc", ctx, "16px Arial");
    const oldZoom = testInternals.Store.zoomRatio;
    testInternals.Store.zoomRatio = 2;
    const doubled = measureTextForTest("abc", ctx, "16px Arial");
    testInternals.Store.zoomRatio = oldZoom;
    testInternals.Store.measureTextCellInfoCache["0_0"] = { content: "OLD" };
    luckysheet.setCellValue(0, 0, "NEW");
    const invalidated =
      testInternals.Store.measureTextCellInfoCache["0_0"] === undefined;
    luckysheet.luckysheetrefreshgrid();
    return {
      hit: first === second,
      restored,
      double: doubled.width / first.width,
      updated: invalidated && luckysheet.getCellValue(0, 0) === "NEW",
    };
  });
  expect(result).toEqual({
    hit: true,
    restored: "12px Arial",
    double: 2,
    updated: true,
  });
});

test("区域底色、冻结分区与悬浮标签视觉检查", async ({ page }) => {
  await create(page, {
    showtoolbarConfig: [
      "undo",
      "redo",
      "font",
      "fontSize",
      "textColor",
      "fillColor",
      "frozenMode",
    ],
  });
  await page.evaluate(() => {
    luckysheet.setCellValue(4, 2, { v: "原底色", bg: "#ffe6cc" });
    luckysheet.setBothFrozen(true, {
      range: { row_focus: 1, column_focus: 0 },
    });
    luckysheet.setViewDecorations([
      {
        id: "configuration-a",
        range: { row: [2, 7] },
        label: "构型 A",
        style: {
          fill: "#ecf5ff",
          boundary: "#409eff",
          headerMarker: "#409eff",
        },
      },
    ]);
  });
  const position = await page.evaluate(() => {
    const s = testInternals.Store,
      rect = document
        .getElementById("luckysheetTableContent")
        .getBoundingClientRect();
    return {
      x: rect.left + s.rowHeaderWidth + s.visibledatacolumn[1] + 8,
      y: rect.top + s.columnHeaderHeight + s.visibledatarow[3] + 5,
    };
  });
  await page.mouse.move(position.x, position.y);
  await expect(page.locator(".luckysheet-decoration-label")).toHaveText(
    "构型 A"
  );
  const colors = await page.evaluate(() => {
    const s = testInternals.Store,
      canvas = document.getElementById("luckysheetTableContent"),
      ctx = canvas.getContext("2d");
    function pixel(r, c) {
      const x =
          (s.rowHeaderWidth + s.visibledatacolumn[c] - 8) * s.devicePixelRatio,
        y =
          (s.columnHeaderHeight + s.visibledatarow[r] - 8) * s.devicePixelRatio;
      return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    }
    return [pixel(4, 3), pixel(4, 2)];
  });
  expect(colors).toEqual([
    [236, 245, 255],
    [255, 230, 204],
  ]);
  await page.screenshot({ path: "tmp/region-emphasis.png" });
});

test("历史公式覆盖后撤销恢复公式及计算链", async ({ page }) => {
  await create(page, {
    forceCalculation: false,
    data: [
      {
        name: "业务表",
        index: "main",
        status: 1,
        order: 0,
        row: 200,
        column: 30,
        config: {},
        calcChain: [{ r: 5, c: 1, index: "main" }],
        celldata: [
          { r: 0, c: 0, v: { v: "旧值" } },
          {
            r: 5,
            c: 1,
            v: { v: 3, m: "3", f: "=1+2", ct: { fa: "General", t: "n" } },
          },
        ],
      },
    ],
  });
  const result = await page.evaluate(() => {
    luckysheet.setCellValue(5, 1, "001");
    const removed = luckysheet.getAllSheets()[0].calcChain.length === 0;
    luckysheet.undo();
    const file = luckysheet.getAllSheets()[0];
    return {
      removed,
      formula: file.data[5][1].f,
      chain: file.calcChain.map(({ r, c, index }) => ({ r, c, index })),
    };
  });
  expect(result).toEqual({
    removed: true,
    formula: "=1+2",
    chain: [{ r: 5, c: 1, index: "main" }],
  });
});

test("向上与向左填充保留样式顺序，格式模式和撤销有效", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(async () => {
    const drop = testInternals.dropCell;
    luckysheet.setRangeValue(
      [
        [
          { v: "003", bg: "#ff0000" },
          { v: "004", bg: "#00ff00" },
        ],
      ],
      { range: { row: [5, 5], column: [3, 4] } }
    );
    drop.textFillBase = null;
    drop.copyRange = { row: [5, 5], column: [3, 4] };
    drop.applyRange = { row: [5, 5], column: [1, 2] };
    drop.direction = "left";
    drop.applyType = "auto";
    await drop.update();
    const left = luckysheet
      .getRangeValue({ range: drop.applyRange })[0]
      .map(cell => [cell.v, cell.bg]);
    luckysheet.undo();
    drop.reset();
    luckysheet.setRangeValue(
      [[{ v: "003", bg: "#ff0000" }], [{ v: "004", bg: "#00ff00" }]],
      { range: { row: [5, 6], column: [0, 0] } }
    );
    luckysheet.setRangeValue([["保留甲"], ["保留乙"]], {
      range: { row: [3, 4], column: [0, 0] },
    });
    drop.copyRange = { row: [5, 6], column: [0, 0] };
    drop.applyRange = { row: [3, 4], column: [0, 0] };
    drop.direction = "up";
    drop.applyType = "2";
    await drop.update();
    const formatOnly = luckysheet
      .getRangeValue({ range: drop.applyRange })
      .map(row => [row[0].v, row[0].bg]);
    drop.applyType = "3";
    await drop.update();
    const noFormat = luckysheet
      .getRangeValue({ range: drop.applyRange })
      .map(row => [row[0].v, row[0].bg]);
    luckysheet.undo();
    return {
      left,
      formatOnly,
      noFormat,
      restored: luckysheet.getCellValue(3, 0),
    };
  });
  expect(result).toEqual({
    left: [
      ["001", "#ff0000"],
      ["002", "#00ff00"],
    ],
    formatOnly: [
      ["保留甲", "#ff0000"],
      ["保留乙", "#00ff00"],
    ],
    noFormat: [
      ["001", undefined],
      ["002", undefined],
    ],
    restored: "保留甲",
  });
});

test("跨表复制、插入复制行及隐藏行读取兼容", async ({ page }) => {
  await create(page, {
    data: [
      {
        name: "业务表",
        index: "main",
        status: 1,
        order: 0,
        row: 200,
        column: 30,
        config: {},
        celldata: [
          { r: 0, c: 0, v: { v: "旧值" } },
          { r: 2, c: 0, v: { v: "001" } },
          { r: 3, c: 0, v: { v: "002" } },
        ],
      },
      {
        name: "目标表",
        index: "other",
        status: 0,
        order: 1,
        row: 200,
        column: 30,
        config: {},
        celldata: [],
      },
    ],
  });
  await page.evaluate(() => {
    luckysheet.setRangeShow({ row: [2, 3], column: [0, 0] });
    testInternals.selection.copy({
      originalEvent: { clipboardData: { setData() {} } },
    });
    luckysheet.setSheetActive(1);
  });
  await page.waitForFunction(
    () => luckysheet.getWorkbookInfo().activeSheetIndex === "other"
  );
  const copied = await page.evaluate(() => {
    luckysheet.setRangeShow({ row: [4, 4], column: [0, 0] });
    testInternals.selection.pasteHandlerOfCopyPaste(
      testInternals.Store.luckysheet_copy_save
    );
    return [luckysheet.getCellValue(4, 0), luckysheet.getCellValue(5, 0)];
  });
  expect(copied).toEqual(["001", "002"]);
  await page.evaluate(() => luckysheet.setSheetActive(0));
  await page.waitForFunction(
    () => luckysheet.getWorkbookInfo().activeSheetIndex === "main"
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { read: () => Promise.reject(new Error("测试内部复制回退")) },
      configurable: true,
    });
    const s = testInternals.Store;
    luckysheet.setRangeShow({ row: [2, 2], column: [0, 29] });
    testInternals.selection.copy({
      originalEvent: { clipboardData: { setData() {} } },
    });
    luckysheet.setRangeShow({ row: [1, 1], column: [0, 29] });
    s.luckysheetRightHeadClickIs = "row";
    $("#luckysheet-insert-copied-row-above").trigger("click");
  });
  await page.waitForFunction(() => luckysheet.getCellValue(1, 0) === "001");
  const inserted = await page.evaluate(() => {
    const value = luckysheet.getCellValue(1, 0),
      source = luckysheet.getCellValue(3, 0);
    testInternals.Store.config.rowhidden = { 2: 0 };
    const subset = luckysheet.getRangeValue({
      range: { row: [1, 3], column: [0, 0] },
    });
    subset[0][0].v = "副本";
    return {
      value,
      source,
      rows: subset.length,
      isolated: luckysheet.getCellValue(1, 0) === "001",
    };
  });
  expect(inserted).toEqual({
    value: "001",
    source: "001",
    rows: 2,
    isolated: true,
  });
});

test("只读阻止写入和填充，长整数排序通知一次", async ({ page }) => {
  await create(page);
  const result = await page.evaluate(async () => {
    luckysheet.setRangeValue(
      [["9007199254740994"], ["9007199254740993"], ["0002"]],
      { range: { row: [2, 4], column: [0, 0] } }
    );
    events.length = 0;
    luckysheet.setRangeSortMulti(false, [{ i: 0, sort: "asc" }], {
      range: { row: [2, 4], column: [0, 0] },
    });
    const sorted = [2, 3, 4].map(r => luckysheet.getCellValue(r, 0)),
      count = events.length;
    testInternals.Store.allowEdit = false;
    const write = luckysheet.setCellValue(2, 0, "危险");
    const drop = testInternals.dropCell;
    drop.copyRange = { row: [2, 2], column: [0, 0] };
    drop.applyRange = { row: [5, 5], column: [0, 0] };
    drop.direction = "down";
    drop.applyType = "1";
    const fill = await drop.update();
    return {
      sorted,
      count,
      write,
      fill,
      value: luckysheet.getCellValue(2, 0),
      empty: luckysheet.getCellValue(5, 0),
    };
  });
  expect(result).toEqual({
    sorted: ["0002", "9007199254740993", "9007199254740994"],
    count: 1,
    write: false,
    fill: false,
    value: "0002",
    empty: null,
  });
});

test("色板可选主题色、Esc 关闭并恢复焦点，反复销毁不累积", async ({ page }) => {
  await create(page, {
    showtoolbarConfig: ["font", "fontSize", "textColor", "fillColor", "border"],
  });
  await page.locator("#luckysheet-icon-cell-color-menu").click();
  const panel = page.locator("#luckysheet-icon-cell-color-menu-menuButton");
  await expect(panel).toBeVisible();
  await expect(
    panel.locator(".sp-palette-row").first().locator(".sp-thumb-el")
  ).toHaveCount(10);
  await page.screenshot({ path: "tmp/office-palette.png" });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  const result = await page.evaluate(async () => {
    function owned() {
      const events = $._data(window, "events") || {};
      return Object.values(events)
        .flat()
        .filter(event => event.namespace.includes("luckysheetEvent")).length;
    }
    const before = owned(),
      options = {
        container: "luckysheet",
        safeStrMode: true,
        lang: "zh",
        data: [
          {
            name: "重建",
            index: "recreated",
            status: 1,
            order: 0,
            row: 200,
            column: 30,
            config: {},
            celldata: [],
          },
        ],
      };
    for (let i = 0; i < 3; i++) {
      luckysheet.destroy();
      luckysheet.create(options);
      await new Promise(resolve => setTimeout(resolve, 550));
    }
    const after = owned();
    luckysheet.destroy();
    return {
      before,
      after,
      menus: document.querySelectorAll("body > .luckysheet-cols-menu").length,
      worker: testInternals.editor.deepCopyFlowDataWorker,
      clickHandler: testInternals.Store.textModeClickHandler,
    };
  });
  expect(result.after).toBe(result.before);
  expect(result.menus).toBe(0);
  expect(result.worker).toBeNull();
  expect(result.clickHandler).toBeNull();
});
