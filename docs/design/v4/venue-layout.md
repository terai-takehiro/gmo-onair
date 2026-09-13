# 会場図面 — 制作技術支援の新しいミニアプリ（設計・2026-09-13）

> **状態**: 設計（未実装）
> **最終確認**: 2026-09-13
> **位置づけ**: 制作技術支援に足す9つ目のミニアプリ「会場図面」の正（何をする道具か・利用者に見せる語・画面・縮尺の担保・データの持ち方・運営マニュアルとの連携・作る順）。**実装はまだ1行も書いていない。** §14 の8件はご判断待ちで、本文は推奨案で書いてある

モックは Claude Design のキャンバス（押せる試作。PC 編集・並べるのプレビュー・仕上がり・冊子に差し込んだ紙面・スマホ閲覧・考え方の地図）:

- **https://claude.ai/code/artifact/2fab0919-8a7f-483b-9276-a58d792923f6**
  （作業ファイルは [`mockups/native/venue-layout/`](mockups/native/venue-layout/README.md)。
  書式は [`production-manual.md`](production-manual.md) と同じ `.dc.html` ＋ `canvas.json`）

依頼の呼び名は「会場図面**シミュレーター**」だが、画面と文書では **「会場図面」** に寄せた。
「シミュレーター」は何をする道具かを名前で伝えず、ラベル12文字（[wording.md](../../wording.md) ルール7）を超え、
画面の外で通用する語でもない（ルール6）。図面を置く・並べる・冊子に載せる道具なので、
資料の名前をそのままアプリ名にする（運営マニュアルの「冊子」と同じ考え方）。

---

## 0. 経緯

依頼（2026-09-13）の要点:

- 制作技術支援（`client-techops/`）のミニアプリとして、**GMOサムライスタジオ 用賀の会場図面 PDF** を取り込み、
  **各階・各エリアごとに正しい縮尺を反映した**簡易なレイアウトの道具を作りたい
- 置けるもの: 任意の大きさの図形（四角と丸）・人の俯瞰イラスト・**備品リストの寸法どおりの備品**
- 便利機能: 椅子を **●×●** の形で一気に並べる
- **縮尺が一致していることが最重要**
- 作った図面を**運営マニュアル側と図として共有**し、冊子側で図を編集しようとしたら会場図面側へ遷移して戻る、切れ目のない連携
- **誰でも扱える**（分かりやすい・簡潔・PowerPoint のような）こと
- 追加: 昭特（shotoku.tv）の**ペデスタル TP-90B**・**クレーン TK-53A／TK-53AL**（台車 **TI-04B**）を、俯瞰イラストと忠実なサイズ感で図面に投入したい

添付の PDF は2本:

| PDF | 中身 | この設計での扱い |
| --- | --- | --- |
| `26F平面図.pdf`（Illustrator 出力・2026-08-07 更新・4ページ・858.898×1207.56pt） | p-1＝26F・p-2＝27F の平面図、p-3＝A-A／B-B 断面、p-4＝トラスの寸法 | 通り芯から**階ごとに2軸で縮尺合わせ**し、エリア・固定物の mm 座標と下敷き PNG を作った（§8・§10） |
| 備品リスト（最終更新 2026.05.13・3ページ・文字は抽出不可） | 5群 24 行（テーブル・チェア／ステージ 6・モニター 4・家電 4・案内・サイン／パーテーション 6・運営・サービス備品 4） | 画像から転記して**備品カタログ**にした。寸法がリストに無いものは推定値に「推定」の印（§11） |

昭特の製品ページは作業環境から開けなかったため、検索で確定できた値（積載・ストローク・最高レンズ軸高）と
仮置きの値（ベース径・アーム長・台車の縦横）を分けて持つ（§11-2・§14-6）。

---

## 1. 結論（先に答え）

**会場図面は「用賀の図面の上に、PowerPoint と同じ手つきで椅子・机・人・カメラを実寸で置き、運営マニュアルの紙面に縮尺つきで載せる」道具。**

縮尺は利用者の仕事ではなく、**階の下敷きと備品カタログが持つ**。利用者が新しく覚える操作は「並べる」1つ。
CAD・お絵かき・3D に見えた瞬間、mm を打つ欄が最初に目に入った瞬間が負けである。

利用者に見せる語は **5つ**だけにする。

| 語 | 意味 |
| --- | --- |
| **会場図面** | 図面1件。案件か番組に紐づき、資料番号 `VL-202609-0001` を持つ。ミニアプリの名前も同じ |
| **階・エリア** | 26F／27F と、その中の WORLD STUDIO・ROOM A などの区画。図面は1エリア（または階全体）を選んで始める |
| **品目** | 図面に置くもの全部（備品 24・カメラ 4・人 3・図形 5） |
| **並べ方** | 劇場形式・スクール形式・島形式・円卓・コの字・ロの字・格子の7つ |
| **下敷き** | 縮尺合わせ済みの建築図面（PDF から作った画像）。動かせない |

動詞は共通ルールどおり **追加／編集／削除／キャンセル／保存**（[wording.md](../../wording.md) ルール8）に、
業務の動詞 **置く・並べる・差し込む・書き出す** を足す。

画面は **PC 5枚（うち管理 2枚）・スマホは②の閲覧 1枚**。

```
ハブ（JourneyPage）の「会場図面」タイル（MiniAppTiles の9枚目・件数は別クエリ）
 └ ① 一覧            /techops/venue-layouts?project=…     ← 案・状態・「冊子 OM-… に載っています」。両方の端末
     └ ② 編集         /techops/venue-layouts/:id           ← PC＝編集（左=置く・並べる・数量／中央=図面／右=品目の設定）
     │                                                       スマホ＝閲覧（同じ URL。ManualDetailRouter と同じ薄い親）
     └ ③ 仕上がり     /techops/venue-layouts/:id/preview   ← PC専用。用紙・縮尺・凡例・数量表・検査・PDF／PNG
左メニュー「管理」節（manager・段F）
 ├ ④ 会場と階        /techops/venue-floors ・ /:id         ← 取り込み・縮尺合わせ・エリア・固定物・確認済み
 └ ⑤ 備品カタログ    /techops/venue-catalog               ← 寸法・保有数・「推定」の消し込み
```

| # | 画面 | 端末 | `pcOnlyScreens.ts` |
| --- | --- | --- | --- |
| ① 一覧 | 両方 | `TECHOPS_MOBILE_OK` |
| ② 編集（スマホは閲覧） | 両方 | `TECHOPS_MOBILE_OK` |
| ③ 仕上がり | PC専用 | `TECHOPS_PC_ONLY` |
| ④ 会場と階 | PC専用・manager | `TECHOPS_PC_ONLY` |
| ⑤ 備品カタログ | PC専用・manager | `TECHOPS_PC_ONLY` |

導線: タイル → ①「会場図面を作る」→ 作成ダイアログ（**名前・階とエリア・ひな形／前の図面を複製** の3手）→ ②。
左メニュー「ミニアプリ」節に1行足す（`nav.ts` の `listPathOf` と個別画面の正規表現）。
`MiniAppSwitcher` の `ORDER` とスマホ下タブ（3本固定）には入れない — 運営マニュアルと同じ前例。
②は共通シェルの左メニューを畳んで開き、`setProductionNavContext()` で案件の文脈を保つ。逃げ先は常に①。

**「縮尺が一致していること」を実装に落とすと、こうなる:**
図面の座標は全部 **mm**（階の絶対座標）で持ち、px は一切保存しない。下敷きは階ごとに **X と Y で別々の縮尺**を持って貼る
（用賀の図は Illustrator で非等方に伸ばされており、1軸の縮尺だと 10m で 43cm ずれる — §8）。
品目の寸法は備品カタログが持ち、備品・人・カメラは**伸ばせない**。書き出しには必ず **1m バー**が載り、紙に定規を当てて確かめられる。

---

## 2. いまの何が問題か

| # | 症状 | 何が起きているか |
| --- | --- | --- |
| 1 | 図に縮尺が無い | 会場図は PowerPoint の図形で描かれ、椅子の四角が 535mm なのか 600mm なのかは描いた人しか知らない。「縮尺が一致していること」が依頼の最重要事項なのは、いまそれが担保されていないから |
| 2 | 備品の寸法を毎回読み直す | 備品リストは文字が抽出できない PDF で、W1800×D600 を目で読んで図形の大きさに写している。同じ長机を案件ごとに描き直す |
| 3 | 椅子を1脚ずつ置く | 劇場形式 50 脚を並べるのに 50 回コピーする。列の間隔・通路幅は毎回手加減 |
| 4 | 図が冊子と切れている | 運営マニュアルに貼った図は画像で、会場図を直しても冊子は直らない。冊子から図の編集に戻る道も無い |
| 5 | カメラの居場所と届く範囲が図に無い | ペデスタル・クレーンは「だいたいここ」で、アームが客席に届くかどうかは当日に分かる |
| 6 | 図面が案件から辿れない | 図は個人の PC にあり、案件（管理番号）にも資料番号にも結びつかない。冊子に載った図がどの版かを照合できない |

根っこは2つ: **図が縮尺を持たない**ことと、**図が ONAiR の外にある**こと。
つなぎ方は「CAD を入れる」ではなく、**縮尺を道具の側が持ち、利用者は PowerPoint の手つきで置くだけ**の編集画面でなければならない。

---

## 3. 使う人と場面

| 場面 | 誰が | どこで | やること |
| --- | --- | --- | --- |
| **組む**（本番の1〜2週間前） | 制作（P・AD） | PC | 案件から図面を起こし、エリアを選び、客席を「並べる」で組む。ステージ・司会台・モニターを置く。A案／B案を複製で作る |
| **技術打ち合わせ** | 技術・カメラ | PC | ペデスタル・クレーンを置き、アームの向きと**カメラが届く範囲**を見る。搬入経路（ELV13 かご 1,850×2,010・積載 2,150kg）を検討する |
| **冊子に載せる** | 制作 | PC | 運営マニュアルの紙面に `venue.layout`（図）と `venue.items`（数量表）を差し込む。図を直したくなったら冊子から図面へ移り、戻る |
| **見る**（当日） | 現場の全員 | スマホ・紙 | 配られた冊子の図、または ONAiR のスマホ画面で図面を見る。品目を押して札（名前・寸法・数）を読む。数量表を見る |
| **会場と寸法を守る**（随時） | manager | PC | ④で階の縮尺合わせと4点の実寸検証を記録する。⑤で「推定」の寸法を確定値に差し替える。段F で用賀以外の会場を足す |

GMO の現場には**専任の CAD オペレーターもデザイナーもいない**。だから編集画面は「製図ソフトを覚える」ではなく
「**PowerPoint と同じ手つきで動く**」ことを最優先にする。運営マニュアル（[production-manual.md](production-manual.md) §3）と同じ規律。

---

## 4. 概念モデル

### 4-1. 見せる5語（§1）と、隠す語

| 隠す語 | どうするか |
| --- | --- |
| シミュレーター | **「会場図面」**。資料の名前をそのままアプリ名にする |
| キャンバス／アートボード | **「図面」** |
| オブジェクト／エレメント／ブロック | **「品目」**。「ブロック」は運営マニュアルの差し込みブロックの語なので、図面に置くものには使わない |
| レイヤー／z-index | **「重なり」**（前面へ・背面へ）。数字は出さない |
| スナップ／ガイド | **「すいつき」**（運営マニュアルと同じ） |
| プリセット／テンプレート | **「並べ方」**（客席の組み方）／**「ひな形」**（図面の型） |
| フットプリント | **「足元の大きさ」** |
| スイープ／旋回範囲 | **「カメラが届く範囲」** |
| 校正／キャリブレーション／原点 | **「縮尺合わせ」**。④の管理画面にだけ出る語で、編集画面には出さない |
| エクスポート | **「書き出す」**。出るものは PNG と PDF |
| バリアント／リビジョン | **「案」**（A案・B案）／**「版」**（rev.N） |
| グリッド | **「方眼」**（1m）・**「通り芯」**（X16〜X9・Y16〜Y9） |

残す語（PowerPoint と同じで画面の外でも通用する — ルール6）: **ズーム・グループ化・整列・複製**。
ラベルは12文字以内、口語・比喩・造語を作らない（ルール7・9）。

### 4-2. 「ブロック」は冊子の語、「品目」は図面の語

運営マニュアルは紙面に置く箱を「ブロック」と呼ぶ（[production-manual.md](production-manual.md) §4-2・2026-09-12 決定）。
会場図面は冊子に**差し込みブロック**として載るので、同じ画面に「ブロック（冊子の箱）」と「品目（図面に置くもの）」が並ぶ。
この文書でも**「ブロック」は差し込みブロックの意味でだけ**使い、図面に置くものは必ず「品目」と書く。

### 4-3. 置けるもの（品目の型）と俯瞰の絵

| 型 | 中身（`catalog.json`） | 向き | つまみ |
| --- | --- | --- | --- |
| **図形** 5 | 四角（既定 1,000×1,000）・丸（Ø1,000）・線（実線／点線・既定 2,000）・文字（高さ mm・既定 200）・寸法線（2点間の mm を出す） | 自由 | **唯一伸ばせる**（8方向・Shift で縦横比） |
| **人** 3 | 立位 450×300（頭 Ø180）・着席 500×800・車椅子 700×1,200（回転の Ø1,500 を薄く添える） | 正面は −y。回して決める | 出ない＝実寸固定 |
| **備品** 24 | 長机・ルベックチェア・カフェチェア・ハイテーブル・ハイチェア・ステージ（H200／H400 を札で切替）・モニター 75／55／43 型・司会台・立て看板・イーゼル・L字フロアスタンド・ベルトパーテーション（2点で置く線・上限 2,000・1台＝支柱1本）・パーテーション・傘立て・ハンガーラック・姿見・台車・家電 4（§11-1） | `front: true` の品目だけ正面を持つ | 出ない＝実寸固定 |
| **カメラ** 4（昭特） | ペデスタル TP-90B・クレーン TK-53A・クレーン TK-53AL・クレーン台車 TI-04B（§11-2） | 台車の向き＋**アームの角度**の2回転（クレーンは先端に2つ目のつまみ） | 出ない＝実寸固定 |

