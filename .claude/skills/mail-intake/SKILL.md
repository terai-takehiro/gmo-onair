---
name: mail-intake
description: 受信メールを読んで種類ごとに仕分け、GMO ONAiR の MCP へ取り込む定期実行スキル。Claude のルーティン（スケジュール実行）から Gmail コネクタと GMO ONAiR コネクタを使って動く。Kairos3 の3フォーム（お問い合わせ／資料ダウンロード／定期内覧会）、見積書・発注書・請求書（添付 PDF ごと）、営業スレッド、社内配信、メルマガ・自動通知を決定表で振り分け、案件・活動記録・受領書類・来場予約・入ってきた情報のどれに入れるかを決める。「メールを取り込んで」「メールを仕分けて」「受信箱を片づけて」「今日のメールを ONAiR に入れて」と言われたときはもちろん、メール取込のルーティンとして起動されたときは必ず最初に使う。ONAiR に入れずにメールを読むだけの調査、メールの下書き作成には使わない。
---

# メールを仕分けて ONAiR に入れる

## どこで動くか

**Claude のルーティン（スケジュール実行）**です。VPS の cron でも、
`/root/.claude/skills/sales-mail-gmoonair/` でもありません（2026-09 に切り替え）。

- **読む**: Gmail コネクタ（`search_threads` / `get_message` / `list_labels` / `label_thread`）
- **書く**: GMO ONAiR コネクタ（`record_finance_doc` / `record_inquiry` /
  `register_inview_attendee` / `create_project` / `create_activity_log` / `add_ops_report_items`）

ルーティンは**毎回まっさらな会話から始まります**。前回の記憶はありません。
「どこまで取り込んだか」は**会話ではなく Gmail のラベル**で持ちます（手順1）。

## なぜこれがあるか（実測）

2026-08-06〜09-06 の受信メール 615通を数えたところ、**入口と出口の量が桁で合っていませんでした**
（[docs/reviews/2026-09-06-mail-intake-taxonomy.md](../../../docs/reviews/2026-09-06-mail-intake-taxonomy.md)）。

| 種別 | 届いた数 | ONAiR に入った数 |
|---|---|---|
| Kairos3 資料ダウンロード | 21件 | 4件（**17件が未処理**） |
| Kairos3 お問い合わせ | 20件 | 印が付いたのは12件 |
| Kairos3 定期内覧会 | 17件 | 13件 |
| 見積・請求・注文 | 月100件超 | **`finance_docs` は開設以来 0件** |
| その他の有益メール | 取材依頼・協業打診・脆弱性告知など | `misc_inquiries` 全期間7件・**全部「見送り」** |

**落ちている理由は「拾いすぎ」ではなく「拾えていない」**です。
未処理だった資料ダウンロードの中には「GMOサムライスタジオの利用を検討しているため」と
書いた**明確な見込み客**が含まれていました。

## 毎回の手順（この順に）

### 0. 拾い方の傾向を1回だけ読む

```
get_ai_feedback_digest(kind='inquiry_intake')
get_ai_feedback_digest(kind='finance_doc_intake')
```

⚠️ **助言をそのまま信じないこと。** いまの母数は5件で、
「見送り率100% ＝ 拾いすぎ」という助言が出ますが、**実態は拾えていない**ほうです。
**母数（`inquiry.total`）が 20 件を下回るあいだ、この助言は判断に使いません。**
20件を超えてから「よく直される項目」を見て、次の取込に反映します。

### 1. 取り込む範囲を決める

**「どこまで取り込んだか」は Gmail のラベルが持ちます。**
ルーティンは毎回まっさらなので、日付で数えると**時計がずれた日に取りこぼします**。

| ラベル | 意味 |
|---|---|
| `studio-intake-done` | 案件・活動記録・受領書類・入ってきた情報のどれかに入れた |
| `inview-reg-done` | 内覧会の来場予約に入れた |
| `mail-intake-skipped` | **読んだうえで取り込まないと決めた**（メルマガ・自動通知・売り込み） |

```
search_threads(query: '-label:studio-intake-done -label:inview-reg-done -label:mail-intake-skipped
  -from:notifications@github.com -from:dmarc-report@gmo-globalstudio.com
  -from:noreply@box.com -from:notification@8card.net
  newer_than:3d -in:sent -in:draft', pageSize: 50)
```

