// 入力中の値をローカルに持ち、確定したときだけ外へ渡すフック。
//
// **これが無いと日本語が正しく入力できない。**
// この製品の入力欄は「打つ → ドキュメント全体を作り直す → collab (Y.Doc) を経由して
// props が返ってくる」形になっている。props が返るのは 1 レンダー後なので、変換中
// (IME の composition 中) に再レンダーが挟まると、React が DOM の値を**古い props の値へ
// 書き戻す**。結果、変換中の文字が消える・確定した文字が巻き戻る・ローマ字のまま残る。
//
// 対策は「変換が終わるまで外に出さない」こと:
//   - 入力中は `val` (ローカル state) を唯一の値にする
//   - 外へ渡すのは blur / IME 確定 / 500ms 何も打たなかったとき
//   - フォーカス中は外からの値を取り込まない (カーソルが飛ぶ)
//   - composition 中は commit しない (変換候補の途中を確定させない)
//
// 打鍵ごとに巨大なドキュメントを再レンダーしないので、入力のもたつきも同時に解消する。
//
// 使う側: `BufferedInput` (components/editor/BufferedInput.tsx) と
// `BufferedTextarea` (components/editor/CueRow.tsx)。
// **生の `<input value={…} onChange={…}>` で文字列を編集しないこと。**

import { useState, useRef, useCallback, useEffect } from "react";

const COMMIT_DELAY = 500;

export function useBufferedValue(value: string, onCommit: (v: string) => void) {
  const [val, setVal] = useState(value);
  const valRef = useRef(value);
  const committedRef = useRef(value);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  onCommitRef.current = onCommit;

  // フォーカスしていないときだけ外部からの値変更を取り込む (入力中のカーソル飛びを防ぐ)
  useEffect(() => {
    if (!focusedRef.current && value !== valRef.current) {
      committedRef.current = value;
      valRef.current = value;
      setVal(value);
    }
  }, [value]);

  const commit = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (composingRef.current) return;
    if (valRef.current !== committedRef.current) {
      committedRef.current = valRef.current;
      onCommitRef.current(valRef.current);
    }
  }, []);

  // アンマウント時 (行削除等) に未 commit を flush
  useEffect(() => () => { commit(); }, [commit]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, COMMIT_DELAY);
  }, [commit]);

  const onChange = useCallback((v: string) => {
    valRef.current = v;
    setVal(v);
    if (!composingRef.current) schedule();
  }, [schedule]);

  const onFocus = useCallback(() => { focusedRef.current = true; }, []);
  const onBlur = useCallback(() => { focusedRef.current = false; commit(); }, [commit]);
  const onCompositionStart = useCallback(() => { composingRef.current = true; }, []);
  const onCompositionEnd = useCallback((v: string) => {
    composingRef.current = false;
    valRef.current = v;
    setVal(v);
    schedule();
  }, [schedule]);

  return { val, onChange, onFocus, onBlur, onCompositionStart, onCompositionEnd };
}
