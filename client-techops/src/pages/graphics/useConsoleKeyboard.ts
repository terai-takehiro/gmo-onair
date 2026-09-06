// テロップCG — 送出コンソールのキーボード運転（Space=TAKE ／ Backspace=CLEAR
// （数字が溜まっていれば1桁消す・溜まっていなければ CLEAR）／ ↑↓=NEXT移動 ／
// テンキー=番号呼出 ／ Enter=溜めた番号を確定して NEXT に）。`GraphicsConsolePage.tsx`
// から切り出した（400行の目安を超えないため。ロジック自体はこのファイルだけで完結する）。
//
// 「次へ」という独立した動詞は無くなった（TAKE 自体が出す順の次の行へ自動前進するため、
// この前進ロジックは呼び出し側 `take` の中に合体している）。Escape は何もしない
// （誤爆防止。以前は番号バッファを消していたが、それもやめた——docs/design/v4/graphics-redesign.md §8）。
//
// リスナーは1回だけ張り、最新の操作は ref 経由で引く（`actions` は呼び出し側の
// 毎レンダーで新しいオブジェクトを渡してよい — このフックが ref に詰め替える）。
import { useEffect, useRef } from 'react';

export interface ConsoleActions {
  pushDigit: (d: string) => void;
  popDigit: () => void;
  clearDigits: () => void;
  hasDigits: boolean;
  commitCall: () => void;
  take: () => void;
  /** CLEAR＝最後に TAKE したものを消す（Backspace・数字バッファが空のときだけ発火） */
  clear: () => void;
  move: (dir: 1 | -1) => void;
}

/**
 * キーボード運転を止める場面か（入力欄・ダイアログにフォーカスがあるとき）。
 * 確認ダイアログ（confirmAction）は body 直下の `[data-confirm-host]` に出るので
 * 存在そのものを見る — 開いている間の Space / Enter は確認側の操作。
 */
function shouldIgnoreKeys(target: EventTarget | null): boolean {
  if (document.querySelector('[data-confirm-host]')) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[role="dialog"], [role="alertdialog"]')) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useConsoleKeyboard(actions: ConsoleActions): void {
  const actionsRef = useRef<ConsoleActions | null>(null);
  useEffect(() => {
    actionsRef.current = actions;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const a = actionsRef.current;
      if (!a || e.metaKey || e.ctrlKey || e.altKey || shouldIgnoreKeys(e.target)) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); a.pushDigit(e.key); return; }
      switch (e.key) {
        // 数字が溜まっていれば1桁消す（今まで通り）。溜まっていなければ CLEAR
        // （新設のショートカット・「最後に TAKE したものを消す」）
        case 'Backspace':
          e.preventDefault();
          if (a.hasDigits) a.popDigit(); else a.clear();
          return;
        // 溜まっていなければ何もしない（旧「次へ」は撤去したため呼ぶ先が無い）
        case 'Enter': e.preventDefault(); if (a.hasDigits) a.commitCall(); return;
        case ' ': e.preventDefault(); a.take(); return;
        case 'ArrowDown': e.preventDefault(); a.move(1); return;
        case 'ArrowUp': e.preventDefault(); a.move(-1); return;
        case 'Escape': return; // 誤爆防止のため意図的に no-op（番号バッファも消さない）
        default:
      }
    };
    // Space はボタンの activation が keyup で走る（直前に押した行・ボタン等に
    // フォーカスが残っていると TAKE と二重発火する）ので keyup 側も止める
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && !shouldIgnoreKeys(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
