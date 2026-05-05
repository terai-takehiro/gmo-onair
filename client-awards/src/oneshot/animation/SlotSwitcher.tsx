import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  SLOT_PHASE_ENTER_MS,
  SLOT_PHASE_EXIT_MS,
  SLOT_PHASE_RESIZE_MS,
} from './timings';

interface Props {
  keyId: string;
  children: ReactNode;
}

// v2.8.73+: モジュール切替時のシーケンシャル 3 フェーズ アニメーション。
//   1. exit   (~220ms): 旧コンテンツ フェードアウト (height は OLD のまま)
//   2. resize (~480ms): 旧コンテンツ unmount → 新コンテンツ mount (opacity:0)
//                       useAnimatedHeight が ResizeObserver で発火 → height 補間
//   3. enter  (~320ms): 新コンテンツ フェードイン
// 合計 ~1020ms。旧版 (420ms クロスフェード並走) のカクツキを解消。

type Phase = 'idle' | 'exit' | 'resize' | 'enter';

export default function SlotSwitcher({ keyId, children }: Props) {
  // 現在画面に出ているコンテンツ
  const [shown, setShown] = useState<{ id: string; content: ReactNode }>({ id: keyId, content: children });
  // exit フェーズで旧コンテンツを保持
  const [exiting, setExiting] = useState<{ id: string; content: ReactNode } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  const queuedRef = useRef<{ id: string; content: ReactNode } | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // 同じ keyId なら content だけ差し替え (props 更新によるサイレント再描画)
    if (keyId === shown.id) {
      setShown({ id: keyId, content: children });
      return;
    }

    // 切替シーケンス開始: 旧コンテンツを exit に、新コンテンツを queue に保存
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setExiting({ id: shown.id, content: shown.content });
    queuedRef.current = { id: keyId, content: children };
    setPhase('exit');

    // Phase 1 → Phase 2: exit が終わったら旧を捨てて新を mount (opacity:0)
    timersRef.current.push(
      setTimeout(() => {
        setExiting(null);
        if (queuedRef.current) setShown(queuedRef.current);
        setPhase('resize');
      }, SLOT_PHASE_EXIT_MS)
    );

    // Phase 2 → Phase 3: resize が終わったら enter フェーズで fade-in 開始
    timersRef.current.push(
      setTimeout(() => {
        setPhase('enter');
      }, SLOT_PHASE_EXIT_MS + SLOT_PHASE_RESIZE_MS)
    );

    // Phase 3 終了: idle に戻す (もう何も動かない安定状態)
    timersRef.current.push(
      setTimeout(() => {
        setPhase('idle');
      }, SLOT_PHASE_EXIT_MS + SLOT_PHASE_RESIZE_MS + SLOT_PHASE_ENTER_MS)
    );

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId, children]);

  // exit 中: 旧コンテンツのみ。それ以外: 新コンテンツのみ (phase で透明度を制御)。
  const showOld = phase === 'exit' && !!exiting;
  return (
    <div className="lt-slot">
      {showOld ? (
        <div className="lt-module slot-fade-out-seq" key={'e' + exiting!.id}>
          {exiting!.content}
        </div>
      ) : (
        <div
          className={
            'lt-module ' +
            (phase === 'resize' ? 'slot-hold-invisible '
              : phase === 'enter' ? 'slot-fade-in-seq '
              : '')
          }
          key={shown.id}
        >
          {shown.content}
        </div>
      )}
    </div>
  );
}
