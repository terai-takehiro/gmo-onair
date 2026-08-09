/**
 * 「自動で届いたもの」— 案件作成の上に置く横スクロールのレール
 *
 * ── 受付を畳んだ先がここ ────────────────────────────────────
 *
 * 旧 `/sales/inbox`（受付）は「届いたものを読む → 足りないところを埋める →
 * 案件にする」の3ステップを1画面でやる場所でした。**案件作成とやることが同じ**
 * なので、届いたものを**レール1本**にしてこの画面の上に載せ、受付は廃止しました。
 *
 * カードを押すと**下のフォームに読み取り結果が入ります**。手で入れるときは
 * 何も選ばずそのまま書きます（レールは「無視してよい入口」であること）。
 *
 * ── 出すのは引き合いだけ ────────────────────────────────────
 *
 * `GET /dashboard/inbox` は4種類を返しますが、ここに出すのは
 * **ネタ案件と問い合わせ**（`INTAKE_KINDS`）だけです。期限超過はダッシュボードの
 * 「期限が過ぎたやること」、見積・請求の書類は財務の「受け取った書類」が持ちます。
 * **口は変えません** — 同じ口をホームの「お待たせ中」とタイルの件数が読んでいます。
 *
 * ── 掴んで滑らせる ──────────────────────────────────────────
 *
 * 帯の手触りは `client-v4/rail.ts`（ドラッグ・慣性・誤爆の防止・端の溶かし方）。
 * ここに書かないのは、同じ帯を他の画面でも使うためです。
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import api from '@/lib/api';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { useRail } from '@gmo-onair/shared/src/client-v4/rail';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { INTAKE_KINDS, titleOf, subtitleOf, type InboxData, type InboxItem } from '../inbox/kinds';

/**
 * レールのカードの幅。**モックの実測値（236px）**。件名の長さなりにすると
 * カードごとに幅が変わり、横に払ったときの止まる位置が読めません。
 */
const CARD_W = 'w-[236px]';  // ui-tokens-ok: レールのカードは 236px 固定

/** 札の文字。**56px の枠に収める**ので2〜4字 */
const KIND_BADGE: Record<string, { label: string; tone: string }> = {
  ai_project: { label: 'ネタ', tone: 'bg-ai-surface text-ai' },
  inquiry: { label: '問合せ', tone: 'bg-primary-surface text-primary' },
};

export function useIntakeItems(): { items: InboxItem[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<InboxData>({
    queryKey: queryKeys.dashboard.inbox(),
    queryFn: async () => (await api.get('/dashboard/inbox')).data.data,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
  return {
    items: (data?.items ?? []).filter((i) => INTAKE_KINDS.includes(i.kind)),
    isLoading,
  };
}

export function IntakeRail({
  items,
  selectedKey,
  onSelect,
}: {
  items: InboxItem[];
  selectedKey: string | null;
  onSelect: (item: InboxItem | null) => void;
}) {
  const rail = useRail();

  // **1件も無いときは枠ごと出さない。** 「自動で届いたもの 0件」の帯が
  // 毎回出ると、案件作成が「受付の付属品」に見える
  if (items.length === 0) return null;

  return (
    <div className="rounded-card border border-info-border bg-info-surface-weak px-3.5 py-3">
      <p className="text-sub mb-2 flex flex-wrap items-center gap-2 font-bold">
        <Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
        自動で届いたもの
        <span className="text-badge font-number rounded-badge-xs bg-primary-surface px-1.5 py-0.5 text-primary">
          {items.length}
        </span>
        <span className="text-note font-normal text-muted-foreground">
          選ぶと下の欄に読み取った内容が入ります
        </span>
        {selectedKey && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-note font-bold text-primary hover:underline"
          >
            選択をやめる
          </button>
        )}
      </p>

      <div className="relative">
        {/* 続きがある側にだけ丸ボタンを出す。**端に着いたら消える** */}
        {rail.canLeft && (
          <RailButton dir={-1} onClick={() => rail.nudge(-1)} />
        )}
        {rail.canRight && (
          <RailButton dir={1} onClick={() => rail.nudge(1)} />
        )}
        <div
          ref={rail.ref}
          onScroll={rail.onScroll}
          style={rail.style}
          className="v4-rail flex gap-2 pb-1"
          role="listbox"
          aria-label="自動で届いたもの"
        >
          {items.map((item) => {
            const badge = KIND_BADGE[item.kind] ?? KIND_BADGE.inquiry;
            const on = item.key === selectedKey;
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onSelect(on ? null : item)}
                className={`v4-press ${CARD_W} shrink-0 rounded-note border px-3 py-2.5 text-left ${
                  on
                    ? 'border-primary-border-strong bg-primary-surface'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sub min-w-0 flex-1 truncate font-bold">{titleOf(item)}</span>
                  <span className={`text-badge inline-flex h-5 w-14 shrink-0 items-center justify-center rounded-badge-xs ${badge.tone}`}>
                    {badge.label}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
                    {subtitleOf(item)}
                  </span>
                  <span className="text-note font-number shrink-0 text-fg-disabled">
                    {formatRelativeTime(item.received_at)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 左右の丸ボタン。**指では出さない**（掴んで動かせるので邪魔になるだけ） */
function RailButton({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? '前を見る' : '次を見る'}
      className={`absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-muted lg:flex ${
        dir < 0 ? '-left-2' : '-right-2'
      }`}
    >
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