絵記号（`symbols.svg.md` のキー）は品目ごとに1つ: `table`・`chair`・`round-table`・`stool`・`stage`・`monitor`・`box`・`lectern`・`sign`・`easel`・
`belt-partition`・`partition`・`hanger-rack`・`mirror`・`cart`・`pedestal`・`crane`・`dolly`・`person-standing`・`person-seated`・`wheelchair`・
`generic-rect`／`generic-circle`／`generic-line`／`generic-text`／`generic-dimension`。

絵の規律:

- **線画・単色・薄い塗り・線幅 20mm 固定**（縮尺に追従するので、どの倍率でも同じ太さに見える）。正面は −y
- **品目名は絵の中に入れない**。図面の縮尺で読めなくなるため、ホバー／選択で出る**札**に 名前・寸法・数量（`3/80`）・`推定`・`H400` を出す
- `estimated: true` の品目（21 件・§11-6）は札に「寸法は推定」。確定したらカタログの**数値だけ差し替え、絵は変えない**
- 並べた結果（劇場形式など）は同じ絵を `<use>` で並べ、行列の外接矩形に薄い枠を1つだけ足して「ひとかたまり」と分かるようにする

### 4-4. 在庫（保有数）

数量タブと札に **「置いた数／保有数」**（例 `52/80`）を出す。保有数を超えたら**赤字で警告し、置くのは止めない**。
備品リスト自体が「記載の個数は保有総数です。ご利用状況により、ご希望の数量を確保できない場合がございます」と注記しており、
最後に確保するのは担当者だから。同じ日の別の図面との合算は v1 ではしない（§15-2）。
`equipment_item_id` は機材台帳への**任意参照**にとどめる — `equipment_items` に幅・奥行・高さの列が1つも無く、寸法の正はカタログ側にしかない。

### 4-5. はみ出し

足元の4隅がエリアの内法の外に出る、または固定物（LED ウォール・トラス脚・ELV など）に重なる品目は**赤いハッチ**で描く。
置くのは止めず、③の仕上がりの検査で件数を数える（§6 ③）。壁の中や吹き抜けにも置けてしまう弱点への対策（§15-1）。

### 4-6. グループ

「並べる」の結果と、任意の複数選択（Ctrl+G）は**グループ**になる。グループは全体でつかんで動かせ、
ダブルクリックで中の1つを選べる。並べた結果のグループは並べたときの入力値（`arrange`）を持ち、右パネルから**並べ直せる**（§7）。

---

## 5. データの持ち方

### 5-1. 表4本（migration **298**。いまの最新は `297_qsheet_manuals.sql`）

会場・備品のマスタは既存に置き場が無い。`studio_locations`／`studio_rooms`（`001b_postgresql_schema.sql`）に階・面積・座標は無く、
`equipment_items`（`007_equipment.sql`）に幅・奥行・高さの列も無い。カレンダーの表は触らず、**会場マスタを新設して `room_id` で任意に結ぶ**
（`integration-brief.md` §4-3 の B 案）。接頭辞は techops の前例（`qsheet_rental_items`）どおり **`qsheet_venue_*`**。
書き方（`TEXT PRIMARY KEY`・`TIMESTAMPTZ`・`deleted_at`・owner の CHECK・部分インデックス）は 297 をそのまま写す。

```sql
-- 298: 制作技術支援 — 会場図面（ミニアプリ）段A。設計: docs/design/v4/venue-layout.md §5

-- ── 階（1階 = 1行。縮尺合わせと下敷きを持つ） ──────────────
CREATE TABLE IF NOT EXISTS qsheet_venue_floors (
  id            TEXT PRIMARY KEY,
  venue_name    TEXT NOT NULL,                          -- GMOサムライスタジオ 用賀
  location_id   TEXT REFERENCES studio_locations(id),   -- 任意。カレンダーの拠点と結ぶ
  floor_label   TEXT NOT NULL,                          -- 26F / 27F
  sort_order    INTEGER NOT NULL DEFAULT 0,
  calibration   JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { mmPerPtX, mmPerPtY, originPt, gridLinePt, method }（§8-1）
  grid          JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { x[], y[], pitchMm, totalMm, subTickMm, extra }
  underlay      JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { file, originMm, pxPerMmX, pxPerMmY, widthPx, heightPx }（階全体）
  fixtures      JSONB NOT NULL DEFAULT '[]'::jsonb,     -- 固定物の配列（§10-3。kind・bboxMm・estimated）
  verification  JSONB NOT NULL DEFAULT '[]'::jsonb,     -- 4点の実測（§8-5。what・expectedMm・measuredMm）
  verified_at   TIMESTAMPTZ,                            -- 「縮尺確認済み」の日時。null なら帯に「縮尺が未確認」
  verified_by   TEXT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- ── エリア（1区画 = 1行。内法の多角形を mm で持つ） ──────────
CREATE TABLE IF NOT EXISTS qsheet_venue_areas (
  id             TEXT PRIMARY KEY,
  floor_id       TEXT NOT NULL REFERENCES qsheet_venue_floors(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,                         -- world-studio / room-a …（階の中で一意）
  label          TEXT NOT NULL,                         -- WORLD STUDIO
  polygon_mm     JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [[x,y],…] 内法（壁の内側）
  bbox_mm        JSONB NOT NULL DEFAULT '{}'::jsonb,    -- { x, y, w, h }
  drawn_area_m2  NUMERIC,                               -- 内法から出した面積（画面に出す）
  shown_area_m2  NUMERIC,                               -- 図の㎡表記（壁芯。注記に使う）
  room_id        TEXT REFERENCES studio_rooms(id),      -- 任意。名寄せは人が結ぶ（部屋＝エリアとは限らない）
  underlay       JSONB,                                 -- エリア用の下敷き（無ければ階の下敷きを使う）
  estimated      BOOLEAN NOT NULL DEFAULT false,        -- 目視で決めた辺がある（§10-2）
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT qsheet_venue_areas_key_uq UNIQUE (floor_id, key)
);

-- ── 備品カタログ（組織共通・1品目 = 1行。catalog.json の1件をそのまま列に） ──
CREATE TABLE IF NOT EXISTS qsheet_venue_catalog_items (
  key                TEXT PRIMARY KEY,                  -- rubeck-chair / crane-tk53a …。あとから変えない
  category           TEXT NOT NULL,                     -- furniture / monitor / appliance / sign / service / camera / people / generic
  list_no            TEXT,                              -- 備品リストの番号（01-2）
  label              TEXT NOT NULL,                     -- ルベックチェア（12文字以内）
  size_mm            JSONB NOT NULL DEFAULT '{}'::jsonb, -- { w, d, h, seatH, diameter, variable }
  footprint          JSONB NOT NULL DEFAULT '{}'::jsonb, -- { shape: rect|circle|line|none, w, d, diameter, length }
  qty                INTEGER,                           -- 保有総数
  unit               TEXT,                              -- 点 / 脚 / 台
  storage            TEXT,                              -- 保管場所（リストの表記のまま）
  symbol             TEXT NOT NULL,                     -- 絵記号のキー（§4-3）
  front              BOOLEAN NOT NULL DEFAULT false,
  estimated          BOOLEAN NOT NULL DEFAULT false,    -- true の間は札に「寸法は推定」
  to_confirm         TEXT,                              -- 何を・どこで確かめれば確定できるか
  fixed              BOOLEAN NOT NULL DEFAULT false,    -- 家電（原則移動不可）
  confirmed          JSONB NOT NULL DEFAULT '{}'::jsonb, -- カメラの確定値（積載・ストローク・最高レンズ軸高）
  extra              JSONB NOT NULL DEFAULT '{}'::jsonb, -- variants・camera・arm・tail・sweepRadiusMm・estimateRange
  equipment_item_id  TEXT REFERENCES equipment_items(id), -- 任意。機材台帳への参照（寸法の正はこちら）
  sort_order         INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         TEXT REFERENCES users(id)
);

-- ── 図面（1件 = 1行。qsheet_manuals と同じ列構成 ＋ 階・エリア・案・品目） ──
CREATE TABLE IF NOT EXISTS qsheet_venue_layouts (
  id                 TEXT PRIMARY KEY,
  doc_no             TEXT,                              -- VL-202609-0001（sequences.prod_doc_vl）。必ず発番
  title              TEXT NOT NULL DEFAULT '',
  project_id         TEXT REFERENCES projects(id),
  program_id         TEXT REFERENCES qsheet_programs(id),
  floor_id           TEXT NOT NULL REFERENCES qsheet_venue_floors(id),
  area_id            TEXT REFERENCES qsheet_venue_areas(id), -- null = 階全体
  plan_label         TEXT,                              -- 案（A案・B案）
  copied_from        TEXT REFERENCES qsheet_venue_layouts(id),
  status             TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'fixed', 'archived')),
  rev                INTEGER NOT NULL DEFAULT 0,        -- 確定するたびに +1（§14-8）
  items              JSONB NOT NULL DEFAULT '[]'::jsonb, -- VenueItem[]（§5-2）。上限 300,000 字
  fixed_at           TIMESTAMPTZ,
  fixed_by           TEXT REFERENCES users(id),
  locked_by          TEXT REFERENCES users(id),         -- 編集ロック（図面まるごと・§5-6）
  locked_at          TIMESTAMPTZ,
  lock_requested_by  TEXT REFERENCES users(id),
  lock_requested_at  TIMESTAMPTZ,
  created_by         TEXT REFERENCES users(id),
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT qsheet_venue_layouts_owner_ck CHECK (num_nonnulls(project_id, program_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_venue_layouts_doc_no ON qsheet_venue_layouts(doc_no) WHERE doc_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_layouts_project ON qsheet_venue_layouts(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_layouts_program ON qsheet_venue_layouts(program_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_venue_layouts_created_by ON qsheet_venue_layouts(created_by) WHERE deleted_at IS NULL;
```

**なぜ「図面1件 = 1行・品目は JSONB の配列」か**（品目1個 = 1行でも、階全体を1つの JSON でもなく）:

- 図面は1エリアの1案が単位で、開くと全品目を描く。送る単位と描く単位が一致する（冊子の「ページ1枚 = 1行」と同じ理由）
- 取り合い（同時編集）は図面単位で見つかる。A案を触っている人と B案を触っている人はぶつからない
- 品目は劇場形式 80 脚でも1個 200 バイト程度で、300,000 字の上限（`manual.service.ts` の `MAX_BLOCKS_JSON_LENGTH` と同じ値）に収まる

**migration 299** は用賀のマスタの投入（階 2・エリア 22・固定物 19・カタログ 36 件＝備品 24＋カメラ 4＋人 3＋図形 5）。
本番は `SKIP_SEED=true` なので **seed に頼らず migration で入れる**。値は `venue-data.json`・`catalog.json` をそのまま写す（§10・§11）。
下敷き PNG は v1 では `client-techops/public/venue/` の静的ファイル 4 枚（§10-5）。段F の取り込みは `POST /techops/upload-image`（editor・5MB）を流用する。

### 5-2. 品目1個の形

```ts
interface VenueItem {
  id: string;                          // genBlockId() と同じ作法
  kind: 'catalog' | 'camera' | 'person' | 'shape' | 'text' | 'line' | 'dimension' | 'group';
  key?: string;                        // catalog / camera / person のとき catalog.json の key（rubeck-chair …）
  /** 階の絶対座標（mm）。X16×Y16 の交点が原点・右が +x・下が +y。足元の中心 */
  x: number; y: number;
  rotation: number;                    // 度。正面は −y
  z: number;
  /** shape だけ編集できる。備品・人・カメラはカタログの値を写すだけ（伸ばせない） */
  w?: number; d?: number; diameter?: number;
  points?: [number, number][];         // line / dimension / ベルトパーテーション（2点）
  variant?: string;                    // ステージの h200 / h400
  armAngle?: number;                   // クレーンのアーム。台車の rotation と独立
  label?: string;                      // 図形・文字の名前／注記
  style?: Record<string, string | number>; // 線種（実線／点線）など CSS に落ちる値だけ
  groupId?: string;
  locked?: boolean;
  /** 並べた結果のグループだけ持つ。並べ直しの入力値（§7） */
  arrange?: { preset: string; params: Record<string, number | string | null> };
}
```

`ManualBlockBase { id; x; y; w; h; z; rotation? }` と同じ骨格なので、運営マニュアルの純粋関数
（`alignBlocks`・`distributeBlocks`・`reorderZ`・`snapPosition`・`applyResize`・`angleFromCenter`）にそのまま渡せる。
並べ方の既定値は DB ではなく **`shared/src/venue/arrange.ts`**（純粋関数・Vitest）に置く。

### 5-3. ミニアプリのレジストリへの登録

```ts
// shared/src/production/miniapps.ts の MINI_APPS に1件足す（server/src/shared/production/miniapps.ts にも同じものを）
{
  kind: 'document',
  key: 'venue',
  label: '会場図面',
  docPrefix: 'VL',
  docNoSeq: 'prod_doc_vl',
  table: 'qsheet_venue_layouts',
  listPath: '/techops/venue-layouts',
  docPath: '/techops/venue-layouts/:id',
  stages: ['day'],
  enabled: true,
}
```

- `MiniAppKey` の union に `'venue'` を足す。`permissionModule` は **`qsheet`**（ハブと同じ区画）
- 資料番号の実際の書式は **`PREFIX-YYYYMM-0001`**（`sequence.service.ts`。月替わりでカウンタが 1 に戻る）。`VL-202609-0001` のように出る
- 接頭辞 `VL` と seq `prod_doc_vl` は **重複禁止・後から変えない**（使用中は `SB`／`SD`／`OM`）。§14-1 で確定してから着手する
- 図面は冊子と同じ「**必ず発番**」（運営マニュアルから `sourceId` で指すため）
- `kind: 'document'` だが **`panel` にしない**理由: 1案件に図面は複数ある（エリア別・案別）／冊子から `sourceId` で「どの図面か」を指す／確定・凍結・複製の作法を `qsheet_manuals` から写せる／紙に `VL-…` の番号で載せて現場で照合できる
- `kind: 'document'` で登録しても **MCP `list_production_docs` とジャーニーの `days[].docs` には自動では出ない**（`doc-list.service.ts` は `qsheet_documents` と `qsheet_schedules` だけを読む）。運営マニュアルと同じ状態で、MCP 連携は別作業（§15-2）

