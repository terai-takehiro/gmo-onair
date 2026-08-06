/**
 * ⑤ 入ってきた情報（日常業務） (v4)
 *
 * 案件・営業・見積請求・内覧会のどれにも属さない有益なメールを、AI が
 * スパム・営業・メルマガを除いて分類・重要度づけして入れます。
 *
 * ── この版で直した中身 ──────────────────────────────────────
 *
 * これまで AI が読み取った内容は **`summary`（1行要約）と `notes`（自由文）** に
 * 潰して入っており、画面はそれを `📝 <そのままのテキスト>` と出すだけでした。
 * 「誰が・何を・いつまでに・いくらで」が全部同じ見た目の中に埋もれていて、
 * 受け取った人は毎回全文を読み直していました。
 *
 * migration 160 で `details`（意味の単位の配列）と `body_text`（メール原文）を
 * 持てるようにし、`RichContent` が **項目・箇条書き・表・引用**として描きます。
 * **AI に HTML を書かせてはいません** — AI は何の情報かを言い、見せ方はアプリが決めます。
 *
 * ── モックに載っているが出していないもの ────────────────────
 *
 * 出どころ（mail/slack/phone/talk）・4段階の状態（未仕分け/ストック/チケット/見送り）・
 * タグの配列・チケット（案件管理のタスク）への紐づけ。**DB に列がありません。**
 * 数えられないものをそれらしく出すと、以後この画面全体が信用されなくなります。
 * いまある軸（重要度・対応済みか）だけで組み、無い理由を画面に書いてあります。
 */
import { useMemo, useState } from 'react';
import { Sparkles, Pencil, Trash2, CheckCircle2, Circle, ExternalLink, AlertTriangle, FileText } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { RichContent } from '@gmo-onair/shared/src/client-v4/richContent';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { IMPORTANCE_LABELS, formatDateJa, type MiscInquiry, type Importance } from '@/lib/types';
import { useInquiries, useHandleInquiry, useDeleteInquiry } from '@/lib/inboxApi';
import { InquiryDialog } from './inquiries/InquiryDialog';

/** 重要度の色。**意味で決める**（画面ごとに変えない） */
const IMP_TONE: Record<Importance, string> = {
  high: 'border-transparent bg-destructive-surface text-destructive',
  medium: 'border-transparent bg-warning-surface text-warning',
  low: 'border-transparent bg-muted text-muted-foreground',
};

type Chip = 'all' | 'unhandled' | 'high';

