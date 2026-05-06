# 更新记录

## 2026-05-06
- 修复「插入复制行」经常变空行的 bug（根因下沉重写，取代当日早前的局部副本方案）：
  - 根因层次：
    1. 数据层：`Store.luckysheet_copy_save.copyRange` 在 `luckysheetextendtable` 偏移 flowdata 时未联动偏移；
    2. 视觉层：`Store.luckysheet_selection_range`（虚线框 DOM 数据源）同样未联动偏移；
    3. 语义层：cut→copy 路径合并后丢了"剪切一次性"语义，闪烁框残留且后续 Ctrl+V 会按旧行号取错位。
  - 修法（一次到位、覆盖所有 `luckysheetextendtable` 入口）：
    1. `src/global/extend.js`：`luckysheetextendtable` 末尾对 `Store.luckysheet_copy_save.copyRange`（限同 sheet）与 `selection_range`（currentSheet 时取 `Store`、否则取 `file`）统一偏移；用 `Set` 收集 row/column 数组去重，避免 cs 与 sr 共享引用时偏移两次；偏移规则与 calcChain 一致：`lefttop` 用 `>=`、`rightbottom` 用 `>`，分别判断 [0]/[1]；`direction` 非合法值（`undefined` / `true`）时整段跳过，与 calcChain 双分支语义对齐；currentSheet 时显式调 `selectionCopyShow()` 重画虚线框 DOM。
    2. `src/controllers/rowColumnOperation.js`：新增独立 helper `isCopiedRowInsertCrossing(st_index, direction)` 拦截"复制源跨越插入点"场景（lefttop: `row[0] < st_index && row[1] >= st_index`；rightbottom: `row[0] <= st_index && row[1] > st_index`），跨越时复用 `noPaste` 文案；`insertCopiedRows` 内 `canPasteCopySave` 增加该判定。
    3. `src/controllers/rowColumnOperation.js`：`insertRowsThenPasteCopySave` 删除原临时副本偏移（已被根因取代），直接把 `Store.luckysheet_copy_save` 传给 `pasteHandlerOfCopyPaste`；末尾若操作前是 cut 态，则 `paste_iscut=false` + `selection.clearcopy()`，与 `handler.js` 现有 cut 路径顺序一致，符合 Excel 剪切一次性语义。
  - 顺带修复了同源隐藏 bug：先 Ctrl+C → 在源行之前插入空行/列 → Ctrl+V 错位（之前会按旧行号取已偏移 flowdata 的空模板），现在自动正确。
  - 影响：所有 `luckysheetextendtable` 入口（菜单插入空行/列、API、拖底加行、sheetmanage 内调用）零行为漂移；性能纯加性 0（用户无复制态时短路）。

### 2026-05-06 followup（cut 标准语义 + 撤销/重做正确性）
- cut 路径恢复 Excel "剪切+插入"的标准移动语义：
  - `src/controllers/rowColumnOperation.js`：`insertRowsThenPasteCopySave` 在 `luckysheetextendtable` 之后，cut 模式下给末尾 `select_save` 补 `row_focus = row[0]` / `column_focus = column[0]`（值与 `row[1]/column[1]` 推算完全一致），随后调 `pasteHandlerOfCutPaste`，让其内部"清源 + 写目标"的循环正确生效；之后 `paste_iscut = false` + `clearcopy()` 维持一次性语义。copy 路径保持调 `pasteHandlerOfCopyPaste` 不变。
- 撤销/重做联动 cs/sr 偏移（防止撤销后 Ctrl+V 错位）：
  - `src/global/extend.js`：偏移块在偏移**前**对 `cs.copyRange` / `sr` 做 deep-clone 出 `prevCs/prevSr` 并保留对象引用 `csRef/srRef`；偏移**后**再 deep-clone 出 `curCs/curSr`；闸门为 `willPushHistory = isCurrent && Store.clearjfundo`（与 `jfrefreshgrid_adRC` 写 jfredo 的条件一致）。仅当 `Store.jfredo` 顶项 `type === "addRC"` 时把 `{csRef, srRef, prevCs, curCs, prevSr, curSr}` 挂到 `copyShift` 字段。
  - `src/controllers/controlHistory.js`：新增模块级 `restoreCopyShift(snapshot, kind)`，按 `Store.luckysheet_copy_save === snapshot.csRef` 做 identity 校验后才回滚 `cs.copyRange`，sr 跟随 cs 一起恢复（巧妙避开 cut 路径 `clearcopy()` 把 sr 引用换新导致引用对不上的问题——`clearcopy` 不动 cs）。addRC 撤销分支末尾调 `restoreCopyShift(ctr.copyShift, "prev")`，重做分支末尾调 `restoreCopyShift(ctr.copyShift, "cur")`。
  - identity 校验保护用户中途清/换 cs 的场景：若 `Store.luckysheet_copy_save` 已不是当时那份对象，跳过恢复，绝不覆盖用户当前复制态。
- 性能：每次 `luckysheetextendtable` 多 2-4 次小对象 `cloneRanges`（O(ranges 数)，通常 1-2），可忽略；非 currentSheet / 非 addRC / 无复制态路径全部短路，零开销。

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

