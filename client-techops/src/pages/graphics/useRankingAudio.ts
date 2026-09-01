// テロップCG — ランキング発表パーツ（part_key: 'ranking'）の演出SE 再生フック（段6-5）。
//
// 旧 `client-awards/src/hooks/useCgAudio.ts` ＋ `OutputPage.tsx` の
// `prevStepRef`/`play('ranking', step, rankStart)` の設計をそのまま移植する
// （レイヤー概念 `layer='ranking'|'quiz'` は今回 ranking 専用に絞ってよい——
// quiz/vote 向けSEは段6-6/6-7の範囲で対象外）。
//
// - 単一 `<audio>` 要素のみ保持。新しい `play()` のたびに `pause(); currentTime=0;`
//   してから次を再生する（同時多重再生防止）。
// - 現在ライブな ranking パーツページの `fields.step`（+ ranks52 のときは実在する
//   エントリーの最大開始順位 = rankStart）の変化を検知し、変化したときだけ再生する
//   （初回 mount 時は鳴らさない — `prevStepRef.current === null` ガード）。
// - 該当する音源が無ければ何もしない（rankStart 指定の検索がヒットしなければ
//   rankStart IS NULL の汎用SEへフォールバック——旧実装と同じ2段検索）。
import { useCallback, useEffect, useRef } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { fetchRankingSounds, type RankingSoundRow } from '@/lib/graphicsSoundsApi';
import { normalizeRankingEntries, RANKING_ENTRIES_KEY, readRankingStep } from './rankingFields';

/** ranks52 の開始順位（実在する2〜5位のうち最上位）。実在しなければ既定5（旧実装と同じ） */
function ranks52RankStart(fields: Record<string, unknown>): number {
  const entries = normalizeRankingEntries(fields[RANKING_ENTRIES_KEY]);
  const ranks = entries.map((e) => e.rank ?? 99).filter((r) => r >= 2 && r <= 5);
  return ranks.length ? Math.max(...ranks) : 5;
}

/**
 * `enabled=false`（`?audio=1` 無し）のときは何もしない（従来通り無音）。
 * `page` は現在ライブな ranking パーツのページ（無ければ `null`）。
 */
export function useRankingAudio(
  projectId: string | number | null,
  page: GraphicsPageRow | null,
  enabled: boolean,
): void {
  const soundsRef = useRef<RankingSoundRow[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevStepRef = useRef<string | null>(null);

  // 単一 audio 要素を用意
  useEffect(() => {
    if (!enabled) return;
    const a = new Audio();
    a.preload = 'auto';
    audioRef.current = a;
    return () => { a.pause(); audioRef.current = null; };
  }, [enabled]);

  // 音源マッピング取得（アップロード反映のため 30s ごとに更新）
  useEffect(() => {
    if (!enabled || projectId == null) return;
    let alive = true;
    const load = () => {
      fetchRankingSounds(projectId)
        .then((rows) => { if (alive) soundsRef.current = rows; })
        .catch(() => { /* 取得失敗時は無音（次のポーリングで再試行） */ });
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [projectId, enabled]);

  const play = useCallback((step: string, rankStart: number | null) => {
    if (!enabled) return;
    const a = audioRef.current;
    if (!a) return;
    // カットアウト: 現在の音を即停止
    try { a.pause(); a.currentTime = 0; } catch { /* noop */ }

    const list = soundsRef.current;
    // rankStart 指定があれば一致を優先、無ければ rankStart=null のものにフォールバック
    const match =
      list.find((s) => s.enabled && s.step === step &&
        (rankStart == null ? s.rankStart == null : s.rankStart === rankStart)) ??
      (rankStart != null
        ? list.find((s) => s.enabled && s.step === step && s.rankStart == null)
        : undefined);
    if (!match) return; // 割り当て無し → 無音（カットアウト済み）

    a.src = match.url;
    a.volume = Math.max(0, Math.min(1, match.volume ?? 1));
    a.play().catch(() => { /* OBS 以外の autoplay 制限は無視 */ });
  }, [enabled]);

  const step = page ? readRankingStep(page.fields) : null;
  const rankStart = step === 'ranks52' && page ? ranks52RankStart(page.fields) : null;

  useEffect(() => {
    if (!enabled || step === null) return;
    // 初回（リロード時など）は鳴らさない。実際の遷移のみ再生。
    if (prevStepRef.current === null) { prevStepRef.current = step; return; }
    if (prevStepRef.current === step) return;
    prevStepRef.current = step;
    play(step, step === 'ranks52' ? rankStart : null);
  }, [step, rankStart, enabled, play]);
}