### 5-4. API

| メソッド | 道 | 権限 |
| --- | --- | --- |
| GET | `/techops/venue-layouts?project=…&program=…` | qsheet reader |
| GET | `/techops/venue-layouts/:id`（図面＋階・エリア・固定物・下敷きの参照） | qsheet reader |
| POST | `/techops/venue-layouts`（`copy_from` で複製・ひな形可） | qsheet editor |
| PATCH | `/techops/venue-layouts/:id`（名前・案・エリア・状態） | qsheet editor |
| PUT | `/techops/venue-layouts/:id/items`（`expected_updated_at` **必須**） | qsheet editor |
| POST | `/techops/venue-layouts/:id/copy` ／ DELETE `/techops/venue-layouts/:id` | qsheet editor |
| POST | `/techops/venue-layouts/:id/fix`（確定＝`rev` +1）／ `…/unfix` | qsheet **manager** |
| POST/DELETE | `/techops/venue-layouts/:id/lock`（取る／放す）／ POST `…/lock/request` | qsheet editor |
| POST | `/techops/venue-layouts/:id/lock/takeover` | qsheet **manager** |
| GET | `/techops/venue-floors`（階＋エリア＋固定物＋下敷き）／ `/techops/venue-catalog` | qsheet reader |
| POST/PATCH | `/techops/venue-floors`・`/techops/venue-floors/:id`・`…/areas`（段F） | qsheet **manager** |
| PUT | `/techops/venue-catalog/:key`（段F） | qsheet **manager** |
| GET | `/techops/manuals/:id/resolve`（既存。`venue.*` を解決する分岐を足す） | qsheet reader |

### 5-5. 権限と行の可視性

`permissionModule` は `qsheet`。**閲覧**＝見る・書き出す／**編集**＝作る・直す・複製する／**管理**＝確定する・確定を解く・編集を引き継ぐ・④⑤のマスタを直す。
行の可視性は `canAccessManual`（`server/src/contexts/qsheet/access.ts`）を写した **`canAccessVenueLayout`**: 作成者・案件メンバー・`assigned_to`・system_admin。
作成時の `project_id` のなりすましは `canAssignManualProject` と同じ関所で止める。番組（`program_id`）の図面は作成者と admin にしか見えない（冊子と同じ制約）。

### 5-6. 同時編集は「図面まるごとの編集ロック」

図面は1つの JSON で、2人の変更を併合できない。冊子と同じ**図面まるごと1本のロック**を持つ（`useManualEditLock`／`manual-lock.routes.ts`／`manual.service.ts` の `assertEditable`・`EDITABLE_GUARD_SQL` を API 名だけ差し替えて写す）。

| 決めごと | 中身 |
| --- | --- |
| 単位 | 図面まるごと。A案と B案は別の行なので別々に持てる |
| 取り方 | 編集画面を開いた人が自動で取る。取れなかった人には「◯◯さんが編集中です」と出し、閲覧の画面にする |
| 持ち続け方 | 編集中は 60 秒ごとに延ばす（`locked_at` を打ち直す） |
| 自動で解ける | 操作が **10分**止まったら誰でも取れる |
| 強制解除 | manager は待たずに引き継げる。交代の申し出（`lock/request`）も冊子と同じ |
| 最後の砦 | ロックがあっても `updated_at` の突き合わせ（`checkOptimisticLock` ＋ UPDATE の WHERE に畳む CAS）は**外さない** |

保存は打つのを止めて **1.5 秒**で自動（`useManualPageAutosave` の写し: デバウンス・送信の直列化・アンマウント時の送信）。
衝突の型は `ConflictError { code: "CONFLICT"; current_updated_at; updated_by_name }`（スケジュール表・冊子と同じ）。文言は「ほかの人が先に保存していました。」

---

## 6. 画面ごとの決めごと

### ① 一覧 `/techops/venue-layouts`

- 進行台本・スケジュール表・運営マニュアルと同じ「資料が複数ある道具」の一覧。`?project=`／`?program=` で絞る。`PageShell` ＋ `PageHeader`（主ボタン「会場図面を作る」）
- 1行＝ 資料番号・名前・階とエリア・**案**（A案・B案）・状態（下書き／確定／過去の版）・更新日時・**「冊子 OM-… に載っています（確定済）」**（§9-6）
- 作成ダイアログは3手: 名前 → 階とエリア（既定は 26F WORLD STUDIO）→ ひな形／前の図面を複製。複製は `copied_from` に元を残す

### ② 編集 `/techops/venue-layouts/:id`（PC。スマホは同じ URL で閲覧）

構成は上から **資料の帯**（戻る／`VL-…`／名前（`BufferedInput`）／下書き・確定の札／「保存しました」／「◯◯さんが編集中」／仕上がりを見る）→
**道具の帯**（置く・並べる／図形5／整列6／重なり／元に戻す／すいつき／方眼／ものさし／ズーム −・%・＋／階・エリアの切替／階全体を表示）→
**3列 `lg:grid-cols-[280px_1fr_260px]`**（`ManualDetailPage` と同じ）。`<fieldset disabled={!editable}>` と commit の関所で編集可否を1つの値に寄せる。

| 列 | 中身 |
| --- | --- |
| 左 | タブ**「置く」**（備品・カメラ・人・図形の4群。検索欄が先頭。札に寸法と `3/80`）／**「並べる」**（§7）／**「数量」**（品目・置いた数・保有数・保管場所） |
| 中央 | mm 空間の SVG（`viewBox` を mm）。重なりは 下敷き → 方眼・通り芯 → エリアの内法（薄い塗り）→ 固定物 → 品目 → 選択枠と札。上と左にものさし、右下に 1m バー |
| 右 | 名前・寸法（mm。図形だけ編集可）・位置（エリア左上からの mm／通り芯からの距離 `X13 +1,200` に切替）・向き（度・反転）・高さ（ステージ H200／H400）・アームの角度（クレーン）・重なり・固定。グループなら §7 の入力欄と「並べ直す」「グループ解除」。数字は `.num`・3桁区切り。**px は出さない** |

操作は PowerPoint に合わせる。既存部品の欄は `integration-brief.md` §2-3 で「そのまま使える」と判定した純粋関数:

| PowerPoint | 会場図面 | 既存部品 |
| --- | --- | --- |
| 左の一覧から選んで置く | 品目を押す＝表示範囲の中央に実寸で置く／図面へドラッグ | `InsertPanel` の作法 |
| 選ぶ・Shift で足す・囲む | 同じ | `useManualMarqueeSelect`（`toPageMm` を注入） |
| つかんで動かす | すいつき先は 壁（内法）・通り芯・他の品目の端と中心・1m 方眼（任意）。閾値は画面 8px 相当 | `snapPosition` |
| 角・辺のつまみ | **図形だけ** 8方向（Shift で縦横比）。備品・人・カメラにはつまみが出ない＝実寸固定 | `applyResize` |
| 上の丸いつまみ | 15° 刻み・Shift で自由。クレーンは先端に2つ目（アーム） | `angleFromCenter` |
| 矢印キー | 10mm／Shift 100mm／Ctrl 1mm | 定数の差し替え |
| Ctrl+D／Alt＋ドラッグ | 複製を**右隣（幅＋50mm）**に置く | `ManualCanvas` の複製 |
| Ctrl+Z／Ctrl+Shift+Z | 図面単位で 50 手 | `useManualHistory`（型引数化） |
| 整列・等間隔・前面／背面 | 同じ | `alignBlocks`／`distributeBlocks`／`reorderZ` |
| Ctrl+G／解除 | 並べた結果と任意の複数選択をグループに。ダブルクリックで中の1つ | 新規 |
| スペース＋ドラッグ／Ctrl＋ホイール | 図面をつかむ／ズーム（25〜400%） | `useManualPan` |
| 右クリック・Delete・Esc | 複製・削除・前面へ・背面へ・向きを反転・グループ解除／削除／選択解除 | 新規 |

盤は **`ManualCanvas` を使わず、別の盤 `VenueBoard` を書く**。`ManualCanvas` は A4横の定数 `PAGE_WIDTH_MM`／`PAGE_HEIGHT_MM` を
7か所（`ManualCanvas.tsx`・`ManualBlockView.tsx`・`useManualMarqueeSelect.ts`・`manualCanvasGeometry.ts`・`BlockToolbar.tsx`・`InsertPanel.tsx`・`BlockInspector.tsx`）で直接読み、
紙面を CSS の `mm` 単位で描くため、44.8m 四方の階には使えない。写すのは設計だけ — render-prop（中身の描画を委譲）・`commit` の handle・
「動かしていなければ commit しない」ドラッグの状態機械・キーボード操作の表。

**縮尺の見せ方4つ（常時見える）**:

| 見せ方 | 中身 |
| --- | --- |
| ものさし | 図面の上と左。1m／5m の目盛。ズームに追従 |
| 方眼と通り芯 | 1m の点はズーム 50% 以上で表示。通り芯 6,400 の細線に X16〜X9・Y16〜Y9 のラベル（3,200／1,600 の補助線は任意） |
| mm | 札と右パネルの寸法・位置は常に mm（3桁区切り）。面積は**内法**で出し、図の㎡表記が壁芯であることを注記（ROOM A: 表記 25.10㎡・内法 20.8㎡） |
| 1m バーと寸法線 | 右下の 1m バーはズームに追従し、書き出しに必ず載る。寸法線品目で2点間の mm を出し、縮尺の確認にも使う |

スマホ（同じ URL・`useIsMobile()` で閲覧に入れ替わる薄い親）: ピンチで見る・品目を押して札を読む・数量表を見る。編集はしない。逃げ先は①（`/techops/top` に逃がさない）。

### ③ 仕上がりと書き出し `/techops/venue-layouts/:id/preview`（PC専用）

- 設定は **用紙**（A4横／A3横）・**縮尺**（自動＝収まる最大の切りのよい縮尺、または 1:50／1:100／1:200 を指定）・**凡例**・**数量表**・**通り芯の有無**の5つ
- 紙面には 資料番号・案・版（`VL-202609-0003 rev.1`）・階とエリア・縮尺（`1:100`）・**1m バー**・「◯月◯日時点」が必ず載る
- 書き出しは **PNG**（画面の SVG をそのまま）と **PDF**（`window.print()`。冊子と同じ `previewExport.ts` の手口・サーバーに Chromium を入れない）
- **出す前の検査は3つだけ**（数えるのは事実だけ。「0件＝安全」と読ませない）:

| 検査 | なぜ |
| --- | --- |
| エリアからはみ出す・固定物に重なる品目 | 壁の中・吹き抜けに置けてしまう弱点の受け皿（§4-5） |
| 保有数を超えた品目 | 「確保できない場合がある」を出す前に知る |
| 寸法が推定の品目 | 昭特のカメラ・モニターのスタンドなど、確定前の寸法で決めていないか |

通路幅・避難経路の検査は**入れない**（基準値と出入口のデータが無い。§15-2）。

### ④ 会場と階 `/techops/venue-floors`（PC専用・manager・段F）

PDF の取り込み・階ごとの PNG 化・**縮尺合わせ**（通り芯を X 2本・Y 2本クリックして芯間 mm を打つ）・4点の実寸検証・エリアの多角形・固定物・「確認済み」の記録。手順は §10-6。
画面に **「線で測る。ラベルの円で測らない」** と1文出す。v1 では用賀を migration 299 で投入するため、この画面は段F。

### ⑤ 備品カタログ `/techops/venue-catalog`（PC専用・manager・段F）

品目ごとの寸法・保有数・保管場所・「推定」の印と要確認の内容を直す。確定値を入れると `estimated` が外れ、札の「寸法は推定」が消える。**絵は変えない**。

---

## 7. 一気に並べる

左の**「並べる」タブ**。**入力 → 薄いプレビュー → 置く** の3手（PowerPoint の「表を挿入」と同じ手つき）。
既定値は `catalog.json` の `presets`（会場設営の一般的な目安。すべて `estimated: true` だが「目安」であって確認対象ではない）。

| 並べ方 | 既定（mm） | 使う品目 |
| --- | --- | --- |
| **格子に並べる** | 行 2×列 2。ピッチ未指定なら品目の幅・奥行＋50。劇場形式の内部もこれを使う | 選んだ品目なら何でも |
| **劇場形式** | 椅子 5行×10列・横ピッチ 550・縦ピッチ 900・中央通路 1,200・脇 600・前の空き 1,500 | ルベックチェア（80 脚で警告） |
| **スクール形式** | 長机に椅子 2（3 は詰め席）・机 3列×4行・机の隙間 0・行ピッチ 1,500・中央通路 1,200 | 長机（白）20 点で警告＋ルベックチェア |
| **島形式** | 長机 2 本を向かい合わせ（1,800×1,200 の島）・片側 3 脚・4 島・島の間 1,500 | 長机（白）＋ルベックチェア |
| **円卓** | ハイテーブル Ø600 を中心に、半径 550 の円周へ 4 脚を等間隔（各椅子はテーブルを向く） | ハイテーブル＋ハイチェア（カフェチェアも可） |
| **コの字** | 幅 3・奥行 2 の机・外側に椅子・内側の空き 1,800。開いた辺が正面 | 長机（白）＋ルベックチェア |
| **ロの字** | 幅 3・奥行 2 の机を閉じる・外側に椅子・内側の空き 1,800 | 長机（白）＋ルベックチェア |

| 入力 | 効き方 |
| --- | --- |
| 品目・行×列・間隔・通路 | 奇数列は通路の位置を指定。中央通路は列数が偶数のとき中央 |
| 向き・起点 | 正面は −y。**「向き先」**でステージ・司会台・任意の点を指すと全部がそれを向く。起点はエリアの正面から前の空きを取った中央。枠をつかんで動かせる |
| プレビュー | **外接寸法（例 6,700×7,200）・脚数・保有数との差・はみ出し数**を出す。「置く」で確定（1手＝undo 1手） |

