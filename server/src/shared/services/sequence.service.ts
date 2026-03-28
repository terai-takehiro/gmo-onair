import { queryOne, execute } from '../db/connection';

// 従来の年月ベース採番 (OPPコード用)
export function generateSequenceNumber(seqName: string, prefix: string): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const row = queryOne('SELECT year_month, counter FROM sequences WHERE seq_name = ?', [seqName]);

  let counter: number;
  if (!row) {
    counter = 1;
    execute('INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)', [seqName, prefix, ym, counter]);
  } else if (row.year_month !== ym) {
    counter = 1;
    execute('UPDATE sequences SET year_month = ?, counter = ? WHERE seq_name = ?', [ym, counter, seqName]);
  } else {
    counter = (row.counter as number) + 1;
    execute('UPDATE sequences SET counter = ? WHERE seq_name = ?', [counter, seqName]);
  }

  return `${prefix}-${ym}-${String(counter).padStart(4, '0')}`;
}

// GLS番号: GLS001, GLS002, ... (グローバル連番)
export function generateGlsNumber(): string {
  const seqName = 'gls_global';
  const row = queryOne('SELECT counter FROM sequences WHERE seq_name = ?', [seqName]);

  let counter: number;
  if (!row) {
    counter = 1;
    execute('INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)', [seqName, 'GLS', '000000', counter]);
  } else {
    counter = (row.counter as number) + 1;
    execute('UPDATE sequences SET counter = ? WHERE seq_name = ?', [counter, seqName]);
  }

  return `GLS${String(counter).padStart(3, '0')}`;
}

// エピソードコード生成: GLS001-001
export function generateEpisodeCode(glsNumber: string, episodeNumber: number): string {
  return `${glsNumber}-${String(episodeNumber).padStart(3, '0')}`;
}

// プロジェクトの次のエピソード番号を取得
export function getNextEpisodeNumber(projectId: string): number {
  const row = queryOne(
    'SELECT MAX(episode_number) as max_num FROM episodes WHERE project_id = ? AND deleted_at IS NULL',
    [projectId]
  );
  return row && row.max_num ? (row.max_num as number) + 1 : 1;
}
