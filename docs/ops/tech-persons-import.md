# 技術人員の初期取り込み（一度きり）

**最終確認: 2026-09-23。** 一次情報は `scripts/tech-persons-import.mjs`・
`docs/design/v4/tech-docs.md` §9-2（決めごとの正）・§13-5（会社は取引先）・
`server/src/shared/db/migrations/305_tech_docs.sql`（`qsheet_tech_persons`）・
`308_tech_persons_companies.sql`（会社を案件管理の取引先 `companies` に寄せた）。

## これは何か

制作技術支援＞技術資料の「技術人員」台帳（会社ごとの人と役職の一覧）に、
協力会社が発行する**メンバー表 PDF**（BOX に溜まっている過去の実績）から人と役職を一度だけ流し込むスクリプト。
migration にも seed にも入れない。**氏名は個人情報**で、migration に書くと git の履歴に永久に残ってしまうため
（§9-2「なぜ migration ではないか」）、管理者が手元で `node scripts/tech-persons-import.mjs` を直接叩く。

技術資料アプリ自体（映像パッチ・技術スタッフの画面）はまだ実装されていない（`docs/design/v4/tech-docs.md` は設計段階）。
このスクリプトは、実装が進んだときに「技術人員」台帳が空のまま始まらないよう、先に台帳の中身（会社1件・人約90人）を
用意しておくためのもの。

## 入力はどこから来るか

BOX の **「11_ヌーベルバーグ様 連携／スタッフリスト格納」** フォルダに、案件ごとの「メンバー表」PDF が溜まっている
（1枚＝1協力会社の1作業日。フォルダは `GLS058`／`059`／`060`／`064`／`065`／`074`／`083-084`／`086`／`100` などの
案件フォルダの下に散らばっている）。

このスクリプトは PDF を直接読まない。**Box AI のテキスト抽出**（`mcp__Box__ai_extract_freeform` 等）で
1枚ずつ読み取った結果を、あらかじめ次の形の JSON にまとめておく。

```jsonc
{
  "sheets": [
    {
      "fileId": "...",              // BOX のファイル id（参照用。任意）
      "name": "0814メンバー表.pdf", // 元のファイル名（(ver2) の判定に使う）
      "event": "GMO通期決算説明会", // 番組・案件名（本文の見出し）
      "dates": ["2026-08-14"],      // 参考。実際の作業日は rows[].day を見る
      "issueDate": "2026-08-10",    // 発行日（本文）。(ver2) の勝敗判定に使う
      "company": "株式会社ヌーベルバーグ",
      "rows": [
        { "role": "SW", "name": "山田 太郎", "day": "2026-08-14" }
      ]
    }
  ]
}
```

**人が CSV を用意してもよい**（役職を `|` 区切りで並べた代替入力）。

```csv
company,name,kana,roles
株式会社ヌーベルバーグ,山田 太郎,ヤマダ タロウ,SW|CAM
```

`--input` に渡したファイルの拡張子が `.csv` なら CSV、それ以外は JSON として読む。

## 個人情報の扱い（必読）

- **氏名だけを持つ。連絡先（電話・メール）は持たない、というより入力にも一度も出てこない**（§9-2）
- ふりがな（`kana`）は元の PDF に無いので空のまま入れる（人が後で足す）
- **入力ファイル（JSON・CSV）はこのリポジトリに絶対にコミットしない。** `.gitignore` に頼らず、
  リポジトリの外（作業端末の一時フォルダなど）に置いて作業し、終わったら消す
- 先に **onair_dev**（検証環境）に対して流し、結果を確認してから、**ユーザーの明示的な指示があったときだけ**
  onair_prod（本番）に対して流す。ルート [`CLAUDE.md`](../../CLAUDE.md) の環境分離ポリシーと同じ扱い
- 役職は**回ごとの割当**であって人の固定属性ではない（同じ人が SW のときも CAM のときもある）。
  取り込みで入れるのは `main_roles`（よく担当する役職の**候補**）までで、資料の行（`qsheet_tech_staff_rows`）は作らない
- 「社内業務」（研修）は技術配置ではないので役職の候補にも入れない

## スクリプトの振る舞い

```bash
node scripts/tech-persons-import.mjs --input <file.json|file.csv> [--dry-run] [--database-url <url>]
```

