# v0.1.0 正式发布验证

## 发布范围与授权

2026-11-03，维护者明确要求“全部同步到 main 分支”“release 也发布”“全按正式版发布”。因此将完整实现与文档同步主分支，并以 `v0.1.0` 作为首个公开正式版本；该决定替代此前保留草稿的安排。

任务分支 `chore/v0.1.0-release` 依赖包含全部更新的 `docs/readme-upstream-guide`，基线 `4b7d453`。核对时远端 `main` 为 `972f998`，与基线无分叉、落后 10 个提交，且无其他未被基线包含的本地任务分支。合并采用快进，不重写已发布历史，不删除历史分支。

## 本轮验证

- 根目录 `npm test`：主题生成物一致性、schema、对比度与分享串往返通过。
- `npm test --prefix companion`：104 项，103 通过、1 项 Windows 符号链接权限跳过，0 失败。采用正常桌面权限；相关安装测试使用隔离收据和测试注册表，不修改真实自启配置。
- `npm run test:browser --prefix companion`：12 项通过、0 失败；使用全新无界面 Chrome、独立资料目录与本机端口，结束后关闭本次浏览器进程。
- `npm run test:release`：正式版本号 `0.1.0` 能构建完整 ZIP；解压后验证主题、皮肤资源、指纹探针记录、截图和文档，以及 .NET 启动器编译；ZIP 与逐文件摘要匹配，已有输出拒绝覆盖。
- 文档链接、代码围栏、折叠区域与 `git diff --check` 检查通过。README 的安装源改为 `main`，版本、ZIP 名称及下载入口统一为正式版。

本轮没有退出当前 Codex、重启 Windows、创建真实快捷方式或修改系统执行策略。README 中的三张实图来自本轮之前的真实客户端拍摄，来源和裁剪方式见 [截图说明](../screenshots/README.md)。

## 产物追溯

最终 ZIP 从提交后的干净主分支构建。`release-manifest.json` 记录准确源提交、`sourceTreeDirty: false` 与逐文件摘要，`SHA256SUMS.txt` 记录压缩包摘要。最终源提交和附件摘要以该清单及 GitHub Release 回读结果为准，避免文档内嵌本文件提交自身导致递归版本依赖。

现有草稿转换为 `v0.1.0`，替换前期 beta 附件，公开时关闭 draft 和 prerelease 标记，设为 Latest。正式 Release 应只保留正式 ZIP 与对应校验文件，不混用历史测试包。

## 尚未验证与授权记录

正式版标识表示维护者选择公开分发，不代表以下事项已经完成：干净 Windows 下载标记/安装、真实升级/卸载/重启、真实媒体/额度/提示事件的完整验收、桌宠兼容性与安全软件接受度。

七项素材的来源和摘要已记录，但公开再分发条款仍未完整归档；发布决定不构成素材授权核实。清单继续记录 `assetAuthorization: pending` 和 `cleanMachineAcceptance: pending`，不因改为正式版本而改写事实。代码 MIT 许可与第三方素材权利分开，详见 [NOTICE](../../companion/NOTICE.md)。
