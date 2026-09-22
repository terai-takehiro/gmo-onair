# Wiki — 新しいブロックアプリ（設計の壁打ち・2026-09-22）

> **状態**: 設計（未実装・**判断済み**）— §10 の全件（12件）に 2026-09-22 にご判断をいただいた。**着手できる状態**。同日にいただいた4点のご指示（編集は手入力の使いやすさ優先／手入力したものを AI で Markdown に整える／スマホでも書ける／UI の語は取り決めを徹底）は反映済み
> **最終確認**: 2026-09-22
> **位置づけ**: 新しいブロックアプリ「Wiki」の正（何をする道具か・利用者に見せる語・画面・データの持ち方・AI の入れ方・作る順）。**実装はまだ1行も書いていない。** 壁打ちの材料として、決めるべき点は「決めた」ではなく「こう考える。代替はこれ」の形で §10 に並べてある

モックは Claude Design のキャンバス（押せる試作・PC 7枚＋スマホ 2枚＋考え方の地図 1枚）:

- **https://claude.ai/artifact/Hi4yceVhCQvgJS6MWbRTie**
  （作業ファイルは [`mockups/native/wiki/`](mockups/native/wiki/README.md)。
  書式は [`production-manual.md`](production-manual.md) と同じ `.dc.html` ＋ `canvas.json`）

---

## 0. 経緯

ご依頼（2026-09-22・原文の要旨）:

> 大型の新規アプリとして、Notion のような Wiki アプリを作りたい。
> ・Notion のような多機能なドキュメント Wiki ツール（いわゆる、マニュアルをためていく）
> ・MD ファイルネイティブとすることで AI 連携をしやすくする。AI 実装も可能に（搭載された API 利用）
> まずは壁打ちをして設計、モックアップを作成したい。

ONAiR には「決まった形のデータ」を入れる場所は揃っている（案件・機材・予定・売上・タスク）。
無いのは**「文章として残す決めごと・手順」を置く場所**である。いま社内の手順書・マニュアル・
申し送りは、BOX の Word／PowerPoint、Slack の流れ、個人のメモに散っていて、
「どこに書いてあるか」を人に聞かないと辿り着けない。

一方 ONAiR 側では AI（MCP・メール取込・議事録・週報の下書き）が日々動いているが、
**AI が読める「会社の決めごと」の置き場が無い**ため、判断の根拠はスキルのプロンプトに手で書くしかない
（`mail-intake` スキルの仕分け表がその例。Git 管理外で、人が直さないと増えない）。

この文書は、その2つの穴を1つのアプリで塞ぐ設計である。

---

## 1. 結論（先に答え）

**Wiki は「Markdown で書いた文章を、木に並べて、探せて、AI が読める」道具。** Notion の全部は作らない。

3つの約束（**Markdown ネイティブ**の中身）:

| # | 約束 | 何を意味するか |
| --- | --- | --- |
| 1 | **本文の正は Markdown の文字列** | DB の列 `body_md` がそのまま本文。画面（ブロックエディタ）はそれを描いて書き戻すだけ。HTML や独自 JSON を正にしない |
| 2 | **Markdown で書けないブロックは作らない** | GFM（見出し・段落・箇条書き・番号・チェック・表・コード・引用・リンク・画像・区切り）＋拡張3つ（注意書き `> [!NOTE]`・折りたたみ `<details>`・ONAiR カード＝ただのリンク）だけ。**データベースはブロックではなくページの種類**: 行＝ページ・値＝各ページの YAML の見出し・列（項目）とビューの定義＝親ページの見出しに置き、Markdown の側に収める（§4-4） |
| 3 | **外から同じものが読める・書ける** | REST `GET /api/v1/wiki/pages/:id.md`（text/markdown）・MCP ツール6本・スペースまるごとの書き出し（.md のフォルダ構成＋YAML の見出し。データベースはフォルダ＋CSV）と取り込み |

利用者に見せる語は **8つ**（§4-1）: **スペース／ページ／ブロック／データベース／ビュー／テンプレート／履歴／見直し予定**。
AI は「**AI に聞く**」「**AI で下書きを作成**」「**AI で整える**」の3つ（§7）。**「AI で整える」は手入力のメモを Markdown の形にするのが主な使い方**（§6-③）。
動詞は共通ルールどおり 追加・編集・削除・保存（[wording.md](../../wording.md) ルール8）＋ **公開する／書き出す／取り込む／見直す**。

画面は **PC 7枚・スマホ 2枚**:

```
トップページのタイル「Wiki」
 └ ① ホーム              /wiki                  ← 検索・AI に聞く・スペース・最近更新・自分の見直し予定
     ├ ② ページ          /wiki/p/:id            ← 左=ツリー／中央=本文／右=情報・目次・履歴・コメント
     │   ├ ③ 編集        /wiki/p/:id/edit       ← 手入力優先＋「AI で整える」。PC・スマホ（⑨）
     │   └ ⑥ 履歴        /wiki/p/:id/history    ← ②の右パネルと同じ。版の比較はここ
     ├ ④ 検索            /wiki/search?q=        ← 絞り込み＋抜粋。上に「この質問を AI に聞く」
     ├ ⑤ AI に聞く       /wiki/ask              ← 出典つきの回答。出典が無ければ「足りないページ」に登録する
     ├ ⑦ 見直し          /wiki/review           ← 要見直し／足りないページ／AI の修正状況（月1回の場）
     ├ ⑩ データベース    /wiki/p/:id            ← kind=database のページ。表／ボード／カレンダーのビュー。行は子ページ
     ├ ⑧ 閲覧（スマホ）  /wiki/p/:id            ← 同じURL。読む・検索・聞く・コメント
     └ ⑨ 編集（スマホ）  /wiki/p/:id/edit       ← 手入力＋「AI で整える」に絞る（道具の帯は5つ）
```

**いちばん大きい判断は「データベースも作る。ただし行＝ページで Markdown の側に収める」（§10-3）と
「出典の無い質問には答えず、足りないページとして登録する」（§10-8）の2つ。**
前者で Notion の使い勝手を保ったまま3つの約束を破らず、後者で AI がマニュアルを育てる側に回る。

---

## 2. いまの何が問題か

| # | 症状 | 何が起きているか |
| --- | --- | --- |
| 1 | 手順書の置き場が無い | BOX の Word／PPT・Slack・個人メモに散る。「どこにあるか」を人に聞く |
| 2 | 古いまま残る | 直した人がいても、誰がいつ直したかが残らない。古い版と新しい版が並んで、どちらが正か分からない |
| 3 | 探せない | BOX の検索は本文に弱く、Slack は流れて消える。同じ質問が新人のたびに繰り返される |
| 4 | AI が読めない | 会社の決めごとが文章として1か所に無いので、MCP や取込スキルの判断根拠はプロンプトに手書き。直しても資産にならない |
| 5 | ONAiR と繋がらない | 「この機材の使い方」「この案件の申し送り」が、機材台帳・案件詳細から辿れない |

