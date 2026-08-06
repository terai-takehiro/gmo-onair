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
// **表に無いカテゴリは英語のキーがそのまま利用者に出る。**
// ツールファイルを足したら必ずここにも足すこと（v4 の時点で 8 カテゴリが
// aifeedback / budget / … のまま「MCP コネクタ」モーダルに出ていた）。
const CATEGORY_LABELS = {
  projects: "案件管理",
  customers: "顧客",
  activities: "営業活動",
  tasks: "タスク",
  members: "案件メンバー",
  minutes: "議事録",
  studio: "スタジオ予約カレンダー",
  finance: "財務",
  budget: "月次予算・損益",
  pricing: "料金表・見積",
  analytics: "営業分析",
  users: "ユーザー",
  mytasks: "個人タスク・依頼・投入",
  opsreports: "日常業務（週報／日報）",
  eventreports: "イベント実施報告",
  inview: "内覧会 来場予約",
  inbox: "受け取った書類・入ってきた情報",
  "security-cards": "セキュリティカード",
  aifeedback: "AI の改善（修正差分の還流）",
};
// カテゴリ表示順 (未知は末尾)
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

// read / write 判定は「実装が audit() を呼ぶか」で行う。
//
// Why: 以前は name の接頭辞 (create_ / update_ …) で判定していたが、
// 動詞が一覧に無いツール (lend_ / return_ / upsert_ / attach_ / move_ など) が
// 書き込みなのに「参照」と誤判定されていた。この誤判定は 2 つの実害を出した:
//   1. MCP コネクタ画面と docs で 15 個の書き込みツールが「参照」と表示されていた
//   2. 書き込みツールとして認識されないため gate.ts の権限表への登録が漏れ、
//      lend_security_card / return_security_card が権限ゲート無しで公開されていた
//      (OAuth 経由なら dailyops 権限の無いユーザーでも実行できる状態)
// コードベースの規約は「全書き込みは audit() を呼ぶ」なので、それを唯一の判定基準にする。
const GATE_FILE = path.join(ROOT, "server", "src", "contexts", "mcp", "gate.ts");

// registerTool('name', { ... title: '...' ... }) を素朴にパース
function extractTools(src) {
  const tools = [];
  // registerTool ごとに本文を切り出し、その中の audit( の有無で write を判定する
  const parts = src.split(/server\.registerTool\(\s*['"`]([a-z_]+)['"`]/);
  // parts = [先頭, name1, body1, name2, body2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1] ?? "";
    const tm = body.slice(0, 600).match(/title:\s*(['"`])([^'"`]*)\1/);
    const title = tm ? tm[2].trim() : name;
    tools.push({ name, title, type: /\baudit\(/.test(body) ? "write" : "read" });
  }
  return tools;
}

// 書き込みツールが gate.ts の権限表に登録されているかを検証する。
// 未登録の書き込みツールは「権限ゲート無しで公開」= 権限モデルのバイパスなので、
// 生成を失敗させて気付ける状態にする (fail closed)。
function assertGateCoverage(allTools) {
  let gateSrc;
  try {
    gateSrc = readFileSync(GATE_FILE, "utf8");
  } catch {
    // 読めないときは「検証できなかった」= 通してはいけない (fail closed)。
    // 警告でスキップにすると、Docker の build-client ステージが gate.ts を COPY し忘れた
    // 場合に検証が黙って無効化される (実際に一度そうなった)。落として気付けるようにする。
    console.error(
      `\n[mcp-tools] ✗ gate.ts が読めないため権限ゲートを検証できません: ${GATE_FILE}\n` +
        `  この検証は MCP 書き込みツールの権限漏れを防ぐためのもので、スキップしてはいけません。\n` +
        `  Docker ビルドで出た場合は、build-client ステージに次の COPY があるか確認してください:\n` +
        `    COPY server/src/contexts/mcp/gate.ts server/src/contexts/mcp/gate.ts\n`
    );
    process.exit(1);
  }
  const listed = new Set(
    [...gateSrc.matchAll(/^\s{2}([a-z_]+):\s*\{\s*module:/gm)].map((m) => m[1])
  );
  const missing = allTools.filter((t) => t.type === "write" && !listed.has(t.name));
  if (missing.length) {
    console.error(
      `\n[mcp-tools] ✗ 書き込みツールが gate.ts の WRITE_TOOL_PERMISSIONS に未登録です。\n` +
        `  権限ゲートを通らないため、OAuth 経由で対応モジュールの権限が無いユーザーでも実行できてしまいます。\n` +
        missing.map((t) => `    - ${t.name}`).join("\n") +
        `\n\n  server/src/contexts/mcp/gate.ts に、対応する HTTP ルートの requirePermission と同じ\n` +
        `  module / level を追記してください。例: ${missing[0].name}: { module: 'dailyops', level: 'editor' },\n`
    );
    process.exit(1);
  }
  console.log(`[mcp-tools] 権限ゲート検証 OK (書き込み ${allTools.filter((t) => t.type === "write").length} 種すべて登録済み)`);
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

  // 書き込みツールの権限ゲート漏れを検出 (未登録なら exit 1 でビルドを止める)
  assertGateCoverage(orderedKeys.flatMap((k) => byKey[k].tools));

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