置いたあとは1つの**グループ**（`arrange` に入力値を持つ）。直し方は3通り:

1. 右パネルで数値を変えて**「並べ直す」**（1手＝undo 1手）。手で直した分が戻るときは確認を1回出す
2. 中の1つを**ダブルクリック**で選んで動かす・削除する。動かした1つはグループから外れ、削除した席は空席として残せる
3. **「グループ解除」**で全部を個別の品目にする

---

## 8. 縮尺の規律と担保

### 8-1. 階ごとの2軸の縮尺合わせ（実測値）

通り芯 X16→X9・Y16→Y9 はどちらも **44,800mm**（7区間×6,400）。p-2（27F）の赤い一点鎖線（通り芯線）の座標から求めた値:

| 軸 | 通り芯線の位置（pt） | 差（pt） | 縮尺（mm/pt） |
| --- | --- | --- | --- |
| X | X16＝26.56 → X9＝735.43 | 708.87 | **63.199** |
| Y | Y16＝208.27 → Y9＝947.82 | 739.55 | **60.577** |

原点は **X16×Y16 の交点＝(26.56, 208.27)pt**。X/Y の縮尺は **4.3% 違う**。
26F（p-1）は文字も線種も拾えないため、p-1 と p-2 を 144dpi で描画して壁の列・行の濃度分布を相互相関した結果、ずれは −1〜+2px（1px＝30mm 相当）＝**同一配置**。26F も 27F と同じ値を使う。
階の行はこれを `calibration = { mmPerPtX, mmPerPtY, originPt, gridLinePt, method }` として持つ（§5-1）。

### 8-2. なぜ等方でないか

Illustrator で図全体が**非等方に伸ばされている**と読む。裏づけは3つ:

- LED ウォール（実寸 8,530.2）の描画幅 135.0pt × 63.199 ＝ **8,532mm**。X の縮尺が寸法と一致する
- 「3200」の寸法文字の間隔が X 50.65pt／Y 26.41pt（1,600 分）で、通り芯と同じ比率
- LED ウォールの立面画像（実寸比 8,530.2：4,876.8＝1.749）の縦横比が、異方性込みの 1.677 に近い

1軸の縮尺にすると **10m で 43cm ずれる**（4.3%）。椅子1脚が 535mm なので、客席 10 列で椅子1脚分近く狂う。

### 8-3. 差の吸収のしかた

- 品目は**等方の mm 空間**（SVG の `viewBox` を mm）に描く。ルベックチェアの 535×490 は縦横とも正しい
- **下敷き画像だけ**を `width = widthPx ÷ pxPerMmX`・`height = heightPx ÷ pxPerMmY` で X/Y 別に伸縮して貼る。歪みは下敷きの中で消える
- 下敷きの座標変換は1本の式 **`px = (mm − originMm) × pxPerMm`（X と Y で別）**。逆変換も同じ（§10-5 の表の値）

### 8-4. 原点

- 保存は**階の絶対 mm**（X16×Y16 の交点が原点・右が +x・下が +y。建物は北側で Y16 より約 750 はみ出すので y<0 もある）
- 表示だけ **エリア左上（`bboxMm`）を (0,0)** にする／通り芯からの距離（`X13 +1,200`）に切り替える
- 26F と 27F は同じ原点なので、**階を切り替えても重なる**（吹き抜けの下のスタジオを 27F から見る）
- 方位は下敷きの記号が未確認（図の真北は右下の方位記号でおよそ南東を指す＝図の上が真北ではない）のため描かない

### 8-5. 実寸検証（階を「確認済み」にする関所）

寸法線で次の4つを測り、**すべて ±60mm（144dpi の 2px）以内**なら「縮尺確認済み（日付・人）」を階に記録する:

| # | 測るもの | 期待値（mm） | 出どころ |
| --- | --- | --- | --- |
| 1 | X16→X9 と Y16→Y9 | 44,800（両方） | 通り芯 7区間×6,400 |
| 2 | LED ウォールの幅 | 8,530 | 図の寸法 8530.2 |
| 3 | MEETING ROOM の奥行 | 3,775 | 図の寸法 |
| 4 | ELV13 のかご | 1,850×2,010 | 図の記載（かご内寸） |

外れたら確認済みにできない。図面は作れるが、帯に**「縮尺が未確認」**と出る。

### 8-6. 最終検証は紙

書き出した紙の **1m バーに定規を当てる**。1:100 なら 10mm。画面の検証は画面の中で閉じるので、紙に出る最後の1本は人が測る。1m バーは描き手が必ず描き、利用者は消せない。

### 8-7. 実装の規律

| 規律 | 中身 |
| --- | --- |
| **mm を唯一の単位にする** | 保存・API・差し込みブロックの `data` はすべて mm。px は保存しない・画面に出さない |
| **描画は純関数** | 「mm → 画面の px」「mm → 紙の mm」は `shared/src/venue/` の純粋関数（縮尺変換・並べ方・はみ出し判定）にして Vitest で固定する。同じ入力から必ず同じ絵が出る |
| **測って書き戻さない** | 描いた DOM を `clientWidth`／`scrollWidth` で測って座標に書き戻す処理を入れない（[`mockups/DESIGN_POLICY.md`](mockups/DESIGN_POLICY.md)。運営マニュアル §6-5-1 と同じ理由 — 再測定と再描画が連鎖して固まる） |
| **縮尺は階が持つ** | 図面の行は縮尺を持たない。縮尺の正が図面ごとに散ると「縮尺が一致していること」を機械で保証できない（`integration-brief.md` §4-3 の C 案を採らない理由） |
| **品目は伸ばせない** | 備品・人・カメラの寸法はカタログの値を写すだけ。伸ばしたいものは「四角」で置く（§14-2） |

---

## 9. 運営マニュアルとの連携

### 9-1. 差し込みブロック2種

`shared/src/production/manualBlocks.ts` に足す（`server/src/shared/production/manualBlocks.ts` にも同じものを。`check-collab-parity.mjs` が一致を見る）。
`sourceGroup: "venue"`・表示名「会場図面」・`hasSecrets: false`。**`sourceId` 必須**（1案件に図面が複数あるため）。

| ブロック | 中身 | 既定の大きさ | options |
| --- | --- | --- | --- |
| `venue.layout` | エリアの内法・固定物・品目の線画 ＋ **1m バー** ＋ 凡例 ＋ 札 `VL-202609-0003 rev.1 ・ 1:150 ・ 26F WORLD STUDIO` | 180×120mm | 範囲（エリア／階全体）・縮尺（自動＝**幅と高さの両方**が収まる最大の切りのよい縮尺。段は 1:50／1:75／1:100／1:150／1:200／1:250／1:300／1:400。WORLD STUDIO の内法 17,440×18,480mm は既定の 180×120mm だと 1:200（87×92mm）。モックではブロックの高さを 154mm に伸ばして 1:150（116×123mm）にしている——幅だけ見て 1:100 と決めると高さ 184.8mm が紙に入らない）・凡例／通り芯の有無 |
| `venue.items` | 数量表（品目・数・保有数・保管場所） | 180×60mm | 出す列 |

版面の内寸は 267×186mm（A4横 297×210・余白 12/12/15/15）。他の差し込みブロックの `defaultSize` は `{180,24}`〜`{220,120}`。

### 9-2. 触る 11 か所（`integration-brief.md` §3-1）

「3点セット」では足りない。運営マニュアルの差し込みは**進行台本だけ `sourceId` を要る**決め打ちが3か所にあり、会場図面にも広げる。

| # | 場所 | 何をするか |
| --- | --- | --- |
| 1 | `manualBlocks.ts` `ManualLinkedBlockKey` | `"venue.layout"`・`"venue.items"` を union に足す |
| 2 | 同 `ManualLinkedSourceGroup`・`MANUAL_LINKED_SOURCE_LABEL` | `"venue"` と表示名「会場図面」 |
| 3 | 同 `MANUAL_LINKED_BLOCKS` | 2件の定義（§9-1） |
| 4 | 同 `manualLinkedBlocksByGroup()` の `groups` 配列 | `"venue"` を足す。**足さないとカタログに出ない** |
| 5 | `server/src/shared/production/manualBlocks.ts` | 上と同じに直す（parity） |
| 6 | `manual-resolve.service.ts` `resolveLinkedBlock` の `switch` | `case 'venue.layout'`／`'venue.items'` → `manual-resolvers/venue.resolver.ts`（新設） |
| 7 | 同 `listAvailableLinkedBlocks` | 実在チェック SQL を1本足す（`SELECT 1 FROM qsheet_venue_layouts WHERE (project_id = $1 OR program_id = $1) AND deleted_at IS NULL LIMIT 1`） |
| 8 | 同 `listLinkSourcesFor` | いまは `sheet.*` だけ候補を返す。`venue.*` の候補（図面の一覧）を返す分岐を足す |
| 9 | `InsertPanel.tsx` `requiresSource = def.sourceGroup === "sheet"` | `"venue"` も `sourceId` 必須に。0件なら置かずに知らせる・1件なら自動・2件以上で選ばせる既存の3分岐がそのまま効く |
| 10 | `LinkedBlockContent.tsx` の `switch` | `case "venue.layout"`／`"venue.items"` → `linked/VenueLinkedContent.tsx`（新設） |
| 11 | `LinkedBlockInspector.tsx` `OPTION_FIELDS` | 範囲・縮尺・凡例・通り芯・出す列 |

resolver は **`sourceId` の図面が冊子と同じ案件（`project_id`／`program_id`）か再検査する**（`sheet.*` と同じ。他案件の図面 id を差し込めないように）。

### 9-3. resolver の `data` は自己完結の線画データ

```ts
// venue.layout の data（例）。描くのに要るものを全部持ち、外部 URL・画像 id・下敷きを含めない
{
  layoutId, docNo: "VL-202609-0003", rev: 1, title, planLabel: "A案",
  floor: "26F", area: "WORLD STUDIO",
  boundsMm: { x: 13680, y: 11900, w: 17440, h: 18480 },   // 範囲（エリアの内法 bbox か階全体）
  polygonMm: [[13680,11900],[31120,11900],[31120,30380],[13680,30380]],
  fixtures: [{ key: "led-wall", kind: "wall", bboxMm: {…} }, …],
  items: [{ kind: "catalog", key: "rubeck-chair", symbol: "chair", x, y, rotation, w: 535, d: 490 }, …],
  scale: 100,                                               // 1:100
  updatedAt
}
```

- 描き手（`VenueLinkedContent`）は `<svg viewBox>` を mm で受け、`preserveAspectRatio="xMidYMid meet"` で縦横比を保つ。`ShapeBlockContent` と同じ作法
- **下敷き画像は載せない**（§14-7）。冊子の「会場図・座席図は線画で描く」「インクを使わない」（[production-manual.md](production-manual.md) §6-6）に一致し、300,000 字に収まる
- 確定（manager の `fixManual()`）で `link.frozen.data` に凍る。**図面を直しても配った紙は変わらない**。下書きの図面も差し込めるが、紙には「下書き」と出る
- 1m バーは描き手が必ず描く。`options` で消せない

### 9-4. 冊子から図面へ移って戻る（techops 初の `?return=`）

`client-techops/src` に戻り先の仕組み（`?return=`・`returnTo`・`location.state`）は0件。冊子の「一覧に戻る」は `navigate("/techops/manuals")` の固定。会場図面で初めて作るので、5点を決めておく:

| # | 決めごと |
| --- | --- |
| 1 | 冊子の右パネル（`LinkedBlockInspector`）に**「会場図面を編集」** → `/techops/venue-layouts/:sourceId?return=/techops/manuals/:manualId` |
| 2 | 図面側は **`/techops/` で始まる相対パスだけ**受け付け、帯に「運営マニュアルに戻る」を出す。それ以外・無いときは①へ |
| 3 | 戻ったら `["manuals","resolve",id]` を `invalidateQueries` する（`staleTime: 30_000` のまま古い図が出ないように） |
| 4 | 編集ロックは冊子と図面で**別物**。冊子のロックはアンマウントで放し（`useManualEditLock` の既存動作）、戻れば自動で取り直す |
| 5 | 冊子が確定済み（`status !== 'draft'`）なら図面へ移る前に「確定を解いてから」と出す（凍った紙は図面を直しても変わらないため） |

### 9-5. 差し込み元として使えるのは

| 差し込み元 | v1 |
| --- | --- |
| 会場図面 → 運営マニュアル（`venue.layout`・`venue.items`） | ✅ 段E |
| 会場図面 → MCP `list_production_docs`・ジャーニーの `days[].docs` | — 自動では出ない（運営マニュアルと同じ・別作業） |
| 会場図面 → 機材管理・レンタル機材検索の数量 | — 参照だけ（`equipment_item_id`） |

### 9-6. 逆向き: 「冊子に載っています」

①の行に **「冊子 OM-… に載っています（確定済）」** を出す（`qsheet_manual_pages.blocks` を `sourceId` で引く）。
図面を消す・大きく直す前に、どの冊子に影響するかが分かる。

---

## 10. 図面の取り込み手順

用賀は **段A の migration 299** で投入する（画面④は段F）。ここに載せる表が migration に入る値の正で、値は `venue-data.json`（読み取りの根拠は `venue-notes.md`。どちらも設計時の作業ファイル）を写しただけ — 手元で計算し直さない。
④の画面（§10-6）は、同じ結果を人が手順で作るためのもの。

### 10-1. 階の割り当て（p-1＝26F・p-2＝27F）と根拠

`26F平面図.pdf` は4ページで、平面図は p-1 と p-2（p-3 は A-A／B-B 断面、p-4 はトラスの寸法）。どちらが 26F かは題名では決められないので、7つの根拠で決めた。

