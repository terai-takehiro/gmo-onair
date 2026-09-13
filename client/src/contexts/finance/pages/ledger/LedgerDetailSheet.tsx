/**
 * 台帳の1行を読むシート（スマホ・③ 売上 ／ ④ 仕入 ／ ⑤ 販管費 で共通） (v4)
 *
 * ── なぜ一度シートを挟むのか ────────────────────────────────
 *
 * カードには行き先が3つ（状態 → 請求・入金／案件 → 案件詳細／申請URL → 外部）
 * ありますが、**カードの中に入れ子で置くと指ではどれを押したのか分かりません**
 * （PC と違って hover で確かめられない）。カード全体を1つのボタンにして
 * このシートを開き、行き先はシートの下端に縦に並べます。
 *
 * ── 金額を大きく出して、その下に万円を添える ────────────────
 *
 * **桁を1つ読み違えると万の位が10倍ずれます。** 一覧では金額のレールで
 * 桁がそろいますが、1件だけを見ているここには比べる相手がいないので、
 * 万円の読み（`manYen`）を添えて**その場で気づけるように**します。
 *
 * ── ここに置かないもの ──────────────────────────────────────
 *
 * **削除は置きません。** 元に戻せない操作を、確認を1つ挟んだだけで
 * 指に押させない（`MobileCollect` の「取り消しはここに置かない」と同じ）。
 */
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { manYen } from '@gmo-onair/shared/src/client/ui/numbers';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Button } from '@/components/ui/button';
import { monthOf, taxLabel } from './format';
import { STATE_TONE, type LedgerRow } from './types';

export function LedgerDetailSheet({
  row, itemLabel, canEdit, onEdit, onProject, onClose,
}: {
  /** 開いている行。**閉じたら親が描かない**ので、開くたびに作り直される */
  row: LedgerRow;
  /** 「この◯◯を直す」の◯◯（売上／仕入／販管費）。**列名ではなく台帳の呼び名** */
  itemLabel: string;
  canEdit: boolean;
  onEdit: (row: LedgerRow) => void;
  /** 「案件を開く」。渡さなければ出さない（販管費は案件を持たない） */
  onProject?: (row: LedgerRow) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const fields = row.detail ?? [];

  return (
    <Sheet
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      // 見出しは切りません（カードでは truncate しているので、全文が読めるのはここだけ）
      title={row.title || '（名称なし）'}
      sub={[row.code, monthOf(row.recognition_date)].filter(Boolean).join(' ・ ')}
      footer={
        <div className="flex flex-col gap-2">
          {row.state?.to && (
            // **台帳から状態は変えません**（PC と同じ決めごと）。変えられる画面へ移るだけ
            <Button variant="outline" className="w-full" onClick={() => navigate(row.state!.to!)}>
              {row.state.toLabel ?? '状態の画面を開く'}
            </Button>
          )}
          {canEdit && (
            <Button className="w-full" onClick={() => onEdit(row)}>この{itemLabel}を編集</Button>
          )}
          {onProject && row.project_id && (
            <Button variant="outline" className="w-full" onClick={() => onProject(row)}>案件を開く</Button>
          )}
          {row.settlement_url && (
            // 外部サイトなので新しいタブで開く（`LedgerRows` の申請URLと同じ扱い）
            <a
              href={row.settlement_url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-tap text-sub flex w-full items-center justify-center gap-1.5 rounded-control border border-border text-secondary-foreground"
            >
              精算ページを開く
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      }
    >
      {/* 金額。**畳まない**（この台帳をスマホで開く理由そのもの） */}
      <div className="rounded-card border border-border bg-surface-subtle px-4 py-3">
        <Money value={row.amount} inline className="text-h2" />
        {/* 桁の読み違いの最後の砦。万の位が10倍ずれていればここが合わない */}
        <p className="text-note font-number mt-0.5 text-muted-foreground">{manYen(row.amount)}</p>
        <p className="text-note mt-0.5 text-muted-foreground">税抜 ・ {taxLabel(row.tax_category)}</p>
      </div>

      {/*
        状態は**押せない印**として出す（行き先は下端のボタンに集約してある）。
        バッジの `title`（「2026-08-20 に入金。押すと…」）はここでは出さない —
        「押すと」が嘘になり、日付は下の項目に同じものが並ぶ
      */}
      {(row.state || row.secondaryBadge) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {row.state && (
            <TableBadge label={row.state.label} w={null} className={STATE_TONE[row.state.tone]} />
          )}
          {row.secondaryBadge && (
            <TableBadge
              label={row.secondaryBadge.label}
              w={null}
              className={STATE_TONE[row.secondaryBadge.tone]}
            />
          )}
        </div>
      )}

      <dl className="mt-3 flex flex-col gap-2.5">
        {fields.map((f) => (
          <div key={f.label} className="flex items-baseline gap-3">
            <dt className="text-sub w-[72px] shrink-0 text-muted-foreground">{f.label}</dt>
            {/* 長い備考・長い案件名を切らない（切ると、ここに来た意味が無くなる） */}
            <dd className="text-sub min-w-0 flex-1 [overflow-wrap:anywhere]">{f.value}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
