/**
 * フィードバックチケット — 送るフォーム (v4)
 *
 * **全ユーザーが送れる**（送るのに編集権限は要らない。このアプリを開ける人なら誰でも）。
 * `FormDialog` はスマホ=下シート・PC=中央ダイアログで開く（`shared/CLAUDE.md`）。
 */
import { useState } from 'react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CATEGORY_LABELS, PAGES_BY_APP, TARGET_APPS, type Category, type CreateTicketInput,
} from '@/lib/feedbackTicketsApi';

const TEXTAREA = 'text-sub mt-1 w-full resize-y rounded-control border border-border bg-background px-3 py-2';
const SELECT = 'text-sub min-h-tap mt-1 w-full rounded-control border border-border bg-background px-3 lg:min-h-[40px]';

export function TicketForm({ onCancel, onSubmit, submitting }: {
  onCancel: () => void;
  onSubmit: (fields: CreateTicketInput) => void;
  submitting: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetApp, setTargetApp] = useState(TARGET_APPS[0].key);
  const [targetPage, setTargetPage] = useState(PAGES_BY_APP[TARGET_APPS[0].key][0].key);
  const [category, setCategory] = useState<Category>('bug');

  const pages = PAGES_BY_APP[targetApp] ?? [];

  // アプリを変えたら画面・機能の選択肢も変わる。**選んだままにしない**
  // （前のアプリの画面キーが新しいアプリの一覧に無いと、選ばれているのに
  // どれも光っていない `<select>` になる）。最初の1件（＝各アプリのいちばん上）に戻す
  const changeTargetApp = (app: string) => {
    setTargetApp(app);
    setTargetPage((PAGES_BY_APP[app] ?? [])[0]?.key ?? 'other');
  };

  const canSubmit = title.trim() && description.trim();

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title="要望・不具合を送る"
      sub="GMO ONAiR への要望・不具合を送ります"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onCancel}>キャンセル</Button>
          <Button
            disabled={!canSubmit || submitting}
            onClick={() => onSubmit({
              title: title.trim(),
              description: description.trim(),
              target_app: targetApp,
              target_page: targetPage,
              category,
            })}
          >
            送る
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="ticket-title">題名 *</Label>
          <Input
            id="ticket-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：機材台帳の検索がスマホで押しづらい"
          />
        </div>

        <div>
          <Label htmlFor="ticket-target-app">対象アプリ</Label>
          <select
            id="ticket-target-app"
            value={targetApp}
            onChange={(e) => changeTargetApp(e.target.value)}
            className={SELECT}
          >
            {TARGET_APPS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>

        <div>
          <Label htmlFor="ticket-target-page">対象の画面・機能</Label>
          <select
            id="ticket-target-page"
            value={targetPage}
            onChange={(e) => setTargetPage(e.target.value)}
            className={SELECT}
          >
            {pages.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>

        <div>
          <Label htmlFor="ticket-category">種別</Label>
          <select
            id="ticket-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className={SELECT}
          >
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((k) => (
              <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="ticket-description">内容 *</Label>
          <textarea
            id="ticket-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className={TEXTAREA}
            placeholder="何が困っているか / どうなってほしいかを具体的に書いてください"
          />
        </div>
      </div>
    </FormDialog>
  );
}