| # | 根拠 | p-1 | p-2 |
| --- | --- | --- | --- |
| 1 | 「屋上」の表記 | 左右の翼と北側（SKY STUDIO の北）に「屋上」。上の階が張り出していない側に屋上があるのは低い階 | 無し（代わりに赤い通り芯線が全面にある） |
| 2 | 吹き抜け | 無し。中央は WORLD STUDIO の床（トラス脚 10 本の■と LED ウォール） | 中央と北に「吹き抜け」と X の対角線。中央は 26F の WORLD STUDIO の真上、北は SKY STUDIO の真上 |
| 3 | らせん階段 | 実線で全周が描かれ、SKY STUDIO の床から上がる | 「既存3200・既存5360」の寸法付きで同じ位置に到着口 |
| 4 | 搬入 | 「搬入ルート」の赤い矢印と ELV13（1,850×2,010・高さ 2,770・積載 2,150kg） | 無し。同じ位置の ELV13 は「専用カード必要」 |
| 5 | 来客の動線 | 無し | 「お客様導線→」「自動ドア」「CARD」の読取機 |
| 6 | 断面 p-3 | LED ウォール（高さ 4,876.8）の下端が ▽26FL、上端が ▽27FL とほぼ同じ高さ。LED は 26F の床に立ち、27F はそれを見下ろす | 同左 |
| 7 | 備品リストの住所 | — | 「GMOインターネットTOWER 27F」（来客が集まる階） |

p-1 が **26F**（スタジオ床のある技術階・搬入）、p-2 が **27F**（受付・ラウンジ・楽屋の来客階）。建物の外形（階段室 A〜D・附室・ELV 群）は両階で同じ位置にある。
`qsheet_venue_floors` は 2 行（`26f`＝`pdfPage` 1・`27f`＝`pdfPage` 2）で、`grid` は両階とも同じ:

| `grid` の列 | 値 |
| --- | --- |
| `x`／`y` | X16・X15・X14・X13・X12・X11・X10・X9 ／ Y16・Y15・Y14・Y13・Y12・Y11・Y10・Y9 |
| `pitchMm`／`totalMm` | 6,400 ／ 44,800（7区間） |
| `subTickMm` | x: 3,200 ／ y: 1,600・4,800（各区間の中の補助線） |
| `extra` | `X12b`＝22,400（p-4 の中間通り芯。X13 と X12 の中央。LED ウォールの中心）／`Y14a`＝11,200（p-4 の補助線。Y14 の 1,600 北と推定） |

座標系は §8-4 のとおり（X16×Y16 が原点・右＝東が +x・下＝南（Y15 側）が +y）。

### 10-2. エリア 22（内法・mm）

内法（壁の内側の面）を図から実測した。精度は **±60mm**（144dpi の画素）。`bbox_mm` は `{x, y, w, h}`、`polygon_mm` は MEETING ROOM だけ 6 点（北東角 x>9,970・y<13,250 は EPS/DS の壁の凹み）で、ほかは bbox と同じ 4 点。

| key | 階 | 名前 | bbox mm（x・y・w・h） | 内法㎡ | 図の㎡表記 | メモ |
| --- | --- | --- | --- | --- | --- | --- |
| `world-studio` | 26F | WORLD STUDIO | 13,680・11,900・17,440・18,480 | 322.3 | — | X14〜X11 の間。北壁は 27F 通路の南壁と同じ線（11,766）。南端 y≈30,300 に LED ウォール、その南（30,500〜33,800）に出入口前室。南西・南東の角に 2,000 幅の凹み |
| `sky-studio` | 26F | SKY STUDIO | 13,680・3,070・17,440・8,696 | 151.7 | — | 北辺 3,070 は窓のある壁（27F では同じ線に遮光ロールスクリーン）。南部（y 9,680〜11,650）の上に 27F の通路、北部の上は吹き抜け。らせん階段を含む |
| `control-room-1` | 26F | 第1調整室 | 10,960・11,826・2,560・8,936 | 22.9 | — | WORLD STUDIO の西壁（13,520〜13,680）に接する細長い部屋。西側（9,730〜10,800）に屋上へ出る通路 |
| `control-room-2` | 26F | 第2調整室 | 10,960・20,913・2,560・2,423 | 6.2 | — | |
| `machine-room` | 26F | マシンルーム | 10,960・23,488・2,560・4,785 | 12.2 | — | |
| `network-room` | 26F | ネットワークルーム | 10,960・28,273・2,560・2,575 | 6.6 | — | |
| `tech-storage` | 26F | 制作/技術倉庫 | 31,280・11,826・3,823・21,051 | 80.5 | — | WORLD STUDIO の東壁（31,120〜31,280）に接する。間仕切り無しの1室として読んだ |
| `elv-hall-26f` | 26F | ELVホール | 25,313・36,760・3,768・8,040 | 30.3 | — | 27F と同じ位置（昇降路） |
| `corridor-27f` | 27F | 通路 | 13,850・9,680・16,500・1,970 | 32.5 | — | 両端の SS 印から附室へ続く。北側は吹き抜け（手すり線 9,420〜9,680） |
| `atrium-north` | 27F | 吹き抜け（北・SKY STUDIO 上） | 13,680・2,590・17,440・6,830 | 119.1 | — | 北辺（2,543）に遮光ロールスクリーン。らせん階段の到着口がこの中 |
| `atrium-center` | 27F | 吹き抜け（中央・WORLD STUDIO 上） | 14,400・11,900・14,080・20,300 | 285.8 | — | **目視あり**（`estimated`）。西辺 14,400 は西側通路の手すり柱列、東辺 28,480 は LOUNGE STUDIO のガラス線。南端 32,200 は X 対角線の範囲を目視。26F の東側帯（28,480〜31,120）は 27F ラウンジ床の下 |
| `west-corridor-27f` | 27F | 西側通路（27F） | 13,460・11,900・940・21,100 | 19.8 | — | **目視あり**（`estimated`）。MEETING ROOM〜倉庫の扉前（CARD 読取機）と吹き抜けの間の細い通路 |
| `meeting-room` | 27F | MEETING ROOM | 6,380・11,990・7,080・3,775 | 26.7 | 26.98 → 一致 | 奥行 3,775 は図の寸法（§8-5 の検算 #3）。表記は凹みを含む長方形と一致 |
| `room-a` | 27F | ROOM A | 6,380・16,130・7,080・2,935 | 20.8 | 25.10 → 壁芯 | 図の寸法 2,953・内法の実測 2,935。壁芯（250 壁）で (2,953+250)×7.8≒25.0 |
| `room-b` | 27F | ROOM B | 6,380・19,340・7,080・2,935 | 20.8 | 25.10 → 壁芯 | 図の寸法 2,948 |
| `room-c` | 27F | ROOM C | 6,380・22,520・7,080・2,980 | 21.1 | 25.10 → 壁芯 | 図の寸法 2,950 |
| `vip-lounge` | 27F | VIP LOUNGE | 6,380・25,730・7,080・4,530 | 32.1 | 37.66 → 壁芯 | 図の寸法 4,550。東側（x 12,020〜13,460）に Changing room と Safety box を含む |
| `storage-27f` | 27F | 倉庫 | 6,380・30,500・7,080・2,400 | 17.0 | — | 奥行 2,175+200 の寸法。南辺に 1,500 幅の扉 |
| `lounge-studio` | 27F | LOUNGE STUDIO | 28,480・12,980・9,910・15,690 | 155.5 | — | 西辺 28,480 は吹き抜けに面するガラス線。東辺の手前（37,770〜38,390）に長いカウンター席。北壁に自動ドア、北東角にワインセラー |
| `pantry` | 27F | パントリー | 31,120・28,790・7,270・4,070 | 29.6 | — | LOUNGE STUDIO の南。西側（28,480〜31,120）はカード読取機のある入口通路 |
| `office` | 27F | 執務室 | 12,845・36,760・9,430・7,870 | 74.2 | 84.76 → 壁芯 | 南辺は外壁の出窓で一部広い |
| `elv-hall-27f` | 27F | ELVホール | 25,313・36,760・3,768・8,040 | 30.3 | — | ELV7〜12 に挟まれる。北へ両開き扉で吹き抜け南側の通路へ |

- **図の㎡表記は壁芯面積と読む**。ROOM A/B/C・VIP LOUNGE・執務室は表記が内法より 15〜20% 大きく、壁芯（250 壁）で計算し直すと合う。MEETING ROOM だけは凹みを含む長方形で一致する。26F の各室（調整室・倉庫）には㎡表記が無く突き合わせできない（`shown_area_m2` は null）。画面は内法を出し、表記が壁芯であることを注記する（§6 ②）
- `estimated` は `atrium-center`・`west-corridor-27f` の 2 件（目視で決めた辺がある）。④で直せる
- `room_id`（`studio_rooms`）は migration では結ばない。seed の用賀の部屋（WORLD STUDIO・SKY STUDIO・LOUNGE STUDIO・VIP LOUNGE …）と図面のエリア名は一致しない行（ROOM A/B/C・MEETING ROOM・第1/第2調整室）があるため、名寄せは④で人が結ぶ

### 10-3. 固定物 19

階の `fixtures` に入れる（`kind`・`bboxMm`／`lineMm`／`polylineMm`・`estimated`）。ELV と階段室は両階（`floor: both`）。

| key | 階 | 名前（`kind`） | 位置・寸法 mm | 推定 | 根拠 |
| --- | --- | --- | --- | --- | --- |
| `led-wall` | 26F | LEDウォール（`wall`） | bbox 18,135・30,150・8,530・150。実寸 幅 8,530.2×高さ 4,876.8。中心 X12b（22,400） | ○ | 幅は図の寸法。平面図に貼ってあるのは立面の絵（y 25,460〜30,150）で、壁の平面位置はトラス南列（y≈30,300）に吊ると読み、厚み 150 は仮置き |
| `truss` | 26F | 450角パワートラス（`truss`） | 外寸 bbox 17,495・17,248・9,810・13,250。脚 450 角×10 本（cx 17,720／27,080 × cy 17,473・20,673・23,873・27,073・30,273）。列ピッチ 3,200・上弦材の節点 0／3,095／6,265／9,360・高さ 7,100 | ○ | 外寸は p-4 の寸法（450/2645/450/2720/450/2645/450＝9,810、450+2750×4+450＝13,250）。脚 10 本は p-1 の■と一致。高さと y 位置は p-3／p-4 の画素から推定 |
| `spiral-stair` | 26F | らせん階段（既存）（`stair`） | bbox 14,490・3,950・3,070・5,690。寸法 3,200×5,360 | bbox は目視（±100） | p-2 の「既存3200・既存5360」。26F〜27F をつなぐ |
| `blackout-screen` | 27F | 遮光ロールスクリーン（`screen`） | 線 (13,850, 2,543)→(31,060, 2,543) | — | p-2 の吹き抜け北辺の線（250.25pt）。26F では同じ線が SKY STUDIO の窓壁 |
| `auto-door` | 27F | 自動ドア（`door`） | 29,000・12,900・2,100・160 | ○ | LOUNGE STUDIO の北壁。通路側から入る |
| `wine-cellar` | 27F | ワインセラー（`furniture`） | 35,000・12,000・900・980 | ○ | ラウンジ北東角。目視 |
| `elv13` | 両階 | ELV13（搬入用）（`elevator`） | 9,995・37,700・1,850・2,010。かご内寸 1,850×2,010・高さ 2,770・積載 2,150kg | — | 図の記載。扉は西側（搬入ルート側）。**図の矩形の奥行は 1,740 程度で 2,010 より短い**（扉・敷居を含む寸法と読む。§10-4 の申し送り） |
| `loading-route` | 26F | 搬入ルート（`route`） | 折れ線 (8,790, 36,630)→(8,790, 38,680)→(9,995, 38,680) | ○ | p-1 の赤い矢印。西側の附室・PS 脇の通路（x≈8,800）を南下し ELV13 へ。屋上側の出入口からの経路は図に無い |
| `elv12`／`elv11`／`elv10` | 両階 | ELV12・11・10（`elevator`） | 西列: 23,320・37,440・2,000・2,000 ／ 23,320・40,290・2,000・1,900 ／ 23,320・42,630・2,000・1,900 | ○ | ELVホール西列の北・中・南。目視（±100） |
| `elv9`／`elv8`／`elv7` | 両階 | ELV9・8・7（`elevator`） | 東列: 29,080・37,440・2,100・2,000 ／ 29,080・40,290・2,100・1,900 ／ 29,080・42,630・2,100・1,900 | ○ | ELVホール東列の北・中・南。目視（±100） |
| `elv14` | 両階 | ELV14（`elevator`） | 32,570・37,440・2,100・2,000 | ○ | 東の附室の隣（用途は図に無い） |
| `stair-a`／`stair-b` | 両階 | 階段室A・B（`stair`） | 南東 32,050・40,950・3,670・3,850 ／ 南西 9,180・40,950・3,665・3,850 | ○ | 四隅の階段室 |
| `stair-c`／`stair-d` | 両階 | 階段室C・D（`stair`） | 北東 30,760・−570・4,540・5,520 ／ 北西 9,250・−570・4,540・5,520 | ○ | 建物は Y16 より北に約 750 出ている（y<0） |

拾っていないもの: 通り芯交点の柱（■は下敷き画像に写る）・扉の開きの円弧（下敷きで見える）。
はみ出し判定（§4-5）に効くのは `wall`・`truss`（脚）・`elevator`・`stair`・`furniture`。`route`・`screen`・`door` は重なっても赤くしない。

### 10-4. 校正の実測（`calibration`・`verification` に入る値）

27F（p-2）の通り芯線そのもの（赤い一点鎖線 `stroke rgb(94.75%,31.76%,23.37%)`・`stroke-dasharray 42.52 4.252 4.252 4.252`）を transform 込みで解析した位置:

| 軸 | 通り芯線の位置（pt） | 差（pt） | 縮尺（mm/pt） |
| --- | --- | --- | --- |
| X（縦線） | X16 26.56・X15 127.82・X13 330.36・X12 431.63・X11 532.89・X10 634.16・X9 735.43（X14 はこの線種で描かれていない。3,200 の中間線も同じ線種で 50.63pt 刻み） | X16→X9 708.87 | **63.199** |
| Y（横線） | Y16 208.27・Y15 313.92・Y14 419.57・Y13 525.22・Y12 630.87・Y9 947.82（Y11・Y10 はこの線種で無し。中間線は各区間の 1,600 と 4,800） | Y16→Y9 739.55 | **60.577** |

