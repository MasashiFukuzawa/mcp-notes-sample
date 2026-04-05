/**
 * Vite でビルドした single-file HTML を TypeScript の文字列定数として埋め込むスクリプト。
 * Cloudflare Workers ではファイルシステムから読めないため、ビルド時にインラインにする。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const htmlPath = join(rootDir, "dist", "mcp-app.html");
const outPath = join(rootDir, "src", "generated", "notes-ui-html.ts");

const html = readFileSync(htmlPath, "utf-8");

// バッククォートとバックスラッシュ、${} をエスケープ
const escaped = html
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const tsContent = `// AUTO-GENERATED — do not edit manually.\n// Run \`npm run build:ui\` to regenerate.\nexport const NOTES_UI_HTML = \`${escaped}\`;\n`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, tsContent, "utf-8");
console.log(`Embedded HTML → ${outPath} (${html.length} bytes)`);
