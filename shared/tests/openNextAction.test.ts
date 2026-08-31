/**
 * **「未対応の次回アクション」が指す集合を1つにする**（migration 245・ユーザー報告）
 *
 * ── なぜ試験を書くか ────────────────────────────────────────
 *
 * ⚠️ **これは「それらしい件数が出る」種類の間違いです。**
 * 判定式は7か所に写されていて、**終わった案件（失注・完了）を除く条件が
 * 入っていたのは2か所だけ**でしたが、どの画面にもちゃんとした件数が出ます。
 * 気づけるのは「押しても案件が終わっていて何もできない」を何度も踏んだときだけで、
 * 実際にユーザーからは**「これらがゴミとして溜まりまくっている」**という形で来ました。
 *
 * ここで見るのは3つです:
 *   ① **式そのもの**（`OPEN_NEXT_ACTION_SQL` ほか）— 二度と書き写さないため
 *   ② **式を書き写している口が無いこと**（7つの口が同じ1つを読む）
 *   ③ **機械が閉じたものと人が押した完了を混ぜないこと**
 *      （開き直すのは機械が閉じた分だけ・画面は理由を正直に出す）
 *
 * `billingState.test.ts`（同じ言葉が違う集合を指していた件）と同じ型です。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  NEXT_ACTION_OPEN_SQL,
  PROJECT_NOT_TERMINAL_SQL,
  OPEN_NEXT_ACTION_SQL,
  TERMINAL_PROJECT_STAGES,
  AUTO_CLOSE_REASON,
  projectNotTerminalExistsSql,
} from '../../server/src/shared/services/next-action-state';
import { autoClosedLabel } from '../../client/src/contexts/sales/pages/activityLog/types';

const ROOT = join(__dirname, '..', '..');
const SERVER = join(ROOT, 'server', 'src');

/**
 * 注釈を外してから探す（この製品は**前の版の形を説明として残す**決めごとなので、
 * 素の文字列検索にすると「昔はこう書いていた」という正しい説明文で落ちる）。
 */
function readCode(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/--[^\n]*/g, ' ');
}

/** 改行と字下げの違いで落ちないように空白をまとめる（見たいのは中身であって整形ではない） */
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('言葉の中身', () => {
  it('**未対応の次回アクション**は4つとも要る（1つ欠けると別の集合になる）', () => {
    expect(flat(NEXT_ACTION_OPEN_SQL)).toBe(
      'a.deleted_at IS NULL AND a.next_action IS NOT NULL'
      + ' AND a.next_action_date IS NOT NULL AND a.next_action_done_at IS NULL',
    );
  });

  it('⚠️ **終わった案件を除く条件は `p.stage IS NULL` を許す**', () => {
    // 案件に紐づかない記録（顧客だけに付いた記録）は `LEFT JOIN` で
    // `p.stage` が NULL になる。`NOT IN` だけで書くと NULL は真にならないので、
    // **今まで出ていた「次にやること」が静かに減る**（画面からは気づけない）
    expect(flat(PROJECT_NOT_TERMINAL_SQL)).toBe(
      "(p.stage IS NULL OR p.stage NOT IN ('s_completed','e_lost'))",
    );
  });

  it('終わったステージは失注と完了の2つだけ', () => {
    expect([...TERMINAL_PROJECT_STAGES]).toEqual(['s_completed', 'e_lost']);
  });

  it('**正の式**は「未対応」と「終わっていない案件」の両方（片方だけの別名を作らない）', () => {
    expect(flat(OPEN_NEXT_ACTION_SQL))
      .toBe(`${flat(NEXT_ACTION_OPEN_SQL)} AND ${flat(PROJECT_NOT_TERMINAL_SQL)}`);
  });

  it('JOIN していない SQL 用の `EXISTS` 版も、同じ2ステージだけを外す', () => {
    const sql = flat(projectNotTerminalExistsSql('activity_logs.project_id'));
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('tp.id = activity_logs.project_id');
    expect(sql).toContain("tp.stage IN ('s_completed','e_lost')");
  });
});

