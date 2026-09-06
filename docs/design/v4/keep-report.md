# 隔週キープの数字と資料ビルダー — ロジックの正（2026-09-06）

隔週で行っている業績報告・稟議の資料（Box `00_スタジオ内部/02_MTG資料/02_隔週 橋口社長キープ/`）のうち、
**業績報告の数値部分**を ONAiR に集約し、①BI として見る ②PowerPoint を半自動で組む
③Slack・パワポの定例報告を bot 化するための元データ（JSON）を持つ、ための決めごと。

> 絵は [`mockups/keep-report/`](mockups/keep-report/README.md)
> （公開: https://claude.ai/code/artifact/26a5d2e5-87c9-4bb9-a597-9c1631438651 ）。
> JSON の型は [`shared/src/keepReport/types.ts`](../../../shared/src/keepReport/types.ts)。
> 画面・サーバーは 2026-09-06 に実装済み（状況は §11.1）。

---

## 0. ゴール

> **土台は 2026年10月の事業再編の実装**（[reorg-2026-10-plan.md](../../reorg-2026-10-plan.md)・main の migration 282〜290・2026-09-06 に合流）。
> 計上会社 `entity_code`（GJV／GSS／GMO）・`legal_entities`・`org_transition`・帳簿の行の `entity_code` は **main のものをそのまま読む**。
> このブランチが先に持っていた独自の「事業主体」（`projects.entity` ＝ gss／gscs／gig）は合流時に廃止し、語も main の「計上会社」に揃えた（§4・§8）。

| ゴール | この設計での答え |
|---|---|
| BI ツールによるデータの可視化 | ウィークリー活動報告に「隔週キープの数字」タブを足し、資料と同じ切り口（着地表・見込表・推移・ヨミ表・カレンダー・実施報告・内覧会）で **いまの数字** を見せる。週報を確定した時点で凍結する |
| データを自動集約したうえで、パワポ資料を半自動生成（最後は人が確認・可変） | 会議1回ぶんの数字を **定例報告パック（JSON）** 1本に集め、資料ビルダーが **前回の構成** から自動で組む。人はページの並べ替え・注記・写真・概要だけ直し、直した所は次回の初期値になる。出力は `.pptx`（表・グラフは PowerPoint のオブジェクト＝あとから直せる） |
| bot 化の下準備 | パックは MCP `get_keep_report_pack` でも読める。Slack の定例投稿・pptx の自動生成はどちらも **パックを読むだけ** にし、人の直しは構成側に持つ |

---

## 1. 資料の解析（260904 v2 ／ 260813 v2）

2026/9/4 開催分（36ページ＋Appendix）と 8/13 開催分（89ページ）を読んだ。**構成は毎回同じ**で、
GMO流会議フォーマット Ver.2.5 の固定ページ（0〜11）の間に、業績報告①〜③と施設・課題の報告④〜⑦が挟まる。

### 1.1 ページの並びと、数値の出どころ

| # | ページ | 載っているもの | いまの作り方 | ONAiR の出どころ |
|---|---|---|---|---|
| 1〜12 | 表紙・チェックリスト・スローガン・情報サマリ・組織図・参加者・前回議事録サマリ・ToDo・全体スケジュール・KPIツリー・進捗状況・アジェンダ | 会議フォーマットの固定ページ | 前回の資料を写して赤字で直す | 前回議事録サマリの数字（「7月営利 ▲35,972千円（対目85.0%）」）と 9. 進捗状況のグラフだけ数字 |
| 13 | ①数値報告 **当月 着地** | 売上高・原価（案件仕入）・粗利・販管費・償却相当額・営業利益 × 目標／着地／判定／対目標比／対目標（千円） | Excel の手作り表を貼る | `getMonthlyPl`（`monthly_budgets` ＋ 確定売上・仕入・販管費 ＋ `monthly_actual_overrides`） |
| 14 | ①数値報告 **翌月 着地見込** | 同上（見通し） | 同上 | 同上 ＋ 受注前案件の確度加味（`pipeline-forecast`） |
| 15 | ①ヨミ表 | 案件／お客様・ステージ・実施日・見積金額・次のタスク・最後の動き | **ONAiR の案件一覧のスクリーンショット** | `projects` ＋ 最新見積 ＋ 次のやること |
| 16〜23 | 案件ページ ①〜⑧ | 帯（お客様／イベント名／日付）・確度の文字（B 正式申込待／C 提案済／E 問い合わせ）・写真・概要3行・進行表・チェック／リハ／本番・経路・売上／粗利（円・粗利率） | 手作り | 案件・見積・カレンダー・Box `08_写真`・Qシート |
| 24 | 稼働カレンダー 当月・翌月 | 本番／リハ／仮／メンテ／内覧 の予定と稼働率（9月 42.1%・10月 36.1%） | **ONAiR のカレンダーのスクリーンショット** | `studio_bookings` |
| 25〜27 | ②案件実施報告 ①〜③ | 帯・写真・成果の箇条書き・売上／粗利。グループ内案件はコスト内訳と「グループ内原価」 | 手作り | `event_reports`（ふりかえり）＋ 確定売上・仕入 |
| 28 | ③新規案件獲得（定期内覧会） | 開催日・参加 50組 65名・満足度 3.9/4.0・分類別の表・メディア取材 | 手作り | 内覧会の受付（満足度は Kairos3 のアンケート＝ONAiR に無い） |
| 29〜32 | ④〜⑦ 施設・課題の報告 | 写真と文 | 手作り | 無し（手で書く） |
| 33 | 11. ToDo＆次回開催日 | 今日の ToDo・次回開催日 | 手作り | `meeting_minutes.next_meeting_date` |
| 34〜 | Appendix | 過去のスケジュール・稟議（渋谷・用賀の構築費、P/L・B/S）・技術内製化・Web 進捗 | 前回の資料を残す | Web 進捗（GA・Kairos3）は ONAiR に無い |

