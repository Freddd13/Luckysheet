import Store from "../store";
import editor from "../global/editor";
import { jfrefreshgrid } from "../global/refresh";
import { fillGenerator } from "../utils/fillSeries";
import { cellText } from "../utils/textCell";
import { checkProtectionLockedRangeList } from "./protection";
import { getBorderInfoCompute } from "../global/border";
import tooltip from "../global/tooltip";
import { getSheetIndex } from "../methods/get";
import dataVerificationCtrl from "./dataVerificationCtrl";
import { textCell } from "../utils/textCell";
import conditionformat from "./conditionformat";
import viewDecorations from "./viewDecorations";

export async function updateTextFill(drop) {
  if (drop.isFilling) return false;
  const range = drop.applyRange,
    copy = drop.copyRange;
  if (
    Store.allowEdit === false ||
    !checkProtectionLockedRangeList([range], Store.currentSheetIndex)
  )
    return false;
  const top = Store.jfredo[Store.jfredo.length - 1];
  const file = Store.luckysheetfile[getSheetIndex(Store.currentSheetIndex)];
  const dataRevision = viewDecorations.getRevision(file.index),
    activeConfig = Store.config;
  if (
    drop.textFillBase &&
    (drop.textFillBase.history !== top ||
      drop.textFillBase.valid === false ||
      (drop.textFillBase.revision != null &&
        drop.textFillBase.revision !== dataRevision))
  ) {
    tooltip.info("表格已变化，请重新拖拽填充。", "");
    return false;
  }
  if (!drop.textFillBase)
    drop.textFillBase = {
      data: Store.flowdata,
      config: Store.config,
      history: null,
      cdformat: file.luckysheet_conditionformat_save,
      dataVerification: file.dataVerification,
      calc: file.calcChain,
      dynamicArray: file.dynamicArray,
    };
  const snapshot = drop.textFillBase;
  const active = Store.flowdata;
  const data = snapshot.data.slice();
  for (let r = range.row[0]; r <= range.row[1]; r++)
    data[r] = (data[r] || []).slice();
  const cfg = $.extend(true, {}, snapshot.config),
    borders = getBorderInfoCompute();
  const dataVerification = $.extend(true, {}, snapshot.dataVerification);
  const cdformat = $.extend(true, [], snapshot.cdformat);
  const overwritten = new Set();
  const vertical = drop.direction === "down" || drop.direction === "up";
  const backwards = drop.direction === "up" || drop.direction === "left";
  const laneCount = vertical
    ? range.column[1] - range.column[0] + 1
    : range.row[1] - range.row[0] + 1;
  const length = vertical
    ? range.row[1] - range.row[0] + 1
    : range.column[1] - range.column[0] + 1;
  const generators = Array.from({ length: laneCount }, (_, lane) => {
    const cells = [];
    for (
      let n = vertical ? copy.row[0] : copy.column[0];
      n <= (vertical ? copy.row[1] : copy.column[1]);
      n++
    )
      cells.push(
        vertical
          ? snapshot.data[n][copy.column[0] + lane]
          : snapshot.data[copy.row[0] + lane][n]
      );
    const generate = fillGenerator(cells, drop.direction, drop.applyType);
    if (
      drop.applyType === "8" &&
      cells.every(cell =>
        /^[零一二三四五六七八九十百千万亿]+$/.test(cellText(cell))
      )
    ) {
      const numbers = cells.map(cell => drop.ChineseToNumber(cellText(cell)));
      const step = numbers.length > 1 ? numbers[1] - numbers[0] : 1;
      if (
        numbers.every(
          (number, i) =>
            Number.isSafeInteger(number) && number === numbers[0] + step * i
        )
      )
        return i => {
          const cell = generate(i),
            value =
              numbers[backwards ? 0 : numbers.length - 1] +
              step * i * (backwards ? -1 : 1);
          if (Number.isSafeInteger(value) && value >= 0) {
            cell.v = drop.NumberToChinese(value);
            cell.m = cell.v;
          }
          return cell;
        };
    }
    return generate;
  });
  let progress = null,
    cancelled = false,
    processed = 0,
    sliceStart = performance.now();
  drop.cancelTextFill = () => {
    cancelled = true;
  };
  drop.isFilling = true;
  if (length * laneCount > 10000) {
    progress = $(
      "<div class='luckysheet-operation-progress'>正在计算填充… <button type='button'>取消</button></div>"
    ).appendTo("#" + Store.container);
    progress.find("button").on("click", () => {
      cancelled = true;
    });
  }
  try {
    for (let i = 0; i < length; i++)
      for (let lane = 0; lane < laneCount; lane++) {
        const r = vertical
          ? backwards
            ? range.row[1] - i
            : range.row[0] + i
          : range.row[0] + lane;
        const c = vertical
          ? range.column[0] + lane
          : backwards
          ? range.column[1] - i
          : range.column[0] + i;
        const generated = generators[lane](i + 1),
          old = data[r][c];
        if (old && old.mc) {
          tooltip.info("请先选择未合并的普通单元格进行填充。", "");
          return false;
        }
        if (drop.applyType !== "2") overwritten.add(r + "_" + c);
        if (drop.applyType === "2") {
          const style = { ...generated };
          for (const key of ["v", "m", "ct", "f", "spl", "qp", "mc"])
            delete style[key];
          data[r][c] = {
            ...(old && typeof old === "object" ? old : { v: old }),
            ...style,
          };
        } else if (drop.applyType === "3")
          data[r][c] = textCell({
            ...(old && typeof old === "object" ? old : {}),
            v: generated.v,
            m: generated.m,
            ct: generated.ct,
          });
        else data[r][c] = generated;
        const dv = file.dataVerification && file.dataVerification[r + "_" + c];
        if (
          dv &&
          dv.prohibitInput &&
          !dataVerificationCtrl.validateCellData(cellText(data[r][c]), dv)
        ) {
          tooltip.info(dataVerificationCtrl.getFailureText(dv), "");
          return false;
        }
        if (drop.applyType !== "3") {
          const sourceR = vertical
            ? backwards
              ? copy.row[1] - (i % (copy.row[1] - copy.row[0] + 1))
              : copy.row[0] + (i % (copy.row[1] - copy.row[0] + 1))
            : copy.row[0] + lane;
          const sourceC = vertical
            ? copy.column[0] + lane
            : backwards
            ? copy.column[1] - (i % (copy.column[1] - copy.column[0] + 1))
            : copy.column[0] + (i % (copy.column[1] - copy.column[0] + 1));
          const sourceRule =
            snapshot.dataVerification &&
            snapshot.dataVerification[sourceR + "_" + sourceC];
          if (sourceRule)
            dataVerification[r + "_" + c] = $.extend(true, {}, sourceRule);
          const border = borders[sourceR + "_" + sourceC];
          if (border || borders[r + "_" + c]) {
            if (!cfg.borderInfo) cfg.borderInfo = [];
            cfg.borderInfo.push({
              rangeType: "cell",
              value: {
                row_index: r,
                col_index: c,
                l: border ? border.l : null,
                r: border ? border.r : null,
                t: border ? border.t : null,
                b: border ? border.b : null,
              },
            });
          }
        }
        processed++;
        if (
          progress &&
          processed % 128 === 0 &&
          performance.now() - sliceStart > 8
        ) {
          progress.contents().first()[0].textContent =
            "正在计算填充… " +
            Math.round((processed / (length * laneCount)) * 100) +
            "% ";
          await new Promise(resolve => setTimeout(resolve, 0));
          sliceStart = performance.now();
          if (
            cancelled ||
            Store.flowdata !== active ||
            Store.config !== activeConfig ||
            viewDecorations.getRevision(file.index) !== dataRevision ||
            file.index != Store.currentSheetIndex
          )
            return false;
        }
      }
    if (
      cancelled ||
      Store.flowdata !== active ||
      Store.config !== activeConfig ||
      viewDecorations.getRevision(file.index) !== dataRevision ||
      Store.allowEdit === false ||
      !checkProtectionLockedRangeList([range], file.index)
    )
      return false;
    if (drop.applyType !== "3")
      cdformat.forEach(rule => {
        if (
          rule.cellrange.some(
            cellrange =>
              conditionformat.CFSplitRange(
                cellrange,
                copy,
                range,
                "operatePart"
              ).length
          )
        )
          rule.cellrange.push($.extend(true, {}, range));
      });
    if (snapshot.history) {
      Store.jfredo.pop();
      Store.flowdata = snapshot.data;
      Store.config = snapshot.config;
      file.data = snapshot.data;
      file.config = snapshot.config;
      file.luckysheet_conditionformat_save = snapshot.cdformat;
      file.dataVerification = snapshot.dataVerification;
      file.calcChain = snapshot.calc;
      file.dynamicArray = snapshot.dynamicArray;
    }
    const calc = (snapshot.calc || []).filter(
      cell => !overwritten.has(cell.r + "_" + cell.c)
    );
    const dynamicArray = (snapshot.dynamicArray || []).filter(
      cell => !overwritten.has(cell.r + "_" + cell.c)
    );
    const historyIndex = Store.jfredo.length;
    jfrefreshgrid(data, [range], {
      cfg,
      cdformat,
      dataVerification,
      calc,
      dynamicArray,
      operation: "fill",
    });
    snapshot.history = Store.jfredo[historyIndex];
    snapshot.revision = viewDecorations.getRevision(file.index);
    snapshot.valid = Store.flowdata === data && Store.config === cfg;
    editor.invalidateFlowDataCache();
    const last = generators[0](length);
    $("#luckysheet-dropCell-icon").attr("title", "填充终点：" + cellText(last));
    return true;
  } finally {
    drop.isFilling = false;
    drop.cancelTextFill = null;
    if (progress) progress.remove();
  }
}