- 原点 X16×Y16＝**(26.56, 208.27)pt**。X/Y の縮尺差は **4.3%**（等方でない・§8-2）
- pdftotext のラベル中心（27.18／736.39／207.97／947.78）とは 0.6pt 以内で一致。線から求めた値が正
- 26F（p-1）は同じ値（`method` に「p-2 と同じ値。相互相関で同一配置」と残す・§8-1）

検算:

| 測ったもの | 実測 | 期待 | 差 |
| --- | --- | --- | --- |
| LED ウォールの描画幅 | 135.0pt×63.199＝8,532 | 表記 8,530.2 | +2 |
| トラス脚の東西の中心間 | 9,340 | p-4 の内々 9,360 | −20 |
| 部屋の奥行（MEETING ROOM・ROOM A・B・C・VIP LOUNGE） | 3,775・2,935・2,935・2,980・4,530 | 図の寸法 3,775・2,953・2,948・2,950・4,550 | ±60 以内（1px@144dpi＝30mm） |
| 26F と 27F の重ね合わせ（壁の列・行の濃度の相互相関） | 列 −1px・行 +1px | 0 | 同一配置。外壁・階段室の強い列（234／762／863／1,370px）が両ページで一致 |
| 「3200」の寸法文字の間隔 | X 50.65pt／Y 26.41pt（1,600 分） | 通り芯と同じ比率 | 異方性は本物 |
| LED 立面画像の縦横比 | 1.677 | 実寸比 8,530.2：4,876.8＝1.749 | 異方性込みなら近い |

**線で測る。ラベルの円で測らない**: p-1 上端の X16〜X9 のラベル円（中心 70.97〜719.90pt・間隔 92.7pt・幅 648.9pt）は **69.0 mm/pt** 相当で建物と合わない。縮尺の違う飾り（別のひな形から貼られたもの）で、校正に使うと **9% ずれる**。右端の縦の寸法梯子（1600/3200…・合計 44,800。258→1,187px@90dpi＝743pt）は p-2 の Y と一致する。

**migration 299 に入れる `verification`**（§8-5 の4点）: #1 X16→X9・Y16→Y9 は線から取った値なので 44,800（定義どおり）、#2 LED 8,532（期待 8,530）、#3 MEETING ROOM 3,775（期待 3,775）は上の実測をそのまま入れる。
**#4 ELV13 は申し送り**: 図の矩形の奥行は 1,740 程度で記載の 2,010 より短く（扉・敷居を含む寸法と読む）、幅は未実測。期待値は §8-5 のまま置くが、段A で寸法線を当て「かご幅 1,850 で通す・奥行は扉・敷居込みと注記する」を決めてから `verified_at` を入れる（§12-2）。migration では `verified_at`／`verified_by` を**入れない**。

高さ（p-3・図面には描かない）: 26FL→27FL ≈ 4,800（±100・推定。A-A 断面 3,682＋900＋≈230、B-B 断面 3,410＋1,200＋≈210）、▽26SL→▽26FL 244、トラス上端 26FL＋約 7,100（画素読み）。`fixtures` の `truss.heightMm` と `led-wall.sizeMm.h` にだけ入り、FL 間はどの表にも入れない（v1 は平面だけ）。

### 10-5. 下敷き PNG 4 枚（`client-techops/public/venue/`）

`pdftoppm -gray -aa no -aaVector no -png` で切り出した（アンチエイリアス有りだと 97〜192KB になるので無し。線は 1px で少しギザつくが判読できる）。変換は §8-3 の1本の式 `px = (mm − originMm) × pxPerMm`（X と Y で別）。

| file | 階 | `originMm`（x, y） | px（幅×高さ） | dpi | `pxPerMmX`／`pxPerMmY` | bytes | 使うエリア |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `world-26f.png` | 26F | (12,193, 10,995) | 800×966 | 178.444 | 0.039216／0.040913 | 24,192 | `world-studio`（X14〜X11 と LED ウォール・出入口前室） |
| `lounge-27f.png` | 27F | (27,296, 10,402) | 600×1232 | 220.177 | 0.048387／0.050481 | 54,004 | `lounge-studio`・`pantry`（自動ドアを含む） |
| `floor-26f.png` | 26F | (4,493, −1,525) | 420×584 | 53.087 | 0.011667／0.012172 | 13,156 | 階全体（`*`） |
| `floor-27f.png` | 27F | (4,493, −1,525) | 420×584 | 53.087 | 0.011667／0.012172 | 35,221 | 階全体（`*`） |

- エリアの行に `underlay` があればそれを、無ければ階の `underlay`（`floor-*.png`）を使う（§5-1）。ROOM A などの小さなエリアは v1 では階全体の下敷きを拡大して見る
- **SVG にしない理由**: `pdftocairo -svg` の出力から画像を除き座標を小数 2 桁に丸めても p-1 が 4.15MB（gzip 0.63MB）・p-2 が 6.83MB（gzip 0.46MB）。p-1 は文字・線をすべて塗りパスにアウトライン化してあり（13,542 パス）、p-2 も 23,041 パス＋家具の `<use>` 691 個を含む。拡大時の荒れが気になるなら、§10-2・§10-3 の壁座標から**壁だけの簡易 SVG を手で描く**（数 KB）ほうが元 SVG を削るより軽い — v1 のあと（§15-2）

### 10-6. 新しい会場の7手順（④・段F）

用賀以外の会場を足すとき、manager が④で踏む手順。用賀は同じ結果を migration 299 で入れてあるので、④で開くと手順 7 の手前まで終わった状態で見える。

| # | 手順 | 画面ですること | 保存される列 |
| --- | --- | --- | --- |
| 1 | PDF を選ぶ | 図面 PDF を PC から選ぶ（決算取込と同じ、ドラッグ＆ドロップかクリックで選ぶ作法）。PDF はブラウザの中で読む | — |
| 2 | 階ごとに PNG に描画 | ブラウザで pdf.js が階のページを PNG にし、`POST /techops/upload-image`（editor・5MB）で保存する。サーバーに poppler を入れない。SVG は 4〜7MB になるので使わない（用賀の下敷きは 53〜220dpi・13〜54KB） | `underlay.file`・`widthPx`・`heightPx` |
| 3 | 縮尺合わせ | **通り芯を X 2本・Y 2本クリック**し、芯間の mm（用賀なら 44,800）を打つ。X/Y 別の mm/px と原点が決まる | `calibration`（`mmPerPtX`・`mmPerPtY`・`originPt`・`gridLinePt`・`method`）・`underlay.pxPerMmX/Y`・`originMm`・`grid` |
| 4 | 4点検算 | 寸法線で §8-5 の4つを測り、±60mm なら次へ。外れたら手順 3 に戻る | `verification[]`（what・expectedMm・measuredMm） |
| 5 | エリアの多角形 | 壁の内側（内法）を多角形でなぞる。名前を付け、図の㎡表記があれば打つ。`room_id` は任意 | `qsheet_venue_areas` の行（`polygon_mm`・`bbox_mm`・`drawn_area_m2`・`shown_area_m2`・`estimated`） |
| 6 | 固定物 | LED ウォール・トラス脚・扉・ELV・階段室を矩形／線で置き、種類を選ぶ | `fixtures[]` |
| 7 | 確認済み | 手順 4 が通っていれば「縮尺確認済み」を押す（日付・人が残る）。押すまで帯に「縮尺が未確認」 | `verified_at`・`verified_by` |

画面には **「線で測る。ラベルの円で測らない」** と1文出す（§10-4。p-1 のラベル列は 69.0 mm/pt の飾りで、使うと 9% ずれる）。

---

## 11. 備品カタログ

`catalog.json`（設計時の作業ファイル。根拠は `catalog-notes.md`）の 36 件（備品 24＋カメラ 4＋人 3＋図形 5）を migration 299 で `qsheet_venue_catalog_items` に入れる。`key` は変えない（図面の `items[].key` が指す）。単位は mm。ラベルはリストの表記のまま（12文字以内）。直すのは⑤（段F）で、それまでに確定した値は migration（`qsheet_venue_catalog_items` の UPDATE）で差し替える。

### 11-1. 備品 24（備品リスト 2026.05.13）

リストは 5 群 24 行（ハイモニター 75型が WORLD STUDIO と LOUNGE STUDIO で別行）。図面に置けるのは家電を除く **20 品目**。

| No | 名前 | 寸法 mm（リストの表記） | 数量 | 保管場所 | 足元の形 | 向き | 推定 | 注記 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01-1 | 長机（白） | W1,800×D600×H720 | 20 点 | SKY STUDIO | 四角 1,800×600 | — | — | 折りたたみ式。スクール形式・島形式の基本単位 |
| 01-2 | ルベックチェア | W535×D490×座面高 430 | 80 脚 | 倉庫 | 四角 535×490 | 正面 | — | スタッキング（黒）。劇場・スクール形式の既定の椅子 |
| 01-3 | カフェチェア | W500×D430×座面高 440 | 40 脚 | 倉庫 | 四角 500×430 | 正面 | — | 背もたれ付き（黒・4本脚） |
| 01-4 | ハイテーブル | Ø600×H可変 | 1 台 | 倉庫 | 丸 Ø600 | — | — | 円卓の中心 |
| 01-5 | ハイチェア | W400×D400×H可変 | 5 脚 | 倉庫 | 四角 400×400 | — | — | 背もたれ無しのため向きを持たない |
| 01-6 | ステージ | W2,400×D1,200×H200／400 | 1 台 | 倉庫 | 四角 2,400×1,200 | — | — | 高さは H200／H400 の切替（`variants`）。札に高さ |
| 02-1 | ハイモニター 75型 | 画面 1,660×934・足元 1,700×700・H1,800 | 2 台 | WORLD STUDIO | 四角 1,700×700 | 正面 | ○ 床面積 | 画面は 75 型（対角 1,905）を 16:9 で計算。スタンド込みの床面積は写真からの推定 |
| 02-2 | ハイモニター 75型 | 同上 | 2 台 | LOUNGE STUDIO | 四角 1,700×700 | 正面 | ○ 床面積 | 同名で保管場所違いの別品目（引当が場所ごと）。スタンドが同型かも要確認 |
| 02-3 | ハイモニター 55型 | 画面 1,218×685・足元 1,250×600・H1,700 | 1 台 | 倉庫 | 四角 1,250×600 | 正面 | ○ 床面積 | 対角 1,397 |
| 02-4 | ローモニター 43型 | 画面 952×535・足元 1,000×500・H900 | 3 台 | WORLD STUDIO | 四角 1,000×500 | 正面 | ○ 床面積 | 対角 1,092。低いスタンド＝返しモニター用途 |
| 04-1 | 司会台 | W700×D490×H1,270 | 1 台 | 倉庫 | 四角 700×490 | 正面 | — | 演台。正面は客席側 |
| 04-2 | 立て看板 | —（推定 W600×D450×H1,500） | 1 台 | 倉庫 | 四角 600×450 | 正面 | ○ | 写真はパネル＋支柱＋角ベース。ベース 450 角と推定 |
| 04-3 | イーゼル | H1,200（足元は推定 600×600） | 4 台 | 倉庫 | 四角 600×600 | 正面 | ○ 足元 | 3本脚の木製。脚を開いた足元を推定 |
| 04-4 | L字 フロアスタンド | —（推定 W300×D300×H1,200） | 9 台 | 倉庫 | 四角 300×300 | 正面 | ○ | 黒い L 字形の細いポール＋小ベース |
| 04-5 | ベルトパーテーション | H860・ベルト最大 2,000（支柱ベース Ø350 は推定） | 10 台 | SKY STUDIO | 線（2点で置く・上限 2,000・支柱 Ø350） | — | ○ ベース径 | 1台＝支柱1本。1本だけ置くと支柱だけ |
| 04-6 | パーテーション | W1,200×H1,600（D は推定 400） | 6 台 | SKY STUDIO | 四角 1,200×400 | — | ○ 奥行 | 自立式の布パネル。パネル面を太い線、脚を薄い矩形で描く |
| 05-1 | 傘立て | W500×D350 | 3 台 | RECEPTION | 四角 500×350 | — | — | 1台 24 本分（3台で 72 本） |
| 05-2 | 可動式ハンガーラック | W1,230×H可変（D は推定 500） | 3 台 | 倉庫 | 四角 1,230×500 | — | ○ 奥行 | 貸出可能ハンガー 計 40 本 |
| 05-3 | 姿見 | W350×D360×H1,600 | 2 台 | 倉庫 | 四角 350×360 | 正面（鏡面） | — | キャスター付き |
| 05-4 | 台車 | W480×D750 | 2 台 | 倉庫 | 四角 480×750 | 正面（ハンドル側） | — | 搬入ルート（ELV13 積載 2,150kg）の検討用 |

家電 4 は `fixed: true`。「置く」タブには出さず、数量タブの参考欄に数と保管場所だけ出す（リストの注記「原則として設置場所からの移動はできません」）。寸法はリストが「—」で、一般的な製品寸法を仮置きした（すべて推定）:

| No | 名前 | 仮置き mm | 数量 | 保管場所 |
| --- | --- | --- | --- | --- |
| 03-1 | 電子レンジ | 500×400×H300 | 1 台 | LOUNGE STUDIO（パントリー内） |
| 03-2 | ドライヤー | 250×100×H200 | 4 台 | ROOM A,B,C・VIP LOUNGE |
| 03-3 | 電気ケトル | 250×150×H250 | 4 台 | ROOM A,B,C・VIP LOUNGE |
| 03-4 | ポット | 250×350×H350 | 1 台 | LOUNGE STUDIO（パントリー内） |

リスト全体の注記 4 つ（費用が発生するものがある／家電は原則移動不可／個数は保有総数で確保できない場合がある／内容・数量は予告なく変更）は、数量タブの脚注にそのまま出す。

### 11-2. カメラ（昭特）3 機種＋台車

