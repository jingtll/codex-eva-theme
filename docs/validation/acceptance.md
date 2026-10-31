# 验收记录

2026-10-31，Windows 11（26100），实施分支 `feat/full-experience-companion`。

本文件严格区分三类结果：**静态/契约测试**、**隔离浏览器测试**、**真实客户端验收**。前两类通过不代表第三类通过。

## 环境

- 安装包版本（`ChatGPT.exe` 文件版本）：`156.0.8078.48`
- 内部应用版本（`package.json`）：`26.1027.30824`
- 前端资源指纹（`node src/diagnose.mjs`）：`2cde1c59f255f5828fd97b93bf31eb988134c38c3bca8ef4e16e7fc255730fb1`
- Electron fuse（`chrome.dll` 只读）：`embeddedAsarIntegrityValidation=true`，`onlyLoadAppFromAsar=true`，`nodeOptions=false`，`nodeCliInspect=false`
- 普通启动的进程：未检测到 `--remote-debugging-port` / `--remote-debugging-pipe`

## 一、契约测试：通过

`cd companion && npm test` → 63 项，62 通过，1 跳过（浏览器夹具，需 `EVA_BROWSER_ENDPOINT`）。覆盖范围：

| 模块 | 验证的行为 |
| --- | --- |
| `asar` / `discovery` | 截断头、非法 offset、目录逃逸、尺寸上限；目标只认主页面且调试套接字必须是 loopback；端口不可达时不抛错 |
| `cdp` | 乱序响应按请求 ID 关联、超时、断开清理 |
| `integration` | 备份与收据、二次安装、失败恢复；**升级后文件已变，恢复被 `PATCH_RESTORE_CONFLICT` 拒绝** |
| `quota` | null/缺失百分比不显示 100%、越界夹取、多桶不合并、现代格式优先于旧格式 |
| `events` / `host` | 同一事件只提醒一次、子任务与未知来源不提醒、失败与取消不当作完成 |
| `media` / `sound` | 非白名单动作与含分隔符的来源 ID 被拒且不写请求；超时进程被杀且迟到响应被忽略；只播放四个固定文件 |
| `main` | 无 Codex 时不连接不轮询；暂停关闭连接、恢复只重连一次、停止后无残留；设置校验与持久化；坏设置文件回退默认；托盘只接受固定命令；断线重连不叠加会话；单实例锁与 stale 锁接管 |
| `install` | PowerShell 脚本 AST 解析；安装收据只含相对路径与哈希；卸载只列未改动文件 |
| `windows-install` | 收据无 BOM；重复安装幂等；用户改过的启动项卸载时保留；无收据时不改动；素材 SHA-256 与 `NOTICE.md` 一致 |

安装/卸载的真实行为测试写入 `HKCU:\Software\CodexEvaTest` 这个探针键（脚本只在该环境变量指向 `HKCU:\` 下时接受覆盖），**未改动真实的 `Run` 启动项**；测试结束后已确认探针键被清理、真实键无本项目条目。因此「写入真实 `HKCU\...\Run`」这一条属于下方第三节的待验收项。

WSL/Git Bash 下的已知环境限制：此处 `powershell.exe` 无法加载 `Microsoft.PowerShell.Security` 模块，`Get-ExecutionPolicy` 一类命令会静默失败。安装脚本本身不依赖它，测试也不依赖它。

## 二、隔离浏览器测试：通过（仅布局，不代表 Codex 内表现）

`EVA_BROWSER_ENDPOINT=http://127.0.0.1:19433 node --test tests/client.browser.mjs`（Chrome 156 headless）→ 通过。验证：

- 挂载 `#codex-eva-root`，暗色为明日香、切到浅色后变为绫波丽；
- 额度缺失时显示「暂不可用」，给出数据后显示 37%；
- 设置面板打开、背景强度生效；
- 宿主 `dialog.showModal()` 出现时整个皮肤隐藏，关闭后恢复；
- 700px 窄窗口下宿主的「批准操作」按钮在几何中心可被命中（装饰层不拦截点击）；
- `dispose()` 后根节点移除、宿主按钮仍可用。

截图：`.cache/screenshots/eva-rei.png`（绫波丽，700px 窄窗口）。

未覆盖：真实宿主弹窗、右侧面板、页面缩放后的实际布局，以及真实线稿在 Codex 深色主题下的可读性。

## 三、真实客户端验收：尚未执行

以下项目**没有**在当前会话验证，原因统一为：验证要求启动或重启 Codex（会打断正在使用的工作会话），按计划书不得自行中断。请在一个独立的验收窗口执行，并在此文件补充结果。

| # | 验收项 | 方法 | 结果 |
| --- | --- | --- | --- |
| 1 | 带调试端口的 Codex 能被识别并接入 | 用带 `--remote-debugging-port` 参数的快捷方式启动，运行 `npm start`，托盘状态变为「已连接」 | 未验收 |
| 2 | 页面加载皮肤、刷新后恢复、卸载无残留 | 接入后看仪表；`Ctrl+R` 后仍在；托盘退出后页面干净 | 未验收 |
| 3 | 真实剩余额度 | 仪表显示与实际账户额度一致，展开看重置时间 | 未验收 |
| 4 | 主聊天事件 | 前台、后台各一次待审核与正常完成；失败、取消、子任务不响 | 未验收 |
| 5 | 多窗口去重 | 两个 Codex 窗口下同一完成事件只响一次 | 未验收 |
| 6 | 系统媒体 | 上一首、下一首、暂停；切歌时播放器跟着变 | 未验收 |
| 7 | 真实开机自启 | 运行 `install.ps1` 后重启，托盘出现；在「设置 → 应用 → 启动」中能看到并可关闭 | 未验收 |
| 8 | 真实卸载 | 运行 `uninstall.ps1`，启动项消失，设置文件被删，Codex 会话不受影响 | 未验收 |

## 已知阻碍与事实

1. **普通启动无法接入。** 当前版本的普通启动没有调试端口（见环境一节）。要让伴随程序接入，必须使用带 `--remote-debugging-port` 的启动方式。这与设计里「用户仍点原图标」的目标存在差距，需要用户决定是否接受一个改过的快捷方式，或另找接入方式。这一点不因测试通过而改变。
2. **事件与额度的来源路径**：`electronBridge.sendMessageFromView` 的 `mcp-request` 通道在隔离实例中可以请求 `account/rateLimits/read`；真实账户数据、`turn/completed` 等实时通知能否覆盖**全部**主聊天，尚未在真实会话中确认。
3. **托盘脚本**只做了 AST 解析测试，未在实际桌面会话中手动点过菜单。
