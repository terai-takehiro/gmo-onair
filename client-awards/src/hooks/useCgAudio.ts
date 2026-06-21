import { useCallback, useEffect, useRef } from 'react';
import api from '@/lib/api';

/**
 * 演出SE 再生フック (CG 出力URL 用) — v2.9.122
 *
 * - イベントの音源マッピング (GET /awards/events/:id/sounds) を取得し、定期更新。
 * - `play(layer, step, rankStart?)`: 現在鳴っている音を即停止 (カットアウト) してから
 *   割り当てSEを再生。該当が無ければ停止のみ (= TAKE でカットアウトされ無音)。
 * - 音声は 1 チャンネル (単一 <audio>)。常に最新の TAKE の音だけが鳴る。
 * - `enabled=false` (?audio 無し) のときは何もしない (従来通り無音)。
 */
export interface CgSound {
  id: number;
  layer: 'ranking' | 'quiz';
  step: string;
  rankStart: number | null;
  url: string;
  volume: number;
  enabled: boolean;
}

export function useCgAudio(eventId: number | null, enabled: boolean) {
  const soundsRef = useRef<CgSound[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 単一 audio 要素を用意
  useEffect(() => {
    if (!enabled) return;
    const a = new Audio();
    a.preload = 'auto';
    audioRef.current = a;
    return () => { a.pause(); audioRef.current = null; };
  }, [enabled]);

  // マッピング取得 (アップロード反映のため 30s ごとに更新)
  useEffect(() => {
    if (!enabled || !eventId) return;
    let alive = true;
    const load = () => {
      api.get(`/awards/events/${eventId}/sounds`)
        .then((r) => { if (alive) soundsRef.current = (r.data?.data ?? []) as CgSound[]; })
        .catch(() => { /* 取得失敗時は無音 */ });
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [eventId, enabled]);

  const play = useCallback((layer: 'ranking' | 'quiz', step: string, rankStart?: number | null) => {
    if (!enabled) return;
    const a = audioRef.current;
    if (!a) return;
    // カットアウト: 現在の音を即停止
    try { a.pause(); a.currentTime = 0; } catch { /* noop */ }

    const list = soundsRef.current;
    // rankStart 指定があれば一致を優先、無ければ rankStart=null のものにフォールバック
    const match =
      list.find((s) => s.enabled && s.layer === layer && s.step === step &&
        (rankStart == null ? s.rankStart == null : s.rankStart === rankStart)) ??
      (rankStart != null
        ? list.find((s) => s.enabled && s.layer === layer && s.step === step && s.rankStart == null)
        : undefined);
    if (!match) return; // 割り当て無し → 無音 (カットアウト済み)

    a.src = match.url;
    a.volume = Math.max(0, Math.min(1, match.volume ?? 1));
    a.play().catch(() => { /* OBS 以外の autoplay 制限は無視 */ });
  }, [enabled]);

  return { play };
}
