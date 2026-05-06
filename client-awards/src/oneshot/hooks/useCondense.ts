import { useLayoutEffect, useRef, type DependencyList } from 'react';

// テキストが親をはみ出す場合、scaleX で長体にして収める
export function useCondense<T extends HTMLElement>(deps: DependencyList, minScale = 0.7) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
    el.style.transformOrigin = 'left center';
    el.style.display = 'inline-block';
    el.style.whiteSpace = 'nowrap';
    const parent = el.parentElement;
    if (!parent) return;
    const parentStyle = getComputedStyle(parent);
    const parentInner =
      parent.clientWidth -
      parseFloat(parentStyle.paddingLeft || '0') -
      parseFloat(parentStyle.paddingRight || '0');
    const own = el.scrollWidth;
    if (own > parentInner && parentInner > 0) {
      const scale = Math.max(minScale, parentInner / own);
      el.style.transform = `scaleX(${scale})`;
    } else {
      el.style.transform = '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
