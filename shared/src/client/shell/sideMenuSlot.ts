/**
 * 左メニューの「上」の差し込み口 (`primaryAction.ts` と同じ形)
 *
 * ① 予定（PC）はミニカレンダー＋「出すもの」チェックを**共通の左メニューにマージ**
 * する（承認済みモック）。とはいえ左メニューの中身そのものは各アプリの `nav.ts` が
 * 持っており、カレンダー固有の状態（選んでいる日・レイヤーの ON/OFF）をシェルに
 * 持たせると**カレンダーを知らない他の画面までカレンダーの状態を運ぶ**ことになる。
 *
 * そこで `primaryAction.ts` と同じやり方にした: シェル（`AppSideMenu`）が
 * 空の `<div>` を1つ用意し、その DOM だけをここで配る。画面側
 * （`UnifiedCalendarPage.tsx`）が `createPortal` で描く。**中身はシェルが
 * 一切知らない** — カレンダーを使わない画面ではこの差し込み口は空のまま
 * （`empty:hidden` で罫線ごと消える）。
 */
import { createContext, useContext } from 'react';

/** シェルが用意する差し込み口。まだ無い（シェルの外・初回描画）ときは `null` */
export const SideMenuTopSlotContext = createContext<HTMLElement | null>(null);

/** 左メニューの上に描く先。`null` のときは差し込み口が無い */
export function useSideMenuTopSlot(): HTMLElement | null {
  return useContext(SideMenuTopSlotContext);
}
