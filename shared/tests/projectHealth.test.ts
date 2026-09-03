/**
 * 案件の健全性・自動整理の**単一定義**を固定する検査（docs/core-redesign-plan.md §3-1 / §3-2）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 「止まっている＝7日」は以前 **3か所にハードコード**されていて、1つ直すと
 * 残りが黙ってずれた（バッジの無い行が先頭に来る、KPI と一覧の行数が食い違う）。
 * ここで守るのは:
 *
 *  ・しきい値・生存証拠・健全性の式は **project-health.ts だけ**が持つこと
 *    （salesOverview / RECOMMENDED_SORT はそこから import する）
 *  ・**生存証拠が1つでもあれば自動整理は触らない**こと。自動見送りは
 *    **ネタだけ**・**履歴付き**・**AI 確認印（ai_reviewed）を付けない**こと
 *  ・受注→完了の繰り上げが**生 UPDATE ではなく同じサービス1本**であること
 *  ・tk_due が `COALESCE(due_at::date, due_date)` で判定し `/daily/tasks` へ飛ばすこと
 *    （due_at しか持たないタスクに通知が飛ばない・dailyops のみの担当者が 403 になる実害）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STUCK_DAYS_BY_STAGE, STUCK_INTERVAL_SQL, ALIVE_EVIDENCE_SQL, OVERDUE_NEXT_MOVE_SQL,
  LAST_MOVE_SQL, healthSql, stalledDaysSql, HEALTH_FILTERS,
  TIDY_CANDIDATE_DAYS, TIDY_AUTO_LOST_DAYS, AUTO_LOST_REASON,
} from '../../server/src/contexts/sales/services/project-health';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
/** 説明文（前の版がどう間違っていたか）を外してから探す（stuckForever.test.ts と同じ理由） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sql = (s: string) => code(s).replace(/^\s*--.*$/gm, '');

const HEALTH = read('server', 'src', 'contexts', 'sales', 'services', 'project-health.ts');
const OVERVIEW = sql(read('server', 'src', 'contexts', 'platform', 'services', 'salesOverview.service.ts'));
const PROJECT = sql(read('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts'));
const SCHEDULER = sql(read('server', 'src', 'contexts', 'platform', 'services', 'scheduler.service.ts'));
const DASHBOARD = sql(read('server', 'src', 'contexts', 'platform', 'routes', 'dashboard.routes.ts'));
const MIGRATION = read('server', 'src', 'shared', 'db', 'migrations', '238_project_health_tidy.sql');

describe('しきい値 — ステージ別・終端と受注済は対象外', () => {
  it('初期値（ネタ30 / 仮押さえ14 / 見積提案14 / 口頭決定7）', () => {
    expect(STUCK_DAYS_BY_STAGE).toEqual({ neta: 30, d_hold: 14, c_proposal: 14, b_verbal: 7 });
  });

  it('a_won / r_delivered / s_completed / e_lost にはしきい値が無い（SQL は ELSE NULL に落ちる）', () => {
    expect(Object.keys(STUCK_DAYS_BY_STAGE)).not.toContain('a_won');
    expect(Object.keys(STUCK_DAYS_BY_STAGE)).not.toContain('r_delivered');
    expect(STUCK_INTERVAL_SQL).toContain('ELSE NULL END');
    // 定数を変えたら SQL も一緒に変わる（機械的に組んでいる）ことの確認
    expect(STUCK_INTERVAL_SQL).toContain(`WHEN 'neta' THEN INTERVAL '30 days'`);
    expect(STUCK_INTERVAL_SQL).toContain(`WHEN 'b_verbal' THEN INTERVAL '7 days'`);
  });
});

describe('生存証拠と健全性の式', () => {
  it('生存証拠は4種（スヌーズ / 未来の次回アクション / 期日が未来の未完了タスク / 未来の実施日）', () => {
    expect(ALIVE_EVIDENCE_SQL).toContain('p.snooze_until >= CURRENT_DATE');
    expect(ALIVE_EVIDENCE_SQL).toContain('al.next_action_date >= CURRENT_DATE::text');
    expect(ALIVE_EVIDENCE_SQL).toContain('al.next_action_done_at IS NULL');
    expect(ALIVE_EVIDENCE_SQL).toContain(`COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) >= CURRENT_DATE::timestamp`);
    expect(ALIVE_EVIDENCE_SQL).toContain(`NULLIF(p.event_start, '') >= CURRENT_DATE::text`);
  });

  it('⚠️ NULL で穴が開かない（snooze / event の比較は COALESCE で false に落とす）', () => {
    // COALESCE が無いと、snooze も event も無い行で全体が NULL になり
    // 「NOT 生存証拠」も NULL → 停滞にも整理候補にも**一生出ない**行ができる
    expect(ALIVE_EVIDENCE_SQL).toContain('COALESCE(p.snooze_until >= CURRENT_DATE, FALSE)');
    expect(ALIVE_EVIDENCE_SQL).toContain(`COALESCE(NULLIF(p.event_start, '') >= CURRENT_DATE::text, FALSE)`);
  });

  it('期限超過は生存証拠と同じ式を「今日」で切っただけ（過去＝超過・未来＝証拠）', () => {
    expect(OVERDUE_NEXT_MOVE_SQL).toContain('al.next_action_date < CURRENT_DATE::text');
    expect(OVERDUE_NEXT_MOVE_SQL).toContain(`COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) < CURRENT_DATE::timestamp`);
  });

  it('判定の順: 終端は常に ok → スヌーズ → 期限超過 → 停滞', () => {
    const h = healthSql();
    const order = [
      `p.stage IN ('r_delivered', 's_completed', 'e_lost') THEN 'ok'`,
      `p.snooze_until >= CURRENT_DATE THEN 'snoozed'`,
      `'overdue'`,
      `'stalled'`,
    ].map((s) => h.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('放置日数は stalled のときだけ数値', () => {
    expect(stalledDaysSql()).toMatch(/= 'stalled'\s+THEN FLOOR/);
    expect(stalledDaysSql()).toContain('ELSE NULL END');
  });

  it('一覧の絞り込みは3値だけ受ける（知らない値は素通しさせない）', () => {
    expect([...HEALTH_FILTERS]).toEqual(['stalled', 'overdue', 'snoozed']);
    expect(code(PROJECT)).toMatch(/HEALTH_FILTERS as readonly string\[\]\)\.includes\(filter\.health\)/);
    expect(code(PROJECT)).toContain(`where += ' AND FALSE'`);
  });
});

describe('7日ハードコードの撤去 — 定義は project-health だけが持つ', () => {
  it('salesOverview は project-health から import し、自前の式を持たない', () => {
    expect(OVERVIEW).toMatch(/from '\.\.\/\.\.\/sales\/services\/project-health'/);
    expect(OVERVIEW).not.toMatch(/const STUCK_DAYS = \d/);
    // 「止まっている」の件数・一覧は健全性の 'stalled' で数える（一覧のバッジと同じ式）
    expect(OVERVIEW).toMatch(/healthSql\(\)\}\) = 'stalled'/);
  });

  it('おすすめ順（RECOMMENDED_SORT）も stalled を先頭に上げる形で単一定義を読む', () => {
    expect(PROJECT).toMatch(/RECOMMENDED_SORT_SQL = `\s*CASE WHEN \(\$\{healthSql\(/);
    expect(PROJECT).not.toMatch(/INTERVAL '7 days'/);
  });

  it('LAST_MOVE は見積・請求を含めない（締め処理の一斉更新で「たった今」にならない）', () => {
    expect(LAST_MOVE_SQL).toContain('project_tasks');
    expect(LAST_MOVE_SQL).toContain('activity_logs');
    expect(LAST_MOVE_SQL).not.toContain('revenues');
  });
});

describe('自動整理 project_tidy — 二段階・可逆・生存宣言があれば触らない', () => {
  it('候補60日 → 自動見送り90日。理由は失注マスタ lr_09 と同じ文言', () => {
    expect(TIDY_CANDIDATE_DAYS).toBe(60);
    expect(TIDY_AUTO_LOST_DAYS).toBe(90);
    expect(AUTO_LOST_REASON).toBe('自動整理（長期放置）');
    expect(MIGRATION).toContain(`('lr_09', '自動整理（長期放置）', 8)`);
    expect(MIGRATION).toContain(`('lr_08', '見送り（案件化せず）', 7)`);
  });

  it('⚠️ 自動見送りの対象はネタだけ・生存証拠が無いものだけ', () => {
    const h = code(HEALTH);
    expect(h).toMatch(/p\.stage = 'neta'\s+AND NOT \$\{ALIVE_EVIDENCE_SQL\}/);
    // 引いてから閉じるまでに人が触った行（レース）は RETURNING で見て素通りする
    expect(h).toMatch(/WHERE id = \? AND deleted_at IS NULL AND stage = 'neta'\s+RETURNING id/);
  });

  it('⚠️ 履歴を必ず残し、AI 確認印は付けない', () => {
    const h = code(HEALTH);
    expect(h).toContain('INSERT INTO project_stage_changes');
    // 機械の見送りは誰も中身を見ていない。印を付けると「無修正で採用」に数えられる
    expect(h).not.toContain('markAiReviewedByStageDecision');
    expect(h).not.toMatch(/ai_reviewed_at/);
    // 却下は AI の教師データに残す（note で自動と分かる形）
    expect(h).toMatch(/recordIntakeDecision\(r\.id, 'dropped', SYSTEM_ACTOR/);
  });

  it('毎日再送しない（ref_date は「候補になった日」= 最後の動き + しきい値で固定）', () => {
    expect(code(HEALTH)).toMatch(/INTERVAL '\$\{thresholdDays\} days', 'YYYY-MM-DD'\) AS ref_date/);
    expect(code(SCHEDULER)).toMatch(/refDate: r\.ref_date/);
  });

  it('scheduler に日次で載っている（07:30・ひな形で仕事ごと止めない）', () => {
    expect(SCHEDULER).toMatch(/key: 'project_tidy', at: '07:30', templateId: null/);
    expect(SCHEDULER).toContain(`(process.env.PROJECT_TIDY_DAILY || '').toLowerCase() === 'off'`);
  });

  it('受注→完了の繰り上げは dashboard の生 UPDATE をやめ、同じ1本を呼ぶ', () => {
    expect(DASHBOARD).not.toMatch(/UPDATE projects SET stage='s_completed'/);
    expect(DASHBOARD).toContain('completeElapsedWonProjects()');
    expect(SCHEDULER).toContain('await completeElapsedWonProjects()');
  });
});

describe('tk_due — 期限一本化（読み手は COALESCE）', () => {
  it('due_at しか持たないタスクにも通知が飛ぶ', () => {
    expect(SCHEDULER).toContain('COALESCE(t.due_at::date, t.due_date) = ?::date');
    expect(SCHEDULER).not.toMatch(/AND t\.due_date = \?::date/);
  });

  it('リンク先は /daily/tasks（dailyops のみの担当者を 403 に飛ばさない）', () => {
    expect(SCHEDULER).toMatch(/link: '\/daily\/tasks', refType: 'task'/);
    expect(SCHEDULER).not.toContain(`link: '/sales/tasks/list'`);
  });
});

describe('スヌーズ', () => {
  it('migration 238: DATE 列＋部分索引・通知ひな形2本', () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS snooze_until DATE');
    expect(MIGRATION).toMatch(/ON projects\(snooze_until\) WHERE snooze_until IS NOT NULL/);
    expect(MIGRATION).toContain(`'pj_tidy_candidate'`);
    expect(MIGRATION).toContain(`'pj_tidy_auto'`);
  });

  it('未来日付のみ・null で解除（無期限の待ちは作れない）', () => {
    const p = code(PROJECT);
    expect(p).toMatch(/until <= jstDate\(\)/);
    expect(p).toMatch(/SET snooze_until = NULL/);
  });
});
