# Codex EVA 伴随程序实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户自己的 Windows 环境中，通过用户已允许新增的 `Codex EVA` 快捷方式启动官方客户端并自动接入完整皮肤，保留原 MSIX 入口（2026-10-31 决定更新）。

**Architecture:** 伴随程序负责托盘、客户端探测、加载生命周期及原生媒体；页面皮肤负责视觉和设置。版本适配器只订阅已验证的任务、额度事件；优先无文件修改的接入方式，必要时使用经过备份和恢复验证的配置或补丁。

**Tech Stack:** Node.js 22+ 的标准库及内置测试工具、JavaScript/CSS、Windows PowerShell 5.1／WinForms／GSMTC。优先复用参考插件已存在的素材和 Windows 媒体能力，不增加前端框架。若实际连接需要其他运行时或库，先以可复现的验证结果说明原因。

**Spec:** [完整设计](../specs/2026-10-27-full-experience-design.md)、[接入取舍](../../adr/0001-companion-with-reversible-integration.md)、[术语表](../../../GLOSSARY.md)。

## 当前进度（2026-10-31 后续修复）

下表是当前交付状态；下方原始步骤保留执行要求，不能把已有实现提交当作真实客户端验收完成。

| 任务 | 实现与自动化证据 | 尚未满足的验收门槛 |
| --- | --- | --- |
| 1 只读诊断 | 已提交；本机版本与资源指纹再次确认 | 无新增门槛 |
| 2 可恢复接入 | CDP、哈希恢复及真实模块浏览器集成已通过；新增可恢复快捷方式；隔离官方实例连接与登录页不注入已验证 | 从新入口启动真实账号及完整工作台仍待独立验收 |
| 3 额度与事件 | 额度、事件去重、限流退避及兼容诊断已实现并回归 | 真实账户、全部主聊天与多窗口覆盖待验收 |
| 4 双角色工作台 | 两种主题、布局与刷新设置回归通过 | 真实客户端截图、选区与拖窗待验收 |
| 5 媒体与声音 | 媒体生命周期回归通过；真实 Windows 只读查询返回 NO_MEDIA | 真实音源的控制、切歌及角色声音听感待验收 |
| 6 托盘与安装卸载 | 真实托盘、测试键恢复、暂停卸载、收据失败保护通过；真实自启已配置，项目内入口已安装回读 | Windows 重启、自启效果和真实环境卸载待验收；桌面入口被移除的来源未定位 |

用户已允许新增快捷方式，接入路线已按新决定落地；**完整体验仍待真实账号和重启验收**。原 MSIX 入口保留，当前 Codex 未被重启。详见 [新增入口记录](../../validation/2026-10-31-desktop-shortcut-entry.md) 和 [验收记录](../../validation/acceptance.md)。

## Global Constraints

- 第一版只面向用户自己的 Windows 环境；公开分发与其他平台另行设计。
- 用户从新增 `Codex EVA` 快捷方式启动，由伴随程序自动接入；保留原 MSIX 入口（2026-10-31 用户确认）。
- 伴随程序开机自动运行并驻留托盘。
- 深色为明日香，浅色为绫波丽，跟随页面实际生效的主题。
- 默认开启角色线稿、机体纹样、扫描线及仪表；尊重减少动态效果，不遮挡输入、代码及审批。
- 同时展示主要额度窗口的剩余百分比及重置倒计时，展开查看详情。
- 删除 TPS 及其波形，不采集输出速度。
- 所有主聊天的待审核及正常完成均提醒，包括后台聊天；子任务不单独播放，同一事件跨窗口只提醒一次。
- 配置和补丁须备份、兼容检查并可卸载恢复；先明确具体修改范围和恢复方案。
- 不为实验退出当前工作聊天，不修改用户项目、凭据或会话内容。
- 保留当前未提交的根目录主题草稿。新代码位于 `companion/`，不提交其他任务的改动。
- 不将静态测试、隔离浏览器测试或构建成功称为真实客户端验收。

## Review Focus

1. Codex 更新后文件已变化：恢复必须拒绝覆盖新文件；由任务 2 的哈希冲突测试覆盖。
2. 额度字段为 null、多个额度桶或缓存过期：不得显示虚假 100%；由任务 3 的额度测试覆盖。
3. 历史回放、失败取消、子任务及多窗口重复事件：不得误播完成音；由任务 3 的事件测试覆盖。
4. 宿主弹窗、右侧面板、窄窗口及减少动态效果：输入与审批仍可用；由任务 4 的浏览器验收覆盖。
5. 媒体切歌期间旧读取返回、桥进程超时及 Codex 退出：不得回写旧状态或遗留轮询；由任务 5、6 的生命周期测试覆盖。

