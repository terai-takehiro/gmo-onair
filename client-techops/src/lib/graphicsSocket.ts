/**
 * テロップCG のリアルタイム同期（Socket.IO `/graphics` ネームスペース）。
 *
 * - **匿名でも繋がるがリッスン専用**（出力画面は OBS のブラウザソース＝ログイン不要で
 *   開くため。公開音声サポートと同じ決めごと）。操作系（`cg:set` / `cg:continue`）は
 *   サーバー側が handshake 認証（qsheet 権限）を要求するので、ログイン済みなら
 *   資格情報を渡す（`lib/socket.ts` と同じ読み方）。
 * - techops 本体の `/techops` ネームスペース（`lib/socket.ts`・`cue:*` は本番進行で
 *   使用中）とは**別ネームスペース**。CG のイベント名は `cg:*` を新設した
 *   （docs/design/v4/graphics.md §9 の技術上の要注意）。
 * - 受け: `cg:sync` { cues, timestamp } … スロットごとの cue の全量＋サーバー時刻(ms)
 * - 送り: `cg:set`  { slot, pageId | null } … TAKE（pageId あり）／ OUT（null）
 *
 * `lib/socket.ts` のようなシングルトンにはしない — 送出コンソールと出力画面が
 * 同じブラウザで同時に開かれ得るため、画面ごとに1本持って unmount で切る。
 */
import { io, type Socket } from 'socket.io-client';
import { readSocketAuth } from '@/lib/socket';
import type { GraphicsCueRow, GraphicsPageRow, GraphicsSlot } from '@/lib/graphicsApi';

export interface CgSyncPayload {
  cues: GraphicsCueRow[];
  /** サーバー時刻（epoch ms）。時計・カウントダウンの skew 補正に使う */
  timestamp: number;
  /** テーマ変更の同報時だけ載る（PUT /projects/:id が付ける） */
  theme?: string;
  /**
   * ページの fields 更新（スコアの±など）の同報時だけ載る（PUT /pages/:id が付ける）。
   * 受け手（出力画面・送出コンソール）は手元の pages 一覧を id で差し替えるだけでよい
   * （全量は積まない — cue 差し替えと同じ「変わった分だけ載せる」設計）。
   */
  page?: GraphicsPageRow;
  /**
   * 段6-4: このTAKEでスロット間自動退出ルールにより自動OUTになったスロット
   * （`cg:set` / `POST …/cue` の同報時だけ載る。無ければ空配列か未定義）。
   */
  autoOutSlots?: GraphicsSlot[];
}

export function createGraphicsSocket(projectId: string): Socket {
  return io('/graphics', {
    path: '/socket.io/',
    query: { projectId },
    // 送出コンソールの操作系はサーバーが認証を要求する。出力画面（ログインなし）は
    // 空の auth のまま繋がり、リッスン専用で cg:sync を受け続ける
    auth: readSocketAuth(),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
  });
}

export function emitCgSet(socket: Socket, slot: GraphicsSlot, pageId: string | null) {
  socket.emit('cg:set', { slot, pageId });
}

/** 「続き」（段6-1・汎用機構）: 対象スロットの reveal_phase を+1する。 */
export function emitCgContinue(socket: Socket, slot: GraphicsSlot) {
  socket.emit('cg:continue', { slot });
}
