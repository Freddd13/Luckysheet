# 更新记录

## 2026-11-02 批次 1：业务数据与交互改进
- 补充数据正确性、临时视觉状态、下游只读约定；保留用户已有开发约定改动。
- 接入严格文本写入、整批校验、TSV 解析及双 MIME 复制；修正字体单位和 HTML 文字读取。
- 冻结入口统一计算，支持行列同时冻结和分别取消；保持既有冻结数据结构。
- 智能填充使用十进制运算并保留编号宽度，区域强调使用独立运行时状态与操作后通知。
- 新增 Node 与浏览器回归，覆盖历史快照、冻结重载及性能。下游代码与静态资源未修改。
- 修复仅改格式时误改历史值、显示值与公式的问题；常用范围格式统一提交，字体和颜色工具只复制涉及的行。
- 修复文字测量缓存键不一致、重复布局及可省略的逐格裁剪；布局缓存有容量上限，并随数据、字号、缩放和字体加载失效。
- 修复色板 Esc 关闭和焦点恢复、重复初始化的键盘事件、Spectrum 实例及组件自建 Worker、连接、定时器与动画帧的释放。
- 补充实例版本和工作表提交版本校验；协同更新、重建或销毁会使准备中的旧批量操作失效，防止覆盖新数据。快速重建时旧通知、初始化请求及延迟绘制均被释放或拦截。
- 修复历史公式结果延迟到绘制后才可读、严格文本写入误清公式及计算结果污染撤销快照的问题；当前表和非当前表写入均同步刷新依赖公式，跨表通知合并为每表一次。
- 修复未注册创建 hook 仍深拷贝整表的初始化成本；新增轻量 `workbookReady` 元数据通知，旧创建 hook 参数保留。`toJson` 返回独立设置与数据副本，避免导出快照留在内部状态。

### 验证方法与性能记录

- Node 行为测试覆盖精确序列、日期／工作日、文本与空值、富文本、TSV 和合并展开。
- 浏览器回归覆盖值写入、编辑、双 MIME 复制、HTML 外观、内部剪切、跨表复制、插入复制行、冻结菜单与重载、四方向填充及模式切换、格式和历史公式恢复、只读、区域强调、失效版本拒绝、批量取消与反复销毁。
- 普通文字、换行、下划线、旋转、富文本在 100%、125%、80% 缩放下，与修改前构建逐像素一致；缓存重复绘制结果一致。既有注释内容检查通过，下游依赖的 DOM ID／CSS 类名保留。
- 性能环境：Windows、本机 Chrome 155.0.8059.85、1366×900、双向冻结；同环境比较修改前源码构建与当前源码构建，分别使用 1000×50、10000×100 的稀疏和稠密数据。每轮绘制 40 帧、选区 20 次；新版编辑 20 次，旧版编辑 3 次，避免旧版整表复制耗尽内存。关闭录屏追踪以减少测量干扰。
- 下表单位为 ms，交互和绘制采用 P95。强调列记录千个强调区域下的整帧绘制；其绘制函数新增 CPU 时间逐帧独立计时，包含测量开销，P95 为 0.6～0.7ms。原始记录位于 `tmp/performance-results.json`，包含首屏、遮罩结束时间、长任务、销毁后堆内存和批量耗时。

| 数据 | 旧版编辑 | 新版编辑 | 旧版绘制 | 新版绘制 | 含强调绘制 | 新版选区 | 批量写入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1000×50 稀疏 | 4.8 | 1.4 | 2.4 | 3.0 | 3.8 | 1.4 | 74.2（5 万格） |
| 1000×50 稠密 | 37.0 | 1.5 | 21.2 | 13.1 | 13.5 | 1.4 | 68.5（5 万格） |
| 10000×100 稀疏 | 58.9 | 1.6 | 2.4 | 3.6 | 4.6 | 1.4 | 108.8（10 万格） |
| 10000×100 稠密 | 1051.2 | 1.5 | 30.4 | 12.2 | 11.6 | 1.9 | 128.7（10 万格） |

