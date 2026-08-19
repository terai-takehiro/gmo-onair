# DBスキーマのドリフト監査（2026-08-19 着手）

**経緯**: Phase 3-3-7〜9（`customers`/`vendors` テーブル削除）の migration 205 が、
`joint_events`/`joint_event_companies`（`customers` 参照）と `revenue_items.cost_vendor_id`
（`vendors` 参照）という**このリポジトリのどの migration ファイルにも存在しない**FK/列に
ぶつかって失敗した（詳細は [phase3-2-plan.md](phase3-2-plan.md) の「2026-08-19 引き継ぎメモ②」）。
これを受けて、「migration に無いのに実DB（`onair_dev`）にあるもの」を広く洗い出す監査を開始した。

## 手法

1. `npm run verify:fresh` で「migration ファイルだけから作られるあるべき姿」のDBを作る
2. `information_schema.tables` / `pg_constraint` を「あるべき姿」から取り出し、実DB
   （`onair_dev`）の同じ情報と `NOT IN` で突き合わせる SQL を組み立て、ユーザーが VPS で実行
3. 差分に出たテーブル・列について、(a) 全 migration ファイル・全ブランチの git 履歴、
   (b) アプリコード（`server/src` 全体・全クライアントアプリ）、(c) `docs/roadmap.md` /
   `docs/ia.md` / `docs/version-history.md` などの計画・設計ドキュメント、の3方向で
   参照の有無を確認

## 結果: テーブル差分 23件・FK差分 35件（2026-08-19 実行）

`only_in_dev`（migration に無いのに実DBにある）:

**テーブル23件**: `ai_action_plans` `call_sheet_blocks` `call_sheet_lanes` `call_sheets`
`external_tool_outputs` `inquiry_replies` `joint_event_companies` `joint_events`
`keep_agenda_items` `keep_meetings` `keep_theme_notes` `manual_issues` `manual_layout_items`
`manual_layouts` `manual_parts` `manuals` `project_changes` `project_comment_mentions`
`project_comments` `slack_digests` `slack_dm_settings` `user_notification_prefs`
`user_permission_changes`

**FK 35件**: 上記23テーブルに付随するFKが32件。加えて、**既に追跡済みのテーブルに乗った
未追跡の列+FK**が3件（前提として全て `git log -S --all` で全履歴を検索してもmigrationに
現れず、コード（`server/src`・全クライアント）にも参照0件と確認済み）:

| 列 | 参照先 | 備考 |
| --- | --- | --- |
| `revenue_items.cost_vendor_id` | `vendors` | ✅ 既発見・対応方針決定済み（下記「既に対応方針が決まっているもの」） |
| `misc_inquiries.promoted_project_id` | `projects` | ⚠️ 新規発見。`inview_registrations.promoted_project_id`（migration 127・追跡済み・別テーブル）とは別物 |
| `security_card_lendings.project_id` | `projects` | ⚠️ 新規発見 |

列単位（`information_schema.columns`、約1650件）の全数突き合わせは**まだ実施していない**。
上記3列はFK経由でたまたま見つかったもので、FKを持たない未追跡列が他にもある可能性は残る。

## ⚠️ 最重要の発見: これは「ゴミ」ではなく「v3.2.0ロールバックで取り残された旧機能」

`server/src/shared/db/migrations/160_ai_structured_content.sql` の冒頭コメント（1〜18行目）に
一次証拠が残っていた:

> v3.2.0 のロールバックで消えた系統の migration が git 履歴に残っており、**本番 DB には
> そちらも適用済み**（CLAUDE.md「スキーマは 159 のまま」）。そのため 137〜157 は
> **二重に使われている**:
> `137 task_work_state ↔ user_notification_prefs` / `138 estimates ↔ external_tool_outputs` /
> `139 pricing_audit ↔ promote_inquiry_and_audio_revoke` /
> `140 revenue_inspection_payment ↔ slack_digests` / `141 project_minutes ↔ finance_doc_original` /
> `142 finance_doc_handoff ↔ user_permission_changes` / `143〜157 は旧系統だけが使用`

`docs/version-history.md`（v3.2.0 のエントリ、110行目）でも直接裏付けられる:

