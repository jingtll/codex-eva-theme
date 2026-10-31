// 从 themes/ 生成两份可直接用的产物：
//   share/share-<id>.txt  —— 粘贴进 Codex 设置页「外观」的分享串
//   share/config.toml     —— 直接写进 ~/.codex/config.toml 的片段
// 这两份要提交进仓库（它们是用户真正要拿的东西）；dist/ 只放构建报告。
//
// `--check` 只校验不落盘，用于 CI。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contrastReport,
  encodeShareString,
  validateTheme,
} from "./lib/theme.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_DIR = join(ROOT, "themes");
const SHARE_DIR = join(ROOT, "share");
const DIST_DIR = join(ROOT, "dist");
const CHECK_ONLY = process.argv.includes("--check");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

async function loadCatalog() {
  const raw = await readFile(join(THEMES_DIR, "catalog.json"), "utf8");
  return JSON.parse(raw);
}

function tomlThemeTable(entry, theme) {
  const lines = [
    `[desktop.${entry.settingsKey}]`,
    `accent = "${theme.accent}"`,
    `contrast = ${theme.contrast}`,
    `ink = "${theme.ink}"`,
    `opaqueWindows = ${theme.opaqueWindows}`,
    `surface = "${theme.surface}"`,
    "",
    `[desktop.${entry.settingsKey}.semanticColors]`,
    `diffAdded = "${theme.semanticColors.diffAdded}"`,
    `diffRemoved = "${theme.semanticColors.diffRemoved}"`,
    `skill = "${theme.semanticColors.skill}"`,
  ];

  // TOML 没有 null。字体留空时整张表不写，宿主会用默认字体合并；
  // 写空字符串反而可能被当成一个不存在的字体名。
  const fonts = theme.fonts ?? {};
  const fontEntries = [
    ["ui", fonts.ui],
    ["code", fonts.code],
  ].filter(([, value]) => typeof value === "string" && value.length > 0);

  if (fontEntries.length) {
    lines.push("", `[desktop.${entry.settingsKey}.fonts]`);
    for (const [key, value] of fontEntries) lines.push(`${key} = "${value}"`);
  } else {
    lines.push("", `# fonts 未设置：沿用 Codex 默认字体（见 docs/theme-tokens.md 的字体一节）`);
  }

  return lines.join("\n");
}

async function main() {
  const catalog = await loadCatalog();
  if (!Array.isArray(catalog.themes) || catalog.themes.length === 0) {
    fail("themes/catalog.json 里没有主题条目");
    return;
  }

  const outputs = new Map();
  const report = [];

  for (const entry of catalog.themes) {
    const themePath = join(THEMES_DIR, entry.file);
    const theme = JSON.parse(await readFile(themePath, "utf8"));

    const errors = validateTheme(theme);
    if (errors.length) {
      for (const error of errors) fail(`${entry.id}: ${error}`);
      continue;
    }

    const rows = contrastReport(theme);
    const failing = rows.filter((row) => row.value < row.floor);
    for (const row of failing) {
      fail(`${entry.id}: ${row.name} 只有 ${row.value.toFixed(2)}:1，低于下限 ${row.floor}:1`);
    }

    const share = encodeShareString({
      codeThemeId: entry.codeThemeId ?? "codex",
      theme,
      variant: entry.variant,
    });

    outputs.set(`share-${entry.id}.txt`, share + "\n");
    report.push({ ...entry, theme, contrast: rows });

    console.log(
      `· ${entry.id.padEnd(12)} ${entry.pilot.code} ${entry.pilot.name}  ` +
        rows.map((row) => `${row.name.split(" ")[0]} ${row.value.toFixed(1)}:1`).join("  "),
    );
  }

  if (process.exitCode) return;

  const header = [
    "# Codex EVA 主题 —— 配置片段",
    "#",
    "# 生成自 themes/*.json，不要手改。改色请改主题文件后跑 npm run build。",
    "#",
    "# 用法：把下面的表追加到 ~/.codex/config.toml 末尾，然后重启 Codex。",
    "# 更稳的路径是 share/share-*.txt：在「设置 → 外观」里粘贴导入，可一键还原。",
    "#",
    "# 注意：appearance* 这几张表的 TOML 路径来自宿主设置键推导（[desktop] 段），",
    "# 尚未在本机做视觉验收。若重启后外观没变，请改用分享串导入，并到",
    "# docs/theme-tokens.md「生效路径」一节记录结果。",
    "",
  ].join("\n");

  const body = catalog.themes
    .map((entry) => {
      const theme = report.find((item) => item.id === entry.id)?.theme;
      if (!theme) return "";
      return [
        `# ── ${entry.pilot.code} · ${entry.pilot.name} / ${entry.pilot.en} · ${entry.variant} ──`,
        tomlThemeTable(entry, theme),
        "",
      ].join("\n");
    })
    .join("\n");

  outputs.set("config.toml", header + body);
  const reportJson = JSON.stringify(report, null, 2) + "\n";

  if (CHECK_ONLY) {
    let stale = 0;
    for (const [name, content] of outputs) {
      const target = join(SHARE_DIR, name);
      let current = null;
      try {
        current = await readFile(target, "utf8");
      } catch {
        current = null;
      }
      if (current !== content) {
        fail(`share/${name} 与 themes/ 不一致，请跑 npm run build`);
        stale += 1;
      }
    }
    if (!stale && !process.exitCode) console.log("✓ share/ 与 themes/ 一致");
    return;
  }

  await mkdir(SHARE_DIR, { recursive: true });
  await mkdir(DIST_DIR, { recursive: true });
  for (const [name, content] of outputs) {
    await writeFile(join(SHARE_DIR, name), content, "utf8");
  }
  await writeFile(join(DIST_DIR, "report.json"), reportJson, "utf8");
  console.log(`✓ 生成 ${outputs.size} 个文件到 share/，构建报告在 dist/report.json`);
}

await main();
