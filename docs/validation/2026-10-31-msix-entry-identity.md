# 官方启动身份与桌宠识别修复

## 用户反馈与事实

用户反馈：新入口打开的 Codex 在任务栏成为额外分组，Codex Maid Widget 与白龙桌宠增强版均找不到 Codex 窗口。本任务在 `fix/msix-entry-identity`，依赖 `12acf1b` 的现有主题修复；原根目录草稿保留。

只读检查表明当前不是两个 Codex 主进程：只有一个真实主进程，调试端口为 19327，没有测试 profile 参数。但 Windows `GetPackageFullName` 返回 15700（无包身份），`GetApplicationUserModelId` 返回 15703（无应用 ID）。包内 exe 路径相同不等于启动身份相同，旧方案“直接 exe 等价官方注册启动”的判断被新证据推翻。

Codex Maid Widget 0.3.51 的 `src/windows-inventory.cjs` 调用 `GetPackageFamilyName`，再由 `src/codex-identity.cjs` 的 `IsOfficialDesktop` 判定：包内路径需要正确 package family；无身份的普通安装路径则只接受当前用户 LocalAppData Programs 范围。当前 WindowsApps 裸 exe 不满足任何一类，因此会被拒绝。白龙为打包程序，本轮未验证其内部同一判定逻辑，不能声称两个桌宠根因已分别证明。

## 修复

官方当前包的主应用 `App` 注册了执行别名 `chatgpt-desktop.exe`。入口改为 `%LOCALAPPDATA%\Microsoft\WindowsApps\chatgpt-desktop.exe`，仍直接使用两项本机调试参数，不新增启动器、隐藏脚本或执行策略覆盖。

创建前查询并核对当前官方包的主应用、目标可执行文件及别名声明。别名不可用时报错，不退回无身份裸 exe。快捷方式收据升级为 v3，记录 aliasPath；旧 v1/v2 准备态拒绝恢复。图标仍缓存官方素材，Windows 负责别名到新版本的定位。

没有修改官方包、桌宠、账号、聊天、凭据或任务栏固定项，也没有手动伪造窗口 AppUserModelID。修复使用操作系统正常包激活路径，包身份与任务栏应用 ID 均由 Windows 提供。

## 验证

| 验证层级 | 结果 |
| --- | --- |
| 官方别名隔离探针 | 全新 profile 和 Codex Home，仅本机端口可用；`GetPackageFullName`、`GetApplicationUserModelId` 均返回 0，实际身份为 `OpenAI.Codex_26.1027.3384.0_x64__2p2nqsd0c76g0` 和 `OpenAI.Codex_2p2nqsd0c76g0!App` |
| 正式快捷方式端到端 | `npm run test:msix-entry --prefix companion` 1 项通过。由正式生成脚本创建临时 `.lnk`，仅将测试端口和独立 profile 参数用于隔离；实际启动后验证包身份、应用 ID 及 loopback，再清理测试实例 |
| 快捷方式回归 | 目标从裸 exe 到官方别名的断言先失败后通过；重复创建、用户修改保护、旧准备态拒绝恢复、别名缺失不发布均通过 |
| 完整契约 | 95 项，94 通过、1 符号链接权限跳过、0 失败；补充旧 v2 准备态后再跑入口四项全部通过 |
| 本机入口 | `companion\Codex EVA.lnk` 已更新为官方别名，v3 收据 committed、哈希匹配；真实旧客户端未关闭 |

本机更新时发现旧安装/入口收据已不在，但 `.lnk` 的 SHA-256 仍与本会话此前核对的自有入口 `e305c4ea9df6d63b57136bcf226fe85de81b2eb724d141fda6db7c8fe8dc2e75` 完全一致。脚本先按保护规则拒绝覆盖；在确认所有权后备份到 `.cache/shortcut-backups/` 再更新，失败会恢复备份。没有重写缺失的旧安装收据或重新注册真实自启项。

部分 MSIX 应用关闭窗口后仍有后台进程。测试只按本次独有 user-data-dir 核对并清理隔离实例，不根据名称批量结束客户端。此前裸 exe 的真实主进程继续保持原状，运行中的进程不能原地补上包身份。

## 仍需真实验收

用户保存工作、完全退出旧 Codex，再从已更新的项目入口启动。随后应核对新进程的官方包身份、调试端口、任务栏分组、主题，以及 Codex Maid Widget 和白龙桌宠的窗口定位。隔离测试不能替代这一步；在用户完成前，不宣称两款桌宠均已修复。

入口文件已创建及回读，尚未再次做火绒自定义扫描和点击后行为监控验收。新入口未引入旧报毒的 PowerShell 链路，但不能只据结构推断新病毒库一定接受。

资料：[Microsoft AppUserModelIDs](https://learn.microsoft.com/en-us/windows/win32/shell/appids) 解释进程、窗口与快捷方式的任务栏分组；实际别名及参数能力另由本机安装 manifest、包身份 API 和隔离启动验证，不依赖文档推测。
