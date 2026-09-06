/**
 * 資料ビルダー（隔週キープの「資料をつくる」）の API — react-query フック集
 *
 * 口は `server/src/contexts/dailyops/routes/keep-deck.routes.ts`（設計は
 * docs/design/v4/keep-report.md §6・§9）。会議日（`YYYY-MM-DD`）で1本の構成（`KeepDeck`）を持つ。
 *
 *   GET  /dailyops/keep/decks/:meeting          … 構成＋パック（無ければ前回の構成か標準の構成から組む）
 *   PUT  /dailyops/keep/decks/:meeting          … 保存（サーバーが前の版と比べて人の直しを記録する）
 *   POST /dailyops/keep/decks/:meeting/rebuild  … いまの数字で組み直す
 *   POST /dailyops/keep/decks/:meeting/export   … pptx を作って Box に置き、手元にも落とす
 *   GET  /dailyops/keep/meetings                … 次回・前回の会議日
 *
 * ── 鍵の決めごと ────────────────────────────────────────────
 *
 * 構成は**画面側の store（`pages/weekly/deck/deckState.ts`）が編集の正**で、
 * この query は「開いたときの1回」と「組み直したあと」だけ store に流し込む。
 * だから `staleTime: Infinity`・窓の復帰で再取得しない — 編集中に裏で取り直すと、
 * 打ちかけの上書きがサーバーの古い版で巻き戻る。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyError } from '@gmo-onair/shared/src/client/notify';
import type { KeepDeck, KeepDeckEdit, KeepReportPack } from '@gmo-onair/shared/src/keepReport/types';
import api from './api';
import { download, filenameOf, messageOf, PPTX_MIME } from './download';

export interface DeckBundle {
  deck: KeepDeck;
  pack: KeepReportPack;
  /** 週報の確定で凍結したパックを読んでいるか（true なら「数字を更新」は効かない） */
  pack_frozen: boolean;
  previous_meeting_date: string | null;
}

export interface SaveDeckResult {
  deck: KeepDeck;
  version: number;
  /** サーバーが記録した人の直し（件数か一覧かはサーバーの実装に合わせて両方受ける） */
  edits: KeepDeckEdit[] | number;
}

export interface KeepMeetings {
  next_meeting_date: string | null;
  previous_meeting_date: string | null;
}

export interface ExportResult {
  /** Box に入ったか（`X-Box-Stored: 1`） */
  stored: boolean;
  fileId: string | null;
  /** 入らなかった理由（`X-Box-Reason`） */
  reason: string;
  filename: string;
}

/** `{ success, data }` で包まれていても、素で返ってきても同じに読む */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body && (body as { data?: unknown }).data !== undefined) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export const deckKeys = {
  all: ['keep-deck'] as const,
  deck: (meeting: string) => ['keep-deck', meeting] as const,
  meetings: ['keep-meetings'] as const,
};

export function useKeepMeetings() {
  return useQuery({
    queryKey: deckKeys.meetings,
    queryFn: () => api.get('/dailyops/keep/meetings').then((r) => unwrap<KeepMeetings>(r.data)),
    staleTime: 60_000,
  });
}

export function useDeck(meeting: string | null, enabled = true) {
  return useQuery({
    queryKey: deckKeys.deck(meeting ?? ''),
    enabled: enabled && !!meeting,
    queryFn: () => api.get(`/dailyops/keep/decks/${meeting}`).then((r) => unwrap<DeckBundle>(r.data)),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** 保存。結果は呼ぶ側（自動保存）が「保存済み HH:MM」に出すので、共通の受け皿は黙らせる */
export function useSaveDeck(meeting: string | null) {
  return useMutation({
    mutationFn: (deck: KeepDeck) =>
      api.put(`/dailyops/keep/decks/${meeting}`, { deck }).then((r) => unwrap<SaveDeckResult>(r.data)),
    meta: { silent: true },
  });
}

export function useRebuildDeck(meeting: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post(`/dailyops/keep/decks/${meeting}/rebuild`).then((r) => unwrap<DeckBundle>(r.data)),
    onSuccess: (bundle) => {
      if (meeting) qc.setQueryData(deckKeys.deck(meeting), bundle);
    },
    meta: { action: '数字の更新' },
  });
}

/**
 * PowerPoint に出力。**押すと ①pptx を作り ②Box の会議日フォルダに置き ③手元に落とす。**
 * サーバーはダウンロードを止めない（Box が落ちている日に資料を出せないほうが困る）ので、
 * 入ったかどうかは応答ヘッダーで受け取り、呼ぶ側が**必ず画面に出す**。
 */
export function useExportDeck(meeting: string | null) {
  return useMutation({
    mutationFn: async (): Promise<ExportResult> => {
      const res = await api.post(`/dailyops/keep/decks/${meeting}/export`, null, { responseType: 'blob' });
      const filename = filenameOf(res, `${(meeting ?? '').replace(/-/g, '').slice(2)}_橋口社長隔週キープ_ONAiR.pptx`);
      download(res.data, filename, PPTX_MIME);
      return {
        stored: String(res.headers['x-box-stored'] ?? '') === '1',
        fileId: res.headers['x-box-file-id'] ? String(res.headers['x-box-file-id']) : null,
        reason: String(res.headers['x-box-reason'] ?? ''),
        filename,
      };
    },
    onError: async (err) => {
      notifyError(await messageOf(err, 'PowerPoint を出力できませんでした。少し待ってからもう一度お試しください'));
    },
  });
}