| 引数 | 内容 |
| --- | --- |
| `--input <file>` | 必須。BOX 抽出の JSON、または `company,name,kana,roles` の CSV |
| `--dry-run` | 書き込まない。何が起きるかの表と件数だけ出す（内部では実際に SELECT/INSERT/UPDATE まで行い `ROLLBACK` するので、件数は本番実行と同じになる） |
| `--database-url <url>` | 省略時は環境変数 `DATABASE_URL` を使う |

処理の中身:

1. 氏名の全角・半角スペースを半角1つに正規化し、前後の空白を trim する。空になった行は捨てる
2. 役職が「社内業務」の行は捨てる
3. JSON 入力は、**同じ (番組・案件名, 作業日) を持つシート同士**を同じ回の改訂とみなし、
   **発行日 (`issueDate`) が新しいほう**（同着なら `(ver2)`／`(Ver2)` が付くファイル名のほう）だけを採用する。
   負けたシートの行は「改訂で上書きされた」として件数に出るだけで取り込まない
4. (会社, 氏名) ごとに役職を頻度順に集約し、`main_roles` に入れる
5. 会社は**案件管理の取引先（`companies`）**。削除されていない取引先と**名前の完全一致**で照合し、
   無ければ**仕入先**（`is_vendor = TRUE`・`is_customer = FALSE`）として作る
   （`short_name` は `株式会社`／`有限会社` を削った形・`is_gmo_group` は社名から見立てる）。
   一致した既存の取引先は**書き換えない**（案件管理の持ち物。§13-5）
6. 人は **(会社, 氏名)** の一致で照合する。無ければ作る。あれば `main_roles` を「既存の並び＋今回の頻度」で
   合わせ直して更新するだけで、**`kana`・`active`・`note` は上書きしない**。`note` に「取り込み: n 回」のような
   文言も**書かない**（参加回数は `qsheet_tech_staff_rows` を数えて出す設計。§9-2）
7. **削除は一切しない。** すべて1つのトランザクションで実行し、`--dry-run` のときだけ最後に `ROLLBACK` する

## 使い方（推奨の手順）

```bash
# 1. まず検証環境（onair_dev）に対して dry-run で確認する
node scripts/tech-persons-import.mjs --input /path/to/member-lists.json --dry-run \
  --database-url "$ONAIR_DEV_DATABASE_URL"

# 2. 表と件数を見て問題なければ本番実行（dev環境へ実際に書く）
node scripts/tech-persons-import.mjs --input /path/to/member-lists.json \
  --database-url "$ONAIR_DEV_DATABASE_URL"

# 3. onair_prod へは、ユーザーの明示的な指示があったときだけ同様に流す
```

`--database-url` を省略すると環境変数 `DATABASE_URL` を使う（VPS のコンテナ内で実行する場合など）。

## 確かめ方

```sql
-- 取引先が二重に増えていないか
SELECT name, count(*) FROM companies WHERE deleted_at IS NULL GROUP BY name HAVING count(*) > 1;

-- 人数と役職の中身をざっと見る
SELECT c.name AS company, p.name, p.main_roles
FROM qsheet_tech_persons p
JOIN companies c ON c.id = p.company_id
WHERE p.deleted_at IS NULL
ORDER BY c.name, p.name;

-- 同じスクリプトをもう一度流しても人数が増えないこと（冪等性）
SELECT count(*) FROM qsheet_tech_persons;
```

同じ入力で2回流しても、`SELECT count(*) FROM qsheet_tech_persons` の値は変わらない
（1回目は「新規作成」、2回目は「既存に一致（`main_roles` を更新）」になるだけ）。

## 検証（このスクリプトを作ったときに実施）

検証用 Postgres（`source /tmp/onair-verify/env.sh` で使える使い捨ての DB）に対して、
実際のメンバー表抽出（37枚・distinct 90人）相当のデータで確認した。

- `--dry-run`: 会社「新規作成 0 件 / 既存に一致 1 件」・人「新規作成 87 件」・捨てた行「社内業務 18 件／氏名が空 7 件／改訂で上書きされた 33 件」
- 本番実行: 人の数が想定どおり 87 件増えた
- 再実行（同じ入力）: 「新規作成 0 件 / 既存に一致（`main_roles` を更新）87 件」で、`qsheet_tech_persons` の件数は変化なし（冪等性を確認）
- CSV 入力（全角スペース・連続半角スペース入りの氏名）でも1つの半角スペースに正規化されることを確認

（実データの検証は個人情報を含むため、実行結果の件数だけをここに残し、氏名は残さない。）
