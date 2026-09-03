/**
 * 「今日の営業」(GET /dashboard/today-sales) と GPM 一覧の健全性を固定する検査
 * （docs/core-redesign-plan.md Phase 2 ①）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 「今日の営業」は3つの束（次の一手 / スヌーズ明け / 停滞し始め）を**別々の SQL**で
 * 引くので、どれか1つだけ条件がずれても画面は普通に出てしまう（気づけない）。
 * ここで守るのは:
 *
 *  ・次の一手の条件は受信箱の超過（OVERDUE_ACTIONS_BASE）と**同じ核**から組むこと。
 *    違いは日付の切り方だけ（今日の営業 = <= 今日 / 受信箱 = < 今日）
 *  ・3集合とも **GLS-A（案件）だけ**であること（GLS-B はプロジェクト管理の持ち物）
 *  ・停滞の判定・放置日数は **project-health.ts の単一定義**を読むこと（写さない）
 *  ・GPM 一覧（GET /gpm/projects）も同じ単一定義で health / stalled_days /
 *    snooze_until を返すこと（案件一覧 GET /projects と同じ意味論）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
/** 説明文（前の版がどう間違っていたか）を外してから探す（projectHealth.test.ts と同じ理由） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sql = (s: string) => code(s).replace(/^\s*--.*$/gm, '');

const DASHBOARD = sql(read('server', 'src', 'contexts', 'platform', 'routes', 'dashboard.routes.ts'));
const GPM = sql(read('server', 'src', 'contexts', 'gpm', 'services', 'gpm.service.ts'));

/** `TODAY_NEXT_MOVES_SQL = \`...\`;` のような定義1本を切り出す（前後の別 SQL に紛れない） */
const defOf = (src: string, name: string): string => {
  const m = src.match(new RegExp(`const ${name} =[\\s\\S]*?\`;`));
  expect(m, `${name} の定義が見つからない`).not.toBeNull();
  return m![0];
};

describe('次の一手（next_moves）— 受信箱の超過と同じ核・切り方だけ違う', () => {
  it('共通の核（NEXT_MOVES_CORE）から超過と今日の営業の両方を組む（条件を写さない）', () => {
    // 核の定義1回 ＋ 超過（OVERDUE_ACTIONS_BASE）と今日の営業の参照2回 = 最低3回
    expect((DASHBOARD.match(/NEXT_MOVES_CORE/g) ?? []).length).toBeGreaterThanOrEqual(3);
    const core = defOf(DASHBOARD, 'NEXT_MOVES_CORE');
    /*
     * ⚠️ **条件そのものはここに書かれていない**（migration 245）。
     * 「未対応の次回アクション」は7か所に写されていて、終わった案件を除く条件が
     * 入っていたのは2か所だけだった。式を `shared/services/next-action-state.ts` の
     * `OPEN_NEXT_ACTION_SQL` 1本に集めたので、**核はそれを参照しているか**を見る
     * （中身そのものは `openNextAction.test.ts` が固定している）。
     */
    expect(core).toContain('${OPEN_NEXT_ACTION_SQL}');
    // 消した案件を除くのは核の側（`a.deleted_at` は共通の式が持っている）
    expect(core).toContain('p.deleted_at IS NULL');
    const STATE = sql(read('server', 'src', 'shared', 'services', 'next-action-state.ts'));
    expect(STATE).toContain('a.deleted_at IS NULL');
    expect(STATE).toContain('a.next_action IS NOT NULL');
    expect(STATE).toContain('a.next_action_date IS NOT NULL');
    expect(STATE).toContain('a.next_action_done_at IS NULL');
    // 終わった案件のステージは配列1本から組み立てている（写しを増やさないため）
    expect(STATE).toContain(`TERMINAL_PROJECT_STAGES = ['r_delivered', 's_completed', 'e_lost']`);
    expect(STATE).toContain('p.stage NOT IN (');
    // ⚠️ 案件に紐づかない記録（顧客だけの記録）を落とさないこと
    expect(STATE).toContain('p.stage IS NULL OR');
    // 核そのものは日付を切らない（切り方は使う側が足す）
    expect(core).not.toContain('CURRENT_DATE');
  });

  it('切り方: 受信箱は < 今日（超過だけ）・今日の営業は <= 今日（今日期限も含む）', () => {
    expect(defOf(DASHBOARD, 'OVERDUE_ACTIONS_BASE')).toContain(
      'a.next_action_date < CURRENT_DATE::text');
    const today = defOf(DASHBOARD, 'TODAY_NEXT_MOVES_SQL');
    expect(today).toContain('a.next_action_date <= CURRENT_DATE::text');
    // 古い順 = 長くお待たせしているものが先・画面に並べられる量で切る
    expect(today).toContain('ORDER BY a.next_action_date ASC');
    expect(today).toContain('LIMIT 50');
  });

  it('action_short は AI の短い言い換え（migration 190）があればそれ・無ければ本文', () => {
    expect(defOf(DASHBOARD, 'TODAY_NEXT_MOVES_SQL')).toContain(
      `COALESCE(NULLIF(a.next_action_short, ''), a.next_action) AS action_short`);
  });
});