## 文件与接口约定

- `companion/package.json`：独立脚本 `test`、`diagnose`、`start`，不依赖根目录未提交的 package。
- `companion/src/asar.mjs`：只读资源索引和指定文本读取，不执行宿主代码。
- `companion/src/discovery.mjs`：安装、进程、版本与候选连接信息；不输出完整命令行。
- `companion/src/cdp.mjs`：有请求 ID、超时、关闭清理的调试连接，仅用于实际验证可行的方式。
- `companion/src/integration.mjs`：安装／卸载事务，修改前备份，基于哈希恢复。
- `companion/src/quota.mjs`：额度规范化；`normalizeQuota(payload, nowMs)` 返回各桶的窗口和时间信息。
- `companion/src/events.mjs`：`createNotifier()` 返回 `accept(event)`，输出提醒或 null。
- `companion/src/adapters/`：以真实资源指纹识别的版本适配器，不把编译文件名当通用接口。
- `companion/client/skin.js`、`skin.css`：自有挂载根、组件和可回收的页面生命周期。
- `companion/assets/`、`NOTICE.md`：迁移的七项运行资源及来源、许可、哈希记录。
- `companion/src/media.mjs`、`windows/system-nowplaying.ps1`：有超时、串行命令和来源校验的 GSMTC 桥。
- `companion/windows/tray.ps1`：WinForms 托盘与固定操作，通过结构化消息与 Node 程序交互。
- `companion/src/main.mjs`：单实例、发现、连接、偏好及停止的编排。
- `companion/windows/install.ps1`、`uninstall.ps1`：本用户启动项与集成的安装恢复，不需要新建 EVA 日常启动入口。
- `companion/tests/`：Node 契约测试与隔离浏览器夹具。
- `docs/validation/`：接入诊断、测试结果与真实客户端验收记录；不包含凭据、私密会话或完整宿主代码。

额度窗口统一为 `{usedPercent, remainingPercent, resetsAt, windowDurationMins}`；无效或缺失字段保持 null。额度桶保留 `id`、名称及各窗口，不把不同桶混合。宿主事件统一为 `{hostId, threadId, turnId, type, status, isSubagent, replay}`；`type` 为 `started | approval | completed`，`status` 原样映射后只对确认正常完成提醒。

### Task 1: 建立可复现的只读接入诊断

**Files:** 新建 `companion/package.json`、`src/asar.mjs`、`src/discovery.mjs`、`src/diagnose.mjs`、`tests/asar.test.mjs`、`tests/discovery.test.mjs`、`docs/validation/entry-probe.md`。

**Interfaces:** `openAsar(path)` 返回带 `list()`、`readText(path, maxBytes)`、`close()` 的只读对象；`isCodexTarget(target, expectedOrigin)` 判定已确认的页面目标。诊断报告只含版本、资源指纹、端点状态和证据结论。

