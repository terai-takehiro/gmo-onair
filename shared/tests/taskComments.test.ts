/**
 * **依頼コメントスレッドとタスク期限 ICS フィードの形**を固定する検査
 * （docs/core-redesign-plan.md Phase 2 ⑤⑦）
 *
 * ── なぜこれが要るか ────────────────────────────────────────
 *
 * ① コメントは依頼のやり取りなので、読める・書けるのは**当事者だけ**
 *    （依頼主 requester_id・受け手 assigned_to・作成者 created_by）。
 *    この条件は SQL と if 文の中にしか無く、型検査では守れない。
 *    緩むと private な依頼のやり取りが第三者に見える。
 * ② ICS フィードの期限は根源整理 §3-4 の統一式
 *    COALESCE(due_at, due_date+18:00) で読む。片方の列だけ見る形に戻ると、
 *    投入口・依頼由来のタスクがカレンダーから消える（期限2本問題の再発）。
 * ③ 依頼への返答メモは task_comments に入る（description への追記は廃止）。
 *    追記が復活すると、本文と会話がまた混ざる。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const COMMENTS_SERVICE = 'server/src/contexts/tasks/services/task-comments.service.ts';
const MY_TASKS_SERVICE = 'server/src/contexts/tasks/services/my-tasks.service.ts';
const FEED_ROUTE = 'server/src/contexts/schedule/routes/task-feed.routes.ts';

/** 読みの唯一の式。my-tasks.service.ts の DUE_EXPR / taskDueUnification.test.ts と同じ形 */
const DUE_EXPR = `COALESCE(t.due_at, (t.due_date + TIME '18:00')::timestamp)`;

describe('依頼コメントスレッド（Phase 2 ⑤）', () => {
  it('コメントの読み書きが当事者（依頼主・受け手・作成者）に絞られている', () => {
    const src = read(COMMENTS_SERVICE);
    // 当事者の3者を全部見ていること（1人でも欠けると、その立場の人が自分の依頼を読めない）
    expect(src).toMatch(/assigned_to.*requester_id.*created_by|requester_id.*assigned_to.*created_by/s);
    // 当事者以外は明確な 403（黙って空配列を返すと「コメントが消えた」に見える）
    expect(src).toContain("403");
    expect(src).toContain('FORBIDDEN');
  });

  it('返答メモが description への追記ではなく task_comments に入る', () => {
    const myTasks = read(MY_TASKS_SERVICE);
    // 旧形式（description への追記）が復活していない
    expect(myTasks).not.toContain(`description = COALESCE(description, '') ||`);
    // 返答メモの行き先はコメント
    expect(myTasks).toContain('INSERT INTO task_comments');
  });

  it('コメント投稿の通知が migration 240 のひな形（dg_comment）を使う', () => {
    const src = read(COMMENTS_SERVICE);
    expect(src).toContain("'dg_comment'");
    // ひな形が migration 240 に実在すること（名前だけ合っていても行が無ければ通知は出ない）
    const migration = read('server/src/shared/db/migrations/240_task_comments_ics.sql');
    expect(migration).toContain("'dg_comment'");
    expect(migration).toContain('task_comments');
    expect(migration).toContain('user_task_feed_tokens');
  });
});

describe('タスク期限 ICS フィード（Phase 2 ⑦）', () => {
  it('期限を統一式（COALESCE(due_at, due_date+18:00)）で読む', () => {
    // ずれた式にすると、同じ人の期限がフィードと画面（マイタスク）で食い違う
    expect(read(COMMENTS_SERVICE)).toContain(DUE_EXPR);
  });

  it('対象の窓が「過去30日〜未来1年」で、比べる相手が統一式', () => {
    const src = read(COMMENTS_SERVICE);
    // ソース上は定数 DUE_EXPR の差し込み（${DUE_EXPR}）なので、その形のまま見る。
    // 定数の中身が統一式であることは上の検査（toContain(DUE_EXPR)）が担保する
    expect(src).toContain("${DUE_EXPR} >= NOW() - INTERVAL '30 days'");
    expect(src).toContain("${DUE_EXPR} < NOW() + INTERVAL '1 year'");
  });

  it('未完了だけを載せ、辞退・相談で差し戻された依頼は載せない', () => {
    const src = read(COMMENTS_SERVICE);
    // listMyTasks と同じ絞り（フィードだけ辞退済みが残ると「消したのに予定に出る」）
    expect(src).toContain('t.is_completed = FALSE');
    expect(src).toMatch(/delegation_status NOT IN \('declined', 'consulting'\)/);
  });

  it('配信口はトークン不一致を 404 にし、text/calendar で返す', () => {
    const src = read(FEED_ROUTE);
    // 個人の URL なので在否ごと伏せる（studio の共通トークンは 403 だが、こちらは 404）
    expect(src).toContain('404');
    expect(src).toContain('text/calendar');
    // 認証ミドルウェアを**付けない**口（Google/Outlook のフェッチャは Cookie を持たない）
    expect(src).not.toContain('requireAuth');
  });
});
