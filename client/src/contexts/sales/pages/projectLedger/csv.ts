/**
 * CSV の組み立て（案件に依らない部分）
 *
 * **画面の物を1つも import しません。** 中身の決め方（どの列に何を出すか）は
 * `ledgerCsv.ts` が持ち、ここは「文字をどう包むか」だけを持ちます
 * （`bulkSet.ts` を切り出したのと同じ理由 — **試験からそのまま読めるように**）。
 *
 * ── Excel で開いて壊れないための決めごと ────────────────────
 *
 *  ・**BOM を付ける**（付ける先は `useLedgerCsv.ts`）。付けないと Excel は
 *    Shift_JIS として開き、**日本語がすべて文字化けします**
 *  ・**改行は CRLF。** LF だけだと Excel が 1 行に見せることがあります
 *  ・⚠️ **`=` `+` `@` で始まるマスは頭に `'` を足して文字に留めます。**
 *    足さないと**開いた人の Excel で式が走ります**。`-` には足しません —
 *    **金額のマイナスが読めなくなる**ほうが困るためです
 */

/** 一度に書き出す上限。**切ったことは必ず呼ぶ側が画面に出す** */
export const CSV_MAX_ROWS = 2000;

/** 1マスを包む（RFC 4180 ＋ 数式よけ） */
export function csvCell(v: string): string {
  const guarded = /^[=+@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * 表頭と本文から CSV を作る。
 * **1件も無くても表頭は出します** — 中身が空のファイルだと、
 * 「絞り込みに当たらなかった」のか「書き出しが失敗した」のかが分かりません。
 */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/**
 * ファイル名。**絞り込みが分かる名前にする** — 同じ名前が
 * ダウンロードに3つ並ぶと、どれが「分類なしだけ」なのか開くまで分かりません。
 * **日付は呼ぶ側が渡します**（ここで時計を読むと試験で固定できない）。
 *
 * ⚠️ **日本語を使いません**（実ブラウザで実測して直しました）。
 * 名前が全部 非ASCII だと **Chromium は名前ごと捨てて `download` にします** —
 * **`.csv` が落ちるので、二重クリックしても Excel で開きません**。
 * 絞り込みは整合性チェックの鍵（`no_classification` など・元から ASCII）で表します。
 */
export function csvFileName(issueKey: string | null, today: string): string {
  const key = (issueKey ?? '').replace(/[^a-z0-9_]/gi, '');
  return `project-ledger_${today}${key ? `_${key}` : ''}.csv`;
}
