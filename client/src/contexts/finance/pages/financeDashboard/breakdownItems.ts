/**
 * 内訳の行を組み立てる（① 財務ダッシュボード）
 *
 * `BudgetDashboardPage` から切り出したもの。**押したときの動作は呼び出し側が渡す** —
 * 行の組み立てが「画面遷移なのか・ダイアログなのか・絞り込みなのか」を知らずに済み、
 * 呼び出し側の画面だけを読めば導線が分かる形にするため（400行の上限もここで守る）。
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
}

export function buildRevenueItems(
  rows: RevenueBreakdownRow[],
  on: {
    /** その案件で**この画面のまま**絞り込む */
    focusProject: (projectId: string) => void;
    /** 按分グループの行だけの行き先（案件が1つに決まらないため） */
    openGroup: (groupId: string) => void;
  },
): BreakdownItem[] {
  return rows.map((r) => {
    // ⚠️ 三項の中で絞っても、コールバックの中では TS の絞り込みが効かない
    //（`r` の属性は書き換わりうると見なされる）ので、先に取り出しておく
    const groupId = r.group_id;
    const projectId = r.project_id;
    return {
      id: r.id,
      code: r.episode_code || r.gls_number,
      title: r.project_name || '（案件名なし）',
      sub: r.customer_name,
      amount: Number(r.amount) || 0,
      /*
       * ⚠️ **案件管理（`/sales/projects/:id`）へ出さない**（ご要望
       * 「売上の内訳の行を押したら、案件管理ではなく財務管理の中で
       * その案件に絞り込んだ画面へ」）。押したら財務ダッシュボードに留まる。
       *
       * 按分グループの行だけは**案件が1つに決まらない**うえ、いまのサーバーは
       * 売上をグループで絞る口を持たない（仕入だけが持つ）ので、従来どおり
       * グループの詳細へ出す。財務内に留めるにはサーバー側の対応が要る。
       */
      onClick: groupId
        ? () => on.openGroup(groupId)
        : projectId
          ? () => on.focusProject(projectId)
          : undefined,
    };
  });
}

export function buildPurchaseItems(
  rows: PurchaseRow[],
  onOpen: (row: PurchaseRow) => void,
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
    // 台帳へ行かず、このまま閲覧専用ダイアログを開く（仕様変更 #3）
    onClick: () => onOpen(p),
  }));
}

export function buildSgaItems(
  rows: SgaExpense[],
  onOpen: (row: SgaExpense) => void,
): BreakdownItem[] {
  return rows.map((x) => ({
    id: x.id,
    title: x.description || '（詳細なし）',
    sub: x.vendor_name,
    amount: Number(x.amount) || 0,
    // 台帳（⑤ 販管費）とまったく同じ3値（`is_provisional` は migration 268 で追加済み）
    badge: settlementState(x.is_provisional, x.settlement_number),
    settlementUrl: x.settlement_url,
    // 台帳へ行かず、このまま閲覧専用ダイアログを開く（仕様変更 #3）
    onClick: () => onOpen(x),
  }));
}
