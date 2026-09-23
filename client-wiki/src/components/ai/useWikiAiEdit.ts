/**
 * 編集画面に AI の2つ（整える・下書きを作成）を足すための配線（段E）
 *
 * 画面（`pages/editor/WikiEditorPage.tsx`）を短く保つために、
 * **どこを整えるかの見極めと、置き換え方**だけをここに集めています。
 *
 * ── 選んでいる範囲は DOM から読む ──────────────────────────
 *
 * 本文の `<textarea>` は、外れたときに「選んでいる文字」を空にします
 * （浮かぶバーを消すため）。ツールバーのボタンを押すと本文から焦点が外れるので、
 * 画面が覚えている選択は**押した時点で空**です。`<textarea>` 自身は
 * 選択範囲を保っているので、**押した瞬間に DOM から読み直します**
 * （太字・リンクのボタンが同じやり方で動いているのと同じ理由）。
 *
 * ── 置き換える範囲は開いた時点で決める ───────────────────────
 *
 * AI を待っている間に本文が動くと、返ってきた文を入れる場所がずれます。
 * 開いた時点の範囲を覚えておき、そこへ入れます（本文全体のときは `-1`）。
 */
import { useState, type RefObject } from 'react';
import { notifyInfo } from '@gmo-onair/shared/src/client/notify';
import type { WikiPageStatus } from '@gmo-onair/shared/src/wiki/types';
import type { WikiEditorTextareaHandle } from '@/components/editor/WikiEditorTextarea';
import { replaceAll, replaceRange, type Edit } from '@/components/editor/markdownEdits';
import type { WikiDraftResult } from './aiApi';
import type { AiTidySheetProps } from './AiTidySheet';
import type { AiDraftSheetProps } from './AiDraftSheet';

interface Args {
  pageId: string;
  status: WikiPageStatus;
  title: string;
  body: string;
  editorRef: RefObject<WikiEditorTextareaHandle | null>;
  /** 本文に差し込む（`WikiEditorTextarea` の `apply`） */
  apply: (edit: Edit) => void;
  /** AI が下書きを書き終えた。画面の本文と保存の突き合わせを置き直すのは呼ぶ側 */
  onDrafted: (result: WikiDraftResult) => void;
}

interface TidyTarget {
  source: string;
  scope: 'selection' | 'all';
  /** 置き換える範囲。本文全体のときは -1 */
  from: number;
  to: number;
}

export interface WikiAiEdit {
  openTidy: () => void;
  openDraft: () => void;
  /** AI で下書きを作れるか。**公開中のページは作れない**（現場が見ている手順を黙って変えない） */
  canDraft: boolean;
  tidySheet: AiTidySheetProps;
  draftSheet: AiDraftSheetProps;
}

export function useWikiAiEdit({
  pageId, status, title, body, editorRef, apply, onDrafted,
}: Args): WikiAiEdit {
  const [target, setTarget] = useState<TidyTarget | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);

  const openTidy = () => {
    const state = editorRef.current?.read();
    const text = state?.text ?? body;
    const picked = state && state.end > state.start ? { from: state.start, to: state.end } : null;
    const source = picked ? text.slice(picked.from, picked.to) : text;
    if (!source.trim()) {
      notifyInfo('整える文がありません', {
        description: '本文を打ってから「AI で整える」を押してください。',
      });
      return;
    }
    setTarget(picked
      ? { source, scope: 'selection', from: picked.from, to: picked.to }
      : { source, scope: 'all', from: -1, to: -1 });
  };

  const replaceTidied = (next: string) => {
    if (!target) return;
    apply(target.from < 0 ? replaceAll(next) : replaceRange(target.from, target.to, next));
    setTarget(null);
  };

  return {
    openTidy,
    openDraft: () => setDraftOpen(true),
    canDraft: status === 'draft',
    tidySheet: {
      open: target !== null,
      onOpenChange: (v) => { if (!v) setTarget(null); },
      pageId,
      source: target?.source ?? '',
      scope: target?.scope ?? 'all',
      onReplace: replaceTidied,
    },
    draftSheet: {
      open: draftOpen,
      onOpenChange: setDraftOpen,
      pageId,
      title,
      hasBody: body.trim().length > 0,
      onDrafted,
    },
  };
}
