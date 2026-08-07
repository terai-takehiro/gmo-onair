/**
 * ⑤ 入ってきた情報（日常業務） (v4)
 *
 * 案件・営業・見積請求・内覧会のどれにも属さない有益な情報を、AI が
 * スパム・営業・メルマガを除いて取り込み、**人が4つの行き先に仕分ける台**です。
 *
 * ── この版で足したもの（大②・migration 171）──────────────────
 *
 * これまでは「重要度」と「対応済みか」しか持っておらず、**仕分けた結果が
 * どこにも残りません**でした（対応済みにするだけ）。ストックしたのか、
 * 誰かがやることになったのか、見送ったのかが翌日には分かりません。
 *
 *   出どころ   mail / slack / phone / talk（列はあったが `email`/`manual` の2値だった）
 *   行き先     未仕分け / ストック / チケット / 案件にした / 見送り
 *   タグ       配列。ストックしたものを後から引くため
 *   チケット   案件管理のタスクを1本作り、`task_id` で結ぶ
 *
 * ── モックとの違いは1つだけ ──────────────────────────────
 *
 * モックのタブは4つ（未仕分け/ストック/チケット/見送り）ですが、
 * 「案件の受付へ送る」の置き場がありません。そのまま作ると送ったものが
 * **未仕分けに残り続け、翌日また送って案件が2件できます**。
 * 「案件にした」を足した理由は `inquiries/state.ts` に書いてあります。
 *
 * ── AI の印は `source` では判定しない ──────────────────────
 *
 * 以前は `source === 'email'` を AI の印にしていましたが、あれは出どころで
 * あって誰が入れたかではありません（手で足したメールにも印が付いていた）。
 * サーバーが `ai_outputs` に記録があるかを見て `is_ai` で返します。
 */
import { useMemo, useState } from 'react';
import {
  Sparkles, Pencil, Trash2, AlertTriangle, Tag,
  ListChecks, FolderPlus, Archive, CircleSlash, RotateCcw, Mail, MessageSquare, Phone, Users,
} from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import {
  IMPORTANCE_LABELS, INQUIRY_STATE_LABELS, INQUIRY_SOURCE_LABELS,
  formatDateJa, type MiscInquiry, type Importance, type InquiryState,
} from '@/lib/types';
import { useInquiries, useInquiryTags, useMoveInquiry, useDeleteInquiry } from '@/lib/inboxApi';
import { InquiryDialog } from './inquiries/InquiryDialog';
import { TicketDialog } from './inquiries/TicketDialog';
import { SidePanels } from './inquiries/SidePanels';
import { Destination, InquiryBody } from './inquiries/InquiryBody';
import { actionsFor, ACTION_LABEL, type InquiryAction } from './inquiries/state';

/** 重要度の色。**意味で決める**（画面ごとに変えない） */
const IMP_TONE: Record<Importance, string> = {
  high: 'border-transparent bg-destructive-surface text-destructive',
  medium: 'border-transparent bg-warning-surface text-warning',
  low: 'border-transparent bg-muted text-muted-foreground',
};

const SRC_ICON = { mail: Mail, slack: MessageSquare, phone: Phone, talk: Users, manual: Pencil };
const ACTION_ICON: Record<InquiryAction, typeof ListChecks> = {
  ticket: ListChecks, toProject: FolderPlus, stock: Archive, drop: CircleSlash, unsort: RotateCcw,
};

/** タブ。**モックの並びのまま**（「案件にした」だけ足してある） */
const TABS: InquiryState[] = ['unsorted', 'stock', 'ticket', 'project', 'dropped'];

