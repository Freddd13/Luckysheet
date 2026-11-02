const { test, expect } = require("@playwright/test");
test("销毁后不执行旧实例通知，立即重建或卸载保持安全", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => {
    window.lateUpdates = 0;
    window.reusedOptions = {
      container: "luckysheet",
      safeStrMode: true,
      lang: "zh",
      forceCalculation: false,
      hook: { cellUpdated: () => lateUpdates++ },
      data: [
        {
          name: "生命周期",
          index: "main",
          status: 1,
          order: 0,
          row: 100,
          column: 30,
          config: {},
          calcChain: [{ r: 3, c: 0, index: "main" }],
          celldata: [
            {
              r: 3,
              c: 0,
              v: { v: 3, m: "3", f: "=1+2", ct: { fa: "General", t: "n" } },
            },
          ],
        },
      ],
    };
    luckysheet.create(reusedOptions);
  });
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  const formula = await page.evaluate(() => {
    testInternals.formula.updatecell(3, 0, "001");
    luckysheet.undo();
    const file = luckysheet.getAllSheets()[0],
      restored = { f: file.data[3][0].f, chain: file.calcChain.length };
    luckysheet.setCellValue(0, 0, "001");
    luckysheet.destroy();
    luckysheet.create(reusedOptions);
    return restored;
  });
  await page.waitForTimeout(30);
  const afterRecreate = await page.evaluate(() => lateUpdates);
  await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
  await page.evaluate(() => {
    luckysheet.setBothFrozen(true, {
      range: { row_focus: 1, column_focus: 0 },
    });
    luckysheet.setSheetZoom(1.25);
    luckysheet.setCellValue(0, 0, "002");
    luckysheet.destroy();
  });
  await page.waitForTimeout(550);
  await page.evaluate(() => {
    luckysheet.create(reusedOptions);
    luckysheet.destroy();
  });
  await page.waitForTimeout(550);
  const loadingRequest = page.waitForRequest("**/slow-workbook");
  await page.evaluate(() =>
    luckysheet.create({ ...reusedOptions, loadUrl: "/slow-workbook" })
  );
  await loadingRequest;
  const aborted = page.waitForEvent("requestfailed", request =>
    request.url().endsWith("/slow-workbook")
  );
  await page.evaluate(() => luckysheet.destroy());
  expect((await aborted).failure().errorText).toContain("ABORTED");
  expect(formula).toEqual({ f: "=1+2", chain: 1 });
  expect(afterRecreate).toBe(0);
  expect(await page.evaluate(() => lateUpdates)).toBe(0);
  expect(errors).toEqual([]);
  expect(await page.locator(".luckysheet-loading-mask").count()).toBe(0);
});