根っこは1つ: **文章を「流れ」ではなく「棚」に置く場所が無い**こと。
ONAiR の方針「フローをストックに変える」（[`_rules.md`](_rules.md)）を、文章にも効かせる。

---

## 3. 使う人と3つの場面

| 場面 | 誰が | どこで | やること |
| --- | --- | --- | --- |
| **書く** | 各分野の担当（制作・技術・営業・総務） | PC・スマホ | まず手入力でそのまま書く。「AI で整える」で Markdown の形にする。テンプレートから作成・AI で下書きを作成 |
| **探す・読む** | 全員（新人・現場・営業） | PC・スマホ | 検索か「AI に聞く」で辿り着く。現場ではスマホで読む。分からなければコメントで聞く |
| **育てる** | スペースの担当（月1回） | PC | 予定日を過ぎたページ・答えられなかった質問・AI 下書きの直され方を見て、ページを直す・書く |

Notion との違いを1行で言うと: **「何でも書ける場所」ではなく「会社の決めごとを、古びない形で置く場所」**。
だから見直し予定（§6-⑦）と AI の「足りないページ」（§7-1）を、Notion に無い中核として持つ。

---

## 4. 概念モデル

### 4-1. 画面に出す言葉（[wording.md](../../wording.md) ルール6・9・10 に沿う）

| 使う語 | 何を指すか | 判断 |
| --- | --- | --- |
| **Wiki** | このアプリ。アプリ切替・タイルの名前 | ご依頼の語。通じるカタカナ語（ルール10）。代替は §10-1 |
| **スペース** | 分野ごとの棚（全社／営業／制作・技術／機材／ONAiR …）。**閲覧範囲の単位** | Notion（チームスペース）・Confluence（スペース）と同じ語 |
| **ページ** | Markdown 1本。木に並ぶ（親ページの下に子ページ） | — |
| **ブロック** | ページの中の段落・見出し・表・画像・注意書き。`/` で追加 | Notion・WordPress と同じ語（ルール10）。運営マニュアルの「ブロック」とは指すものが違うがアプリが別なので衝突しない |
| **データベース** | 行＝ページの集まり。列（項目）を定義した親ページで、行はその子ページ（§4-4） | Notion と同じ語（ルール10）。2026-09-22 に「作る」と決定（§10-3） |
| **ビュー** | データベースの見せ方。表／ボード／カレンダーの3つ。保存でき、タブで切り替える | Notion・Airtable と同じ語 |
| **項目** | データベースの列と、ページの「情報」欄の欄。型は 文字・選択・複数選択・日付・担当・チェック・数値・URL・ONAiR リンク | 「プロパティ」は使わない（ルール9: 基本語）。表の列も情報欄の欄も同じ語 |
| **テンプレート** | ページの型（手順書・議事メモ・障害報告・機材の使い方）。「テンプレートから作る」 | Word・Notion の標準語 |
| **履歴** | 保存のたびに残る版。誰がいつ何を変えたか。2つの版の違いを見られる | 「バージョン履歴」は ONAiR 自身の版の名前で使っているので、ページには「履歴」 |
| **見直し予定** | そのページを担当が次に見直す日（任意・既定なし。入れたページだけ見直しに出る）。過ぎると「要見直し」と表示され、担当に通知 | 造語ではなく説明語。ルール7（12文字以内）。**「期限切れ」とは言わない** — Wiki のページは予定日を過ぎても中身が無効にならない（2026-09-22 のご指摘） |
| **AI に聞く** | Wiki を根拠に質問へ答える対話。出典を必ず付ける | 「AI に質問」（Notion）と同じ意味の基本語 |
| **足りないページ** | AI が出典を出せず答えられなかった質問の一覧。ページを書く種 | 説明語。画面では副題「AI が答えられなかった質問」を添える |

**使わない語**: プロパティ（→ 項目。ページの「情報」欄と、データベースの列）・データベース・ワークスペース・
フロントマター（技術語。書き出しの中でだけ使い、画面には出さない）・アーカイブ（→ 一覧から隠す）。

**動詞と評価の語**（UI の文言は [wording.md](../../wording.md) ルール5・8・9 を徹底する。2026-09-22 のご指示）:

| 場面 | 使う語 | 使わない語 |
| --- | --- | --- |
| 作る | **作成**（ページを作成・テンプレートから作成・AI で下書きを作成。既存画面の「案件を作成」「番組を作成」と同じ） | 作る・足す |
| 増やす・直す・消す | **追加／編集／削除／キャンセル／保存**（ルール8 の組） | 足す・直す・消す・やめる |
| 送る | **送信**（コメント・AI への質問。既存画面は「送信」81 件・「投稿」10 件） | 送る・投稿 |
| 探す | **検索** | 探す |
| 出す・積む | **公開する／登録する** | 出す・積む |
| AI の回答の評価 | **役に立った／言い直して／的外れ**（制作技術支援の `AiChatSheet.tsx` と同じ） | 良い／悪い |
| 版 | **第14版**（画面）。`rev` は列名だけ | rev.14 |
| 技術語 | 画面に出さない: MCP・`body_md`・`pg_trgm`・JSON・スナップショット・段（heavy／light）（ルール5） | — |
| 開発文書の比喩語 | 画面に出さない: 道具・決めごと・棚・札・帯・木・種・口・手つき・作法 → **アプリ／ルール／区分／表示／バナー／ツリー／候補／リンク／操作**（ルール11。2026-09-22 のご指摘「この道具の決めごと」。`check-ui-tokens.mjs` の `metaphor-wording` と `check-mock-wording.mjs` が止める） | — |

### 4-2. Markdown の方言（作るブロックの一覧）

**この表に無いブロックは作らない**（約束2）。全部 GitHub がそのまま描ける書き方に限る。

| ブロック | Markdown | 画面での見え方 |
| --- | --- | --- |
| 見出し 1〜3 | `#` `##` `###` | 目次に出る。`####` 以下は作らない（深い見出しは章分けの合図） |
| 段落・強調・リンク | 素の GFM | — |
| 箇条書き・番号・チェックリスト | `-` `1.` `- [ ]` | チェックは閲覧画面でも押せる（本文の `[x]` を書き換える） |
| 表 | GFM の表 | 列幅は自動。セル内の改行は `<br>` |
| コード | ``` ``` | 配信の設定値・コマンドに使う |
| 引用 | `>` | — |
| **注意書き** | `> [!NOTE]` `[!TIP]` `[!WARNING]` `[!CAUTION]` | 色つきの帯（GitHub の alerts と同じ書き方） |
| **折りたたみ** | `<details><summary>` | 長い補足を畳む（Notion のトグル） |
| 画像 | `![説明](/api/v1/wiki/files/:id)` | 貼り付け・ドラッグで上げる（§5-5） |
| **ONAiR カード** | 案件・機材・部屋・ページへの**ただのリンク** `[名前](/sales/projects/…)` | 貼るとカード（名前・状態・番号）になる。本文は URL のまま |
| 区切り線 | `---` | — |

