/**
 * 内訳の行を組み立てる（① 財務ダッシュボード）
 *
 * `BudgetDashboardPage` から切り出したもの。**押したときの動作は呼び出し側が渡す** —
 * 行の組み立てが「どの台帳へどう飛ぶか」を知らずに済み、呼び出し側の画面だけを
 * 読めば導線が分かる形にするため（400行の上限もここで守る）。
 *
 * ── 売上＝台帳へ遷移、仕入・販管費＝この画面のまま詳細モーダル（9/4 仕様変更）──
 *
 * 一時期は3列とも「押す＝台帳の明細一覧へ遷移」に揃えていたが、仕入・販管費は
 * 遷移すると**背景のページごと台帳に切り替わってしまい、一覧画面を維持してほしい**
 * というご指摘が入った。行はすでに1件分のデータを持っているので、遷移も
 * 再取得もせず、この画面の上に閲覧専用モーダル（`PurchaseDialog`/`SgaDialog` の
 * `readOnly`）を重ねるだけにしてある（`buildPurchaseItems`/`buildSgaItems` 参照）。
 * 売上は対象外（従来どおり台帳 `/budget/revenues` へ遷移。引き継ぐクエリの
 * 組み立ては `period.ts` の `ledgerOpenQuery`）。
 *
 * ── 申請ステータスは台帳と同じ関数から作る ──────────────────
 *
 * 仕入・販管費の「仮／確定：未申請／確定：申請済」は `ledger/settlementState.ts` を
 * **そのまま呼ぶ**。ここに判定を書き写すと片方だけ古くなる — 実際、以前は
 * `is_provisional ? '仮' : null` という2値だけが内訳に書き写されており、
 * 台帳が3値になったあとも内訳だけ「確定：未申請」と「確定：申請済」が
 * 同じ見た目（バッジ無し）のまま取り残されていた。
 *
 * ── 「確度加味」は行ごとにも掛ける（2026-09 依頼の拡張） ──────────
 *
 * 財務ダッシュボードの「総額／確度加味」は、以前は営業見通し（パイプライン）カード
 * だけに効いていた。ご依頼で画面全体（この内訳の各行を含む）に広げたため、
 * `weighted: true` のときは行の金額に**その案件のいまのフェーズの受注確度（%）**を
 * 掛けて表示する。**あくまでシミュレーション表示**——`amount` そのものを書き換えて
 * 返すのではなく、確度が100%未満のときだけ `sub` に「確度NN%」を添えて、
 * 実額をそのまま出していないことが分かるようにする。
 *
 * 合計（`BreakdownColumn` の見出し金額＝`monthly-summary` の値）も同じ確度で
 * サーバー側が重みづけ済みなので、ここで行ごとに掛けても合計とはズレない
 * （サーバー側 `monthly-summary.service.ts` の `weightedSum` と同じ丸め方＝
 * 行ごとに四捨五入ではなく、**行の見た目だけ**をここで丸める。1円単位のズレは
 * 「内訳は上位だけ」の性質上そもそも合計と一致しない設計なので許容する）。
 *
 * 案件に紐づかない行（`project_stage` が無い・固定原価Pjなど重みづけ対象外として
 * 呼び出し側が `null` にした行）は確度100%＝実額のまま。
 */
import type { SgaExpense } from '@/types';
import type { PurchaseRow } from '../ledger/types';
import { settlementState } from '../ledger/settlementState';
import { billingState } from '../ledger/billingState';
import { probabilityOf } from './useStageProbabilities';
import type { BreakdownItem } from './Breakdown';

/** 行ごとの確度加味オプション。渡さない（`undefined`）ときは総額のまま（従来どおり） */
export interface WeightingOptions {
  weighted: boolean;
  probabilityMap: Map<string, number>;
}

