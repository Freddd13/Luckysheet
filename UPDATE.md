# 更新记录

## 2026-02-07
- 恢复 HTML 表格粘贴时背景色的读取逻辑，使其与旧版行为一致。
- “插入复制行”右键菜单：
- 支持在 `cellRightClickConfig.paste=false` 时不显示/不生效。
- 区分剪切/复制：剪切时走 cut paste 流程并清理复制状态。
- 支持外部复制（如 Excel）：读取剪贴板纯文本，按行数插入后调用 `selection.pasteHandler` 粘贴。
- 移除 demo 页面 `cellRightClickConfig.customs` 的 `test` 示例，避免右键出现测试项。

