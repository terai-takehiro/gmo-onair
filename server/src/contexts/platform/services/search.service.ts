/**
 * さがす（⌘K と検索結果の画面）— デザイン 36章
 *
 * ── なにが問題だったか（実装の穴）────────────────────────
 *
 * `GET /search` は **ログインしているかだけを見て、権限を見ていなかった**。
 * その結果、案件を見る権限が無い人でも
 *
 *   - 案件名と GLS 番号
 *   - お客様の名前
 *   - 仕入先の名前
 *
 * が ⌘K に出ていた。開くと 403 で止まるが、**名前はもう見えている**。
 * 顧客名や案件名は「誰と何をしているか」なので、これ自体が見せてよい情報ではない。
 *
 * ── 決めたこと ──────────────────────────────────────────
 *
 * ①**見えないものは件数にも出さない**。権限が無い種類は 0件ではなく
 *   **その種類ごと返さない**。「案件 0件」と出ると「無い」と読めてしまい、
 *   実際には「見せてもらえない」なので意味が違う。
 *
 * ②**何が探せるかは先に言う**。返す `kinds` に「探せる種類」だけを並べ、
 *   権限で外したものは `hidden_kinds` として**種類の名前だけ**返す
 *   (件数は返さない)。何も言わないと「うちの案件が出てこないのは壊れている
 *   のか、権限が無いのか」が分からない。
 *
 * ③**判定は `requirePermission` と同じ関数を使う**。写すと片方だけ緩くなる。
 *
 * ④**検索の SQL は1か所**。⌘K の候補と検索結果の画面で別に書くと、
 *   「⌘K には出るのに検索結果に出ない」形の食い違いが出る。
 *   違うのは**件数の上限だけ**にする。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { meetsPermissionLevel } from '../../../shared/middleware/auth';

export interface SearchActor {
  role?: string;
  permissions?: Record<string, string>;
}

export interface SearchKindDef {
  key: string;
  label: string;
  /** この種類を見るのに要る権限 */
  module: string;
  /** 何で探せるか。画面にそのまま出す */
  fields: string;
}

/** 探せる種類。**権限つき**で定義する (権限を書き忘れると漏れる) */
export const SEARCH_KINDS: SearchKindDef[] = [
  { key: 'projects',  label: '案件',   module: 'sales',  fields: '案件名 ・ GLS番号 ・ 管理番号' },
  { key: 'customers', label: 'お客様', module: 'sales',  fields: 'お客様の名前 ・ 略称' },
  { key: 'vendors',   label: '仕入先', module: 'budget', fields: '仕入先の名前 ・ 種別' },
  { key: 'equipment', label: '機材',   module: 'equipment', fields: '機材名 ・ 型番 ・ 機材コード' },
];

/** ⌘K の候補に出す件数 (種類ごと) */
export const PALETTE_LIMIT = 10;
/** 検索結果の画面に出す件数 (種類ごと・1ページ) */
export const RESULTS_LIMIT = 50;

export function canSeeKind(actor: SearchActor, kind: SearchKindDef): boolean {
  return meetsPermissionLevel(actor.role, actor.permissions?.[kind.module], 'reader');
}

/** その人が探せる種類 / 権限で外れた種類 */
export function kindsFor(actor: SearchActor) {
  const visible = SEARCH_KINDS.filter((k) => canSeeKind(actor, k));
  const hidden = SEARCH_KINDS.filter((k) => !canSeeKind(actor, k));
  return { visible, hidden };
}

const escapeLike = (q: string) => q.replace(/[%_\\]/g, '\\$&');

/**
 * 1種類を引く。**SQL はここだけ** (⌘K と検索結果で違うのは limit だけ)。
 * `count` は「その種類に何件あるか」で、limit で切る前の数を返す
 * (「50件中の50件」なのか「50件ちょうど」なのかが分からないと、
 * 絞り込めばよいのかどうかが判断できない)。
 */
