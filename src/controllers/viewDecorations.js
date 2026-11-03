import Store from "../store";
import config from "./luckysheetConfigsetting";
import { luckysheetrefreshgrid } from "../global/refresh";
import freezen from "./freezen";
import formula from "../global/formula";
import {
  deferForInstance,
  cancelForInstance,
  getInstanceRevision,
} from "../utils/instance";

const sheets = new Map();
const formulaChanges = new Map();
let formulaNotification = null;
let revisionCounter = 0;
let frameState = null,
  frameIndex = null;
let label,
  hoverFrame = null;
function state(index) {
  const key = String(index);
  if (!sheets.has(key))
    sheets.set(key, {
      revision: ++revisionCounter,
      items: [],
      rows: null,
      columns: null,
      rowCache: new Map(),
      columnCache: new Map(),
    });
  return sheets.get(key);
}
function invalidate(index) {
  const s = state(index);
  s.revision = ++revisionCounter;
  s.items = [];
  s.rows = null;
  s.columns = null;
  s.rowCache.clear();
  s.columnCache.clear();
  if (label) label.hide();
  return s;
}
function interval(item, axis) {
  return item.range[axis] || [0, Infinity];
}
function tree(items, axis) {
  if (!items.length) return null;
  const sorted = items
    .slice()
    .sort((a, b) => interval(a, axis)[0] - interval(b, axis)[0]);
  const center = interval(sorted[Math.floor(sorted.length / 2)], axis)[0];
  const left = [],
    right = [],
    middle = [];
  sorted.forEach(item => {
    const [a, b] = interval(item, axis);
    (b < center ? left : a > center ? right : middle).push(item);
  });
  return { center, middle, left: tree(left, axis), right: tree(right, axis) };
}
function query(node, axis, start, end, out = []) {
  if (!node) return out;
  for (const item of node.middle) {
    const [a, b] = interval(item, axis);
    if (a <= end && b >= start) out.push(item);
  }
  if (start < node.center) query(node.left, axis, start, end, out);
  if (end > node.center) query(node.right, axis, start, end, out);
  return out;
}
function cached(s, axis, position) {
  const cache = axis === "row" ? s.rowCache : s.columnCache;
  if (!cache.has(position))
    cache.set(
      position,
      query(axis === "row" ? s.rows : s.columns, axis, position, position)
    );
  return cache.get(position);
}
function at(row, column) {
  const s =
    frameIndex === Store.currentSheetIndex
      ? frameState
      : sheets.get(String(Store.currentSheetIndex));
  if (!s || !s.items.length) return null;
  if (s.rowsOnly || s.columnsOnly) {
    const candidates = cached(
      s,
      s.rowsOnly ? "row" : "column",
      s.rowsOnly ? row : column
    );
    if (candidates.winner === undefined) {
      candidates.winner = null;
      for (const item of candidates)
        if (!candidates.winner || item.order > candidates.winner.order)
          candidates.winner = item;
    }
    return candidates.winner;
  }
  const rows = cached(s, "row", row),
    columns = cached(s, "column", column);
  let result = null;
  for (const item of rows.length < columns.length ? rows : columns) {
    const r = interval(item, "row"),
      c = interval(item, "column");
    if (
      row >= r[0] &&
      row <= r[1] &&
      column >= c[0] &&
      column <= c[1] &&
      (!result || item.order > result.order)
    )
      result = item;
  }
  return result;
}
function sheetIndex(options) {
  const index =
    options.sheetIndex == null ? Store.currentSheetIndex : options.sheetIndex;
  if (!Store.luckysheetfile.some(file => file.index == index))
    throw new RangeError("工作表 sheetIndex 无效。");
  return index;
}
function copyItem(item) {
  const { order, ...copy } = item;
  const range = {};
  for (const key of Object.keys(item.range))
    range[key] = item.range[key].slice();
  return { ...copy, range, style: { ...item.style } };
}

