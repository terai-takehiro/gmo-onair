/**
 * 視聴者数の取得だけを行うサービス関数群。
 *
 * DB も HTTP リクエスト/レスポンスも知らない。「鍵を渡すと数を返す」だけの形にして、
 * ブラウザ用の /proxy/* ルート（画面用）とサーバー側の計測（measure.service.ts）の
 * 両方から呼べるようにする。呼び出しの中身は proxy.routes.ts から移しただけで、
 * 挙動は1つも変えていない（実装設計 §4-1）。
 */
import axios from 'axios';

export interface ZoomCred {
  clientId: string;
  clientSecret: string;
  accountId: string;
}

/** YouTube Data API v3 の videos.list。videoIds は何本束ねても呼び出しは1回（1ユニット消費）。 */
export async function fetchYoutube(
  apiKey: string,
  videoIds: string[],
): Promise<Record<string, number | null>> {
  const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: { id: videoIds.join(','), part: 'liveStreamingDetails,statistics', key: apiKey },
    timeout: 10000,
  });

  const items = ytRes.data.items || [];
  const counts: Record<string, number | null> = {};
  for (const item of items) {
    const concurrent = item.liveStreamingDetails?.concurrentViewers;
    counts[item.id] = concurrent != null ? parseInt(concurrent, 10) : null;
  }
  return counts;
}

/** Jstream Equipmedia の getLiveConnection。CSV の最終行・末尾の値が同時接続数。 */
export async function fetchJstream(token: string, lpid: string): Promise<number> {
  const jsRes = await axios.get(
    'https://api01-platform.stream.co.jp/apiservice/getLiveConnection/',
    { params: { token, lpid, type: 'text' }, timeout: 10000 },
  );

  const text: string = jsRes.data || '';
  const lines = text.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1] || '';
  const parts = last.split(',');
  const count = parseInt(parts[parts.length - 1], 10);
  return isNaN(count) ? 0 : count;
}

/** Zoom の metrics/{meetings|webinars}/:id/participants?type=live。meeting と webinar は別リクエスト。 */
export async function fetchZoom(
  token: string,
  kind: 'meeting' | 'webinar',
  id: string,
): Promise<number> {
  const endpoint =
    kind === 'webinar'
      ? `https://api.zoom.us/v2/metrics/webinars/${encodeURIComponent(id)}/participants?type=live`
      : `https://api.zoom.us/v2/metrics/meetings/${encodeURIComponent(id)}/participants?type=live`;

  const zoomRes = await axios.get(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
  return zoomRes.data?.total_count ?? 0;
}

/**
 * API のエラー文言から鍵の断片を伏せる（保存前に必ず通すこと）。
 *
 * Google 等のエラー文にはリクエスト URL がそのまま載ることがあり、
 * `key=AIza...` のような形で API キーが混ざる場合がある。画面に返すだけなら
 * 痕跡は残らないが、liveops_poll_log.message は DB に保存するため、
 * 保存する前に必ず伏せる（実装設計 §6-3 / §12-5）。
 */
export function maskSecretsInMessage(message: string): string {
  return message.replace(/key=[0-9A-Za-z_-]{20,}/g, 'key=***');
}

/** axios のエラーから画面/ログ用のメッセージを取り出す（伏せ字は呼び出し側で行う） */
export function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return (
    anyErr?.response?.data?.error?.message ||
    anyErr?.response?.data?.message ||
    anyErr?.message ||
    fallback
  );
}

/**
 * YouTube URL から動画 ID を抽出。
 * `client-live/src/hooks/useViewer.ts` の同名関数と同じ正規表現（server は
 * client のコードを import できないため複製。挙動をズラさないよう注意すること）。
 * 対応形式: watch?v=ID / youtu.be/ID / live/ID / shorts/ID / embed/ID
 */
export function extractYoutubeVideoId(url: string): string {
  const m = url.match(/(?:[?&]v=|youtu\.be\/|\/(?:live|shorts|embed)\/)([A-Za-z0-9_-]{6,})/);
  return m?.[1] || '';
}