目次はページの見出しから自動で作る（人が打たない）。図（mermaid）・数式・埋め込み動画は v1 では作らない（§11）。
**データベースはブロックではない**（ページの種類。§4-4）。

### 4-3. ONAiR とのつながり

Wiki が他のアプリと違うのは、**ONAiR のデータへのリンクが「生きたカード」になる**こと。

| 貼るもの | 本文に残る形 | 画面の見え方 | どこから来るか |
| --- | --- | --- | --- |
| 案件 | `[サイエンス・フロンティア](/sales/projects/:id)` | 管理番号・ステージ・実施日のカード | 案件詳細の「Wiki」タブ（このページへの逆リンク） |
| 機材 | `[ATEM 2 M/E](/equipment/items/:id)` | 品名・状態・置き場のカード | 機材台帳の詳細に「使い方のページ」が出る |
| 部屋 | `[第2スタジオ](/calendar/rooms/:id)` | 部屋名・今日の予定 | — |
| ページ | `[貸出ルール](/wiki/p/:id)` | タイトル・スペース | バックリンク（§5-3） |

**本文はただのリンク**なので、書き出した `.md` を GitHub や VS Code で開いてもリンクとして読める。
カードにするのは画面の仕事で、本文の形は変えない（約束1）。

### 4-4. データベース（行＝ページ・Notion 型。2026-09-22 決定）

**データベース＝「項目（列）を定義した親ページ」と「その子ページ（行）」。** ブロックでも別の保存形式でもなく、
ページの種類（`kind='database'`）。だから約束1〜3（本文は Markdown・書けないブロックは作らない・外から同じものが読める）を破らない。

| 何 | どこに持つか | 書き出したときの形 |
| --- | --- | --- |
| 項目の定義（名前・型・選択肢・必須） | 親ページの `wiki_databases.items`（§5-1） | 親フォルダの `_database.md` の YAML の見出し |
| ビュー（表／ボード／カレンダー・絞り込み・並べ替え・表示する列） | 親ページの `wiki_databases.views` | 同上（`views:`） |
| 行の値 | 行ページの `wiki_pages.props`（項目 id → 値） | 行ページ `.md` の YAML の見出し |
| 行の本文（対処の詳しい手順など） | 行ページの `body_md` | 行ページ `.md` の本文 |
| 一覧 | 読むときに子ページを集める（保存しない） | `_index.csv`（Notion の書き出しと同じ） |

**項目の型は9つ**: 文字・選択・複数選択・日付・担当・チェック・数値・URL・**ONAiR リンク**（案件／機材／部屋／ページ。行の中でカードになる）。
リレーション（データベース同士）・数式・ロールアップは v1 で作らない（§11）。

**ビューは3つ**（§10-3c）:

| ビュー | 何ができるか |
| --- | --- |
| **表** | 列の表示／並べ替え／絞り込み。セルをその場で直せる。行の追加はタイトルを打つだけ（ページができる） |
| **ボード** | 選択型の項目（例: 状態）でグループ化。カードをドラッグすると値が変わる |
| **カレンダー** | 日付型の項目で月表示。カードを押すと行ページへ |

ビューは保存でき、タブで切り替える。本文（説明）はビューの上に Markdown で書ける。
スマホでは表を縦のカードにして出し、値の編集もできる（並べ替え・列の定義は PC）。

**ONAiR の既存データと二重に持たない**: 案件・機材・タスク・予定は各アプリが正で、データベースからは ONAiR リンクで参照する。
データベースに向くのは「トラブル事例」「取引先ごとの配信設定」「よくある質問」のような、**ONAiR のどのアプリにも入れ物が無い記録**。

## 5. データの持ち方

### 5-1. 表（migration は着手時に空いている番号を取る。いまの最新は 301）