**9/4 版はすでに2枚が ONAiR のスクリーンショット**（ヨミ表・稼働カレンダー）。この機能はそれを
「貼る」から「ONAiR が組む」に変える。

### 1.2 数値ページの構造（BI で再現するもの）

- **数値報告の表**（p.13/14）。行は 9/4 版が 6行（売上高・原価（案件仕入）・粗利・販管費・償却相当額・営業利益）、
  8/13 版が 7行（売上高・原価・固定原価（償却費用）・変動原価（仕入）・売上総利益・販管費・営業利益）。
  **どちらも `getMonthlyPl` の返す5項目（revenue / cogs_fixed / cogs_variable / sga / operating_profit）から作れる。**
  9/4 版の「粗利」は 売上 − 変動原価（＝限界利益）、「営業利益」は 粗利 − 販管費 − 償却相当額。
  検算: 539 − 21,834 − 18,539 = −39,834 ✓、目標 17,700 − 26,427 − 19,727 = −28,454 ✓
- **判定**: 売上・粗利・営業利益は 実績 ≧ 目標 で○、原価・販管費・償却は 実績 ≦ 目標 で○（`getMonthlyPl` と同じ）
- **対目標比**: 通常は 実績 ÷ 目標。**目標が赤字の行は資料ごとに式が違う** —
  9/4 版は `1 − 不足額 ÷ |目標|`（60.0% = 1 − 11,380/28,454）、8/13 版は `目標 ÷ 見通し`（85.0% = 30,584/35,972）。
  さらに **8/13 版の 8月見通しは対目標比が 7月表のコピーのまま**（1,060/21,000 = 5.0% のところ 27.8%）で、
  販管費の対目標 −4,593 も 7月値の写し。**手計算・手コピーで維持されているので、BI では判定・比率・差を必ず計算列にする**（§5.3）
- **9. 進捗状況のグラフ**: 左「売上高と稼働件数（2024/1〜）」＝ グループ内イベント／外部顧客イベントの積み上げ棒（千円）と案件数（件）、
  右「スタジオ稼働率の推移（2025/1〜）」＝ 稼働日数（棒）と稼働率（線）。吹き出しで当月の値（8月 売上高 ¥1,762,293・案件数 2件・稼働率 46.7%）
- **ヨミ表**: 8/13 版は手作り（フェーズ A/B/C/D/ネタ/没・売上/粗利を万で丸め・大区分・担当・ステータス・新規/更新の印）、
  9/4 版は ONAiR の案件一覧そのもの。**「サムライ関連」は別表**（相手が サムライパートナーズ／GMOサムライコンテンツスタジオ）
- **案件ページの確度の文字**: E 問い合わせ ／ C 提案済 ／ B 正式申込待 ／ A。資料ではこの語を使い、ONAiR の画面はステージ名（口頭決定など）のまま。v4.5.25 の受注確度の語彙
  （E問い合わせ 10%／D要件確認 25%／C見積・提案 50%／B決定見込み 80%／A受注済 100%）と同じ並びなので、ステージから引ける
- **稼働率**: 9月 42.1% は 8日 ÷ 19営業日 と読める。10月 36.1% はどの整数の組でも合わない（半日か部屋数を掛けている）。
  **定義を設定に出す**（§5.4）

### 1.3 10月からの会社分割

p.37「審議事項の要約」: サムライパートナーズ 49.9% ＋ GMO-IG 50.1% → **GMOサムライコンテンツスタジオ**（合弁）→ 100% →
**GMOサムライスタジオ**（旧 GMOグローバルスタジオ。設備は GMO-IG が所有し、家賃・設備利用料 月1,000万円）。
これに **GMOインターネットグループ人格として行うもの**（GMO Yours・第1本社の会場・グループ内イベント）が加わる。
資料のヨミ表にはすでに「インテリジェンス／GMOサムライコンテンツスタジオ株式会社」が **お客様として** 載っている。

---

## 2. 既にあるもの（作り直さない）

隔週キープ資料のサーバー層は **migration 129（2026-07-16 の要件書）で入っていて、v4 で画面だけ削除**されている
（[client-v4-build-log.md](../../reviews/client-v4-build-log.md) の「報告資料（`/sales/keep-report`）を削除した回」）。

| あるもの | 場所 | この設計での使い方 |
|---|---|---|
| 月次予算 `monthly_budgets`・経理の補正 `monthly_actual_overrides` | migration 129 / `keep-report.service.ts` | 目標と着地の元。**入力画面が無くなっている**ので「お金のルール」に戻す（§8） |
| `getMonthlyPl(ym)`（目標／実績／差／比／判定） | `keep-report.service.ts:289` | 着地表の計算。赤字行の比率だけ式を変える（§5.3） |
| `getMonthlySummary` / `dashboard` の月次推移 | `finance/services` | 推移グラフ。お客様区分（`projects.customer_type`）で分けて積む |
| 営業見通し `getPipelineForecast` ＋ `project_stage_probabilities` | v4.5.25 | 見込表の「確定＋確度加味」とヨミ表の期待値 |
| ふりかえり `event_reports`（総括・写真・来場者）＋ KPT | migration 129 / 185、`ReviewTab.tsx` | 案件実施報告のページ。**写真の正は案件 Box の `08_写真`**（§7） |
| `listEventReports` / `listEventReportCandidates` | `keep-report.service.ts:84,123` | 「前回の会議以降に本番を終えた案件」と「ふりかえり未記入」 |
| 議事録 `meeting_minutes` | migration 129 | 前回議事録サマリ・次回開催日 |
| 週報 `ops_reports`（`kind`・`period_key`・`payload`・確定で凍結） | migration 118 | 置き場所。`payload.keep` に凍結したパックの id を持つ |
| 週の自動集計 `getWeeklyStats` | `weekly-stats.service.ts` | そのまま（週の切り口）。⚠ 売上の集計が `status='confirmed'` を見ていないので、隔週の数字とは別に扱い、混ぜない |
| 自由配置のレイアウト JSON とテンプレの「写し」モデル | `shared/src/client/live/displayLayout.ts`・migration 233 | 資料ビルダーの構成 JSON はこれと同じ考え（テンプレは読み取り専用、適用は写し） |
| Box の口 `uploadToFolder` / `08_写真` | `shared/services/box.ts`・`box-folder.service.ts` | 出力した pptx の配置と、写真の取得 |

