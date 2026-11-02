export function cellText(cell) {
  if (cell == null) return "";
  if (typeof cell !== "object") return String(cell);
  if (cell.ct && cell.ct.t === "inlineStr")
    return (cell.ct.s || [])
      .map(part => (part.v == null ? "" : String(part.v)))
      .join("");
  return cell.v == null ? "" : String(cell.v);
}

export function textCell(value) {
  if (value == null) return null;
  const cell = typeof value === "object" ? { ...value } : { v: value };
  delete cell.f;
  delete cell.spl;
  delete cell.qp;
  if (cell.ct && cell.ct.t === "inlineStr") {
    cell.ct = {
      ...cell.ct,
      s: (cell.ct.s || []).map(part => ({
        ...part,
        v: part.v == null ? "" : String(part.v),
      })),
    };
    cell.v = cellText(cell);
    cell.m = cell.v;
  } else {
    cell.ct = { fa: "@", t: "s" };
    if (cell.v != null) cell.v = String(cell.v);
    cell.m = cell.v == null ? "" : cell.v;
  }
  return cell;
}

export function cssFontSizeToPt(value, computedValue) {
  if (!value) return undefined;
  const match = String(value)
    .trim()
    .match(/^([\d.]+)(pt|px)$/i);
  if (match)
    return Number(match[1]) * (match[2].toLowerCase() === "px" ? 0.75 : 1);
  return computedValue ? cssFontSizeToPt(computedValue) : undefined;
}
