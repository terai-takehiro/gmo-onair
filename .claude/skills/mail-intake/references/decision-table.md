# 決定表 — 上から順に当て、最初に当たったところで止める

2026-08-06〜09-06 の受信メール 615通を実際に読んで作ったもの
（[docs/reviews/2026-09-06-mail-intake-taxonomy.md](../../../../docs/reviews/2026-09-06-mail-intake-taxonomy.md)）。

**宛先（To / Cc）でほとんど決まります。** 差出人と件名はその次です。
本文を読むのは、宛先と件名で決まらなかったときだけにしてください
（全部のメールを本文まで読むと、実行のたびに費用が膨らみます）。

| # | 条件 | 行き先 |
|---|---|---|
| 1 | `from:dmarc-report@` ／ `notifications@github.com` ／ `postmaster@` ／ Zoom のリマインダー ／ `noreply@box.com` ／ `notification@8card.net` | 捨てる |
| 2 | `To: account@gmo-globalstudio.com` で、認証コード・ログイン通知・パスワード再設定 | 捨てる |
| 3 | `from:kairos3.com` かつ 件名に `定期内覧会_来場予約フォーム` | `register_inview_attendee` → ラベル `inview-reg-done` |
| 4 | `from:kairos3.com` かつ 件名に `お問い合わせ` | `create_project`(stage=neta) ＋ `create_activity_log` |
| 5 | `from:kairos3.com` かつ 件名に `資料ダウンロードフォーム` | 本文の `[資料ダウンロードの目的]` を見る（下記） |
| 6 | `To`/`Cc` に `order@gmo-globalstudio.com`、または件名に 請求書・見積書・注文書・発注書・御見積 | `record_finance_doc` |
| 7 | `Cc: sales@gmo-globalstudio.com` で、人が書いた往復 | 案件の活動記録（下記） |
| 8 | `To: facility@gmo.jp` ／ `from:info@rakbil.com` ／ 東急各社（`tokyu-pm` `tokyu-com` `tokyulifia`） | 日付が入っているものだけ `record_inquiry`(tags=[設備])・他は捨てる |
| 9 | `from:nasa-information@gmo.jp` で 件名が `緊3/3` か `重3/3` | `record_inquiry`(tags=[社内周知])・他は捨てる |
| 10 | 件名か本文に 脆弱性・セキュリティ警告・重大な不具合・規約改定 | `record_inquiry`(importance=high, tags=[セキュリティ]) |
| 11 | ベンダーの配信・展示会案内・コールドメール（`b2b-noreply@mail.sony.jp` `mailmagazine@` `sales@w-creative.tv` など） | 捨てる。**ただし日付のある招待は #10 の次に見る** |
| 12 | 残り（人が書いた、当社宛に用件のあるメール） | `record_inquiry`(source=mail, tags 1〜3個) |

## #5 資料ダウンロードの分け方（実測で一番落ちていたところ）

本文の `[資料ダウンロードの目的を教えてください]` で分けます。

| 目的の値 | 行き先 |
|---|---|
| `GMOサムライスタジオの利用を検討しているため` など**利用を検討**と読めるもの | `create_project`(stage=neta) ＋ `create_activity_log`。**見込み客です** |
| `今後の参考としての情報収集` | `record_inquiry`(tags=[リード, 資料ダウンロード], importance=medium) |
| 空・読めない | `record_inquiry`(tags=[リード, 資料ダウンロード], importance=low) |

⚠️ **「情報収集」だから捨てる、はしないこと。** 資料を落とした会社の名前は
あとで営業が引き当てる材料になります（`record_inquiry` に入れておけば「その話、
前に来ていませんでしたか」で引けます）。捨ててよいのは #1・#2・#11 だけです。

## #7 営業スレッドの扱い

`Cc: sales@` に入っている人の往復です。件名は
`【◯◯の件】GMOサムライスタジオ／担当者名` か `Re: お問い合わせいただいた件につきまして【…】`。

1. **見積・請求・注文の話なら #6 が先に当たります**（決定表は上から順）。
   見積書の PDF が付いていれば受領書類です。
2. それ以外は、`list_projects` で件名・取引先名から案件を探します。
   - **見つかった** → `create_activity_log`（`project_id` を付けて）
   - **見つからない** → `record_inquiry`。**ここで案件を新しく作らないこと** —
     既にある案件のやり取りを新しい案件として起こすと、同じ話が2件になります

## 迷ったときの原則

- **「捨てる」に迷ったら `record_inquiry` に入れる。** 入れたものは人が1タップで
  見送りにできますが、**捨てたものは誰の目にも触れません**。
- **「案件にする」に迷ったら `record_inquiry` に入れる。** 案件は人が受付から作れます。
  AI が作った案件は、間違っていても失注として履歴に残り続けます。
- **`importance=high` は「今日中に人が動かないと困るもの」だけ。**
  期日のある依頼・脆弱性・支払期限が近い請求書。それ以外は `medium` か `low`。
