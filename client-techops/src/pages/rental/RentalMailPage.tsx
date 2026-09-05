// 依頼メールの作成（Mail.dc.html 相当）。mail-draft を組み立てて表示し、
// 「本文をコピー」「メールアプリで開く」（+ 開いたら依頼済みにする）を提供する。
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Clipboard, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, EmptyState } from '@gmo-onair/shared/src/client/states';
import { notifyError, notifySuccess } from '@/lib/notify';
import * as rentalApi from '@/lib/rentalApi';
import { formatYen } from './rentalFormat';

export default function RentalMailPage() {
  const { ownerKey = '', company = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const draftQuery = useQuery({
    queryKey: ['rental-mail-draft', ownerKey, company],
    queryFn: () => rentalApi.getRentalMailDraft(ownerKey, company),
    enabled: !!ownerKey && !!company,
    retry: false,
  });

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [markAsRequested, setMarkAsRequested] = useState(true);

  useEffect(() => {
    if (draftQuery.data) {
      setSubject(draftQuery.data.subject);
      setBody(draftQuery.data.body);
    }
  }, [draftQuery.data]);

  const requestMutation = useMutation({
    mutationFn: () => rentalApi.requestRentalReservations(ownerKey, company),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-reservations', ownerKey] });
      notifySuccess('予約リストを「依頼済み」にしました');
    },
    onError: () => notifyError('「依頼済み」にできませんでした。', { description: '少し待ってから、もう一度お試しください。' }),
  });

  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(body);
      notifySuccess('本文をコピーしました');
    } catch {
      notifyError('コピーできませんでした。', { description: '本文を選んで、手でコピーしてください。' });
    }
  };

  const openInMailApp = () => {
    // ⚠️ URLSearchParams は使わない — application/x-www-form-urlencoded 準拠で
    // 半角スペースを `+` に変換するが、mailto: の RFC 6068 はそれを解さない
    // （多くのメールクライアントで件名・本文の空白が `+` の文字そのままで開いてしまう）。
    // encodeURIComponent で愚直にパーセントエンコードする。
    const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = `mailto:${encodeURIComponent(toEmail)}?${query}`;
    if (markAsRequested) requestMutation.mutate();
  };

  if (draftQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <Delayed>
          <SkeletonRows rows={6} />
        </Delayed>
      </div>
    );
  }

  if (draftQuery.isError || !draftQuery.data) {
    return (
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <EmptyState title="依頼メールを作れませんでした" description="この会社の予約リストが空か、時間を置いてもう一度お試しください。" />
      </div>
    );
  }

  const { itemCount, quantityTotal, subtotal } = draftQuery.data;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 px-3 py-4 sm:px-6 sm:py-6">
      <button
        type="button"
        onClick={() => navigate(`/techops/rental/${encodeURIComponent(ownerKey)}/list`)}
        className="inline-flex min-h-[44px] w-fit items-center gap-1.5 text-sub text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        予約リストに戻る
      </button>

      <PageHeader
        title="依頼メールの作成"
        sub={`${company}宛 ・ ${itemCount}品目 ・ ${quantityTotal}点`}
      >
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-[44px]" onClick={copyBody}>
            <Clipboard className="mr-1.5 h-4 w-4" aria-hidden="true" />
            本文をコピー
          </Button>
          <Button className="min-h-[44px]" onClick={openInMailApp}>
            <Mail className="mr-1.5 h-4 w-4" aria-hidden="true" />
            メールアプリで開く
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-1 flex-col gap-3.5 lg:flex-row">
        <div className="flex flex-col gap-3 lg:w-[350px] lg:shrink-0">
          <div className="flex flex-col gap-2.5 rounded-card border border-border bg-card p-4">
            <span className="text-sub-sm font-extrabold tracking-wide text-muted-foreground">依頼の内容</span>
            <span className="text-sub">
              {itemCount}品目 ・ {quantityTotal}点
            </span>
            <span className="font-number text-sub font-bold">参考 {formatYen(subtotal)}</span>
          </div>

          <div className="flex flex-col gap-2.5 rounded-card border border-border bg-card p-4">
            <span className="text-sub-sm font-extrabold tracking-wide text-muted-foreground">宛先</span>
            <label className="flex flex-col gap-1">
              <span className="text-sub-sm font-bold text-muted-foreground">宛先（To）</span>
              <Input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="ご担当者のメールアドレス"
                className="h-9 text-sub"
              />
            </label>
            <label className="mt-1 flex cursor-pointer items-start gap-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={markAsRequested}
                onClick={() => setMarkAsRequested((v) => !v)}
                className={`mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-badge-xs border ${
                  markAsRequested ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                }`}
              >
                {markAsRequested && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
              </button>
              <span className="text-sub text-foreground">
                送信したら予約リストを「依頼済み」にする（開いたあとに確認します）
              </span>
            </label>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border-faint px-4 py-2.5">
            <span className="shrink-0 text-sub-sm font-bold text-muted-foreground">件名</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 flex-1 text-sub font-bold" />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[360px] flex-1 resize-none border-0 bg-transparent px-5 py-4 text-sub leading-relaxed focus:outline-none"
          />
          <div className="flex items-center gap-1.5 border-t border-border-faint bg-surface-subtle px-4 py-2.5 text-sub-sm text-muted-foreground">
            本文は自由に書き換えられます。送信は行いません — 「メールアプリで開く」で普段のメールから送ってください
          </div>
        </div>
      </div>
    </div>
  );
}