**無いもの**（着手時点）: pptx を書く仕組み、グラフ部品（client-daily）、ドラッグ＆ドロップ（client には `@dnd-kit` がある）。計上会社の列は main の事業再編が持ってきた（§4）。

---

## 3. 置き場所（画面）

ウィークリー活動報告（`client-daily` の `/weekly/:id`）に **タブを2つ足す**。左メニューは増やさない。

| タブ | URL | 中身 | 権限 |
|---|---|---|---|
| この週の報告 | `/weekly/:id` | いまのまま（自動集計 → AI の要約 → 週次トピックス） | `dailyops` reader／editor |
| **隔週キープの数字** | `/weekly/:id/keep` | 対象月・計上会社・お客様区分の絞り込み ＋ 着地表・見込表・推移・ヨミ表・稼働カレンダー・実施報告・内覧会。「JSON を見る」「資料をつくる」 | 読む: `dailyops` か `sales` の reader（財務の数字なので営業・経理も見る） |
| **資料をつくる** | `/weekly/:id/deck` | ページ一覧 ／ スライドのキャンバス ／ 部品。PowerPoint に出力 | `dailyops` editor。**PC 専用**（`DAILY_PC_ONLY` に理由つきで入れる） |

- **数字は「いまの数字」**（`frozen_at: null`）。週報を **確定した時点でパックを凍結**し、資料・Slack・MCP は凍結した版を読む。
  週報の「自動集計は投稿時点の数字（あとから動きません）」と同じ約束
- 資料をつくる対象の **会議日** は週報の週から引く（その週に開催日がある隔週キープ。無ければ次の開催日）。
  会議日は `meeting_minutes.next_meeting_date` から取り、無ければ人が入れる
- スマホは「隔週キープの数字」の要約だけ（4つの数字・未確定の注意・ヨミ表のカード）。資料づくりは PC
- 案件詳細のふりかえりタブ（`ReviewTab.tsx`）に **「隔週キープに載せる」** の印と「案件ページを見る」を足す
  （ヨミ表の「資料」チェックと同じ値 `keep_pick`）

---

## 4. 計上会社（10月〜）— main の `entity_code` をそのまま読む

**ご判断（2026-09-06）: グループ内のお客様のイベントは GMOサムライスタジオ、グループ外のお客様のイベントは GMOサムライコンテンツスタジオ。
収支は計上会社ごとに分けて出し、あわせて統合した全体の収支も出す。**

隔週キープはこのための独自の列を持たない。**main の 2026年10月の事業再編（[reorg-2026-10-plan.md](../../reorg-2026-10-plan.md) §4.1〜§4.5）が
入れた「計上会社」`entity_code` をそのまま読む**。画面の語も main に合わせて **「計上会社」**（副題「売上・費用をどの会社の帳簿に載せるか」）。
旧「事業主体」`projects.entity`（gss／gscs／gig）は main 合流時に廃止した。

| `entity_code` | 会社（`legal_entities`・main の migration 284） | いつその値になるか（`sales/services/entity-resolution.service.ts`・reorg §4.4） |
|---|---|---|
| `GSS` | GMOサムライスタジオ（旧 GMOグローバルスタジオ。社名変更・同じ法人） | お客様がグループ内（`companies.is_gmo_group`）。**切替前の既存の行はすべて GSS** |
| `GJV` | GMOサムライコンテンツスタジオ（合弁） | お客様がグループ外で、実施日が切替日以降 |
| `GMO` | GMOインターネットグループ本体（コストセンター・`kind='cost_center'`） | プロジェクト（旧 GLS-B）。売上は無く費用だけ |

- 値の型は [`shared/src/keepReport/types.ts`](../../../shared/src/keepReport/types.ts) の `BusinessEntity = 'GJV' | 'GSS' | 'GMO'`
  （＝ server の `LegalEntityCode`）。表示名 `BUSINESS_ENTITY_LABELS` は `legal_entities.name` から「株式会社」を落としたもの
  （`shared/tests/keepReportEntity.test.ts` が seed と型の文面を突き合わせる。server は `shared/` を import できないので型では結べない）
- **決め方は shared に写さない。** 規則（実施日 ≧ 切替日／取引先の `is_gmo_group`／GLS-B → GMO）と人の上書き
  （`entity_source='manual'`・理由必須・`sales:manager`）は main の `entity-resolution.service.ts` と案件詳細が持つ。
  隔週キープはサーバーが保存した `entity_code` を読むだけで、お客様の区分から自分で導かない（写しを持つと切替日の前後で必ず食い違う）
