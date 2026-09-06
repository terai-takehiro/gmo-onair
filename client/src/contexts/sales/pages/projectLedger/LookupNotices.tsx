/**
 * 候補（社内の担当・お客様）の様子を出す帯 — 案件台帳の編集モード
 *
 * ── なぜ帯を3つに分けるか ──────────────────────────────────
 *
 * 名前の列（社内の担当・お客様）は**文字から id を引き当てて**書き換えます。
 * 候補が手元に無い状態で照合すると、**実在する人でも「いません」**と断られます。
 * 断られた人は**名前が間違っている**と思い、直しようのないものを直しにいきます。
 *
 * だから「いま候補がどうなっているか」を必ず出します。**3つは人がやることが違う**ので、
 * 1つの帯にまとめません:
 *
 *  ① **引いている最中** … 待てば直る（レビューでの指摘 #135）
 *  ② **引けなかった** … 待っても直らない。**やり直す**（同 #146）
 *  ③ **多すぎて打ち切った** … その先は「直す」画面から（同 #127・#135）
 *
 * ⚠️ ②を①と同じ扱いにすると、**永久に「読み込んでいます」と出たまま**になり、
 * 名前の2列は二度と直せません（待てと書いてあるのに、待っても直らない）。
 */
import { AlertTriangle, Loader2, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LedgerLookups } from './useLedgerLookups';

export function LookupNotices({ lookups }: { lookups: LedgerLookups }) {
  const { ready, failed, truncated, retry } = lookups;
  const loading = !ready.users || !ready.customers;
  const broken = failed.users || failed.customers;

  return (
    <>
      {/* ① 引いている最中 */}
      {loading && !broken && (
        <div className="rounded-note flex items-center gap-2 border border-border bg-muted px-3.5 py-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-sub text-muted-foreground">
            社内の担当・お客様の候補を読み込んでいます。
            <strong className="font-bold">読み終わるまで、この2つの列は編集できません</strong>
            （いま貼ると、実在する名前でも「いません」と断ってしまうためです）。
          </p>
        </div>
      )}

      {/* ② 引けなかった。**落ちた列だけ名指しする**（引けたほうを巻き添えにしない） */}
      {broken && (
        <div className="rounded-note flex flex-wrap items-center gap-2 border border-warning-border bg-warning-surface px-3.5 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sub flex-1 text-warning">
            <strong className="font-bold">
              {[failed.users && '社内の担当', failed.customers && 'お客様']
                .filter(Boolean).join('・')}
              の候補を読み込めませんでした。
            </strong>
            この列は名前では編集できません（実在する名前でも「いません」と断ってしまうため）。
            ほかの列は今までどおり編集できます。
          </p>
          <Button variant="outline" size="sm" onClick={retry}>再試行</Button>
        </div>
      )}

      {/* ③ 打ち切った。**黙らせない** — 出さないと「候補が全部ある」と読まれる */}
      {truncated && (
        <div className="rounded-note flex items-center gap-2 border border-warning-border bg-warning-surface px-3.5 py-2">
          <PencilLine className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sub text-warning">
            候補が多いので<strong className="font-bold">途中まで</strong>しか読み込めませんでした。
            名前で貼り付けると、読み込めていない担当・お客様は「いません」と断られます —
            その行は<strong className="font-bold">「編集」画面から</strong>直してください。
          </p>
        </div>
      )}
    </>
  );
}
