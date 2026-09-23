/**
 * 右パネル「情報」のうち、その場で直せる3つ（§6-②）— 担当・見直し予定・タグ
 *
 * ⚠️ **本文の編集ロックとは別です。** 誰かが本文を書いている最中でも、
 * 読んでいる人が担当と見直し予定とタグを直せます（サーバーは本文・題を
 * 送ったときだけロックを見ます）。編集の画面を開かせないための作りです。
 *
 * ⚠️ **見直し予定は任意で、既定はありません**（§10 #10）。空のままで構いません。
 * **画面に「期限切れ」とは書きません** — 予定日を過ぎても中身が無効になるわけでは
 * ないためです。過ぎたページは「要見直し」と呼びます。
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Input } from '@gmo-onair/shared/src/client/ui/input';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import { reviewByLabel, reviewRemainLabel } from '@/lib/wikiFormat';
import {
  patchWikiPageInfo,
  pickableUsers,
  useOnairUsers,
  useWikiRefresh,
  type WikiPageInfoInput,
} from './pageOpsApi';

const CONTROL_CLASS =
  'min-h-tap w-full rounded-control border border-border bg-card px-2 text-sub text-foreground lg:h-8 lg:min-h-0';

/** 3つの欄で共通の保存。**渡した項目だけ**が書き換わります */
function useSaveInfo(page: WikiPage) {
  const refresh = useWikiRefresh();
  return useMutation({
    meta: { action: 'ページの情報を保存' },
    mutationFn: (v: { input: WikiPageInfoInput; what: string }) =>
      patchWikiPageInfo(page.id, v.input),
    onSuccess: (_data, v) => {
      refresh.page(page.id);
      refresh.home();
      notifySuccess(`${v.what}を保存しました`);
    },
  });
}

export interface PageInfoEditProps {
  page: WikiPage;
  /** 直せる人か（editor 以上）。持っていない人には読むだけの表示を出す */
  canEdit: boolean;
}

/* ── 担当 ─────────────────────────────────────────────────── */

export function OwnerField({ page, canEdit }: PageInfoEditProps) {
  const save = useSaveInfo(page);
  const usersQ = useOnairUsers(canEdit);

  if (!canEdit) return <>{page.owner_name ?? '—'}</>;

  return (
    <select
      className={CONTROL_CLASS}
      value={page.owner_user_id ?? ''}
      disabled={save.isPending || usersQ.isLoading}
      onChange={(e) =>
        save.mutate({ input: { owner_user_id: e.target.value || null }, what: '担当' })
      }
    >
      <option value="">担当なし</option>
      {/* いまの担当が一覧に無い（退職・読み込み前）ときも名前を出す */}
      {page.owner_user_id
        && !(usersQ.data ?? []).some((u) => u.id === page.owner_user_id) && (
        <option value={page.owner_user_id}>{page.owner_name ?? page.owner_user_id}</option>
      )}
      {pickableUsers(usersQ.data, [page.owner_user_id]).map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
}

/* ── 見直し予定 ───────────────────────────────────────────── */

export function ReviewByField({ page, canEdit }: PageInfoEditProps) {
  const save = useSaveInfo(page);

  if (!canEdit) {
    return page.review_by ? (
      <span className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 items-center rounded-control border border-border px-2 text-sub text-foreground">
          {reviewByLabel(page.review_by)}
        </span>
        <span className="text-sub-sm text-muted-foreground">{reviewRemainLabel(page.review_by)}</span>
      </span>
    ) : (
      <>—</>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          className={CONTROL_CLASS}
          value={page.review_by ?? ''}
          disabled={save.isPending}
          aria-label="見直し予定"
          onChange={(e) =>
            save.mutate({ input: { review_by: e.target.value || null }, what: '見直し予定' })
          }
        />
        {page.review_by && (
          <button
            type="button"
            aria-label="見直し予定を削除"
            disabled={save.isPending}
            onClick={() => save.mutate({ input: { review_by: null }, what: '見直し予定' })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      <span className="text-sub-sm text-muted-foreground">
        {page.review_by ? reviewRemainLabel(page.review_by) : '決めなくて構いません'}
      </span>
    </div>
  );
}

/* ── タグ ─────────────────────────────────────────────────── */

export function TagsField({ page, canEdit }: PageInfoEditProps) {
  const save = useSaveInfo(page);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  /**
   * ⚠️ **打ちかけの文字はサーバーの応答で消しません。** ページは他の操作でも
   * 読み直されるので、応答を合図に消すと入力中に消えることがあります。
   * 消すのは「入れた」「やめた」のときだけにします。
   */
  const add = () => {
    const value = draft.trim();
    if (value && !page.tags.includes(value)) {
      save.mutate({ input: { tags: [...page.tags, value] }, what: 'タグ' });
    }
    setDraft('');
    setAdding(false);
  };

  if (!canEdit) {
    return page.tags.length === 0 ? <>—</> : <TagChips tags={page.tags} />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {page.tags.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {page.tags.map((t) => (
            <span
              key={t}
              className="inline-flex h-6 items-center gap-1 rounded-control bg-muted pl-2 pr-1 text-sub-sm text-foreground"
            >
              {t}
              <button
                type="button"
                aria-label={`タグ「${t}」を削除`}
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({ input: { tags: page.tags.filter((x) => x !== t) }, what: 'タグ' })
                }
                className="flex h-5 w-5 items-center justify-center rounded-control text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </span>
      )}

      {adding ? (
        <Input
          autoFocus
          value={draft}
          maxLength={40}
          placeholder="タグを入力して Enter"
          disabled={save.isPending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            // ⚠️ 日本語の変換中の Enter は確定なので拾わない（`isComposing`）
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
            if (e.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          className="h-8"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={save.isPending}
          className="flex min-h-tap w-fit items-center gap-1 rounded-control px-1.5 text-sub text-primary hover:bg-primary-surface-weak lg:h-8 lg:min-h-0"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          タグを追加
        </button>
      )}
    </div>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex h-6 items-center rounded-control bg-muted px-2 text-sub-sm text-foreground"
        >
          {t}
        </span>
      ))}
    </span>
  );
}