昭特の製品ページは作業環境から開けなかった（§0）。**確定値**（検索で機種の仕様として確かめられたもの）と**推定値**（仮置き。範囲つき）を列で分け、確定値だけを `confirmed` に、推定値を `size_mm`／`extra` に入れる。

| 品目 | 確定（`confirmed`） | 推定（札に「寸法は推定」） | 足元・絵 | 要確認（何を・どこで） |
| --- | --- | --- | --- | --- |
| ペデスタル TP-90B | 3段コラム・空圧・**積載 60kg**（雲台込み）・**ストローク 945** | ベース径 Ø900（範囲 850〜1,050）・最低レンズ軸高 600（550〜700）・最高 1,550（1,500〜1,650）・質量 90kg（70〜110）・カメラ本体の俯瞰 350×1,100（コラム中心からレンズ側へ 150 ずらす） | 丸 Ø900（三輪ベースの外接円）＋カメラの矩形。正面あり | ベース径・最低／最高高・質量: 昭特の寸法図。搭載カメラの俯瞰寸法は機材管理のカメラ台帳と突き合わせ |
| クレーン TK-53A | **最高レンズ軸高 3,099**・台車 TI-04B | 台車 900×1,200（800〜1,000×1,100〜1,400）・アーム 2,500（2,200〜2,800）・テール 1,100・質量 250kg・カメラ 350×800・**届く範囲 3,100** | 四角 900×1,200（台車）＋アームの線＋届く範囲の点線の円＋テールの薄い円。台車の向きとアームの角度の2回転 | アーム長・テール長・台車の縦横と質量: 昭特の寸法図 |
| クレーン TK-53AL | **最高レンズ軸高 3,850**・台車 TI-04B | アーム 3,200（2,900〜3,600）・テール 1,300・質量 280kg・届く範囲 3,800（台車・カメラは TK-53A と同じ） | 同上（円が大きい） | アーム長・テール長・質量。台車が TK-53A と共通か |
| クレーン台車 TI-04B | 操舵式スタジオクレーン台車・ペデスタル型・小型ベース | 900×1,200×H700 | 四角 900×1,200。正面あり | 縦横・高さ・質量: 昭特の寸法図 |

- **届く範囲**（`sweepRadiusMm`）＝アーム長＋カメラ先端（≒ アーム＋カメラ奥行×0.75）。図面上の意味は「カメラが届く範囲＝人が入ってはいけない範囲」。後方はカウンターウェイトが振れるのでテール長の円も薄く出す。アームの角度（`armAngle`）は台車の向きと独立
- 最高レンズ軸高（3,099／3,850）とストローク（945）は俯瞰には現れないので**札に出す**。ペデスタルの最高高 ≒ 最低高＋945 だが、最低高が推定のため最高高も推定のまま
- 推定の根拠: ペデスタルは一般的なスタジオペデスタルのスキッド外接径 900〜1,000・最低レンズ高 550〜700。クレーンは最高レンズ軸高 3.1m を「台車上の旋回中心高 1.0〜1.2m＋仰角 50° 程度のアーム 2.5m」と読み、AL は最高高の差（+751）をアーム長に比例させた
- 台車 TI-04B はクレーン品目が内包しているので、単独で置くのは搬入・待機場所の検討のときだけ
- ペデスタルの後方 700 程度にカメラマンの立ち位置が要る（ケーブルも）。絵には描かず、置く人が「人（立位）」を足す

### 11-3. 人 3

| 名前 | 足元 mm | 向き | 出典（実測不要） |
| --- | --- | --- | --- |
| 人（立位） | 450×300（頭 Ø180） | 正面 | 一般的な人体寸法（肩幅 450・胸厚 300） |
| 人（着席） | 500×800 | 正面 | 一般的な着席寸法（椅子込み・膝先まで 800）。椅子品目の上に重ねず「人だけ」を置く用途（客席の埋まり方を見る） |
| 車椅子 | 700×1,200（回転の Ø1,500 を薄く添える） | 正面 | JIS T 9201 の手動車椅子の全幅 700 以下・全長 1,200 以下。回転の目安 Ø1,500 |

3 件とも `estimated: true` だが、確かめるのは出典の明記だけ（現物の実測はしない）。

### 11-4. 図形 5

| 名前 | 既定 | 足元の形 | 何に使うか |
| --- | --- | --- | --- |
| 四角 | 1,000×1,000 | 四角（伸ばせる） | 任意の W×D。名前を付けられる（受付テーブル・ケーブル養生 …） |
| 丸 | Ø1,000 | 丸（伸ばせる） | 任意の直径 |
| 線 | 2,000・実線／点線 | 線 | 動線・ケーブル・バミリ |
| 文字 | 高さ 200 | 無し | 図面上の注記。文字の高さを mm で持ち縮尺に追従 |
| 寸法線 | 2,000 | 線 | 2点間の距離を mm で表示。縮尺の確認（§8-5）にも使う |

備品・人・カメラは伸ばせない（§8-7）。伸ばしたいものは四角で置く。

### 11-5. 並べ方 7（`presets` → `shared/src/venue/arrange.ts` の既定値）

| key | 並べ方 | 使う品目 | 既定の `params`（mm） |
| --- | --- | --- | --- |
| `theater` | 劇場形式 | `rubeck-chair` | `rows` 5・`cols` 10・`pitchXMm` 550・`pitchYMm` 900・`centerAisleMm` 1,200・`sideAisleMm` 600・`frontClearanceMm` 1,500 |
| `classroom` | スクール形式 | `long-table-white`＋`rubeck-chair` | `chairsPerTable` 2・`tablesPerRow` 3・`rows` 4・`tableGapMm` 0・`rowPitchMm` 1,500・`centerAisleMm` 1,200 |
| `island` | 島形式 | `long-table-white`＋`rubeck-chair` | `tablesPerIsland` 2（`face-to-face`）・`chairsPerSide` 3・`islands` 4・`islandGapMm` 1,500 |
| `round` | 円卓 | `high-table`＋`high-chair` | `chairs` 4・`radiusMm` 550 |
| `u-shape` | コの字 | `long-table-white`＋`rubeck-chair` | `widthTables` 3・`depthTables` 2・`chairsOutside` true・`innerClearanceMm` 1,800 |
| `o-shape` | ロの字 | 同上 | 同上（閉じる） |
| `grid` | 格子に並べる | 選んだ品目 | `rows` 2・`cols` 2・`pitchXMm`／`pitchYMm` は null（品目の幅・奥行＋50） |

`grid` 以外は `estimated: true` だが「目安」であって確認対象ではない（利用者が数値を変えて使う）。既定値は DB に持たず、変えるときはコードと Vitest を直す（§5-2）。

### 11-6. 「推定」21 件と消し込み

`estimated: true` の品目は札に **「寸法は推定」** を出し、⑤で確定値を入れると印が消える。**絵は変えない**（§4-3）。`to_confirm` 列に「何を・どこで」を持つ。

| # | 品目 | 何を | どこで |
| --- | --- | --- | --- |
| 1〜4 | ハイモニター 75型 ×2・55型・ローモニター 43型 | スタンドの幅・奥行・全高 | 現物（用賀） |
| 5〜8 | 電子レンジ・ドライヤー・電気ケトル・ポット | 寸法（図面には出さないので優先度は低い） | 現物 |
| 9 | 立て看板 | パネル幅・脚の奥行・全高 | 現物 |
| 10 | イーゼル | 脚を開いた足元 | 現物 |
| 11 | L字 フロアスタンド | ベースの寸法・掲示面 | 現物 |
| 12 | ベルトパーテーション | 支柱ベースの直径 | 現物 |
| 13 | パーテーション | 安定脚の奥行 | 現物 |
| 14 | 可動式ハンガーラック | 奥行 | 現物 |
| 15 | ペデスタル TP-90B | ベース径・最低／最高高・質量 | 昭特の寸法図 |
| 16 | クレーン TK-53A | アーム長・テール長・台車の縦横・質量 | 昭特の寸法図 |
| 17 | クレーン TK-53AL | 同上 | 同上 |
| 18 | クレーン台車 TI-04B | 縦横・高さ・質量 | 昭特の寸法図 |
| 19〜21 | 人（立位・着席・車椅子） | 出典の明記のみ | — |

備品リスト由来 14・カメラ 4・人 3 ＝ 21。昭特の 4 件は誰が・いつまでに確定するかを §14-6 で決める。
確定した値は**数値だけ差し替え**、`key`・絵記号・図面に置いた品目の位置は変わらない（図面側は `key` で引くので、次に開いたときから新しい寸法で描かれる）。

---

## 12. 守ること

### 12-1. 権限

`permissionModule` は `qsheet`（ハブと同じ区画・§5-5）。

| できること | 要る権限 |
| --- | --- |
| 図面を見る・札と数量表を読む・PNG／PDF を書き出す・冊子に差し込まれた図を見る | reader |
| 図面を作る・直す・複製する・品目を置く／並べる・編集ロックを取る／放す・交代を申し出る | editor |
| 確定する・確定を解く（`rev` +1）・編集を引き継ぐ・④会場と階・⑤備品カタログを直す | manager |

行の可視性は `canAccessVenueLayout`（作成者・案件メンバー・`assigned_to`・system_admin）。番組の図面は作成者と admin だけ。
作成時の `project_id` は `canAssignManualProject` と同じ関所で止める（他案件になりすまして作れない）。冊子の resolver は `sourceId` の図面が冊子と同じ案件か再検査する（§9-2）。

### 12-2. 縮尺の砦

縮尺の正は**階**が持ち（§8-7）、図面は持たない。守るのは3つ:

| 砦 | 中身 |
| --- | --- |
| **4点検算の関所**（§8-5） | X16→X9・Y16→Y9 44,800／LED 8,530／MEETING ROOM 3,775／ELV13 1,850×2,010 を寸法線で測り、すべて ±60mm 以内でなければ「縮尺確認済み」にできない |
| **確認済みの記録** | `verified_at`・`verified_by`・`verification[]`（what・expectedMm・measuredMm）。無い階の図面は帯に「縮尺が未確認」。**migration では入れない**（人が測っていない値を確認済みにしない）。用賀は段A の中で manager が②の寸法線で測り、`PATCH /techops/venue-floors/:id`（§5-4）のうち `verified_at`・`verified_by`・`verification` を書く1本だけを先に通して記録する（④の画面全体は段F だが、この1本だけ前倒す） |
| **紙の定規**（§8-6） | 書き出しの 1m バーは消せない。1:100 なら 10mm |

「縮尺合わせ」「原点」の語は④にしか出さない。編集画面②に mm を打つ欄を最初に見せない（§1）。

### 12-3. 在庫

置いた数が保有数を超えたら**赤字で警告し、止めない**（§4-4）。備品リストの注記「確保できない場合がある」が根拠で、最後に確保するのは担当者。仕上がりの検査（§6 ③）で件数を数える。同じ日の別の図面との合算は v1 でしない（§15-2）。`equipment_item_id` は任意参照で、寸法の正はカタログ側（§4-4）。

### 12-4. 機械検査（`npm run lint`・`npm run test` で止まるもの）

| 検査 | 会場図面で当たるもの | どうするか |
| --- | --- | --- |
| 1ファイル 400 行（`check-file-size.mjs`。`client-techops/src`・`shared/src` の `.ts`／`.tsx`） | 盤・品目の描画・置く／並べる／右のパネル・幾何 | **最初から割る**（名前は目安）: `VenueBoard.tsx`（盤・render-prop）／`VenueItemView.tsx`（品目1個の描画とつまみ）／`VenueSymbols.tsx`（絵記号）／`VenuePlacePanel.tsx`（置く）／`VenueArrangePanel.tsx`（並べる）／`VenueInspector.tsx`（右）／`VenueUnderlay.tsx`（下敷き・方眼・通り芯・ものさし）／`shared/src/venue/` の `scale.ts`・`arrange.ts`・`overflow.ts`（純粋関数） |
| `PageShell`／`PageHeader`（`page-shell-missing` は techops のラチェット 7・`page-width-by-hand`・`page-h1-by-hand`・`page-safe-area-by-hand`） | ①③④⑤の `…Page.tsx` | 外枠は `<PageShell>`、名前は `<PageHeader>`。②は `ManualDetailPage` と同じ形（帯＋3列）。中間の幅・`<h1>`・safe-area をページ側で書かない |
| スマホ宣言（`check-mobile-declared.mjs`） | 5 ルート全部 | `pcOnlyScreens.ts`: ①②を `TECHOPS_MOBILE_OK`（文字列）、③④⑤を `TECHOPS_PC_ONLY`（`path`・`what`・`why`・`instead`。`/techops/manuals/:id/preview` の項が手本）に入れる。`<PcOnlyGate>` はシェル配下でしか効かない |
| 禁止語（`check-ui-tokens.mjs` の `forbidden-wording`・[wording.md](../../wording.md) ルール5） | 画面の文言 | §4-1 の隠す語を使う。機械の正規表現に「レイヤー」「キャンバス」「テンプレート」「オブジェクト」「スナップ」「シミュレーター」は**無い**ので、レビューで人が見る |
| 生パレット・角丸・幅・高さ（`raw-palette`・`hand-radius`・`col-width-by-hand`・`control-height`・`tap-target`） | 図面の線色・パネルの幅 | 図面の線色は `ShapeBlockContent` と同じ inline の hex（対象外）。Tailwind の色クラスを品目に書かない。右パネル 260／280px は 250 超で対象外（`lg:grid-cols-[280px_1fr_260px]` が前例） |
| ブラウザダイアログ（`browser-dialog`） | 削除・並べ直しの確認 | `confirmAction()`／`notifyError()`（`LinkedBlockInspector.tsx` が手本） |
| md リンク（`check-md-links.mjs`） | この文書・モックの README | 相対パスで実在するものだけ |
| changelog（`check-changelog.mjs`） | この枝 | `docs/changelog.d/claude-determined-dirac-e06ozp.md` に置いてある。版3か所（`package.json`・`CLAUDE.md`・`README.md`）は触らない |
| parity（`check-collab-parity.mjs`） | `miniapps.ts`・`manualBlocks.ts` | server 側の複製を同じに直す |
| migration 番号（`check-migration-numbers.mjs`） | 298・299 | 並行 PR とぶつかったら番号を取り直す（いまの最新は 297） |
| Vitest（`npm run test`） | `shared/src/venue/` | 縮尺変換・並べ方・はみ出し判定を固定する（`shared/tests/opsmanualCanvasGeometry.test.ts` と同じ形）。編集ロックの review 試験は `server/tests/manual-lock-review.test.mjs` の写し |
| `verify:ime`・`verify:ui techops` | 名前欄・1440／375px | 文字欄は `BufferedInput`（IME の二重入力）。②のスマホ閲覧を 375px で測る |