describe('⚠️ 式を書き写している口が無い', () => {
  /*
   * ここが試験の要点です。**値が正しいことより、写しが無いことのほうが大事**で、
   * 写しがあると片方だけ直されて**また割れます**（実際に7本のうち5本が割れていました）。
   */
  const FILES: Array<[string, string[], RegExp]> = [
    ['営業活動記録（一覧の並べ替え・「次にやること」パネル）',
      ['server', 'src', 'contexts', 'sales', 'services', 'activity-log.service.ts'], /OPEN_NEXT_ACTION_SQL/],
    ['ホーム「次の一手」/ 受信箱の超過',
      ['server', 'src', 'contexts', 'platform', 'routes', 'dashboard.routes.ts'], /OPEN_NEXT_ACTION_SQL/],
    ['MCP（list_activity_logs の upcoming / list_overdue_actions）',
      ['server', 'src', 'contexts', 'mcp', 'tools', 'activities.tools.ts'], /OPEN_NEXT_ACTION_SQL/],
    ['週報の「来週期限」',
      ['server', 'src', 'contexts', 'dailyops', 'services', 'weekly-stats.service.ts'], /OPEN_NEXT_ACTION_SQL/],
    ['顧客360°の open_actions 件数',
      ['server', 'src', 'contexts', 'sales', 'routes', 'customers.routes.ts'], /OPEN_NEXT_ACTION_SQL/],
    // 夜間の短文生成だけは SQL の形が違う（`FROM activity_logs` を別名なしで書き、
    // `projects` を JOIN しない）。**JOIN を足すと待ち行列の数え方まで変わる**ので、
    // 式そのものではなく**終了案件を除く条件だけ**を共通の1本から借りている
    ['夜間の短文生成の待ち行列',
      ['server', 'src', 'contexts', 'sales', 'services', 'next-action-short.service.ts'],
      /projectNotTerminalExistsSql/],
  ];

  for (const [name, parts, symbol] of FILES) {
    it(`${name} は共通の式を読む`, () => {
      const code = readCode(...parts);
      expect(code).toMatch(symbol);
      expect(code).toMatch(/from '.*shared\/services\/next-action-state'/);
    });
  }

  it('⚠️ どこにも式の写しが残っていない', () => {
    /*
     * 「済んだか」だけを写した断片も探す。**`a.` の別名を使っている SQL**
     * （＝活動記録を主にした問い合わせ）が3条件を並べて書いていたら写し。
     *
     * 例外は1つだけ、理由も1つだけです:
     *   `dashboard.routes.ts` の `/sales-board` の LATERAL — あれは
     *   **進行中案件だけを並べた外側の WHERE の中**で「この案件の次の一手」を
     *   1件引くもので、`p` を持たない（`p.id` で相関している）。
     *   共通の式を当てると `p.stage` が二重に効くだけで意味は変わらないが、
     *   この PR の対象外なので触っていない。
     */
    const COPY = /a\.next_action\s+IS\s+NOT\s+NULL\s+AND\s+a\.next_action_date\s+IS\s+NOT\s+NULL/;
    const files: Array<[string, string[]]> = [
      ['営業活動記録', ['server', 'src', 'contexts', 'sales', 'services', 'activity-log.service.ts']],
      ['MCP', ['server', 'src', 'contexts', 'mcp', 'tools', 'activities.tools.ts']],
      ['週報', ['server', 'src', 'contexts', 'dailyops', 'services', 'weekly-stats.service.ts']],
      ['顧客360°', ['server', 'src', 'contexts', 'sales', 'routes', 'customers.routes.ts']],
    ];
    for (const [name, parts] of files) {
      expect(flat(readCode(...parts)), `${name} に式の写しが残っている`).not.toMatch(COPY);
    }
    // ダッシュボードは `/sales-board` の1か所だけが残る（上のコメントの例外）
    const dash = flat(readCode('server', 'src', 'contexts', 'platform', 'routes', 'dashboard.routes.ts'));
    expect((dash.match(new RegExp(COPY.source, 'g')) ?? []).length).toBe(1);
  });
});

