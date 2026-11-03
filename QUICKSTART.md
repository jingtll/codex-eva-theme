# Windows v0.1.0 使用说明

这是第三方 EVA 主题与伴随程序，不是 Codex 官方插件或独立客户端。

正式版下载：[GitHub Releases](https://github.com/jingtll/codex-eva-theme/releases/latest)。干净电脑与完整真实功能验收尚未完成，适用范围见下文；第三方素材授权记录见 `companion/NOTICE.md`，不适用代码 MIT 许可。

## 只使用配色

打开 `share/share-asuka-dark.txt`（深色）或 `share/share-rei-light.txt`（浅色），复制整段内容到 Codex「设置 → 外观」导入。恢复时选择默认外观。

## 使用完整皮肤

需要 Windows 10/11、已安装并能正常使用的官方 Codex MSIX 客户端、Node.js 22+、Windows PowerShell 5.1 和 Windows 自带的 .NET Framework 4.x 编译器。无需 npm install；下载包未内置 Node.js，也不能只复制启动器 EXE。

1. 将 ZIP 完整解压到当前用户可写、准备长期保留的目录。不要直接在 ZIP 内启动，不要放在需要管理员权限的目录。
2. 在解压后的顶层目录打开 Windows PowerShell 5.1，执行下面的命令，生成桌面 `Codex EVA` 快捷方式：

   ```powershell
   powershell.exe -NoProfile -File .\companion\windows\shortcut.ps1
   ```

3. 保存工作并完全退出普通模式的 Codex，然后双击桌面的 `Codex EVA`。以后使用该入口即可，同时启动伴随程序与官方 Codex，不需要设置开机自启。程序不会自动结束你的聊天。

首次配置会在解压目录内编译启动器。下载文件若被 Windows 标记为来自互联网，PowerShell 执行策略或安全软件可能阻止脚本；先核验下载来源与下面的 SHA-256，不要全局关闭防护或执行策略。遇到阻止时停止操作，记录完整错误并反馈。

## 核验下载

在 ZIP 所在目录运行：

```powershell
Get-FileHash .\codex-eva-theme-v0.1.0-windows.zip -Algorithm SHA256
```

将结果与随包的 `SHA256SUMS.txt` 对比。解压后的 `release-manifest.json` 记录源提交和每个运行文件的摘要。

## 升级与卸载

升级前从 EVA 托盘退出伴随程序。在旧目录运行 `powershell.exe -NoProfile -File .\companion\windows\shortcut.ps1 -Remove`，再将新 ZIP 解压到新目录并重新创建快捷方式。仅移除快捷方式会保留偏好；不要直接覆盖正在运行的目录，也不要复制旧的 `build/` 或本机收据。

完整卸载时，在旧目录运行：

```powershell
powershell.exe -NoProfile -File .\companion\windows\desktop.ps1 -Action Uninstall
```

卸载会退出伴随程序，清理它的偏好与匹配的入口；用户自行修改过的快捷方式或启动项会保留。确认卸载完成后，可自行删除解压目录。此流程不移除官方 Codex。

## 兼容范围与排错

- 已有本机验证记录对应内部客户端版本 `26.1027.30824`；兼容判断以资源指纹为准，版本号本身不能保证可用。
- 皮肤覆盖新建/已有聊天工作台与设置页，图像等其他页面隐藏。多窗口当前只接入一个工作台。
- 客户端资源指纹未验证时事件适配会停用，额度和提示功能可能不可用。不要关闭指纹检查强行接入。
- `NODE_NOT_FOUND`：安装 Node.js 22+；`CODEX_RESTART_REQUIRED`：先保存并完全退出普通模式实例；`CODEX_ALIAS_UNAVAILABLE`：检查官方安装与应用执行别名。
- 需要诊断时运行 `node .\companion\src\diagnose.mjs`；它只读检查，不启动或关闭 Codex。反馈前检查输出，隐去个人路径及其他敏感信息。
- 完整包尚未完成干净电脑安装、真实升级与卸载、安全软件接受度、真实媒体/额度及桌宠兼容性验收。已有本机和自动化证据见 `docs/validation/`。

源码与问题反馈：[GitHub 仓库](https://github.com/jingtll/codex-eva-theme)。代码许可见 `LICENSE`，素材范围见 `companion/NOTICE.md`。