- [ ] 写临时微型 ASAR 的有效读取、截断头、非法 offset、目录逃逸和尺寸上限测试，以及目标隔离测试。例如：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isCodexTarget } from '../src/discovery.mjs';
test('拒绝登录页和插件子页面', () => {
  assert.equal(isCodexTarget({type:'page',url:'https://chatgpt.com/auth/login'}, 'app://-'), false);
  assert.equal(isCodexTarget({type:'iframe',url:'app://-/index.html'}, 'app://-'), false);
});
```

- [ ] 执行 `node --test companion/tests/asar.test.mjs companion/tests/discovery.test.mjs`，确认因缺失能力失败，再实现最小解析与诊断，重跑通过。
- [ ] 运行 `node companion/src/diagnose.mjs`，只读检查本机版本、启动开关和候选端点，禁止为了验证而关闭或重启当前 Codex。
- [ ] 在 `entry-probe.md` 分别写“静态确认”“运行确认”“尚未确认”。若普通启动无端点，仅记录事实，不用开发构建环境变量冒充发行版能力。
- [ ] 提交诊断与证据：`feat: add read-only Codex integration diagnostics`。

### Task 2: 验证页面加载与可恢复接入

**Files:** 新建 `src/cdp.mjs`、`src/integration.mjs`、`src/adapters/<实测指纹>.mjs`、`tests/cdp.test.mjs`、`tests/integration.test.mjs`；更新 `docs/validation/entry-probe.md`。

**Interfaces:** `connectCdp(url)` 返回 `send(method, params)`、`on(method, listener)`、`close()`；`applyPatch({path, expectedHash, content, backupDir})` 返回恢复收据，`restorePatch(receipt)` 只在当前文件匹配补丁后哈希时恢复。适配器返回真实入口、事件与额度能力，不假定它们都可用。

- [ ] 为模拟调试服务编写乱序响应、请求超时、断开清理测试；为临时文件写备份、二次安装、失败恢复及升级冲突测试：

```js
test('恢复拒绝覆盖升级后的文件', async () => {
  const receipt = await applyPatch({path: target, expectedHash: originalHash, content: patch, backupDir});
  await writeFile(target, upgraded);
  await assert.rejects(() => restorePatch(receipt), /HASH_CONFLICT/);
  assert.deepEqual(await readFile(target), upgraded);
});
```

- [ ] 先运行 `node --test companion/tests/cdp.test.mjs companion/tests/integration.test.mjs` 确认失败，再实现请求关联、超时、事务备份与哈希恢复；重跑通过。
- [ ] 实测首选入口；若必须一次性配置或补丁，先在 `entry-probe.md` 明确目标文件／配置、预期哈希、改动内容、备份位置与恢复命令。对临时副本验证恢复成功，不修改完整性策略或扩展到自建客户端。
- [ ] 在允许的独立验收窗口验证页面加载单个可删除标记、重载恢复、卸载无残留、仅限目标页面。若必须结束当前聊天才能继续，保留代码与诊断，安排验收窗口，不自行中断当前聊天。
- [ ] 接入未证实前不开始任务 4 的真实客户端移植；记录不可行的明确证据。提交：`feat: add verified reversible client integration`。

### Task 3: 真实额度和主聊天事件

**Files:** 新建 `src/quota.mjs`、`src/events.mjs`、`tests/quota.test.mjs`、`tests/events.test.mjs`；更新版本适配器。

**Interfaces:** `normalizeQuota(payload, nowMs)`；`createNotifier().accept(event)` 返回 `{kind, hostId, threadId, turnId}` 或 null。适配器保留来源桶信息、接收时间，验证桥接消息来源及结构。

- [ ] 写 null／缺失百分比、越界、重置时间缺失、多桶、刷新失败旧值标记等测试；写历史重放、子任务、取消失败、审批到完成、主机会话隔离及跨窗口重复测试：

```js
test('正常完成只提醒一次', () => {
  const notifier = createNotifier();
  const event = {hostId:'local',threadId:'a',turnId:'1',type:'completed',status:'completed',isSubagent:false,replay:false};
  assert.equal(notifier.accept(event).kind, 'completed');
  assert.equal(notifier.accept(event), null);
});
```

- [ ] 先运行 `node --test companion/tests/quota.test.mjs companion/tests/events.test.mjs` 确认失败，再实现；额度剩余为 `clamp(100 - usedPercent, 0, 100)`，仅有限数字参与计算，重跑通过。
- [ ] 从实测的当前用户会话路径订阅额度与事件；核查 MessagePort 与普通页面消息的差异。不读取或输出认证令牌，不通过模型调用刷新额度；未找到来源时返回能力不可用，不能用夹具数据替代。
- [ ] 验证前台五分钟刷新、手动刷新、后台暂停、服务端限流退避及旧请求不能覆盖新账户状态。提交：`feat: add remaining quota and reliable task notifications`。

### Task 4: 双角色完整工作台

**Files:** 新建 `client/skin.js`、`client/skin.css`、`assets/`、`NOTICE.md`、`tests/client.test.mjs`、`tests/fixtures/workbench.html`、`tests/browser.mjs`。

**Interfaces:** 页面仅挂载 `#codex-eva-root` 和自有样式；`mountEva({document, bridge, settings})` 返回 `updateState(state)`、`dispose()`。`bridge` 仅提供结构化额度／任务／媒体操作和偏好读取保存，不提供任意脚本执行给页面组件。

- [ ] 写浏览器夹具，测试主题手动切换、重复挂载、卸载、缩放／窄窗口／右侧面板、模态审批、减少动态效果与数据缺失。测试实际布局行为，不以源码是否包含字符串作为成功依据。

```js
const root = page.locator('#codex-eva-root');
await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
await expect(root).toHaveAttribute('data-pilot', 'asuka');
await page.evaluate(() => window.evaFixture.dispose());
await expect(root).toHaveCount(0);
await expect(page.getByRole('button', {name:'批准操作'})).toBeEnabled();
```

- [ ] 先运行夹具测试确认失败，再实现最小挂载、可回收订阅与组件；使用当前已有浏览器工具或已安装浏览器运行，不为此引入产品依赖。
- [ ] 按参考清单迁移 `nerv-logo.svg`、两张 `*-portrait-lineart.png`、四个审核／完成 MP3；记录 SHA256、来源和原许可，不打包已归档开屏资源或整个参考项目。
- [ ] 实现暗色明日香、浅色绫波丽、02／00 图形、扫描线、真实时钟、额度仪表、按真实媒体会话显示的播放器；删除 TPS 和 DSH 计费。设置支持大小、背景强度、组件开关、音量、分别试听和重置。
- [ ] 对夹具和实机分别截图检查两种主题；客户端升级后选区与拖窗行为保持可用。提交：`feat: add EVA dual-pilot workbench skin`。

