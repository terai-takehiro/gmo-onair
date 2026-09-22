/**
 * 写真をカーソルの位置に差し込む（設計 §5-5）
 *
 * ボタン・貼り付け（Ctrl+V）・ドラッグの3つから同じところを通ります。
 *
 * 1. 送る前に長辺 1600px まで縮める（`shared/src/client-v4/downscaleImage.ts`。
 *    スマホの写真はそのままだと 3〜5MB あり、上限にも通信にも厳しい）
 * 2. `POST /wiki/files` で上げる
 * 3. 返った URL で `![説明](…)` を本文に差し込む
 *
 * ⚠️ 1枚ずつ順に上げます。まとめて投げると、差し込む順番が返ってきた順になり、
 *    選んだ並びと変わってしまいます。
 */
import { useCallback, useRef, useState } from 'react';
import { notifyApiError, notifyWarning } from '@gmo-onair/shared/src/client/notify';
import { downscaleImage } from '@gmo-onair/shared/src/client-v4/downscaleImage';
import { insertImage, type Edit } from '@/components/editor/markdownEdits';
import { uploadWikiFile } from './wikiEditApi';

/** 拡張子を落として説明に使う（空なら「画像」） */
function altOf(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim();
  return base || '画像';
}

export function useWikiImageInsert(pageId: string | undefined, apply: (edit: Edit) => void) {
  const [busy, setBusy] = useState(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const insertFiles = useCallback(async (input: FileList | File[] | null | undefined) => {
    const files = Array.from(input ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0 || !pageId) return;
    setBusy(true);
    try {
      for (const file of files) {
        try {
          const small = await downscaleImage(file);
          const saved = await uploadWikiFile(small, pageId);
          applyRef.current(insertImage(altOf(file.name), saved.url));
        } catch (err) {
          notifyApiError(`「${file.name}」を上げられませんでした`, err, '大きすぎるか、対応していない形式かもしれません。');
        }
      }
    } finally {
      setBusy(false);
    }
  }, [pageId]);

  /** 貼り付け・ドラッグから来たとき。画像が1枚も無ければ何もしない（文字はそのまま貼る） */
  const insertFromTransfer = useCallback((data: DataTransfer | null): boolean => {
    const files = Array.from(data?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return false;
    if (!pageId) {
      notifyWarning('いまは写真を差し込めません', { description: 'ページを読み込み直してからお試しください。' });
      return false;
    }
    void insertFiles(files);
    return true;
  }, [insertFiles, pageId]);

  return { busy, insertFiles, insertFromTransfer };
}
