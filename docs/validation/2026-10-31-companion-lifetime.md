# 真实无主题故障：伴随程序生命周期

用户反馈：Codex 能打开，但没有 EVA 主题，已确认点击的是项目内 `Codex EVA.lnk`。

## 诊断与真实恢复

初次只读检查显示普通客户端无调试端口，伴随程序锁存在但 PID 已退出。隔离目录对比直接进程启动和 Shell 快捷方式启动，两者均能开放端口，否定“Windows 一律丢弃参数”的假设。旧普通实例运行时，原快捷方式的隔离环境重放仍会复用该实例，不会补开端口。

用户再次明确通过项目内入口重启后，真实主进程已带 `--remote-debugging-port=19327`，OS 确认仅 `127.0.0.1:19327` 监听；此时伴随程序锁已不存在。因此本次阻断在伴随程序生命周期，不能再归因于快捷方式参数。

通过本机 `Win32_Process.Create` 直接启动 Node 后，真实工作台只读标记由 `ownerAlive=false / skin=false / installer=false` 变为三项均 true，输入框和 bridge 均存在。用户随后确认“出现了，但布局有问题”。没有重新启动官方客户端，也没有刷新当前聊天。真实额度已经有非空窗口数据，但刷新恢复、事件覆盖和媒体控制仍不能据此宣称通过。

## 固化与验证

- `start.ps1` 改用本机 Windows 进程管理服务直接启动 Node，父进程为 `WmiPrvSE`，不再依附启动终端的任务对象。该脚本不新增服务、计划任务或安全配置。
- `install.ps1 -StartCompanion` 在安装收据提交后启动本次伴随程序，Run 项仍直接启动 Node。即时启动失败不虚报回滚已提交安装，明确提示配置已保存及启动失败。
- 新增真实 Windows 任务对象回归：把启动者放进关闭即终止子进程的测试任务，再关闭任务。旧 `Start-Process` 方式的测试子进程实际退出（ESRCH），新方式保持存活；结束后只清理测试子进程。
- 只读取主进程的调试参数，避免 Electron 渲染子进程不带该参数、导致诊断误报 `not_observed`。
- 没有重新创建 PowerShell 目标快捷方式，没有更改火绒或添加信任区。

微软说明：[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) 中的子进程任务继承规则明确区分 `CreateProcess` 与 `Win32_Process.Create`。本机的红绿回归与之相符；不能仅凭父进程名推定所有环境均可用，因此创建失败会按 Windows 返回码报告。

复现及只读标记证据在忽略目录 `.cache/check-live-theme.mjs`、`.cache/shell-entry-probe-result.json`、`.cache/exact-link-probe-result.json`、`.cache/durable-start-tests.log`。这些探针不读取聊天内容或凭据；不能把隔离登录页验证代替真实工作台验收。
