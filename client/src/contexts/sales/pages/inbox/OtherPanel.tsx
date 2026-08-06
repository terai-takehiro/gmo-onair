/**
 * ネタ案件**以外**の「確かめる」(v4 ②)
 *
 * 期限超過のアクション・問い合わせ・見積/請求は、
 * **案件にするものではありません**。3ステップ（入れる→確かめる→案件にする）は
 * 通らないので、作業台ではなく「中身を見て、終わらせる」だけを出します。
 *
 * 終わらせ方が別のアプリにあるもの（問い合わせ・見積/請求は日常業務）は、
 * **ここで無理に片づけさせず、行き先を出します** — 同じ処理を2か所に置くと
 * 片方だけ直したときに挙動が食い違います。
 */
import { ExternalLink, Check, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { KINDS, titleOf, type InboxItem } from './kinds';

const DOC_TYPE: Record<string, string> = { quote: '見積書', invoice: '請求書', order: '注文書' };

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="flex items-start gap-3 border-t border-border-subtle py-2">
      <span className="text-sub w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-list min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

export function OtherPanel({
  item, onComplete, onPostpone, onHandle, canHandle, busy,
}: {
  item: InboxItem;
  onComplete: () => void;
  onPostpone: (days: number) => void;
  onHandle: () => void;
  canHandle: boolean;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const m = item.meta;
  const k = KINDS[item.kind];
  const Icon = k.icon;

  return (
    <section className="rounded-card border border-border bg-card p-4 lg:px-5">
      <h2 className="text-cardtitle flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {titleOf(item)}
      </h2>

      <div className="mt-2">
        {item.kind === 'overdue_action' && (
          <>
            <Line label="案件">{String(m.gls_number ?? m.project_code ?? '')} {String(m.project_name ?? '')}</Line>
            <Line label="やること">{String(m.next_action ?? '')}</Line>
            <Line label="期限">{String(m.next_action_date ?? '')}（{String(m.days_overdue ?? 0)}日超過）</Line>
          </>
        )}
        {item.kind === 'inquiry' && (
          <>
            <Line label="送り主">{m.sender ? String(m.sender) : null}</Line>
            <Line label="要約">{m.summary ? String(m.summary) : null}</Line>
            <Line label="分類">{m.category ? String(m.category) : null}</Line>
            <Line label="やるとよいこと">{m.action_needed ? String(m.action_needed) : null}</Line>
          </>
        )}
        {item.kind === 'finance_doc' && (
          <>
            <Line label="種類">{DOC_TYPE[String(m.doc_type)] ?? String(m.doc_type ?? '')}</Line>
            <Line label="送り主">{m.sender ? String(m.sender) : null}</Line>
            {/* `Money` は幅いっぱいに ¥ と数字を離すので、**枠の幅を決めて**から置く
                (自由な行に置くと行の端まで広がって読めない) */}
            <Line label="金額">{m.amount != null ? <MoneyCell value={Number(m.amount)} width={128} /> : null}</Line>
            <Line label="支払期日">{m.payment_due ? String(m.payment_due) : null}</Line>
          </>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2 border-t border-border-subtle pt-3.5">
        {item.kind === 'overdue_action' && (
          <>
            <Button disabled={busy} onClick={onComplete}>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />やった
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => onPostpone(1)}>
              <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />明日に延ばす
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => onPostpone(7)}>1週間 延ばす</Button>
            <Button variant="outline" onClick={() => navigate(`/sales/projects/${m.project_id}`)}>案件を開く</Button>
          </>
        )}
        {item.kind === 'inquiry' && (
          <>
            {canHandle && (
              <Button disabled={busy} onClick={onHandle}>
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />対応済みにする
              </Button>
            )}
            <a
              href="/daily/inquiries"
              className="min-h-tap inline-flex items-center gap-2 rounded-control border border-border px-4 text-sub font-bold text-secondary-foreground hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />日常業務でひらく
            </a>
          </>
        )}
        {item.kind === 'finance_doc' && (
          <a
            href="/daily/finance"
            className="min-h-tap inline-flex items-center gap-2 rounded-control border border-border px-4 text-sub font-bold text-secondary-foreground hover:bg-accent"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />日常業務で処理する
          </a>
        )}
      </div>
    </section>
  );
}
