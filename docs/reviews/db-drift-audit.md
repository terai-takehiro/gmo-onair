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
   (b) アプリコード（`server/src` 全体・全クライアントアプリ）、(c) `docs/archive/2026/roadmap.md` /
   `docs/archive/2026/ia-v2.9-rail-era.md` / `docs/version-history.md` などの計画・設計ドキュメント、の3方向で
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

### ✅ 2026-08-19 続報: GitHubのコミット検索で実物の実装コミットが見つかり、上記が事実として確定した

`git log -S --all`（ローカルクローン）では見つからなかったが、**GitHub側のコミット検索
（全リポジトリのコミットを対象。ローカルの浅いクローン/枝構成に依存しない）で実装コミットが
見つかった**:

- `692fda1e9d1d1f4a0836cd7b7820eae3a6193640` — **v2.9.284**「運営マニュアルを新設
  (部品12種を作って束ねる) + 会場図のAI下書きを5条件つきで実装」（2026-07-26 12:27 UTC）。
  コミットメッセージに明記: 「**migration 150: manuals / manual_parts / manual_layouts /
  manual_layout_items / manual_issues**」「部品12種の定義はコードに置く」「配置図は記号が
  人・物を指し、位置は0〜1000の相対」——**今回devで見つかった実データの構造と完全に一致**
- `643867047b460d692d5c4eb6415cc7009f8877e4` — **v2.9.283**「香盤表を新設」
  （2026-07-26 11:48 UTC）。「**migration 149: call_sheets / call_sheet_lanes /
  call_sheet_blocks**」

⚠️ **ただしこの2コミットは現在の `main` の祖先ではない**（`git merge-base --is-ancestor
692fda1e... origin/main` で確認 = 祖先ではない、GitHub側では取得できるがローカルの
浅い履歴には無かった）。別のコミット（ブランチ整理スクリプトの修正 `62c63ee8`）が
理由を直接説明している:

> v3.2.0 で v3.1.5 からロールバックしたため、dev (=v3.1.5) は main の祖先ではなく
> 「別の枝の先端」になっている

つまり **v3.2.0 は「戻すコミットを積む」revert ではなく、`main` の指す先そのものを
古い状態（v2.9.250相当）へ付け替える形で行われた**。これにより v2.9.251〜v3.1.5 の間の
開発（v2.9.283/284 を含む）は `main` の履歴から外れ、`dev`/`release/v3` ブランチ側にだけ
残る形になった（上記の同コミットが「dev を消してよいか」を検討している対象そのもの）。
移行時に migration の**採番だけ**が新旧で衝突し（137〜157が二重）、DBはロールバックされない
（前方向にしか進まない）ため、**テーブルの「形」だけが取り残された**。

**これで「テーブル23件のうち少なくとも `manuals`/`manual_parts`/`manual_layouts`/
`manual_layout_items`/`manual_issues`（migration 150）・`call_sheets`/`call_sheet_lanes`/
`call_sheet_blocks`（migration 149）の8件は、実装内容・実データの両方が実在の商用機能
（v2.9.283/284・本番公開済み）だったことが実装コミットで確定した。** 推測ではない。

### テーブルごとの対応関係（`docs/archive/2026/roadmap.md` / `docs/archive/2026/ia-v2.9-rail-era.md` との突き合わせ）

| テーブル/列 | 対応する旧機能（ドキュメント上の根拠） | 判定 |
| --- | --- | --- |
| `user_notification_prefs` | 通知設定画面 (`docs/archive/2026/ia-v2.9-rail-era.md:83-84,471,693`「済 (migration 137)」) | A |
| `external_tool_outputs` | 外部ツール(翻訳/インタラクティブ/CG等)の出力ログ (`docs/archive/2026/ia-v2.9-rail-era.md:550,692`。migration番号138で対応) | A |
| `slack_digests` | Slackへの朝夕ダイジェスト送信 (v2.9.268・`docs/archive/2026/ia-v2.9-rail-era.md:81-89`) | A |
| `slack_dm_settings` | 個人DM向けのSlack通知設定（`slack_digests`と対の機能。テーブル名そのものの明記は無し） | B |
| `user_permission_changes` | 権限変更履歴 (v2.9.270・`docs/archive/2026/ia-v2.9-rail-era.md:116-145,207`。migration番号142で対応) | A |
| `misc_inquiries.promoted_project_id` | 問い合わせの「案件化」フラグ（旧migration名 `139 promote_inquiry_and_audio_revoke` から）。`inview_registrations` 側の同名列（migration 127・現行）とは別物 | A |
| `security_card_lendings.project_id` | セキュリティカード貸出の案件紐づけ（任意列・`docs/archive/2026/roadmap.md:485`「列を1つ足す（migration 152・任意）」） | A |
| `project_comments` | 案件のコメント (v2.9.274・`docs/archive/2026/ia-v2.9-rail-era.md:186-207`。1件=1行・本人のみ削除可・soft-delete) | A |
| `project_comment_mentions` | 案件コメントのメンション/通知先 (同上セクション) | A |
| `project_changes` | 案件の項目変更履歴 (同上・B4節) | A |
| `keep_meetings` | 隔週キープ会議記録 (v2.9.281・`docs/archive/2026/roadmap.md:254-289`「29章」)。⚠️ **v4現行の `event_report_kpt`（migration 185）とは別物**（名前は同じ「Keep」だが別系統） | A |
| `keep_agenda_items` | キープ会議のその回だけの議題 (同上) | A |
| `keep_theme_notes` | キープの固定6テーマへの一言メモ (同上) | A |
| `call_sheets` | 香盤表 (v2.9.283・`docs/archive/2026/roadmap.md:330-376`「21章」) | A |
| `call_sheet_blocks` | 香盤表の時間枠（分単位・計時LIVE連携） (同上) | A |
| `call_sheet_lanes` | 香盤表の人ごとのレーン (同上) | A |
| `manuals` | 運営マニュアル本体 (v2.9.284・`docs/archive/2026/roadmap.md:377-418`「22章」)。⚠️ ヘッダーメニューの
  ヘルプ「マニュアル」（`shared/CLAUDE.md`）とは無関係の別概念 | A |