async function searchKind(key: string, like: string, limit: number) {
  switch (key) {
    case 'projects': {
      const rows = await queryAll(
        `SELECT p.id, p.code, p.gls_number, p.name, p.stage, p.event_start,
                c.name AS customer_name
           FROM projects p
           LEFT JOIN customers c ON c.id = p.customer_id AND c.deleted_at IS NULL
          WHERE (p.name ILIKE ? ESCAPE '\\' OR p.code ILIKE ? ESCAPE '\\'
                 OR p.gls_number ILIKE ? ESCAPE '\\')
            AND p.deleted_at IS NULL AND p.is_sandbox = FALSE
          ORDER BY p.updated_at DESC
          LIMIT ?`,
        [like, like, like, limit]);
      const c = (await queryOne(
        `SELECT COUNT(*) AS n FROM projects p
          WHERE (p.name ILIKE ? ESCAPE '\\' OR p.code ILIKE ? ESCAPE '\\'
                 OR p.gls_number ILIKE ? ESCAPE '\\')
            AND p.deleted_at IS NULL AND p.is_sandbox = FALSE`, [like, like, like])) as any;
      return { rows, count: Number(c?.n ?? 0) };
    }
    case 'customers': {
      const rows = await queryAll(
        `SELECT id, name, short_name FROM customers
          WHERE (name ILIKE ? ESCAPE '\\' OR short_name ILIKE ? ESCAPE '\\')
            AND deleted_at IS NULL AND is_sandbox = FALSE
          ORDER BY name LIMIT ?`, [like, like, limit]);
      const c = (await queryOne(
        `SELECT COUNT(*) AS n FROM customers
          WHERE (name ILIKE ? ESCAPE '\\' OR short_name ILIKE ? ESCAPE '\\')
            AND deleted_at IS NULL AND is_sandbox = FALSE`, [like, like])) as any;
      return { rows, count: Number(c?.n ?? 0) };
    }
    case 'vendors': {
      const rows = await queryAll(
        `SELECT id, name, vendor_type FROM vendors
          WHERE (name ILIKE ? ESCAPE '\\' OR vendor_type ILIKE ? ESCAPE '\\')
            AND deleted_at IS NULL
          ORDER BY name LIMIT ?`, [like, like, limit]);
      const c = (await queryOne(
        `SELECT COUNT(*) AS n FROM vendors
          WHERE (name ILIKE ? ESCAPE '\\' OR vendor_type ILIKE ? ESCAPE '\\')
            AND deleted_at IS NULL`, [like, like])) as any;
      return { rows, count: Number(c?.n ?? 0) };
    }
    case 'equipment': {
      // 機材はテーブルが無い環境 (古い DB) でも検索そのものを止めない
      try {
        const rows = await queryAll(
          `SELECT id, name, model_number, eq_code, status FROM equipment_items
            WHERE (name ILIKE ? ESCAPE '\\' OR model_number ILIKE ? ESCAPE '\\'
                   OR eq_code ILIKE ? ESCAPE '\\')
              AND deleted_at IS NULL
            ORDER BY name LIMIT ?`, [like, like, like, limit]);
        const c = (await queryOne(
          `SELECT COUNT(*) AS n FROM equipment_items
            WHERE (name ILIKE ? ESCAPE '\\' OR model_number ILIKE ? ESCAPE '\\'
                   OR eq_code ILIKE ? ESCAPE '\\')
              AND deleted_at IS NULL`, [like, like, like])) as any;
        return { rows, count: Number(c?.n ?? 0) };
      } catch {
        return { rows: [], count: 0 };
      }
    }
    default:
      return { rows: [], count: 0 };
  }
}

/**
 * ⌘K / 検索結果の共通の口。
 *
 * **権限が無い種類は返さない** (0件でも返さない = 件数にも出さない)。
 */
export async function search(opts: {
  q: string;
  actor: SearchActor;
  limit?: number;
  /** 1種類だけ引く (検索結果の画面のタブ) */
  kind?: string | null;
}) {
  const q = String(opts.q ?? '').slice(0, 100).trim();
  const limit = opts.limit ?? PALETTE_LIMIT;
  const { visible, hidden } = kindsFor(opts.actor);

  const base = {
    q,
    // 探せる種類と、何で探せるか
    kinds: visible.map((k) => ({ key: k.key, label: k.label, fields: k.fields })),
    // **権限で外れた種類は名前だけ返す** (件数は返さない)
    hidden_kinds: hidden.map((k) => ({ key: k.key, label: k.label, module: k.module })),
  };

  if (!q) {
    return {
      ...base,
      groups: visible.map((k) => ({ key: k.key, label: k.label, count: 0, items: [] as unknown[] })),
      total: 0,
      empty_reason: '探したい言葉を入れてください',
    };
  }

  const like = `%${escapeLike(q)}%`;
  const wanted = opts.kind ? visible.filter((k) => k.key === opts.kind) : visible;

  const groups = [];
  for (const k of wanted) {
    const { rows, count } = await searchKind(k.key, like, limit);
    groups.push({ key: k.key, label: k.label, count, items: rows, shown: rows.length });
  }

  const total = groups.reduce((s, g) => s + g.count, 0);
  return {
    ...base,
    groups,
    total,
    empty_reason: total === 0
      // 権限で外した種類があるなら、そのことも言う (壊れていると読まれないため)
      ? (hidden.length > 0
        ? `「${q}」は見つかりませんでした。${hidden.map((h) => h.label).join('・')}は見る権限がないので探していません`
        : `「${q}」は見つかりませんでした`)
      : null,
  };
}

/** ⌘K が使う形 (種類ごとの配列)。既存のレスポンス形を壊さない */
export async function searchForPalette(q: string, actor: SearchActor) {
  const r = await search({ q, actor, limit: PALETTE_LIMIT });
  const byKind: Record<string, unknown[]> = {};
  // **権限が無い種類はキーごと出さない** (空配列を返すと「0件」に見える)
  for (const g of r.groups) byKind[g.key] = g.items;
  return {
    ...byKind,
    // 画面が「何が探せて何が探せないか」を出すのに使う
    _kinds: r.kinds,
    _hidden_kinds: r.hidden_kinds,
    _total: r.total,
  };
}
