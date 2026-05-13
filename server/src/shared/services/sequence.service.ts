import { queryOne, execute } from '../db/connection';

export type GlsCategory = 'A' | 'B';

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

// GLS番号: GLS-A001 (スタジオ案件) / GLS-B001 (ビジネス案件)
// v2.8.113+ より案件登録時にユーザーが明示的に選択した category を受け取る
export async function generateGlsNumber(category: GlsCategory): Promise<string> {
  if (category !== 'A' && category !== 'B') {
    throw new Error(`Invalid GLS category: ${category}`);
  }
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
