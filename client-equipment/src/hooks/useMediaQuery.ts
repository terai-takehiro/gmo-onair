/**
 * CSS の分かれ目を JS 側でも知るための入口。
 *
 * ── なぜ `useIsMobile` で代用できないか ─────────────────────
 *
 * 共通の `useIsMobile()`（`shared/src/client-v4/mobile.ts`）は **1023px** で、
 * Tailwind の `lg` に合わせてあります。ところが機材台帳の
 * 「表 ↔ カード」の切り替えは **768px**（`md:`）です。
 * 1023px で判断すると **768〜1023px の幅（タブレット）で、
 * いま表が出ているところにカードが出ます** — 直したいのは速さだけなので、
 * その幅の見え方を変えてはいけません。
 *
 * ⚠️ **CSS の `md:` と同じ 768px を渡すこと。** ここと CSS がずれると、
 * 「描いているのに `hidden` で見えない」か「描いていないのに場所だけ空く」に
 * なります（どちらも幅を変えないと気づけません）。
 */
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Tailwind の `md:` と同じ幅。台帳が**表**を出す幅（下回るとカード） */
export const MD_UP = '(min-width: 768px)';
