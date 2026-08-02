/**
 * 内覧会 来場予約 — 画面を持たない計算部分 (回/日のキー・検索・並び替え・CSV)。
 *
 * 画面部品 (`shared.tsx`) から切り離してあるのは、**検索の当たり方を素で試せる
 * ようにするため**。受付の検索はカタカナ/ひらがな・全角/半角・電話のハイフンで
 * 空振りしないことが要件なので、ここだけを Node から呼んで確かめられる形にした。
 */
import type { InviewCompanion, InviewRegistration } from '@/lib/types';
import { formatDateJa } from '@/lib/types';

// ── 同行者の読み取り ─────────────────────────────────────────
//
// `companions` は migration 154 で「氏名の文字列」から
// `{ id, name, checked_in_at, checked_in_by }` に変わった。DB 上は移行済みだが
// 型としては両方あり得るので、画面はここを通してから使う。
// **オブジェクトをそのまま JSX に置くと React error #31 で画面全体が落ちる。**

/** 同行者1人 (画面が扱う形)。id が無い = 個別受付ができない (旧形式の残骸) */
export interface CompanionView {
  id: string | null;
  name: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

/** 同行者の氏名を取り出す。旧形式 (文字列) と新形式 (オブジェクト) の両方を受ける */
export function companionName(c: string | InviewCompanion | null | undefined): string {
  if (typeof c === 'string') return c.trim();
  if (c && typeof c === 'object') return String(c.name ?? '').trim();
  return '';
}

/** 予約の同行者を画面が扱う形に揃える (氏名が空の行は落とす) */
export function companionsOf(r: InviewRegistration): CompanionView[] {
  const out: CompanionView[] = [];
  for (const c of r.companions ?? []) {
    const name = companionName(c);
    if (!name) continue;
    const o = typeof c === 'object' && c ? c : null;
    out.push({
      id: o?.id ?? null,
      name,
      checked_in_at: o?.checked_in_at ?? null,
      checked_in_by: o?.checked_in_by ?? null,
    });
  }
  return out;
}

// ── 回 (セッション) と 日 のキー ─────────────────────────────

/** 日付が未定の回をまとめる URL 用のキー */
export const UNDATED = 'undated';

/** 日 (ページ) キー — URL の :date に入る値 */
export function dayKey(r: InviewRegistration): string {
  return r.session_date ?? UNDATED;
}

/** 日ページの見出し。'undated' は「日付未定」 */
export function formatDayTitle(date: string): string {
  if (date === UNDATED) return '日付未定の回';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${dow})`;
}

/** 今日 (ローカル) の YYYY-MM-DD */
export function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 予約の参加人数 (party_size は代表+同行を含む合計。未設定なら 1 + 同行者数) */
export function headOf(r: InviewRegistration): number {
  const named = 1 + (r.companions?.length ?? 0);
  return Math.max(r.party_size || 0, named, 1);
}

/** その予約のうち受付が済んだ人数 (代表 + 同行者を個別に数える) */
export function checkedInHeadOf(r: InviewRegistration): number {
  const companions = companionsOf(r).filter((c) => c.checked_in_at).length;
  return (r.checked_in_at ? 1 : 0) + companions;
}

// ── 検索 (受付でその場で探す) ─────────────────────────────────
//
// 受付は「田中さん」「GMO」くらいの手掛かりしか無い状態で名簿を引く。
// 打ち込みの揺れ (全角/半角・カタカナ/ひらがな・電話のハイフン) で
// 空振りしないように、両側を同じ形に潰してから含むかを見る。

/** 検索用に文字を揃える (NFKC → 小文字 → カタカナをひらがなへ → 区切り記号を落とす) */
export function normalizeForSearch(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    // カタカナ → ひらがな (ふりがなが「タナカ」でも「たなか」で当たる)
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    // 空白・ハイフン・括弧・記号は無視 (電話番号 090-1234-5678 / 〒 など)
    .replace(/[\s\-()（）.,/／〒#:：]/g, '');
}

/** 空白区切りの検索語 (すべてを含む = AND 検索) */
export function searchTerms(query: string): string[] {
  // `\s` は全角スペース (U+3000) も含む
  return query.split(/\s+/).map((t) => normalizeForSearch(t)).filter(Boolean);
}

/** 1 件の予約を検索対象の 1 本の文字列にする (同行者の氏名も含む) */
function haystack(r: InviewRegistration): string {
  return normalizeForSearch([
    r.name, r.furigana, r.company, r.role, r.email, r.phone, r.mobile, r.fax,
    r.postal_code, r.address, r.visit_time, r.session_label,
    ...companionsOf(r).map((c) => c.name),
  ].filter(Boolean).join(' '));
}

/** 検索語すべてを含むか。語が無いときは全件通す */
export function matchesTerms(r: InviewRegistration, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = haystack(r);
  return terms.every((t) => hay.includes(t));
}

/** 検索でどこに当たったか (氏名 / 会社 / 同行者 …) を返す。0 件の理由を説明するのに使う */
export function matchedFields(r: InviewRegistration, terms: string[]): string[] {
  if (terms.length === 0) return [];
  const fields: Array<[string, unknown]> = [
    ['氏名', r.name], ['ふりがな', r.furigana], ['会社', r.company], ['役職', r.role],
    ['メール', r.email], ['電話', r.phone], ['携帯', r.mobile], ['FAX', r.fax],
    ['住所', [r.postal_code, r.address].filter(Boolean).join(' ')],
    ['来場予定時間', r.visit_time], ['回', r.session_label],
    ['同行者', companionsOf(r).map((c) => c.name).join(' ')],
  ];
  const hit = new Set<string>();
  for (const [label, value] of fields) {
    const v = normalizeForSearch(value);
    if (v && terms.some((t) => v.includes(t))) hit.add(label);
  }
  return [...hit];
}

// ── 並び替え ────────────────────────────────────────────────

export type SortKey = 'default' | 'company' | 'name' | 'party' | 'checkin';
export const SORT_LABELS: Record<SortKey, string> = {
  default: '登録順',
  company: '会社名',
  name: '氏名 (ふりがな)',
  party: '参加人数 (多い順)',
  checkin: '来場状況 (未受付を先に)',
};

export function sortRegs(items: InviewRegistration[], key: SortKey): InviewRegistration[] {
  const arr = [...items];
  const byName = (r: InviewRegistration) => (r.furigana || r.name || '').toString();
  switch (key) {
    case 'company':
      return arr.sort((a, b) =>
        (a.company || '￿').localeCompare(b.company || '￿', 'ja') || byName(a).localeCompare(byName(b), 'ja'));
    case 'name':
      return arr.sort((a, b) => byName(a).localeCompare(byName(b), 'ja'));
    case 'party':
      return arr.sort((a, b) => headOf(b) - headOf(a) || byName(a).localeCompare(byName(b), 'ja'));
    case 'checkin':
      return arr.sort((a, b) => (a.checked_in_at ? 1 : 0) - (b.checked_in_at ? 1 : 0) || byName(a).localeCompare(byName(b), 'ja'));
    default:
      return arr; // list() が返す登録順 (created_at ASC) を維持
  }
}

// ── CSV 出力 ────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS = [
  '回日付', '回ラベル', '時間帯', '対象', '区分', '氏名', 'ふりがな', '登録者',
  '会社情報', '役職', 'メール', '電話', '携帯', 'FAX', '郵便番号', '住所',
  '参加人数', '来場予定時間', '興味・ご相談', '運営メモ', '来場状況', '受付者',
  '案件化', '登録元', '登録日時',
];

/** 予約を「参加者ごとの行」に展開して CSV を組み立てる (代表 + 同行者を各1行)。 */
export function buildCsv(rows: InviewRegistration[]): string {
  const lines: string[][] = [CSV_HEADERS];
  for (const r of rows) {
    const sessionDate = r.session_date ? formatDateJa(r.session_date) : '';
    const checkin = r.checked_in_at ? '来場済み' : '未受付';
    const promoted = r.promoted_project_id ? '案件化済み' : '';
    const src = r.source === 'kairos3' ? 'AI取込 (メール)' : '手入力';
    const createdAt = r.created_at ? new Date(r.created_at).toLocaleString('ja-JP') : '';
    // 代表 (登録者)
    lines.push([
      sessionDate, r.session_label ?? '', r.session_time ?? '', r.session_audience ?? '',
      '代表', r.name ?? '', r.furigana ?? '', '',
      r.company ?? '', r.role ?? '', r.email ?? '', r.phone ?? '', r.mobile ?? '', r.fax ?? '',
      r.postal_code ?? '', r.address ?? '', String(headOf(r)), r.visit_time ?? '',
      r.interests ?? '', r.notes ?? '', checkin, r.checked_in_by ?? '', promoted, src, createdAt,
    ].map(csvCell));
    // 同行者 (会社・回は代表から継承。来場状況は同行者ごとに個別)
    for (const c of companionsOf(r)) {
      const companionCheckin = c.checked_in_at ? '来場済み' : '未受付';
      lines.push([
        sessionDate, r.session_label ?? '', r.session_time ?? '', r.session_audience ?? '',
        '同行', c.name, '', r.name ?? '',
        r.company ?? '', '', '', '', '', '', '', '', '', '', '', '', companionCheckin, c.checked_in_by ?? '', '', src, '',
      ].map(csvCell));
    }
  }
  return lines.map((cols) => cols.join(',')).join('\r\n');
}

export function downloadCsv(rows: InviewRegistration[], nameSuffix = '') {
  const csv = buildCsv(rows);
  // UTF-8 BOM を付与して Excel での文字化けを防ぐ
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `内覧会来場予約${nameSuffix ? `_${nameSuffix}` : ''}_${todayKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