⚠️ **雪崩のように来る通知は、検索式で先に外します**（2026-09-06 実測）。
決定表 #1 は「拾ってから捨てる」ですが、**捨てる作業そのものが枠を食い潰します**。
このときの3日窓は **201スレッド**で、新しい順に40件を数えると
**`notifications@github.com` が 33件・`dmarc-report@` が 2件（87.5%）**でした。
GitHub は開発中1日に25通以上出すので、**枠30通は毎回 GitHub の通知だけで尽きます**。
上の4つを外すだけで **201 → 54** に落ちました。**ラベルでは間に合いません**
（印を付けても翌日また同じだけ届くため）。

⚠️ **捨てたメールにも印を付けます**（`mail-intake-skipped`）。
付けないと、**捨てたものが毎回この検索に当たり続けます**。1回30通までしか扱わないので、
**捨てるメール30通が枠を占め、その裏で届いた請求書が3日間ずっと見られません**。

印を分けてあるので「読んだけど捨てた」と「まだ読んでいない」は区別できます
（何を捨てたかは手順5の取込ログにも残ります）。

- **`newer_than:3d`** は保険です（ラベルが正）。取りこぼしても翌日拾えます。
- **1回で扱うのは 30通まで。新しいほうから 30通**です。
  ⚠️ **「古いほうから」にしないこと**（2026-09-06 に直した）。`search_threads` は
  **新しい順にしか返さない**ので、古い30通を採るには全件めくる必要があり、
  そのうえ**その日届いた請求書がいつまでも後回し**になります。
  上の除外を入れると3日で 54件まで落ちるので、**30通/日で追いつきます**。
- **1通ずつラベルを付ける**ので、途中で止まっても入れたぶんには印が付いています。

### 2. 決定表に当てる

**上から順に当てて、最初に当たったところで止めます。**
中身は [references/decision-table.md](references/decision-table.md)。

**宛先（To / Cc）と差出人と件名でほとんど決まります。**
本文を読む（`get_message`）のは、そこで決まらなかったときと、
取り込むと決めたときだけにしてください — 全部の本文を読むと実行のたびに費用が膨らみます。

⚠️ **検索結果の抜粋は「いちばん古い5通」です**（`search_threads` の仕様・実測で確認）。
新しいメッセージは**入っていないのに、切れている印も出ません**。
Gmail はスレッド単位で当てるので、**3か月前に始まったスレッドが `newer_than:3d` に出て、
抜粋だけ3か月前の本文**になります（実測: 6月の「ZOZOの件」「貸倉庫の件」が
3日窓に出てきました）。**判断は必ず `get_thread` で最新のメッセージを読んでから**行い、
抜粋だけで決めないこと。

### 3. 取り込む

| 行き先 | ツール | 参照 |
|---|---|---|
| 内覧会の来場予約 | `register_inview_attendee` | [references/kairos3.md](references/kairos3.md) |
| 案件（ネタ）＋活動記録 | `create_project` → `create_activity_log` | [references/kairos3.md](references/kairos3.md) |
| 受領書類（見積・発注・請求） | `record_finance_doc` | [references/finance-docs.md](references/finance-docs.md) |
| 入ってきた情報 | `record_inquiry` | [references/inquiries.md](references/inquiries.md) |
| 捨てる | （何も呼ばない） | — |

### 4. ラベルを付ける

**扱った全部のメールに印を付けます**（取り込んだものも、捨てたものも）。

| どうしたか | 付けるラベル |
|---|---|
| 案件・活動記録・受領書類・入ってきた情報 に入れた | `studio-intake-done` |
| 内覧会の来場予約に入れた | `inview-reg-done` |
| 読んだうえで取り込まないと決めた | `mail-intake-skipped` |

```
label_thread(threadId: '<スレッドの id>', labelIds: ['<ラベルの id>'])
```

⚠️ **ラベルの id は名前ではありません。** `list_labels` で引いてから使ってください
（実測では `studio-intake-done` = `Label_1`、`inview-reg-done` = `Label_2`。
`mail-intake-skipped` は**まだ無いので `create_label` で作ります**。
どれも確かめずに決め打たないこと）。

