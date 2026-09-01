/**
 * contexts/graphics/services/vote-lifecycle.service.ts — 段6-6・段6-7
 *
 * テロップCG 投票・クイズパーツ（part_key: 'vote'）の `fields.voteState`
 * （'open' | 'closed' | 'revealed'。クライアント側は `voteState.ts` の型が正）遷移に連動して、
 *   ① 内部の自動締切: `fields.countdownSeconds` が設定されていれば、'open' になった
 *      countdownSeconds 秒後にサーバー側で自動的に `voteState: 'closed'` へ進める（段6-6）
 *   ② 別 VPS インタラクティブ演出との連動: 出題(activate)・締切(close)・正解発表(reveal)
 *      （段6-7。`fields.interactiveQuestionId` が紐付いているページだけ）
 * を行う。
 *
 * `server/src/contexts/quiz/services/interactive-lifecycle.service.ts`（旧 Awards・
 * カウントダウン開始/終了という別概念の関数を呼び分ける設計・実運用実績あり）の
 * 「即activate + countdown+bufferで締切を予約」という核となる設計を踏襲するが、
 * テロップCGは `voteState` という1つの状態機械の遷移点にすべて集約する点が異なる
 * （呼び出し元は1つ・`onVoteStateTransition`）。
 *
 * サーバーはクライアント側 TS（`client-techops/src/pages/graphics/voteState.ts` 等）を
 * import できないため、`voteState`/`countdownSeconds`/`interactiveQuestionId` の
 * 読み取りロジックはここに小さく再実装している（キー名・意味は voteInteractive.ts の
 * コメントと一致させること）。
 */
import type { Server as SocketIOServer } from 'socket.io';
import { queryOne } from '../../../shared/db/connection';
import { fetchCues, fetchProjectInteractiveLinkFull, mapPage } from '../store';
import { interactiveBridge, type InteractiveLink } from './interactive-bridge.service';

export type VoteState = 'open' | 'closed' | 'revealed';

/** `fields.voteState` を読む。未知の値・未指定はすべて `'revealed'`（voteState.ts と同じ後方互換）。 */
export function readVoteStateServer(fields: Record<string, unknown> | null | undefined): VoteState {
  const v = fields?.['voteState'];
  return v === 'open' || v === 'closed' ? v : 'revealed';
}

