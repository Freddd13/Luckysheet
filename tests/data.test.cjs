const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");
const { textCell, cssFontSizeToPt } = load("src/utils/textCell.js");
const { parseClipboardText, formatClipboardText, expandMergedPaste } = load(
  "src/utils/clipboard.js"
);
const { fillGenerator } = load("src/utils/fillSeries.js");

function fill(values, count, direction = "down", type = "auto") {
  const generate = fillGenerator(
    values.map(v => ({ v, ct: { fa: "@", t: "s" } })),
    direction,
    type
  );
  return Array.from({ length: count }, (_, i) => generate(i + 1).v);
}
test("填充保留前导零、长整数、小数精度和方向", () => {
  assert.deepEqual(fill(["车次009"], 3), ["车次010", "车次011", "车次012"]);
  assert.deepEqual(fill(["009", "010"], 2), ["011", "012"]);
  assert.deepEqual(fill(["1"], 2), ["1", "1"]);
  assert.deepEqual(fill(["1"], 2, "down", "1"), ["2", "3"]);
  assert.deepEqual(fill(["0.1", "0.2"], 3), ["0.3", "0.4", "0.5"]);
  assert.deepEqual(fill(["-1", "0"], 3, "up"), ["-2", "-3", "-4"]);
  assert.deepEqual(fill(["9007199254740993", "9007199254740994"], 2), [
    "9007199254740995",
    "9007199254740996",
  ]);
  assert.deepEqual(fill(["2", "4", "8"], 3), ["2", "4", "8"]);
  assert.deepEqual(fill(["A", "B"], 3, "left"), ["B", "A", "B"]);
});
test("明确日期与星期序列，非法日期保持原文", () => {
  assert.deepEqual(fill(["2024-02-28"], 2), ["2024-02-29", "2024-03-01"]);
  assert.deepEqual(fill(["2024/01/31"], 2, "down", "6"), [
    "2024/02/29",
    "2024/03/31",
  ]);
  assert.deepEqual(fill(["2024-02-30"], 2), ["2024-02-30", "2024-02-30"]);
  assert.deepEqual(fill(["周六"], 3), ["周日", "周一", "周二"]);
  assert.deepEqual(fill(["六"], 3), ["日", "一", "二"]);
  assert.deepEqual(fill(["2024-03-01"], 3, "down", "5"), [
    "2024-03-04",
    "2024-03-05",
    "2024-03-06",
  ]);
  assert.deepEqual(fill(["2024-03-04"], 2, "up", "5"), [
    "2024-03-01",
    "2024-02-29",
  ]);
  assert.equal(
    fillGenerator([{ v: "2024-03-01" }], "down", "5")(100000).v,
    "2407-06-22"
  );
});

test("文本值保留业务原文与空值区别", () => {
  for (const value of [
    "001",
    "900719925474099312345",
    "-0.001",
    "TRUE",
    "FALSE",
    "12%",
    "=1+2",
    "'abc",
    "  a  ",
    "甲\n乙",
    "",
  ]) {
    const result = textCell({ v: value, f: "=1", bg: "#123456" });
    assert.equal(result.v, value);
    assert.equal(result.m, value);
    assert.equal(result.ct.t, "s");
    assert.equal(result.f, undefined);
    assert.equal(result.bg, "#123456");
  }
  assert.equal(textCell(null), null);
  assert.equal(textCell({ v: null }).v, null);
  assert.equal(textCell(0).v, "0");
});

test("富文本输出完整文字且不修改来源", () => {
  const source = {
    ct: {
      t: "inlineStr",
      s: [
        { v: "甲\n", bl: 1 },
        { v: "乙", fs: 11 },
      ],
    },
  };
  const before = JSON.stringify(source);
  assert.equal(textCell(source).v, "甲\n乙");
  assert.equal(JSON.stringify(source), before);
});

test("TSV 往返保留引号、多行、空列和短行", () => {
  const rows = [
    ["001", "甲\n乙", '"x"', ""],
    ["", "TRUE", "12%", ""],
  ];
  assert.deepEqual(parseClipboardText(formatClipboardText(rows)), rows);
  assert.deepEqual(parseClipboardText("a\tb\tc\r\nx\ty\r\n\t\t"), [
    ["a", "b", "c"],
    ["x", "y", ""],
    ["", "", ""],
  ]);
});

test("字号识别单位；展开合并不复制左上角内容", () => {
  assert.equal(cssFontSizeToPt("11pt"), 11);
  assert.equal(cssFontSizeToPt("14.666666px"), 10.9999995);
  const merged = [
    [{ v: "构型A", mc: { r: 0, c: 0, rs: 2, cs: 1 } }],
    [
      {
        mc: { r: 0, c: 0 },
        ct: { t: "inlineStr", s: [{ v: "历史隐藏内容" }] },
        f: "=1+1",
      },
    ],
  ];
  assert.deepEqual(expandMergedPaste(merged), [
    [{ v: "构型A" }],
    [{ v: "", m: "" }],
  ]);
  assert.ok(merged[0][0].mc);
});
