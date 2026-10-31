// Codex 外观主题的契约层：字段校验、对比度计算、分享串编解码。
//
// 这份 schema 不是我们发明的，是从 Codex Desktop 的 chrome theme 定义里读出来的。
// 只有 7 个字段，没有壁纸、没有覆盖层、没有圆角——凡是超出的想法都必须在这里被拒掉，
// 而不是写进主题文件等着被宿主静默忽略。

const HEX = /^#[0-9a-fA-F]{6}$/;

/** 分享串前缀，解码时按 15 个字符切片。 */
export const SHARE_PREFIX = "codex-theme-v1:";

/** 主题对象必须恰好包含这些键（多一个少一个都不行）。 */
export const REQUIRED_KEYS = [
  "accent",
  "contrast",
  "fonts",
  "ink",
  "opaqueWindows",
  "semanticColors",
  "surface",
];

const SEMANTIC_KEYS = ["diffAdded", "diffRemoved", "skill"];

function isHex(value) {
  return typeof value === "string" && HEX.test(value);
}

function checkFace(face, path, errors) {
  if (face === undefined) return;
  if (face === null || typeof face !== "object" || Array.isArray(face)) {
    errors.push(`${path} 必须是对象`);
    return;
  }
  for (const key of ["family", "fullName", "postscriptName"]) {
    if (typeof face[key] !== "string") errors.push(`${path}.${key} 必须是字符串`);
  }
}

/**
 * 校验一个 chrome theme 对象，返回错误列表（空数组表示通过）。
 * 只认 Codex 真实消费的字段，不做宽松兼容。
 */
export function validateTheme(theme) {
  const errors = [];
  if (theme === null || typeof theme !== "object" || Array.isArray(theme)) {
    return ["主题必须是对象"];
  }

  const keys = Object.keys(theme).sort();
  const expected = [...REQUIRED_KEYS].sort();
  if (keys.join(",") !== expected.join(",")) {
    const missing = expected.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !expected.includes(k));
    if (missing.length) errors.push(`缺少字段：${missing.join(", ")}`);
    if (extra.length) errors.push(`多余字段（Codex 不认识，会被静默丢弃）：${extra.join(", ")}`);
  }

  for (const key of ["accent", "ink", "surface"]) {
    if (!isHex(theme[key])) errors.push(`${key} 必须是 #rrggbb`);
  }

  if (!Number.isInteger(theme.contrast) || theme.contrast < 0 || theme.contrast > 100) {
    errors.push("contrast 必须是 0–100 的整数");
  }

  if (typeof theme.opaqueWindows !== "boolean") {
    errors.push("opaqueWindows 必须是布尔值");
  }

  const fonts = theme.fonts;
  if (fonts === null || typeof fonts !== "object" || Array.isArray(fonts)) {
    errors.push("fonts 必须是对象");
  } else {
    for (const key of ["ui", "code"]) {
      if (!(key in fonts)) errors.push(`fonts.${key} 必须存在（无字体时显式写 null）`);
      else if (fonts[key] !== null && typeof fonts[key] !== "string") {
        errors.push(`fonts.${key} 必须是字符串或 null`);
      }
    }
    for (const key of ["uiFace", "codeFace", "contentFace"]) {
      checkFace(fonts[key], `fonts.${key}`, errors);
    }
  }

  const semantic = theme.semanticColors;
  if (semantic === null || typeof semantic !== "object" || Array.isArray(semantic)) {
    errors.push("semanticColors 必须是对象");
  } else {
    for (const key of SEMANTIC_KEYS) {
      if (!isHex(semantic[key])) errors.push(`semanticColors.${key} 必须是 #rrggbb`);
    }
  }

  return errors;
}

function channelLuminance(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 相对亮度。 */
export function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** WCAG 对比度，1–21。 */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 对比度下限。阈值取 WCAG AA：
 * 正文 7:1（AAA 级正文，EVA 皮肤的可读性优先于「像仪表」），
 * 强调色与状态色按 UI 组件算 3:1。
 */
export const CONTRAST_FLOOR = {
  ink: 7,
  accent: 3,
  semantic: 3,
};

export function contrastReport(theme) {
  const surface = theme.surface;
  return [
    { name: "ink on surface", value: contrastRatio(theme.ink, surface), floor: CONTRAST_FLOOR.ink },
    { name: "accent on surface", value: contrastRatio(theme.accent, surface), floor: CONTRAST_FLOOR.accent },
    ...SEMANTIC_KEYS.map((key) => ({
      name: `${key} on surface`,
      value: contrastRatio(theme.semanticColors[key], surface),
      floor: CONTRAST_FLOOR.semantic,
    })),
  ];
}

/** 编码成 Codex 设置页可直接粘贴的分享串。 */
export function encodeShareString({ codeThemeId = "codex", theme, variant }) {
  if (variant !== "light" && variant !== "dark") {
    throw new Error(`variant 必须是 light 或 dark，收到 ${variant}`);
  }
  return SHARE_PREFIX + JSON.stringify({ codeThemeId, theme, variant });
}

/** 解码分享串，返回 {codeThemeId, theme, variant}。 */
export function decodeShareString(input) {
  const text = String(input).trim();
  if (!text.startsWith(SHARE_PREFIX)) throw new Error("分享串前缀不匹配");
  const body = text.slice(SHARE_PREFIX.length);
  const json = body.startsWith("{") ? body : decodeURIComponent(body);
  const parsed = JSON.parse(json);
  const errors = validateTheme(parsed.theme);
  if (errors.length) throw new Error(`分享串里的主题不合法：${errors.join("; ")}`);
  return parsed;
}
