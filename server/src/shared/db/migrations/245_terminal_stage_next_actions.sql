-- ============================================================
-- 245: 終わった案件の「次回アクション」を機械が閉じる
--
-- ── なぜ要るか（ユーザー報告）──────────────────────────────
-- 「失注になった案件については無条件で完了扱いにしてリストから落として欲しい」
-- 「これらがゴミとして溜まりまくっている」「すでに終わった案件等も含む」
--
-- 活動記録（`activity_logs`）そのものに完了の概念は無く、
-- 「次回アクションが済んだか」を表すのは `next_action_done_at`（migration 117）だけ。
-- ところが**案件が失注・完了しても、その案件にぶら下がった次回アクションは
-- 未対応（`next_action_done_at IS NULL`）のまま残りつづける**。
--
-- 判定式（未対応の次回アクション）は7か所に写されていて、
-- **`p.stage NOT IN ('s_completed','e_lost')` が入っているのは2か所だけ**だった:
--   入っている: ホーム「次の一手」/ 受信箱の超過（dashboard.routes.ts）、
--               MCP `list_overdue_actions`
--   入っていない: 営業活動記録の「次にやること」パネル（`/activity-logs/upcoming`）、
--               同画面の `sort=next_action` 並べ替え、MCP `list_activity_logs`
--               （`upcoming:true`。projects を JOIN すらしていない）、
--               週報の「来週期限」、顧客360°の `open_actions` 件数、
--               夜間の短文生成の待ち行列（失注案件の分にも AI 費用を払っていた）
--
-- 終わった案件の次回アクションは**もう誰もやらない**ので、これらは全部ゴミ。
-- 溜まるほど本当にやるべきものが埋もれる。
--
-- ── なぜ「人が押した完了」と区別するのか（列を1本足す理由）─────
-- `next_action_done_at` に日時を入れるだけでは、人が「完了」を押したものと
-- 機械が閉じたものが**見分けられなくなる**。区別できないと2つ困る:
--   ① 画面に嘘が出る。人が片づけていないのに「対応済み」と出てしまう。
--      理由を持っておけば「失注により終了」と**正直に**書ける。
--   ② 案件が失注から戻ったとき（失注は可逆・ステージ帯から戻せる）に、
--      **機械が閉じたものだけを開き直せない**。理由が無いと、人が自分の判断で
--      「済み」にしたものまで勝手に開き直すことになる（勝手に増えるやることは、
--      勝手に消えるやること以上に信用を失う）。
--
-- 値は2つだけ:
--   'project_lost'      … 案件が失注（`e_lost`）に入ったので閉じた
--   'project_completed' … 案件が完了（`s_completed`）に入ったので閉じた
--   NULL                … 人が「完了」を押した、または まだ未対応
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS next_action_auto_closed_reason TEXT;

-- ── 既に溜まっているゴミを一括で閉じる ─────────────────────
-- **これは 244（既存行を1つも書き換えない）とは逆の判断**で、意図的にそうしている。
-- 244 の印は「あとから人が1件ずつ確かめる」ためのもので、遡って付けると確認待ちが
-- 大量に積まれてしまう。こちらは逆に**「もう誰もやらないものを視界から外す」**のが
-- 目的で、既存の分を閉じないと報告された「溜まりまくっている」状態がそのまま残る。
-- 可逆（案件を戻せば開き直る）で、記録そのものは1行も消さない。
--
-- 閉じた日時は**案件が失注した日（`lost_at`）**を第一候補にする。
-- 「いつ意味を失ったか」は失注した瞬間であって、この migration を流した瞬間ではない。
-- `lost_at` は migration 242 で TEXT → timestamptz に直っているのでそのまま入る
-- （TEXT のままなら `NULLIF(...,'')::timestamptz` が要るところだった）。
-- 完了（`s_completed`）側には対応する日時列が無い（`won_at` は受注日で別物）ため
-- `NOW()` に落とす — 「いつ閉じたか」が多少ずれても、閉じた事実と理由が
-- 残っていれば開き直しにも画面表示にも困らない。
UPDATE activity_logs a
   SET next_action_done_at = COALESCE(p.lost_at, NOW()),
       next_action_auto_closed_reason = CASE p.stage
         WHEN 'e_lost' THEN 'project_lost'
         ELSE 'project_completed'
       END,
       updated_at = NOW()
  FROM projects p
 WHERE p.id = a.project_id
   AND p.stage IN ('e_lost', 's_completed')
   AND a.next_action IS NOT NULL
   AND a.next_action_done_at IS NULL
   AND a.deleted_at IS NULL;

-- ── 索引 ────────────────────────────────────────────────────
-- 「未対応の次回アクション」は7か所から引かれる（画面・週報・MCP・夜間ジョブ）。
-- 未対応は全体のごく一部なので**部分索引**が効く（済んだ行・消した行は入らない）。
-- 並べ替えはどの口も `next_action_date ASC` なので、その列を先頭に置く。
CREATE INDEX IF NOT EXISTS idx_activity_logs_next_action_open
  ON activity_logs(next_action_date)
  WHERE deleted_at IS NULL
    AND next_action IS NOT NULL
    AND next_action_date IS NOT NULL
    AND next_action_done_at IS NULL;

-- 案件が終了ステージから戻ったときに「機械が閉じた行」だけを開き直すための索引。
-- 案件1件ぶんしか引かないので `project_id` 先頭で足りる。
CREATE INDEX IF NOT EXISTS idx_activity_logs_auto_closed
  ON activity_logs(project_id)
  WHERE deleted_at IS NULL AND next_action_auto_closed_reason IS NOT NULL;
