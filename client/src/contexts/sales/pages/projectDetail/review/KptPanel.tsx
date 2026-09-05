/**
 * ふりかえりの KPT（Keep / Problem / Try）— v4 ⑥ 案件記録
 *
 * ── 3枠に分ける ────────────────────────────────────────────
 *
 * 旧「よかったこと・次に活かすこと」は1本の自由行で、
 * 続けたいこと・困ったこと・次に試すことが混ざっていました。
 * 枠を分けると、**書くときに種類を決める**ことになり、
 * 次の案件で「困ったこと」だけを追えます。
 *
 * ── 追加ボタンに自分の名前を出す ────────────────────────────
 *
 * 「寺井 として足す」。**誰として書くのかを押す前に見せます** —
 * ふりかえりは「その人がその現場で見たこと」なので、
 * 名前が残ることを知らずに書かれると、あとで書き直しになります。
 *
 * ── AI の下書きは「未確認」で置く ────────────────────────────
 *
 * `ai_generated` で紫の枠を付け、`confirmed_at` が入るまで「未確認」と出します。
 * **人が確かめずに隔週キープの資料へ出ると、AI の推測が実施報告になります。**
 * 確かめる／直す／消す のどれをしても、その結果が AI に返ります
 * （会社方針「AI を使い捨てにしない」の条件2）。
 */