> v3.2.0 — v3.1.5 から v2.9.250 相当の画面（UI/UX 刷新の直前）へロールバックした版。v4 の
> リニューアルに向けて UI/UX を作り直すにあたり、いったん刷新前の画面に戻した。
> **①戻したのは画面と機能で、データベースは戻していない**（マイグレーションは前方向にしか
> 進まないため、スキーマは 159 のまま）。

つまり: v2.9.251〜v3.1.5 の間に実装・**本番リリース済みだった一連の機能**を、v4 に向けた
作り直しのために v3.2.0 でいったん**画面・コードだけ**旧版（v2.9.250相当）へ巻き戻した。
migration は前方向にしか進まないため、**その機能群のテーブルはDB（本番含む）にそのまま
残り続けている**。今回見つかった23テーブルの大半は、その「コードだけ消えた」旧機能の
残骸だと考えられる（詳細な突き合わせは下表）。**dev固有の実験ゴミではなく、本番DBにも
同じ形で存在する可能性が高い**（上記コメントの「本番 DB にはそちらも適用済み」より）。

### テーブルごとの対応関係（`docs/roadmap.md` / `docs/ia.md` との突き合わせ）

| テーブル/列 | 対応する旧機能（ドキュメント上の根拠） | 判定 |
| --- | --- | --- |
| `user_notification_prefs` | 通知設定画面 (`docs/ia.md:83-84,471,693`「済 (migration 137)」) | A |
| `external_tool_outputs` | 外部ツール(翻訳/インタラクティブ/CG等)の出力ログ (`docs/ia.md:550,692`。migration番号138で対応) | A |
| `slack_digests` | Slackへの朝夕ダイジェスト送信 (v2.9.268・`docs/ia.md:81-89`) | A |
| `slack_dm_settings` | 個人DM向けのSlack通知設定（`slack_digests`と対の機能。テーブル名そのものの明記は無し） | B |
| `user_permission_changes` | 権限変更履歴 (v2.9.270・`docs/ia.md:116-145,207`。migration番号142で対応) | A |
| `misc_inquiries.promoted_project_id` | 問い合わせの「案件化」フラグ（旧migration名 `139 promote_inquiry_and_audio_revoke` から）。`inview_registrations` 側の同名列（migration 127・現行）とは別物 | A |
| `security_card_lendings.project_id` | セキュリティカード貸出の案件紐づけ（任意列・`docs/roadmap.md:485`「列を1つ足す（migration 152・任意）」） | A |
| `project_comments` | 案件のコメント (v2.9.274・`docs/ia.md:186-207`。1件=1行・本人のみ削除可・soft-delete) | A |
| `project_comment_mentions` | 案件コメントのメンション/通知先 (同上セクション) | A |
| `project_changes` | 案件の項目変更履歴 (同上・B4節) | A |
| `keep_meetings` | 隔週キープ会議記録 (v2.9.281・`docs/roadmap.md:254-289`「29章」)。⚠️ **v4現行の `event_report_kpt`（migration 185）とは別物**（名前は同じ「Keep」だが別系統） | A |
| `keep_agenda_items` | キープ会議のその回だけの議題 (同上) | A |
| `keep_theme_notes` | キープの固定6テーマへの一言メモ (同上) | A |
| `call_sheets` | 香盤表 (v2.9.283・`docs/roadmap.md:330-376`「21章」) | A |
| `call_sheet_blocks` | 香盤表の時間枠（分単位・計時LIVE連携） (同上) | A |
| `call_sheet_lanes` | 香盤表の人ごとのレーン (同上) | A |
| `manuals` | 運営マニュアル本体 (v2.9.284・`docs/roadmap.md:377-418`「22章」)。⚠️ ヘッダーメニューの
  ヘルプ「マニュアル」（`shared/CLAUDE.md`）とは無関係の別概念 | A |
| `manual_parts` | マニュアルを構成する部品12種 (同上) | A |
| `manual_layouts` | AI提案の会場レイアウト図 (`docs/roadmap.md:399` target=`manual_layouts`) | A |
| `manual_layout_items` | レイアウト図上の配置記号 (同上) | A |
| `manual_issues` | マニュアルの部品不足フラグ (同上) | A |
| `ai_action_plans` | タスク投入のAI行き先記録。`docs/roadmap.md:1103`（2026-07-29時点でまだ未解決の指摘として
  現行ドキュメントに残っている） | A・**他と性質が違う** |
