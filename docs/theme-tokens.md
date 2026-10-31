# 主题令牌映射

这份文档回答一个问题：`dsh-plugin-eva-theme` 里那 107 个官方别名令牌，为什么到 Codex 只剩下 7 个字段，以及剩下的是哪几个。

## 契约：Codex 只认这 7 个字段

主题对象的 schema 是从 Codex Desktop 的 chrome theme 定义里读出来的（`appearanceLightChromeTheme` / `appearanceDarkChromeTheme`），不是我们定的：

| 字段 | 类型 | 约束 |
| :--- | :--- | :--- |
| `accent` | `#rrggbb` | 强调色，同时是焦点环与品牌色 |
| `ink` | `#rrggbb` | 前景/文本基色 |
| `surface` | `#rrggbb` | 表面基色，**只能是纯色** |
| `contrast` | int | 0–100 |
| `opaqueWindows` | bool | `false` 时走系统材质（Windows Mica/亚克力、macOS vibrancy） |
| `semanticColors` | `{diffAdded, diffRemoved, skill}` | 三个 `#rrggbb` |
| `fonts` | `{ui, code, content, uiFace, codeFace, contentFace}` | 字体名 + 可选字体三元组 |

除此之外没有任何可配置项。全部外观设置键只有 6 个：

```
appearanceTheme / appearanceLightChromeTheme / appearanceDarkChromeTheme
appearanceLightCodeThemeId / appearanceDarkCodeThemeId / appearanceDiffMarkerStyle
```

## 映射：DSH 令牌 → Codex 字段

取的是 DSH 色板里承担「语义根」的那几个值，其余全部由宿主从这 4 个色位派生。

| Codex 字段 | 明日香 · 暗色 | 绫波丽 · 亮色 | 取自 DSH 令牌 |
| :--- | :--- | :--- | :--- |
| `surface` | `#0d0f13` | `#eff6fa` | `bg-base` |
| `ink` | `#fff1e7` | `#203849` | `label-primary` |
| `accent` | `#ff354d` | `#176b91` | `brand-primary` |
| `semanticColors.diffAdded` | `#8dc358` | `#267263` | `state-success-primary` |
| `semanticColors.diffRemoved` | `#ff8494` | `#ad3d57` | `state-error-primary` |
| `semanticColors.skill` | `#e5a24f` | `#926008` | `state-warn-primary` |
| `opaqueWindows` | `false` | `false` | —— |
| `contrast` | `55` | `45` | 无对应，见下 |

## 107 → 7：被丢掉的是什么

DSH 那份插件的识别度有相当一部分来自这些令牌，它们在 Codex 里**没有落点**：

| DSH 里存在 | Codex 侧 |
| :--- | :--- |
| `border-l1..l4` 四级角色色发丝线 | 无边框令牌 |
| `bg-layer-1..3` 表面分层 | 只有单个 `surface` |
| `interactive-bg-hover*`、`button-*` | 无交互态令牌 |
| `scrollbar-*`、`menu-*`、`toast-*`、`tooltip-*` | 无组件级令牌 |
| `markdown-*`、`code-diff-*` | 只有 `semanticColors.diffAdded/diffRemoved` |
| 扫描线、暗角、硬边（圆角归零）、明朝体标题 | 无装饰层入口 |

**结论**：Codex 的主题是「一个纯色画布 + 一个前景 + 一个强调色」，不是令牌系统。想在这里还原 DSH 的层次感，唯一能用的手段是**选准这四个色位**，让宿主自己的派生逻辑去生成中间的灰阶。

## `contrast` 是什么（未验证）

`schema` 只给了 `int 0–100` 的约束，没有文档说明它作用在哪一层（推测是边框/分隔线的对比强度，而不是文本对比度——文本可读性由 `ink`/`surface` 决定）。这里给暗色 55、亮色 45 是基于「暗底需要更强的结构线才看得见」的经验值，**没有做过视觉验收**。如果你实测出它的真实行为，改 `themes/*.json` 后重跑 `npm run build` 即可。

## 字体

`fonts.ui` 与 `fonts.code` 是**直接塞进 `font-family` 的 CSS 值**，所以可以写完整字体栈——这一点由社区仓库 [`miniLV/Anthropic-codex-theme`](https://github.com/miniLV/Anthropic-codex-theme) 的实际产物验证过：

```json
"fonts": {
  "code": "\"JetBrains Mono\", ui-monospace, \"SFMono-Regular\", \"Cascadia Mono\", Menlo, Consolas, monospace",
  "ui": "\"DM Sans\", system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
}
```

（早期版本的本文档写的是「只能填单个 family 名」，那是错的，已更正。）

需要精确到具体字形时，另有 `uiFace`/`codeFace`/`contentFace` 三元组 `{family, fullName, postscriptName}`，用于指定已安装字体的精确字面。

默认主题里 `fonts.ui` / `fonts.code` 仍是 `null`（沿用宿主默认）。原因是 DSH 那套「明朝体只上大字号」的策略在 Codex 里没有落点——只有 ui/code 两个槽，硬换字体只会让正文变难读。要开的话，把栈里第一项换成系统真实安装的字体，再跑 `npm test`。

## 生效路径

| 路径 | 状态 | 说明 |
| :--- | :--- | :--- |
| **分享串**（`share/share-*.txt`） | 已在代码层往返验证 | 格式 `codex-theme-v1:` + `JSON.stringify({codeThemeId, theme, variant})`。在「设置 → 外观」导入，可一键还原 |
| **config.toml 表**（`share/config.toml`） | **未做视觉验收** | 表路径按宿主设置键推导为 `[desktop.appearanceDarkChromeTheme]`（因为 `appearanceTheme` 位于 `[desktop]` 段）。若重启后外观没变，说明推导有误，请记录实际路径 |

两条路径的产物都由 `themes/*.json` 生成，改色只改主题文件。

## 对比度策略

阈值按 WCAG AA：正文 `ink` 对 `surface` 要求 ≥ 7:1，强调色与状态色 ≥ 3:1。实测：

| 主题 | ink | accent | diffAdded | diffRemoved | skill |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 明日香 · 暗色 | 17.34 | 5.36 | 9.21 | 8.20 | 8.78 |
| 绫波丽 · 亮色 | 11.16 | 5.42 | 5.24 | 5.37 | 4.93 |

`tools/verify.mjs` 会在任一项跌破下限时失败——这是唯一能拦住「为了好看把文字调糊」的机制。
