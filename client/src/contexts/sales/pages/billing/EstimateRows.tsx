/**
 * ⑤ 見積・請求 の「見積」タブ (v4)
 *
 * 列は**モックの並びそのまま**、幅だけ7段 (`SlotWidth`) に寄せています:
 *
 *   案件 ／ 見積   伸びる (`RowMain`)     モック flex:1
 *   版             56px  (`RowSlot`)      モック 52px
 *   金額（税抜）   128px (`MoneyCell`)    モック 150px → 7段に寄せた
 *   状態           96px  (`TableBadge`)   モック 96px
 *   担当           96px  (`RowSlot`)      モック 96px
 *   提出・期限     96px  (`RowSlot`)      モック 104px
 *   帳票           56px  (`RowSlot`)      **モックには無い**（下記）
 *
 * **旧版はサーバーが外しています** (`status <> 'superseded'`)。
 * 差し替え済みの版が並ぶと「返事待ちが何件か」が読めません。
 *
 * ── 「帳票」列だけモックに無い ──────────────────────────────
 *
 * 見積書 PDF を出す口が v4 のどこにも無くなっていた（ご指摘）ため足しました。
 * ここは**案件をまたいで返事待ちを追う画面**なので、「まだ出していない見積を
 * 見つけて、その場で出す」がそのまま片づく仕事になります。押すと BOX の
 * 社外と共有するフォルダにも入ります（`lib/docPdf.ts`）。
 */
import { useNavigate } from 'react-router-dom';
import { DocPdfButton } from '@/contexts/shared/components/DocPdfButton';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { ESTIMATE_STATUS_LABEL, ESTIMATE_STATUS_TONE, type BillingEstimate } from './types';

/** 期限の色。**超過だけを赤にする** — 全部に色を付けると超過が埋もれる */
function dueTone(due: string | null, today: string): string {
  if (!due) return 'text-muted-foreground';
  if (due < today) return 'text-destructive';
  if (due === today) return 'text-warning';
  return 'text-secondary-foreground';
}

function dueSub(due: string | null, today: string): string | null {
  if (!due) return null;
  if (due < today) return '期限超過';
  // 当日は「本日」（`docs/wording.md` ルール8・9）。✕「今日が期限」は口語なので使わない
  if (due === today) return '本日';
  return null;
}

export function EstimateRows({ rows, today }: { rows: BillingEstimate[]; today: string }) {
  const navigate = useNavigate();
  return (
    <>
      <RowHeader className="hidden sm:flex">
        <RowMain>案件 ／ 見積</RowMain>
        <RowSlot w={56} align="center">版</RowSlot>
        <RowSlot w={128} align="right">金額（税抜）</RowSlot>
        <RowSlot w={96}>状態</RowSlot>
        <RowSlot w={96}>担当</RowSlot>
        <RowSlot w={96} align="right">提出・期限</RowSlot>
        <RowSlot w={56} align="right">帳票</RowSlot>
      </RowHeader>
      {rows.map((e) => {
        // 値引きは単価を下げず別建てなので、見せる金額は引いたあと
        const amount = Number(e.subtotal ?? 0) - Number(e.discount ?? 0);
        return (
          <Row
            key={e.id}
            divider
            interactive
            stackOnMobile
            onClick={() => navigate(`/sales/projects/${e.project_id}/estimate`)}
          >
            <RowMain>
              <RowTitle>{e.project_name}</RowTitle>
              <RowSub>{[e.customer_name, e.title].filter(Boolean).join(' ・ ') || '（表題なし）'}</RowSub>
            </RowMain>
            <RowSlot w={56} align="center">
              <span className="font-number text-sub-sm rounded-badge bg-muted px-1.5 py-0.5 font-bold text-secondary-foreground">
                v{e.version}
              </span>
            </RowSlot>
            <MoneyCell value={amount} width={128} />
            <RowSlot w={96}>
              {/* **承認待ちは状態より先に出す。** 「作成中」と出ていると
                  ただの下書きに見えるが、実際は**上限超えで送れない**行なので、
                  ここで気づけないと承認者に回らない */}
              <TableBadge
                label={e.approval_state === 'pending'
                  ? '承認待ち'
                  : (ESTIMATE_STATUS_LABEL[e.status] ?? e.status)}
                w={null}
                className={e.approval_state === 'pending'
                  ? 'border-transparent bg-warning-surface text-warning'
                  : ESTIMATE_STATUS_TONE[e.status]}
              />
            </RowSlot>
            <RowSlot w={96} placeholder="—" hideOnMobile>
              {e.created_by_name && <span className="text-sub truncate">{e.created_by_name}</span>}
            </RowSlot>
            <RowSlot w={96} align="right" placeholder="—">
              {e.valid_until && (
                <span className="flex flex-col items-end leading-tight">
                  <span className={`font-number text-sub font-bold ${dueTone(e.valid_until, today)}`}>
                    {e.valid_until.slice(5).replace('-', '/')}
                  </span>
                  {dueSub(e.valid_until, today) && (
                    <span className={`text-sub-sm ${dueTone(e.valid_until, today)}`}>
                      {dueSub(e.valid_until, today)}
                    </span>
                  )}
                </span>
              )}
            </RowSlot>
            <RowSlot w={56} align="right">
              <DocPdfButton path={`/projects/${e.project_id}/estimates/${e.id}/pdf`} kind="estimate" />
            </RowSlot>
          </Row>
        );
      })}
    </>
  );
}
