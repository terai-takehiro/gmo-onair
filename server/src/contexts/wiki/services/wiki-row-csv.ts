/**
 * Wiki — データベースの行を CSV に書き出す（設計 §5-2 の約束3「外から同じものが読める」）。
 *
 * **Notion の書き出しと同じ形**にします: 1行目が項目名、1列目が題（Notion の `Name`）。
 * Notion で作った表をこちらへ持ってくる・こちらの表を Notion や Excel で開く、
 * どちらも同じファイルで済みます。
 *
 * ⚠️ **`shared/utils/csv-export.ts` の `generateCsv` は使いません。**
 * あちらは**見出しの行を引用符で包まない**（`cols.join(',')`）ので、
 * 項目名に読点や引用符が入ると列がずれます。項目名は利用者が自由に付けるので、
 * ここでは見出しも値と同じ規則で包みます。式として評価される文字の無害化
 * （`=` `+` `-` `@` で始まるセル）は同じやり方を写しています。
 */
import type { WikiItem, WikiPropValue } from '../wiki-props';

/** 題の列の名前。Notion の `Name` にあたる（1列目・必ず出す） */
export const CSV_TITLE_COLUMN = 'タイトル';

/**
 * 1セルを CSV の形にする。
 *
 * ⚠️ **先頭が `=` `+` `-` `@` タブ 改行のセルは Excel / Google スプレッドシートで
 * 式として実行されます**（CSV インジェクション）。純粋な数値だけ除いて `'` を前に置き、
 * 置いたセルは必ず引用符で包みます（`shared/utils/csv-export.ts` と同じ規則）。
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const safe = /^[=+\-@\t\r]/.test(str) && !/^-?\d+(\.\d+)?$/.test(str) ? `'${str}` : str;
  return safe !== str || /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * 値を CSV の文字にする。
 *
 * - チェック … `Yes` / `No`（Notion の書き出しと同じ。取り込み直しても同じ意味になる）
 * - 複数選択 … 読点区切り（同上）
 * - ONAiR リンク … 貼った時点の表示名。無ければ id（相手が消えても列が空にならない）
 */
export function csvValue(item: WikiItem, value: WikiPropValue | undefined): string {
  /*
   * ⚠️ **チェックだけは「入れていない」も `No` にします。** Notion と同じで、
   * チェックに「未入力」はありません（付いているか、いないかの2つだけ）。
   * 絞り込みも同じ見方をします（`wiki-view-apply.ts` の `matchesIs`）ので、
   * ここだけ空にすると**画面で「チェックなし」に出た行が CSV では空**になります。
   */
  if (item.type === 'checkbox') return value === true ? 'Yes' : 'No';
  if (value === null || value === undefined) return '';
  switch (item.type) {
    case 'multi_select':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'onair_link': {
      if (typeof value !== 'object' || Array.isArray(value)) return String(value);
      const link = value as { id?: unknown; label?: unknown };
      return String(link.label ?? link.id ?? '');
    }
    case 'number':
      return typeof value === 'number' ? String(value) : String(value);
    default:
      return Array.isArray(value) ? value.join(', ') : String(value);
  }
}

export interface CsvRow {
  title: string;
  props: Record<string, WikiPropValue>;
}

/**
 * 行の一覧を CSV にする。**先頭に BOM を付けます** — 付けないと Excel が
 * UTF-8 と判断できず、日本語が文字化けした状態で開きます。
 *
 * `columns` にビューの列の並びを渡すと、その並び・その項目だけを出します
 * （画面に出ている表と同じものが手元に落ちる）。
 */
export function buildRowsCsv(items: WikiItem[], rows: CsvRow[], columns?: string[]): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  const shown = columns && columns.length > 0
    ? columns.map((id) => byId.get(id)).filter((i): i is WikiItem => !!i)
    : items;

  const head = [CSV_TITLE_COLUMN, ...shown.map((i) => i.name)].map(csvCell).join(',');
  const body = rows.map((row) => (
    [csvCell(row.title), ...shown.map((item) => csvCell(csvValue(item, row.props?.[item.id])))].join(',')
  ));
  return `﻿${[head, ...body].join('\n')}\n`;
}

/**
 * 書き出すファイルの名前。**記号は落とします** — `/` や `"` が入ると
 * ブラウザによって保存できない・名前が途中で切れるためです。
 */
export function csvFileName(title: string): string {
  const base = String(title).replace(/[\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 60) || 'database';
  return `${base}.csv`;
}
