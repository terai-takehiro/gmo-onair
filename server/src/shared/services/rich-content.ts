/**
 * AI が組み立てた「読める形」の中身を検査して正規化する (migration 143)
 *
 * ── 何のためのものか ────────────────────────────────────────
 *
 * メールから取り込んだ内容を、**自由文1行ではなく意味の単位の配列**で持ちます。
 * AI は *何の情報か* を言い、*どう見せるか* はアプリが決めます。
 *
 * ── なぜサーバーで検査するか ────────────────────────────────
 *
 * 中身は **AI が組み立てたもの** で、その材料は **取引先が送ってきたメール** です。
 * どちらも信用できないので、DB に入る前にここで形を確かめます。
 *
 * ・**知らない `type` は捨てる。** 画面に「知らない形」が届くと、
 *   描き方が無いまま JSX に置かれて画面全体が落ちます
 *   (v3.2.0 で `companions` がオブジェクトに変わり React error #31 で
 *    内覧会の画面が真っ白になったのと同じ事故)
 * ・**文字列以外は文字列にしない。** 数値や null が来たら落とします。
 *   `String(obj)` すると画面に `[object Object]` が出ます (これも前例あり)
 * ・**長さの上限を持つ。** メール本文をまるごと1ブロックに入れられると
 *   一覧の行が画面何枚分にもなります。原文は `body_text` に別で持ちます
 *
 * ── クライアント側と対になっている ──────────────────────────
 *
 * 描く側は `shared/src/client/ui/richContent.tsx` です。
 * **server は shared を import していない**ので (`server/package.json` に
 * 依存が無い) 型が2か所にありますが、**増やすときは必ず両方に足してください**。
 * 描く側は知らない `type` を黙って飛ばすので、片方だけ古くても画面は壊れません。
 */

export type RichBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'fields'; items: { label: string; value: string; emphasis?: RichEmphasis }[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'quote'; text: string; source?: string }
  | { type: 'note'; tone: 'info' | 'warning' | 'success'; text: string }
  | { type: 'link'; url: string; label?: string };

export type RichEmphasis = 'money' | 'date' | 'strong';

const EMPHASIS = new Set(['money', 'date', 'strong']);
const TONES = new Set(['info', 'warning', 'success']);

/** 上限。**超えたぶんは捨てる** (切り詰めた印は画面に出す) */
const LIMITS = {
  blocks: 30,
  textLen: 2000,
  shortLen: 200,
  items: 40,
  columns: 8,
  rows: 50,
};

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
};

const strList = (v: unknown, max: number, len: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter((x): x is string => !!x).slice(0, max);

/** `https:` / `http:` 以外は落とす（`javascript:` を画面に渡さない） */
function safeUrl(v: unknown): string | null {
  const s = str(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? s : null;
  } catch {
    return null;
  }
}

function normalizeBlock(raw: unknown): RichBlock | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;

  switch (b.type) {
    case 'heading': {
      const text = str(b.text, LIMITS.shortLen);
      return text ? { type: 'heading', text } : null;
    }
    case 'text': {
      const text = str(b.text, LIMITS.textLen);
      return text ? { type: 'text', text } : null;
    }
    case 'fields': {
      const items = (Array.isArray(b.items) ? b.items : [])
        .map((raw2): { label: string; value: string; emphasis?: RichEmphasis } | null => {
          if (!raw2 || typeof raw2 !== 'object') return null;
          const it = raw2 as Record<string, unknown>;
          const label = str(it.label, 60);
          const value = str(it.value, LIMITS.shortLen);
          if (!label || !value) return null;
          const em = typeof it.emphasis === 'string' && EMPHASIS.has(it.emphasis)
            ? (it.emphasis as RichEmphasis) : undefined;
          return em ? { label, value, emphasis: em } : { label, value };
        })
        .filter((x): x is { label: string; value: string; emphasis?: RichEmphasis } => !!x)
        .slice(0, LIMITS.items);
      return items.length ? { type: 'fields', items } : null;
    }
    case 'bullets': {
      const items = strList(b.items, LIMITS.items, LIMITS.shortLen);
      return items.length ? { type: 'bullets', items } : null;
    }
    case 'table': {
      const columns = strList(b.columns, LIMITS.columns, 60);
      if (!columns.length) return null;
      const rows = (Array.isArray(b.rows) ? b.rows : [])
        .map((r) => strList(r, LIMITS.columns, LIMITS.shortLen))
        // **列数を揃える。** 足りない行をそのまま渡すと表が崩れる
        .map((r) => Array.from({ length: columns.length }, (_, i) => r[i] ?? ''))
        .filter((r) => r.some((c) => c !== ''))
        .slice(0, LIMITS.rows);
      return rows.length ? { type: 'table', columns, rows } : null;
    }
    case 'quote': {
      const text = str(b.text, LIMITS.textLen);
      if (!text) return null;
      const source = str(b.source, 60);
      return source ? { type: 'quote', text, source } : { type: 'quote', text };
    }
    case 'note': {
      const text = str(b.text, LIMITS.textLen);
      if (!text) return null;
      const tone = typeof b.tone === 'string' && TONES.has(b.tone)
        ? (b.tone as 'info' | 'warning' | 'success') : 'info';
      return { type: 'note', tone, text };
    }
    case 'link': {
      const url = safeUrl(b.url);
      if (!url) return null;
      const label = str(b.label, 120);
      return label ? { type: 'link', url, label } : { type: 'link', url };
    }
    default:
      return null;   // 知らない形は捨てる
  }
}

/**
 * 受け取った `details` を DB に入れられる形にする。
 * 中身が1つも残らなければ `null`（空配列を入れると「AI が何も出さなかった」と
 * 「そもそも構造化していない」の区別が付かなくなる）。
 */
export function normalizeRichContent(raw: unknown): RichBlock[] | null {
  if (!Array.isArray(raw)) return null;
  const blocks = raw
    .map(normalizeBlock)
    .filter((b): b is RichBlock => !!b)
    .slice(0, LIMITS.blocks);
  return blocks.length ? blocks : null;
}

/**
 * 画面に出せる文字量。**一覧で「中身がどれくらいあるか」を出すのに使う**
 * （開く前に、開く価値があるか分かるように）。
 */
export function richContentLength(blocks: RichBlock[] | null): number {
  if (!blocks) return 0;
  let n = 0;
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'text' || b.type === 'quote' || b.type === 'note') n += b.text.length;
    else if (b.type === 'bullets') n += b.items.join('').length;
    else if (b.type === 'fields') n += b.items.reduce((a, i) => a + i.label.length + i.value.length, 0);
    else if (b.type === 'table') n += b.rows.reduce((a, r) => a + r.join('').length, 0);
  }
  return n;
}
