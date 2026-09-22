/**
 * スマホの小さな決めごと（M0）— 画面を持たない部分
 *
 * ここに置くのは**素で試せるもの**だけです（期限のプリセットの計算など）。
 * 見た目を持つものは `sheet.tsx` / `steps.tsx` に分けてあります。
 */
import { useEffect, useState } from 'react';

/** スマホと見なす幅。**Tailwind の `lg` と同じ**にする（CSS と JS がずれると片方だけ切り替わる） */
export const MOBILE_MAX = 1023;

/**
 * いまスマホ幅か。
 *
 * **画面の中で `sm:hidden` を足して分岐させない**ための入口です
 * （`docs/design/v4/mobile.md`「実装のときに守ること」）。
 * 1つのファイルが2つの情報設計を持つと、どちらを直しているのか分からなくなります。
 *
 * **使うときは「入れ替えるのは部品ごと」にすること。**
 * 同じ部品の中で `if (mobile) return ...` と早期に返すと、
 * 幅が変わったときに**フックの数が変わって React が落ちます**。
 */
export function useIsMobile(): boolean {
  const [is, setIs] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const on = () => setIs(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, []);
  return is;
}

interface DuePreset {
  key: string;
  label: string;
  /** `YYYY-MM-DDTHH:mm`。`null` は「日時を選ぶ」（端末のピッカーを開く） */
  value: string | null;
}

/**
 * 期限のプリセット（モックの `spSheetDue` の逐語）。
 *
 *   明日 18:00 ／ 3日後 18:00 ／ 日時を選ぶ
 *
 * 決めごと「**入力は端末に任せる**」の一部です。やってはいけない例は
 * **自作の日付ホイール**。よく使う2つを先に出し、それ以外は端末のピッカーに渡します。
 *
 * `base` を渡すのは**テストのため**（`new Date()` を中で呼ぶと結果が日によって変わる）。
 */
export function duePresets(base: Date): DuePreset[] {
  const at18 = (plusDays: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + plusDays);
    d.setHours(18, 0, 0, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00`;
  };
  return [
    { key: 'tomorrow', label: '明日 18:00', value: at18(1) },
    { key: 'in3', label: '3日後 18:00', value: at18(3) },
    { key: 'pick', label: '日時を選ぶ', value: null },
  ];
}

/**
 * 期限の見え方。**過ぎたものを「あと -2日」と出さない**
 * （マイナスは読み違える。`holdLogic.ts` と同じ考え方）。
 *
 * `due` は `YYYY-MM-DD`（時刻が付いていても日付だけ見る）、`today` も同じ形。
 */
export function dueLabel(due: string | null | undefined, today: string): { text: string; tone: 'over' | 'today' | 'soon' | 'far' | 'none' } {
  if (!due) return { text: '期限なし', tone: 'none' };
  const d = due.slice(0, 10);
  if (d < today) {
    const days = Math.round((Date.parse(`${today}T00:00`) - Date.parse(`${d}T00:00`)) / 86400000);
    return { text: `${days}日超過`, tone: 'over' };
  }
  if (d === today) return { text: '今日まで', tone: 'today' };
  const days = Math.round((Date.parse(`${d}T00:00`) - Date.parse(`${today}T00:00`)) / 86400000);
  if (days <= 7) return { text: `あと ${days}日`, tone: 'soon' };
  return { text: d.replace(/-/g, '/').slice(5), tone: 'far' };
}