| `joint_events` / `joint_event_companies` | 合同案件 (v2.9.279・`docs/roadmap.md:160-205`「32章」)。**✅ 前回セッションで
  ユーザー確認済み・DROP方針**（0行・コード参照0件、dev環境のみ確認） | A（対応方針決定済み） |
| `inquiry_replies` | 問い合わせ返信の下書き保存 (v2.9.272・`docs/ia.md:135-150`)。テーブル名そのものの明記は無し | B |

**A・Bとも「未着手の構想」ではなく「実装され一度は本番公開されていた機能」の一次証拠あり。**
`ai_action_plans` だけは事情が違う可能性がある — `docs/roadmap.md:1103` は2026-07-29の
現行の指摘（「投げたものの行き先」に AI 提案が出ない不具合）として書かれており、
v3.2.0ロールバックの巻き添えではなく**現在進行形で未完成の機能**の可能性がある。
着手前に `ai_action_plans` の行数・最終更新日時を確認し、他の22件と分けて扱うこと。

### 既に対応方針が決まっているもの

- `revenue_items.cost_vendor_id`/`cost_amount`/`is_ai_suggested`: **生きている列**
  （現行コードが読み書き中）。`vendors` → `companies` へFK張り替え＋追認migrationが必要
  （`phase3-2-plan.md` に詳細）
- `joint_events`/`joint_event_companies`: 0行・コード参照0件のためユーザー判断で**DROP**
  （`phase3-2-plan.md` に詳細）。⚠️ ただし**確認は dev 環境のみ**（本番は今回の監査で
  「本番にも同じ形で残っている」ことが判明したため、DROPを実行する前に**本番でも0行で
  あることを確認し直す**必要がある — 下記「次にやること」参照

## ⚠️ 結論: 「使われていない安全な実験ゴミ」という前提は誤り。ドロップを既定路線にしない

今回の23テーブル（`ai_action_plans` を除く）は、**実際に運用されていた業務データが
入っている可能性がある本番相当のテーブル**である。これまでの前提
（「migration にも参照コードにも無い＝安全に消してよいドリフト」）は、
`joint_events` 系のような偶然0行だったケースにしか成り立たない。GMOのDB運用ポリシー
（本番DBの直接操作は最小限・検証と本番の完全分離）に照らしても、**実データが入っている
可能性がある状態で DROP TABLE を前提に動くのは避けるべき**。

v4 リニューアルでこれらの旧機能（Slack連携・隔週キープ・香盤表・運営マニュアル・
案件コメント・通知設定・権限変更履歴等）を**作り直す計画があるかどうか**は
`docs/roadmap.md`/`docs/v4-plan.md` を見る限りこの監査だけでは判断できない
（`docs/roadmap.md` 自体が2026-07-29時点の指摘一覧であり、各章が「v4で復活させる」
「もう作らない」のどちらかを明記していない章もある）。

## 次にやること（次のセッション・VPSアクセスがある場所で）

