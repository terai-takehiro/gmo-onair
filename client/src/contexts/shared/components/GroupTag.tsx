/**
 * 分け合う請求（グループ請求）の印
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * グループ請求は**1つの請求を複数の案件で分け合っている**もので、
 * `revenues` には**1行だけ**あります（内訳は `revenue_allocations`）。
 * そのため一覧では:
 *
 * ・**金額はグループ全体のもの**
 * ・**出ている案件名は代表の1件でしかない**（`project_id` は最初の分け先）
 *
 * 印を出さないと、**その案件1件ぶんの満額の請求**に見えます。請求書を出す人・
 * 入金や検収を記録する人が、**分け合っていることに気づけません**
 * （レビューでの指摘。この版でこの行を一覧に出すようにしたので、同時に要る）。
 *
 * ── 置き場所が3つあるので部品にする ──────────────────────────
 *
 * ⑤ 見積・請求（`InvoiceRows`）／ ② 締め処理（`ClosingRows`）／
 * スマホの入金の確認（`MobileCollect`）。3回書くと必ず片方だけ直ります。
 */

/** 行の見出しの横に置く小さな札。**グループでなければ何も描かない** */
export function GroupTag({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <span
      className="rounded-badge-xs ml-1.5 inline-flex h-[18px] shrink-0 items-center bg-info-surface px-1.5 text-note font-bold text-primary align-middle"
      title={`${name} で分け合う請求です。金額はグループ全体のもので、出ている案件名は代表の1件です`}
    >
      分け合う
    </span>
  );
}

/**
 * 行の2行目に足す説明。**「何と分け合っているか」と「金額が全体のもの」**を
 * 両方書きます — 札だけだと、金額がこの案件のぶんだと読まれたままになります。
 */
export function groupNote(name?: string | null): string | null {
  return name ? `${name} で分け合う（金額は全体）` : null;
}
