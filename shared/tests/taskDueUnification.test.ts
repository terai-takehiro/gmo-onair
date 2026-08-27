/**
 * **タスクの期限が「読みは COALESCE・書きは due_at」に揃っているか**を見る検査
 *
 * ── なぜこれが要るか（根源整理 docs/core-redesign-plan.md §3-4）──────
 *
 * `project_tasks` には期限の列が2本ある（`due_date` DATE = migration 087 /
 * `due_at` TIMESTAMP = migration 135）。書き手8者・読み手6者が**別々の列**を
 * 使っていたため、投入口・依頼・GPM 由来のタスクはカンバンで「期限なし」になり、
 * 期限前通知が飛ばず、マイタスクで直した期限がカンバンに反映されなかった。
 *
 * 2026-08 の根源整理で
 *   - **読み**は全員 `COALESCE(due_at, due_date + 18:00)`（時刻の無い旧行は終業で補う）
 *   - **書き**は全員 `due_at`（`due_date` は互換のため残すが、新しい書き手は両方書く）
 * に統一した。この検査はその形が崩れていないことを SQL 文字列で固定する
 * （型検査は SQL の中身を見ないので、列が割れ直しても誰も気づけない）。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const CONTEXTS = join(ROOT, 'server', 'src', 'contexts');

/** 読みの唯一の式。my-tasks.service.ts の DUE_EXPR と同じ形 */
const DUE_EXPR = `COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)`;

/** 期限を読む（並べる・遅れを判定する・返す）ことに統一済みのファイル */
const UNIFIED_READERS = [
  'server/src/contexts/tasks/services/my-tasks.service.ts',
  'server/src/contexts/tasks/services/project-tasks.service.ts',
  'server/src/contexts/tasks/routes/task-dashboard.routes.ts',
  'server/src/contexts/gpm/services/gpm.service.ts',
  'server/src/contexts/sales/services/kpt.service.ts',
] as const;

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** バッククォートで囲まれた文字列のうち、SQL に見えるものだけ（droppedColumns.test.ts と同じ形） */
function sqlLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/`([^`]*)`/g)) {
    const body = m[1];
    if (/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(body)) out.push(body);
  }
  return out;
}

describe('タスク期限の一本化（読み COALESCE・書き due_at）', () => {
  it('統一済みの読み手が COALESCE(due_at, due_date+18:00) を使っている', () => {
    for (const rel of UNIFIED_READERS) {
      // 定数（DUE_EXPR）に持つ形でも、SQL に直書きする形でも、
      // **同じ式**がファイルの中に現れることを見る（ずれた式は別の並びを生む）
      expect(read(rel), `${rel} に期限の統一式がありません`).toContain(DUE_EXPR);
    }
  });

  it('古い「片方の列だけ見る」判定が復活していない', () => {
    // gpm: overdue を due_at だけで判定していた（due_date のみの行の遅れが見えない）
    expect(read('server/src/contexts/gpm/services/gpm.service.ts'))
      .not.toMatch(/t\.due_at IS NOT NULL AND t\.due_at < NOW\(\)/);
    // kpt: due_date だけで「遅れたタスク」を集めていた（due_at のみの行が材料に入らない）
    expect(read('server/src/contexts/sales/services/kpt.service.ts'))
      .not.toMatch(/AND due_date IS NOT NULL/);
  });

  it('project_tasks への INSERT で due_date を書くなら due_at も書く', () => {
    // 新しい書き手が due_date だけに書くと、その行はまた
    // 「マイタスクの通知が飛ばない・並びが日によって変わる」に戻る。
    // seed（server/src/shared/db/）は旧形式の行を作る材料として意図的に対象外
    const offenders: string[] = [];
    for (const file of tsFiles(CONTEXTS)) {
      const source = readFileSync(file, 'utf8');
      for (const sql of sqlLiterals(source)) {
        const ins = sql.match(/INSERT\s+INTO\s+project_tasks\s*\(([^)]*)\)/i);
        if (!ins) continue;
        const cols = ins[1].split(',').map((c) => c.trim().toLowerCase());
        if (cols.includes('due_date') && !cols.includes('due_at')) {
          offenders.push(file.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('カンバンの期限更新（project-tasks.update）が due_at にも書く', () => {
    const src = read('server/src/contexts/tasks/services/project-tasks.service.ts');
    // due_date を SET する枝が due_at も同じ日付から作っていること
    expect(src).toMatch(/due_date = \$/);
    expect(src).toMatch(/due_at = \(\$/);
  });

  it('private タスクの見え方の絞りが残っている（§3-4 の漏れ修正）', () => {
    // 全案件タスク一覧と GPM 一覧は、担当者/作成者以外に private の全文を返さない
    expect(read('server/src/contexts/tasks/routes/task-dashboard.routes.ts'))
      .toMatch(/visibility IS DISTINCT FROM 'private'/);
    expect(read('server/src/contexts/gpm/services/gpm.service.ts'))
      .toMatch(/visibility IS DISTINCT FROM 'private'/);
  });
});
