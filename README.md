# Codex EVA Theme

为 Codex 提供 EVA 双角色配色与 Windows 工作台皮肤：**深色明日香，浅色绫波丽**。

**本项目二次开发于 [seaison/dsh-plugin-eva-theme](https://github.com/seaison/dsh-plugin-eva-theme)，在原项目基础上面向 Codex 进行移植与适配。** 感谢上游作者提供的 EVA 双角色主题、视觉设计与组件思路。部分运行素材从原项目的本地参考副本迁移，来源及摘要见 [素材说明](companion/NOTICE.md)。

上游服务于 **DSH / DeepSeek Harness**；本仓库服务于 **Codex**，提供外观分享串与独立 Windows 伴随程序，请按本仓库的步骤安装。本项目为第三方同人项目，与 OpenAI、DSH 或 EVA 权利方没有官方关联。

[快速上手](QUICKSTART.md) · [伴随程序说明](companion/README.md) · [版本发布](https://github.com/jingtll/codex-eva-theme/releases) · [问题反馈](https://github.com/jingtll/codex-eva-theme/issues) · [上游项目](https://github.com/seaison/dsh-plugin-eva-theme)

## 当前状态

截至 2026-11-03，`v0.1.0-beta.1` 已准备完整 Windows 测试包与 SHA-256 校验文件，GitHub Release **保持草稿，尚未公开下载**。素材公开再分发依据与干净 Windows 环境验收仍待完成，完整包暂不作为正式发行版提供。

当前测试基线位于 `chore/github-beta-release` 分支，包含工作台定位、深色线稿笔触与页面可见性修复；默认分支 `main` 尚未包含这批修复。下方源码试用命令明确使用测试分支。发布范围见 [测试版说明](docs/release/v0.1.0-beta.1.md)。

GitHub 自动生成的 `Source code (zip)` 是指定提交的源码快照，不等同于已通过安装验收的成品包。

## 两种使用方式

| 方式 | 能获得什么 | 运行条件 |
| --- | --- | --- |
| 外观主题 | 深浅配色、字体槽位和状态色；可从 Codex 外观设置恢复默认 | 支持相应外观导入功能的 Codex；使用分享串无需 Node.js |
| Windows 伴随程序 | 角色立绘、机体纹样、时钟、额度仪表、系统媒体控制与角色提示音 | Windows、官方 Codex MSIX 客户端及下文列出的运行环境 |

| 02 · 明日香 / ASUKA LANGLEY | 00 · 绫波丽 / REI AYANAMI |
| :---: | :---: |
| 深色 · 炭黑底、战斗服红、暖白字 | 浅色 · 瓷白底、冰蓝、近黑字 |

角色随 Codex 的深色／浅色模式切换。单独导入配色不会启用角色背景、仪表、播放器或声音；完整皮肤由伴随程序提供。

## 与上游的关系

本项目沿用上游的 EVA 双驾驶员视觉方向，并针对 Codex 的页面结构、启动入口、事件与 Windows 媒体能力重新适配。当前实现与上游独立维护，不保证功能或版本同步。

| 范围 | 本仓库的处理 |
| --- | --- |
| 双角色配色与装饰 | 适配 Codex 深浅模式、工作台布局、角色立绘与机体纹样 |
| 宿主接入 | 通过独立伴随程序连接本机调试端点，提供 Codex 页面皮肤与事件适配 |
| 日常启动 | 新增 Codex EVA 快捷方式，同时启动伴随程序和官方 Codex |
| 状态仪表 | 展示使用额度窗口的剩余比例与重置时间；数据缺失时保留未知状态 |
| 媒体与提醒 | 使用 Windows 系统媒体桥；提供人工操作与任务正常完成的角色提示音 |
| 上游其他功能 | 未迁移驾驶员认证开场、选择/装载动画、启动背景音乐、TPS 波形与计费金额估算 |

本仓库采用自己的源码和构建流程，无需另外下载本地参考项目目录。上游插件管理器的安装步骤不适用于本仓库。

## 方式一：导入外观主题

1. 打开 [明日香深色分享串](share/share-asuka-dark.txt) 或 [绫波丽浅色分享串](share/share-rei-light.txt)，复制完整内容。
2. 在 Codex「设置 → 外观」中粘贴导入相应主题。
3. 切换深色／浅色模式查看配色；需要还原时，选择默认外观。

分享串已随仓库提供，直接使用无需安装依赖或运行构建命令。

也提供 [config.toml 配置片段](share/config.toml)。该 TOML 路径根据宿主设置键推导，**尚未完成视觉验收**；如选择手工合并，请先备份现有配置，避免与已有表重复。优先使用分享串导入。字段与限制见 [主题令牌映射](docs/theme-tokens.md)。

## 方式二：运行 Windows 伴随程序

### 环境要求

| 环境 | 要求 |
| --- | --- |
| 系统 | Windows 10/11；macOS、Linux 的完整伴随程序尚未支持 |
| Codex | 已安装并能正常使用的官方 MSIX 客户端；主应用执行别名可用 |
| Node.js | 22 或更高版本；可用 `node --version` 检查 |
| PowerShell | Windows PowerShell 5.1；本流程不使用 PowerShell 7 |
| 编译器 | Windows 自带的 .NET Framework 4.x C# 编译器，首次配置时生成启动器 |
| 安装位置 | 当前用户可写、准备长期保留的完整项目目录 |

项目没有需要通过 `npm install` 安装的第三方运行依赖。完整包未内置 Node.js；`CodexEvaLauncher.exe` 只是启动入口，依赖项目目录中的脚本、源码和素材，不能单独复制使用。

### 获取与首次配置

当前完整包保持草稿，维护者验收可使用源码测试分支。安装 Git 后运行：

```powershell
git clone --branch chore/github-beta-release https://github.com/jingtll/codex-eva-theme.git
cd codex-eva-theme
```

在项目根目录使用 Windows PowerShell 5.1 创建桌面快捷方式：

```powershell
powershell.exe -NoProfile -File .\companion\windows\shortcut.ps1
```

首次配置会从 `ClickLauncher.cs` 编译启动器。需要把快捷方式放在项目内时，可显式指定目录：

```powershell
powershell.exe -NoProfile -File .\companion\windows\shortcut.ps1 -ShortcutDirectory "$PWD\companion"
```

快捷方式位置由安装收据记录；变更位置前先移除原入口。不要在配置后移动项目目录，否则需要重新创建快捷方式。

### 日常使用

1. 如果 Codex 已以普通模式运行，先保存工作并完全退出。
2. 双击 **Codex EVA** 快捷方式；它会核实伴随程序已运行，再通过官方执行别名打开 Codex，并检查皮肤状态。
3. 在 Codex 切换深色／浅色模式，切换对应角色。通过 EVA 托盘菜单打开设置、暂停皮肤或退出伴随程序。

日常使用不依赖开机自启，重复点击会复用伴随程序实例。原官方 Codex 入口保留；启动器不会替你结束已有聊天。不要直接运行 Codex 安装目录中的裸 EXE 来替代此流程。

### 功能与设置

- **工作台皮肤**：角色立绘、机体纹样、扫描线和角色配色；支持背景强度、组件缩放及显示开关。
- **时钟与额度仪表**：按可用额度窗口显示剩余比例与重置时间。剩余额度不是剩余 token 数或当前聊天余额。
- **系统媒体控制**：通过 Windows 系统媒体接口读取可用播放状态，支持播放/暂停及上一首/下一首；可用性取决于播放器是否接入系统媒体接口。
- **角色提示音**：人工操作提醒与主会话任务正常完成提醒，可分别开关、试听并调整音量。不会自动批准操作或推进任务。
- **偏好保存**：伴随程序设置保存在 `%APPDATA%\CodexEva\settings.json`。

皮肤目前显示在新建/已有聊天工作台与 Codex 设置页，图像等其他页面隐藏；多窗口场景只接入一个工作台。详细机制见 [伴随程序说明](companion/README.md)。

## 升级、暂停与卸载

临时停用可通过 EVA 托盘选择暂停；退出伴随程序会停止本次皮肤接入。

升级前从托盘退出伴随程序，在旧目录移除快捷方式，然后完整解压新包或准备新源码目录，再创建入口：

```powershell
powershell.exe -NoProfile -File .\companion\windows\shortcut.ps1 -Remove
```

仅移除快捷方式会保留偏好。不要覆盖正在运行的目录，也不要把旧目录的 `build/` 或本机安装收据复制到新版本。

完整卸载时，在旧项目根目录运行：

```powershell
powershell.exe -NoProfile -File .\companion\windows\desktop.ps1 -Action Uninstall
```

卸载会先退出伴随程序，清理偏好及与收据匹配的入口；用户自行修改过的快捷方式或启动项会保留。确认卸载完成后可删除项目目录。该流程不卸载官方 Codex，也不删除 Codex 会话、凭据与用户项目。

## 兼容性与排错

伴随程序通过本机 loopback 调试端点接入，保持官方安装包原样。已有客户端验证记录对应内部版本 `26.1027.30824`，**运行时以资源指纹而非版本号判断事件适配是否已验证**。客户端升级可能需要重新适配；未验证时会停用事件适配，额度和提醒等功能可能不可用。

只读诊断：

```powershell
node .\companion\src\diagnose.mjs
```

该命令检查安装、版本、指纹与本机调试入口，不启动或关闭 Codex。

| 现象或错误 | 处理方式 |
| --- | --- |
| 只变了配色，没有人物与仪表 | 分享串只提供配色；完整皮肤需要运行伴随程序 |
| NODE_NOT_FOUND | 安装 Node.js 22+，重新打开终端确认版本 |
| CODEX_RESTART_REQUIRED | 保存工作并完全退出普通模式 Codex，再点击 EVA 入口 |
| CODEX_ALIAS_UNAVAILABLE | 检查官方安装和 Windows 应用执行别名注册 |
| SHORTCUT_REFRESH_REQUIRED | 在旧目录移除原快捷方式后重新创建；不要覆盖用户修改过的入口 |
| 皮肤在图像等页面消失 | 当前设计如此；返回聊天工作台或设置页查看 |
| 额度未知、媒体不可用或没有提示音 | 检查客户端指纹、系统媒体来源与对应设置；这些能力尚需真实环境验收 |
| PowerShell 或安全软件阻止脚本 | 核对来源、校验值和完整错误后反馈；不要全局关闭防护或执行策略 |

反馈请使用 [本仓库 Issues](https://github.com/jingtll/codex-eva-theme/issues)，附系统、Node.js 和 Codex 版本、主题模式、复现步骤与完整错误。分享日志或截图前隐去账号、聊天内容、个人路径和其他敏感信息。上游 DSH 专属问题请前往 [上游仓库](https://github.com/seaison/dsh-plugin-eva-theme)。

## 开发与验证

开发和打包需要 Node.js 22+；Windows 专项与打包测试还需要上述系统环境。下列命令在源码仓库根目录运行。

```powershell
npm run build                       # 从 themes/ 生成 share/ 主题产物
npm test                            # 产物一致性、schema、对比度和分享串往返
npm test --prefix companion          # 伴随程序契约与 Windows 专项测试
npm run test:release                 # ZIP 解压、摘要、运行资源与启动器编译回归
```

修改配色时编辑 `themes/*.json`，再运行 `npm run build`；`share/` 是生成物，应与主题源数据一起提交。校验要求正文与背景对比度至少 7:1，其余受检颜色至少 3:1。

浏览器回归需预先启动独立 Chrome/Chromium 测试实例，将其本机调试 HTTP 端点写入 `EVA_BROWSER_ENDPOINT`，再运行：

```powershell
npm run test:browser --prefix companion
```

请使用独立浏览器资料与测试端口。真实 MSIX 入口专项通过 `npm run test:msix-entry --prefix companion` 显式执行，不包含在普通契约测试中。

2026-11-03 记录的结果：伴随程序 103 项通过、1 项符号链接权限跳过；浏览器回归 12 项通过；主题与打包检查通过。自动化检查不替代干净电脑安装、真实升级/卸载、Windows 重启、真实媒体与额度、桌宠兼容性及安全软件接受度验收。详见 [测试版验证记录](docs/validation/2026-11-03-beta-release.md) 与 [验收范围](docs/validation/acceptance.md)。

## 测试包构建

维护者在干净的 Windows 源码工作区运行：

```powershell
npm run release:pack
```

产物位于 `dist/releases/<版本>/`：

- `codex-eva-theme-v<版本>-windows.zip`：完整目录、主题、运行源码、素材与中文说明。
- `SHA256SUMS.txt`：ZIP 的 SHA-256。
- 包内 `release-manifest.json`：源提交、源工作区状态、逐文件摘要及待确认事项。

构建只选取 Git 已跟踪的文件，新增文件须先加入 Git；已有输出目录会拒绝覆盖。可用 `npm run release:pack -- --output <新目录>` 指定新位置。上传前须确认清单的 `sourceTreeDirty` 为 `false`。

构建与发布回归命令依赖 Git 仓库，应在源码检出目录使用；解压运行包支持主题构建和校验，不承诺自我打包。下载包不包含 Node.js、预编译启动器、用户快捷方式、设置、安装收据、日志、缓存或本地参考项目。校验方法见 [快速上手](QUICKSTART.md)。

## 项目结构

```text
themes/                 主题源数据与驾驶员目录
share/                  可直接导入的分享串与 TOML 片段
tools/                  主题构建、校验与测试包工具
companion/
  src/                  发现、会话、事件、额度与生命周期
  client/               工作台皮肤与页面事件适配
  windows/              启动器、快捷方式、媒体桥与卸载
  assets/               人物、标志与角色提示音
  tests/                契约、浏览器与 Windows 专项回归
  NOTICE.md             素材来源、分发边界与摘要
docs/                   主题映射、设计决策、验证与发布说明
QUICKSTART.md           Windows 测试版使用说明
LICENSE                 本仓库代码许可
```

本地 `dsh-plugin-eva-theme/` 为未入库的上游参考副本，不是安装或运行依赖。

## 致谢与许可

再次感谢 [seaison/dsh-plugin-eva-theme](https://github.com/seaison/dsh-plugin-eva-theme) 及其作者。本仓库的 Codex 适配建立在原项目的主题方向与参考资源之上；请保留原项目来源与适用的许可声明。

本仓库代码采用 [MIT License](LICENSE)。EVA 角色、品牌、图像与语音相关权利归相应权利人所有，代码许可不替代第三方素材授权。随包七项素材的来源与 SHA-256 见 [NOTICE](companion/NOTICE.md)；公开再分发依据核实完成前，完整测试包保持草稿。