export function setViewDecorations(items, options = {}) {
  const index = sheetIndex(options),
    s = state(index);
  if (options.revision != null && options.revision !== s.revision) return false;
  if (!Array.isArray(items))
    throw new TypeError("viewDecorations 必须为数组。");
  const ids = new Set();
  const next = items.map((item, order) => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id))
      throw new TypeError("强调 id 必须为不重复的非空字符串。");
    ids.add(item.id);
    const range = {};
    for (const axis of ["row", "column"])
      if (item.range && item.range[axis] != null) {
        const value = item.range[axis];
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          !value.every(n => Number.isInteger(n) && n >= 0) ||
          value[1] < value[0]
        )
          throw new RangeError("强调范围必须为零基闭区间。");
        range[axis] = value.slice();
      }
    if (!range.row && !range.column)
      throw new RangeError("强调范围至少包含行或列。");
    const style = {
      fill: "#ecf5ff",
      boundary: "#409eff",
      headerMarker: "#409eff",
      ...item.style,
    };
    for (const color of Object.values(style))
      if (
        color != null &&
        (typeof color !== "string" || !CSS.supports("color", color))
      )
        throw new TypeError("强调颜色无效。");
    return {
      id: item.id,
      range,
      style,
      label: item.label == null ? "" : String(item.label),
      order,
    };
  });
  s.items = next;
  s.rowsOnly = next.every(item => !item.range.column);
  s.columnsOnly = next.every(item => !item.range.row);
  s.rows = tree(next, "row");
  s.columns = tree(next, "column");
  s.rowCache.clear();
  s.columnCache.clear();
  if (index == Store.currentSheetIndex) luckysheetrefreshgrid();
  return true;
}
export function getViewDecorations(options = {}) {
  return state(sheetIndex(options)).items.map(copyItem);
}
export function clearViewDecorations(options = {}) {
  return setViewDecorations([], options);
}

