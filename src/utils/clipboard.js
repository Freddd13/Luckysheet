import { tsvParseRows, tsvFormatRows } from "d3-dsv";
import { cssFontSizeToPt } from "./textCell";

export function parseClipboardText(text) {
  const rows = tsvParseRows(text);
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map(row =>
    Array.from({ length: width }, (_, c) => (c < row.length ? row[c] : ""))
  );
}

export function formatClipboardText(rows) {
  return tsvFormatRows(rows);
}

export function matchesCopyTable(html, copy, data, config) {
  if (!html || !copy.copyId || !data) return false;
  const doc = new DOMParser().parseFromString(html, "text/html"),
    table = doc.querySelector("table[data-copy-id]");
  if (!table || table.getAttribute("data-copy-id") !== copy.copyId)
    return false;
  const actual = [];
  Array.from(table.rows).forEach((row, r) => {
    if (!actual[r]) actual[r] = [];
    let c = 0;
    for (const cell of row.cells) {
      while (c in actual[r]) c++;
      const rs = cell.rowSpan || table.rows.length - r,
        cs = cell.colSpan;
      for (let y = 0; y < rs; y++) {
        if (!actual[r + y]) actual[r + y] = [];
        for (let x = 0; x < cs; x++)
          actual[r + y][c + x] = y === 0 && x === 0 ? htmlCellText(cell) : "";
      }
      c += cs;
    }
  });
  const rows = new Set(),
    columns = new Set();
  for (const range of copy.copyRange) {
    for (let r = range.row[0]; r <= range.row[1]; r++)
      if (!config.rowhidden || config.rowhidden[r] == null) rows.add(r);
    for (let c = range.column[0]; c <= range.column[1]; c++)
      if (!config.colhidden || config.colhidden[c] == null) columns.add(c);
  }
  const rr = Array.from(rows).sort((a, b) => a - b),
    cc = Array.from(columns).sort((a, b) => a - b);
  const normalize = value => String(value).replace(/\r\n|\r/g, "\n");
  return (
    actual.length === rr.length &&
    rr.every(
      (r, i) =>
        actual[i].length === cc.length &&
        cc.every((c, j) => {
          const cell = data[r] && data[r][c];
          const value =
            cell && cell.ct && cell.ct.t === "inlineStr"
              ? cellTextForCopy(cell)
              : cell && cell.ct && /w/.test(cell.ct.fa || "")
              ? cell.v
              : cell && cell.m != null
              ? cell.m
              : cell && cell.v != null
              ? cell.v
              : cell == null || typeof cell === "object"
              ? ""
              : cell;
          return normalize(value) === normalize(actual[i][j]);
        })
    )
  );
}
function cellTextForCopy(cell) {
  return (cell.ct.s || [])
    .map(part => (part.v == null ? "" : String(part.v)))
    .join("");
}

export function htmlCellText(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  return clone.textContent;
}

export function clipboardDocument(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed
    .querySelectorAll("script,iframe,object,embed,link,img,base")
    .forEach(node => node.remove());
  parsed.querySelectorAll("*").forEach(node =>
    Array.from(node.attributes).forEach(attr => {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    })
  );
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1000px;height:1px;border:0;pointer-events:none";
  document.getElementById("luckysheet-copy-content").appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(parsed.documentElement.outerHTML);
  doc.close();
  return { document: doc, dispose: () => frame.remove() };
}

export function clipboardFont(element, property) {
  const child = element.querySelector("span,font");
  const target = child || element;
  let node = target;
  while (node && node.nodeType === 1) {
    if (node.style[property])
      return node === target
        ? node.style[property]
        : element.ownerDocument.defaultView.getComputedStyle(target)[property];
    if (property === "fontFamily" && node.getAttribute("face"))
      return node.getAttribute("face");
    for (const sheet of element.ownerDocument.styleSheets)
      for (const rule of sheet.cssRules) {
        if (
          rule.selectorText &&
          rule.style[property] &&
          node.matches(rule.selectorText)
        )
          return element.ownerDocument.defaultView.getComputedStyle(target)[
            property
          ];
      }
    node = node.parentElement;
  }
  return "";
}

export function clipboardInlineStrings(element) {
  if (!element.querySelector("span,font,b,strong,i,em,u,s,br")) return null;
  const result = [],
    doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_ALL, {
    acceptNode: node =>
      node.nodeType === 3 || node.nodeName === "BR"
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  });
  while (walker.nextNode()) {
    const node = walker.currentNode,
      parent = node.nodeType === 3 ? node.parentElement : node;
    const css = doc.defaultView.getComputedStyle(parent),
      part = { v: node.nodeName === "BR" ? "\n" : node.nodeValue };
    const ff = clipboardFont(parent, "fontFamily"),
      fs = clipboardFont(parent, "fontSize");
    if (ff) part.ff = ff.replace(/["']/g, "");
    if (fs) part.fs = cssFontSizeToPt(fs, css.fontSize);
    part.fc = css.color;
    part.bl =
      css.fontWeight === "bold" || Number(css.fontWeight) >= 600 ? 1 : 0;
    part.it = css.fontStyle === "italic" ? 1 : 0;
    part.un = css.textDecorationLine.includes("underline") ? 1 : 0;
    part.cl = css.textDecorationLine.includes("line-through") ? 1 : 0;
    if (part.v) result.push(part);
  }
  return result;
}

export function expandMergedPaste(rows) {
  return rows.map(row =>
    row.map(value => {
      if (!value || !value.mc) return value;
      const cell = { ...value };
      if (cell.mc.rs == null) {
        cell.v = "";
        cell.m = "";
        delete cell.ct;
        delete cell.f;
      }
      delete cell.mc;
      return cell;
    })
  );
}
