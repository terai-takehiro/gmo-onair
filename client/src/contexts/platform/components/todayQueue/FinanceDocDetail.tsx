// 見積・請求の展開 (§4.4)
//   見せるもの: 届いた本文 (原本) + AI が読み取った値 (税抜金額 / 計上月 / 支払期日 / 紐づく案件)
//   押せるもの: 確認した → 承認する → 処理完了 / 却下
// 「処理へ」で別アプリに飛ばさず、この場でステータスを終端 (処理完了 or 却下) まで進める。

import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { DOC_TYPE_LABELS, FD_STATUS_LABELS, str, yen } from "./types";

export interface FinanceDocDetailProps {
  meta: Record<string, unknown>;
  editable: boolean;
  pending: boolean;
  onSetStatus: (status: "reviewing" | "approved" | "processed" | "rejected") => void;
}

export function FinanceDocDetail({ meta, editable, pending, onSetStatus }: FinanceDocDetailProps) {
  const status = str(meta.status) || "new";
  const content = str(meta.content);

  return (
    <div className="space-y-3 border-t border-divider pt-3">
      {/* AI が読み取った値 */}
      <div>
        <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">AI が読み取った内容</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="text-[12px] text-muted-foreground">種別</dt>
            <dd className="font-bold text-foreground">
              {DOC_TYPE_LABELS[str(meta.doc_type)] ?? (str(meta.doc_type) || "—")}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">金額（税抜）</dt>
            <dd className="font-bold tabular-nums text-foreground">{yen(meta.amount)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">計上月</dt>
            <dd className="font-bold text-foreground">{str(meta.closing_month) || "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">支払期日</dt>
            <dd className="font-bold text-foreground">{str(meta.payment_due) || "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">送ってきた人</dt>
            <dd className="font-bold text-foreground">{str(meta.sender) || "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">紐づく案件</dt>
            <dd className="font-bold text-foreground">{str(meta.gls_number) || "未設定"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">いまの状態</dt>
            <dd className="font-bold text-foreground">{FD_STATUS_LABELS[status] ?? status}</dd>
          </div>
        </dl>
      </div>

      {/* 届いた本文 (原本) */}
      {content && (
        <div>
          <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">届いた内容</p>
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-control border border-border bg-secondary/50 px-3 py-2 text-[13px] leading-relaxed text-foreground">
            {content}
          </pre>
        </div>
      )}

      {str(meta.notes) && (
        <p className="text-[13px] text-secondary-foreground">メモ: {str(meta.notes)}</p>
      )}

      {/* 終端アクション */}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          {status === "new" && (
            <Button size="sm" variant="outline" className="h-9" disabled={pending} onClick={() => onSetStatus("reviewing")}>
              確認した
            </Button>
          )}
          {(status === "new" || status === "reviewing") && (
            <Button size="sm" className="h-9" disabled={pending} onClick={() => onSetStatus("approved")}>
              この内容で承認
            </Button>
          )}
          <Button size="sm" className="h-9" disabled={pending} onClick={() => onSetStatus("processed")}>
            処理完了
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 border-destructive/40 text-destructive hover:bg-destructive-surface"
            disabled={pending}
            onClick={() => onSetStatus("rejected")}
          >
            却下
          </Button>
          <a
            href="/daily/finance"
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border px-3 text-[13px] text-secondary-foreground hover:bg-secondary"
          >
            金額や案件を直す
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          {pending && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="処理中" />}
        </div>
      ) : (
        <p className="text-[13px] text-secondary-foreground">
          承認や却下をするには「日常業務」の書ける権限が必要です。
        </p>
      )}
      <p className="text-[12px] text-muted-foreground">
        「処理完了」を押すと、あなたが処理した記録として残ります。金額や計上月を直してから承認したいときは
        「金額や案件を直す」で開いてください。
      </p>
    </div>
  );
}
