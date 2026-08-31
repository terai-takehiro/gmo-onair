// テロップCG — 自動退出ルール（段6-4）でOUTになったスロットを一時ハイライトするための
// 小さなフック。送出コンソール（GraphicsConsolePage.tsx）専用の切り出し
// （400行の目安を超えないため。ロジック自体はこのファイルだけで完結する）。
import { useEffect, useRef, useState } from 'react';
import type { GraphicsSlot } from '@/lib/graphicsApi';

export function useAutoOutHighlight(durationMs = 2500): {
  highlight: Set<GraphicsSlot>;
  /** 自動OUTになったスロットを一定時間だけハイライトする（空配列なら何もしない） */
  flash: (slots: GraphicsSlot[]) => void;
} {
  const [highlight, setHighlight] = useState<Set<GraphicsSlot>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const flash = (slots: GraphicsSlot[]) => {
    if (slots.length === 0) return;
    setHighlight(new Set(slots));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHighlight(new Set()), durationMs);
  };

  return { highlight, flash };
}
