/**
 * ⌘K の窓を「どこからでも」開けるようにするための持ち場
 *
 * 窓（`WikiSearchPalette`）はシェルの外側に1つだけ置きます。ホームの検索欄を
 * 押したときも、`⌘K` を押したときも**同じ窓**が開くように、開いているかどうかを
 * ここに持ちます。react-query や Context を挟まないのは、値が1つ（開・閉）しか
 * 無く、押した瞬間に開かないと「押せていない」と読まれるためです。
 */
import { useSyncExternalStore } from 'react';

let isOpen = false;
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function snapshot(): boolean {
  return isOpen;
}

/** 開け閉めする。同じ値なら何もしない（描き直しを増やさない） */
export function setWikiSearchOpen(next: boolean): void {
  if (isOpen === next) return;
  isOpen = next;
  for (const fn of listeners) fn();
}

/** ホームの検索欄・`⌘K` から呼ぶ */
export function openWikiSearch(): void {
  setWikiSearchOpen(true);
}

/** 窓の側で読む */
export function useWikiSearchOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * `⌘K`（Windows は `Ctrl+K`）のキーキャップに出す文字。
 * Mac 以外で `⌘` を出すと、押せないキーを案内することになります。
 */
export function searchShortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/.test(ua) ? '⌘K' : 'Ctrl K';
}
