# Codex EVA 伴随程序

给 Codex 工作台套上 EVA 双角色皮肤：深色为明日香，浅色为绫波丽。

当前使用新增的 **Codex EVA** 快捷方式直接启动官方客户端，伴随程序独立运行。原 MSIX 图标保留，普通启动不带调试端口，因此没有皮肤。首次使用前请先保存工作并完全退出正在普通模式运行的 Codex。新快捷方式不经过脚本检查，也不会提示或替你关闭聊天；已有普通实例可能直接复用，无法因此补开端口。

启动 Codex 后，伴随程序开机驻留托盘，检测到本机调试端点就接入；没有就显示「等待 Codex 调试入口」。

## 环境要求

- Windows 10/11
- Node.js 22+（`node --version`）
- Windows PowerShell 5.1（安装与托盘用；PowerShell 7 不支持 WinRT 媒体桥的写法）

## 启动 Codex

在仓库根目录运行一次安装（Windows PowerShell 5.1）：

```powershell
powershell -NoProfile -File companion\windows\install.ps1 -CreateShortcut -ShortcutDirectory "$PWD\companion" -StartCompanion
```

之后打开 `companion\Codex EVA.lnk`。快捷方式直接指向安装时发现的官方 `ChatGPT.exe`，参数只有调试端口及 loopback 地址，不再运行隐藏 PowerShell 或覆盖执行策略。它不负责启动伴随程序：Run 项负责下次登录自启，安装命令中的 `-StartCompanion` 负责本次独立启动。若仅运行普通 `npm start`，伴随程序可能随终端或 Codex 的 Windows 任务对象结束而退出。

单独启动伴随程序、使其不依附当前终端或 Codex：

```powershell
powershell -NoProfile -File companion\windows\start.ps1 -NodePath (Get-Command node.exe).Source
```

该脚本通过本机 `Win32_Process.Create` 直接启动 Node，不新增服务或计划任务、不修改系统执行策略。与入口和 Run 项分别承担职责；已经运行时由单实例锁阻止重复接入。安装的 `-StartCompanion` 在收据提交后执行，启动失败会明确报告安装配置仍已保存，可重试上面的命令。

不指定 `-ShortcutDirectory` 时默认生成到桌面。本机旧入口被火绒判为 `TrojanDownloader/LNK.Agent.g` 并删除，换目录并未解决。本轮新入口和伴随程序目录经火绒自定义扫描：78 个对象，风险 0 个；扫描后入口仍在。该结果不代表点击启动及后续行为均已验收。没有关闭防护或添加信任。

快捷方式和图标记录哈希，卸载从收据读取原目录，保留用户修改。仅创建或移除入口、不修改开机启动项时，分别运行 `companion\windows\shortcut.ps1`（可带 `-ShortcutDirectory`）或加 `-Remove`。

官方更新后路径可能变化。重新运行创建脚本会检测过期入口并报 `SHORTCUT_REFRESH_REQUIRED`；先运行下列命令移除匹配的自有入口，再重复安装命令生成当前版本入口。此过程也用于仍存在的旧版脚本入口，不会自动恢复旧版准备态快捷方式。

```powershell
powershell -NoProfile -File companion\windows\shortcut.ps1 -Remove
```

用带调试参数的方式启动（需先完全退出已运行的 Codex）：

```powershell
$package = Get-AppxPackage -Name OpenAI.Codex
& (Join-Path $package.InstallLocation 'app\ChatGPT.exe') --remote-debugging-port=19327 --remote-debugging-address=127.0.0.1
```

实际路径以 `node src/diagnose.mjs` 输出的发现结果为准。若想从快捷方式启动，请**先备份原快捷方式**再修改其“目标”字段。

伴随程序会从运行中的客户端发现调试端口；也支持显式指定：

```powershell
$env:CODEX_EVA_DEBUG_PORT="19327"; npm start
```

## 先诊断

```sh
cd companion
node src/diagnose.mjs
```

只读输出：版本、内部版本、前端资源指纹、Electron fuse 状态、本机调试端点是否开放。不会启动、关闭或修改 Codex。重点看 `endpoint.localDebugging`：

- `no_startup_switch_detected`：普通启动没带调试端口，伴随程序无法接入。要接入需用带 `--remote-debugging-port=<端口> --remote-debugging-address=127.0.0.1` 的快捷方式启动（导入需备份原快捷方式），或等待其他接入方式被验证。
- `responding`：可直接运行伴随程序。