export default function InquiriesPage() {
  const { canEdit } = usePermissions();
  const [tab, setTab] = useState<InquiryState>('unsorted');
  const [src, setSrc] = useState<string>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<MiscInquiry | null>(null);
  const [ticketing, setTicketing] = useState<MiscInquiry | null>(null);
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  // **絞り込みは画面で行う。** 件数をタブに出すには全部を1回引く必要があり、
  // サーバーで絞ると「押す前に 0 件だと分かる」が成り立たない
  const query = useInquiries({});
  const tagQuery = useInquiryTags();
  const all = useMemo(() => query.data ?? [], [query.data]);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((s) => [s, all.filter((q) => q.state === s).length])) as Record<InquiryState, number>,
    [all],
  );

  const rows = useMemo(() => all.filter((q) => (
    q.state === tab
    && (src === 'all' || q.source === src)
    && (!tag || q.tags.includes(tag))
  )), [all, tab, src, tag]);

  const move = useMoveInquiry();
  const del = useDeleteInquiry();

  const onMove = (q: MiscInquiry, state: 'unsorted' | 'stock' | 'dropped', msg: string) =>
    move.mutate({ id: q.id, state }, {
      onSuccess: () => notifySuccess(msg),
      onError: (e) => notifyApiError('動かせませんでした', e),
    });

  const onAction = async (q: MiscInquiry, a: InquiryAction) => {
    if (a === 'ticket') { setTicketing(q); return; }
    if (a === 'toProject') {
      // 案件は**案件管理の登録モーダル**で作る（16項目・顧客の選択・権限を持っている）。
      // 別バンドルなので `navigate` では飛べない
      window.location.href = `/sales/projects/new?inquiry=${encodeURIComponent(q.id)}`;
      return;
    }
    if (a === 'stock') { onMove(q, 'stock', 'ストックしました。タグを付けておくと後から引けます'); return; }
    if (a === 'unsort') {
      if (q.state === 'ticket' || q.state === 'project') {
        const ok = await confirmAction({
          title: '未仕分けに戻しますか',
          description: q.state === 'ticket'
            ? '**作ったタスクは消しません。**結びつきだけ外すので、いらなければ案件管理のタスク一覧で消してください。'
            : '**作った案件は消しません。**結びつきだけ外すので、いらなければ案件一覧で消してください。',
          confirmLabel: '戻す',
        });
        if (!ok) return;
      }
      onMove(q, 'unsorted', '未仕分けに戻しました');
      return;
    }
    onMove(q, 'dropped', '見送りにしました');
  };

  const onDelete = async (q: MiscInquiry) => {
    const ok = await confirmAction({
      title: 'この情報を消しますか',
      description: `「${q.subject || q.summary}」を消します。**AI が読み取った内容とメールの原文も一緒に消えます。**`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (!ok) return;
    del.mutate(q.id, {
      onSuccess: () => notifySuccess('消しました'),
      onError: (e) => notifyApiError('消せませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="入ってきた情報"
        sub={`未仕分け ${counts.unsorted}件 ・ ストック ${counts.stock}件 ・ チケットにしたもの ${counts.ticket}件`}
        primaryAction={canEdit ? <Button onClick={() => setAdding(true)}>手で足す</Button> : undefined}
      />

      <FilterChips
        label="行き先で絞り込む"
        items={TABS.map((s) => ({ key: s, label: INQUIRY_STATE_LABELS[s], count: counts[s] }))}
        value={tab}
        onChange={(k) => setTab(k as InquiryState)}
      />
      <FilterChips
        label="出どころで絞り込む"
        items={[
          { key: 'all', label: 'すべて', count: all.length },
          ...(['mail', 'slack', 'phone', 'talk'] as const).map((k) => ({
            key: k, label: INQUIRY_SOURCE_LABELS[k], count: all.filter((q) => q.source === k).length,
          })),
        ]}
        value={src}
        onChange={setSrc}
      />

      {tag && (
        <p className="text-sub flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-primary">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />「{tag}」で絞り込み中
          </span>
          <button type="button" onClick={() => setTag(null)} className="min-h-tap text-note text-muted-foreground underline lg:min-h-[32px]">
            解除する
          </button>
        </p>
      )}

      <div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-5">
        <div className="min-w-0 flex-1">
          {query.isError ? (
            <ErrorPanel title="情報を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <Delayed><SkeletonRows rows={5} /></Delayed>
          ) : rows.length === 0 ? (
            <EmptyState
              title={`${INQUIRY_STATE_LABELS[tab]}のものはありません`}
              description={tab === 'unsorted'
                ? '届いたものは全部仕分け済みです。メールで届いた有益な情報は AI が取り込みます。'
                : 'ほかの行き先のタブを見てください。'}
            />
          ) : (
            <div className="flex flex-col">
              <RowHeader className="hidden sm:flex">
                <RowSlot w={72}>重要度</RowSlot>
                <RowMain>内容 ／ 出どころ</RowMain>
                <RowSlot w={96}>受信</RowSlot>
                <RowSlot w={160}>{canEdit ? '次にやること' : ''}</RowSlot>
              </RowHeader>

              {rows.map((q) => {
                const SrcIcon = SRC_ICON[q.source as keyof typeof SRC_ICON] ?? Pencil;
                return (
                  <Row key={q.id} align="start" className={q.state === 'dropped' ? 'opacity-70' : undefined}>
                    <RowSlot w={72}>
                      <TableBadge label={IMPORTANCE_LABELS[q.importance]} w={null} className={`w-full ${IMP_TONE[q.importance]}`} />
                    </RowSlot>

                    <RowMain>
                      <RowTitle>
                        {q.is_ai && (
                          <Sparkles className="mr-1 inline h-3.5 w-3.5 text-ai" aria-label="AI が取り込みました" />
                        )}
                        {q.summary}
                      </RowTitle>
                      <RowSub>
                        <SrcIcon className="mr-1 inline h-3 w-3" aria-hidden="true" />
                        {[
                          INQUIRY_SOURCE_LABELS[q.source] ?? q.source,
                          q.sender,
                          q.subject ? `件名: ${q.subject}` : null,
                        ].filter(Boolean).join(' ・ ')}
                      </RowSub>

                      {q.tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {q.tags.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setTag(t)}
                              className="rounded-note text-badge border border-border bg-surface-subtle px-1.5 py-0.5 text-secondary-foreground"
                            >
                              {t}
                            </button>
                          ))}
                        </span>
                      )}

                      {q.action_needed && q.state === 'unsorted' && (
                        <p className="text-note mt-1 flex items-start gap-1 text-info">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {q.action_needed}
                        </p>
                      )}

                      <Destination q={q} />
                      <InquiryBody q={q} open={opened === q.id} onToggle={() => setOpened((c) => (c === q.id ? null : q.id))} />
                    </RowMain>

                    <RowSlot w={96} hideOnMobile>
                      <span className="font-number text-sub-sm text-secondary-foreground">
                        {q.received_at ? formatDateJa(q.received_at) : '—'}
                      </span>
                    </RowSlot>

                    <RowSlot w={160}>
                      {canEdit && (
                        <span className="flex w-full flex-col gap-1">
                          {actionsFor(q.state).map((a) => {
                            const Icon = ACTION_ICON[a];
                            return (
                              <Button
                                key={a}
                                variant={a === 'ticket' ? 'default' : 'outline'}
                                className="w-full justify-start"
                                disabled={move.isPending}
                                onClick={() => onAction(q, a)}
                              >
                                <Icon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                {ACTION_LABEL[a]}
                              </Button>
                            );
                          })}
                          <span className="flex gap-1">
                            <Button variant="ghost" aria-label="直す" onClick={() => setEditing(q)}>
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" aria-label="消す" onClick={() => onDelete(q)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                            </Button>
                          </span>
                        </span>
                      )}
                    </RowSlot>
                  </Row>
                );
              })}
            </div>
          )}

          <p className="text-note mt-3 text-muted-foreground">
            <Sparkles className="mr-1 inline h-3 w-3 text-ai" aria-hidden="true" />
            の付いた行は AI が取り込んだものです。「中身を読む」で
            <strong className="font-bold">AI が項目に分けて読み取った内容</strong>と原文を確かめられます。
            直した内容は AI の改善に戻ります（何を直したかを入力する必要はありません）。
          </p>
        </div>

        <SidePanels all={all} tags={tagQuery.data ?? []} activeTag={tag} onPickTag={setTag} />
      </div>

      {(adding || editing) && (
        <InquiryDialog initial={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {ticketing && <TicketDialog inquiry={ticketing} onClose={() => setTicketing(null)} />}
    </div>
  );
}
