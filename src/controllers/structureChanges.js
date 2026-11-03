import { getInstanceRevision } from "../utils/instance";
let sequence = 0;

export function describeStructureChange(type, value, phase = "apply") {
  if (!["addRC", "delRC"].includes(type) || !value) return undefined;
  const axis = value.rc === "r" ? "row" : value.rc === "c" ? "column" : null;
  if (!axis || !Number.isInteger(value.index) || !Number.isInteger(value.len) || value.len < 1) return undefined;
  if (!value.operationId) value.operationId = getInstanceRevision() + ":" + (++sequence);
  const inserted = type === "addRC";
  return [{
    id: value.operationId, axis, phase,
    kind: (phase === "undo" ? !inserted : inserted) ? "insert" : "delete",
    index: value.index + (inserted && value.direction === "rightbottom" ? 1 : 0),
    count: value.len,
  }];
}