| `manual_parts` | マニュアルを構成する部品12種 (同上) | A |
| `manual_layouts` | AI提案の会場レイアウト図 (`docs/archive/2026/roadmap.md:399` target=`manual_layouts`) | A |
| `manual_layout_items` | レイアウト図上の配置記号 (同上) | A |
| `manual_issues` | マニュアルの部品不足フラグ (同上) | A |
| `ai_action_plans` | タスク投入のAI行き先記録。`docs/archive/2026/roadmap.md:1103`（2026-07-29時点でまだ未解決の指摘として
  現行ドキュメントに残っている） | A・**他と性質が違う** |
| `joint_events` / `joint_event_companies` | 合同案件 (v2.9.279・`docs/archive/2026/roadmap.md:160-205`「32章」)。**✅ 前回セッションで
  ユーザー確認済み・DROP方針**（0行・コード参照0件、dev環境のみ確認） | A（対応方針決定済み） |
| `inquiry_replies` | 問い合わせ返信の下書き保存 (v2.9.272・`docs/archive/2026/ia-v2.9-rail-era.md:135-150`)。テーブル名そのものの明記は無し | B |

**A・Bとも「未着手の構想」ではなく「実装され一度は本番公開されていた機能」の一次証拠あり。**
`ai_action_plans` だけは事情が違う可能性がある — `docs/archive/2026/roadmap.md:1103` は2026-07-29の
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
`docs/archive/2026/roadmap.md`/`docs/v4-plan.md` を見る限りこの監査だけでは判断できない
（`docs/archive/2026/roadmap.md` 自体が2026-07-29時点の指摘一覧であり、各章が「v4で復活させる」
「もう作らない」のどちらかを明記していない章もある）。

## 次にやること（次のセッション・VPSアクセスがある場所で）

