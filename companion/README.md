# Codex EVA 伴随程序

给 Codex 工作台套上 EVA 双角色皮肤：深色为明日香，浅色为绫波丽。

日常使用 **Codex EVA** 快捷方式：点击时先确认独立伴随程序已运行，再通过官方 MSIX 执行别名打开 Codex，并检查工作台主题。不依赖登录自启，重复点击不会建立第二个伴随实例。原 MSIX 图标保留。

如果普通模式的 Codex 已运行，启动器会提示先保存工作并完全退出，不会替你关闭聊天；调试端口无法补加到已运行的普通实例上。

## 环境要求

- Windows 10/11
- Node.js 22+（`node --version`）
- Windows PowerShell 5.1（安装与托盘用；PowerShell 7 不支持 WinRT 媒体桥的写法）
- Windows 自带 .NET Framework 4.x 编译器（首次生成点击启动器时使用）

## 一次配置，以后点击启动

在仓库根目录运行（Windows PowerShell 5.1）：

```powershell
powershell -NoProfile -File companion\windows\shortcut.ps1 -ShortcutDirectory "$PWD\companion"
```

以后开机后打开 `companion\Codex EVA.lnk` 即可，不需要先运行命令或安装开机常驻。默认不指定 `-ShortcutDirectory` 时会生成到桌面。若报告 `SHORTCUT_REFRESH_REQUIRED`，先移除哈希匹配的旧入口再重新创建；用户修改过的链接会保留并报告冲突：

```powershell
powershell -NoProfile -File companion\windows\shortcut.ps1 -Remove
```

v4 快捷方式指向项目内 build/CodexEvaLauncher.exe，它由 windows/ClickLauncher.cs 使用 Windows 自带 .NET Framework 编译器在本地生成，无需下载编译依赖。构建收据验证源文件和二进制哈希，二进制被修改时拒绝覆盖。快捷方式不使用隐藏 PowerShell 命令或 ExecutionPolicy Bypass 参数。启动器内部调用已有 PowerShell 启动流程，不修改系统执行策略。

启动流程会：

1. 检查官方 Codex 安装、执行别名以及已有普通模式实例。
2. 通过 desktop.ps1 -Action Start 启动并核实独立伴随进程。单实例锁复用已有进程，启动器退出后伴随程序继续运行。
3. 用官方 chatgpt-desktop.exe 别名打开 Codex，携带端口 19327 和 loopback 地址，保留官方包身份。
4. 最多等待约 30 秒检查工作台皮肤。工作台已经加载但没有皮肤时显示失败原因；尚未登录或工作台尚未加载时，伴随程序会继续等待。

运行失败会弹出提示，不把进程派发成功等同于主题已经挂载。供终端诊断使用的 build\CodexEvaLauncher.exe --diagnose 执行相同启动流程，将错误写入标准错误并返回非零退出码。

单独启动伴随程序仍可运行：

```powershell
powershell -NoProfile -File companion\windows\desktop.ps1 -Action Start
```

只读查看真实进程和可选自启项使用 desktop.ps1 -Action Status。本次默认方式下 startupEnabled: false 不影响点击启动，关键是 ownerAlive。卸载使用 desktop.ps1 -Action Uninstall；仅移除快捷方式使用 shortcut.ps1 -Remove。入口、图标和 AppData 收据按哈希保护；仓库内 build/ 构建产物保留，可供重新生成入口复用。

不要直接打开版本目录内的 app\ChatGPT.exe，这会丢失官方 MSIX 身份。不要移动 companion 内的源代码、启动脚本或构建目录，否则需重新配置入口。

旧 v1 脚本入口曾被火绒删除；本轮入口是不同的本地编译 EXE 方案，不能用旧扫描结果证明它已通过防护或开机验收。没有关闭防护或添加信任。实际验证范围见 [点击启动记录](../docs/validation/2026-11-01-click-to-start.md)。

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

## 可选的登录自启（非日常启动前提）

```powershell
powershell -NoProfile -File companion\windows\desktop.ps1 -Action Install
```

安装检查 `src/main.mjs` 与 Node 22+，先保存安装收据，再在当前用户 `Run` 键注册直接启动 Node 的命令，不经过 PowerShell。登录时可能显示 Node 控制台，关闭它会停止伴随程序。收据含启动项原值与命令；可将匹配的旧版隐藏脚本命令迁移为新命令，首次安装前的原值保持不变。用户已改过时拒绝覆盖。伴随程序可以先于 Codex 启动，随后发现端口并检查资源指纹。

本机在 2026-11-01 实测启动项成功写入后约一秒消失，具体移除来源未确认；此项不作为本机默认方案。使用上面的点击启动不需要恢复此启动项。

## 卸载 / 恢复

```powershell
powershell -NoProfile -File companion\windows\desktop.ps1 -Action Uninstall
```

卸载先通知伴随程序干净退出（暂停时同样有效），再删除 `settings.json` 与收据。启动项仍与收据一致时恢复安装前的值，原来没有值则删除；用户后改的值保留。Codex 的会话、凭据和项目文件不受影响。

安装收据区分 `prepared` 与 `committed`，保留本次修改前的值和首次安装前的原值。若升级中断，可重新安装继续，或直接卸载恢复；实际启动项与收据两侧都不匹配时报告 `REGISTRY_CONFLICT`，保留用户修改。

若曾用补丁方式修改过 Codex 文件，用 `restorePatch(receipt)` 恢复：仅当目标文件仍等于补丁后哈希时才写回，客户端升级后会被 `PATCH_RESTORE_CONFLICT` 拒绝，不会覆盖新版本。

## 测试

```sh
npm test                     # 契约测试（含 PowerShell 脚本解析、安装/卸载）
```

已安装官方 MSIX 客户端的 Windows 环境可显式运行 `npm run test:msix-entry`：它使用正式脚本收据中验证过的官方别名，以全新空目录和隔离端口启动客户端，验证实际进程的包身份、应用 ID 和 loopback 调试端口；结束时只关闭携带该测试独有数据路径的实例。该项不包含在普通契约或浏览器夹具中，也不证明两个桌宠已完成真实交互验收。

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

人物与机体纹样使用原版的大幅构图：人物位于工作台左侧，按可用宽高等比缩放；独立的绫波丽圆环或明日香多边形纹样位于右侧，可延伸到仪表面板背后。面板保持原布局，装饰避开输入区。实现与验收范围见 [构图验证记录](../docs/validation/2026-10-31-reference-art-layout.md)。

存在多个官方页面时，伴随程序优先接入可见聊天工作台，并保持目标稳定，不按调试页面列表的第一项选择。当前为单会话接入；问题现场与边界见 [主题消失修复记录](../docs/validation/2026-10-31-stable-workbench-target.md)。
