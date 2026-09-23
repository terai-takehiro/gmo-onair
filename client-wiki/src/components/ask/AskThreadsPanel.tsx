/**
 * **共通の左メニューの上に差し込む「聞いたことの一覧」**（設計 §6-⑤ の左の欄）
 *
 * ⚠️ **画面の中に2本目のナビの列を作りません。** モック `Ask.dc.html` は左に
 * 264px のスレッドの列を持っていますが、実際の画面には共通の左メニューが常にあり、
 * そのまま置くと利用者からご指摘のあった「サイドタブが増えすぎて窮屈」に戻ります
 * （2026-09-22・`client-wiki/CLAUDE.md`）。ページ②のツリーと同じく
 * `sideMenuSlot.ts` へ差し込み、スマホでは上辺バーの `☰` から開きます。
 *
 * ⚠️ **一覧に出るのは自分のものだけです**（§6-⑤・§8）。質問には「まだ誰にも
 * 言っていないこと」が普通に混ざるので、他の人には存在ごと見えません。
 */
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import type { WikiAiThread } from '@gmo-onair/shared/src/wiki/types';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import WikiMoreMenu from '@/components/page/WikiMoreMenu';
import { deleteAskThread } from '@/components/search/askApi';
import { updatedLabel } from '@/lib/wikiFormat';
import { cn } from '@/lib/utils';

/** サーバーの `WIKI_THREAD_MAX_TURNS` と同じ数（モックの「40往復」は古い） */
const MAX_TURNS = 30;

export interface AskThreadsPanelProps {
  threads: WikiAiThread[] | undefined;
  loading: boolean;
  currentId: string | null;
  /** 消したあとに画面が持っている状態を直す */
  onDeleted: (id: string) => void;
}

export default function AskThreadsPanel({
  threads,
  loading,
  currentId,
  onDeleted,
}: AskThreadsPanelProps) {
  const remove = useMutation({
    meta: { action: '会話の削除' },
    mutationFn: (id: string) => deleteAskThread(id),
    onSuccess: (_r, id) => onDeleted(id),
  });

  const ask = async (t: WikiAiThread) => {
    const ok = await confirmAction({
      title: 'この会話を消しますか',
      description: `「${t.title || '無題の質問'}」の質問と回答が一覧から消えます。元に戻せません。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) remove.mutate(t.id);
  };

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate px-2 text-list text-foreground">
          聞いたこと
          <span className="ml-1.5 text-sub-sm text-muted-foreground">自分だけに見えます</span>
        </span>
        <Link
          to="/ask"
          aria-label="新しく聞く"
          className="flex min-h-tap min-w-tap items-center justify-center rounded-control text-secondary-foreground hover:bg-primary-surface-weak lg:h-8 lg:min-h-0 lg:w-8 lg:min-w-0"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="max-h-[38vh] min-w-0 overflow-y-auto">
        {loading && !threads ? (
          <Delayed>
            <SkeletonRows rows={3} rowHeight={36} />
          </Delayed>
        ) : (threads ?? []).length === 0 ? (
          <p className="px-2 py-1.5 text-sub-sm leading-relaxed text-muted-foreground">
            まだ質問していません。下の欄に聞きたいことを打つと、ここに残ります。
          </p>
        ) : (
          (threads ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-1">
              <Link
                to={`/ask?thread=${t.id}`}
                className={cn(
                  'flex min-h-tap min-w-0 flex-1 flex-col justify-center rounded-control px-2 py-1 no-underline hover:bg-primary-surface-weak lg:min-h-0 lg:py-1.5',
                  currentId === t.id && 'bg-primary-surface',
                )}
              >
                <span
                  className={cn(
                    'w-full truncate text-sub',
                    currentId === t.id ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {t.title || '無題の質問'}
                </span>
                <span className="w-full truncate font-number text-sub-sm text-muted-foreground">
                  {updatedLabel(t.updated_at)}
                  {t.message_count ? ` ・ ${Math.ceil(t.message_count / 2)}往復` : ''}
                  {t.spawned_page ? ' ・ ページを作成' : ''}
                </span>
              </Link>
              <WikiMoreMenu
                label={t.title || '無題の質問'}
                compact
                items={[
                  {
                    key: 'delete',
                    label: 'この会話を消す',
                    icon: Trash2,
                    danger: true,
                    disabled: remove.isPending,
                    onSelect: () => { void ask(t); },
                  },
                ]}
              />
            </div>
          ))
        )}
      </div>

      <p className="px-2 pt-1.5 text-sub-sm leading-relaxed text-muted-foreground">
        1つの会話は {MAX_TURNS} 往復までです。ページから開くと、そのページと子ページを先に読みます。
      </p>
    </div>
  );
}
