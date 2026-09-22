/**
 * ビューの追加・設定・削除（表／ボード／カレンダー・設計 §10 の判断3c）
 *
 * ⚠️ **ビューは3つの型だけ**です。ギャラリーやタイムラインは v1 で作りません（§11）。
 *
 * ⚠️ **ボードは選択の項目、カレンダーは日付の項目が要ります。**
 *    無いまま保存するとサーバーが止めます（開いても1件も出ないビューを作らせない）ので、
 *    ここで先に選ばせ、選べる項目が無いときは理由を出します。
 */
import { useEffect, useState } from 'react';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import type { WikiItem, WikiView, WikiViewType } from '@gmo-onair/shared/src/wiki/types';

const FIELD = 'min-h-tap w-full rounded-control border border-border bg-card px-2 text-sub text-foreground focus:border-primary focus:outline-none lg:h-9 lg:min-h-0';
const LABEL = 'flex flex-col gap-1 text-sub text-muted-foreground';

const TYPE_LABEL: Record<WikiViewType, string> = {
  table: '表',
  board: 'ボード',
  calendar: 'カレンダー',
};

const TYPE_HELP: Record<WikiViewType, string> = {
  table: '列を並べて、セルをその場で直せます。',
  board: '選択の項目でグループに分け、ドラッグで値を変えられます。',
  calendar: '日付の項目で月に並べます。',
};

export interface DatabaseViewSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 直すビュー。`null` なら追加 */
  view: WikiView | null;
  views: WikiView[];
  items: WikiItem[];
  saving: boolean;
  onSave: (views: WikiView[]) => void;
}

export default function DatabaseViewSheet({
  open, onOpenChange, view, views, items, saving, onSave,
}: DatabaseViewSheetProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<WikiViewType>('table');
  const [groupBy, setGroupBy] = useState('');
  const [dateItem, setDateItem] = useState('');
  const [message, setMessage] = useState('');

  const selectItems = items.filter((it) => it.type === 'select');
  const dateItems = items.filter((it) => it.type === 'date');

  useEffect(() => {
    if (!open) return;
    setName(view?.name ?? '');
    setType(view?.type ?? 'table');
    setGroupBy(view?.groupBy ?? selectItems[0]?.id ?? '');
    setDateItem(view?.dateItem ?? dateItems[0]?.id ?? '');
    setMessage('');
    // 選択肢の一覧は items から毎回作り直すので、依存に入れると開くたびに初期化が走る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage('ビューの名前を入れてください。');
      return;
    }
    if (type === 'board' && !groupBy) {
      setMessage('ボードはグループ分けに使う選択の項目が要ります。先に選択の項目を追加してください。');
      return;
    }
    if (type === 'calendar' && !dateItem) {
      setMessage('カレンダーは日付の項目が要ります。先に日付の項目を追加してください。');
      return;
    }

    const next: WikiView = {
      ...(view ?? {}),
      id: view?.id ?? '',
      name: trimmed,
      type,
    };
    // 型を変えたときに、前の型の設定を残さない（サーバーは無視するが、次に開く人が混乱する）
    delete next.groupBy;
    delete next.dateItem;
    if (type === 'board') next.groupBy = groupBy;
    if (type === 'calendar') next.dateItem = dateItem;

    const exists = views.some((v) => v.id === next.id && next.id !== '');
    onSave(exists ? views.map((v) => (v.id === next.id ? next : v)) : [...views, next]);
    onOpenChange(false);
  };

  const remove = async () => {
    if (!view) return;
    const ok = await confirmAction({
      title: `ビュー「${view.name}」を削除しますか？`,
      description: 'このビューの絞り込み・並べ替え・グループの設定がなくなります。行とその値は消えません。',
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (!ok) return;
    onSave(views.filter((v) => v.id !== view.id));
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={view ? 'ビューの設定' : 'ビューを追加'}
      sub="ここで決めた表示は、このページを開いた人全員に同じに見えます。"
      size="sm"
      footer={(
        <div className="flex justify-end gap-2">
          {view && views.some((v) => v.id === view.id) && (
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
            placeholder="例: 対応中のもの"
            onChange={(e) => { setName(e.target.value); setMessage(''); }}
          />
        </label>

        <label className={LABEL}>
          種類
          <select className={FIELD} value={type} onChange={(e) => setType(e.target.value as WikiViewType)}>
            {(Object.keys(TYPE_LABEL) as WikiViewType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          <span className="text-sub-sm">{TYPE_HELP[type]}</span>
        </label>

        {type === 'board' && (
          <label className={LABEL}>
            グループに使う項目（選択）
            <select className={FIELD} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="">選んでください</option>
              {selectItems.map((it) => (
                <option key={it.id} value={it.id}>{it.name}</option>
              ))}
            </select>
            {selectItems.length === 0 && (
              <span className="text-sub-sm text-warning">選択の項目がまだありません。右の「項目」で追加してください。</span>
            )}
          </label>
        )}

        {type === 'calendar' && (
          <label className={LABEL}>
            並べるのに使う項目（日付）
            <select className={FIELD} value={dateItem} onChange={(e) => setDateItem(e.target.value)}>
              <option value="">選んでください</option>
              {dateItems.map((it) => (
                <option key={it.id} value={it.id}>{it.name}</option>
              ))}
            </select>
            {dateItems.length === 0 && (
              <span className="text-sub-sm text-warning">日付の項目がまだありません。右の「項目」で追加してください。</span>
            )}
          </label>
        )}

        {message && <p className="text-sub text-destructive">{message}</p>}
      </div>
    </Sheet>
  );
}
