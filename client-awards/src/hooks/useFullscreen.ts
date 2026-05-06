import { useCallback, useEffect, useState } from 'react';

// v2.8.98+: 送出 UI 用の全画面トグル。F キーでも切替可能。
// ブラウザの Fullscreen API を使用。document.documentElement で全画面化。
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  // F キーで全画面トグル (input/textarea にフォーカス中は無効)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return { isFullscreen, toggle };
}
