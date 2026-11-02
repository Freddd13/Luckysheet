const { test, expect } = require("@playwright/test");
const fs = require("fs");
test.use({ trace: "off" });
test("固定规模性能对照", async ({ browser }) => {
  test.skip(process.env.LUCKYSHEET_PERF !== "1", "按需运行完整性能对照");
  test.setTimeout(240000);
  const reports = [];
  for (const baseline of [true, false])
    for (const [rows, cols, dense] of [
      [1000, 50, false],
      [1000, 50, true],
      [10000, 100, false],
      [10000, 100, true],
    ]) {
      const context = await browser.newContext({
          viewport: { width: 1366, height: 900 },
        }),
        page = await context.newPage();
      await page.goto(baseline ? "/baseline" : "/");
      const report = await page.evaluate(
        async ({ rows, cols, dense, baseline }) => {
          const frame = () =>
            new Promise(resolve => requestAnimationFrame(resolve));
          const percentile = values =>
            values.slice().sort((a, b) => a - b)[
              Math.ceil(values.length * 0.95) - 1
            ];
          const fixtureStart = performance.now();
          const data = Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) =>
              dense || (r % 20 === 0 && c % 5 === 0)
                ? { v: String(r) + "-" + c, ct: { fa: "@", t: "s" } }
                : null
            )
          );
          const fixtureBuildMs = performance.now() - fixtureStart;
          await frame();
          const longTasks = [];
          const observer = new PerformanceObserver(list =>
            list.getEntries().forEach(entry =>
              longTasks.push({
                startMs: entry.startTime,
                durationMs: entry.duration,
              })
            )
          );
          observer.observe({ type: "longtask", buffered: false });
          const loadStart = performance.now();
          luckysheet.create({
            container: "luckysheet",
            lang: "zh",
            safeStrMode: true,
            showinfobar: false,
            showstatisticBar: false,
            defaultFontSize: 11,
            data: [
              {
                name: "性能表",
                index: "perf",
                status: 1,
                order: 0,
                row: rows,
                column: cols,
                data,
                config: {},
              },
            ],
          });
          await frame();
          await frame();
          const loadMs = performance.now() - loadStart;
          while (
            document.querySelector(".luckysheet-loading-mask") &&
            getComputedStyle(document.querySelector(".luckysheet-loading-mask"))
              .display !== "none"
          )
            await frame();
          const readyMs = performance.now() - loadStart;
          luckysheet.setBothFrozen(true, {
            range: { row_focus: 2, column_focus: 1 },
          });
          await frame();
          await frame();
          let frameDecorationCost = 0,
            overlayCosts = [],
            measureOverlay = false;
          async function paint() {
            const values = [];
            for (let i = 0; i < 40; i++) {
              await frame();
              frameDecorationCost = 0;
              const t = performance.now();
              luckysheet.luckysheetrefreshgrid((i % 5) * 40, i * 100);
              values.push(performance.now() - t);
              if (measureOverlay) overlayCosts.push(frameDecorationCost);
            }
            return values;
          }
          await paint();
          const paints = await paint();
          let decorationMs = null,
            decoratedPaintP95 = null,
            controlPaintP95 = null;
          if (!baseline) {
            const items = Array.from({ length: 1000 }, (_, i) => ({
              id: "region-" + i,
              range: { row: [i * 10, i * 10 + 9] },
              label: "构型 " + i,
              style: {
                fill: "#ecf5ff",
                boundary: "#409eff",
                headerMarker: "#409eff",
              },
            }));
            luckysheet.setViewDecorations(items);
            const overlay = testInternals.viewDecorations,
              originals = {};
            for (const name of ["beginFrame", "fill", "marker", "boundaries"]) {
              const original = overlay[name];
              originals[name] = original;
              overlay[name] = function (...args) {
                const start = performance.now();
                try {
                  return original.apply(this, args);
                } finally {
                  frameDecorationCost += performance.now() - start;
                }
              };
            }
            await paint();
            overlayCosts = [];
            measureOverlay = true;
            const decorated = await paint();
            measureOverlay = false;
            decorationMs = percentile(overlayCosts);
            Object.assign(overlay, originals);
            decoratedPaintP95 = percentile(decorated);
            luckysheet.clearViewDecorations();
            controlPaintP95 = percentile(await paint());
          }
          const edits = [],
            selections = [];
          for (let i = 0; i < 20; i++) {
            const t = performance.now();
            luckysheet.setRangeShow({ row: [10 + i, 10 + i], column: [3, 3] });
            selections.push(performance.now() - t);
            await frame();
          }
          for (let i = 0; i < (baseline ? 3 : 20); i++) {
            const t = performance.now();
            luckysheet.setCellValue(10 + i, 5, "测试" + i);
            edits.push(performance.now() - t);
            await frame();
          }
          let batchMs = null;
          if (!baseline) {
            const values = Array.from({ length: 1000 }, (_, r) =>
              Array.from({ length: Math.min(cols, 100) }, (_, c) =>
                String(r * 100 + c)
              )
            );
            const t = performance.now();
            await luckysheet.setRangeValue(values, {
              range: { row: [100, 1099], column: [0, Math.min(cols, 100) - 1] },
            });
            batchMs = performance.now() - t;
          }
          await frame();
          observer.disconnect();
          const result = {
            baseline,
            rows,
            cols,
            dense,
            fixtureBuildMs,
            loadMs,
            readyMs,
            paintP95: percentile(paints),
            decoratedPaintP95,
            controlPaintP95,
            editP95: percentile(edits),
            selectionP95: percentile(selections),
            decorationMs,
            decorationMeasurement: "每帧区域强调绘制函数累计时间，包含测量开销",
            batchMs,
            longTasks,
          };
          luckysheet.destroy();
          return result;
        },
        { rows, cols, dense, baseline }
      );
      const cdp = await context.newCDPSession(page);
      await cdp.send("HeapProfiler.collectGarbage");
      report.browser = browser.version();
      report.platform = process.platform;
      report.heapAfterDestroyBytes = (
        await cdp.send("Runtime.getHeapUsage")
      ).usedSize;
      reports.push(report);
      await context.close();
    }
  fs.writeFileSync(
    "tmp/performance-results.json",
    JSON.stringify(reports, null, 2)
  );
  console.log(JSON.stringify(reports, null, 2));
  for (const report of reports.filter(r => !r.baseline)) {
    expect(report.editP95).toBeLessThanOrEqual(50);
    expect(report.paintP95).toBeLessThanOrEqual(20);
    expect(report.selectionP95).toBeLessThanOrEqual(50);
    expect(report.decorationMs).toBeLessThanOrEqual(2);
  }
});
