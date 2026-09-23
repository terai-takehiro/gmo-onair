/**
 * 本文を打つところ（素の `<textarea>`）
 *
 * ── なぜ素の `<textarea>` なのか（2026-09-22 の判断・設計 §6-③ から変更）──
 *
 * 設計書は Milkdown（見たまま編集）を第一候補に挙げていましたが、
 * **手入力の使いやすさを最優先**というご指示に対して、見たまま編集は
 * 打つ端から構造を決めさせる方へ働きます。ほかに3つ理由があります:
 *
 *  1. 本文の正は Markdown の文字列そのもの（設計の約束1）。見たまま編集は
 *     Markdown ↔ 内部の形の往復で本文が黙って変わる危険がある
 *  2. スマホの `contenteditable` は日本語入力と相性が悪い。`<textarea>` なら
 *     端末の入力がそのまま効く
 *  3. 注意書き・折りたたみ・ONAiR カードのぶんだけ独自の部品と書き出しが要る
 *
 * ── 日本語入力 ──────────────────────────────────────────────
 *
 * ここは `useBufferedValue` を使いません。本文は**手元の state が唯一の正**で、
 * 保存の応答で値を書き戻さないので、変換の途中に値が巻き戻ること自体が起きません
 * （題名のように外から値が返ってくる欄だけが `BufferedInput`）。
 *
 * ── ツールバーからの差し込み ────────────────────────────────
 *
 * 親は `apply(edit)` を呼ぶだけです。カーソルの位置は DOM が持っているので、
 * ここで読み、計算は `markdownEdits.ts`（純粋な関数）に任せ、
 * 書いたあとに選び直す位置だけをここで戻します。
 */
import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { isSlashTrigger, removeSlash, type Edit, type EditState } from './markdownEdits';
import { caretPoint, type CaretPoint } from './caretPoint';

export interface WikiEditorTextareaHandle {
  /** ツールバー・一覧からの差し込み。選び直す位置まで面倒を見る */
  apply: (edit: Edit) => void;
  /** 一覧を開いた引き金の `/` を消してから差し込む */
  applyAfterSlash: (edit: Edit, slashAt: number) => void;
  /**
   * いまの本文と選んでいる範囲を**その場で**読む（「AI で整える」が使う）。
   *
   * ⚠️ 画面が覚えている選択（`onSelectionChange`）は、本文から焦点が外れた時点で
   * 空になります。ツールバーのボタンを押すと必ず外れるので、**押した瞬間に
   * ここで読み直します**（差し込みの `apply` が DOM から読むのと同じ理由）。
   */
  read: () => EditState | null;
  focus: () => void;
}

export interface WikiSelectionInfo {
  /** 選んでいる文字（空なら選んでいない） */
  text: string;
  /** 選び始めの座標（`<textarea>` の左上から）。測れなければ null */
  point: CaretPoint | null;
}

interface Props {
  value: string;
  /**
   * 打つたびに呼ぶ。`composing` は**日本語の変換の途中**という印。
   * 変換の途中で保存すると、履歴に「ローマ字のまま」「読みだけ」の版が残るので、
   * 呼ぶ側はこのときだけ 1.5 秒の待ちを止める（値は受け取って画面に出す）。
   */
  onChange: (next: string, opts?: { composing?: boolean }) => void;
  readOnly: boolean;
  /** 行頭で `/` を打った。位置を添えて親に知らせる（親が一覧を開く） */
  onSlash: (slashAt: number) => void;
  /** 選んだ文字が変わった。浮かぶバーの置き場所に使う */
  onSelectionChange: (info: WikiSelectionInfo) => void;
  /** 写真を貼り付け・ドラッグした。受け取ったら true を返す（そのときだけ既定の動きを止める） */
  onFiles: (data: DataTransfer | null) => boolean;
  placeholder?: string;
}

const WikiEditorTextarea = forwardRef<WikiEditorTextareaHandle, Props>(function WikiEditorTextarea(
  { value, onChange, readOnly, onSlash, onSelectionChange, onFiles, placeholder },
  ref,
) {
  const elRef = useRef<HTMLTextAreaElement | null>(null);
  /** 差し込んだあとに選び直す位置。値が画面に出てから当てる */
  const pendingSel = useRef<[number, number] | null>(null);
  /** 日本語の変換の途中か（この間は保存の待ちを進めない） */
  const composingRef = useRef(false);

  const stateOf = (el: HTMLTextAreaElement): EditState => ({
    text: el.value,
    start: el.selectionStart,
    end: el.selectionEnd,
  });

  const runEdit = useCallback((edit: Edit, pre?: (s: EditState) => EditState) => {
    const el = elRef.current;
    if (!el || el.readOnly) return;
    const before = pre ? pre(stateOf(el)) : stateOf(el);
    const next = edit(before);
    pendingSel.current = [next.start, next.end];
    onChange(next.text);
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    apply: (edit) => runEdit(edit),
    applyAfterSlash: (edit, slashAt) => runEdit(edit, (s) => removeSlash(s, slashAt)),
    read: () => (elRef.current ? stateOf(elRef.current) : null),
    focus: () => elRef.current?.focus(),
  }), [runEdit]);

  // 差し込んだ直後にカーソルを戻す。**値が画面に出てから**でないと位置がずれる
  useLayoutEffect(() => {
    const el = elRef.current;
    const sel = pendingSel.current;
    if (!el || !sel) return;
    pendingSel.current = null;
    el.focus();
    el.setSelectionRange(sel[0], sel[1]);
    onSelectionChange({ text: el.value.slice(sel[0], sel[1]), point: caretPoint(el, sel[0]) });
  }, [value, onSelectionChange]);

  const reportSelection = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const picked = el.value.slice(el.selectionStart, el.selectionEnd);
    onSelectionChange({ text: picked, point: picked ? caretPoint(el, el.selectionStart) : null });
  }, [onSelectionChange]);

  return (
    <textarea
      ref={elRef}
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      placeholder={placeholder}
      aria-label="本文"
      onChange={(e) => {
        const el = e.currentTarget;
        const next = el.value;
        const caret = el.selectionStart;
        onChange(next, { composing: composingRef.current });
        if (composingRef.current) return;
        // 行頭の `/` だけを一覧の引き金にする（文の途中の `/` では開かない）
        if (next.length === value.length + 1 && isSlashTrigger(next, caret)) onSlash(caret - 1);
      }}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        // 変換が確定した値でもう一度知らせる（ここから 1.5 秒で保存する）
        onChange((e.target as HTMLTextAreaElement).value);
      }}
      onSelect={reportSelection}
      onKeyUp={reportSelection}
      onMouseUp={reportSelection}
      onBlur={() => onSelectionChange({ text: '', point: null })}
      onPaste={(e) => {
        if (onFiles(e.clipboardData)) e.preventDefault();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (onFiles(e.dataTransfer)) e.preventDefault();
      }}
      /*
        書体は本文と同じ 14px / 行間 1.85（`index.css` の `.wiki-doc`）。
        **等幅にしない** — 読むときと同じ見え方で打てるほうが、書いたあとの
        長さや改行の感じが掴めます（設計 §6-③「まず打てる」）。
      */
      className="h-full w-full resize-none bg-transparent px-4 py-4 text-[14px] leading-[1.85] text-foreground outline-none placeholder:text-muted-foreground lg:px-10 lg:py-6"
    />
  );
});

export default WikiEditorTextarea;
