# codex-eva-theme

以《新世纪福音战士》配色与视觉语言为灵感的 Codex 主题项目：暗色是明日香，亮色是绫波丽。

仓库提供两种使用方式：下面的外观主题通过宿主设置导入；[Windows 伴随程序](companion/README.md) 提供角色立绘、仪表、媒体控制与提示音。配置一次 EVA 快捷方式后，点击时同时启动伴随程序与官方 Codex，不依赖开机自启；使用条件与验收边界见其说明。

```sh
npm run build    # 从 themes/ 生成分享串与配置片段
npm test         # 一致性检查 + schema/对比度校验
```

## 外观主题的范围

外观主题使用画布、前景、强调色、三个状态色及字体槽位，走宿主自己的设置，可一键还原。

外观主题文件只包含配色与字体，不包含壁纸、覆盖层、时钟、播放器或提示音。字段映射与取舍见 [主题令牌映射](docs/theme-tokens.md)；需要工作台皮肤与配套功能时使用伴随程序。

## 双驾驶员

| 02 · 明日香 / ASUKA LANGLEY | 00 · 绫波丽 / REI AYANAMI |
| :---: | :---: |
| 暗色 · 炭黑底、战斗服红、暖白字 | 亮色 · 瓷白底、冰蓝、近黑字 |

角色不靠插件切换，靠宿主自己的深色／浅色模式：**深色即明日香，浅色即绫波丽**。

## 安装

### 方式一：分享串（推荐）

1. 打开 `share/share-asuka-dark.txt`（暗色）或 `share/share-rei-light.txt`（亮色）。
2. 在 Codex「设置 → 外观」里粘贴导入。
3. 想还原，把外观改回默认主题即可。

### 方式二：写进 config.toml

把 `share/config.toml` 里的表追加到 `~/.codex/config.toml` 末尾，重启 Codex。

> 这张表的 TOML 路径是按宿主设置键推导的，**尚未做视觉验收**。若重启后外观没变，请改用方式一，并在 [生效路径](docs/theme-tokens.md#生效路径) 记下实际情况。

## 改色

只改 `themes/*.json`，然后 `npm run build`。不要手改 `share/` 下的文件——它们由构建覆盖。

`npm test` 会拦住三类错误：字段不符合 Codex 的 schema、出现 Codex 不认识的字段、任一颜色对 `surface` 的对比度跌破下限（正文 7:1，其余 3:1）。

## 目录

```text
themes/          主题源数据（chrome theme 对象）与 catalog
share/           生成物：分享串、config.toml 片段（提交进仓库）
tools/           构建与校验
companion/       Windows 伴随程序、素材、安装脚本与测试
docs/            令牌映射与取舍说明
dsh-plugin-eva-theme/   参考项目，本地副本，不入库
```

## 验证

`npm test` 检查主题产物一致性、字段与对比度；`npm test --prefix companion` 运行伴随程序测试。浏览器夹具使用 `npm run test:browser --prefix companion`，需要先设置指向独立测试浏览器的 `EVA_BROWSER_ENDPOINT`。这些检查不替代真实客户端退出重开、登录自启和桌宠兼容性验收，详见 [验证记录](docs/validation/acceptance.md)。

## 许可

[MIT](./LICENSE)。这是同人主题项目，EVA 的角色与品牌权利归其权利人所有；代码许可不替代第三方素材的权利说明。