describe('機械が閉じたものと、人が押した完了を混ぜない', () => {
  const MODULE = readCode('server', 'src', 'shared', 'services', 'next-action-state.ts');

  it('理由は2つだけ（DB に入る値・migration 245）', () => {
    expect(AUTO_CLOSE_REASON.lost).toBe('project_lost');
    expect(AUTO_CLOSE_REASON.completed).toBe('project_completed');
  });

  it('⚠️ **開き直すのは機械が閉じた分だけ**', () => {
    // 人が「完了」を押したやることが、案件を戻した拍子に復活してはいけない。
    // **勝手に増えるやることは、勝手に消えるやること以上に信用を失う**
    expect(MODULE).toMatch(/next_action_auto_closed_reason IS NOT NULL/);
  });

  it('閉じるのは未対応の分だけ（済んだ行の日時を上書きしない）', () => {
    expect(MODULE).toMatch(/next_action IS NOT NULL\s+AND next_action_done_at IS NULL/);
  });

  it('**失敗してもステージ変更は止めない**（後片づけより業務が先）', () => {
    expect(MODULE).toMatch(/console\.warn/);
    expect(MODULE).toMatch(/export async function syncNextActionsForStageSafe/);
  });

  it('機械が動かす経路も全部この1本を通る', () => {
    // `recordStageTransition` を通らない経路（自動見送り・繰り上げ完了・一括変更）を
    // 足し忘れると、**その経路から出たゴミだけ永久に残る**
    const health = readCode('server', 'src', 'contexts', 'sales', 'services', 'project-health.ts');
    expect(health).toMatch(/syncNextActionsForStageSafe\(r\.id, 'e_lost'\)/);
    expect(health).toMatch(/syncNextActionsForStageSafe\(r\.id, 's_completed'\)/);

    const project = readCode('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts');
    // ①ステージ変更の集約点（案件詳細・GPM の両方が通る）②一括変更
    expect((project.match(/syncNextActionsForStageSafe\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(project).toMatch(/await syncNextActionsForStageSafe\(id, toStage\)/);
  });

  it('やることを書き換えたら「済み」の印を捨てる（黙って消えないため）', () => {
    /*
     * `update()` が `next_action_done_at` を触らないせいで、**一度片づけた記録に
     * 新しい次回アクションを入れても、どのリストにも二度と出てきません**でした。
     * 保存はふつうに成功するので、書いた本人にも気づけません。
     */
    const svc = readCode('server', 'src', 'contexts', 'sales', 'services', 'activity-log.service.ts');
    expect(svc).toMatch(/nextActionChanged \|\| nextActionDateChanged/);
    expect(svc).toMatch(/sets\.push\('next_action_done_at=\?', 'next_action_auto_closed_reason=\?'\)/);
  });
});

describe('画面は「済み」ではなく起きたことを出す', () => {
  it('機械が閉じた理由は人の言葉になる', () => {
    expect(autoClosedLabel('project_lost')).toBe('失注により終了');
    expect(autoClosedLabel('project_completed')).toBe('完了により終了');
  });

  it('⚠️ **人が押した完了は `null`**（呼ぶ側が従来どおり「対応済み」を出す）', () => {
    expect(autoClosedLabel(null)).toBeNull();
    expect(autoClosedLabel(undefined)).toBeNull();
    // 知らない値も `null` に落とす — 増えた値を書き忘れても、画面が壊れるのではなく
    // 従来の表示に戻るだけで済む
    expect(autoClosedLabel('something_new')).toBeNull();
  });

  it('言い方は1本（写すと同じ行が画面によって違う言葉になる）', () => {
    const FILES: Array<[string, string[]]> = [
      ['営業活動記録の行', ['client', 'src', 'contexts', 'sales', 'pages', 'activityLog', 'ActivityRows.tsx']],
      ['やり取りタブ', ['client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'thread', 'ThreadCard.tsx']],
      ['概要タブのダイジェスト', ['client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'ThreadDigest.tsx']],
    ];
    for (const [name, parts] of FILES) {
      const code = readCode(...parts);
      expect(code, `${name} が共通の言い方を使っていない`).toMatch(/autoClosedLabel\(/);
      // 「失注により終了」を写していないこと（1か所に書いてあれば十分）
      expect(code, `${name} に文言の写しがある`).not.toMatch(/失注により終了/);
    }
  });
});
