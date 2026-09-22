/**
 * シートで直す2つの値 — 複数選択 と ONAiR リンク
 *
 * 表の中に選択肢を重ねて出すと、横スクロールする包みに切られて読めなくなるので、
 * この2つだけはシート（画面の外に出る）で直します。
 *
 * **ONAiR のデータを二重に持たない**（設計 §4-4）ので、案件・機材・部屋・ページは
 * リンクとして参照するだけです。相手を選ぶ一覧はまだ無いため、v1 は
 * **ONAiR の URL を貼り付けて**指します（ブラウザからそのまま写せる形）。
 * 相手を検索して選ぶ画面は、検索（段D）ができてから足します。
 */
import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import type { WikiOnairKind, WikiOnairLink } from '@gmo-onair/shared/src/wiki/types';
import { cn } from '@/lib/utils';
import type { DatabaseCellProps } from './DatabaseCell';
import {
  ONAIR_KIND_LABEL,
  asArrayValue,
  asOnairLink,
  onairHref,
  optionTone,
  parseOnairUrl,
} from './dbValues';

const CHIP = 'inline-flex h-[21px] max-w-full shrink-0 items-center truncate rounded-badge border px-2 text-badge';
const EDIT_BUTTON =
  'flex min-h-tap w-full items-center gap-1 rounded-control border border-border bg-card px-2 text-left'
  + ' text-sub text-foreground hover:bg-muted lg:h-8 lg:min-h-0';

/* ── 複数選択 ─────────────────────────────────────────────── */

export function MultiSelectCell({ item, value, canEdit, onCommit, busy }: DatabaseCellProps) {
  const selected = asArrayValue(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  // 開くたびに、いまの値から始める（前に開いたときの途中の選択を持ち越さない）
  useEffect(() => {
    if (open) setDraft(asArrayValue(value));
  }, [open, value]);

  const chips = (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {selected.map((v) => (
        <span key={v} className={cn(CHIP, optionTone(item, v))}>{v}</span>
      ))}
    </span>
  );

  if (!canEdit) return chips;

  return (
    <>
      <button type="button" className={EDIT_BUTTON} disabled={busy} onClick={() => setOpen(true)}>
        {selected.length > 0 ? chips : <span className="text-muted-foreground">選択</span>}
        <Pencil className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={item.name}
          sub="複数選べます。保存すると、この行の値が入れ替わります。"
          size="sm"
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button
                onClick={() => {
                  onCommit(draft.length > 0 ? draft : null);
                  setOpen(false);
                }}
              >
                保存
              </Button>
            </div>
          )}
        >
          <div className="flex flex-col">
            {(item.options ?? []).length === 0 && (
              <p className="text-sub text-muted-foreground">
                この項目にはまだ選択肢がありません。右の「項目」で選択肢を追加してください。
              </p>
            )}
            {(item.options ?? []).map((o) => (
              <label key={o.value} className="flex min-h-tap items-center gap-2.5 border-b border-border-faint last:border-b-0">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-control border-border accent-primary"
                  checked={draft.includes(o.value)}
                  onChange={(e) =>
                    setDraft((prev) => (e.target.checked ? [...prev, o.value] : prev.filter((x) => x !== o.value)))
                  }
                />
                <span className={cn(CHIP, optionTone(item, o.value))}>{o.value}</span>
              </label>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/* ── ONAiR リンク ─────────────────────────────────────────── */

const KINDS: WikiOnairKind[] = ['project', 'equipment', 'room', 'page'];

export function OnairLinkCell({ item, value, canEdit, onCommit, busy }: DatabaseCellProps) {
  const link = asOnairLink(value);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<WikiOnairKind>(link?.kind ?? 'project');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState(link?.label ?? '');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    const cur = asOnairLink(value);
    setKind(cur?.kind ?? 'project');
    setUrl(cur ? onairHref(cur) : '');
    setLabel(cur?.label ?? '');
    setMessage('');
  }, [open, value]);

  const view = link ? (
    <a
      href={onairHref(link)}
      className="block truncate text-sub text-primary underline"
      title={`${ONAIR_KIND_LABEL[link.kind]}：${link.label || link.id}`}
    >
      {link.label || link.id}
    </a>
  ) : null;

  if (!canEdit) return view ?? <span className="text-sub text-muted-foreground">—</span>;

  const save = () => {
    const parsed = parseOnairUrl(url);
    const id = parsed?.id ?? (/^[A-Za-z0-9_-]+$/.test(url.trim()) ? url.trim() : '');
    if (!id) {
      setMessage('ONAiR のページの URL を貼り付けてください。例: /sales/projects/xxxx');
      return;
    }
    const next: WikiOnairLink = { kind: parsed?.kind ?? kind, id };
    if (label.trim()) next.label = label.trim();
    onCommit(next);
    setOpen(false);
  };

  return (
    <>
      <button type="button" className={EDIT_BUTTON} disabled={busy} onClick={() => setOpen(true)}>
        <span className="min-w-0 flex-1 truncate">
          {link ? (link.label || link.id) : <span className="text-muted-foreground">リンクを設定</span>}
        </span>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={item.name}
          sub="ONAiR の案件・機材・部屋・Wiki ページへのリンクです。"
          size="sm"
          footer={(
            <div className="flex justify-end gap-2">
              {link && (
                <Button
                  variant="outline"
                  className="mr-auto"
                  onClick={() => { onCommit(null); setOpen(false); }}
                >
                  リンクを削除
                </Button>
              )}
              <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button onClick={save}>保存</Button>
            </div>
          )}
        >
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sub text-muted-foreground">
              種類
              <select
                className="min-h-tap rounded-control border border-border bg-card px-2 text-sub text-foreground lg:h-9 lg:min-h-0"
                value={kind}
                onChange={(e) => setKind(e.target.value as WikiOnairKind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>{ONAIR_KIND_LABEL[k]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sub text-muted-foreground">
              リンク先の URL
              <input
                className="min-h-tap rounded-control border border-border bg-card px-2 text-sub text-foreground lg:h-9 lg:min-h-0"
                value={url}
                placeholder="/sales/projects/xxxx"
                onChange={(e) => { setUrl(e.target.value); setMessage(''); }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sub text-muted-foreground">
              表示名（任意）
              <input
                className="min-h-tap rounded-control border border-border bg-card px-2 text-sub text-foreground lg:h-9 lg:min-h-0"
                value={label}
                placeholder="画面に出す名前"
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            {message && <p className="text-sub text-destructive">{message}</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}