### Task 5: 系统音乐和角色声音

**Files:** 新建 `src/media.mjs`、`windows/system-nowplaying.ps1`、`tests/media.test.mjs`、`tests/sound.test.mjs`；更新页面桥接与版本适配器。

**Interfaces:** `createMediaBridge({signal})` 提供 `read()`、`control(action, sourceId)`、`close()`；动作仅为 `play | pause | next | previous`。`playCue({pilot, kind, volume})` 使用自有资源路径，拒绝任意文件路径。

- [ ] 为子进程超时、断线、非法动作、命令顺序、来源变更、过期读返回及关闭后无待处理请求写测试：

```js
test('拒绝任意媒体动作', async () => {
  const bridge = createMediaBridge({signal: controller.signal});
  await assert.rejects(() => bridge.control('shell', 'player'), /INVALID_ACTION/);
  await bridge.close();
});
```

- [ ] 先运行 `node --test companion/tests/media.test.mjs companion/tests/sound.test.mjs` 确认失败，再移植参考项目 Windows GSMTC 部分；不引入其 DSH 余额接口及 macOS 代码。
- [ ] 选择经 CSP 和实际播放验证的本地音频路径；若页面播放受限，在原生桥播放已允许的固定文件，不全局放宽 CSP。验证浏览器自动播放限制、音量、静音及连续提示排队。
- [ ] 在真实 Windows 系统媒体会话上验证上一首、下一首、暂停、来源切换；只读验证不能替代控制验收。正常完成与审核声音按当前驾驶员播放，所有主聊天去重由 Node 单实例负责。
- [ ] 提交：`feat: integrate Windows media and pilot audio cues`。

### Task 6: 开机托盘、安装卸载与最终验收

**Files:** 新建 `src/main.mjs`、`windows/tray.ps1`、`windows/install.ps1`、`windows/uninstall.ps1`、`tests/lifecycle.test.mjs`、`tests/install.test.mjs`、`companion/README.md`、`docs/validation/acceptance.md`。

**Interfaces:** `startCompanion(options)` 返回 `pause()`、`resume()`、`stop()`；安装收据包含本程序创建的启动项、备份和版本。卸载仅删除与收据匹配的自有内容，系统媒体进程以隐藏窗口运行。

- [ ] 写单实例、重复开关、Codex 未运行时无媒体／额度轮询、退出清理、断线重连，以及安装重复执行／用户后改启动项不被覆盖的测试：

```js
test('停止后没有连接和待执行轮询', async () => {
  const instance = await startCompanion(fixtureOptions);
  await instance.stop();
  assert.equal(fixtureRuntime.connectionCount, 0);
  assert.equal(fixtureRuntime.pendingPollCount, 0);
});
```

- [ ] 先运行 `node --test companion/tests/lifecycle.test.mjs companion/tests/install.test.mjs` 确认失败，再实现主程序、WinForms 托盘和本用户开机启动项。托盘含暂停／恢复、设置、退出，固定动作不接受任意命令。
- [ ] 运行 `node --test companion/tests/*.test.mjs`，浏览器夹具回归，以及 Windows 媒体桥测试；只在产生新变化或失败时重复相关检查。
- [ ] 在真实客户端验证：原图标启动、两种主题、前后台主聊天、审核／完成／失败／取消／子任务、多窗口去重、主要额度窗口及过期状态、音乐、缩放布局、暂停恢复、退出重入、卸载和升级冲突恢复。记录实际版本、执行项目、通过／失败／未验收，不虚报结果。
- [ ] 文档给出实际可用的安装与恢复命令。若关键目标未通过，交付代码与准确阻碍，不宣称完整体验完成。最终审阅分支与设计一致性，修复发现后提交：`feat: ship recoverable EVA companion lifecycle`。

## 执行与提交说明

六项任务按依赖顺序执行；任务 1、2 作为真实入口的先决条件。每项任务形成一个有意义的实现提交，共六次，不为凑次数拆分。当前设计分支只包含设计提交；实施前创建依赖当前设计分支的 `feat/full-experience-companion`，说明依赖，不把未提交的根目录草稿混入提交。

建议由当前代理在本会话逐项执行，减少事件适配器与加载机制之间的沟通成本；结束时独立审阅整个实现分支。执行方法与本计划需用户审阅确认后启动代码实施。