1. ⏳ **行数確認（dev・本番の両方・着手中）**: 23テーブル全部＋未追跡列2つに対して
   行数を確認する。**このセッションはVPS・DBに到達できない**（前回までと同じ理由。
   `docs/reviews/phase3-2-plan.md`「2026-08-19 引き継ぎメモ」参照）ため、VPSアクセスが
   ある場所（ユーザー本人・実機セッション）で以下を実行して結果をこのファイルに
   追記すること。0行なら削除の心理的抵抗は下がるが、1行でもあれば「実際に使われていた
   業務記録」であり、**DROPする前にエクスポート・保存を検討する**
   （`docs/ops/db-backup-restore.md` のバックアップ手順とは別に、該当テーブルのみの
   ダンプを取っておくのが安全）

   ```bash
   # ⚠️ sh -c '...' で囲むこと（囲まないと $DATABASE_URL がVPSホスト側で展開されて空になる。
   # docs/reviews/phase3-2-plan.md の 2026-08-19 引き継ぎメモ②で実際に踏んだ落とし穴）
   cat > /tmp/row-counts.sql <<'EOSQL'
   DO $$
   DECLARE
     t TEXT;
     n BIGINT;
     tables TEXT[] := ARRAY[
       'ai_action_plans','call_sheet_blocks','call_sheet_lanes','call_sheets',
       'external_tool_outputs','inquiry_replies','joint_event_companies','joint_events',
       'keep_agenda_items','keep_meetings','keep_theme_notes','manual_issues',
       'manual_layout_items','manual_layouts','manual_parts','manuals',
       'project_changes','project_comment_mentions','project_comments',
       'slack_digests','slack_dm_settings','user_notification_prefs','user_permission_changes'
     ];
   BEGIN
     FOREACH t IN ARRAY tables LOOP
       IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
         EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
         RAISE NOTICE '% : % 行', t, n;
       ELSE
         RAISE NOTICE '% : テーブルが存在しない', t;
       END IF;
     END LOOP;
   END $$;

   -- 未追跡の列2つ（NULL以外の件数）
   DO $$
   DECLARE n BIGINT;
   BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='misc_inquiries' AND column_name='promoted_project_id') THEN
       EXECUTE 'SELECT count(*) FROM misc_inquiries WHERE promoted_project_id IS NOT NULL' INTO n;
       RAISE NOTICE 'misc_inquiries.promoted_project_id (NOT NULL) : % 行', n;
     ELSE
       RAISE NOTICE 'misc_inquiries.promoted_project_id : 列が存在しない';
     END IF;
     IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='security_card_lendings' AND column_name='project_id') THEN
       EXECUTE 'SELECT count(*) FROM security_card_lendings WHERE project_id IS NOT NULL' INTO n;
       RAISE NOTICE 'security_card_lendings.project_id (NOT NULL) : % 行', n;
     ELSE
       RAISE NOTICE 'security_card_lendings.project_id : 列が存在しない';
     END IF;
   END $$;
   EOSQL

   # dev
   docker cp /tmp/row-counts.sql gmo-onair-app_dev-1:/tmp/row-counts.sql
   docker exec gmo-onair-app_dev-1 sh -c 'psql "$DATABASE_URL" -f /tmp/row-counts.sql' 2>&1 | grep NOTICE

   # 本番（読み取り専用の SELECT のみ。書き込みは一切無い）
   docker cp /tmp/row-counts.sql gmo-onair-app_prod-1:/tmp/row-counts.sql
   docker exec gmo-onair-app_prod-1 sh -c 'psql "$DATABASE_URL" -f /tmp/row-counts.sql' 2>&1 | grep NOTICE
   ```

   `ai_action_plans` は行数に加えて最終更新日時も見る（3.と合わせて判断するため）:
   ```sql
   SELECT count(*), max(created_at), max(updated_at) FROM ai_action_plans;
   -- カラム名が違う場合は \d ai_action_plans で実際の列名を先に確認すること
   ```
2. **`joint_events`/`joint_event_companies` の本番側の再確認**: 既存のDROP判断はdevの
   0行確認のみに基づく。本番でも0行であることを確認してから migration 205 を作り直すこと
   （`phase3-2-plan.md` の該当手順を更新すること）
3. **`ai_action_plans` だけ切り分けて調査**: 他の22件と違い、現行ドキュメント
   （`docs/roadmap.md:1103`）で「今も指摘されている未解決の機能ギャップ」として言及されている。
   行数・最終書き込み日時を見て、v3.2.0ロールバックの巻き添えか、それとも本当に
   今アプリが書き込み続けている生きたテーブルかを見極める
4. **機能ごとに「作り直す/しない」をユーザーに確認**: 1・2の結果を踏まえ、各機能について
   (a) v4で作り直す予定がある→テーブルはそのまま残し、コード側の復活を別Issueにする、
   (b) v4では作らない→データをエクスポートしてから正式なDROP migrationを書く、を決める。
   一括で「全部消す」「全部残す」と決め打ちしないこと
5. **列単位の全数diff（未実施）**: `information_schema.columns` 約1650件の突き合わせが
   まだ。FKを持たない未追跡列が他にもある可能性があるため、上記1〜4が片付いたら着手する
6. `docs/reviews/phase3-2-plan.md` の「未完了: DBの技術的負債の全体監査」節はこのファイルへの
   リンクに置き換えること（重複管理を避けるため）