const viewDecorations = {
  getRevision(index) {
    return state(index).revision;
  },
  initialize(definitions = {}) {
    Object.entries(definitions).forEach(([sheetIndex, items]) =>
      setViewDecorations(items, { sheetIndex })
    );
    this.bindHover();
  },
  changed(index, ranges, type, structureChanges) {
    this.changedMany([{ sheetIndex: index, ranges, type, ...(structureChanges ? { structureChanges } : {}) }]);
  },
  noteFormulaChanges(changes) {
    const affected = new Set();
    for (const { index, r, c } of changes) {
      const key = String(index);
      affected.add(index);
      const pending = formulaChanges.get(key);
      if (pending) {
        pending.ranges[0].row[0] = Math.min(pending.ranges[0].row[0], r);
        pending.ranges[0].row[1] = Math.max(pending.ranges[0].row[1], r);
        pending.ranges[0].column[0] = Math.min(pending.ranges[0].column[0], c);
        pending.ranges[0].column[1] = Math.max(pending.ranges[0].column[1], c);
      } else
        formulaChanges.set(key, {
          sheetIndex: index,
          ranges: [{ row: [r, r], column: [c, c] }],
          type: "formula",
        });
    }
    affected.forEach(index => invalidate(index));
    if (changes.length && formulaNotification == null)
      formulaNotification = deferForInstance(() => {
        formulaNotification = null;
        this.changedMany([]);
      });
  },
  changedMany(events) {
    formula.groupValuesRefresh();
    cancelForInstance(formulaNotification);
    formulaNotification = null;
    const pending = new Map(formulaChanges);
    formulaChanges.clear();
    for (const event of events) {
      const key = String(event.sheetIndex),
        calculated = pending.get(key);
      const ranges =
        event.ranges == null
          ? null
          : [...event.ranges, ...(calculated ? calculated.ranges : [])];
      invalidate(event.sheetIndex);
      pending.set(key, { ...event, ranges });
    }
    const owner = getInstanceRevision();
    const notifications = Array.from(pending.values(), event => ({
      ...event,
      revision: state(event.sheetIndex).revision,
    }));
    for (const event of notifications) {
      if (owner !== getInstanceRevision()) break;
      if (event.revision !== state(event.sheetIndex).revision) continue;
      if (config.hook && typeof config.hook.sheetDataChanged === "function")
        config.hook.sheetDataChanged({
          ...event,
          ranges: event.ranges
            ? JSON.parse(JSON.stringify(event.ranges))
            : null,
        });
    }
  },
  rekey(oldIndex, newIndex) {
    const old = sheets.get(String(oldIndex));
    if (old) {
      sheets.set(String(newIndex), old);
      sheets.delete(String(oldIndex));
    }
  },
  remove(index) {
    sheets.delete(String(index));
  },
  beginFrame() {
    const s = sheets.get(String(Store.currentSheetIndex));
    frameState = s;
    frameIndex = Store.currentSheetIndex;
    if (s) {
      s.rowCache.clear();
      s.columnCache.clear();
    }
  },
  fill(row, column, existing) {
    if (existing != null) return existing;
    const item = at(row, column);
    return item && item.style.fill;
  },
  marker(ctx, axis, position, a, b, header) {
    const s = sheets.get(String(Store.currentSheetIndex));
    if (!s || !s.items.length) return;
    if ((s.rowsOnly && axis === "column") || (s.columnsOnly && axis === "row"))
      return;
    let item = null;
    for (const candidate of cached(s, axis, position))
      if (
        candidate.range[axis] &&
        candidate.style.headerMarker &&
        (!item || candidate.order > item.order)
      )
        item = candidate;
    if (!item) return;
    ctx.fillStyle = item.style.headerMarker;
    if (axis === "row") ctx.fillRect(header - 5, a, 3, Math.max(0, b - a));
    else ctx.fillRect(a, header - 5, Math.max(0, b - a), 3);
  },
  boundaries(
    ctx,
    scrollX,
    scrollY,
    offsetX,
    offsetY,
    rowStart,
    rowEnd,
    colStart,
    colEnd
  ) {
    const s = sheets.get(String(Store.currentSheetIndex));
    if (!s || !s.items.length) return;
    const rows = Store.visibledatarow,
      cols = Store.visibledatacolumn;
    const candidates = (
      s.columnsOnly
        ? query(s.columns, "column", colStart, colEnd)
        : query(s.rows, "row", rowStart, rowEnd)
    )
      .filter(
        item =>
          interval(item, "column")[0] <= colEnd &&
          interval(item, "column")[1] >= colStart
      )
      .sort((a, b) => a.order - b.order);
    ctx.save();
    ctx.lineWidth = 2;
    for (const item of candidates) {
      if (!item.style.boundary) continue;
      const r = interval(item, "row"),
        c = interval(item, "column");
      const x = (c[0] === 0 ? 0 : cols[c[0] - 1]) - scrollX + offsetX - 1,
        y = (r[0] === 0 ? 0 : rows[r[0] - 1]) - scrollY + offsetY - 1;
      const right =
        (c[1] === Infinity
          ? cols[cols.length - 1]
          : cols[Math.min(c[1], cols.length - 1)]) -
        scrollX +
        offsetX -
        1;
      const bottom =
        (r[1] === Infinity
          ? rows[rows.length - 1]
          : rows[Math.min(r[1], rows.length - 1)]) -
        scrollY +
        offsetY -
        1;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      ctx.strokeStyle = item.style.boundary;
      ctx.beginPath();
      if (item.range.row) {
        ctx.moveTo(x, y);
        ctx.lineTo(right, y);
        ctx.moveTo(x, bottom);
        ctx.lineTo(right, bottom);
      }
      if (item.range.column) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, bottom);
        ctx.moveTo(right, y);
        ctx.lineTo(right, bottom);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
  bindHover() {
    const container = $("#" + Store.container);
    container
      .off(".luckysheetDecorations")
      .on(
        "mouseleave.luckysheetDecorations mousedown.luckysheetDecorations",
        () => {
          if (label) label.hide();
        }
      );
    container.on("mousemove.luckysheetDecorations", event => {
      if (Store.luckysheet_cell_selected_extend) {
        if (label) label.hide();
        return;
      }
      const s = sheets.get(String(Store.currentSheetIndex));
      if (!s || !s.items.length) return;
      if (hoverFrame != null) cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = null;
        const canvas = document.getElementById("luckysheetTableContent");
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect(),
          x = event.clientX - rect.left - Store.rowHeaderWidth,
          y = event.clientY - rect.top - Store.columnHeaderHeight;
        if (x < 0 || y < 0) {
          if (label) label.hide();
          return;
        }
        const frozenX = freezen.freezenverticaldata,
          frozenY = freezen.freezenhorizontaldata;
        const scrollX =
          frozenX && x < frozenX[0] - frozenX[2]
            ? frozenX[2]
            : $("#luckysheet-cell-main").scrollLeft();
        const scrollY =
          frozenY && y < frozenY[0] - frozenY[2]
            ? frozenY[2]
            : $("#luckysheet-cell-main").scrollTop();
        function locate(values, pixel) {
          let lo = 0,
            hi = values.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (values[mid] <= pixel) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        }
        const item = at(
          locate(Store.visibledatarow, y + scrollY),
          locate(Store.visibledatacolumn, x + scrollX)
        );
        if (!item || !item.label) {
          if (label) label.hide();
          return;
        }
        if (!label)
          label = $(
            '<div class="luckysheet-decoration-label" role="tooltip"></div>'
          ).appendTo("body");
        label
          .text(item.label)
          .css({
            left: Math.min(event.clientX + 12, window.innerWidth - 220),
            top: Math.min(event.clientY + 16, window.innerHeight - 50),
          })
          .show();
      });
    });
  },
  destroy() {
    cancelForInstance(formulaNotification);
    formulaNotification = null;
    formulaChanges.clear();
    frameState = null;
    frameIndex = null;
    sheets.clear();
    if (hoverFrame != null) cancelAnimationFrame(hoverFrame);
    hoverFrame = null;
    if (label) label.remove();
    label = null;
    if (Store.container) $("#" + Store.container).off(".luckysheetDecorations");
  },
};
export default viewDecorations;