```sql
-- スペース（棚。閲覧範囲の単位）
CREATE TABLE wiki_spaces (
  id            TEXT PRIMARY KEY,                 -- 短い英数字（genId）
  key           TEXT NOT NULL UNIQUE,             -- URL に出す（/wiki/s/sales）
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT, color TEXT,
  visibility    TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'members')),
  owner_user_id TEXT REFERENCES users(id),        -- 月1回の見直しの担当（§7-5）
  sort_order    INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE TABLE wiki_space_members (                 -- visibility='members' のときだけ使う
  space_id TEXT NOT NULL REFERENCES wiki_spaces(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (space_id, user_id)
);

-- ページ（本文の正は body_md）
CREATE TABLE wiki_pages (
  id            TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL REFERENCES wiki_spaces(id),
  parent_id     TEXT REFERENCES wiki_pages(id),   -- NULL = スペース直下
  sort_order    INT  NOT NULL DEFAULT 0,
  title         TEXT NOT NULL,
  body_md       TEXT NOT NULL DEFAULT '',         -- ★ 本文の正。切り詰めない
  icon          TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_template   BOOLEAN NOT NULL DEFAULT FALSE,
  kind          TEXT NOT NULL DEFAULT 'page' CHECK (kind IN ('page', 'database')),  -- database = 行（子ページ）を持つ親（§4-4）
  props         JSONB NOT NULL DEFAULT '{}',       -- 項目の値（行のとき）。書き出しでは YAML の見出しになる
  tags          TEXT[] NOT NULL DEFAULT '{}',
  owner_user_id TEXT REFERENCES users(id),        -- ページの担当（見直しの通知先）
  review_by     DATE,                             -- 見直し予定（§6-⑦）
  rev           INT  NOT NULL DEFAULT 0,          -- 保存のたびに +1（履歴の番号）
  ai_output_id  TEXT REFERENCES ai_outputs(id),   -- AI が下書きしたページ。差分の起点（§7-3）
  locked_by     TEXT REFERENCES users(id), locked_at TIMESTAMPTZ,   -- 編集ロック（§6-③）
  created_by    TEXT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_wiki_pages_tree ON wiki_pages(space_id, parent_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_wiki_pages_review ON wiki_pages(review_by) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX idx_wiki_pages_props ON wiki_pages USING GIN (props);   -- 拡張なしで使える jsonb の GIN

-- データベース（列＝項目とビューの定義。行は wiki_pages の子ページ。§4-4）
CREATE TABLE wiki_databases (
  page_id    TEXT PRIMARY KEY REFERENCES wiki_pages(id) ON DELETE CASCADE,
  items      JSONB NOT NULL DEFAULT '[]',   -- [{id, name, type, options[], required}]。type は §4-4 の9種
  views      JSONB NOT NULL DEFAULT '[]',   -- [{id, name, type: table|board|calendar, columns[], sorts[], filters[], group_by, date_item}]
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT REFERENCES users(id)
);

-- 履歴（保存 1回 = 1行。全文を持つ。差分は読むときに2版を比べて作る）
CREATE TABLE wiki_page_versions (
  id       TEXT PRIMARY KEY,
  page_id  TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  rev      INT  NOT NULL,
  title    TEXT NOT NULL,
  body_md  TEXT NOT NULL,
  tags     TEXT[] NOT NULL DEFAULT '{}',
  saved_by TEXT REFERENCES users(id),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note     TEXT,                                  -- 「何を変えたか」（任意）
  UNIQUE (page_id, rev)
);

-- リンク（保存時に本文から抜く。バックリンク用）
CREATE TABLE wiki_links (
  from_page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  to_page_id   TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  PRIMARY KEY (from_page_id, to_page_id)
);

CREATE TABLE wiki_comments (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES wiki_comments(id),
  body_md     TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ, resolved_by TEXT REFERENCES users(id),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE wiki_files (                          -- 画像・小さな添付（§5-5）
  id TEXT PRIMARY KEY, page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
  name TEXT NOT NULL, mime TEXT NOT NULL, size INT NOT NULL, storage_path TEXT NOT NULL,
  created_by TEXT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wiki_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, page_id)
);

-- 閲覧の記録（「よく読まれる」と、AI の出典が開かれたか＝条件3 の材料）
CREATE TABLE wiki_page_views (
  id BIGSERIAL PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  via     TEXT NOT NULL CHECK (via IN ('tree', 'search', 'answer', 'link', 'favorite')),
  answer_output_id TEXT REFERENCES ai_outputs(id),   -- via='answer' のとき、どの回答から
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

AI の表（`wiki_ai_threads` / `wiki_ai_messages` / `wiki_ai_gaps`）は §7-4。

### 5-2. なぜ「Markdown を DB の列に」か（ファイルを正にしない）

| 案 | 正の置き場 | 良い点 | 困る点 |
| --- | --- | --- | --- |
| **A. DB の列 `body_md`**（この設計） | PostgreSQL | 権限・検索・履歴・バックアップ（3時間ごと）・同時編集の検出が**既存の仕組みのまま**効く。1つのイメージで配信する構成を変えない | 「ファイル」は書き出し・取り込み・API で出す形になる |
| B. サーバー上の `.md` ファイル（git 管理） | Docker のボリューム | エディタで直接開ける・git の履歴が使える | 権限を自前で作る・検索は自前・バックアップの対象外（`uploads` ボリュームは DB バックアップに入っていない）・同時編集で壊れる・別コンテナ（検証／本番）で git を回す運用が要る |

**A を採る。** 「Markdown ネイティブ」は**形式**の話であって置き場の話ではない。
`.md` として触りたい場面（AI・エディタ・GitHub）は次の3つの口で満たす（約束3）:

1. `GET /api/v1/wiki/pages/:id.md` — `text/markdown` で、YAML の見出し（id・title・space・parent・tags・owner・review_by・updated）を付けて返す
2. MCP ツール `get_wiki_page` — 同じ内容。Claude Code・claude.ai のコネクタからそのまま読める
3. `GET /api/v1/wiki/export?space=sales` — スペースまるごとを **zip（`.md` のフォルダ構成）** で書き出す。データベースは「フォルダ＋`_database.md`（項目とビュー）＋`_index.csv`＋行ごとの `.md`（値は YAML の見出し）」で、Notion の書き出しと同じ形。`POST /api/v1/wiki/import` は逆（Obsidian・Notion の Markdown 書き出しを受ける。Notion の CSV はデータベースとして取り込む）

将来「git のミラー（毎晩、全ページを1つのリポジトリにコミット）」を足す余地は残す（§11）。DB が正なので後から足せる。

### 5-3. 保存のたびにサーバーがやること

1. `wiki_page_versions` に全文を1行足す（`rev` +1）
2. 本文からリンク（`/wiki/p/:id`）を抜いて `wiki_links` を作り直す
3. 本文から見出しを抜いて検索用の列（§5-4）を更新する
4. `ai_output_id` があり、AI の下書きから7日以内なら、`payload_snapshot` と比べて `ai_corrections` に差分を書く（§7-3）
5. `updated_at` を添えて返す。次の保存で `updated_at` が食い違えば `ConflictError`（スケジュール表と同じ形）
6. データベースの行なら、値（`props`）を親の項目定義で検査する（知らない項目・型違いは保存しない。ONAiR リンクは相手の存在を確かめる）

### 5-4. 検索

本番の DB には拡張を1本も入れていない（`qsheet_doc_index` の注記）。**v1 は拡張なしで始める**:

- `title`（×3）・`headings`（見出しだけを抜いた列 ×2）・`body_md`（×1）を `ILIKE` で当て、**点数付けは Node 側**（`similar.ts` と同じ作法。重みを直すたびに migration が要らない）
- 2語以上は AND。スペース・タグ・担当・更新日で絞れる
- 目安: 数千ページ・数十 MB の本文なら `ILIKE` の全走査で十分速い。遅くなったら `pg_trgm`（`contrib` に同梱・trusted なので DB の所有者で `CREATE EXTENSION` できる）の GIN 索引を足す（§10-6）

意味検索（ベクトル）は v1 で作らない。**AI に聞く**の出典探しもこの検索を使う（§7-1）。検索が弱いと AI の出典も弱いので、段D（検索）を段E（AI）より先に作る（§9）。

### 5-5. 画像・添付

- 画像と小さなファイル（10 MB まで）は ONAiR の `uploads/wiki/`（Docker の永続ボリューム・`/qsheet/upload-image` と同じ作法）
- 本文には `![説明](/api/v1/wiki/files/:id)` と書く。書き出しの zip には `files/` として同梱する
- 大きなファイル（動画・設計図）は **BOX へのリンク**を貼る（Wiki の中に置かない）
- ⚠️ `uploads` ボリュームは DB バックアップ（[db-backup-restore.md](../../ops/db-backup-restore.md)）の対象外。画像を大量に置く前に、ボリュームのバックアップを運用に足すか、画像も BOX に置くかを決める（§10-11）

### 5-6. ワークスペースと配線

| どこ | 何を足すか |
| --- | --- |
| `client-wiki/`（新ワークスペース） | Vite・base `/wiki/`・ポート 5181（空き番号）・共通シェル（`shared/src/client/shell/`）・`pcOnlyScreens.ts` |
| `server/src/contexts/wiki/` | `index.ts`・`routes/`（spaces・pages・search・ai・files・export）・`services/` |
| `server/src/contexts/mcp/tools/wiki.tools.ts` | MCP ツール6本（§7-6） |
| `shared/src/client/apps.ts` | `{ key: 'wiki', label: 'Wiki', path: '/wiki', permissionModule: 'wiki', … }`（唯一の正） |
| `client/src/contexts/platform/pages/HomePage.tsx` | `DAILY_KEYS` に `'wiki'`（日々の業務のタイル） |
| 権限の区画 | `ROLE_MODULES`（`permission-role.service.ts`）・`MODULES`（`auth.routes.ts`）・`moduleLabels.ts`・`mcp/gate.ts`・`seed.ts` の5か所に `wiki` を足す（§10-5） |
| `server/src/app.ts` | `serveApp('/wiki', …/client-wiki/dist)` |
| `Dockerfile`・`package.json` | ビルド段 `build-client-wiki`・`build:all`／`typecheck:all`／`dev:all` |

---

## 6. 画面ごとの決めごと

### ① ホーム `/wiki`

- 上に**大きな検索欄**（⌘K）と「**AI に聞く**」の入口。Wiki の入口は「探す」なので、ここが主役
- スペースのタイル（名前・ページ数・担当・最終更新）。押すとそのスペースの目次（②の木を開いた状態）
- 最近更新（10件）・お気に入り・**自分が担当のページで見直し予定日を過ぎているもの**（0件なら出さない）
- 「ページを追加」はホームにも置く（スペースを選んでから作る）

### ② ページ `/wiki/p/:id`

- 左＝スペースのツリー（折りたたみ・ドラッグで並べ替え・`+` で子ページ）／中央＝本文／右＝**情報・目次・履歴・コメント**のタブ
- 見出し行: パンくず（スペース ＞ 親 ＞ …）・状態のバッジ（下書き／公開／要見直し）・「AI作成」のバッジ（AI が下書きしたページ。[wording.md](../../wording.md) ルール1）・更新者と日時
- 右上: **編集**（主ボタン）・AI に聞く（このページについて）・「…」（お気に入り・複製・テンプレートにする・.md で書き出す・一覧から隠す）
- ONAiR カード（§4-3）は本文の中でそのまま描く。案件・機材へは押せば飛べる
- チェックリスト（`- [ ]`）は閲覧画面でも押せる（本文を書き換え、履歴に残る）
- **右パネル「情報」**: 担当・見直し予定・タグ・スペース・作成／更新。ここだけは閲覧画面で直せる（本文の編集ロックとは別）
- バックリンク（このページを指しているページ）は「情報」の下に出す

### ③ 編集 `/wiki/p/:id/edit`（PC・スマホ）

**手入力の使いやすさを最優先にする**（2026-09-22 のご指示）。記号や `/` を覚えなくても、
メモ帳と同じ操作で打てて、あとから **「AI で整える」** で Markdown の形になる。

| 決めごと | 中身 |
| --- | --- |
| **まず打てる** | 開いた瞬間から本文に打てる。段落は Enter で増える。Markdown の記号（`#`・`-`）は**知っていれば効く**が、知らなくても困らない |
| **ツールバーは6つだけ** | 見出し／箇条書き／チェックリスト／表／画像／リンク。文字を選ぶと 太字・リンク が浮かぶ。それ以外のブロック（注意書き・折りたたみ・コード・ONAiR カード）は「その他のブロック」（`/` でも開く） |
| **「AI で整える」が主役** | 手入力のまま（例: 5行のメモ）を選んで押すと、**手順書の形**（見出し・箇条書き・注意書き）の Markdown に整え、**いま／整えたあと** を並べて見せる。「置き換える」「編集して置き換える」「キャンセル」。置き換えても元の文は履歴に残る（§7-1 の `wiki_rewrite`） |
| **「Markdown で見る」は副** | 右に生の Markdown を並べ、どちらを直しても同じ本文が変わる。AI が書いたものを確かめる人・GitHub に慣れた人のための口で、既定では閉じている |
| **自動保存** | 打つのを止めて 1.5 秒で保存（版が +1）。「保存しました 14:02」をヘッダーに表示する。「公開する」で `status='published'`（下書きのうちは検索・AI の出典に出ない） |
| **編集ロック** | ページ単位（運営マニュアル §6-2-1 と同じ。§10-4）: 開いた人が自動で取る／10分手が止まると解ける／manager は引き継げる／読むだけの人は「編集を代わってほしい」を申し出られる。ロックがあっても `updated_at` の突き合わせは外さない |
| **文字を打つ欄** | `BufferedInput`（IME の二重入力を避ける。制作技術支援の決めごと）。本文も同じ扱い |
| **エディタの部品** | **Milkdown**（remark を土台にした ProseMirror。Markdown が文書の正なので往復が壊れにくい。`/`・つまみ・表・共同編集の拡張がある）を第一候補、Tiptap を第二候補。**どちらでも「保存するのは Markdown の文字列」は変えない** |