- 稠密万行表首绘约 77.7ms、遮罩结束约 641.6ms；原版遮罩结束约 1502.9ms。消除未注册 hook 的全表导出后，该场景记录的长任务为 68ms、50ms；普通编辑、选区与绘制达到本轮指标。GC 后销毁堆内存约 5.9MB，原版同场景约 217MB；数字包含浏览器、测试代码和组件，用于同环境对照。测试分别构造并记录数据样本耗时，未计入组件初始化。真实 Excel 桌面剪贴板往返仍需人工验收；自动化使用 Excel／网页格式的 HTML 与 TSV 样本。

### 构建、校验与回退

- 最终结果：Node 6 项通过；Chrome 30 项（29 项功能／兼容／生命周期／生产产物回归及 1 项性能对照）全部通过。生产构建成功，70 个资源文件逐项校验通过；25 个修改的既有 JS 文件注释保留检查、差异空白检查通过。整体 SHA-256 为 `059d6ef2c3eb312d5e52fda99ac387bdd2870d9783a0436fdd8cd4593755aeef`。
- 发布包：`tmp/Luckysheet-business-059d6ef2.zip`，包含清单及 70 个资源文件。插件 JS 与两份插件 CSS 和原构建逐字节一致；保留原有打印模块缺少导出的构建警告，本轮未改动打印模块。
- 压缩包逐资源 SHA-256 校验通过；压缩包自身 SHA-256 为 `9ce40562e1ff73b5a68b7bf64b4b8d633b115c31ce746d6ae82a104ba7fd3f08`。本次调试脚本及中间包归入 `tmp/implementation-debug/`，测试服务和浏览器已随回归运行器退出。
- `npm run build` 生成 UMD、CJS、ESM 以及配套 CSS、插件、字体和图片；`dist/build-manifest.json` 提供逐文件 SHA-256、整体校验值及批次 `2026-11-02-business`，`npm run verify:dist` 校验发布目录。
- 组件资源应整套部署并按清单整体哈希刷新浏览器缓存。回退使用本次构建前的完整备份 `tmp/baseline-dist/`，成套恢复资源，再刷新缓存；工作簿数据结构保持兼容。
- `npm test` 执行 Node 行为测试；`npm run test:browser` 执行功能和发布产物回归。PowerShell 设置 `$env:LUCKYSHEET_BROWSER_CHANNEL='chrome'` 可使用本机 Chrome；设置 `$env:LUCKYSHEET_PERF='1'` 可纳入性能对照。原版本对照需要本次保留的 `tmp/baseline.js`、`tmp/baseline.css`，缺少它们时画面对照跳过。
- 下游待授权事项：XLSX 导出数字字体映射修正、按构型重算并接入区域强调、升级整套组件资源及缓存版本。`ari-outline-frontend` 本轮保持只读。

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



## 2026-11-03：前端标注与 AI 适配
- 新增稀疏字符串批量写入、结构操作提交结果、编辑状态与包含隐藏行的范围读取接口。
- 结构提交、撤销重做及协同通知携带统一操作身份和位置明细，供业务独立显示配置跟随。
- 修复只读状态下结构 API 仍可修改行列的问题；原有参数、注释和数据格式保留。
- 新增四项浏览器回归，覆盖批量撤销、过期版本、结构通知和隐藏行坐标。

- 本批次最终验证：6 项 Node 测试、33 项浏览器回归通过；固定规模性能对照按默认配置跳过。70 项生产资源逐项校验通过，源清单整体 SHA-256 为 `5d94a9a93f8e4059cb7acf509a7871599aeb77a73aa47c284f1ce80e7c608805`；前端接入另含万行千区域性能验证。
- 前端运行资源同步与回退副本保存在本项目 `tmp/frontend-upgrade-before-20261103/`，原有基线与历史压缩包保留。