function readCountdownSecondsServer(fields: Record<string, unknown> | null | undefined): number | null {
  const v = fields?.['countdownSeconds'];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

function readInteractiveQuestionIdServer(fields: Record<string, unknown> | null | undefined): string | null {
  const v = fields?.['interactiveQuestionId'];
  return typeof v === 'string' && v !== '' ? v : null;
}

interface PageTimers {
  internalClose?: ReturnType<typeof setTimeout>;
  externalClose?: ReturnType<typeof setTimeout>;
}

// pageId → 予約中タイマー（メモリ保持。サーバー再起動で消えるが、次の「続き」操作
// （voteState が再び 'open' になる操作）で再構築される — 旧 awards の `closeTimers` と
// 同じ割り切り）。
const timers = new Map<number, PageTimers>();

function clearInternalClose(pageId: number): void {
  const t = timers.get(pageId);
  if (t?.internalClose) {
    clearTimeout(t.internalClose);
    t.internalClose = undefined;
  }
}

function clearExternalClose(pageId: number): void {
  const t = timers.get(pageId);
  if (t?.externalClose) {
    clearTimeout(t.externalClose);
    t.externalClose = undefined;
  }
}

/** このページの予約中タイマーを全部止める（連携解除・ページ削除に連動して呼ぶ）。 */
export function clearVoteTimers(pageId: number): void {
  const t = timers.get(pageId);
  if (t) {
    if (t.internalClose) clearTimeout(t.internalClose);
    if (t.externalClose) clearTimeout(t.externalClose);
  }
  timers.delete(pageId);
}

async function loadLink(projectId: number): Promise<InteractiveLink | null> {
  try {
    return await fetchProjectInteractiveLinkFull(projectId);
  } catch (err) {
    console.warn('[vote-lifecycle] fetchProjectInteractiveLinkFull failed:', (err as Error).message);
    return null;
  }
}

/**
 * 内部の自動締切（countdownSeconds 経過）が発火したときの処理。操作者が既に手動で
 * 状態を進めていたら（voteState が 'open' でなくなっていたら）何もしない — 予約時点の
 * 前提が崩れているので、上書きで進行を巻き戻さない。
 */
async function performInternalAutoClose(io: SocketIOServer, projectId: number, pageId: number): Promise<void> {
  const t = timers.get(pageId);
  if (t) t.internalClose = undefined;

  const row = await queryOne(
    `UPDATE graphics_pages
        SET fields = jsonb_set(COALESCE(fields, '{}'::jsonb), '{voteState}', '"closed"'::jsonb, true),
            updated_at = NOW()
      WHERE id = ? AND fields->>'voteState' = 'open'
      RETURNING *`,
    [pageId],
  );
  if (!row) return;

  const page = mapPage(row);
  const cues = await fetchCues(projectId);
  io.of('/graphics').to(`project:${projectId}`).emit('cg:sync', { cues, page, timestamp: Date.now() });
  console.log(`[vote-lifecycle] internal auto-close: voteState -> closed (page ${pageId})`);

  // ⚠️ 外部（Interactive）側の締切タイマーはここでは触らない。内部の自動締切
  // (countdownSeconds) と外部の締切 (countdownSeconds + closeBufferSeconds) はわざと
  // 別スケジュールで動く — 配信ディレイのある視聴者がまだ回答できる猶予を守るため。
}

/**
 * `voteState` の遷移を検知して呼ぶ（`pages.routes.ts` の `PUT /pages/:id` から、
 * DB へ保存する直前に呼ぶこと）。返り値は openedAt 等を書き足した新しい `fields`。
 * 外部呼び出し（activate/close/reveal）は `await` せず投げっぱなしにする — CG の
 * 進行を外部APIの応答待ちで遅らせないことを優先する（失敗してもログに警告を出すだけ）。
 */
export async function onVoteStateTransition(
  io: SocketIOServer,
  projectId: number,
  pageId: number,
  prevVoteState: VoteState,
  nextFields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const nextState = readVoteStateServer(nextFields);

  // ── 新規出題・再出題・TAKEでのリセット等、'open' への遷移 ──────────────
  if (nextState === 'open' && prevVoteState !== 'open') {
    const fields: Record<string, unknown> = { ...nextFields, openedAt: new Date().toISOString() };

    // 既存の予約を全部差し替える
    clearVoteTimers(pageId);

    const countdownSeconds = readCountdownSecondsServer(fields);
    const questionId = readInteractiveQuestionIdServer(fields);
    const entry: PageTimers = {};

    if (countdownSeconds != null) {
      entry.internalClose = setTimeout(() => {
        void performInternalAutoClose(io, projectId, pageId);
      }, countdownSeconds * 1000);
    }

    const link = await loadLink(projectId);
    if (link?.baseUrl && link?.apiKeySecret && link.autoControl !== false && questionId) {
      interactiveBridge
        .activateQuestion(link, questionId)
        .then(() => console.log(`[vote-lifecycle] activated question ${questionId} (page ${pageId})`))
        .catch((err) => console.warn('[vote-lifecycle] activate failed:', (err as Error).message));

      if (countdownSeconds != null) {
        const buffer = Math.max(0, Math.min(120, Math.floor(Number(link.closeBufferSeconds) || 0)));
        const delayMs = (countdownSeconds + buffer) * 1000;
        entry.externalClose = setTimeout(() => {
          const t = timers.get(pageId);
          if (t) t.externalClose = undefined;
          interactiveBridge
            .closeQuestion(link, questionId)
            .then(() => console.log(`[vote-lifecycle] closed(external, buffered) question ${questionId} (page ${pageId})`))
            .catch((err) => console.warn('[vote-lifecycle] close(external) failed:', (err as Error).message));
        }, delayMs);
        console.log(`[vote-lifecycle] scheduled external close of ${questionId} in ${Math.round(delayMs / 1000)}s (countdown ${countdownSeconds}s + buffer ${buffer}s)`);
      }
    }

    if (entry.internalClose || entry.externalClose) timers.set(pageId, entry);
    return fields;
  }

  // ── 操作者が「続き」で手動締切した場合（'open' → 'closed'） ────────────
  if (nextState === 'closed' && prevVoteState === 'open') {
    // 保留中の内部自動締切はもう要らない
    clearInternalClose(pageId);

    const questionId = readInteractiveQuestionIdServer(nextFields);
    const link = await loadLink(projectId);
    if (link?.baseUrl && link?.apiKeySecret && questionId) {
      // 設計判断（旧 awards からの改善点）: 旧 `interactive-lifecycle.service.ts` は
      // 締切が countdown+buffer の時間駆動のみで、operator が早めに操作しても予約時刻まで
      // 待っていた。テロップCGでは「操作者が明示的に締切る（'続き'）を押した」という
      // はっきりした意図があるため、バッファを待たず今すぐ外部にも反映する方が自然と判断した。
      // （バッファは「自動締切が視聴者の回答機会を奪わないための猶予」であって、操作者自身の
      // 明示操作を遅らせる理由にはならない）
      clearExternalClose(pageId);
      interactiveBridge
        .closeQuestion(link, questionId)
        .then(() => console.log(`[vote-lifecycle] closed(manual) question ${questionId} (page ${pageId})`))
        .catch((err) => console.warn('[vote-lifecycle] close(manual) failed:', (err as Error).message));
    }
    return nextFields;
  }

  // ── 正解発表・開票（'closed' → 'revealed'） ───────────────────────
  if (nextState === 'revealed' && prevVoteState === 'closed') {
    const questionId = readInteractiveQuestionIdServer(nextFields);
    const link = await loadLink(projectId);
    if (link?.baseUrl && link?.apiKeySecret && questionId) {
      interactiveBridge
        .revealQuestion(link, questionId)
        .then(() => console.log(`[vote-lifecycle] revealed question ${questionId} (page ${pageId})`))
        .catch((err) => console.warn('[vote-lifecycle] reveal failed:', (err as Error).message));
    }
    return nextFields;
  }

  return nextFields;
}

/** 全タイマー停止（graceful shutdown 用）。 */
export function shutdownVoteLifecycle(): void {
  for (const t of timers.values()) {
    if (t.internalClose) clearTimeout(t.internalClose);
    if (t.externalClose) clearTimeout(t.externalClose);
  }
  timers.clear();
}
