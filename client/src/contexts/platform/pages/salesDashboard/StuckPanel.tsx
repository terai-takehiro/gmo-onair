/**
 * 「止まっている案件」(v4 ①)
 *
 * ── この画面でいちばん大事な1枚 ────────────────────────────
 *
 * 数字は減っていくものだけを出しても意味がなく、**忘れられている案件**を
 * 名指しするのがダッシュボードの役目です。7日以上、案件もタスクも活動記録も
 * 動いていないものを、**長く止まっている順**に出します。
 *
 * ── 理由の書き方 ──────────────────────────────────────────
 *
 * モックの「見積を送ったまま連絡がありません」は、**いつそのステージになったか**が
 * 分かって初めて言える文です。migration 164 で履歴を持つようになったので、
 * サーバーが「そのステージになってから何日か」を添えて返します
 * (`salesOverview.service` の `stuckWhy`)。
 *
 * **履歴が無い案件 (164 より前から動いているもの) は日数を出しません。**
 * `updated_at` で代えると、案件名を直しただけで「たった今そのステージになった」
 * ことになり、嘘の日数が出ます。
 */
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Panel } from './Panel';
import type { SalesOverview } from './types';

export function StuckPanel({ overview }: { overview: SalesOverview }) {
  const navigate = useNavigate();
  const rows = overview.stuck;

  return (
    <Panel
      title="止まっている案件"
      tone="alert"
      icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
      note={`${overview.stuck_days}日以上 動きがないもの`}
      to="/sales/projects"
      toLabel="一覧で見る"
    >
      {rows.length === 0 ? (
        <EmptyState
          title="止まっている案件はありません"
          description={`進行中の案件はすべて ${overview.stuck_days}日以内に動いています。`}
        />
      ) : (
        rows.map((p) => (
          <Row key={p.id} divider interactive onClick={() => navigate(`/sales/projects/${p.id}`)}>
            {/* 日数は行の頭に置く。**この枚は「何日ほったらかしか」で読む** */}
            <RowSlot w={56} align="center">
              <span className="flex flex-col items-center leading-none">
                <span className="font-number text-lg font-bold text-destructive">{p.days}</span>
                <span className="text-sub-sm text-muted-foreground">日</span>
              </span>
            </RowSlot>
            <RowMain>
              <RowTitle>{p.name}</RowTitle>
              <RowSub>{[p.customer_name, p.why].filter(Boolean).join(' ・ ')}</RowSub>
            </RowMain>
          </Row>
        ))
      )}
    </Panel>
  );
}
