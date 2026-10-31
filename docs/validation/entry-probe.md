# 接入验证记录

2026-10-29，Windows 本机，实施分支 `feat/full-experience-companion`。

## 已确认

- 当前安装包已由早期设计记录的版本升级；本次静态读取版本为包 `26.1023.6621.0`、内部应用 `26.1023.51421`。安装位置必须动态探测。
- 普通启动的已有进程没有调试参数和监听端口；这一检查使用了获准的只读进程与端口查询。
- 前一安装包的 `chrome.dll` 中标准 fuse 状态为 `010011001`，包含开启的 ASAR 完整性检查。不能将重写 ASAR 作为默认加载方式；当前版本需重新检查，不能只继承旧结论。
- 在独立用户配置、空 Codex 数据目录的客户端上，`--remote-debugging-port=19327 --remote-debugging-address=127.0.0.1` 能启动本机 CDP，目标为 `app://-/index.html`。没有退出或修改原聊天进程。
- CDP 可以读取隔离实例的页面结构与 preload 方法名。`electronBridge.sendMessageFromView` 的 `mcp-request` 路径可以请求 `account/rateLimits/read`，响应为 `mcp-response`，载荷位于 `message`。
- 空账户请求返回“需要账户认证”，没有读取或导出凭据。这验证了请求传递，不证明真实额度数据已验收。
- 当前 Owl 实现拒绝 `Target.createTarget`；布局夹具改用独立无界面 Chrome，不能据此宣称通过了真实 Codex 布局验收。

## 运行策略与边界

接入实现采用已验证的本机 CDP；完整性保护保持原样。普通已运行实例无端点时显示需要重新启动，不结束现有进程。若使用带原图标的快捷方式配置，必须备份原文件并按哈希恢复；MSIX 固定应用入口与普通快捷方式不是同一机制，不能宣称所有固定入口都已支持自动注入。

仍需验证：当前账户真实额度、全体主聊天实时事件、重启后的原入口自动接入、Windows 媒体控制及完整卸载。隔离测试与真实使用验收分别记录。

## 2026-10-31 复核

- 安装包又升级：文件版本 `156.0.8078.48`，内部应用 `26.1027.30824`。当前指纹：`2cde1c59f255f5828fd97b93bf31eb988134c38c3bca8ef4e16e7fc255730fb1`（`src/adapters/` 以此识别本版本；指纹变化即视为未验证版本）。确认入口文件仍需动态发现：本版本 `main` 打包名不再匹配 `main[-.].js`，`diagnose` 对 `mainBundle` 报 `false`，但 `early-bootstrap`、`preload`、`webview` 三项仍在。
- fuse 复核（`chrome.dll` 只读）：`embeddedAsarIntegrityValidation=true`、`onlyLoadAppFromAsar=true`、`nodeOptions=false`、`nodeCliInspect=false`。结论不变：不能重写 ASAR 作为加载方式。
- 普通启动仍未带调试开关。伴随程序的接入路径因此要求用带 `--remote-debugging-port` 的方式启动 Codex；这一点已写入 [验收记录](acceptance.md) 的「已知阻碍」。
- 本机 CDP 目标发现已实现为 `findCodexTarget()`：只接受 `app://-/index.html` 这一主页面目标，且调试套接字必须是本机 loopback；登录页、插件 iframe 与非 loopback 套接字一律拒绝。有单元测试覆盖，尚未在真实 Codex 实例上验收。
