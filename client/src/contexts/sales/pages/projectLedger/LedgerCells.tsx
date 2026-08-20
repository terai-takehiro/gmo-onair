/**
 * 案件台帳の1マスの描き方（列の鍵 → 中身）
 *
 * **表頭と本文は同じ `COL_DEFS` から作ります**（`LedgerTable`）。ここが持つのは
 * 「その列に何をどう出すか」だけです。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**金額は `<Money>`。** `¥` と数字を別要素にして、縦に並べたとき桁を
 *    一直線にします（v4 の中核ルール）。**自分で `¥` を書かないこと**
 *  ・**空欄は「—」。** 空文字にすると、値が無いのか列がずれているのかが
 *    読み取れません（`Field` が「—」を出しているのと同じ理由）
 *  ・**分類は2つ揃ったときだけ出す**（`classificationLabel`）。片方だけ書くと
 *    分類が決まっているのか決めていないのかが読めません
 *  ・**旧「案件種類」に落とさない。** 案件詳細は落としますが、ここは
 *    **まとめて直すための画面**なので、空欄のまま出して「入っていない」ことを
 *    見えるようにします（それが直す対象そのものなので）
 */
import { Link } from 'react-router-dom';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Num } from '@gmo-onair/shared/src/client/ui/numbers';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { ProjectStageLabels } from '@/types';
import { classificationLabel } from '@/contexts/sales/classification';
import { STAGE_BADGE_LABEL, STAGE_BADGE_TONE } from '../projectList/stages';
import { INTAKE_CHANNEL_LABEL } from '../projectList/intake';
import { truncateName } from './display';
import type { LedgerColKey, LedgerRow } from './types';

/** 値が無いことをはっきり出す（空文字にすると列のずれと見分けが付かない） */
function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

/** 金額を数値に直す。**カードでも同じ判定**（0 円と未入力を同じ「—」にする）ので export する */
export function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function LedgerCell({ col, row }: { col: LedgerColKey; row: LedgerRow }) {
  switch (col) {
    case 'gls_number':
      return row.gls_number
        ? <span className="font-number">{row.gls_number}</span>
        : <span className="text-note text-muted-foreground">ヨミ段階</span>;

    case 'code':
      return row.code ? <span className="font-number">{row.code}</span> : <Dash />;

    /*
      **押すと案件詳細へ**（台帳は読むだけの画面ではない）。
      ⚠️ **20 文字で切る**（ご指示）。CSS の `…` だけに任せると、
      端末と書体で**切れる位置が変わり**、行によって読める文字数がばらばらに
      なります。文字数で切れば**どの端末でも同じところで切れます**。
      **全文はマウスを当てれば出ます**（`title`）— 切ったことに気づけないと、
      それが正式な名前だと読まれます。
    */
    case 'name':
      return (
        <Link
          to={`/sales/projects/${row.id}`}
          className="block truncate font-bold text-primary hover:underline"
          /*
            ⚠️ **いつも全文を持たせる**（実測で直した）。切ったときだけにすると、
            **20 文字ちょうどの名前が列に収まらず、CSS が切ったのに全文が出ません**
            （240px は寸法表のいちばん広い段で、全角 20 文字＝約 260px は入らない）。
            同じ文字が出るだけなので、いつも持たせて困ることはありません。
          */
          title={row.name}
        >
          {truncateName(row.name).text}
        </Link>
      );

    case 'customer_name':
      return row.customer_name ? <span className="truncate" title={row.customer_name}>{row.customer_name}</span> : <Dash />;

    case 'contact_name':
      return row.contact_name ? <span className="truncate" title={row.contact_name}>{row.contact_name}</span> : <Dash />;

    /*
      **バッジは `<TableBadge>` を使う。** 自分で幅を書くと「この画面だけの幅」ができ、
      案件一覧のバッジと色の塊の形がずれます（`shared/src/client/ui/row.tsx` の
      `SLOT_WIDTHS` を全部の列が共有するのが v4 の決めごと）。
    */
    case 'stage':
      return (
        <TableBadge
          w={null}
          label={STAGE_BADGE_LABEL[row.stage]}
          title={ProjectStageLabels[row.stage]}
          className={STAGE_BADGE_TONE[row.stage]}
        />
      );

    case 'gls_category':
      return row.gls_category ? <span className="font-number">{row.gls_category}</span> : <Dash />;

    /*
      ⚠️ **入っていない案件は空欄のまま出す。** 案件詳細は旧「案件種類」に
      落としますが、この画面は**分類を埋めるための画面**でもあるので、
      落とすと「もう入っている」ように見えて直す対象が見つからなくなります。
    */
    case 'classification': {
      const label = classificationLabel(row.audience, row.project_category);
      // **切れたときに全文が読めるようにする**（「無観客 ・ 配信…」だけでは
      // 配信なのか収録なのか分からない）
      return label
        ? <span className="truncate" title={label}>{label}</span>
        : <span className="text-note text-muted-foreground">入っていません</span>;
    }

    case 'recurrence':
      return <span>{row.recurrence === 'regular' ? 'レギュラー' : '単発'}</span>;

    case 'event_start':
      return row.event_start
        ? <span className="font-number">{row.event_start}</span>
        : <span className="text-note text-muted-foreground">未定</span>;

    case 'event_end':
      return row.event_end
        ? <span className="font-number">{row.event_end}</span>
        : <Dash />;

    case 'attendee_count':
      return row.attendee_count ? <Num value={row.attendee_count} unit="名" /> : <Dash />;

    case 'estimate_amount':
      return num(row.estimate_amount) > 0 ? <Money value={num(row.estimate_amount)} /> : <Dash />;

    case 'expected_amount':
      return num(row.expected_amount) > 0 ? <Money value={num(row.expected_amount)} /> : <Dash />;

    case 'total_revenue':
      return num(row.total_revenue) > 0 ? <Money value={num(row.total_revenue)} /> : <Dash />;

    case 'total_purchase':
      return num(row.total_purchase) > 0 ? <Money value={num(row.total_purchase)} /> : <Dash />;

    case 'assigned_to_name':
      return row.assigned_to_name ? <span className="truncate" title={row.assigned_to_name}>{row.assigned_to_name}</span> : <Dash />;

    case 'intake_channel':
      return row.intake_channel
        ? <span className="truncate">{INTAKE_CHANNEL_LABEL[row.intake_channel] ?? row.intake_channel}</span>
        : <Dash />;

    case 'application_form':
      return row.application_form
        ? <span className="text-success">あり</span>
        : <span className="text-muted-foreground">なし</span>;

    case 'next_task_due':
      return row.next_task_due ? <span className="font-number">{row.next_task_due}</span> : <Dash />;

    case 'last_activity_at':
      return row.last_activity_at
        ? <span className="text-muted-foreground">{formatRelativeTime(row.last_activity_at)}</span>
        : <Dash />;

    default:
      return <Dash />;
  }
}
