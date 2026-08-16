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

/**
 * 見出しを**行頭で**探す。
 *
 * ⚠️ **素の `indexOf` にしないこと**（レビューでの指摘・P2）。`docs/version-history.md` は
 * 前置きの中で「## 過去のバージョン」直下へ移してください、と**引用として書いています**。
 * 素の検索だとその引用に当たるので、**本当の見出しより前に置かれた版まで拾えてしまい**、
 * 「置き場所を間違えているのに動く」状態になります（実際にそうなっていました）。
 */
function headingIndex(text, heading) {
  if (text.startsWith(`${heading}\n`)) return 0;
  const at = text.indexOf(`\n${heading}\n`);
  return at === -1 ? -1 : at + 1;
}

function extractSection(text, start, end) {
  const startIdx = headingIndex(text, start);
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

  /*
   * **同じ版は1つにする。**
   *
   * 前は「同一バージョン **かつ** 同一本文が連続したとき」だけ落としていたので、
   * ⚠️ **CLAUDE.md に要約・アーカイブに全文**という持ち方をすると、
   * 本文が違うため**同じ版が2回並びます**（画面の履歴に同じ番号が2つ出る）。
   *
   * PR が多い版では全文が 100KB を超えるので、**毎ターン文脈に載る CLAUDE.md には
   * 要約だけ**を置き、全文はアーカイブに入れます（`docs/version-history.md`）。
   * ここでは**長いほう＝全文**を採ります — 短いほうを採ると、
   * **画面の履歴からその版の中身が消えます**。
   */
  const byVersion = new Map();
  for (const e of entries) {
    const prev = byVersion.get(e.version);
    if (!prev) { byVersion.set(e.version, e); continue; }
    /*
     * ⚠️ **本文だけを取り替える。見出しは先に出たほう（CLAUDE.md の要約）を残す**
     * （レビューでの指摘・P2）。
     *
     * 要約とアーカイブは**わざと違う見出し**を持ちます — 要約は「その版が何だったか」を
     * 1文で言い、アーカイブは PR 1本目の見出しから始まります。まるごと差し替えると
     * **画面の履歴だけが 28 本のうち1本目の名前でその版を呼びます**
     * （実際に v4.1.0 が「グループ内かグループ外かを…」と出ていました。
     * `CLAUDE.md` と `README.md` は「Codex のレビュー指摘 143 件を…」なので、
     * **同じ版が資料と画面で違う名前**になります）。
     */
    if (e.description.length > prev.description.length) {
      byVersion.set(e.version, { ...prev, description: e.description });
    }
  }
  return [...byVersion.values()];
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
    const historyMd = readFileSync(HISTORY_MD, "utf8");
    /*
     * ⚠️ **見出しより前に置かれた版があれば止める**（レビューでの指摘・P2）。
     *
     * v4.1.0 で実際にやりました — 全文を**前置きの文の途中**に差し込んでいて、
     * 「…この下の『## 過去のバージョン』直下へ移してください」という1文が
     * **53,000 字の版で真っ二つ**になっていました。それでも動いていたのは
     * 見出しを素の `indexOf` で探していたからで、**正しく直した瞬間に
     * その版が画面から消えます**（黙って消えるので誰も気づけない）。
     */
    const head = headingIndex(historyMd, HISTORY_SECTION_START);
    const stray = head === -1 ? -1 : historyMd.slice(0, head).search(/\n\(v\d+\.\d+\.\d+\s*[—:]/);
    if (stray !== -1) {
      throw new Error(
        `「${HISTORY_SECTION_START}」より前に版の行があります（${stray} 文字目あたり）。\n` +
        `  版は見出しの**直下**に置いてください（前置きの引用に差し込むと、` +
        `見出しの探し方を直した日に画面から消えます）。`
      );
    }
    archived = extractSection(historyMd, HISTORY_SECTION_START, null);
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
