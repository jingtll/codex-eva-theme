# 新增桌面入口与官方客户端隔离验证

> 后续更正：本文件记录最初的脚本入口实现，现已被火绒拦截证据及[直接启动入口修复](2026-10-31-direct-client-entry.md)替代。旧入口的“持续存在、可交付”结论不再成立；当前快捷方式与 Run 项不再使用隐藏 PowerShell 启动链。以下保留历史过程，不作为当前使用指南。

## 决定与依赖

2026-10-31，用户明确确认“可以新增快捷方式”。本任务基于 `feat/full-experience-companion` 的 `707cbe4`，在 `feat/desktop-shortcut-entry` 上继续；原根目录草稿保留，不混入提交。该决定替代原先必须保持现有 MSIX 图标作为唯一日常入口的约束。

## 已实现

- `windows/launch.ps1`：每次通过当前用户的 MSIX 包定位官方 `app/ChatGPT.exe`，以 `--remote-debugging-port=19327 --remote-debugging-address=127.0.0.1` 启动；同时隐藏启动伴随程序。不改变账号、项目、聊天及官方安装包。
- 普通模式的客户端仍在运行时，明确提示先保存并完全退出；不结束任何既有进程。
- `windows/shortcut.ps1`：创建桌面 `Codex EVA.lnk`，缓存官方应用图标，哈希收据保护用户修改。通过临时文件、准备态收据和拒绝覆盖的移动操作发布桌面入口；中断后的准备态可恢复，卸载只删除匹配的自有内容。
- `install.ps1 -CreateShortcut`：同时配置隐藏自启和桌面入口；失败时回滚本次启动项及新建入口，保留此前收据与图标。普通卸载也会清理未被用户修改的入口。

## 本机发行版实测

在全新独立的用户数据目录和 Codex Home 中启动已安装的官方客户端，没有读取或复制真实账号凭据，没有退出当前工作聊天。

结果：

- 主界面调试目标可发现，`electronBridge` 存在；
- 操作系统监听查询确认调试端口仅绑定 loopback；
- 空账户登录界面没有 composer，实际生产 bundle 因此不挂载皮肤；
- 伴随程序分层状态显示连接成功、等待工作台、额度及事件待验证；
- 停止伴随程序后，没有皮肤、安装入口或自有页面绑定残留；
- 已退出本次独立实例，当前工作客户端未重启。

这是**官方客户端隔离验证**，比浏览器夹具更接近实际环境，但仍不能证明真实账户额度、主聊天事件、媒体控制或完整皮肤工作台已经通过。

## 资料与判断边界

- [Microsoft：Get-AppxPackage](https://learn.microsoft.com/en-us/powershell/module/appx/get-appxpackage?view=windowsserver2025-ps)：查询当前用户安装包；本机实测其 InstallLocation 指向当前官方版本。
- [Microsoft：WSH 创建桌面快捷方式](https://learn.microsoft.com/en-us/troubleshoot/windows-client/admin-development/create-desktop-shortcut-with-wsh)：TargetPath、Arguments、IconLocation 和 WorkingDirectory 的设置。
- [Electron：调试启动开关](https://www.electronjs.org/docs/latest/api/command-line-switches)：调试参数能力；本机额外验证了实际监听地址。

本轮只读检查还发现，当前 bootstrap 的构建风味解析优先读取 `BUILD_FLAVOR`，而 Chromium 环境开关检查的是解析后的 Dev 风味。因此早期“发行版绝对不能走这个环境变量”的推断过强。不过切换开发风味可能改变其他行为，未作生产验证，也未设置全局环境或包调试配置；用户已允许的快捷方式无需这条路线。

## 实际安装与环境差异

真实当前用户启动项已注册，安装及快捷方式收据均为 `committed`。实际入口为 `E:\codex-eva-theme\companion\Codex EVA.lnk`，已回读核对文件哈希、启动脚本、隐藏参数、图标缓存及启动项命令均匹配收据，且跨多次调用持续存在。没有启动或退出当前工作客户端；普通模式保护分支在真实当前进程上返回 `CODEX_RESTART_REQUIRED`。

安装实测额外发现：

- 本机 `CodexEva` AppData 目录带 EFS 加密。跨目录移动加密的临时链接失败；同目录 `File.Replace` 也被拒绝。两次失败都回滚了真实启动项和新链接。
- 新增共享 `receipt.ps1`：正常环境使用原子替换；EFS 拒绝时使用固定 `.recovery` 文件和同目录两步移动，下次读取可从中断状态恢复。临时快捷方式按字节写入目标目录，再以拒绝覆盖的同目录移动发布，不修改加密或权限。
- 桌面链接创建后约 3 秒消失；递归查找未找到移动后的文件，Defender 可读日志无相关事件，来源未定位。因此使用已授权项目内入口，保留桌面生成参数，不宣称桌面安装成功。

## 仍待完成

从新快捷方式重启真实工作客户端、真实额度、前后台及多窗口主聊天、两种主题实际布局、声音听感、真实媒体控制，以及 Windows 重启后的自启。当前会话不自行中断；未验收项目继续如实记录。

极端强制中断若发生在内部临时文件生成后、准备态收据写入前，可能留下 AppData 暂存文件；不会留下未记录的桌面入口。卸载不据不完整信息删除不明文件。