- **`org_transition.state = 'off'` のあいだは規則が効かず、全行が GSS。** 計上会社別の表は GJV の列が空（目標 null・実績 0）で出る。
  切替（`cutover`）のあとに登録・改番された案件から GJV／GMO の数字が入り始め、そこから「計上会社別」が意味を持つ
- **収支は計上会社別 ＋ 全体（統合）**。数値報告の表は「全体」「GMOサムライスタジオ」「GMOサムライコンテンツスタジオ」の3組
  （`GMO` は数字があるときだけ）。画面のチップ・表は GSS を先に置く（切替前は全行 GSS）
- 売上・原価・販管費・償却相当額は **帳簿の行の `entity_code`** で分ける（reorg §4.5「行は書いた時の計上会社を持つ」。
  案件の `entity_code` で GROUP BY するのではない — 案件を改番・移管しても過去の行は前の会社に残る）。
  `FIXED-COGS` の仕入（償却相当額）・経理の補正値（`monthly_actual_overrides`）も行の `entity_code`
- **「全体（統合）」は3社の行の単純合計**。2社間の社内取引（GSS→GJV の売上と GJV の仕入・reorg §4.12）は相殺しないので、
  発生した月は売上と原価が同じ額だけ両建てでふくらむ（粗利・営業利益は変わらない）。相殺した連結が要るなら別の設計（reorg §4.6・§9-F）
- **月次予算は計上会社ごと**（`monthly_budgets` に `entity_code`・main の migration 285／288）。全体の目標 ＝ 会社の合計。
  会社の予算が無ければ「—」で出し、按分しない
- 「サムライ関連」の別表は計上会社ではなく **お客様** で決める（`companies.samurai_group`。サムライパートナーズ／GMOサムライコンテンツスタジオ）
- 案件の一覧・詳細の「計上会社」列・欄は main（案件管理）が持つ。MCP `create_project` は変えない（規則で決まる）

⚠️ 10月より前の月は分割前で全行 GSS。切替後も過去の行は動かないので、遡って「もし分けていたら」は出さない（reorg 原則5）。

## 5. 定例報告パック（JSON）

会議1回ぶんの数字を1本にまとめたもの。型は [`shared/src/keepReport/types.ts`](../../../shared/src/keepReport/types.ts) の `KeepReportPack`。

### 5.1 構造（要約）

```
KeepReportPack
  meeting_date / previous_meeting_date / generated_at / frozen_at
  scope: { entity: all|GJV|GSS|GMO, customer_segment: all|internal|external }   … entity の値は計上会社の entity_code（§4）
  landing:  { all, GJV, GSS, GMO? }  … 当月 着地。計上会社ごとの表（6行 × 目標/実績/差/比/判定・鍵は entity_code）＋ 全体（統合）＋ 未確定の売上
  forecast: { all, GJV, GSS, GMO? }  … 翌月 着地見込（確定 ＋ 確度加味）。同じ形
  trend:    MonthlyTrendPoint[] … 2024-01〜。売上（グループ内/外部）・案件数・営業日数・稼働日数・稼働率
  pipeline: { external[], samurai[], weighted_revenue, total_revenue }
  project_pages[]  … ヨミ表で「資料」に印を付けた案件（案件ページの材料）
  event_reports[]  … 前回の会議日以降に本番を終えた案件（ふりかえり）
  calendars[]      … 当月・翌月の予定と稼働率
  inview           … 直近の定期内覧会（満足度は手入力）
  minutes          … 前回の決定事項・次回開催日
```

### 5.2 出どころと集計の約束

| 部分 | 出どころ | 約束 |
|---|---|---|
| 着地の売上・原価 | `revenues`（**`status='confirmed'`**）・`purchases`、`recognition_date` の月。計上会社は **行の `entity_code`**（案件の値ではない・§4） | `getMonthlySummary` と同じ。`FIXED-COGS` 案件の仕入 ＝ 償却相当額（行の `entity_code` で会社別）。経理の補正値（`monthly_actual_overrides.entity_code`）があればそれを使う。**全体 ＝ 会社の合計** |
| 見込 | 着地 ＋ 受注前案件（失注除く）の売上・仕入 × 確度 | `getPipelineForecast` の「確度加味」。**`unconfirmed[]`** に見込みに入れた未確定の売上を列挙（資料の注記の材料）。**`unregistered[]`** は本番があるのに売上（確定・見積）が無い案件で、**表の数字には入れない**（登録し忘れの注意。混ぜると「含めた」と書いた注記に含めていない金額が並ぶ） |
| 目標 | `monthly_budgets`（`entity_code` ごと） | 無ければ null。全体の目標は会社の合計 |
| 推移 | 月ごとの確定売上を `projects.customer_type` で分ける。案件数は本番日がその月にある案件 | 当時の値（`customer_type`）を使う。`companies.is_gmo_group` の今の値で塗り替えない |
| ヨミ表 | `projects`（`stage NOT IN (e_lost, r_delivered, s_completed)`。**ネタも載せる**・ご判断 2026-09-06）＋ 最新見積 ＋ `OPEN_NEXT_ACTION_SQL` | **新規／更新** は前回の会議日と `created_at` / `updated_at` の比較 |
| 案件ページ | `projects`・見積・`studio_bookings`・Box `08_写真`・Qシート | 概要の3行は `projects.goal` を初期値に、人が直せる（構成側に持つ） |
| 実施報告 | `event_reports`（`report_status` を問わず。下書きは印を出す）＋ `getSummaries` | 「前回の会議日以降に本番を終えた」は `event_end` で判定 |
| カレンダー | `studio_bookings`（種別ごと） | 稼働率は §5.4 |
| 内覧会 | `inview_sessions` / `inview_attendees` | 分類は来場者の会社の業種。ヨミ化件数は `promoted` の案件数 |

