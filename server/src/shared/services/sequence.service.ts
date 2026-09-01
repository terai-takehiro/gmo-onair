import { queryOne } from '../db/connection';

export type GlsCategory = 'A' | 'B';

// 従来の年月ベース採番 (OPPコード用)
export async function generateSequenceNumber(seqName: string, prefix: string): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  // アトミックに採番する (read-then-write だと並行実行で同一番号が採番され得る)。
  // 月が変わったら counter を 1 にリセットする。
  const row = await queryOne(
    `INSERT INTO sequences (seq_name, prefix, year_month, counter)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (seq_name) DO UPDATE SET
       counter = CASE WHEN sequences.year_month = EXCLUDED.year_month THEN sequences.counter + 1 ELSE 1 END,
       year_month = EXCLUDED.year_month
     RETURNING counter`,
    [seqName, prefix, ym]
  );
  const counter = row!.counter as number;

  return `${prefix}-${ym}-${String(counter).padStart(4, '0')}`;
}

// GLS番号: GLS-A001 (案件＝スタジオ) / GLS-B001 (プロジェクト＝プロジェクト管理)
// v2.8.113+ より案件登録時にユーザーが明示的に選択した category を受け取る
export async function generateGlsNumber(category: GlsCategory): Promise<string> {
  if (category !== 'A' && category !== 'B') {
    throw new Error(`Invalid GLS category: ${category}`);
  }
  const seqName = `gls_${category.toLowerCase()}`;

  // アトミックに採番する (read-then-write だと UI + MCP の並行発番で
  // 同一 GLS 番号が 2 案件に付与され得る)。
  const row = await queryOne(
    `INSERT INTO sequences (seq_name, prefix, year_month, counter)
     VALUES (?, ?, '000000', 1)
     ON CONFLICT (seq_name) DO UPDATE SET counter = sequences.counter + 1
     RETURNING counter`,
    [seqName, `GLS-${category}`]
  );
  const counter = row!.counter as number;

  return `GLS-${category}${String(counter).padStart(3, '0')}`;
}

/**
 * 次に出る GLS 番号を**採らずに**見るだけ。
 *
 * 受注に上げるときの確認ダイアログに「GLS-A012 を採ります」と出すため。
 * **採番はしない**ので、先に別の人が発番すると1つ後ろになる。
 * その旨は画面に書くこと（黙って違う番号が付くと「間違えた」と思われる）。
 */
export async function peekNextGlsNumber(category: GlsCategory): Promise<string | null> {
  if (category !== 'A' && category !== 'B') return null;
  const row = await queryOne(
    'SELECT counter FROM sequences WHERE seq_name = ?',
    [`gls_${category.toLowerCase()}`],
  );
  const next = ((row?.counter as number | undefined) ?? 0) + 1;
  return `GLS-${category}${String(next).padStart(3, '0')}`;
}

// エピソードコード生成: GLS-A001-001
export function generateEpisodeCode(glsNumber: string, episodeNumber: number): string {
  return `${glsNumber}-${String(episodeNumber).padStart(3, '0')}`;
}

// プロジェクトの次のエピソード番号を取得
export async function getNextEpisodeNumber(projectId: string): Promise<number> {
  const row = await queryOne(
    'SELECT MAX(episode_number) as max_num FROM episodes WHERE project_id = ? AND deleted_at IS NULL',
    [projectId]
  );
  return row && row.max_num ? (row.max_num as number) + 1 : 1;
}

/**
 * プロジェクトの次のエピソード番号を**アトミックに**取得する。
 *
 * `getNextEpisodeNumber`（MAX+1の read-then-write）は並行実行で同じ番号を
 * 返しうる。GLS 採番（`generateGlsNumber`）と同じ `ON CONFLICT ... RETURNING`
 * の形にして、`sequences` テーブルを project_id ごとのカウンタとして使う
 * （`seq_name` は `episode:{projectId}`）。
 *
 * ⚠️ **初回だけ、既存の episode_number の最大値から種をまく。** この案件に
 * 既に `/episodes/batch` などで作られた回があるとき、1 から始めると番号が
 * ぶつかる。種まき自体が競合しても壊れない — ON CONFLICT で負けた側は
 * 種の値を無視して「今ある値 + 1」を返すだけなので、常に一意な値が返る
 * （挿入時に `idx_episodes_project_number`（migration 260）と衝突すれば、
 * 呼び出し側でエラーになるので黙って重複することはない）。
 */
export async function getNextEpisodeNumberAtomic(projectId: string): Promise<number> {
  const seqName = `episode:${projectId}`;

  const bumped = await queryOne(
    `UPDATE sequences SET counter = counter + 1 WHERE seq_name = ? RETURNING counter`,
    [seqName],
  ) as { counter: number } | null;
  if (bumped) return bumped.counter;

  const existing = await queryOne(
    `SELECT COALESCE(MAX(episode_number), 0) as max_num FROM episodes WHERE project_id = ? AND deleted_at IS NULL`,
    [projectId],
  ) as { max_num: number };

  const seeded = await queryOne(
    `INSERT INTO sequences (seq_name, prefix, year_month, counter)
     VALUES (?, 'episode', '000000', ?)
     ON CONFLICT (seq_name) DO UPDATE SET counter = sequences.counter + 1
     RETURNING counter`,
    [seqName, (existing.max_num as number) + 1],
  ) as { counter: number };
  return seeded.counter;
}