export default function InquiriesPage() {
  const { canEdit } = usePermissions();
  const [chip, setChip] = useState<Chip>('unhandled');
  const [editing, setEditing] = useState<MiscInquiry | null>(null);
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  // **絞り込みは画面で行う。** 件数をチップに出すには全部を1回引く必要があり、
  // サーバーで絞ると「押す前に 0 件だと分かる」が成り立たない
  const query = useInquiries({});
  const all = useMemo(() => query.data ?? [], [query.data]);
  const counts = useMemo(() => ({
    all: all.length,
    unhandled: all.filter((q) => !q.handled_at).length,
    high: all.filter((q) => q.importance === 'high' && !q.handled_at).length,
  }), [all]);

  const rows = useMemo(() => {
    if (chip === 'unhandled') return all.filter((q) => !q.handled_at);
    if (chip === 'high') return all.filter((q) => q.importance === 'high' && !q.handled_at);
    return all;
  }, [all, chip]);

  const handle = useHandleInquiry();
  const del = useDeleteInquiry();

  const onDelete = async (q: MiscInquiry) => {
    const ok = await confirmAction({
      title: 'この問い合わせを消しますか',
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
        sub="案件・営業・見積請求・内覧会のどれにも属さない有益なメール。AI がスパム・営業・メルマガを除いて分類します"
        primaryAction={canEdit ? <Button onClick={() => setAdding(true)}>手で足す</Button> : undefined}
      />

      <FilterChips
        label="対応の状況で絞り込む"
        items={[
          { key: 'unhandled', label: '未対応', count: counts.unhandled },
          { key: 'high', label: '未対応かつ重要', count: counts.high },
          { key: 'all', label: 'すべて', count: counts.all },
        ]}
        value={chip}
        onChange={(k) => setChip(k as Chip)}
      />

      {query.isError ? (
        <ErrorPanel title="問い合わせを読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title={chip === 'all' ? '問い合わせはありません' : '未対応の問い合わせはありません'}
          description="メールで届いた有益な情報を AI が取り込みます。手で足すこともできます。"
        />
      ) : (
        <div className="flex flex-col">
          <RowHeader className="hidden sm:flex">
            <RowSlot w={72}>重要度</RowSlot>
            <RowMain>内容 ／ 送信者</RowMain>
            <RowSlot w={96}>受信</RowSlot>
            <RowSlot w={200}>{canEdit ? '次にやること' : ''}</RowSlot>
          </RowHeader>

          {rows.map((q) => (
            <Row key={q.id} align="start" className={q.handled_at ? 'opacity-70' : undefined}>
              <RowSlot w={72}>
                <TableBadge label={IMPORTANCE_LABELS[q.importance]} w={null} className={`w-full ${IMP_TONE[q.importance]}`} />
              </RowSlot>

              <RowMain>
                <RowTitle>
                  {q.source === 'email' && (
                    <Sparkles className="mr-1 inline h-3.5 w-3.5 text-ai" aria-label="AI が取り込みました" />
                  )}
                  {q.summary}
                </RowTitle>
                <RowSub>
                  {[
                    q.sender,
                    q.subject ? `件名: ${q.subject}` : null,
                    q.category,
                    q.handled_at ? `対応済み（${q.handled_by || '—'}）` : null,
                  ].filter(Boolean).join(' ・ ')}
                </RowSub>

                {q.action_needed && (
                  <p className="text-note mt-1 flex items-start gap-1 text-info">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {q.action_needed}
                  </p>
                )}

                <InquiryBody q={q} open={opened === q.id} onToggle={() => setOpened((c) => (c === q.id ? null : q.id))} />
              </RowMain>

              <RowSlot w={96} hideOnMobile>
                <span className="font-number text-sub-sm text-secondary-foreground">
                  {q.received_at ? formatDateJa(q.received_at) : '—'}
                </span>
              </RowSlot>

              <RowSlot w={200}>
                {canEdit && (
                  <span className="flex flex-wrap gap-1">
                    <Button
                      variant={q.handled_at ? 'outline' : 'default'}
                      disabled={handle.isPending}
                      onClick={() => handle.mutate(
                        { id: q.id, handled: !q.handled_at },
                        { onError: (e) => notifyApiError('変えられませんでした', e) },
                      )}
                    >
                      {q.handled_at
                        ? <><Circle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />未対応に戻す</>
                        : <><CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />対応済み</>}
                    </Button>
                    <Button variant="ghost" aria-label="直す" onClick={() => setEditing(q)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" aria-label="消す" onClick={() => onDelete(q)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                    </Button>
                  </span>
                )}
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        <Sparkles className="mr-1 inline h-3 w-3 text-ai" aria-hidden="true" />
        の付いた行は AI がメールから取り込んだものです。「中身を読む」で
        <strong className="font-bold">AI が項目に分けて読み取った内容</strong>とメールの原文を確かめられます。
        モックにある「出どころ」「未仕分け／ストック／チケット」「タグ」は
        <strong className="font-bold">まだデータとして持っていない</strong>ので出していません。
      </p>

      {(adding || editing) && (
        <InquiryDialog initial={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
    </div>
  );
}

/** AI が読み取った中身とメール原文。**開いたときだけ**出す（行の高さをそろえるため） */
function InquiryBody({ q, open, onToggle }: { q: MiscInquiry; open: boolean; onToggle: () => void }) {
  const hasRich = !!q.details && q.details.length > 0;
  const hasText = !!q.notes;
  const hasBody = !!q.body_text;
  if (!hasRich && !hasText && !hasBody && !q.url) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-note min-h-tap inline-flex items-center gap-1 text-primary lg:min-h-[28px]"
      >
        {open ? '中身を閉じる' : '中身を読む'}
        {hasRich && <Sparkles className="h-3 w-3 text-ai" aria-label="AI が項目に分けて読み取りました" />}
      </button>

      {open && (
        <div className="rounded-control-lg mt-1.5 flex flex-col gap-3 border border-border bg-card p-3">
          <RichContent blocks={q.details} fallback={q.notes} />

          {q.url && (
            <a
              href={q.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sub inline-flex items-center gap-1 text-primary underline"
            >
              参考リンク<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}

          {hasBody && (
            <details>
              <summary className="text-note min-h-tap flex cursor-pointer items-center gap-1 text-muted-foreground lg:min-h-[28px]">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                メールの原文を見る
              </summary>
              {/* **原文は要約と別に持っている。** AI がどこを読み違えたかを
                  その場で確かめられるようにするため（切り詰めていない） */}
              <pre className="text-note rounded-note mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 text-secondary-foreground">
                {q.body_text}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
