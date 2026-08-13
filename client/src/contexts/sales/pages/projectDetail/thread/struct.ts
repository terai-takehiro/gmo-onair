/**
 * やり取りの本文の構造（migration 188）— 画面側の型と読み取り
 *
 * サーバー側の対は `server/src/shared/services/activity-struct.ts` です
 * （**server は shared を import しない**構成なので型が2か所にあります。
 * `RichBlock` が client と server の両方にあるのと同じ）。
 *
 * ── ここで読み直す理由 ──────────────────────────────────────
 *
 * DB に入るときにサーバーが検査していますが、**画面側でも1回通します**。
 *   ① 古い行・手で入れた行・別経路で入った行が来ても画面が落ちない
 *   ② オブジェクトをそのまま JSX に置くと React error #31 で**画面全体が落ちる**
 *      （v3.2.0 で内覧会の画面が真っ白になったのがこれ）
 * 「知らない形は黙って飛ばす」という `richContent.tsx` の決めごとと同じです。
 */

export type ActivityStatusTone = 'decided' | 'waiting' | 'risk' | 'info';
export type ActivityFactIcon = 'date' | 'people' | 'gear' | 'money' | 'place' | 'doc';

export interface ActivityTurn {
  side: 'them' | 'us';
  name: string | null;
  org: string | null;
  at: string | null;
  quote: string | null;
  note: string | null;
  fields: { label: string; value: string }[];
}

export interface ActivityStruct {
  v: number;
  subtitle: string | null;
  statuses: { label: string; tone: ActivityStatusTone }[];
  facts: { icon: ActivityFactIcon; value: string }[];
  lead: string | null;
  turns: ActivityTurn[];
}

const TONES = new Set(['decided', 'waiting', 'risk', 'info']);
const ICONS = new Set(['date', 'people', 'gear', 'money', 'place', 'doc']);

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
};

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function readTurn(raw: unknown): ActivityTurn | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const fields = list(t.fields)
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const it = f as Record<string, unknown>;
      const label = str(it.label);
      const value = str(it.value);
      return label && value ? { label, value } : null;
    })
    .filter((f): f is { label: string; value: string } => !!f);

  const quote = str(t.quote);
  const note = str(t.note);
  // **中身が1つも無い発言は出さない。** 名前だけの吹き出しが並ぶと、
  // 「読み取れなかった」ことが「相手が何も言わなかった」ように見える
  if (!quote && !note && fields.length === 0) return null;

  return {
    side: t.side === 'us' ? 'us' : 'them',
    name: str(t.name),
    org: str(t.org),
    at: str(t.at),
    quote,
    note,
    fields,
  };
}

/**
 * 行の `body_struct` を読む。**読めなければ `null`**（呼ぶ側は今までの
 * `body_html` → 素のテキストの順で落ちていく）。
 *
 * ネットワークにも DOM にも触らないので素で試せます
 * （`shared/tests/activityStruct.test.ts` はサーバー側の対を試しています）。
 */
export function readActivityStruct(raw: unknown): ActivityStruct | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;

  const statuses = list(s.statuses)
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const it = x as Record<string, unknown>;
      const label = str(it.label);
      if (!label) return null;
      const tone = typeof it.tone === 'string' && TONES.has(it.tone)
        ? (it.tone as ActivityStatusTone) : 'info';
      return { label, tone };
    })
    .filter((x): x is { label: string; tone: ActivityStatusTone } => !!x);

  const facts = list(s.facts)
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const it = x as Record<string, unknown>;
      const value = str(it.value);
      if (!value) return null;
      const icon = typeof it.icon === 'string' && ICONS.has(it.icon)
        ? (it.icon as ActivityFactIcon) : 'doc';
      return { icon, value };
    })
    .filter((x): x is { icon: ActivityFactIcon; value: string } => !!x);

  const turns = list(s.turns).map(readTurn).filter((t): t is ActivityTurn => !!t);
  const lead = str(s.lead);
  if (!lead && turns.length === 0) return null;

  return {
    v: Number(s.v) || 1,
    subtitle: str(s.subtitle),
    statuses,
    facts,
    lead,
    turns,
  };
}

/** 頭文字。**姓の1文字だけ**（「露崎様」→「露」）。空なら null で、丸ごと出さない */
export function initialOf(name: string | null): string | null {
  if (!name) return null;
  // 敬称を落としてから取る（「様」だけのアバターにしない）
  // 空白は `\s` だけで落ちる（JS の `\s` は全角空白 U+3000 を含む）。
  // **全角空白の文字そのものをソースに置かない** — 半角と見分けが付かない
  const base = name.replace(/\s/g, '').replace(/(様|さん|氏|殿)$/u, '');
  return [...base][0] ?? null;
}