⚠️ **捨てたメールにも必ず印を付けます。** 付けないと手順1の検索に当たり続け、
**1回30通の枠を捨てるメールが占めて、その裏で届いた請求書が見られません**。

⚠️ **1通取り込んだら、その場でラベルを付けます。** まとめて最後に付けると、
途中で止まったときに**入れたのに印が無いメール**が残り、次の実行で二重に処理します
（`message_id` の重複ガードが効くので二重登録にはなりませんが、無駄が出ます）。

### 5. その日の取込ログを1行残す

```
add_ops_report_items(kind='mail_intake', period_key='<YYYY-MM-DD>', items=[
  { category: 'kairos3_download', content: '走査21通 / 取込21件 / 落とし0件' },
  { category: 'dropped', content: '走査48通 / 取込0件 / 落とし48件',
    note: '（落としたものの代表の件名を10本まで）' },
])
```

**落とした判断がどこにも残らないと、取りこぼしを後から数えられません**
（会社方針「AI を使い捨てにしない」の条件1の穴。上の表の 17件 が誰にも気づかれなかった理由がこれです）。

**中身の全文は入れません** — 「何を落としたか」が読めれば足ります
（原文は取り込んだ側の `body_text` にあります）。

### 6. 終わったら1行で報告する

走査した通数・種別ごとの取込件数・**取りに行けなかった添付**・判断に迷ったものを
短く書きます。**「全部うまくいきました」で終わらせないこと** —
BOX に入らなかった添付があるなら、それが一番伝えるべきことです。

## 添付（PDF）の扱い — ここがルーティン特有です

⚠️ **Gmail コネクタは添付の「中身」を返しません。** `get_message` が返すのは

```
attachments: [{ filename: '請求書.pdf', id: 'ANGjdJ9…', mimeType: 'application/pdf' }]
```

の**名前と id だけ**です（`FULL_CONTENT` で呼んでも同じ。実測で確認済み）。

そこで **`record_finance_doc` には在り処だけを渡します**。
**サーバーが Gmail API から取りに行って BOX に置きます。**

```
attachments: [{
  filename: '請求書.pdf',
  mime_type: 'application/pdf',
  gmail_message_id: '<get_message で見たメールの id>',
  gmail_attachment_id: '<attachments[].id>',
}]
```

- ⚠️ **`gmail_attachment_id` は呼ぶたびに変わります**（同じ添付を2回引くと別の文字列。実測）。
  **その場で `get_message` から取った新しいものを渡してください。** 保存して後で使えません。
- 返り値の `attachments[].stored` が `false` のときは `failure_reason` が付きます。
  **`NO_GMAIL_SCOPE` なら、Google 連携をやり直す必要があります**（人の作業）。
  そのときは手順6の報告に必ず書いてください。

## 絶対に守ること

- **同じメールを2回登録しない。** `message_id` を必ず渡します
  （`record_finance_doc` / `record_inquiry`）。案件・活動記録は `idempotency_key` を
  意図別に分けます（`email:<msgid>:project` / `email:<msgid>:activity`）。
- **`source` を渡す。** メールからの取込なら `mail`。
- **添付の在り処は必ず渡す。** 請求書の PDF は**原本**です。
- **どの案件かを AI が決め打たない。** `project_hint`（GLS 番号か案件名）を渡し、
  サーバーに探させます。**最終的に決めるのは人**です。
- **HTML やマークダウンを書かない。** `details` は「意味の単位」で渡します。
- **読み取れなかった項目は入れない。** 推測で埋めると、人は確かめずに登録します。
- **本文の全文（`body_text`）を切り詰めない。**

## やらないこと

- **却下・見送りを AI が決めない。** 取り込んだものは必ず「未仕分け」で入り、
  ストック / チケット / 案件の受付 / 見送り のどれにするかは人が決めます。
- **返信を書かない。** 読んで入れるところまでです。
- **メールを削除・アーカイブしない。** 付けるのはラベルだけです。
- **本番の ONAiR に書くことを恐れて「下書きだけ作る」に逃げない。**
  取り込んだものは人が画面で直せます（当て先の付け替え・金額の修正・削除）。
  入れないほうが損失です。
