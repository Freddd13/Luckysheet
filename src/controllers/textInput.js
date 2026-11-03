import viewDecorations from "./viewDecorations";
import editor from "../global/editor";
import Store from "../store";
import config from "./luckysheetConfigsetting";
import { textCell } from "../utils/textCell";
import {
  checkProtectionLockedRangeList,
  checkProtectionFormatCells,
} from "./protection";
import method from "../global/method";
import server from "./server";
import { jfrefreshgrid, runExecFunction } from "../global/refresh";
import tooltip from "../global/tooltip";
import sheetmanage from "./sheetmanage";
import { stagedOperation } from "./stagedOperation";
import dataVerificationCtrl from "./dataVerificationCtrl";
import { cellText } from "../utils/textCell";
import { getInstanceRevision, deferForInstance } from "../utils/instance";

export const textModeMessage =
  "纯文本模式不支持新增公式、合并单元格或数字格式。";

export function writeTextRange(
  values,
  range,
  file,
  options = {},
  commit = true,
  points
) {
  const instanceRevision = getInstanceRevision();
  const height = points ? points.length : range.row[1] - range.row[0] + 1;
  const width = points ? 1 : range.column[1] - range.column[0] + 1;
  const ranges =
    options.ranges ||
    (points
      ? points.map(point => ({
          row: [point.row, point.row],
          column: [point.column, point.column],
        }))
      : [range]);
  const coords = [...range.row, ...range.column];
  if (
    !coords.every(n => Number.isInteger(n) && n >= 0) ||
    height < 1 ||
    width < 1 ||
    !Array.isArray(values) ||
    values.length !== height ||
    values.some(row => !Array.isArray(row) || row.length !== width)
  ) {
    tooltip.info("数据尺寸与选区不一致。", "");
    return false;
  }
  if (
    Store.allowEdit === false ||
    !(options.formatOnly
      ? checkProtectionFormatCells(file.index)
      : checkProtectionLockedRangeList(ranges, file.index))
  )
    return false;
  if (
    values.some(row =>
      row.some(
        cell =>
          cell &&
          typeof cell === "object" &&
          (cell.f != null || cell.mc != null)
      )
    )
  ) {
    tooltip.info(textModeMessage, "");
    return false;
  }
  if (
    options.triggerBeforeUpdate !== false &&
    config.hook &&
    config.hook.cellUpdateBefore
  ) {
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) {
        if (
          !method.createHookFunction(
            "cellUpdateBefore",
            points ? points[r].row : r + range.row[0],
            points ? points[r].column : c + range.column[0],
            values[r][c],
            options.isRefresh !== false
          )
        )
          return false;
      }
  }
  if (getInstanceRevision() !== instanceRevision) return false;
  const dataRevision = viewDecorations.getRevision(file.index);
  const updatedHook = config.hook && config.hook.cellUpdated;
  const before =
    file.data && file.data.length ? file.data : sheetmanage.buildGridData(file);
  const originalData = file.data;
  const data = before.slice();
  const changes = [],
    formulas = [];
  let hasValueChanges = false;
  const initialSheet = Store.currentSheetIndex;
  const valid = () =>
    !(options.signal && options.signal.aborted) &&
    getInstanceRevision() === instanceRevision &&
    file.data === originalData &&
    Store.luckysheetfile.includes(file) &&
    viewDecorations.getRevision(file.index) === dataRevision &&
    Store.currentSheetIndex == initialSheet;
  const expanded =
    range.row[1] >= data.length || range.column[1] >= (data[0] || []).length;
  if (expanded) {
    const columns = Math.max((data[0] || []).length, range.column[1] + 1);
    for (let r = 0; r <= Math.max(before.length - 1, range.row[1]); r++) {
      data[r] = (data[r] || []).slice();
      while (data[r].length < columns) data[r].push(null);
    }
  }
  if (!expanded) {
    const rows = new Set();
    for (let r = 0; r < height; r++)
      rows.add(points ? points[r].row : r + range.row[0]);
    rows.forEach(row => {
      data[row] = (before[row] || []).slice();
    });
  }
  return stagedOperation(
    height * width,
    index => {
      const r = Math.floor(index / width),
        c = index % width,
        row = points ? points[r].row : r + range.row[0];
      const col = points ? points[r].column : c + range.column[0],
        input = values[r][c],
        old = data[row][col];
      const cell = old && typeof old === "object" ? { ...old } : {};
      const value =
        input && typeof input === "object"
          ? input
          : { v: input, ct: { fa: "@", t: "s" } };
      const writesValue =
        !(input && typeof input === "object") ||
        Object.prototype.hasOwnProperty.call(input, "v") ||
        (input.ct && input.ct.t === "inlineStr") ||
        options.operation === "paste";
      hasValueChanges = hasValueChanges || writesValue;
      if (writesValue && !value.ct) cell.ct = { fa: "@", t: "s" };
      data[row][col] = writesValue
        ? textCell({ ...cell, ...value })
        : { ...cell, ...value };
      const dv =
        file.dataVerification && file.dataVerification[row + "_" + col];
      if (
        writesValue &&
        dv &&
        dv.prohibitInput &&
        !dataVerificationCtrl.validateCellData(cellText(data[row][col]), dv)
      ) {
        tooltip.info(dataVerificationCtrl.getFailureText(dv), "");
        return false;
      }
      if (writesValue && old && old.f != null) formulas.push([row, col]);
      if (
        options.triggerUpdated !== false &&
        config.hook &&
        config.hook.cellUpdated
      )
        changes.push([row, col, old, data[row][col]]);
    },
    () => {
      if (
        !(options.formatOnly
          ? checkProtectionFormatCells(file.index)
          : checkProtectionLockedRangeList(ranges, file.index)) ||
        Store.allowEdit === false
      )
        return false;
      const removed = new Set(formulas.map(([row, col]) => row + "_" + col));
      const calc = removed.size
        ? (file.calcChain || []).filter(
            cell => !removed.has(cell.r + "_" + cell.c)
          )
        : undefined;
      const dynamicArray = removed.size
        ? (file.dynamicArray || []).filter(
            cell => !removed.has(cell.r + "_" + cell.c)
          )
        : undefined;
      if (file.index == Store.currentSheetIndex && commit) {
        const params = {
          ...options.allParam,
          operation: options.operation || "apiWrite",
        };
        if (calc) {
          params.calc = calc;
          params.dynamicArray = dynamicArray;
        }
        if (expanded) {
          params.cfg = params.cfg || file.config;
          params.RowlChange = true;
        }
        jfrefreshgrid(
          data,
          ranges,
          params,
          hasValueChanges && !options.formatOnly,
          options.isRefresh !== false
        );
      } else {
        file.data = data;
        if (calc) {
          file.calcChain = calc;
          file.dynamicArray = dynamicArray;
          server.saveParam("all", file.index, calc, { k: "calcChain" });
          server.saveParam("all", file.index, dynamicArray, {
            k: "dynamicArray",
          });
        }
        if (file.index == Store.currentSheetIndex) Store.flowdata = data;
        editor.invalidateFlowDataCache();
        if (hasValueChanges && !options.formatOnly)
          runExecFunction(ranges, file.index, data);
        viewDecorations.changed(file.index, ranges, "apiWrite");
      }
      if (changes.length && getInstanceRevision() === instanceRevision)
        deferForInstance(() => {
          if (Store.luckysheetfile && Store.luckysheetfile.includes(file))
            changes.forEach(change =>
              updatedHook.apply(method, [
                ...change,
                options.isRefresh !== false,
              ])
            );
        }, 0);
      if (typeof options.success === "function") options.success(data);
      return true;
    },
    valid,
    "正在准备表格数据…"
  );
}

export function writeTextPoints(points, file, options = {}) {
  if (!points.length) return true;
  // 稀疏替换共用批量提交路径，保持未匹配单元格及其历史类型。
  const range = { row: [Infinity, 0], column: [Infinity, 0] };
  points.forEach(point => {
    range.row[0] = Math.min(range.row[0], point.row);
    range.row[1] = Math.max(range.row[1], point.row);
    range.column[0] = Math.min(range.column[0], point.column);
    range.column[1] = Math.max(range.column[1], point.column);
  });
  return writeTextRange(
    points.map(point => [point.value]),
    range,
    file,
    options,
    true,
    points
  );
}