### ⑨ 編集（スマホ・同じ URL）

**スマホでも書ける**（2026-09-22 のご判断。§10 の「決まったこと」）。ただし PC の画面を縮めるのではなく、**手入力＋「AI で整える」**に絞る。

- 上＝戻る・題・「公開する」／中央＝本文（メモ帳と同じ操作）／下＝**ツールバー 5つ**（見出し／箇条書き／チェック／写真／**AI で整える**）をキーボードのすぐ上に固定
- 「AI で整える」は下シートで **整えたあと** を見せ、「置き換える」（52px）か「キャンセル」。いま／整えたあと の2列は置かない（幅が無い）— 元の文は本文に残っているので比べられる
- 表の列の増減・ブロックの並べ替え・「Markdown で見る」はスマホに置かない（PC で）
- 編集ロック・自動保存は PC と同じ。写真は端末のカメラ／写真から上げる（§5-5）

### ④ 検索 `/wiki/search?q=`

- 左＝絞り込み（スペース・タグ・担当・更新日・状態）／右＝結果。1件＝タイトル・スペース・**一致した見出し**・抜粋（当たった語を太く）・更新日
- 結果の上に「**この質問を AI に聞く**」。検索で見つからないときの次の一手を、同じ画面に置く
- スマホでは下タブ「検索」から同じ画面（§6-⑧）

### ⑤ AI に聞く `/wiki/ask`

- 左＝スレッド一覧（**本人のみ**。制作技術支援の壁打ちと同じ判断）／中央＝会話／右＝**AI が読んだページ**（出典の候補）と注意書き
- 回答は Markdown で描き、末尾に**出典のチップ**（ページ名・見出し・引用1行）。押すとそのページの見出しへ飛ぶ（`via='answer'` で閲覧を記録 → 条件3）
- **出典が無いことは答えない**（§10-8）。「Wiki にはまだ書かれていません」と返し、**足りないページ**に登録する（同じ質問が何回来たかを数える）。そこから「ページを作成」を押すと、質問をタイトルにした下書きができ、望めば AI が会話を材料に下書きを書く（§7-2）
- 回答ごとに 3値のフィードバック（**役に立った／言い直して／的外れ**）と任意の一言。「ページにする」を押した回答は採用の印になる
- ページ②の「AI に聞く」から開いたときは、そのページと子ページを先に読む（会話の文脈に入れる）

### ⑥ 履歴 `/wiki/p/:id/history`（PC専用）

- 左＝版の一覧（版・日時・誰が・「何を変えたか」の一言）／右＝**2つの版の違い**（行単位。追加した行は緑・削除した行は赤）
- 「この版に戻す」は**新しい版として**保存する（履歴は消さない・上書きしない）
- AI が下書きした版には「AI作成」のバッジ。人が直した版との違いが、そのまま条件2の差分（§7-3）

