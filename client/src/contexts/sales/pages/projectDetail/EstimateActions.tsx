/**
 * 見積タブ / 版1件の操作ボタン群 (v4 ⑥)
 *
 * `EstimateTab.tsx` から切り出した（400行の上限に当たったため）。
 * **PC の `Row` とスマホのカードで同じものを呼ぶ** — 写すと、片方だけ
 * ボタンを足し忘れたり条件がずれたりする（他のタブと同じ理由）。
 */
import { Copy, Send, Trash2, CheckCircle2, XCircle, ArrowRight, Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocPdfButton } from '@/contexts/shared/components/DocPdfButton';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { formatCurrency } from '@/lib/format';

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'superseded';

export interface EstimateForActions {
  id: string;
  version: number;
  status: EstimateStatus;
  subtotal: number;
  discount: number;
  revenue_id: string | null;
  /** アーカイブした日時。`null`/未設定なら一覧に出る（migration 236） */
  archived_at?: string | null;
}

export function EstimateActions({
  e, base, onSetStatus, onConvert, onNextVersion, onRemove, onArchive, onUnarchive,
}: {
  e: EstimateForActions;
  base: string;
  onSetStatus: (status: EstimateStatus) => void;
  onConvert: () => void;
  onNextVersion: () => void;
  onRemove: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* **見積書 PDF はどの版からも出せる。** 出したあと（`sent`）や
          旧版（`superseded`）こそ「何を出したか」を紙で確かめたい場面が多く、
          ここで状態を見て隠すと、いちばん要るときに押せなくなる。
          押すと BOX の社外と共有するフォルダにも入る（`docPdf.ts`）*/}
      <DocPdfButton path={`${base}/${e.id}/pdf`} kind="estimate" />
      {e.status === 'draft' && (
        <Button variant="outline" size="sm" title="お客様に出したことにする" onClick={() => onSetStatus('sent')}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
      {e.status === 'sent' && (
        <>
          <Button variant="outline" size="sm" title="受注にする" onClick={() => onSetStatus('accepted')}>
            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" title="失注にする" onClick={async () => {
            const ok = await confirmAction({
              title: '失注にしますか？',
              description: 'この見積は失注として残ります。取り消したいときは次の版をつくってください。',
              confirmLabel: '失注にする', tone: 'danger',
            });
            if (ok) onSetStatus('rejected');
          }}>
            <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
          </Button>
        </>
      )}
      {e.status === 'accepted' && (
        e.revenue_id ? (
          <span className="text-sub-sm whitespace-nowrap text-success">登録済み</span>
        ) : (
          <Button size="sm" title="この見積の金額で売上・請求に登録する" onClick={async () => {
            const ok = await confirmAction({
              title: '売上・請求に登録しますか？',
              description: `見積の金額（税抜 ${formatCurrency(e.subtotal - e.discount)}）で「売上・請求」に1件登録します。あとから金額だけをここで直しても登録済みの売上には反映されません。`,
              confirmLabel: '登録する',
            });
            if (ok) onConvert();
          }}>
            <ArrowRight className="mr-1 h-3.5 w-3.5" aria-hidden="true" />売上・請求へ
          </Button>
        )
      )}
      <Button variant="outline" size="sm" title="この版を写して次の版をつくる" onClick={onNextVersion}>
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {/* **アーカイブは消すのとは別**（`status` を変えない・記録はそのまま）。
          送付済み・受注済みの版も「もう見ない版を一覧から隠す」だけなら
          いつでもできる — `status` の分岐に関係なく常に出す */}
      {e.archived_at ? (
        <Button variant="outline" size="sm" title="一覧に戻す" onClick={onUnarchive}>
          <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      ) : (
        <Button variant="outline" size="sm" title="アーカイブする（一覧から隠す。消えません）" onClick={onArchive}>
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
      {/* ⚠️ **消せるのは下書きだけ**（レビューでの指摘 #50）。
          `revenue_id` が無いことだけを見ていたので、**出した版・受注した版・
          差し替え済みの版まで消せました** — 送った見積はお客様に渡した記録で、
          消えると「何を出したか」を追えません。サーバーも同じ条件で断ります */}
      {!e.revenue_id && e.status === 'draft' && (
        <Button variant="outline" size="sm" title="消す" onClick={async () => {
          const ok = await confirmAction({
            title: `v${e.version} を消しますか？`,
            description: '明細もいっしょに消えます。ほかの版は残ります。元に戻せません。',
            confirmLabel: '消す', tone: 'danger',
          });
          if (ok) onRemove();
        }}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
