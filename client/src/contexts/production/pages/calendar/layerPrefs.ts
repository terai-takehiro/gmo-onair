/**
 * ① 予定 — 「出すもの」（スタジオ/パートナー/自分）の記憶。
 *
 * デスクトップ（① 予定）とスマホ（この回で作った月表＋アジェンダ）の**両方**が
 * 同じチェックを見る。**キーを2つに分けると、PCで外したはずのレイヤーが
 * スマホでは出たままになる**（逆も同じ）。一箇所にまとめておく。
 */
import type { CalLayer } from './calendarLayout';

const LAYER_KEY = 'unified-cal-layers';

export function loadLayers(): Record<CalLayer, boolean> {
  try {
    const raw = localStorage.getItem(LAYER_KEY);
    if (raw) return { studio: true, partner: true, my: true, ...JSON.parse(raw) };
  } catch { /* 壊れていたら既定に戻す */ }
  return { studio: true, partner: true, my: true };
}

export function saveLayers(layers: Record<CalLayer, boolean>) {
  try { localStorage.setItem(LAYER_KEY, JSON.stringify(layers)); } catch { /* 保存できなくても動く */ }
}
