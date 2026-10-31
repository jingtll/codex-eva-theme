# Codex EVA 伴随程序

从原来的 Codex 图标启动 Codex 后，自动给工作台套上 EVA 双角色皮肤：深色为明日香，浅色为绫波丽。

日常不需要新的启动入口。伴随程序开机后驻留托盘，检测到带本机调试端口的 Codex 就接入；没有就显示「等待 Codex 调试入口」。

## 环境要求

- Windows 10/11
- Node.js 22+（`node --version`）
- Windows PowerShell 5.1（安装与托盘用；PowerShell 7 不支持 WinRT 媒体桥的写法）

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

## 安装开机自启

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File companion\windows\install.ps1
```

安装会做三件事：检查 `src/main.mjs` 与 Node 22+；在当前用户 `Run` 键写入启动项；在 `%APPDATA%\CodexEva\install-receipt.json` 留一份收据（含启动项原值与命令）。重复执行是幂等的。

## 卸载 / 恢复

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File companion\windows\uninstall.ps1
```

只删与收据一致的内容：启动项值仍是本程序写入的才删除，被用户改过就保留用户的值；同时删除 `settings.json` 与收据。Codex 的会话、凭据和项目文件不受影响。

若曾用补丁方式修改过 Codex 文件，用 `restorePatch(receipt)` 恢复：仅当目标文件仍等于补丁后哈希时才写回，客户端升级后会被 `PATCH_RESTORE_CONFLICT` 拒绝，不会覆盖新版本。

## 测试

```sh
npm test                     # 契约测试（含 PowerShell 脚本解析、安装/卸载）
```

浏览器布局夹具需要显式给出一个无界面浏览器的调试端点：

```powershell
# 另开一个终端
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --remote-debugging-port=19433 --user-data-dir=%TEMP%\eva-browser about:blank
# 然后
$env:EVA_BROWSER_ENDPOINT="http://127.0.0.1:19433"; npm test
```

静态测试、隔离浏览器测试与真实客户端验收是三类结果，不能互相替代。真实验收记录见 `docs/validation/acceptance.md`。

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