1. ✅ **行数確認（dev・本番の両方・2026-08-19 完了）**: ユーザーがVPSで実行。
   **dev・本番で結果が完全に一致**（23テーブル中18テーブル＋未追跡列2つは**dev・本番とも0行**。
   残る5テーブルは**dev・本番ともまったく同じ行数**）:

   | テーブル | dev | 本番 |
   | --- | --- | --- |
   | `manual_layouts` | 1 | 1 |
   | `manual_parts` | 12 | 12 |
   | `manuals` | 1 | 1 |
   | `project_changes` | 16 | 16 |
   | `slack_dm_settings` | 1 | 1 |
   | （上記以外の18テーブル＋列2つ） | 0 | 0 |

   ⚠️ **dev・本番で1件たりとも食い違わず一致している**のは、この `onair_dev` が
   検証専用にシードで作られたものではなく、**v3.2.0ロールバック当時から本番と同じ
   実データを持ち続けている（＝一度も作り直されていない）ことを示唆する**。

   ✅ **2026-08-19 続報: 中身も確認済み。** 実装コミット（上記「GitHubのコミット検索で
   実物の実装コミットが見つかり…」節）と完全に一致する内容だった:

   - `manuals`（1件）: `title`="GMOパートナーズ・カンファレンス 2026_3Q 運営マニュアル"、
     `project_id`=`7b812d03-3177-47ae-b51d-ab71d2389904`、
     `created_at`/`updated_at`=2026-07-27 09:57、`created_by`/`updated_by`=
     `6022c743-5dbd-4995-bd9d-9483b69ea97e`。**v2.9.284（2026-07-26 12:27公開）の
     翌日に、実際のアプリ操作で作られた実データ**（マニュアル新設機能が本番で
     稼働していた短い期間の実利用の跡と考えられる）。⚠️ **`project_id` が指す案件が
     今も `projects` テーブルに実在するか、`created_by` のユーザーが誰かは未確認**
     （下記「次にやること」参照）
   - `manual_layouts`（1件）: 上記マニュアルに紐づくレイアウト図1件。`scene`="performance"、
     `floor_plan_box_file_id`・`ai_output_id`とも空。中身（配置記号）は無い状態
   - `manual_parts`（12件）: すべて上記マニュアル1冊に属し、`kind`は
     cover/contacts/staff/call_sheet/rundown/venue_map/layout/set/awardees/
     technical/catering/emergency の12種、`content`は全件 `{}`（空）、`ready`=false、
     `ai_drafted`=false、`updated_at`は2026-07-27 09:57:33の数秒間隔で12件連続作成。
     **マニュアル作成時に自動で12個の空スケルトンを生成する仕様どおりの挙動**
     （v2.9.284のコミットメッセージ「部品12種の定義はコードに置く」と一致）。
     中身が入力される前の状態のまま残っている＝**マスタ値ではなく、1冊の未完成の
     空スケルトン**（前回の「固定マスタ値の可能性」という見立ては誤りだった。訂正）
   - `slack_dm_settings`（1件）: `id`='t'（単一のグローバル設定行、ユーザー個別ではない）。
     `send_time`=06:00、`weekdays`=1,2,3,4,5（平日）、`enabled`=true、
     `last_sent_at`=NULL（**一度も送信されたことがない**）、`updated_at`=2026-07-27 09:04。
     設定だけ有効化されて、実際に送信が走る前に機能自体が無くなった状態
   - `project_changes`（16件）: ✅ **確認済み・重要**。`project_id`/`actor_id`/
     `actor_name`/`field`/`before_value`/`after_value`/`changed_at` を持つ、
     **実在する案件に対する実際のステージ変更・項目変更の記録**。日付は
     **2026-07-28〜2026-08-01**（`manuals`より後、かつ約1週間にわたって書き込みが
     続いている＝v2.9.284公開直後の一瞬だけでなく、この機能自体がしばらく実働
     していたことを示す）。`actor_name` は寺井 赳博・長野 耀聖・掛田 秀悟の
     **実在するスタッフ名**。`field`=`stage`（受注/失注/仮押さえ等のステージ変更）・
     `project_type`・`name`・`gls_number`・`gls_category` の変更が記録され、
     案件名には実在の取引先名（株式会社レイ・マックロータス株式会社・TBS番組名等）が
     含まれる。**これはテストデータではなく、実際の営業活動の履歴**である可能性が高い

   ✅ **manualsの`project_id`が指す案件は今も`projects`テーブルに実在する**
   （`GMOパートナーズ・カンファレンス 2026_3Q`）。✅ **作成者
   `6022c743-5dbd-4995-bd9d-9483b69ea97e` は「寺井 赳博」
   （`terai-takehiro@gmo-globalstudio.com`）＝おそらくこのリポジトリのユーザー本人**。

   ⚠️ **結論の更新**: `project_changes`（16件）は実在する案件・実在する担当者による
   **本物の営業活動の変更履歴**であり、`manuals`/`manual_layouts`/`manual_parts`も
   実在する案件に紐づく実データである。**この5テーブルを機械的にDROPすると、
   実際にあった業務記録が失われる。** 単なる「v3.2.0ロールバックの巻き添えで
   忘れられた空のテーブル」ではなく、**短期間ではあるが実際に運用されていた
   機能の記録**として扱うべき。`docs/archive/2026/2026-07-26-design-change-request.md`
   の実装順番表（4番目「21・22 香盤表・運営マニュアル」）にはまだ状態欄が
   空のままで、**v4でこれらの機能を作り直すこと自体は既に合意済みの計画**でもある
   ——つまりテーブルを消すかどうかだけでなく、「いずれこの機能をv4で復活させる
   のであれば、このデータを引き継ぎたいか」もあわせて判断が必要

   `ai_action_plans` はユーザーが `\d ai_action_plans` で列構成も確認済み
   （`id`/`raw_text`/`kind`(freeform/minutes/mail/chat/other)/`status`
   (pending/executed/discarded)/`summary`/`actions`(jsonb)/`results`(jsonb)/
   `ai_output_id`/`created_by`/`executed_at`/`discarded_at`/`deleted_at`（soft-delete）/
   タイムスタンプ、+ 専用インデックス2本・CHECK制約2本）。**設計がかなり作り込まれている
   にもかかわらず dev・本番とも0行＝一度も書き込まれたことがない**。これは他の22件
   （v3.2.0ロールバックの巻き添え＝一度は使われて後に見捨てられた）とは性質が違い、
   **`docs/archive/2026/roadmap.md:1103` の指摘（「投げたものの行き先」にAI提案が出ない）どおり、
   書き込み側の実装が最初から欠けている未完成機能**だと分かる。0行なのでDROPしても
   データ損失は無いが、**設計はそのまま活かせる状態**でもある（下記4で機能ごとの
   判断に含める）。

   （以下、実行に使ったSQL・コマンドは記録として残す）

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
2. ✅ **`joint_events`/`joint_event_companies` の本番側の再確認（2026-08-19 完了）**:
   上記1の結果に含まれる — **本番でも0行**。既存のDROP判断（dev 0行＋コード参照0件）は
   本番側でも裏付けられた。`phase3-2-plan.md` の migration 205 やり直し手順はそのまま
   進めてよい
