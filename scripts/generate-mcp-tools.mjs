#!/usr/bin/env node
// scripts/generate-mcp-tools.mjs
//
// server/src/contexts/mcp/tools/*.tools.ts の server.registerTool('name', { title, ... })
// を走査して MCP ツールカタログを構造化 JSON に変換し、
// client/public/mcp-tools.json として書き出す。
// クライアント（各アプリのヘッダー「MCP コネクタ」モーダル）はこの静的ファイルを
// fetch して接続方法 + ツール一覧を表示する。ソース (registerTool) から生成するため常に最新。
//
// 実行: node scripts/generate-mcp-tools.mjs
// client の prebuild / predev から自動実行される。

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOOLS_DIR = path.join(ROOT, "server", "src", "contexts", "mcp", "tools");
const OUT_FILE = path.join(ROOT, "client", "public", "mcp-tools.json");

// ファイル basename (.tools.ts を除いた語) → カテゴリラベル
const CATEGORY_LABELS = {
  projects: "案件管理",
  customers: "顧客",
  activities: "営業活動",
  tasks: "タスク",
  studio: "スタジオ予約カレンダー",
  finance: "財務",
  analytics: "営業分析",
  users: "ユーザー",
  opsreports: "日常業務（週報／日報）",
  inview: "内覧会 来場予約",
  inbox: "見積／請求・その他問い合わせ",
};
// カテゴリ表示順 (未知は末尾)
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

// name 接頭辞 → read / write 判定
const WRITE_PREFIXES = [
  "create_", "update_", "record_", "register_", "change_", "issue_",
  "submit_", "add_", "delete_", "set_", "upsert_",
];
function toolType(name) {
  return WRITE_PREFIXES.some((p) => name.startsWith(p)) ? "write" : "read";
}

// registerTool('name', { ... title: '...' ... }) を素朴にパース
function extractTools(src) {
  const tools = [];
  const re = /server\.registerTool\(\s*(['"`])([^'"`]+)\1\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[2];
    // title は registerTool の設定オブジェクト先頭付近にある単一行文字列
    const after = src.slice(m.index, m.index + 600);
    const tm = after.match(/title:\s*(['"`])([^'"`]*)\1/);
    const title = tm ? tm[2].trim() : name;
    tools.push({ name, title, type: toolType(name) });
  }
  return tools;
}

function build() {
  const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith(".tools.ts")).sort();
  const categories = [];
  let toolCount = 0;
  // 既知カテゴリ順で並べ、その後に未知を追加
  const byKey = {};
  for (const file of files) {
    const key = file.replace(/\.tools\.ts$/, "");
    const src = readFileSync(path.join(TOOLS_DIR, file), "utf8");
    const tools = extractTools(src);
    if (!tools.length) continue;
    toolCount += tools.length;
    byKey[key] = { key, label: CATEGORY_LABELS[key] || key, tools };
  }
  const orderedKeys = [
    ...CATEGORY_ORDER.filter((k) => byKey[k]),
    ...Object.keys(byKey).filter((k) => !CATEGORY_ORDER.includes(k)),
  ];
  for (const k of orderedKeys) categories.push(byKey[k]);

  const output = {
    generatedFrom: "server/src/contexts/mcp/tools/*.tools.ts (registerTool)",
    generatedAt: null, // 決定的にするため固定 null (再ビルドで差分を出さない)
    toolCount,
    categories,
  };
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`[mcp-tools] ${toolCount} 種 / ${categories.length} カテゴリ → ${path.relative(ROOT, OUT_FILE)}`);
}

build();
