/**
 * 入力中の値を手元に持ち、確定したときだけ外へ渡すフック（日本語入力対策）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 題名のような1行の入力欄は、打つたびに親の state が変わり、親が描き直し、
 * `value` が props として返ってきます。変換の途中（IME の composition 中）に
 * 描き直しが挟まると、React が DOM の値を**1つ前の props の値へ書き戻す**ため、
 * 変換中の文字が消える・確定した文字が巻き戻る・ローマ字のまま残る、が起きます。
 * 制作技術支援で実際に起きた不具合で、`client-techops/src/lib/useBufferedValue.ts`
 * が同じ作りの正です（`npm run verify:ime` が見ています）。
 *
 * ── なぜ共通ライブラリに上げないか ──────────────────────────
 *
 * `shared/src/client/` に置くと凍結4アプリの Tailwind まで走査対象が増えます
 * （`shared/CLAUDE.md`）。制作技術支援と同じ方針で、アプリごとに同じ作りのものを持ちます。
 *
 * ── 守ること ────────────────────────────────────────────────
 *
 * 1. 入力中は手元の state だけを唯一の値にする
 * 2. 外へ渡すのは 変換の確定 / 入力が止まって 500ms / フォーカスを外したとき
 * 3. フォーカス中は外から来た値を取り込まない（カーソルが飛ぶ）。ただし**取りこぼさない** —
 *    フォーカス中に届いた値は覚えておき、自分が何も打っていなければフォーカスを外すときに取り込む
 *
 * 本文（`<textarea>`）はこのフックを使いません。本文は**手元の state が唯一の正**で、
 * 保存の応答で値を書き戻さない作りにしてあるため、外から値が返ってくること自体が起きません。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** 打つのが止まってから外へ渡すまで */
const COMMIT_DELAY = 500;

export function useBufferedValue(value: string, onCommit: (v: string) => void) {
  const [val, setVal] = useState(value);
  const valRef = useRef(value);
  const committedRef = useRef(value);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const externalRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  onCommitRef.current = onCommit;

  // フォーカスしていないときだけ外から来た値を取り込む（入力中のカーソル飛びを防ぐ）
  useEffect(() => {
    externalRef.current = value;
    if (!focusedRef.current && value !== valRef.current) {
      committedRef.current = value;
      valRef.current = value;
      setVal(value);
    }
  }, [value]);

  /** まだ渡していない変更を外へ渡す。渡したら true */
  const commit = useCallback((): boolean => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // 変換の途中では確定させない（変換候補の途中を本文にしない）
    if (composingRef.current) return false;
    if (valRef.current !== committedRef.current) {
      committedRef.current = valRef.current;
      onCommitRef.current(valRef.current);
      return true;
    }
    return false;
  }, []);

  // 画面から外れるとき、まだ渡していない変更を渡す
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

  const onBlur = useCallback(() => {
    focusedRef.current = false;
    // ①自分の未送信の変更があれば送る（自分の変更が勝つ）
    if (commit()) return;
    // ②自分が何も打っていないなら、フォーカス中に届いていた値を取り込む。
    //   取り込まないと画面は古い値を出し続け、次の編集で相手の変更を上書きしてしまう
    if (externalRef.current !== valRef.current) {
      committedRef.current = externalRef.current;
      valRef.current = externalRef.current;
      setVal(externalRef.current);
    }
  }, [commit]);

  const onCompositionStart = useCallback(() => { composingRef.current = true; }, []);

  const onCompositionEnd = useCallback((v: string) => {
    composingRef.current = false;
    valRef.current = v;
    setVal(v);
    schedule();
  }, [schedule]);

  return { val, onChange, onFocus, onBlur, onCompositionStart, onCompositionEnd };
}
