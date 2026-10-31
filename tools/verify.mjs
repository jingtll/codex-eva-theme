// 独立校验：不信任 build 的自述，重新读一遍产物做往返检查。
// 这些断言存在的意义是——主题文件被改坏时，构建还能「成功」，只有这里会红。

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  contrastReport,
  decodeShareString,
  validateTheme,
} from "./lib/theme.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ ${message}`);
    failures += 1;
  }
}

async function main() {
  const catalog = JSON.parse(await readFile(join(ROOT, "themes/catalog.json"), "utf8"));

  console.log("主题文件");
  for (const entry of catalog.themes) {
    const theme = JSON.parse(await readFile(join(ROOT, "themes", entry.file), "utf8"));

    const errors = validateTheme(theme);
    assert(errors.length === 0, `${entry.id} 符合 chrome theme schema${errors.length ? `：${errors.join("; ")}` : ""}`);

    const rows = contrastReport(theme);
    for (const row of rows) {
      assert(
        row.value >= row.floor,
        `${entry.id} ${row.name} = ${row.value.toFixed(2)}:1 ≥ ${row.floor}:1`,
      );
    }
  }

  console.log("分享串往返");
  for (const entry of catalog.themes) {
    const theme = JSON.parse(await readFile(join(ROOT, "themes", entry.file), "utf8"));
    const share = (await readFile(join(ROOT, "share", `share-${entry.id}.txt`), "utf8")).trim();

    let decoded = null;
    try {
      decoded = decodeShareString(share);
    } catch (error) {
      assert(false, `${entry.id} 分享串可解码：${error.message}`);
      continue;
    }

    assert(decoded.variant === entry.variant, `${entry.id} 分享串 variant = ${entry.variant}`);
    assert(
      JSON.stringify(decoded.theme) === JSON.stringify(theme),
      `${entry.id} 分享串往返后主题一致`,
    );
    assert(share.startsWith("codex-theme-v1:"), `${entry.id} 分享串前缀正确`);
  }

  console.log("配置片段");
  const toml = await readFile(join(ROOT, "share/config.toml"), "utf8");
  for (const entry of catalog.themes) {
    assert(
      toml.includes(`[desktop.${entry.settingsKey}]`),
      `config.toml 含 [desktop.${entry.settingsKey}]`,
    );
    assert(
      toml.includes(`[desktop.${entry.settingsKey}.semanticColors]`),
      `config.toml 含 ${entry.settingsKey} 的 semanticColors`,
    );
  }
  assert(!/fonts\s*=\s*""/.test(toml), "config.toml 没有把空字体写成空字符串");

  if (failures) {
    console.error(`\n✗ ${failures} 项失败`);
    process.exitCode = 1;
  } else {
    console.log("\n✓ 全部通过");
  }
}

await main();
