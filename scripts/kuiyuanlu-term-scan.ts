/**
 * 窥渊录 · 术语泄漏扫描
 *
 * 扫描用户面代码与 prompt 中的原版修仙词（禁区词），防止「引擎层术语」
 * 泄漏到玩家可见文案。引擎层（src/shared/engine、src/server/lib 引擎常量）
 * 允许保留原词，不在扫描范围。
 *
 * 用法：
 *   bun scripts/kuiyuanlu-term-scan.ts            # 报告模式，只打印，不失败
 *   bun scripts/kuiyuanlu-term-scan.ts --strict   # 有泄漏则退出码 1（供 CI 使用）
 *
 * 白名单：在匹配行尾加注释 `// kuiyuanlu-allow`（或 `/* kuiyuanlu-allow *&#47;`）可豁免该行。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** 扫描范围：玩家可见面（组件/路由/prompt/用户面 lib/共享表现层） */
const SCAN_DIRS = [
  "src/react-app",
  "src/server/prompts",
  "src/shared/lib",
];

/** 额外扫描：任意路径下名为 presentation 的表现层文件 */
const PRESENTATION_PATTERN = /presentation\.(ts|tsx)$/;

/** 禁区词 → 建议替换 */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/雷劫/g, "点灯问渊（渊中应答）"],
  [/天劫/g, "点灯问渊"],
  [/天罚/g, "渊咎"],
  [/天道/g, "天翁/渊"],
  [/灵根/g, "窍 / 八窍"],
  [/金丹/g, "诡胎"],
  [/妖兽/g, "诡异（腌物/遗种/投影）"],
  [/灵石/g, "灯油券"],
  [/丹药/g, "香品"],
  [/炼丹/g, "炼香"],
  [/器灵/g, "灯魂"],
  [/修炼室/g, "静室"],
  [/凝气/g, "守灯"],
  [/渡劫/g, "问渊"],
  [/飞升者?/g, "旧纪元飞升者（仅限旧纪元语境）"],
];

const ALLOW_MARK = "kuiyuanlu-allow";

function collectFiles(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      collectFiles(full, out);
    } else if (entry === "kuiyuanlu-worldbible.md") {
      continue; // 设定圣经本身即术语表，天然包含禁区词
    } else if (/\.(ts|tsx|js|jsx|md|json)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const strict = process.argv.includes("--strict");
const findings: Array<{ file: string; line: number; text: string; hint: string }> = [];

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  for (const file of collectFiles(abs)) {
    const isPresentation = PRESENTATION_PATTERN.test(file);
    if (!SCAN_DIRS.some((d) => file.startsWith(join(ROOT, d)))) continue;
    const source = readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(ALLOW_MARK)) continue;
      for (const [re, hint] of FORBIDDEN) {
        re.lastIndex = 0;
        if (re.test(line)) {
          findings.push({
            file: relative(ROOT, file).split(sep).join("/"),
            line: i + 1,
            text: line.trim().slice(0, 120),
            hint,
          });
          break; // 每行报第一条即可
        }
      }
    }
    void isPresentation; // presentation 文件已在 SCAN_DIRS 内的按路径覆盖
  }
}

// 补扫：全仓库（除引擎/节点模块/声明）中的 presentation.ts 表现层文件
const enginePresentationDirs = ["src/shared/engine", "src/server/lib", "src/react-app"];
for (const dir of enginePresentationDirs) {
  const abs = join(ROOT, dir);
  for (const file of collectFiles(abs)) {
    if (!PRESENTATION_PATTERN.test(file)) continue;
    const rel = relative(ROOT, file).split(sep).join("/");
    if (findings.some((f) => f.file === rel)) continue;
    if (SCAN_DIRS.some((d) => rel.startsWith(`${d}/`))) continue;
    const source = readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(ALLOW_MARK)) continue;
      for (const [re, hint] of FORBIDDEN) {
        re.lastIndex = 0;
        if (re.test(line)) {
          findings.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120), hint });
          break;
        }
      }
    }
  }
}

if (findings.length === 0) {
  console.log("✅ 术语扫描通过：用户面未发现原版禁区词。");
  process.exit(0);
}

const byFile = new Map<string, typeof findings>();
for (const f of findings) {
  const list = byFile.get(f.file) ?? [];
  list.push(f);
  byFile.set(f.file, list);
}

console.log(`⚠️  发现 ${findings.length} 处术语泄漏（${byFile.size} 个文件）：\n`);
for (const [file, list] of [...byFile.entries()].sort()) {
  console.log(`  ${file}`);
  for (const f of list) {
    console.log(`    L${f.line}  建议→${f.hint}\n      ${f.text}`);
  }
}
console.log(`\n合计 ${findings.length} 处。修复或在行尾加 // ${ALLOW_MARK} 豁免。`);
if (strict) process.exit(1);