### 5.3 計算列（手計算しない）

```
diff  = actual − budget
ratio = budget > 0 : actual ÷ budget × 100
        budget < 0 : 100 − (budget − actual) ÷ |budget| × 100   … 9/4 版の式に揃える
judge = higher_better: actual ≧ budget → ○ / lower_better: actual ≦ budget → ○ / budget 無し → -
```

`getMonthlyPl.varianceOf` は赤字行も `actual ÷ budget` を返す（−39,834 ÷ −28,454 = 140%）ので、**赤字行だけ式を変える**。
表示は千円に丸める（`Math.round(円 / 1000)`）。丸めは表示側でだけ行い、パックは円のまま。

全体（`all`）の表は、`entity_code` ごとの行を**先に合計してから**同じ式で `diff`／`ratio`／`judge` を出す（会社ごとの比率や判定を足し合わせない）。
会社ごとの表（`GJV`／`GSS`／`GMO`）はその会社の行だけで同じ式。

### 5.4 稼働率

**ご判断（2026-09-06）: 内覧を含め、何かしらのスタジオ利用があった日は数える。メンテナンス等は除く。**

```
稼働率 = スタジオ利用があった日数 ÷ 営業日数 × 100
```

- 数える予定の種別（`studio_bookings.booking_type`）: `performance` 本番・`rehearsal` リハ・`hold` 仮押さえ・`setup` 設営／準備・`tour` 内覧・`internal` 社内利用・`consultation` 相談・`other` その他
- **`hold` 仮押さえも数える**（ご判断 2026-09-06。見込みの月の稼働率に効く）。数えないのは `maintenance` メンテナンスだけ
- 同じ日に複数の予定があっても1日と数える。部屋数は掛けない（部屋ごとの稼働率は別の指標として後で足せる）
- 営業日は土日祝を除く（`@holiday-jp/holiday_jp`）。設定「お金のルール」の「稼働率の数え方」で 種別・土曜 を変えられる（`keep_settings.utilization`）
- 資料の 9月 42.1% ＝ 8 ÷ 19 はこの決まりで合う。10月 36.1% は合わない（半日か仮押さえの扱い）ので、実装時に過去3か月を照合して差の理由を書く

### 5.5 凍結と履歴

- `keep_report_packs`（`id, meeting_date, scope, pack JSONB, generated_at, frozen_at, frozen_by`）。
  「いまの数字」は保存しない（毎回計算）。週報の確定で `frozen_at` を入れ、`ops_reports.payload.keep = { pack_id }` で結ぶ
- 凍結した版は書き換えない。数字を直したいときは元データ（売上・予算）を直して **凍結し直す**（新しい版を作り、前の版は残す）
- MCP `get_keep_report_pack({ meeting_date?, entity_code? })`: 凍結版があればそれ、無ければいまの数字（`frozen_at: null` で分かる）

---

## 6. 資料ビルダー

### 6.1 構成（デッキ）の JSON

`KeepDeck { meeting_date, pack_id, pages: SlidePage[] }`。ページは **テンプレ × 部品（binding）× 人の上書き**。
部品の位置は `DisplayLayout` と同じ %（1280×720 の仮想キャンバス）。

- **前回の構成から組む**: 前回の `KeepDeck` を写し、`auto: true` のページは新しいパックで組み直し、人が足したページ・上書きした文・並び順・消した印（`removed`）は引き継ぐ。
  前回が無ければ **標準の構成**（§1.1 の並び。`mockups/keep-report/DeckMap.dc.html` の表が正）
- **置き方**: 右の部品をキャンバスに落とす（ページの下に足す）／ページ一覧の間に落とす（新しいページ）／部品の「＋」で今のページの空きに入れる。並べ替えはページ一覧をつまむ。`client` の `@dnd-kit` を `client-daily` にも入れる
- **人が直せる所**: 注記・概要・進行表・写真・自由文・並び・消す。**数字そのものは直せない**（直したいときは元データを直す。画面に「案件を開く」を出す）
- **保存**: 保存のたびに版（`keep_decks` は最新、`keep_deck_versions` に全文）。出力した pptx の Box の `file_id` を版に記録

### 6.2 pptx 出力

- サーバーで `pptxgenjs`（新しい依存・4.0.1）。**表は表、グラフはグラフのオブジェクト**として出す（画像にしない）。最後は PowerPoint 上で直せる
- 見た目は GMO流会議フォーマット Ver.2.5 の決まりを守る（§6.3 の「守るもの」）。内側の組み方は ONAiR が決める。
  マスターは**コードで再現**する（元の pptx をテンプレとして読み込む方式は、203MB の元ファイルに動画・写真が入っていて扱えない）
- 書体は **Noto Sans JP**（ご判断 2026-09-06）。サーバーに TTF がある（`server/fonts/NotoSansJP-*.ttf`・PDF と同じ）ので寸法の計算に使える。
  pptx は書体を名前で引くため、開く PC に Noto Sans JP が無いと Meiryo／游ゴシックに置き換わる（無料なので入れてもらう）
- **PowerPoint 上で直せる**ことを条件にする: 表は表・グラフはグラフ・文はテキストボックス。画像にするのは写真だけ
- 写真は Box `08_写真` からサーバーが取ってきて埋め込む（`getThumbnailStream` ではなく元ファイル。長辺 1600px に縮める）
- 置き場所: Box `02_隔週 橋口社長キープ/<YYMMDD>/` に `<YYMMDD>_橋口社長隔週キープ_ONAiR.pptx`。**既存の v1/v2 は上書きしない**
- PDF は pptx から人が出す（2026-07-26 の「配布は PDF だけ」の決め（[archive](../../archive/2026/2026-07-26-design-change-request.md) 依頼3）は、今回のご依頼で取り消し）
- **Slack の定例投稿は後日**。パックから文面を作り、投稿 ID を版に残して反応を回収する（§10 の条件3）

