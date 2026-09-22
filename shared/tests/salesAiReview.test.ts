/**
 * 営業側の月次 AI レビューとデイリーニュース評価の接続（Phase 2 ②③）を固定する。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * どちらも**画面を見ても壊れたことに気づけない**類のものです:
 *  - レビュー対象の kind が1つ欠けても、月次レビューは「その AI は問題なし」と
 *    読める形で普通に出てしまう（欠けたことはどこにも表示されない）
 *  - pick 成果の分母を取り違えても（未評価を 0 点に混ぜる等）、
 *    それらしい数字が出るので台帳と突き合わせるまで誰も気づけない
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SALES_REVIEW_KINDS, SALES_AI_REVIEW_KIND } from '../../server/src/contexts/sales/services/sales-ai-review.service';
import { newsPickOutcome, OPS_NEWS_ITEM_KIND } from '../../server/src/shared/services/ai-feedback.service';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('営業側の月次 AI レビュー（Phase 2 ②）', () => {
  it('レビュー対象は営業系9種＋取込1種＋プロジェクト管理2種で固定（欠けても増えても気づけるように）', () => {
    // 順不同で比較する（並び替えは自由だが、増減は意図を持って両方を直すこと）
    // gpm_* の2種は MCP のプロジェクト管理ツール整備で追加（gpm の権限は sales に
    // 統合済みで、レビュー担当が同じ営業マネージャーのため同じ月次レビューに載せる）
    // activity_intake は案件別の営業活動記録（次のアクションの削除）で追加。
    // 入っていないと `ai-activity.routes.ts` の ALLOWED_KINDS からも外れ、
    // 取込 AI の差分が貯まるだけで誰にも読めない（条件4・5が閉じない）
    expect([...SALES_REVIEW_KINDS].sort()).toEqual([
      'activity_format',
      'activity_intake',
      'estimate_draft',
      'finance_doc_intake',
      'gpm_project_draft',
      'gpm_task_draft',
      'inquiry_intake',
      'kpt_draft',
      'minutes_draft',
      'next_action_short',
      'project_draft',
      'task_intake',
    ]);
    // 制作側（ai_review_production）と別の kind であること
    expect(SALES_AI_REVIEW_KIND).toBe('ai_review_sales');
  });

  it('scheduler に載っている（作っただけで呼ばれていない、を防ぐ）', () => {
    const scheduler = read('server', 'src', 'contexts', 'platform', 'services', 'scheduler.service.ts');
    expect(scheduler).toMatch(/SALES_AI_REVIEW_JOB_KEY, at: '03:35'/);
    // 環境変数で止められる（他の裏方仕事と同じ形）
    expect(scheduler).toMatch(/SALES_AI_REVIEW_NIGHTLY/);
  });

  it('通知のひな形が migration にある（コードの templateId と同じ id で）', () => {
    const migration = read('server', 'src', 'shared', 'db', 'migrations', '241_sales_ai_review.sql');
    expect(migration).toMatch(/'sales_ai_review_draft'/);
    const service = read('server', 'src', 'contexts', 'sales', 'services', 'sales-ai-review.service.ts');
    expect(service).toMatch(/SALES_AI_REVIEW_NOTIFY_TEMPLATE_ID = 'sales_ai_review_draft'/);
  });
});

describe('デイリーニュースの pick 成果の式（Phase 2 ③）', () => {
  it('評価が付いた割合は全行が分母・平均 pick は評価済みだけが分母', () => {
    // 10件中4件に評価（3+5+4+4=16点）→ 付いた割合 40%・平均 4.0
    expect(newsPickOutcome(10, 4, 16)).toEqual({ rated_rate: 0.4, avg_pick: 4 });
  });

  it('未評価を 0 点に混ぜない（評価が0件なら平均は null であって 0 ではない）', () => {
    expect(newsPickOutcome(10, 0, 0)).toEqual({ rated_rate: 0, avg_pick: null });
  });

  it('まだ1件も無いときは「0点」ではなく「不明」（null）', () => {
    expect(newsPickOutcome(0, 0, 0)).toEqual({ rated_rate: null, avg_pick: null });
  });

  it('MCP のニュース投稿が記録に繋がっている（kind の書き写しゼロ）', () => {
    const tool = read('server', 'src', 'contexts', 'mcp', 'tools', 'opsreports.tools.ts');
    // 定数を import して使う（リテラル 'ops_news_item' を書き写すと、変えた日に集計だけ黙って0件になる）
    expect(tool).toMatch(/OPS_NEWS_ITEM_KIND/);
    expect(tool).toMatch(/recordAiOutput\(/);
    expect(OPS_NEWS_ITEM_KIND).toBe('ops_news_item');
  });
});
