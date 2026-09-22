/**
 * 項目（列）の追加と編集 — 設計 §4-4
 *
 * ⚠️ **項目の id は画面から変えません。** id は各行の値のキーそのもので、
 *    変えると全ての行の値がその列から外れます（名前を直しただけのつもりで
 *    値が全部消えたように見える）。新しい項目は id を空で送り、サーバーが発番します。
 *
 * ⚠️ **ビューが使っている項目は削除できません。** グループ分け（ボード）や
 *    日付（カレンダー）に使われている項目を消すと、そのビューが開けなくなるためです。
 *    先にビューの設定を変えてもらいます。
 */
import { useEffect, useState } from 'react';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import type { WikiItem, WikiItemType, WikiView } from '@gmo-onair/shared/src/wiki/types';
import { ITEM_TYPES, ITEM_TYPE_LABEL } from './dbValues';

const FIELD = 'min-h-tap w-full rounded-control border border-border bg-card px-2 text-sub text-foreground focus:border-primary focus:outline-none lg:h-9 lg:min-h-0';
const LABEL = 'flex flex-col gap-1 text-sub text-muted-foreground';

export interface DatabaseItemSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 直す項目。`null` なら追加 */
  item: WikiItem | null;
  items: WikiItem[];
  views: WikiView[];
  saving: boolean;
  onSave: (items: WikiItem[], views: WikiView[]) => void;
}

/** 選択肢は1行1件で書いてもらう（記号を覚えさせない） */
function optionsToText(item: WikiItem | null): string {
  return (item?.options ?? []).map((o) => o.value).join('\n');
}

export default function DatabaseItemSheet({
  open, onOpenChange, item, items, views, saving, onSave,
}: DatabaseItemSheetProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<WikiItemType>('text');
  const [optionText, setOptionText] = useState('');
  const [required, setRequired] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setType(item?.type ?? 'text');
    setOptionText(optionsToText(item));
    setRequired(item?.required === true);
    setMessage('');
  }, [open, item]);

  const usedByView = views.find((v) => v.groupBy === item?.id || v.dateItem === item?.id);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage('項目の名前を入れてください。');
      return;
    }
    if (items.some((it) => it.name === trimmed && it.id !== item?.id)) {
      setMessage('同じ名前の項目があります。名前を分けてください。');
      return;
    }

    const next: WikiItem = { id: item?.id ?? '', name: trimmed, type };
    if (type === 'select' || type === 'multi_select') {
      const values = [...new Set(optionText.split('\n').map((v) => v.trim()).filter(Boolean))];
      if (values.length > 0) {
        // 色は選択肢の並び順から決める（保存しない）ので、値だけを送る
        next.options = values.map((value) => ({ value }));
      }
    }
    if (required) next.required = true;

    onSave(item ? items.map((it) => (it.id === item.id ? next : it)) : [...items, next], views);
    onOpenChange(false);
  };

  const remove = async () => {
    if (!item) return;
    if (usedByView) {
      setMessage(`この項目は「${usedByView.name}」で使っています。先にビューの設定を変えてください。`);
      return;
    }
    const ok = await confirmAction({
      title: `項目「${item.name}」を削除しますか？`,
      description: '表から列が消えます。各行に入っている値はそのまま残ります（もう一度同じ項目を作っても、前の値は戻りません）。',
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (!ok) return;

    // ビューが指している所も一緒に外す（残すとサーバーが保存を止める）
    const cleaned = views.map((v) => ({
      ...v,
      columns: v.columns?.filter((c) => c !== item.id),
      sorts: v.sorts?.filter((s) => s.itemId !== item.id),
      filters: v.filters?.filter((f) => f.itemId !== item.id),
    }));
    onSave(items.filter((it) => it.id !== item.id), cleaned);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? '項目を編集' : '項目を追加'}
      sub="表の列と、行ページの「情報」欄に出ます。"
      size="sm"
      footer={(
        <div className="flex justify-end gap-2">
          {item && (
            <Button variant="outline" className="mr-auto" disabled={saving} onClick={() => void remove()}>
              削除
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button disabled={saving} onClick={submit}>保存</Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3">
        <label className={LABEL}>
          名前
          <input
            className={FIELD}
            value={name}
            placeholder="例: 状態"
            onChange={(e) => { setName(e.target.value); setMessage(''); }}
          />
        </label>

        <label className={LABEL}>
          型
          <select className={FIELD} value={type} onChange={(e) => setType(e.target.value as WikiItemType)}>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{ITEM_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </label>

        {(type === 'select' || type === 'multi_select') && (
          <label className={LABEL}>
            選択肢（1行に1つ）
            <textarea
              className="min-h-[120px] w-full rounded-control border border-border bg-card px-2 py-1.5 text-sub text-foreground focus:border-primary focus:outline-none"
              value={optionText}
              placeholder={'未着手\n対応中\n完了'}
              onChange={(e) => setOptionText(e.target.value)}
            />
          </label>
        )}

        <label className="flex min-h-tap items-center gap-2 text-sub text-foreground lg:min-h-0">
          <input
            type="checkbox"
            className="h-4 w-4 rounded-control border-border accent-primary"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          必ず入れる項目にする
        </label>

        {item && type !== item.type && (
          <p className="text-sub text-warning">
            型を変えると、いまの値が合わなくなった行では値が表示されません（値は残ります）。
          </p>
        )}
        {message && <p className="text-sub text-destructive">{message}</p>}
      </div>
    </Sheet>
  );
}