### 6.3 GMO流会議フォーマットの遵守（守るもの／変えてよいもの）

**ご判断（2026-09-06）: フォーマットの決まりを守っていれば、その内側のデザインは変えてよい。
ヘッダー（題・トークスクリプトの帯）とフッターのデザインは踏襲。文字の大きさはあくまで目安で、場合によっては小さくてもよい。**
資料の見た目を1ページずつ写すのではなく、**「守るもの」を出力の検査項目にし、中身は ONAiR が組みやすい形にする**。

| 守るもの（Ver.2.5 の決まり。出力時に機械で検査） | 出どころ |
|---|---|
| **ヘッダーの形を踏襲**: 題の位置・大きさ・青、その下のトークスクリプトの帯（青＝進行担当・発表者、緑＝会議オーナー・全員） | 各ページ |
| **フッターの形を踏襲**: GMO INTERNET GROUP のロゴ・フォーマット名の青いタグ・「Strictly confidential for internal use only」・ページ番号 | 各ページ |
| 見出し 36pt・中見出し 28pt・本文 24pt 以上。キャッチフレーズは 13 文字以内 — **これは目安**。表・一覧・注記は中身が収まる大きさまで小さくしてよい（検査は警告だけ。止めない） | テンプレの注記『キャッチフレーズは13文字以内…（タイトル36ポイント・本文24ポイント以上）』 |
| 色の役割: メイン（ポジ情報）＝青・アクセント（ネガ情報）＝赤・マーカー＝黄。KGI は緑ハイライト、KPI は黄ハイライト | テンプレの色見本・8. KPIツリー |
| 報告ページのタイトルは **【カテゴリ｜緊急×重要｜時間】** の書式（例: ①数値報告・営業進捗【報告｜3×3｜5分】） | 10. アジェンダの注記 |
| 帯の文言「※オーナーの発言を合図に次のページへ進む」「※全員で挨拶をしてから発表を始める」 | 各ページ |
| **変更点は赤字**。「変更なし／変更あり」の札 | チェックリスト・7. 全体スケジュール |
| 固定ページの並び（0〜11）と番号。以前のスケジュールは消さず Appendix へ | チェックリスト |
| 16:9・パワポ全画面で投影する前提（PDF 化しても崩れない） | 表紙の注記 |

| 変えてよいもの（ONAiR が決める） | 方針 |
|---|---|
| 表・グラフ・カードの並べ方、写真の枠、進行表の形 | **BI 画面と同じ部品の配置**に寄せる（画面で見たものがそのまま資料になる）。案件ページは 写真左・事実右・お金右下 の1つのグリッドに統一 |
| 文字の大きさ | 36／28／24pt は目安。表・一覧・注記は中身が収まる大きさまで小さくしてよい（現行資料の表は 18〜20pt、ヨミ表の写しは 10pt 前後）。小さくしたページは出力時に警告を出すだけ |
| 数字の見せ方 | 千円は3桁区切り・右揃え、マイナスは赤、比率は ○×の色に揃える |
| 「変更点は赤字」の付け方 | **前回の版と比べて動いた数字・文を自動で赤くする**（手で赤字にしない）。人が上書きした文も赤 |

モックのスライド3枚（`SlidePL` / `SlideProject` / `SlideReport`）は現行資料の内側を写しているが、実装では上の方針で組み直してよい。
守るものの一覧は `keep-pptx.service` の検査（ヘッダー・フッター・色・題の書式は必須、文字の大きさは目安）として実装し、外れたら出力を止めずに警告を出す。

### 6.4 部品の一覧（初版）

| 部品 | binding | 出し方 |
|---|---|---|
| 着地表／見込表 | `landing` / `forecast` | 6行の表。注記は `text_override` |
| KPI の数字 | `landing.lines[…]` | 大きい数字1つ（吹き出し用） |
| 売上高と稼働件数／稼働率の推移 | `trend` | 棒（積み上げ）＋ 棒・線。pptx はグラフオブジェクト |
| ヨミ表（外部／サムライ関連） | `pipeline.external` / `pipeline.samurai` | 表。列は資料の並び |
| 案件ページ | `project_pages[i]` | テンプレ `project_page`（§7） |
| 稼働カレンダー | `calendars[i]` | 月のカレンダー（種別の色） |
| 実施報告 | `event_reports[i]` | テンプレ `event_report` |
| 内覧会 | `inview` | 数字4つ ＋ 分類の表 |
| ToDo | `minutes` ＋ タスク | 表 |
| 文・写真・空の表 | なし | 人が書く |

---

## 7. 案件ページ（テンプレ）

案件詳細のふりかえりタブと同じ材料で **1ページ**にする。提案中（`project_page`）と実施報告（`event_report`）は同じ骨組みで、
下の表の「実施報告だけ」の欄が変わる。

