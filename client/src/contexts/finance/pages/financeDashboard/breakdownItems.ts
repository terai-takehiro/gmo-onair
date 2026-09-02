/**
 * 内訳の行を組み立てる（① 財務ダッシュボード）
 *
 * `BudgetDashboardPage` から切り出したもの。**押したときの動作は呼び出し側が渡す** —
 * 行の組み立てが「どの台帳へどう飛ぶか」を知らずに済み、呼び出し側の画面だけを
 * 読めば導線が分かる形にするため（400行の上限もここで守る）。
 *
 * ── 3列とも「押す＝その台帳の明細一覧へ飛ぶ」に揃えた ────────────
 *
 * 以前は列ごとに動作が違い（売上＝ダッシュボードに留まって絞り込み、仕入・販管費＝
 * ダッシュボード上に閲覧専用ダイアログ）、**同じ形の行なのに押すと違うことが起きる**
 * 状態でした（ご指摘「明細一覧に飛ばしてください」）。いまは3列とも
 * 売上→`/budget/revenues`・仕入→`/budget/purchases`・販管費→`/budget/sga` へ、
 * **いま効いている期間**（と、案件に紐づく行はその案件）で絞り込んで開きます。
 * 引き継ぐクエリの組み立ては `period.ts` の `ledgerOpenQuery` 1本
 *（「台帳をひらく」フッターボタンと同じ関数＝対応表を2つ持たない）。
 *
 * ── 申請ステータスは台帳と同じ関数から作る ──────────────────
 *
 * 仕入・販管費の「仮／確定：未申請／確定：申請済」は `ledger/settlementState.ts` を
 * **そのまま呼ぶ**。ここに判定を書き写すと片方だけ古くなる — 実際、以前は
 * `is_provisional ? '仮' : null` という2値だけが内訳に書き写されており、
 * 台帳が3値になったあとも内訳だけ「確定：未申請」と「確定：申請済」が
 * 同じ見た目（バッジ無し）のまま取り残されていた。
 */
import type { SgaExpense } from '@/types';
import type { PurchaseRow } from '../ledger/types';
import { settlementState } from '../ledger/settlementState';
import { billingState } from '../ledger/billingState';
import type { BreakdownItem } from './Breakdown';

/**
 * 売上の内訳が使う列だけ。`GET /revenues` の行は列が多く、
 * **この画面が本当に読んでいるものを型で言い切る**ために絞ってある。
 */
export interface RevenueBreakdownRow {
  id: string;
  gls_number?: string | null;
  episode_code?: string | null;
  project_name?: string | null;
  customer_name?: string | null;
  amount: number;
  project_id?: string | null;
  group_id?: string | null;
  /* 請求の進み具合を出すために読む2列（`billingState`）。`GET /revenues` は
     `SELECT r.*` なので、どちらも既にクライアントへ届いている */
  paid_date?: string | null;
  invoice_issued?: boolean | null;
}