### ⑩ データベース `/wiki/p/:id`（`kind='database'` のページ）

- 同じ3列。中央は本文（説明）の下に**ビューのタブ**（表／ボード／カレンダー）・絞り込み・並べ替え・「項目」。右パネルは「項目」（列の定義。名前・型・選択肢・必須）
- **行を追加**はタイトルを打つだけ（子ページができ、ツリーにも出る）。行を押すとその行ページ（②と同じ画面。「情報」欄に項目の値が並ぶ）
- 表: セルをその場で直せる。ボード: ドラッグで選択型の値が変わる。カレンダー: 日付型の項目で月表示
- ビューの設定は保存され、開いた人全員に同じに見える（個人ごとの絞り込みは残さない）
- スマホ: 表は縦のカード。値の編集はできる。並べ替え・項目の定義・ビューの追加は PC（`WIKI_PC_ONLY` ではなく、画面の中でその操作だけ PC に案内）
- `src/pcOnlyScreens.ts`: データベースのページは `WIKI_MOBILE_OK`

### ⑦ 見直し `/wiki/review`

**月1回の場**。3つのタブ:

| タブ | 中身 | 出どころ |
| --- | --- | --- |
| **見直し予定** | 予定日を過ぎた・14日以内・担当が空のページ。1行＝ページ・スペース・担当・期限・最終更新。「見直した」を押すと次の予定日を入れ直す（予定日は任意・既定なし・§10-10。入れたページだけここに出る） | `wiki_pages.review_by` |
| **足りないページ** | AI が答えられなかった質問（回数順）。「ページを作成」「却下」 | `wiki_ai_gaps` |
| **AI の直され方** | 今月の下書きの無修正率・よく直される点・回答の評価の内訳。担当の名前と「見直した」の記録 | `get_ai_feedback_digest`（kind = `wiki_*`） |

担当は `wiki_spaces.owner_user_id`。毎月1日に「今月の見直し」の通知（`notification_templates`・制作技術支援の月次 AI レビューと同じ作法）。

### ⑧ 閲覧（スマホ・同じ URL）

- 1画面1目的: **読む**。上＝パンくずと題・本文は縦1列・目次は上部の「目次」ボタンで下シート・ツリーは左上の「≡」で下シート。右上の「編集」から ⑨ へ
- 下タブは共通の3つ（ホーム／やること／検索）。「AI に聞く」は検索画面の上に置く（入口を増やさない・[ia.md](../../ia.md)）
- コメントは書ける（現場で気づいたことを残す。担当に通知）
- `src/pcOnlyScreens.ts`: 履歴の差分・スペース管理・テンプレート管理を `WIKI_PC_ONLY`、ホーム・ページ・**編集**・検索・AI に聞く・見直しを `WIKI_MOBILE_OK`（[`_rules.md`](_rules.md)「編集・設定系は PC」の例外。理由は「現場で手入力して AI で整える」が主な使い方になるため）

---

## 7. AI（「AIを使い捨てにしない」の5条件を先に満たす）

ルート [`CLAUDE.md`](../../../CLAUDE.md) の絶対原則により、AI の3機能は**フィードバックループを設計に組み込んでから**作る
（[`.claude/skills/ai-feedback-loop/`](../../../.claude/skills/ai-feedback-loop/SKILL.md)）。
呼び出しは既存の `ai-model.ts`（段 light／heavy）・`ai-output.service`・`ai-usage.service` を使い、新しい呼び出し口は作らない。

### 7-1. 3つの機能と段

| 機能 | `AiJob` | 段 | なぜその段か（[ai-models.md](../../ai-models.md)「間違いに気づけるか」） |
| --- | --- | --- | --- |
| **AI に聞く** | `wiki_answer` | **heavy 常に** | 手順の誤り（「先に電源を切る」）は読んだだけでは気づけず、現場で実行されて初めて分かる。出典を必須にしても、要約の段階で意味が変わる誤りは残る |
| **AI で下書きを作る** | `wiki_draft` | **heavy 常に** | 材料（会話・案件・機材・議事録）を束ねた長い文から書く。KPT・週報と同じ理由 |
| **AI で整える** | `wiki_rewrite` | light（4,000字超で heavy） | **主な使い方は「手入力のメモを手順書の形（見出し・箇条書き・注意書き）の Markdown に整える」**（2026-09-22 のご指示）。ほかに 見出しを付ける・箇条書きに・用語を揃える・短くする。**いま／整えたあと を並べて見せる**ので、崩れは読めば分かる。置き換えても元の文は履歴に残る |

「AI に聞く」の作り: ①質問を §5-4 の検索にかけ、**その人が読めるスペースの公開ページ**から上位 8 ページ（＋②から開いたときはそのページと子ページ）を材料にする → ②構造化出力 `{ answer_md, citations[{page_id, heading, quote}], confidence }` を必須にし、**引用が出せない回答は「書かれていません」に落とす**（議事録の「決定事項に引用必須」と同じ規律） → ③回答・材料のページ id・プロンプトの版を `ai_outputs` に全文で残す。

### 7-2. 「足りないページ」＝ AI がマニュアルを育てる経路

出典が無く答えられなかった質問は捨てずに `wiki_ai_gaps` に登録する（同じ質問は回数を +1）。
月1回の見直し（⑦）で担当が「ページを作成」を押すと、質問をタイトルにした**下書き**ができる。
望めばそこで「AI で下書きを作成」を呼び、会話（`wiki_ai_threads`）と、案件・機材など ONAiR のデータを材料に本文を書く。
人が直して公開すると、次からその質問に**出典つきで答えられる**ようになる — **使うほど賢くなる**のはこの経路。

### 7-3. 5条件の充足表

| 条件 | AI に聞く（`wiki_answer`） | 下書き（`wiki_draft`） | 整える（`wiki_rewrite`） |
| --- | --- | --- | --- |
| **1. 出力の記録** | ○ `ai_outputs.payload_snapshot` に質問・材料のページ id と `updated_at`・回答・出典・`prompt_version`。1発言 = 1行（`target_table='wiki_ai_messages'`） | ○ 下書きの全文＋材料（会話 id・案件 id …）。`wiki_pages.ai_output_id` に紐づける | ○ 元の文と結果の全文 |
| **2. 人の修正差分** | ○ 対話は「直される」ものではないので 3値フィードバック（役に立った／言い直して／的外れ）＋任意の一言（制作技術支援の壁打ち §5-2b と同じ） | ○ **公開時にサーバーが自動比較**（before = `payload_snapshot.body_md`・after = 公開した本文・7日窓）。行の一致率で `none`／`rephrase`／`fix`、公開せず削除なら `reject`。人には「何を変えたか（任意）」欄だけ | ○ 「置き換える」を押した＝`none`、直してから置き換えた＝自動比較、「やめる」＝`reject` |
| **3. 成果の紐づけ** | ○ **読み取り時に導出**: 出典が開かれた率（`wiki_page_views.via='answer'`）・「ページにする」に進んだ率・同じ質問が7日以内に再び来た率（未解決の目安） | ○ 7日以内に公開されたか・公開後30日の閲覧数・公開後30日に他の人が直した回数（安定度） | △ 置き換え率までは取れるが、その後の良し悪しは分からない（読めば分かる種類なので 2 で十分とする） |
| **4. 改善への還流** | ○ `get_ai_feedback_digest` に kind `wiki_answer` を足し、的外れの多い話題・出典が開かれない回答の傾向を advice としてプロンプトに載せる。**知識そのものは Wiki のページ**なので、足りないページを書くことが最大の還流（7-2） | ○ よく直される点（見出しの深さ・長さ・用語）を advice に載せる | ○ 同左 |
| **5. レビュー頻度と担当** | △ **月1回・各スペースの担当**（`wiki_spaces.owner_user_id`）が ⑦ で見る。頻度と担当は決めた。**仕組み（通知と「見直した」の記録）は段F で作る** | △ 同左 | △ 同左 |