3. ✅ **`ai_action_plans` の切り分け（2026-08-19 完了）**: 上記1に統合。dev・本番とも
   0行＝書き込み側の実装が欠けている未完成機能と判明（v3.2.0ロールバックの巻き添えとは
   性質が違う）
4. ✅ **中身の確認（2026-08-19 完了）**: 5テーブルすべての中身を確認。詳細は上記
   「行数確認」の結果に統合済み（`manuals`は実在の案件「GMOパートナーズ・カンファレンス
   2026_3Q」に紐づく実データ、`project_changes`は2026-07-28〜08-01の実在スタッフによる
   実案件のステージ変更履歴）
5. ✅ **ユーザー判断（2026-08-19 完了・重要）**: ユーザー（寺井氏）に「v4の現在ある
   ページに関わるDBではない」ことを確認したうえで、**23テーブル全部＋未追跡列2つ
   （`misc_inquiries.promoted_project_id`・`security_card_lendings.project_id`）の
   削除を明示的に承認**（「こちらは抹殺して大丈夫です」2026-08-19）。実データが
   入っていた5テーブル（`manuals`/`manual_layouts`/`manual_parts`/`project_changes`/
   `slack_dm_settings`）についても、内容を提示したうえでの判断。v4でこれらの機能
   （21・22章 香盤表・運営マニュアル等）を将来作り直す場合も、**このデータを
   引き継ぐ前提には立たない**（作り直すときは新規に作る）ことになった。
6. ✅ **migration 206 を作成・検証済み（2026-08-19 完了）**:
   `server/src/shared/db/migrations/206_drop_untracked_drift_tables.sql`。
   23テーブル（子→親の順・`CASCADE`は使わず想定外の依存があれば明示的にエラーに
   なる形）＋未追跡列2つを削除する。**このセッションの検証用Postgres
   （`npm run verify:fresh`。ローカルの PostgreSQL 16、VPS/本番とは無関係）で
   2通り検証済み**:
   - 今回のドリフト状態を手動で再現（23テーブル+2列を注入）したDBに対して実行 →
     FK違反なく全23 DROP + 2 ALTER が成功、対象が0件になったことを確認
   - 何も注入していない完全に新規のDB（`verify:fresh`）に対して実行 →
     `IF EXISTS` によりエラーなくスキップされることを確認（CI・新規環境でも安全）
   - あわせて `npm run typecheck`（9ワークスペース exit 0）・`npm run test`
     （1135件 all pass）・`npm run lint`（0 errors）を実行し、削除対象を
     参照しているコードが無いことを再確認

   ⚠️ **本番・実際の検証環境（dev.gmo-onair.jp）に対する実行は未実施**
   （このセッションはVPS/実DBに到達できない）。`main`にマージされ次第
   検証環境（dev.gmo-onair.jp）に自動デプロイされる。本番へは
   ユーザーが「本番に入れて」と明示するまで反映されない（`CLAUDE.md`の
   環境分離ポリシーどおり）

   **実行前の推奨（任意・ユーザー判断）**: 消える5テーブルの中身だけ軽くSQLダンプで
   残しておく場合は以下（VPSで実行。読み取りのみ・安全）:
   ```bash
   docker exec gmo-onair-app_dev-1 sh -c \
     'pg_dump "$DATABASE_URL" -t manuals -t manual_layouts -t manual_parts \
       -t project_changes -t slack_dm_settings --data-only' \
     > drift-tables-backup-$(date +%Y%m%d).sql
   ```
7. **列単位の全数diff（未実施）**: `information_schema.columns` 約1650件の突き合わせが
   まだ。FKを持たない未追跡列が他にもある可能性があるため、上記6のPRがマージ・
   デプロイされたあとで着手する
8. `docs/reviews/phase3-2-plan.md` の「未完了: DBの技術的負債の全体監査」節はこのファイルへの
   リンクに置き換えること（重複管理を避けるため）