/** 確度を掛けた表示額と、添える注記（100%のときは注記なし）を返す */
function weightedDisplay(rawAmount: number, stage: string | null | undefined, weighting?: WeightingOptions) {
  if (!weighting?.weighted) return { amount: rawAmount, note: null as string | null };
  const prob = probabilityOf(weighting.probabilityMap, stage);
  if (prob >= 100) return { amount: rawAmount, note: null as string | null };
  return { amount: Math.round(rawAmount * (prob / 100)), note: `確度${prob}%として計算` };
}

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
  /** 案件のいまのフェーズ（`GET /revenues` が `p.stage as project_stage` で返す）。確度加味用 */
  project_stage?: string | null;
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
  weighting?: WeightingOptions,
): BreakdownItem[] {
  return rows.map((r) => {
    // ⚠️ 三項の中で絞っても、コールバックの中では TS の絞り込みが効かない
    //（`r` の属性は書き換わりうると見なされる）ので、先に取り出しておく
    const groupId = r.group_id;
    const projectId = r.project_id;
    const projectName = r.project_name;
    const { amount, note } = weightedDisplay(Number(r.amount) || 0, r.project_stage, weighting);
    return {
      id: r.id,
      code: r.episode_code || r.gls_number,
      title: r.project_name || '（案件名なし）',
      sub: [r.customer_name, note].filter(Boolean).join(' ・ ') || null,
      amount,
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
   * この行の**詳細モーダルを開くだけ**（台帳へは遷移しない・仕様変更 9/4）。
   *
   * ⚠️ 以前は台帳（④ 仕入）へ `navigate()` し、`?edit=<id>` で編集ダイアログを
   * 開いた状態で着地させていた。しかし「一覧画面をそのまま維持してほしい
   * （背景が台帳に遷移するのは望ましくない）」というご指摘のとおり、フルページ
   * 遷移そのものが問題だった。行はすでに1件分のデータを持っているので、
   * 遷移も再取得もせず、そのままこの画面の上に閲覧専用モーダル
   * （`PurchaseDialog readOnly`）を重ねるだけにする。
   */
  onView: (row: PurchaseRow) => void,
  weighting?: WeightingOptions,
): BreakdownItem[] {
  return rows.map((p) => {
    // 固定原価（`code=FIXED-COGS`）は呼び出し側（`BudgetDashboardPage`）が
    // `project_stage: null` に落として渡す＝ここでは常に実額 100% のまま
    const { amount, note } = weightedDisplay(Number(p.amount) || 0, p.project_stage, weighting);
    return {
      id: p.id,
      code: p.episode_code || p.gls_number,
      title: p.description || p.project_name || '（説明なし）',
      sub: [p.vendor_name, p.project_name, note].filter(Boolean).join(' ／ ') || null,
      amount,
      // 台帳（④ 仕入）とまったく同じ3値。**ここで判定を書き写さない**
      badge: settlementState(p.is_provisional, p.settlement_number),
      // 精算ページ。**申請URLが入っている行にだけ**出す（台帳と同じ流儀）
      settlementUrl: p.settlement_url,
      // 押す＝この画面のまま詳細モーダルを開くだけ（台帳へは移動しない）
      onClick: () => onView(p),
    };
  });
}

export function buildSgaItems(
  rows: SgaExpense[],
  /**
   * この行の**詳細モーダルを開くだけ**（台帳へは遷移しない・仕様変更 9/4）。
   * 理由は `buildPurchaseItems` と同じ（`SgaDialog readOnly` を重ねる）。
   */
  onView: (row: SgaExpense) => void,
): BreakdownItem[] {
  return rows.map((x) => ({
    id: x.id,
    title: x.description || '（詳細なし）',
    sub: x.vendor_name,
    amount: Number(x.amount) || 0,
    // 台帳（⑤ 販管費）とまったく同じ3値（`is_provisional` は migration 268 で追加済み）
    badge: settlementState(x.is_provisional, x.settlement_number),
    settlementUrl: x.settlement_url,
    // 押す＝この画面のまま詳細モーダルを開くだけ（台帳へは移動しない）
    onClick: () => onView(x),
  }));
}