| 欄 | 出どころ | 人が直せる |
|---|---|---|
| 帯（お客様／イベント名／日付） | `companies.short_name`・`projects.name`・`event_start`（曜日つき） | ✕ |
| 確度の文字と語 | `projects.stage` → E/D/C/B/A、語は受注確度の設定の名前 | ✕ |
| 写真 | 案件 Box `08_写真`（**正はここ。ご判断 2026-09-06**。`event_reports.photos` の `box_file_id` は MCP が書くだけで画面が読んでいないため、移行時に `08_写真` へ寄せる） | ○（選ぶ） |
| 概要（3行） | `projects.goal` を行に割る。無ければ空 | ○ |
| 進行表 | Qシートの香盤（あれば）。無ければ空の表 | ○ |
| チェック／リハ／本番 | `studio_bookings` の種別と時刻 | ✕（カレンダーを直す） |
| 経路 | `projects.intake_channel` | ✕ |
| 売上／粗利／粗利率 | `getSummaries`（確定売上・仕入）。無ければ最新見積 | ✕ |
| **実施報告だけ**: 総括・箇条書き | `event_reports.headline`・KPT の keep（確定したもの） | ○ |
| **実施報告だけ**: コスト内訳（グループ内） | `purchases`（案件別） | ✕ |

案件詳細のふりかえりタブに「隔週キープに載せる」「案件ページを見る（下書き）」を足し、営業が案件側から直せるようにする。

---

## 8. DB の変更（migration 291・main の 282〜290 の上に載せる）

計上会社まわりの列は **main の 2026年10月の事業再編の migration が持つ**（[reorg-2026-10-plan.md](../../reorg-2026-10-plan.md) §13:
`legal_entities`・`org_transition` ＝ 284、案件と帳簿の行の `entity_code` ＝ 285・286、`monthly_budgets`／`monthly_actual_overrides`／`money_rules` の
会社ごと化 ＝ 285・288）。隔週キープが足すのは **1本だけ**:

| # | 内容 |
|---|---|
| 291 `291_keep_report_tables.sql` | `projects.keep_pick BOOLEAN`（ヨミ表の「資料」の印）・`companies.samurai_group BOOLEAN NOT NULL DEFAULT FALSE`（サムライパートナーズ／GMOサムライコンテンツスタジオ）・`keep_settings`（稼働率の数え方 `utilization`・§5.4）・`keep_report_packs`（凍結したパック）・`keep_report_inputs`（ONAiR に無い数字の手入力: 満足度・参加者・Web KPI。`meeting_date × key`）・`keep_decks`／`keep_deck_versions`（構成の全文と版）・`keep_deck_edits`（人の直しの差分。§10） |

⚠️ このブランチが main 合流前に持っていた 282〜286（`projects.entity`／`entity_manual`・`sga_expenses.entity`・`purchases.entity`・
`monthly_budgets` の `(year_month, entity)` 主キー）は**廃止**した。番号が main の 282〜290 と重なるうえ、同じ概念を main が `entity_code` で持つため。

入力画面: 月次予算・経理の補正値は **設定「お金のルール」** に戻す（削除された `/sales/keep-report` タブ2の代わり。計上会社ごとの欄）。
議事録（決定事項・次回開催日）は「資料をつくる」の中の「次回開催日」ページで入れる（タブ3の代わり）。

## 9. API と MCP

| 種類 | 口 | 権限 |
|---|---|---|
| GET | `/dailyops/keep/pack?meeting=YYYY-MM-DD&entity_code=all&segment=all` — いまの数字（凍結版があればそれ）。`entity_code` は GJV／GSS／GMO か `all`（main の帳簿の列と同じ名前。旧 `entity` は廃止） | `dailyops` or `sales` reader |
| GET | `/dailyops/keep/slack-draft?meeting=&entity_code=&segment=` — Slack の定例投稿の文（パックから決定的に組む） | `dailyops` or `sales` reader |
| POST | `/dailyops/keep/pack/freeze`（週報の確定から呼ぶ。単独でも可） | `dailyops` editor |
| GET/PUT | `/dailyops/keep/decks/:meeting` — 構成。PUT は差分を記録（§10） | `dailyops` editor |
| POST | `/dailyops/keep/decks/:meeting/export` — pptx を作り Box へ置く。返り値は Box の file id とダウンロード | `dailyops` editor |
| PUT | `/dailyops/keep/inputs/:meeting` — 手入力の数字 | `dailyops` editor |
| MCP | `get_keep_report_pack`（reader）、`list_keep_decks`（reader） | `dailyops` |

既存の `/keep/*`（`sales`）はそのまま。予算の PUT は「お金のルール」から叩く。

---

## 10. 「AIを使い捨てにしない」5条件

自動で組む資料・注記の下書き・（後日）Slack の文面は **人が受け取る生成物**なので、原則の対象。

| # | 条件 | この設計 | 判定 |
|---|---|---|---|
| 1 | 出力を記録 | 自動で組んだ構成（`KeepDeck`）とパックの全文を `keep_deck_versions` / `keep_report_packs` に保存。切り詰めない | ○ |
| 2 | 人の修正を差分で | 保存時にサーバーが前の版と比較し、`keep_deck_edits`（`deck_id, page_id, part_id, field, before, after, kind ∈ {reorder, remove, add, override}`）に自動で入れる。理由は任意 | ○ |
| 3 | 成果を紐づけ | 出力した pptx の Box file id と、会議で使った版を記録。**Slack の反応は投稿を作ってから**（投稿 ID を版に残す） | △（Slack は後日） |
| 4 | 改善に戻す | 「よく消されるページ」「よく直される注記」「載せる案件の選び方」を集計し、次回の**標準の構成と既定値**に反映。`get_ai_feedback_digest` に `keep_deck` を足す | ○ |
| 5 | レビュー | **月1回・営業マネージャー**（既存の運用に相乗り）。見る場所は同じ digest | ○ |

**リスク**: 会議の直前に数字が動いたときの「注記の直し」を AI の誤りとして数えないこと。差分は **凍結後の直し** だけを数え、
凍結前の編集は数えない（時間窓の代わりに凍結を境にする）。

