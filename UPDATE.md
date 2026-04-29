# 更新记录

## 2026-04-29
- 「插入复制行」右键菜单拆为「在上方插入复制行」「在下方插入复制行」两项：
  - 4 个 locale (zh / zh_tw / en / es) 新增 `insertCopiedRowAbove` / `insertCopiedRowBelow` 文案（保留旧 `insertCopiedRow` 不删）。
  - `constant.js` 把单一 `#luckysheet-insert-copied-row` 拆成 `#luckysheet-insert-copied-row-above` / `#luckysheet-insert-copied-row-below` 两项。
  - 行/列/单元格右键菜单 4 处显隐控制（`rowColumnOperation.js` x3 + `handler.js` x1）替换为新两个 ID。
  - 把原 click 处理整体抽成 `insertCopiedRows(direction)`：`lefttop` 取 `row[0]` 起向上插、`rightbottom` 取 `row[1]` 向下插，`luckysheetextendtable` 与 `createHookFunction` 透传 direction，其余剪贴板/iscopyself/iscut 分支保持不动。
- 默认字体/字号统一为「等线 11pt」：
  - 4 个 locale 把「等线」放到 `fontarray[0]`（zh.js 把原位 5 提到 0；en.js / zh_tw.js / es.js unshift 到 [0]，其余索引整体 +1），`fontjson` 同步更新所有 key 索引。
  - `config.js` / `store/index.js` / `inlineString.js` 三处 `defaultFontSize` 由 10 改为 11。
- HTML 粘贴时不再按浏览器计算值无条件覆盖字号/字体：
  - `handler.js` 改为仅当 `<td>` 自身 inline `style.fontFamily / style.fontSize` 非空时才写 `cell.ff / cell.fs`，避免源端没显式声明时被默认 11px 错换成 8pt。

## 2026-02-07
- 恢复 HTML 表格粘贴时背景色的读取逻辑，使其与旧版行为一致。
- “插入复制行”右键菜单：
- 支持在 `cellRightClickConfig.paste=false` 时不显示/不生效。
- 区分剪切/复制：剪切时走 cut paste 流程并清理复制状态。
- 支持外部复制（如 Excel）：读取剪贴板纯文本，按行数插入后调用 `selection.pasteHandler` 粘贴。
- 移除 demo 页面 `cellRightClickConfig.customs` 的 `test` 示例，避免右键出现测试项。