export function buildRevenueItems(
  rows: RevenueBreakdownRow[],
  on: {
    /**
     * 売上台帳（③ 売上）の明細一覧へ。案件に紐づく行はその案件で絞り込んで開く
     * （期間は呼び出し側が `ledgerOpenQuery` で足す）。
     */
    openLedger: (projectId?: string | null, projectName?: string | null) => void;
    /** 按分グループの行だけの行き先（案件が1つに決まらないため） */
    openGroup: (groupId: string) => void;
  },
): BreakdownItem[] {
  return rows.map((r) => {
    // ⚠️ 三項の中で絞っても、コールバックの中では TS の絞り込みが効かない
    //（`r` の属性は書き換わりうると見なされる）ので、先に取り出しておく
    const groupId = r.group_id;
    const projectId = r.project_id;
    const projectName = r.project_name;
    return {
      id: r.id,
      code: r.episode_code || r.gls_number,
      title: r.project_name || '（案件名なし）',
      sub: r.customer_name,
      amount: Number(r.amount) || 0,
      /*
       * 請求の進み具合（未請求／発行済／入金済）。**台帳とまったく同じ
       * `billingState` を呼ぶ**ので、文言も色も自動でそろう（写して2本にしない）。
       *
       * ⚠️ 仕入・販管費の「仮／確定：未申請／確定：申請済」とは**別の軸**。
       * 売上に申請という概念は無く、請求書を出したか・入金があったかを見る。
       * ここは当初「売上には該当する状態が無い」として出していなかったが、
       * ご指示（「一応売上も入れておいてください」）で足した。
       *
       * `to`（請求・入金へのリンク）は**渡さない** — 行そのものが明細一覧への
       * 遷移なので、バッジの中にリンクを入れると当たり判定が入れ子になる。
       */
      badge: billingState(r),
      /*
       * ⚠️ **案件管理（`/sales/projects/:id`）へは出さない。** 行き先は財務の
       * 売上台帳（明細一覧）で、その案件といま効いている期間で絞り込んだ状態。
       *
       * 案件が空の行も**押せるままにする** — 3列とも「押す＝明細一覧へ」で
       * 揃えるのが今回の趣旨なので、期間だけ引き継いで台帳を開く。
       *
       * 按分グループの行だけは**案件が1つに決まらない**うえ、いまのサーバーは
       * 売上をグループで絞る口を持たない（仕入だけが持つ）ので、従来どおり
       * グループの詳細へ出す。台帳に寄せるにはサーバー側の対応が要る。
       */
      onClick: groupId
        ? () => on.openGroup(groupId)
        : () => on.openLedger(projectId, projectName),
    };
  });
}

export function buildPurchaseItems(
  rows: PurchaseRow[],
  /**
   * 仕入台帳（④ 仕入）の明細一覧へ。案件に紐づく行はその案件で絞り込んで開く。
   * ⚠️ 固定原価（償却負担額）の行は案件を持たないことがあるので、
   * **`null` で呼ばれる前提**にしてある（期間だけ引き継いで開く）。
   */
  openLedger: (projectId?: string | null, projectName?: string | null) => void,
): BreakdownItem[] {
  return rows.map((p) => ({
    id: p.id,
    code: p.episode_code || p.gls_number,
    title: p.description || p.project_name || '（説明なし）',
    sub: [p.vendor_name, p.project_name].filter(Boolean).join(' ／ ') || null,
    amount: Number(p.amount) || 0,
    // 台帳（④ 仕入）とまったく同じ3値。**ここで判定を書き写さない**
    badge: settlementState(p.is_provisional, p.settlement_number),
    // 精算ページ。**申請URLが入っている行にだけ**出す（台帳と同じ流儀）
    settlementUrl: p.settlement_url,
    // 押す＝仕入の明細一覧へ（この行の案件と、いま効いている期間で絞り込む）
    onClick: () => openLedger(p.project_id, p.project_name),
  }));
}

export function buildSgaItems(
  rows: SgaExpense[],
  /**
   * 販管費台帳（⑤ 販管費）の明細一覧へ。
   * ⚠️ **販管費は案件に紐づかない**ので、引き継ぐのは期間だけ（引数を取らない）。
   * 行そのものを指す絞り込みは台帳側に無い（`?edit=` は「編集ダイアログを開く」で
   * あって絞り込みではないため、閲覧の導線としては使わない）。
   */
  openLedger: () => void,
): BreakdownItem[] {
  return rows.map((x) => ({
    id: x.id,
    title: x.description || '（詳細なし）',
    sub: x.vendor_name,
    amount: Number(x.amount) || 0,
    // 台帳（⑤ 販管費）とまったく同じ3値（`is_provisional` は migration 268 で追加済み）
    badge: settlementState(x.is_provisional, x.settlement_number),
    settlementUrl: x.settlement_url,
    // 押す＝販管費の明細一覧へ（いま効いている期間で絞り込む）
    onClick: () => openLedger(),
  }));
}
