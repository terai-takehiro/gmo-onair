/**
 * 行ページの項目の値を直す（設計 §4-4・§5-3-6・§6-⑩）
 *
 * ⚠️ **値の形が正しいかの判定は `shared/src/wiki/frontMatter.ts` の `isValidPropValue`**。
 *    サーバーが保存の前に必ず通すもの（`server/src/contexts/wiki/services/wiki-row-props.ts`）と
 *    **同じ関数を画面でも通します**（§5-3-6）。画面だけ別の判定を書くと、
 *    通ったように見えてサーバーに 400 で止められる欄ができます。
 *
 * ⚠️ **画面で見られるのは「形」までです。** ONAiR リンクの**相手が実在するか**と、
 *    項目が相手の種類を絞っているか（`onairKinds`）は DB を引かないと分からないので
 *    サーバーだけが見ます。そこで止まったときは共通の受け皿がサーバーの文言を出します
 *    （例:「「関連案件」に選んだ案件が見つかりません。選び直してください。」）。
 *
 * ⚠️ **保存できたことを帯で知らせません。** 文字の欄は打つのが止まった時点でも
 *    保存に行く（`useBufferedValue`）ので、知らせると入力中ずっと帯が点滅します。
 *    失敗したときだけ共通の受け皿（`meta.action`）が知らせます。
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isValidPropValue } from '@gmo-onair/shared/src/wiki/frontMatter';
import type { WikiItem, WikiPage, WikiPropValue } from '@gmo-onair/shared/src/wiki/types';
import { wikiKeys } from '@/lib/wikiApi';
import { rowsOfDatabaseKey, saveWikiRowProps, useRowDatabase } from '@/lib/wikiDatabaseApi';

export interface RowPropsEditor {
  /** 親がデータベースのときだけ入る */
  parentId: string | null;
  parentTitle: string;
  items: WikiItem[];
  loading: boolean;
  /** 保存中の項目（その欄だけ止める） */
  savingItemId: string | null;
  /** 保存に行かなかった理由（項目 id → 画面に出す文） */
  messages: Record<string, string>;
  commit: (item: WikiItem, value: WikiPropValue) => void;
}

/** 値が空か。`0` と `false` は入っている値として扱う（未入力と区別する） */
function isEmpty(value: WikiPropValue): boolean {
  if (value === null || value === '') return true;
  return Array.isArray(value) && value.length === 0;
}

/**
 * 保存に行かなかった理由。**次にやることを先に書く**（docs/wording.md ルール2）。
 *
 * サーバーは項目名を入れて言いますが（「「状態」を入れてください。」）、ここは
 * **その欄のすぐ下に出る**ので項目名を繰り返しません。
 */
function messageFor(item: WikiItem, value: WikiPropValue): string {
  if (item.required && isEmpty(value)) return '値を入れてください。必ず入れる項目です。';
  return '入力を確かめてください。この形では保存できません。';
}

export function useRowProps(page: WikiPage): RowPropsEditor {
  const { parentId, parentTitle, items, loading } = useRowDatabase(page);
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Record<string, string>>({});

  /**
   * 直前に**保存できた**値。
   *
   * ⚠️ `props` は毎回**丸ごと**送るので、送る元が古いと前に入れた値が戻ります。
   * 保存すると読み直しに行きますが、**届くまでの間 `page.props` は古いまま**で、
   * その間に別の欄を直すと「1つ前に入れた値」が消えます（欄を続けて埋めると必ず起きる）。
   * 保存の応答が返す新しいページ（`updated_at` つき）を覚えておき、
   * 読み直しが届くまではそちらを元にします。
   */
  const savedRef = useRef<{ at: string; props: Record<string, WikiPropValue> } | null>(null);

  /** いまの値。読み直しが届いていればサーバーのもの、まだなら直前に保存できたもの */
  const latestProps = (): Record<string, WikiPropValue> => {
    const saved = savedRef.current;
    // どちらも同じ形の ISO の文字なので、そのまま新しいほうを採れる
    if (saved && saved.at > page.updated_at) return { ...saved.props };
    return { ...(page.props ?? {}) };
  };

  const save = useMutation({
    meta: { action: '項目の値を保存' },
    mutationFn: (v: { itemId: string; props: Record<string, WikiPropValue> }) =>
      saveWikiRowProps(page.id, v.props),
    onSuccess: (saved) => {
      savedRef.current = { at: saved.updated_at, props: saved.props ?? {} };
      // この行ページ（情報の欄が読んでいるもの）と、親の表・ボード・カレンダー
      void queryClient.invalidateQueries({ queryKey: wikiKeys.page(page.id) });
      if (parentId) void queryClient.invalidateQueries({ queryKey: rowsOfDatabaseKey(parentId) });
    },
  });

  const clearMessage = (itemId: string) => {
    setMessages((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const commit = (item: WikiItem, value: WikiPropValue) => {
    if (!isValidPropValue(item, value)) {
      setMessages((prev) => ({ ...prev, [item.id]: messageFor(item, value) }));
      return;
    }
    clearMessage(item.id);

    /*
     * **いまの値ごと送ります**（サーバーは送られた `props` で置き換える）。
     * 空にするときはキーごと落とす — 中身の無いキーを残すと、書き出した `.md` の
     * YAML の見出しに空の行が並びます。
     */
    const props = latestProps();
    if (isEmpty(value)) delete props[item.id];
    else props[item.id] = value;
    save.mutate({ itemId: item.id, props });
  };

  return {
    parentId,
    parentTitle,
    items,
    loading,
    savingItemId: save.isPending ? (save.variables?.itemId ?? null) : null,
    messages,
    commit,
  };
}
