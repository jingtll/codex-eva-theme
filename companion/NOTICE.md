# 素材与许可说明

伴生程序与参考插件的代码采用 [MIT License](LICENSE)（根目录 `LICENSE`）。角色形象、品牌标志、音乐与语音素材的来源单独记录，代码许可证不替代第三方素材的权利说明。

> 以下「存档」与「素材说明」两段沿用参考插件的原文，其中链接指向参考插件自己的 `docs/`，本仓库不包含这些文件。

0.53.0 移除了开屏动画，因此启动背景音乐、启动／选择／欢迎语音、打字音效、闭眼头像、警报与插入栓 SVG 都已归档在 `assets/source/boot/`，**不再随安装包发布**；来源、原文件与校验值记录保留在 [资源清单](docs/assets.md)。

- 背景音乐：鷺巣詩郎《EM20#070720》。项目维护者于 2026-10-24 确认拥有当时的再分发授权，并要求当版随包保留；该音轨已随开屏动画下线，仅作为记录保留在 `assets/source/boot/`。来源与校验值见 [音乐记录](docs/boot-music.md)；该录音不适用代码的 MIT 许可。
- NERV 标志与当前随包的四个角色提示音：由项目维护者提供，用于本主题。原文件对应关系见 [资源清单](docs/assets.md)。
- 角色线稿：根据维护者参考图通过图像生成工具制作；提示词保存在 [docs/prompts/](docs/prompts/)。
- 已归档的闭眼头像、插入栓、警报与打字音效：同样由项目维护者提供或按参考图重绘，说明见 [资源清单](docs/assets.md) 的归档小节。

EVA 角色和品牌相关权利属于其各自权利人。本项目为第三方主题插件。

## 随伴生程序发布的素材

以下七项运行资源从本地参考插件 `dsh-plugin-eva-theme/` 迁移（该目录不入库）。未改动像素或字节；SHA-256 记录当前随仓库内容，变更素材时须同步更新。

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `assets/svg/nerv-logo.svg` | NERV 标志 | `c517c9bc95b38017912ad42f0d7cb0770a0ed15298a881baf2aae484185a18ac` |
| `assets/images/asuka-portrait-lineart.png` | 明日香线稿 | `5487f9519bc1ed122bd0ad6274f7a7debd320d38cccfe9a2fa87eba8b7fd86dd` |
| `assets/images/rei-portrait-lineart.png` | 绫波丽线稿 | `1d22c5a345573e32c1aebc19eb7aeda5cebd8a5b57fc418fbfd9a7b7e39e5fd4` |
| `assets/audio/asuka-voice-approval.mp3` | 明日香待审核提示 | `d968f4878857d35ca370bcb22054b476c6619722ee05d4b7b3a39ed353cba945` |
| `assets/audio/asuka-voice-complete.mp3` | 明日香完成提示 | `f88316c1519c2b4b9fc042777f3352e3f5249c62be8e83cd19fa47370a74ec91` |
| `assets/audio/rei-voice-approval.mp3` | 绫波丽待审核提示 | `6e7870f6bb1ddc1714b59f6f11318c4a0eff1179b29fe538d816182fbacd2d76` |
| `assets/audio/rei-voice-complete.mp3` | 绫波丽完成提示 | `8762550e287c9e3a77e6ad5730f123075225def553eb3a305ab6594d6632992e` |

素材的原始权利说明来自参考插件的 `NOTICE.md`（上文）与 `docs/assets.md`（未随本仓库保留）。角色线稿为按参考图由图像生成工具制作；语音与标志由参考项目维护者提供。仓库中不复现那份清单，因此不在此断言其上未记录的具体授权条款。
