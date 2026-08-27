import { Router } from 'express';
import { generateICalFeed, type ICalEvent } from '../../../shared/utils/ical';
import { taskCommentsService } from '../../tasks/services/task-comments.service';

// タスク期限の ICS フィード（認証不要 — URL のトークンで認証）
// docs/core-redesign-plan.md Phase 2 ⑦「タスク→個人カレンダー書き戻し（ICS）」
//
// Google Calendar / Outlook から定期取得される配信口。スタジオ予約のフィード
// （production/studio.routes.ts の /calendar.ics・migration 108）と同じトークン式だが、
// あちらは全員共通の 1 本、**こちらは人ごとに 1 本**（user_task_feed_tokens。
// 見えるのは本人の未完了タスクの期限だけ。金額は載せない — 要件 D0 の線引き）。
// トークンの発行/再発行は dailyops の POST /tasks/feed-token（認証あり）。
//
// **トークン不一致は 404**（403 にしない — 存在の有無ごと見せない。
// スタジオ側は共通トークンなので 403 でよいが、こちらは個人の URL なので伏せる）。

const router = Router();

router.get('/task-feeds/:token.ics', async (req, res) => {
  try {
    const userId = await taskCommentsService.userIdForFeedToken(String(req.params.token ?? ''));
    if (!userId) {
      res.status(404).type('text/plain; charset=utf-8')
        .send('Not found (タスク・依頼の画面から購読用URLを再取得してください)');
      return;
    }

    // 過去30日〜未来1年の未完了タスク（期限は COALESCE の統一式。service 側）
    const tasks = await taskCommentsService.listFeedTasks(userId);

    const events: ICalEvent[] = tasks.map((t) => {
      // SUMMARY = タイトル + 案件名（どの案件の仕事かが予定の一覧で分かるように）
      const summary = t.project_name ? `${t.title}（${t.project_name}）` : t.title;
      const desc = [
        t.project_name ? (t.gls_number ? `案件: [${t.gls_number}] ${t.project_name}` : `案件: ${t.project_name}`) : null,
        'GMO ONAiR のタスク期限（完了すると次回の取得で消えます）',
      ].filter(Boolean).join('\n');
      return {
        uid: `task-${t.id}@gmo-onair.jp`,
        summary,
        description: desc,
        // 期限の時刻に 30 分の枠で置く（終日にすると「いつまで」の時刻が消える）
        dtstart: t.due_at,
        dtend: t.due_end,
        created: t.created_at,
        lastModified: t.updated_at,
      };
    });

    const ical = generateICalFeed('GMO ONAiR タスク期限', events);

    // method=PUBLISH を Content-Type にも明示（Outlook/Exchange のフェッチャが参照する。スタジオ側と同じ）
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8; method=PUBLISH');
    res.setHeader('Cache-Control', 'private, max-age=300'); // 個人のフィードなので private で 5 分
    res.send(ical);
  } catch (err) {
    // 例外を握りつぶさない（カレンダークライアントは本文を無視するが、
    // ブラウザで直接開けば原因が分かる。スタジオ側 /calendar.ics と同じ流儀）
    console.error('[task-feeds] generation error:', err);
    res.status(500).type('text/plain; charset=utf-8')
      .send('task feed error: ' + (err as Error).message);
  }
});

export default router;