### 12-5. AI は v1 に入れない

「配置案を提案する」「写真から備品を数える」は自然な発想だが、**v1 では作らない**。
入れるときはルート [`CLAUDE.md`](../../../CLAUDE.md) の「AIを使い捨てにしない」5条件（`.claude/skills/ai-feedback-loop/`）を満たす設計を先に出す —
AI の出力（提案した配置）を全文で記録・人が動かした差分を残す・当日の結果（実際の席数・変更の有無）を出力に紐づける・貯めたものを改善に戻す経路・レビューの頻度と担当。**その経路を作らずに AI を足さない。** 運営マニュアル（[production-manual.md](production-manual.md) §7-3）と同じ規律。

### 12-6. 触らない既存

| 触らない | なぜ |
| --- | --- |
| 運営マニュアルの盤 `ManualCanvas`・`ManualBlockView`・`useManualMarqueeSelect`・`collectSnapTargets`・`BlockToolbar`・`BlockInspector` と `PAGE_WIDTH_MM`／`PAGE_HEIGHT_MM` | A4 固定が7か所にある紙面の盤。写すのは設計だけで、会場図面は `VenueBoard` を別に書く（§6 ②）。純粋関数は import して使い、`useManualHistory` は型引数化するだけ |
| `InsertPanel.tsx` の `requiresSource` 以外・`LinkedBlockContent.tsx`／`LinkedBlockInspector.tsx` の既存分岐 | 触るのは §9-2 の 11 か所だけ |
| `MiniAppSwitcher` の `ORDER`（5つ固定）・スマホ下タブ（3本固定） | 運営マニュアルも入っていない前例（§1） |
| `studio_locations`・`studio_rooms`・`equipment_items` の列 | カレンダー・機材台帳の表を techops が書かない。`room_id`・`equipment_item_id` の任意参照で結ぶ（§5-1） |
| 既存の接頭辞と seq（`SB`／`SD`／`OM`・`prod_doc_sb`／`prod_doc_sd`／`prod_doc_om`） | 配った番号が意味を失う。`VL`／`prod_doc_vl` を足すだけ |
| `qsheet_manuals` の列・ロック・自動保存の仕組み | 写して `qsheet_venue_layouts` に持つ。冊子側は変えない |
| 本番中に使う4画面・公開画面・Socket.IO のブリッジ・MCP の旧ツール名の二重登録 | [`client-techops/CLAUDE.md`](../../../client-techops/CLAUDE.md)「壊してはいけない契約」 |
| `production-manual.md` の決めごと（「ブロック」の語・A4 横固定・線画で描く・インクを使わない） | 会場図面はそれに**合わせる**側（§4-2・§9-3） |

---

## 13. 作る順（v1 は段A〜E）

| 段 | 何を | 終わったときに何ができるか | 検査 |
| --- | --- | --- | --- |
| **A 器** | レジストリ `venue`／`VL`／`prod_doc_vl`（§5-3）・migration 298（表4本）・299（用賀: 階 2・エリア 22・固定物 19・カタログ 36）・下敷き PNG 4 枚・①一覧と作成ダイアログ・空の②（下敷きを2軸で貼る・方眼・通り芯・ものさし・1m バー）・タイル・左メニュー・PC専用宣言・確認済みの記録の前倒し（§12-2） | 用賀の図面が案件から辿れ、縮尺の合った下敷きが見える | `npx tsc -b client-techops`・`npm run typecheck -w server`・`npm run lint`・`npm run test`（縮尺変換の Vitest） |
| **B 置く** | `VenueBoard`・図形5・人3・備品 20（家電 4 は数量だけ）・§6 ②の全操作・右パネル（mm）・数量タブ・はみ出しのハッチ・自動保存・編集ロック・PNG 書き出し | **ここで道具になる。** いま PowerPoint で作っている冊子にも PNG で貼れる | 上に加え `npm run verify:ui techops`・`npm run verify:ime`・編集ロックの review 試験 |
| **C 並べる** | 格子＋6つの並べ方・プレビュー・グループ・並べ直す／外す／解除・向き先・保有数の警告 | 客席が3手で組める | `shared/src/venue/arrange.ts` の Vitest（7つの並べ方の脚数・外接寸法を固定） |
| **D カメラと仕上がり** | 昭特3機種＋台車・2回転・届く範囲・「推定」の印・③仕上がり（A4横／A3横・縮尺・凡例・数量表・検査3つ・PDF は `window.print()`） | 技術打ち合わせに出せる | ③の PC専用宣言・`verify:ui` |
| **E 冊子へ** | `venue.layout`／`venue.items`・resolver・凍結・`?return=`・確定と版・「冊子に載っています」（§9） | 運営マニュアルに縮尺つきで載る | parity・resolver の review 試験（他案件の `sourceId` を拒む） |
| **F 会場を増やす**（v1 のあと） | ④⑤の管理画面・取り込み7手順（§10-6）・4点検算の画面・カタログ編集 | 用賀以外でも同じ手順で足せる | ④⑤の PC専用宣言 |

- **段B まで通して初めて道具になる。** 段A だけで止めると「下敷きが見えるだけ」の画面が増える
- モックは [`mockups/native/venue-layout/`](mockups/native/venue-layout/)（一覧・編集〈WORLD STUDIO 劇場形式〉・並べるのプレビュー・仕上がり・冊子に差し込んだ紙面・スマホ閲覧・考え方の地図）が正。実装で迷ったらモックに合わせる
- 着手の前提: §14-1（名前と `VL`）の回答。接頭辞は後から変えられない

---

## 14. 決めていただきたいこと（8件）

本文は「主担当の推奨」で書いてある。回答が違えば本文を直してから着手する。

| # | 論点 | 選択肢 | 主担当の推奨 | なぜ |
| --- | --- | --- | --- | --- |
| 1 | 名前と資料番号の接頭辞 | A. 「会場図面」・`VL`（`VL-202609-0001`）／B. 別の名前・別の接頭辞 | **A** | 資料の名前をそのままアプリ名にする（冊子と同じ考え方・§1）。接頭辞と seq は**後から変えられない**（§5-3） |
| 2 | 備品・人・カメラの大きさ | A. 実寸固定で伸ばせない（伸ばしたいものは「四角」で置く）／B. 何でも伸ばせる | **A** | 伸ばせると「椅子の四角が 535 なのか 600 なのか」に戻る（§2）。縮尺の担保が品目の寸法に依る（§8-7） |
| 3 | 「並べる」の結果 | A. グループ（全体で動く・後から並べ直せる・解除できる）／B. 置いた瞬間に個別の品目 | **A** | 列の間隔・通路幅を後から直せる（§7）。1つ動かすとグループから外れる形で「1脚抜き」も両立する |
| 4 | 複数案の持ち方 | A. 図面を複製して「A案」「B案」と名前を付ける（別の行）／B. 1図面の中で案を切り替える | **A** | 取り合いが図面単位で済み、冊子から `sourceId` で「どの案か」を指せる（§5-1）。B は1つの JSON に案が同居し、確定・凍結の単位が崩れる |
| 5 | スマホ | A. 閲覧のみ（編集・仕上がり・管理は PC専用宣言）／B. スマホでも編集 | **A** | つまみ・すいつき・右パネルは 375px で組めない（§6 ②）。当日の1列追加は PC で |
| 6 | 昭特の寸法の確定 | 誰がメーカーの寸法図（TP-90B ベース径・最低／最高高、TK-53A／AL アーム長・テール長、TI-04B 縦横）を取り寄せ、何月何日何時までに差し替えるか（⑤は段F なので、それまでは migration で） | **担当と期限を決める**（設計側では決められない） | 確定まで札に「寸法は推定」が出続け、届く範囲を安全距離に使えない（§11-2・§15-1） |
| 7 | 冊子に載せる中身 | A. 線画だけ（下敷き画像は載せない）／B. 下敷き画像も載せる | **A** | 冊子の「線画で描く・インクを使わない」に一致し、resolver の `data` が自己完結で 300,000 字に収まる（§9-3）。画像を載せると凍結が画像 id に依存する |
| 8 | 図面の確定と版 | A. 持たせる（`VL-… rev.N`・manager。下書きのままでも差し込める）／B. 持たせない（冊子の確定だけで凍る） | **A** | 紙に載った図がどの版かを現場で照合できる（§2 #6）。下書きでも差し込めるので、確定は任意で運用を重くしない |

**決めてよいこと（技術・設計側で決めた）**: 表は `qsheet_venue_*` 4本（§5-1）／1図面＝1エリアを既定に階全体も可／保有数超過は警告のみ（§12-3）／方位は未確認のため描かない（§8-4）／下敷きは PNG（§10-5）／編集ロックは図面まるごと（§5-6）。

---

## 15. 引き継ぐ弱点と対策・v1 でやらないこと

### 15-1. 弱点と対策

概念設計の3案（パワポ派・段取り派・連携派）の審査で残った弱点と、この文書での受け皿。

| 弱点（出どころ） | 対策 |
| --- | --- |
| 壁の中・吹き抜けにも置けてしまう。44.8m 四方で拡大が破綻する（パワポ派） | 止めない代わりに赤いハッチ（§4-5）＋仕上がりの検査（§6 ③）。1エリアを既定にし「階全体を表示」は切替 |
| 盤は書き直しで、流用は純粋関数だけ（パワポ派・連携派） | 別の盤 `VenueBoard` を書く前提で段B を見積もる（§6 ②・§12-6） |
| グループの打ち直しと1脚抜きの相性（パワポ派） | 1つ動かすと外れる（§7）。並べ直しで手直しが戻るときは確認を1回 |
| 校正が唯一の砦（パワポ派）・紙でしか最終検証できない（連携派） | 4点検算の関所＋確認済みの記録（日付・人）＋紙の定規（§12-2） |
| 順番を強いると遅い・1図面＝1エリアで動線図が作れない・検査のしきい値が推定（段取り派） | レールは作成ダイアログに畳む（§6 ①）。階全体を許す。v1 の検査は はみ出し・保有数・推定 の3つだけ（通路幅・避難経路は基準値と出入口のデータが無い） |
| 初回が重い・資料の作法が PowerPoint の軽さを削る・案件が無いと始まらない（連携派） | 連携は段E。番号と版は帯に小さく、確定は任意。番組（`program_id`）にも紐づく |
| 昭特の寸法が推定で、届く範囲を安全距離に使えない（全案） | 札の「推定」を消すのは確定値だけ（§11-6）。担当と期限は §14-6 |
| 図面の読みに不確かな点: 吹き抜け中央の南端 32,200・LED ウォールの平面位置（トラス南列 y≈30,300）・26F の出入口前室と 27F 南側通路の関係・FL 間 4,800・トラス高 7,100 | 階・エリア・固定物に `estimated: true` を残し④で直せる（§10-2・§10-3）。高さは v1 で使わない |
| ELV13 は図の矩形の奥行（≈1,740）と記載（2,010）が食い違う（§10-4） | 4点検算の #4 は段A で寸法線を当てて決めてから確認済みにする。migration では `verified_at` を入れない |
| 図の㎡表記が壁芯面積だという解釈（ROOM A/B/C・VIP・執務室が内法より 15〜20% 大きい理由・§10-2） | 画面は内法を出し、表記は「壁芯」と注記する。26F の各室は表記が無く突き合わせできない |

### 15-2. v1 でやらないこと

- **AI の配置提案**（§12-5）
- **通路幅・避難経路の検査**。基準値と出入口のデータが無い。検査は はみ出し・保有数・推定 の3つだけ（§6 ③）
- **同じ日の複数の図面での保有数の合算**（§4-4）。図面ごとの「置いた数／保有数」だけ
- **3D・立面・高さの検討**。FL 間 4,800・トラス高 7,100 は推定で、v1 は平面だけ（§10-4）
- **PowerPoint への書き出し**。出るのは PNG と PDF だけ（§6 ③）。往復させるとどちらが正か分からなくなる
- **BOX への保存・社外公開 URL**。冊子と同じく社外秘の前提
- **機材台帳との自動突き合わせ**。`equipment_item_id` の参照だけ（§4-4）。台帳に寸法の列が無い
- **MCP `list_production_docs`・ジャーニーの `days[].docs` への自動掲載**。運営マニュアルと同じ状態で別作業（§5-3・§9-5）
- **用賀以外の会場**（④⑤は段F・§10-6）。用賀は migration 299 で入れる
- **スマホでの編集**（§14-5）。当日の1列追加は PC で
- **1図面の中の案の切替**（§14-4）。案は複製で持つ
- **壁だけの簡易 SVG の下敷き**（§10-5）。v1 は PNG

### 15-3. 関連する文書

- 運営マニュアル（差し込み先・盤と純粋関数の出どころ）: [`production-manual.md`](production-manual.md)
- 制作技術支援そのもの: [`client-techops/CLAUDE.md`](../../../client-techops/CLAUDE.md)（現役ルール・検査・壊してはいけない契約）
- 見た目の規律: [`_rules.md`](_rules.md)・[`_tokens.md`](_tokens.md)・[`mockups/DESIGN_POLICY.md`](mockups/DESIGN_POLICY.md)
- 言葉づかい: [`wording.md`](../../wording.md)（ルール5〜9）
- 版に載せる文: `docs/changelog.d/claude-determined-dirac-e06ozp.md`
- モック: [`mockups/native/venue-layout/`](mockups/native/venue-layout/)