import { useState } from 'react';
import { Plus, Trash2, Check, Sparkles, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@gmo-onair/shared/src/client/utils';

export interface KptItem {
  id: string;
  kind: 'keep' | 'problem' | 'try';
  body: string;
  author_id: string;
  author_name: string | null;
  ai_generated: boolean;
  confirmed_at: string | null;
  sort_order: number;
  created_at: string;
}

/**
 * 枠の見た目。**色は意味と対**（指示書 2-3）:
 * Keep = 緑（success）／ Problem = 赤（destructive）／ Try = 青（primary）。
 */
const PANES = [
  { kind: 'keep' as const, key: 'K', label: 'Keep 続けること', badge: 'bg-success', text: 'text-success', border: 'border-success-border', surface: 'bg-success-surface' },
  { kind: 'problem' as const, key: 'P', label: 'Problem 困ったこと', badge: 'bg-destructive', text: 'text-destructive', border: 'border-destructive-border', surface: 'bg-destructive-surface' },
  { kind: 'try' as const, key: 'T', label: 'Try 次に試すこと', badge: 'bg-primary', text: 'text-primary', border: 'border-primary-border', surface: 'bg-primary-surface-weak' },
];

/** `2026-09-14T...` → `09/14`。時刻は要らない（同じ日に何件書いたかは意味を持たない） */
function shortDate(iso: string | null): string {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}` : '';
}

export function KptPanel({
  items, myName, canEdit, busy, aiAvailable,
  onAdd, onUpdate, onConfirm, onDelete, onDraft,
}: {
  items: KptItem[];
  /** 追加ボタンに出す自分の名前。**押す前に誰として書くのかを見せる** */
  myName: string;
  canEdit: boolean;
  busy: boolean;
  aiAvailable: boolean;
  onAdd: (kind: KptItem['kind'], body: string) => void;
  onUpdate: (id: string, body: string) => void;
  onConfirm: (id: string) => void;
  onDelete: (id: string) => void;
  onDraft: () => void;
}) {
  const unconfirmed = items.filter((i) => i.ai_generated && !i.confirmed_at).length;

  return (
    <div>
      <p className="text-sub mb-1.5 flex flex-wrap items-center gap-2 font-bold">
        KPT
        <span className="text-note font-normal text-muted-foreground">続けること・困ったこと・次に試すこと</span>
        <span className="flex-1" />
        {unconfirmed > 0 && (
          <span className="text-badge inline-flex items-center gap-1 rounded-badge bg-ai-surface px-2 py-1 font-bold text-ai">
            <Sparkles className="h-3 w-3" aria-hidden="true" />未確認 {unconfirmed}
          </span>
        )}
      </p>

      <div className="grid gap-2.5 lg:grid-cols-3">
        {PANES.map((p) => (
          <Pane
            key={p.kind}
            pane={p}
            items={items.filter((i) => i.kind === p.kind)}
            myName={myName}
            canEdit={canEdit}
            busy={busy}
            onAdd={(body) => onAdd(p.kind, body)}
            onUpdate={onUpdate}
            onConfirm={onConfirm}
            onDelete={onDelete}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-note flex min-w-0 flex-1 items-start gap-1.5 text-muted-foreground">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" aria-hidden="true" />
          やり取り・議事録・タスクの遅れから、AI が K / P / T の下書きを起こします。
          人が直したところは記録に残り、次の下書きに効きます。
        </p>
        {canEdit && aiAvailable && (
          <Button variant="outline" size="sm" disabled={busy} onClick={onDraft}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-ai" aria-hidden="true" />下書きを起こす
          </Button>
        )}
      </div>
    </div>
  );
}

function Pane({
  pane, items, myName, canEdit, busy, onAdd, onUpdate, onConfirm, onDelete,
}: {
  pane: typeof PANES[number];
  items: KptItem[];
  myName: string;
  canEdit: boolean;
  busy: boolean;
  onAdd: (body: string) => void;
  onUpdate: (id: string, body: string) => void;
  onConfirm: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const commit = () => {
    const t = draft.trim();
    if (!t) { setAdding(false); return; }
    onAdd(t);
    setDraft('');
    // **開いたままにする。** ふりかえりは続けて何件も書くので、
    // 1件ごとに閉じると「足す」を押し直すことになる
  };

  return (
    <section className={cn('rounded-card overflow-hidden border', pane.border, pane.surface)}>
      <p className={cn('flex items-center gap-2 border-b px-3 py-2', pane.border)}>
        <span className={cn('text-badge inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-control-sm font-bold text-primary-foreground', pane.badge)}>
          {pane.key}
        </span>
        <span className={cn('text-sub min-w-0 flex-1 font-bold', pane.text)}>{pane.label}</span>
        <span className="text-note font-number text-muted-foreground">{items.length}</span>
      </p>

      <div className="bg-card px-3 pb-2.5 pt-1">
        {items.length === 0 && !adding && (
          <p className="text-note py-2 text-muted-foreground">まだ書かれていません。</p>
        )}

        {items.map((i) => (
          <div key={i.id} className="border-b border-border-faint py-2 last:border-b-0">
            {editId === i.id ? (
              <div className="flex flex-col gap-1.5">
                <Input
                  value={editText}
                  autoFocus
                  aria-label="内容を編集"
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { onUpdate(i.id, editText); setEditId(null); }
                    if (e.key === 'Escape') setEditId(null);
                  }}
                />
                <div className="flex gap-1.5">
                  <Button size="sm" disabled={busy || !editText.trim()}
                    onClick={() => { onUpdate(i.id, editText); setEditId(null); }}>編集</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>キャンセル</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-chip', pane.badge)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sub">{i.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {/* 書いた人のピル。**頭文字のアバターは出さない**（同姓が同じ丸になる） */}
                    <span className="text-note rounded-chip border border-border bg-surface-subtle px-2 py-0.5 font-bold text-secondary-foreground">
                      {i.author_name ?? '（名前なし）'}
                    </span>
                    <span className="text-note font-number text-muted-foreground">{shortDate(i.created_at)}</span>
                    {i.ai_generated && !i.confirmed_at && (
                      <span className="text-badge inline-flex items-center gap-1 rounded-badge bg-ai-surface px-1.5 py-0.5 font-bold text-ai">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />未確認
                      </span>
                    )}
                    <span className="flex-1" />
                    {canEdit && (
                      <>
                        {i.ai_generated && !i.confirmed_at && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onConfirm(i.id)}
                            aria-label="このまま確かめる"
                            title="このまま確かめる"
                            className="min-h-tap min-w-tap flex h-7 w-7 items-center justify-center rounded-control-sm hover:bg-muted lg:min-h-0 lg:min-w-0"
                          >
                            <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setEditId(i.id); setEditText(i.body); }}
                          aria-label="編集"
                          title="編集"
                          className="min-h-tap min-w-tap flex h-7 w-7 items-center justify-center rounded-control-sm hover:bg-muted lg:min-h-0 lg:min-w-0"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onDelete(i.id)}
                          aria-label="削除"
                          title="削除"
                          className="min-h-tap min-w-tap flex h-7 w-7 items-center justify-center rounded-control-sm hover:bg-muted lg:min-h-0 lg:min-w-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {canEdit && (adding ? (
          <div className="flex flex-col gap-1.5 pt-2">
            <Input
              value={draft}
              autoFocus
              aria-label={`${pane.label} に追加`}
              placeholder="例）事前の香盤共有で当日の確認が減った"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { setAdding(false); setDraft(''); }
              }}
            />
            <div className="flex gap-1.5">
              <Button size="sm" disabled={busy || !draft.trim()} onClick={commit}>
                {myName} として追加
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(''); }}>キャンセル</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{myName} として追加
          </Button>
        ))}
      </div>
    </section>
  );
}
