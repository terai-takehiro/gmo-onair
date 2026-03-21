import { queryOne, execute } from '../db/connection';

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