**穴（✕ 相当）を隠さず書く**: 条件3 の「役に立ったか」は本人の申告と代理指標（出典を開いた・ページにした）で、
**答えが現場で正しかったか**までは取れない。代替は、回答から作ったページに**コメント**が付いた数（現場の「違う」）を
その回答の成果として数えること（コメントは `page_id` から `ai_output_id` へ辿れる）。

**計測を壊しやすい所**: 公開後の**通常の更新**（見直しで直した・組織変更で直した）を AI の誤りとして数えないよう、
差分は **AI の下書きから7日以内**に限り、それ以降の更新は `ai_corrections` に書かない（既存の `CORRECTION_WINDOW_DAYS` と同じ）。

### 7-4. AI の表

```sql
CREATE TABLE wiki_ai_threads (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
  page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,   -- ②から開いたときの文脈
  space_id TEXT REFERENCES wiki_spaces(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
CREATE TABLE wiki_ai_messages (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES wiki_ai_threads(id) ON DELETE CASCADE,
  seq INT NOT NULL, role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content_md TEXT NOT NULL,
  citations JSONB,                                  -- [{page_id, heading, quote}]
  confidence TEXT CHECK (confidence IN ('cited', 'none')),
  ai_output_id TEXT REFERENCES ai_outputs(id), model TEXT, prompt_version TEXT,
  feedback TEXT CHECK (feedback IN ('good', 'rephrase', 'reject')), feedback_note TEXT,
  feedback_at TIMESTAMPTZ, feedback_by TEXT REFERENCES users(id),
  spawned_page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,   -- 「ページにする」の採用の印
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (thread_id, seq)
);
CREATE TABLE wiki_ai_gaps (                         -- 足りないページ
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL, normalized TEXT NOT NULL,  -- 同じ質問をまとめる鍵（空白・記号を落とした形）
  count INT NOT NULL DEFAULT 1, last_asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  thread_id TEXT REFERENCES wiki_ai_threads(id) ON DELETE SET NULL,
  space_id TEXT REFERENCES wiki_spaces(id),         -- 推定した棚（無ければ NULL）
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'written', 'dismissed')),
  page_id TEXT REFERENCES wiki_pages(id) ON DELETE SET NULL,
  resolved_by TEXT REFERENCES users(id), resolved_at TIMESTAMPTZ,
  UNIQUE (normalized)
);
```

### 7-5. 守ること

- **AI に HTML を書かせない**（メール取込で決めた判断と同じ）。AI の出力は Markdown 文字列で、描くのは画面
- **AI が読むのは、その人が読めるスペースの公開ページだけ**。下書き・一覧から隠したページ・`members` のスペースは、権限の無い人の回答の材料にしない
- **原文を切り詰めない**。`payload_snapshot` には材料のページの `id` と `updated_at` を入れ、本文は `wiki_page_versions` から復元する（全文を二重に持たない）
- **プロンプトの版を最初から持つ**（`wiki-answer-v1` …）。無いと改善の前後を比べられない
- 使用量の `kind` を3つに分ける（`wiki_answer`／`wiki_draft`／`wiki_rewrite`）。混ぜると「1件あたりいくら」が嘘になる

### 7-6. MCP ツール（外から読む・書く）

| ツール | 何をするか | 権限 |
| --- | --- | --- |
| `search_wiki` | 検索（§5-4）。タイトル・見出し・抜粋を返す | wiki reader |
| `get_wiki_page` | ページ1本を **Markdown（YAML の見出し付き）**で返す | wiki reader |
| `list_wiki_pages` | スペースの木（id・タイトル・親・更新日） | wiki reader |
| `create_wiki_page` | **下書き**として作る（`status='draft'`・「AI作成」の札・`ai_outputs` kind `wiki_draft` に記録） | wiki editor |
| `update_wiki_page` | 本文の置き換え／末尾への追記。`updated_at` を添える（取り合いは 409）。AI 由来なら差分を記録 | wiki editor |
| `query_wiki_database` | データベースの行を項目で絞って返す（値と本文の先頭）。行の追加は `create_wiki_page` に親と値を渡す | wiki reader |

書き込みは**必ず下書き**。公開は人が画面で押す（メール取込の「AI は起票まで・確定は人」と同じ）。
`mail-intake` などのスキルは `search_wiki`／`get_wiki_page` で**会社の決めごとを読んでから**動けるようになる —
プロンプトに手書きしていた仕分け表を Wiki のページに移せる（[mcp-server.md](../../mcp-server.md) にツールを足す）。

---

## 8. 権限

`permissionModule` は **`wiki`**（新しい区画・§10-5）。

| できること | 要る権限 |
| --- | --- |
| 読む・検索・AI に聞く・コメント・お気に入り | reader（**全員に既定で付ける**。型の既定値） |
| ページを作る・直す・公開する・テンプレートから作る・.md で書き出す | editor |
| スペースを作る・担当と閲覧範囲を決める・一覧から隠す・編集を引き継ぐ・取り込む・テンプレートを組織に登録 | manager |

閲覧範囲は**スペース単位**（`all`／`members`）。ページ単位の共有は作らない（§11）。
`members` のスペースは検索結果にも AI の出典にも出ない（読めない人には**存在ごと見えない**）。

---

## 9. 作る順

| 段 | 何を | 終わったときに何ができるか |
| --- | --- | --- |
| **A 器** | ワークスペース `client-wiki`・レジストリ登録・区画 `wiki`・表（§5-1）・スペースとツリー・ページ閲覧（Markdown の描画・目次・ONAiR カード）・履歴の保存 | ページが**読める**（まだ画面からは書けない。取り込みか API で入れる） |
| **B 書く** | 手入力優先のエディタ（ツールバー6つ・`/`・Markdown で見る）・**スマホの編集**・自動保存と編集ロック・画像・テンプレート・下書き／公開 | **書いて読める。ここで初めて使える** |
| **C データベース** | 項目の定義・行＝子ページ・表／ボード／カレンダーのビュー・ONAiR リンクの項目・書き出しの CSV（§4-4） | Notion のデータベースの使い方ができる |
| **D 検索** | 検索・バックリンク・お気に入り・最近更新・スマホの閲覧・`.md` の REST と書き出し | 検索できる。AI 抜きでも Wiki として成立する |
| **E AI** | AI に聞く（出典・3値フィードバック・足りないページ）・下書き・**整える（手入力のメモ→Markdown が主）**・MCP 6本・`ai_outputs`／`ai_corrections`／成果の導出・digest | 使うほど賢くなる経路が閉じる |
| **F 見直し** | 見直し（期限・担当・毎月の通知・「見直した」）・コメント・月次レビューの画面・取り込み・案件詳細と機材台帳への「Wiki」のリンク | 見直しが回り続ける |

