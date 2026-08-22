// IME (日本語入力) 検証ハーネス — scripts/verify-ime.mjs が組み立てて実ブラウザで叩く。
//
// **Qシートの入力欄と同じデータの流れ**を最小構成で再現する:
//   打つ → ドキュメント (Y.Doc 相当) を更新 → **effect を1回経由して** value として戻る
// 実物は onChange → updateData → applyDataUpdate(Y.Doc) → snapshot → useEffect → setDoc → props
// で、**value が返るのは 1 レンダー後**。ここが IME を壊す。
//
// 2つ並べて比べる:
//   #raw      … 生の controlled input (LED/XR シーンが v3.2.3 まで使っていた形)
//   #buffered … client-techops/src/lib/useBufferedValue.ts を通した形 (修正後)
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useBufferedValue } from '@techops/lib/useBufferedValue';

function BufferedInput({ value, onCommit, ...rest }: {
  value: string;
  onCommit: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const buf = useBufferedValue(value, onCommit);
  return (
    <input
      {...rest}
      value={buf.val}
      onChange={(e) => buf.onChange(e.target.value)}
      onFocus={buf.onFocus}
      onBlur={buf.onBlur}
      onCompositionStart={buf.onCompositionStart}
      onCompositionEnd={(e) => buf.onCompositionEnd((e.target as HTMLInputElement).value)}
    />
  );
}

/**
 * value が 1 レンダー遅れて返ってくるドキュメント state (collab 経路と同じ形)。
 *
 * `window.__remote(id, value)` で「他ユーザーがこの欄を書き換えた」を再現できる
 * (フォーカスを奪わずにドキュメント側だけを変えたいので、ボタンではなく関数で公開する)。
 */
function LaggedDoc({ id, render }: { id: string; render: (value: string, store: (v: string) => void) => React.ReactNode }) {
  const [stored, setStored] = useState('');
  const [shown, setShown] = useState('');
  useEffect(() => { setShown(stored); }, [stored]);
  useEffect(() => {
    const w = window as unknown as { __remote?: Record<string, (v: string) => void> };
    w.__remote = { ...(w.__remote || {}), [id]: setStored };
  }, [id]);
  return (
    <p>
      {render(shown, setStored)}
      <output id={`${id}-stored`}>{stored}</output>
    </p>
  );
}

createRoot(document.getElementById('root')!).render(
  <>
    <LaggedDoc id="raw" render={(v, store) => (
      <input id="raw" value={v} onChange={(e) => store(e.target.value)} />
    )} />
    <LaggedDoc id="buffered" render={(v, store) => (
      <BufferedInput id="buffered" value={v} onCommit={store} />
    )} />
  </>,
);