---

## 11. 段取り

**2026-09-06 に段1〜4 を実装した**（枝 `claude/weekly-report-bi-powerpoint-kh02s2`）。段5（Slack の投稿そのもの）は
下書きの文面（`GET /dailyops/keep/slack-draft`・MCP `get_keep_slack_draft`）まで。残りは §11.1。

| 段 | 作るもの | 検証 |
|---|---|---|
| 1 | migration 291（§8）・`keep-pack.service`・`GET /keep/pack`・MCP `get_keep_report_pack`・型 | 260904 の表と数字が一致するか（8月 着地の6行、稼働率 46.7%／42.1%） |
| 2 | 「隔週キープの数字」タブ（PC／スマホ）・週報確定での凍結・「お金のルール」の予算入力 | 375px で崩れない・`npm run lint`・Vitest（計算列のテスト） |
| 3 | 構成 JSON・標準の構成・「資料をつくる」タブ（ページ一覧／キャンバス／部品）・差分の記録 | 前回の構成から組み直して人の直しが残るか |
| 4 | pptx 出力（`pptxgenjs`）・Box への配置・案件ページ／実施報告のテンプレ・ふりかえりタブの導線 | 出した pptx を PowerPoint で開き、表・グラフが直せるか |
| 5 | Slack 定例投稿（パックから）・反応の回収・digest | — |

段1は画面が無くても効く（bot の下準備）。**段2まででご要望の「BI」、段4までで「半自動生成」**。

### 11.1 実装して分かったこと・残っていること

- **サーバーは `shared/` を import できない**（`rootDir`）ので、純粋関数（比率・判定・営業日・差分・テンプレ）は
  `server/src/contexts/dailyops/services/keep-*.ts` に写しを置き、`shared/tests/keepReport*.test.ts` の parity テストで一致を固定している。
  直すときは **shared 側と server 側の両方**を直す（テストが止める）
- 案件ページの **進行表は空**（Qシートとの連携は未実装。人が「このページ」で書く）。写真は Box 未接続の環境では灰色の枠
- pptx の写真は縮小していない（サーバーに画像ライブラリが無い）。**画像化しての目視は未実施**（この環境に Impress が無い）。
  実機の PowerPoint で開いて確かめること
- 稼働率は「利用があった営業日 ÷ 営業日」。土日の利用は数えない（分母と同じ日だけ数える）
- 「変更点は赤字」は **前回の凍結パックがあるときだけ**付く（初回は脚注も無い）
- Slack への投稿・反応の回収（§10 条件3）は未実装。bot は下書きの文を投稿し、`ts` と `pack_id` を残す
- 案件台帳の計上会社フィルタは入れたが、台帳の列の既定は非表示（列の設定で出す）
- **計上会社の導出は shared に写さない**（main の `entity-resolution.service.ts` が正・§4）。shared の `keepReport/entity.ts` は値の検査と表示名だけ。
  `entity_code` の3文字は `shared/tests/keepReportEntity.test.ts` が server の `LegalEntityCode` と seed の文面で突き合わせる

---

## 12. 決めてほしいこと／決まったこと

**決まったこと（2026-09-06 ご判断）**

| 項目 | 決まり |
|---|---|
| 計上会社 | グループ内のお客様のイベント → GMOサムライスタジオ（GSS）、グループ外 → GMOサムライコンテンツスタジオ（GJV）、プロジェクト → グループ本体（GMO）。値は main の `entity_code`・決め方も main の規則（§4）。収支は計上会社別 ＋ 全体（統合） |
| 稼働率 | 内覧を含め、何かしらのスタジオ利用があれば数える。メンテナンス等は除く（§5.4） |
| 写真 | 案件 Box `08_写真` が正（§7） |
| pptx の書体 | Noto Sans JP。PowerPoint 上で直せるようにオブジェクトで出す（§6.2） |
| 見た目 | GMO流会議フォーマットの決まりを守っていれば、内側のデザインは変えてよい。ヘッダー・フッターのデザインは踏襲、文字の大きさは目安で小さくてもよい（§6.3） |

| 稼働率の仮押さえ | 仮押さえも数える（§5.4） |
| ヨミ表 | ネタ（`neta`）も載せる。受注前の案件は全部（§5.2） |
| 目標値 | ウェブで設定する。設定「お金のルール」に計上会社ごとの月次予算・経理の補正値・稼働率の数え方を置く（§8） |
| 実装 | 2026-09-06 に着手（§11 の段取り。マルチエージェントで並行） |

**まだ決めてほしいこと**

1. 「配布は PDF だけ」（2026-07-26）の取り消し（pptx を出すご依頼なので取り消し前提で進める）
2. 販管費・償却相当額を計上会社ごとに分ける入力（経理側の運用・帳簿の行の `entity_code`）をいつから始めるか。始まるまでは全額 GMOサムライスタジオ に載せ、GMOサムライコンテンツスタジオ の表は売上・原価・粗利だけ出す

## 13. 参考

- 資料: Box `260904_橋口社長隔週キープv2.pptx`（file id 2445609429221）、`260813_橋口社長隔週キープv2.pdf`（2405285987642）
- 既存の要件（2026-07-16 版）の実装: migration 129、`server/src/contexts/sales/services/keep-report.service.ts`、`docs/mcp-server.md` の `list_event_reports`
- 削除の経緯: [client-v4-build-log.md](../../reviews/client-v4-build-log.md)「報告資料（`/sales/keep-report`）を削除した回」
- 取り消す決め: [2026-07-26-design-change-request.md](../../archive/2026/2026-07-26-design-change-request.md) 依頼3
