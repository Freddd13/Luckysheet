const { test, expect } = require("@playwright/test");
test("生产 UMD、CJS、ESM 及配套样式", async ({ page }) => {
  test.skip(
    !require("fs").existsSync("dist/luckysheet.esm.js"),
    "生产构建后执行"
  );
  await page.goto("/distribution");
  await page.evaluate(() =>
    luckysheet.create({
      container: "luckysheet",
      safeStrMode: true,
      lang: "zh",
      data: [
        {
          name: "发布测试",
          index: "release",
          status: 1,
          order: 0,
          row: 100,
          column: 30,
          celldata: [],
          config: {},
        },
      ],
    })
  );
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const result = await page.evaluate(async () => {
    luckysheet.setCellValue(2, 1, "001");
    luckysheet.setBothFrozen(true, {
      range: { row_focus: 1, column_focus: 0 },
    });
    const current = luckysheet.getCellValue(2, 1),
      frozen = luckysheet.getAllSheets()[0].frozen;
    const esm = await import("/dist/luckysheet.esm.js");
    const source = await (await fetch("/dist/luckysheet.cjs.js")).text();
    const module = { exports: {} };
    new Function("module", "exports", source)(module, module.exports);
    const hash = (await (await fetch("/dist/build-manifest.json")).json())
      .contentHash;
    return {
      current,
      frozen,
      esm: typeof esm.default.create,
      cjs: typeof module.exports.create,
      hashLength: hash.length,
      metadata: luckysheet.getWorkbookInfo().sheets[0].sheetIndex,
    };
  });
  expect(result).toEqual({
    current: "001",
    frozen: { type: "rangeBoth", range: { row_focus: 1, column_focus: 0 } },
    esm: "function",
    cjs: "function",
    hashLength: 64,
    metadata: "release",
  });
});
