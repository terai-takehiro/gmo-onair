#!/usr/bin/env node
// scripts/generate-version-history.mjs
//
// CLAUDE.md の「## 現在のバージョン」節（単一の情報源）を構造化 JSON に変換し、
// client/public/version-history.json として書き出す。
// クライアント（案件管理アプリのヘッダー「バージョン履歴」）はこの静的ファイルを
// fetch して一覧表示・ダウンロード提供に使う。
//
// 実行: node scripts/generate-version-history.mjs
// client の prebuild / predev から自動実行される。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CLAUDE_MD = path.join(ROOT, "CLAUDE.md");
// v2.9.278 以降: CLAUDE.md には最新数件だけを残し、それ以前はここへ切り出している。
// CLAUDE.md はコーディング中に毎ターン読み込まれるため、履歴を全部抱えると
// 本文 828KB のうち 96% が履歴という状態になり、作業そのものが遅くなっていた。
// 画面の「バージョン履歴」は全件出したいので、生成時にこの2つを連結して読む。
const HISTORY_MD = path.join(ROOT, "docs", "version-history.md");
const OUT_FILE = path.join(ROOT, "client", "public", "version-history.json");

const SECTION_START = "## 現在のバージョン";
// CLAUDE.md 側の節の終わり。節を挟む見出しを増やしたらここも直すこと。
const SECTION_END = "## 開発の絶対原則";
const HISTORY_SECTION_START = "## 過去のバージョン";

function extractSection(text, start, end) {
  const startIdx = text.indexOf(start);
  if (startIdx === -1) throw new Error(`見出し「${start}」が見つかりません`);
  const bodyStart = text.indexOf("\n", startIdx) + 1;
  if (!end) return text.slice(bodyStart);
  const endIdx = text.indexOf(`\n${end}`, bodyStart);
  if (endIdx === -1) throw new Error(`見出し「${end}」が見つかりません`);
  return text.slice(bodyStart, endIdx);
}

// バージョン行の先頭パターン: "v1.2.3 — " / "(v1.2.3 — " / "v1.2.3: " / "(v1.2.3: "
const LINE_RE = /^(\()?v(\d+\.\d+\.\d+)\s*[—:]\s*(.*)$/;
const TITLE_RE = /^\*\*(.+?)\*\*[。.]?\s*/;

function stripOuterWrap(line, hasOpenParen) {
  let s = line;
  if (hasOpenParen) {
    // 先頭 "(" を除去。対応する閉じ ")" が末尾にあれば併せて除去。
    s = s.slice(1);
    if (s.endsWith(")")) s = s.slice(0, -1);
  } else if (s.endsWith(")")) {
    // 「現在のバージョン」欄はこのリポジトリの慣習で、まだ historical 化されておらず
    // 開き括弧を持たないが、末尾には（将来 historical 化された際に前へ "(" が足される
    // 前提の）閉じ括弧が既についていることがある。1つだけ取り除く。
    s = s.slice(0, -1);
  }
  return s.trim();
}

function parseEntries(sectionText) {
  const lines = sectionText.split("\n");
  const entries = [];
  let isFirst = true;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(LINE_RE);
    if (!m) continue; // 既知の版番号パターンに一致しない行はスキップ（見出し外の雑記等）

    const hasOpenParen = m[1] === "(";
    const version = m[2];
    const rest = m[3];
    const body = stripOuterWrap(`${hasOpenParen ? "(" : ""}${rest}`, hasOpenParen);

    const titleMatch = body.match(TITLE_RE);
    let title;
    // title をタイトル行の先頭太字から抽出できた場合、本文側の重複表示を避けるため
    // description からはその接頭辞（太字＋直後の句点）を取り除く。
    let description = body;
    if (titleMatch) {
      title = titleMatch[1];
      description = body.slice(titleMatch[0].length).replace(/^[。.]\s*/, "").trim();
    } else {
      const firstSentence = body.split("。")[0];
      title = firstSentence.length <= 90 ? firstSentence : `${firstSentence.slice(0, 90)}…`;
    }
    title = title.replace(/\*\*/g, "").trim();

    entries.push({
      version,
      isCurrent: isFirst,
      title,
      description: description || body,
    });
    isFirst = false;
  }

  // ソース側の貼り付けミス等による完全重複（同一バージョン+同一本文の連続）を除去
  return entries.filter((e, i) => {
    const prev = entries[i - 1];
    return !(prev && prev.version === e.version && prev.description === e.description);
  });
}

function main() {
  const claudeMd = readFileSync(CLAUDE_MD, "utf8");
  const recent = extractSection(claudeMd, SECTION_START, SECTION_END);

  // アーカイブが読めなければ**ビルドを止める** (fail closed)。
  // 黙って進むと画面のバージョン履歴が最新5件だけになり、しかもエラーが出ないので
  // 誰も気付けない。Docker では .dockerignore の再包含と Dockerfile の COPY の
  // どちらかを忘れるとここに来る。
  let archived;
  try {
    archived = extractSection(readFileSync(HISTORY_MD, "utf8"), HISTORY_SECTION_START, null);
  } catch (e) {
    console.error(
      `[version-history] ${path.relative(ROOT, HISTORY_MD)} を読めません: ${e.message}\n` +
        `  Docker ビルドで出た場合は .dockerignore の "!docs/version-history.md" と\n` +
        `  Dockerfile build-client の "COPY docs/version-history.md docs/" を確認すること。`
    );
    process.exit(1);
  }

  // CLAUDE.md は毎ターン全文が読み込まれるので、履歴を溜めると作業が遅くなる。
  // 溜まってきたら気付けるよう、ビルドのたびに警告する (止めはしない)。
  const KEEP_IN_CLAUDE_MD = 5;
  const recentCount = parseEntries(recent).length;
  if (recentCount > KEEP_IN_CLAUDE_MD) {
    console.warn(
      `[version-history] 警告: CLAUDE.md に ${recentCount} 件あります (目安 ${KEEP_IN_CLAUDE_MD} 件)。\n` +
        `  古いほうを docs/version-history.md の「## 過去のバージョン」直下へ移してください。`
    );
  }

  const versions = parseEntries(`${recent}\n${archived}`);

  const output = {
    generatedAt: new Date().toISOString(),
    generatedFrom: "CLAUDE.md #現在のバージョン + docs/version-history.md",
    product: "GMO ONAiR",
    currentVersion: versions.find((v) => v.isCurrent)?.version ?? null,
    count: versions.length,
    versions,
  };

  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`[version-history] ${versions.length} 件を書き出しました → ${path.relative(ROOT, OUT_FILE)}`);
}

main();
