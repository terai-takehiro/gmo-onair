/**
 * 未保存の変更を守る。
 *
 * ⚠️ **なぜ作ったか**（監査 2026-08-22）
 * 収録設定・配信設定は明示保存なのに、未保存の印も離脱の警告も無かった。
 * 12台ぶん打ち込んでからヘッダーの「配信設定」を押す・案件名を押して戻る・
 * タブを閉じる、のどれをやっても**警告なしで全部消えた**。
 * モックには保存ボタン自体が無く（触れば保存される想定）、実装だけが
 * 明示保存を持ち込んだため、この落とし穴が生まれた。
 */
import { useEffect } from 'react';

export function useUnsavedGuard(dirty: boolean) {
  // ① タブを閉じる・再読み込み
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 文言はブラウザが決める（指定しても出ない）。空文字を返すのが作法。
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // ② アプリの中の移動（React Router）。
  //    ⚠️ このアプリのルーターは v6 の `BrowserRouter` で `useBlocker` を持たないため、
  //    リンクの click を捕まえて確認する。`capture: true` で
  //    React Router のハンドラより先に受ける。
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      // 同じ画面の中のアンカーは素通し
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      if (!window.confirm('保存していない変更があります。このまま移動すると失われます。移動しますか？')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);
}
