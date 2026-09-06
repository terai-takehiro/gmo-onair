/**
 * 案件台帳の書き出し（CSV）— どの列に何を出すか
 *
 * ── なぜ画面に並んでいる行から作らないか ────────────────────
 *
 * ⚠️ **並んでいる行だけを書き出してはいけません。** 表に出せるのは
 * **1ページ 100 件まで**（サーバーの上限）なので、それを書き出すと
 * **101 件目からが黙って落ちます** — 落ちたことは書き出したファイルには
 * 出ないので、**Excel で数えて「これで全部だ」と読まれます**。
 * 整合性を確かめるためのファイルでそれをやると、確認そのものが嘘になります。
 *
 * → 引くのは `useLedgerCsv.ts`（絞り込みに当たるものを全ページ）。
 *
 * ── 表と同じ値・ただし Excel で使える形 ─────────────────────
 *
 * 列と並びは**画面に出しているものをそのまま**使います（`COL_DEFS` が唯一の表）。
 * ただし**表の見た目そのままではありません** — 表は狭いので短くしていますが、
 * Excel は並べ替えと絞り込みに使うので**元の形**で出します:
 *
 *  ・ステージ … 表はバッジの短い名前 → CSV は**記号つきの正式名**
 *  ・最後の動き … 表は「3日前」 → CSV は**日時そのもの**（相対時刻は並べ替えできない）
 *  ・金額 … **`¥` を付けない**（付けると Excel が文字列として読み、合計が出せない）
 *
 * `shared/tests/projectLedgerCsv.test.ts` が「`COL_DEFS` の全部の列に中身があるか」を
 * 見ています。**列を足して `cellText` に書き忘れると空欄で出る**ためです
 * （画面では出ているので、書き出したファイルを開くまで気づけません）。
 */
import { ProjectStageLabels } from '@/types';
import { classificationLabel } from '@/contexts/sales/classification';
import { INTAKE_CHANNEL_LABEL } from '../projectList/intake';
import { ENTITY_BADGE_LABEL } from '../projectList/stages';
import { COL_DEFS, colDef, type LedgerColKey, type LedgerRow } from './types';
import { toCsv } from './csv';

/**
 * 数の列。**表が「—」を出すものは空欄にします**（上の決めごとのとおり）。
 *
 * ⚠️ **0 を書かないのはこの製品の都合です。** 金額の列はサーバーが
 * `COALESCE(…, 0)` で返すので、**「見積が1件も無い」と「合計が 0 円の見積」が
 * どちらも 0 で届き、画面からは区別できません**。ここで `0` と書くと
 * 「0 円で見積もった」と読まれ、Excel で平均を取ると**見積の無い案件まで
 * 分母に入ります**。区別が要るようになったら、まずサーバーが
 * NULL を返すようにするのが先です（画面側では取り戻せません）。
 */
function numeric(v: number | string | null | undefined): string {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n) || n === 0) return '';
  return String(n);
}

/**
 * 1マスの文字列。**知らない列は `undefined`** を返します
 * （試験が「`COL_DEFS` に足したのに書き忘れた列」を見つけられるように。
 * 空文字を返すと、書き忘れと「値が無い」の区別が付きません）。
 */
export function cellText(col: LedgerColKey, row: LedgerRow): string | undefined {
  switch (col) {
    case 'gls_number': return row.gls_number ?? '';
    case 'code': return row.code ?? '';
    case 'name': return row.name;
    case 'customer_name': return row.customer_name ?? '';
    case 'contact_name': return row.contact_name ?? '';
    // **表のバッジ（「受注」）ではなく記号つきの正式名**。CSV は並べ替えに使う
    case 'stage': return ProjectStageLabels[row.stage] ?? row.stage;
    case 'gls_category': return row.gls_category ?? '';
    // 表と同じ短い呼び名（`intake_channel` と同じやり方——コードのままでは Excel で読めない）
    case 'entity_code': return row.entity_code ? (ENTITY_BADGE_LABEL[row.entity_code] ?? row.entity_code) : '';
    // **2つ揃ったときだけ。** 片方だけ書くと、決めているのか決めていないのかが読めない
    case 'classification': return classificationLabel(row.audience, row.project_category) ?? '';
    case 'recurrence': return row.recurrence === 'regular' ? 'レギュラー' : '単発';
    case 'event_start': return row.event_start ?? '';
    case 'event_end': return row.event_end ?? '';
    case 'attendee_count': return numeric(row.attendee_count);
    case 'estimate_amount': return numeric(row.estimate_amount);
    case 'expected_amount': return numeric(row.expected_amount);
    case 'total_revenue': return numeric(row.total_revenue);
    case 'total_purchase': return numeric(row.total_purchase);
    case 'assigned_to_name': return row.assigned_to_name ?? '';
    case 'intake_channel': return row.intake_channel
      ? (INTAKE_CHANNEL_LABEL[row.intake_channel] ?? row.intake_channel) : '';
    // **「あり／なし」で出す。** 1 / 0 だと、開いた人には何のことか分からない
    case 'application_form': return row.application_form ? 'あり' : 'なし';
    case 'next_task_due': return row.next_task_due ?? '';
    // **表は「3日前」だが CSV は日時そのもの**（相対時刻は並べ替えも絞り込みもできない）
    case 'last_activity_at': return row.last_activity_at ?? '';
    default: return undefined;
  }
}

/** 画面に出している列を、出している並びのまま書き出す */
export function buildLedgerCsv(rows: LedgerRow[], shown: LedgerColKey[]): string {
  // **知らない列は落とす**（画面に無い列を勝手に増やさない）
  const cols = shown.filter((k) => COL_DEFS.some((c) => c.key === k));
  return toCsv(
    cols.map((k) => colDef(k).label),
    rows.map((r) => cols.map((k) => cellText(k, r) ?? '')),
  );
}
