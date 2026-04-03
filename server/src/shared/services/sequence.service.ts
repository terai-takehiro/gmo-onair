import { queryOne, execute } from '../db/connection';

// A系(制作): エピソード・スタジオ予約あり
const CATEGORY_A_TYPES = ['offline_event', 'hybrid_event', 'live_broadcast', 'recording'];

// 従来の年月ベース採番 (OPPコード用)
export async function generateSequenceNumber(seqName: string, prefix: string): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const row = await queryOne('SELECT year_month, counter FROM sequences WHERE seq_name = ?', [seqName]);

  let counter: number;
  if (!row) {
    counter = 1;
    await execute('INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)', [seqName, prefix, ym, counter]);
  } else if (row.year_month !== ym) {
    counter = 1;
    await execute('UPDATE sequences SET year_month = ?, counter = ? WHERE seq_name = ?', [ym, counter, seqName]);
  } else {
    counter = (row.counter as number) + 1;
    await execute('UPDATE sequences SET counter = ? WHERE seq_name = ?', [counter, seqName]);
  }

  return `${prefix}-${ym}-${String(counter).padStart(4, '0')}`;
}

// GLS番号: GLS-A001 (制作系) / GLS-B001 (その他売上)
export async function generateGlsNumber(projectType?: string): Promise<string> {
  const category = projectType && CATEGORY_A_TYPES.includes(projectType) ? 'A' : 'B';
  const seqName = `gls_${category.toLowerCase()}`;

  const row = await queryOne('SELECT counter FROM sequences WHERE seq_name = ?', [seqName]);

  let counter: number;
  if (!row) {
    counter = 1;
    await execute('INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)',
      [seqName, `GLS-${category}`, '000000', counter]);
  } else {
    counter = (row.counter as number) + 1;
    await execute('UPDATE sequences SET counter = ? WHERE seq_name = ?', [counter, seqName]);
  }

  return `GLS-${category}${String(counter).padStart(3, '0')}`;
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

// プロジェクトタイプからカテゴリを判定
export function getGlsCategory(projectType: string): 'A' | 'B' {
  return CATEGORY_A_TYPES.includes(projectType) ? 'A' : 'B';
}
