-- 販管費 (sga_expenses) に「仮」フラグを追加する (仕様変更 #4・#6・#7)
--
-- ── なぜ要るか ────────────────────────────────────────────────
--
-- `purchases.is_provisional`（migration 058）は仕入だけにあり、販管費には
-- 同じ概念が無かった。仕入・販管費の申請ステータスを
-- 「仮 / 確定：未申請 / 確定：申請済」の3値に揃えるにあたり、
-- 販管費側にも同じ「仮フラグ」の列が要る（`PurchaseListPage.tsx`／
-- `SgaListPage.tsx` が共有する状態計算ロジックの入力）。
--
-- ── 既存データへの影響 ───────────────────────────────────────
--
-- 全行 `FALSE`（＝確定）で入る。**この列を新設する前の販管費は精算番号の
-- 有無で確定/未確定を判断していた**ので、過去分を「仮」に遡って立て直す
-- 根拠が無い（作り話になる — `sga_account_titles` の未設定行と同じ考え方）。
-- 今後、精算前の見込みで登録するときだけ画面から ON にする。
--
-- ── 他機能との関係 ───────────────────────────────────────────
--
-- ・`purchases.is_provisional` と同じく `BOOLEAN NOT NULL DEFAULT FALSE`
--   （「NULL＝決めていない」を使わない — 仮/確定はどちらかに必ず決まる二値で、
--   未定という第三の状態を持たせると画面のバッジ表示が3値では収まらなくなる）
-- ・ON のときは精算番号（`settlement_number`）の入力欄を無効化する
--   （まだ確定していない金額に精算番号だけ先に入る、という矛盾した状態を防ぐ・
--   `SgaDialog.tsx`／`SgaSettlementFields.tsx`）
-- ・楽楽精算/X-Point PDF取込の登録口（`xpoint.routes.ts` の
--   `POST /xpoint/files/:id/register`）・MCP の `list_sga` も、
--   仕入と同じ場所にこの列を足す（仕入は元から対応済み）
ALTER TABLE sga_expenses ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN sga_expenses.is_provisional IS
  '仮（確定前の見込み）フラグ。purchases.is_provisional と同じ意味・同じ既定値。'
  'ON の間は精算番号の入力欄を無効化する（画面側で表現・DB制約ではない）';