## 运行

```sh
cd companion
npm start
```

托盘菜单：暂停皮肤 / 显示设置 / 退出。设置存于 `%APPDATA%\CodexEva\settings.json`，只含皮肤偏好，不碰 Codex 的其他配置。

深色人物使用加粗的饱和红色线稿，默认可见度约 65%；“背景强度”仍可调节其透明度，归零时隐藏。浅色人物沿用原样。该效果在渲染时生成，原人物素材未改动。

## 安装开机自启

```powershell
powershell -NoProfile -File companion\windows\install.ps1
```

安装检查 `src/main.mjs` 与 Node 22+，先保存安装收据，再在当前用户 `Run` 键注册直接启动 Node 的命令，不经过 PowerShell。登录时可能显示 Node 控制台，关闭它会停止伴随程序。收据含启动项原值与命令；可将匹配的旧版隐藏脚本命令迁移为新命令，首次安装前的原值保持不变。用户已改过时拒绝覆盖。伴随程序可以先于 Codex 启动，随后发现端口并检查资源指纹。

## 卸载 / 恢复

```powershell
powershell -NoProfile -File companion\windows\uninstall.ps1
```

卸载先通知伴随程序干净退出（暂停时同样有效），再删除 `settings.json` 与收据。启动项仍与收据一致时恢复安装前的值，原来没有值则删除；用户后改的值保留。Codex 的会话、凭据和项目文件不受影响。

安装收据区分 `prepared` 与 `committed`，保留本次修改前的值和首次安装前的原值。若升级中断，可重新安装继续，或直接卸载恢复；实际启动项与收据两侧都不匹配时报告 `REGISTRY_CONFLICT`，保留用户修改。

若曾用补丁方式修改过 Codex 文件，用 `restorePatch(receipt)` 恢复：仅当目标文件仍等于补丁后哈希时才写回，客户端升级后会被 `PATCH_RESTORE_CONFLICT` 拒绝，不会覆盖新版本。

## 测试

```sh
npm test                     # 契约测试（含 PowerShell 脚本解析、安装/卸载）
```

浏览器布局夹具需要显式给出一个无界面浏览器的调试端点：

```powershell
# 另开一个终端
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --remote-debugging-port=19433 --user-data-dir="$env:TEMP\eva-browser" about:blank
# 然后
$env:EVA_BROWSER_ENDPOINT="http://127.0.0.1:19433"; npm run test:browser
```

端点就绪后运行 `npm run test:browser`，包含主题布局、额度 adapter，以及使用真实主循环/会话/bundle 的连接、刷新、暂停恢复与清理回归。`npm test` 不包含浏览器测试。

静态测试、隔离浏览器测试与真实客户端验收是三类结果，不能互相替代。真实验收记录见 `docs/validation/acceptance.md`。用户已接受新增快捷方式；原 MSIX 入口保持原样。

## 结构

| 路径 | 职责 |
| --- | --- |
| `src/main.mjs` | 单实例锁、轮询编排、设置持久化、托盘通道 |
| `src/discovery.mjs` | 安装/进程/版本发现，主界面目标识别，本机端点读取 |
| `src/cdp.mjs` | 带请求 ID、超时与关闭清理的 CDP 客户端 |
| `src/session.mjs` | 一个页面会话：注入 bundle、绑定命令与宿主事件、媒体采样 |
| `src/bundle.mjs`、`client/` | 页面皮肤（shadow DOM、装饰、仪表、设置面板） |
| `src/quota.mjs` | 额度规范化：分桶、剩余百分比、缺失值保持 null |
| `src/events.mjs`、`src/host.mjs` | 事件去重与主聊天判定 |
| `src/media.mjs`、`windows/system-nowplaying.ps1` | GSMTC 系统媒体桥 |
| `src/sound.mjs`、`windows/play-cue.ps1` | 四个固定角色提示音 |
| `src/integration.mjs` | 哈希校验的补丁事务与恢复 |
| `src/installation.mjs` | 安装收据与只删未改动文件 |
| `windows/tray.ps1`、`install.ps1`、`uninstall.ps1` | 托盘与安装/卸载 |
| `assets/`、`NOTICE.md` | 迁移素材、来源与 SHA-256 |

素材许可见 [NOTICE.md](NOTICE.md)。
