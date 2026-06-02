/**
 * contexts/quiz/services/interactive-lifecycle.service.ts — v2.9.29
 *
 * リアルタイムCG (Awards) のクイズ/アンケート カウントダウンに連動して、
 * 別 VPS のインタラクティブ演出側の問題を自動で「出題 (activate)」「締切 (close)」する。
 *
 * - カウントダウン開始 (poll ステップ突入) → 即 activate (回答受付開始)。
 * - カウントダウン終了 + 配信ディレイ バッファ秒 → close (回答受付終了)。
 *   サーバー側 setTimeout で `poll_started_at + (countdown_seconds + buffer)` に締切を予約。
 *   operator が途中で次ステップへ進めても締切は予約時刻まで待つ (ディレイ視聴者の回答を守る)。
 * - 新しい poll が始まれば既存の締切タイマーを差し替え。
 *
 * 集計結果の反映は interactive-poller.service が担当 (送出中は 2 秒間隔で vote_count 更新)。
 */
import { queryOne } from '../../../shared/db/connection';
import { interactiveBridge, type InteractiveLink } from './interactive-bridge.service';

// event_id → 締切タイマー (メモリ保持。サーバー再起動で消えるが再 TAKE で復帰可能)
const closeTimers = new Map<number, ReturnType<typeof setTimeout>>();

interface PollContext {
  interactiveQuestionId: string | null;
  countdownSeconds: number;
  link: InteractiveLink | null;
}

async function loadContext(eventId: number, quizId: number): Promise<PollContext | null> {
  const row = await queryOne(
    `SELECT q.interactive_question_id, q.countdown_seconds, e.interactive_link
       FROM quizzes q
       JOIN awards_events e ON e.id = q.event_id
      WHERE q.id = ? AND q.event_id = ?`,
    [quizId, eventId],
  );
  if (!row) return null;
  const rawLink = (row as { interactive_link?: unknown }).interactive_link;
  const link = rawLink
    ? ((typeof rawLink === 'string' ? JSON.parse(rawLink) : rawLink) as InteractiveLink)
    : null;
  return {
    interactiveQuestionId: ((row as { interactive_question_id?: string | null }).interactive_question_id) ?? null,
    countdownSeconds: Number((row as { countdown_seconds?: number }).countdown_seconds) || 60,
    link,
  };
}

function cancelClose(eventId: number): void {
  const t = closeTimers.get(eventId);
  if (t) {
    clearTimeout(t);
    closeTimers.delete(eventId);
  }
}

/**
 * カウントダウン (poll) 開始時に呼ぶ。即出題 + 終了 + バッファで自動締切を予約。
 * 連携未設定 / 未紐付け / 自動制御 OFF のときは何もしない。
 */
export async function onCountdownStart(eventId: number, quizId: number, pollStartedAtMs: number): Promise<void> {
  let ctx: PollContext | null;
  try {
    ctx = await loadContext(eventId, quizId);
  } catch (err) {
    console.warn('[ia-lifecycle] loadContext failed:', (err as Error).message);
    return;
  }
  if (!ctx || !ctx.interactiveQuestionId || !ctx.link) return;
  if (!ctx.link.baseUrl || !ctx.link.apiKeySecret) return;
  if (ctx.link.autoControl === false) return;

  const link = ctx.link;
  const qid = ctx.interactiveQuestionId;

  // 既存の締切予約を差し替え
  cancelClose(eventId);

  // 出題 (即時) — 失敗しても CG 進行は止めない
  interactiveBridge
    .activateQuestion(link, qid)
    .then(() => console.log(`[ia-lifecycle] activated question ${qid} (event ${eventId})`))
    .catch((err) => console.warn('[ia-lifecycle] activate failed:', (err as Error).message));

  // 締切予約: poll_started_at + (countdown + buffer)
  const buffer = Math.max(0, Math.min(120, Math.floor(Number(link.closeBufferSeconds) || 0)));
  const closeAtMs = pollStartedAtMs + (ctx.countdownSeconds + buffer) * 1000;
  const delay = Math.max(0, closeAtMs - Date.now());
  const timer = setTimeout(() => {
    closeTimers.delete(eventId);
    interactiveBridge
      .closeQuestion(link, qid)
      .then(() => console.log(`[ia-lifecycle] closed question ${qid} (event ${eventId})`))
      .catch((err) => console.warn('[ia-lifecycle] close failed:', (err as Error).message));
  }, delay);
  closeTimers.set(eventId, timer);
  console.log(`[ia-lifecycle] scheduled close of ${qid} in ${Math.round(delay / 1000)}s (countdown ${ctx.countdownSeconds}s + buffer ${buffer}s)`);
}

/** 全タイマー停止 (graceful shutdown 用) */
export function shutdownInteractiveLifecycle(): void {
  for (const t of closeTimers.values()) clearTimeout(t);
  closeTimers.clear();
}