**段B まで通して初めて使える。** 段A だけで止めると「読めるだけの画面」が増える。
**段E は段D の検索が土台**（検索が弱いと出典も弱い）。段C は段B のあと、段D と並行できる。段E と段F も並行できる。

検査: `npx tsc -b client-wiki` ／ `npm run lint` ／ `npm run test` ／ `npm run verify:ui wiki` ／ `npm run verify:ime`。
1ファイル 400 行（`check-file-size.mjs`）はエディタで必ず当たるので、最初から部品に割る
（`WikiTree` / `WikiEditor` / `WikiSlashMenu` / `WikiInspector` / `WikiMarkdownPane` …）。

---

## 10. 決まったこと（12件・2026-09-22・利用者の判断）

**全件回答をいただいた。** 以降この表が正で、本文はこれに合わせてある
（[`production-manual.md`](production-manual.md) §10 と同じ運用）。

| # | 決まったこと | どこに効くか |
| --- | --- | --- |
| 1 | 名前は **「Wiki」**（`key: 'wiki'`・`/wiki`・トップの「日々の業務」側のタイル） | §4-1・`apps.ts` |
| 2 | 本文の正は **DB の列 `body_md`**。ファイルは API・MCP・書き出し／取り込みで出す | §5-2 |
| 3 | **データベースも作る**（推しの「作らない」を採らず） | §4-4・§6-⑩・§9 段C |
| 3b | データベースは **行＝ページ（Notion 型）**。値は YAML の見出し・列とビューの定義は親ページに | §4-4・§5-1 |
| 3c | v1 のビューは **表＋ボード＋カレンダー** | §4-4・§6-⑩ |
| 4 | 同時編集は **v1 はページ単位の編集ロック、v2 で Yjs** | §6-③ |
| 5 | 権限は **新しい区画 `wiki`**（閲覧を全員の既定に）＋**スペース単位の閲覧範囲** | §8・§5-6 |
| 6 | 検索は **拡張なしで始め、遅くなったら `pg_trgm`** | §5-4 |
| 7 | 「AI に聞く」は **heavy 常に** | §7-1 |
| 8 | 出典の無い質問は **答えず、足りないページに登録する** | §6-⑤・§7-2 |
| 9 | **スマホでも編集できる**（手入力＋「AI で整える」に絞る） | §6-⑨ |
| 10 | 見直し予定は **既定なし**（ページごとに手で入れる。入れたページだけ見直しに出る）。**画面では「期限切れ」と言わない**（2026-09-22 の追加のご指摘。Wiki のページは予定日を過ぎても中身が無効にならないので、バッジは「要見直し」・色も異常の赤ではなく情報の色） | §6-⑦・§4-1 |
| 11 | 画像・添付は **小さなものは ONAiR の `uploads/wiki`、大きなものは BOX へのリンク**。`uploads` のバックアップを運用に足す | §5-5 |

同日のご指示（本文に反映済み）: 編集画面は**手入力の使いやすさ優先**（§6-③）／**手入力したものを AI で Markdown に整える**（§6-③・§7-1）／
**UI の語は [wording.md](../../wording.md) を徹底**（§4-1・ルール11）。

### まだ論点にしていないこと（実装を止めない・使ってから決める）

- 案件・機材の詳細に「Wiki」タブを出す時期（段F。先に Wiki 側のリンクだけ作る）
- データベースのリレーション（データベース同士の関連）・数式・ロールアップ・ギャラリー／タイムラインのビュー（表・ボード・カレンダーを使ってみてから）
- 見直し予定をスペースごとの既定で入れるか（#10 は「既定なし」で始め、入れ忘れが目立てば検討）
- git のミラー（毎晩、全ページをリポジトリへ）を足すか
- 「AI が優先して読むページ」（会社の決めごとの中核）に印を付けるか — まず全公開ページを対象にして、精度を見てから

---

## 11. v1 でやらないこと

- **データベースのリレーション・数式・ロールアップ・ギャラリー／タイムラインのビュー** — 表・ボード・カレンダーを使ってみてから（§10-3）
- **ページ単位の権限・社外への公開 URL** — 閲覧範囲はスペース単位だけ
- **Yjs の同時編集** — v2（§10-4）
- **図（mermaid）・数式・動画の埋め込み** — Markdown で書けるが、描く部品を増やすので要望が出てから
- **意味検索（ベクトル）** — `pgvector` を本番 DB に入れない判断（`qsheet_doc_index` と同じ）
- **Notion からの取り込みの作り込み** — Notion の Markdown 書き出しを「取り込む」で受けるだけ（データベースは表になる）
- **通知の細分化**（ページの更新を購読する等）— 見直し予定と月次の通知だけ
- **git のミラー** — DB が正なので後から足せる

---

## 12. 関連する文書

- 同じ形の設計書の先例: [`production-manual.md`](production-manual.md)（運営マニュアル。用語の決め方・編集ロック・判断の表の書式）
- 見た目の規律: [`_rules.md`](_rules.md)・[`_tokens.md`](_tokens.md)・[`mockups/DESIGN_POLICY.md`](mockups/DESIGN_POLICY.md)
- 言葉: [`../../wording.md`](../../wording.md)（ルール6・8・9・10）
- 入口の決めごと: [`../../ia.md`](../../ia.md)（入口は1つ・`apps.ts` が唯一の正）
- AI: [`../../ai-models.md`](../../ai-models.md)（段の考え方）・[`qsheet-v4-coding/04-ai.md`](qsheet-v4-coding/04-ai.md)（壁打ち・ナレッジ・月次レビューの先例）・
  [`../../mcp-server.md`](../../mcp-server.md)（ツールを足す場所）・[`../../../.claude/skills/ai-feedback-loop/SKILL.md`](../../../.claude/skills/ai-feedback-loop/SKILL.md)
- 同時編集の器: [`../../../server/src/shared/collab/roomManager.ts`](../../../server/src/shared/collab/roomManager.ts)
- 小さなブロックアプリの作り: [`../../../client-daily/CLAUDE.md`](../../../client-daily/CLAUDE.md)
- 2026年10月の再編（サンプルの管理番号 `SCS-0007` の出どころ）: [`../../reorg-2026-10-plan.md`](../../reorg-2026-10-plan.md)