describe('スヌーズ明け（snooze_awake）— 明けたばかりの7日間だけ', () => {
  it('今日-7日 〜 今日の帯・進行中だけ・明けて7日経ったら黙って退場する', () => {
    const s = defOf(DASHBOARD, 'SNOOZE_AWAKE_SQL');
    expect(s).toContain('p.snooze_until BETWEEN (CURRENT_DATE - 7) AND CURRENT_DATE');
    expect(s).toContain(`p.stage NOT IN ('r_delivered','s_completed','e_lost')`);
    // DATE は ::text で返す（pg が JS Date にして UTC で1日ずれる）
    expect(s).toContain('p.snooze_until::text AS snooze_until');
  });
});

describe('停滞し始め（newly_stalled）— 判定は project-health の単一定義', () => {
  it('healthSql / stalledDaysSql を読む（式を写さない）・放置日数の少ない順・LIMIT 20', () => {
    const n = defOf(DASHBOARD, 'NEWLY_STALLED_SQL');
    expect(n).toContain(`\${healthSql()}) = 'stalled'`);
    expect(n).toContain('${stalledDaysSql()} AS stalled_days');
    // 少ない順 = 腐り始めたばかりが先（長期放置は受信箱・自動整理の持ち物）
    expect(n).toContain('ORDER BY stalled_days ASC');
    expect(n).toContain('LIMIT 20');
    // しきい値の直書きに戻さない（7日ハードコードの轍）
    expect(DASHBOARD).not.toMatch(/STUCK_DAYS\s*=/);
    expect(n).not.toContain('INTERVAL');
  });

  it('3集合とも GLS-A（案件）だけ（GLS-B はプロジェクト管理の持ち物）', () => {
    for (const name of ['TODAY_NEXT_MOVES_SQL', 'SNOOZE_AWAKE_SQL', 'NEWLY_STALLED_SQL']) {
      expect(defOf(DASHBOARD, name)).toContain(`p.gls_category = 'A'`);
    }
  });

  it('3つとも同じ応答で1回に返す（数字が後から差し替わると読み間違える）', () => {
    expect(DASHBOARD).toMatch(
      /next_moves: nextMoves, snooze_awake: snoozeAwake, newly_stalled: newlyStalled/);
  });
});

describe('GPM 一覧（GET /gpm/projects）— 案件一覧と同じ健全性を返す', () => {
  it('project-health を import し、health / stalled_days / snooze_until を一覧行に出す', () => {
    expect(GPM).toMatch(/from '\.\.\/\.\.\/sales\/services\/project-health'/);
    expect(GPM).toContain('${healthSql()} AS health');
    expect(GPM).toContain('${stalledDaysSql()} AS stalled_days');
    // DATE は ::text（案件一覧 GET /projects と同じ。UTC で1日ずれるため）
    expect(GPM).toContain('p.snooze_until::text AS snooze_until');
  });

  it('しきい値・生存証拠の式を自前で持たない（単一定義の写しを作らない）', () => {
    expect(GPM).not.toContain('ALIVE_EVIDENCE');
    expect(GPM).not.toMatch(/STUCK_DAYS/);
  });
});
