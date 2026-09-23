# 技術資料 — 制作技術支援の新しいミニアプリ（設計・2026-09-22）

> **状態**: **実装済み（段A〜D・2026-09-22）**。§13 の9件は 2026-09-23 に全件判断済み（5 の「会社は取引先を使う」だけ推奨と違い、実装を合わせた）
> **最終確認**: 2026-09-22
> **位置づけ**: 制作技術支援に足す10個目のミニアプリ「技術資料」の正（何をする道具か・利用者に見せる語・画面・データの持ち方・初期データの入れ方・運営マニュアルとの連携・作る順）。**実装はまだ1行も書いていない。** §13 の9件は**すべて判断待ち**で、着手の前提は §13-1（名前と接頭辞 `TD`）の回答

モックは Claude Design のキャンバス（押せる試作。一覧・映像パッチ・技術スタッフ・書き出し・パッチ盤・技術人員・スマホ閲覧・考え方の地図）:

- **https://claude.ai/artifact/RsdQLVEok9dhUPxQFCcfbh**
  （作業ファイルは [`mockups/native/tech-docs/`](mockups/native/tech-docs/README.md)。
  書式は [`wiki.md`](wiki.md) のモックと同じ `.dc.html` ＋ `canvas.json` v3）

**名前について。** 「技術資料」は、かつて独立したブロックアプリ（`client-techsheet/`）の名前だった。
そのアプリは **PR #278・migration 211** で丸ごと削除されている（`server/src/shared/db/migrations/211_drop_techsheet_schema.sql:2-20` が
`techsheet_documents` を DROP し、`user_permissions`／`permission_role_modules` から `module='techsheet'` の行を消す）。
削除の理由は「制作技術支援へのマージに向けて、内容を作り直すため」で、後継は**収録設定・配信設定**と案内されている
（[`README.md`](README.md) の「モックが無いアプリ」節・[`../qsheet-recording-streaming.md`](../qsheet-recording-streaming.md)。
同文は `docs/design/qsheet-recording-streaming.md:16-18` にもある）。
旧アプリの中身は「カメラ・映像・音声の仕様書」（当時のモックの説明: `docs/design/v4/mockups/onair-data.js:239`）で、
**機器の設定**の部分は収録設定・配信設定が引き継いだ。しかし**映像パッチ表とスタッフリストはどちらにも入っていない**。
つまり名前だけが空き、中身は誰も持っていない。ここでは**その名前を、techops のミニアプリとして作り直して使う**。
旧 `client-techsheet/` は削除されたまま復活させない。

---

## 0. 経緯

依頼（2026-09-22）の要点:

- 制作技術支援（`client-techops/`）のミニアプリとして **「技術資料」** を新設する
- **映像パッチ**: BOX の完成図書にある**ビデオパッチ盤外観図・映像系統図**をもとに、増設機材などの映像プランを立ち上げる。
  `101A → 120B` のような行を並べる
- 各行は**機材をプルダウンで選ぶ → その機材に立ち上がっているパッチ番号だけに絞られる**。
  機材名・名称は**行ごとに微修正できる**（元のパッチ盤の側も編集できる）
- **技術スタッフ**: BOX の「メンバー表」PDF（協力会社が発行する技術スタッフ表）をもとに、役職と人の名前のリストを作る
- **技術人員**は会社ごとの台帳として持つ。**手入力も許す**
- **モックを先に作る**（実装は書かない）

### 0-1. BOX の2つの元資料と、取れたもの・取れなかったもの

| 元資料 | 取れたもの | 取れなかったもの |
| --- | --- | --- |
| **完成図書**（ビデオパッチ盤外観図・映像系統図・別紙1機器リスト。GMOサムライスタジオ用賀 `01_完成図書`） | 盤の命名（`VJP100`〜`VJP1800` の18枚・100刻み）／ch数（VJP100〜1200 は 48ch・盤面表記 `48MCK-H`、VJP1300〜1800 は 32ch）／盤の型番と台数（CANARE `48MCK-H` 12台・`32MCKA-STS` 5台。機器リストと機器構成表でクロスチェック済み）／A・B の2段があること／`VJP216B` のような**合成表記が現場で実運用されている一次証拠**（改訂一覧「RTR AUX6〜9 の系統の VJP 番号を `VJP216B〜219B` → `VJP211B〜215B` に修正」2026/9/9）／盤面に出るラベルの語彙（`CCU1`〜`CCU5`・`PTZ1`〜`PTZ5`・`vM1`〜`vM5`・`IP1`〜`IP8`・`PB1`〜`PB4`・`d3XR1`〜`d3XR4`・`電テロ1`・`入力ルーター in1`〜`in61`・`TRK1`〜`TRK32` ほか）／機材の型番と設置エリア（`HDCU-5500/T`＝マシンルーム、`UHSM-220220`＝第1調整室、`AW-UE160K`＝スタジオ ほか約50件） | **「何番のジャックに何の機材が来るか」の1対1対応。** PDF のテキスト抽出は2次元の配置を保たないため、番号の並びとラベルの並びが**別々の塊としてしか取れない**（VJP100 の抽出結果は `43,44,42,45,46,36,…` と物理配置の読み取り順で出る）。Box AI への問い合わせも「対応関係が判別できない／画像化されていれば抽出できる」と回答し、60MB の完成図書への網羅質問は60秒で時間切れになった。作業環境では図面を画像として開く手段（`get_preview_page`／`get_download_url`）が使えなかった |
| **メンバー表 PDF**（協力会社発行・distinct **37枚**を全件読了） | 全件同一のひな形（発行元・発行日・宛先・**作業日**・番組名・現場・`Page-N` ＋ 役職見出しの下に氏名を1人1行）／**1枚＝1作業日**（複数日の案件は日ごとに別ファイル）／役職の語 **17種**と典型の並び順／distinct **90人**／`(ver2)` は役職の付け替え（CAM→CAM-A）と人の交代を含む**実質的な改訂**／役職は人の固定属性ではなく**回ごとの割当**（同じ人が SW のときも CAM のときもある） | ふりがな・連絡先（電話・メール）・入り時間・集合時間・担当カメラ番号・備考欄は**一度も出てこない**／**案件の管理番号が本文に無い**（BOX のフォルダでしか紐づかない）／`CA`・`AUD`・`Dv`・`TP`・`3Play` の正式名称は本文に記載が無い／**ファイル名の日付は本文の作業日と食い違う**ことがある（`0620メンバー表.pdf` の本文は 2026/06/02、`0210,12メンバー表.pdf` の本文は 2026/02/10 のみ など7件） |

この2つが、そのまま §9「初期データの入れ方」の分かれ目になる。
**パッチ盤は人が転記するしかない**（機械で取れないことを実測で確かめた）。**メンバー表は一度きりの取り込みで入る**。

---

## 1. 結論（先に答え）

**技術資料は「パッチ盤に何が立ち上がっているかを1か所に置き、その上で案件ごとの映像プランと当日の技術スタッフを組み、紙と冊子に出す」道具。**
利用者が毎回やっている「完成図書の PDF を開いて番号を目で拾う」「メンバー表の PDF を見ながら名前を打ち直す」をやめる。
パッチ番号の知識は利用者の頭ではなく**パッチ盤の台帳**が持ち、人の名前は**技術人員の台帳**が持つ。
利用者が新しく覚える操作は「機材を選ぶ → 番号が絞られる」の1つだけにする。

利用者に見せる語は **10個**だけにする。

| 語 | 意味 |
| --- | --- |
| **技術資料** | 資料1件。案件か番組に紐づき、資料番号 `TD-202610-0001` を持つ。ミニアプリの名前も同じ |
| **映像パッチ** | 技術資料の中の表①。1行＝送り → 受け |
| **パッチ番号** | `216B` のような番号（盤の百の位＋盤内2桁＋段）。§4-2 |
| **機材** | パッチ盤に立ち上がっている機器。名前は `HDCU-5500 CCU1` のように型番＋役割 |
| **増設機材** | この案件のために持ち込む機材（レンタル等）。パッチ盤には無いので機材名は手入力 |
| **パッチ盤** | 管理画面と、`VJP100`〜`VJP1800` の盤そのもの。パッチ番号ごとの機材と名称の一覧 |
| **技術スタッフ** | 技術資料の中の表②。1行＝役職・名前・会社・日程 |
| **技術人員** | 管理画面。会社ごとの人と役職の台帳 |
| **会社** | 協力会社。GMO 社員も1つの会社として持つ |
| **役職** | TD・SW・CAM・VE・音声 などの担当（元の PDF の語をそのまま） |

動詞は共通ルールどおり **追加／編集／削除／キャンセル／保存**（[wording.md](../../wording.md) ルール8）に、
業務の動詞 **書き出す・複製する・取り込む・確定する** を足す。状態は **下書き／確定** の2値（会場図面と同じ）。
「送り／受け」は列の見出しに使い、`IN`／`OUT` はパッチ番号の説明に添えるだけにする。

### 1-1. 画面

```
ハブ（JourneyPage）の「技術資料」タイル（MiniAppTiles の10枚目・件数は別クエリ）
 └ ① 一覧            /techops/tech-docs?project=…        Main.dc.html   両方の端末
     ├ ② 映像パッチ    /techops/tech-docs/:id              Patch.dc.html  PC＝編集／スマホ＝閲覧
     ├ ③ 技術スタッフ  /techops/tech-docs/:id/staff        Staff.dc.html  PC＝編集／スマホ＝閲覧
     └ ④ 書き出し      /techops/tech-docs/:id/print        Print.dc.html  PC専用
左メニュー「管理」節（manager）
 ├ ⑤ パッチ盤        /techops/tech-panels                 Panel.dc.html  PC専用
 └ ⑥ 技術人員        /techops/tech-persons                People.dc.html PC専用
スマホ閲覧（②③の同じ URL・タブ切替）                      Mobile.dc.html
考え方の地図                                              Map.dc.html
```

②と③は同じ資料の**タブ切替**（`映像パッチ ｜ 技術スタッフ`）で、見出し行は共通（`TD-202610-0001 ／ 本番用 映像プラン`・状態バッジ・「書き出す」「保存」）。

| # | 画面 | 端末 | `client-techops/src/pcOnlyScreens.ts` |
| --- | --- | --- | --- |
| ① 一覧 | 両方 | `TECHOPS_MOBILE_OK`（`:173-174` に会場図面の2行が並ぶ形） |
| ② 映像パッチ（スマホは閲覧） | 両方 | `TECHOPS_MOBILE_OK` |
| ③ 技術スタッフ（スマホは閲覧） | 両方 | `TECHOPS_MOBILE_OK` |
| ④ 書き出し | PC専用 | `TECHOPS_PC_ONLY`（`:124-132` の `/techops/venue-layouts/:id/preview` が手本） |
| ⑤ パッチ盤 | PC専用・manager | `TECHOPS_PC_ONLY` |
| ⑥ 技術人員 | PC専用・manager | `TECHOPS_PC_ONLY` |

どちらにも入っていないルートがあると `scripts/check-mobile-declared.mjs` が止める（`client-techops/CLAUDE.md:127`）。

### 1-2. 導線

- ハブ（`client-techops/src/pages/JourneyPage.tsx:45-63`）のタイル → ①「技術資料を作成」→ 作成ダイアログ（**名前** → **空から／前の資料を複製** の2手）→ ②
- 左メニューの「ミニアプリ」節に1行足す（`client-techops/src/components/layout/nav.ts:248-259` の `buildResolvedSections`）。
  ⑤⑥は manager 専用の「管理」節（同 `:196-203` `adminSection()`）に「パッチ盤」「技術人員」として置く。
  レベル判定は共通シェルの `ShellNavItem.module` ではできないので、`AppShell.tsx` 側が `hasPermission('qsheet','manager')` を見て渡す（同 `:179-185` のコメント）
- **`MiniAppSwitcher` の `ORDER` には足さない。** いまは5つ固定（`client-techops/src/components/journey/MiniAppSwitcher.tsx:25-27`）で、運営マニュアルも会場図面も入っていない（[`venue-layout.md`](venue-layout.md) の §12-6 が「触らない既存」と明記）。**スマホ下タブも3本固定**（`nav.ts:272-278`）で同じ扱いにする

---

## 2. いまの何が問題か

| # | 症状 | 何が起きているか |
| --- | --- | --- |
| 1 | 映像プランを毎回 PDF から手で起こす | 増設機材をどこに挿すかを決めるのに、完成図書のビデオパッチ盤外観図と映像系統図を開き、番号を目で拾って別のファイルに書き写している。盤は18枚・パッチ番号は 48／32 あり、使えるのは空いているパッチ番号だけなのに、空きかどうかは図を見比べないと分からない |
| 2 | 番号と機材の対応が図の中にしかない | `216B` が何につながっているかは外観図の盤面ラベルを読むしかない。機械で読もうとすると**レイアウトが落ちて対応が取れない**（§0-1）。つまり今は「図を見られる人」しか映像プランを組めない |
| 3 | スタッフ表が日ごとの PDF で届く | メンバー表は1枚＝1作業日で、複数日の案件は日数分のファイルが別々に届く。ファイル名の日付が本文の作業日と食い違う実例が37枚中7枚あり、**どの PDF がどの日か**をファイル名で判断すると間違える |
| 4 | 人のリストが案件をまたいで再利用できない | 同じ人が何度も入っているのに、毎回 PDF から名前を打ち直す。誰がどの役職を何回やったかも分からない。進行台本の `masters.persons`（`server/src/contexts/qsheet/services/production/qsheet-read.service.ts:87,146`）は**資料1件の中の自由入力の文字列配列**で、会社の次元も再利用も持たない（`client-techops/src/components/editor/EditorSidebar.tsx:103-109` の「人物」） |
| 5 | どちらも管理番号に紐づかない | パッチ表もスタッフ表も個人の PC か BOX のフォルダにあり、案件（管理番号）にも資料番号にも結びつかない。メンバー表の本文には管理番号が一切書かれていない（§0-1） |
| 6 | `(ver2)` が黙って置き換わる | 改訂版は同じフォルダに別ファイルで届く。役職の付け替え（CAM→CAM-A）と人の交代の**両方**が起き得るのに、どちらの版を見ているかが分からない。前の版との差分も残らない |

根っこは2つ: **盤と人の知識が図と PDF の中にしかない**ことと、**資料が ONAiR の外にある**こと。
直し方は「PDF をきれいにする」ではなく、**盤と人を台帳にして、資料はそこから引くだけ**にすることである。

---

## 3. 使う人と場面

| 場面 | 誰が | どこで | やること |
| --- | --- | --- | --- |
| **組む**（本番の1〜2週間前） | 技術（TD・VE） | PC | 案件から技術資料を起こし、②で増設機材の映像プランを組む。機材を選ぶと番号が絞られるので、空いているパッチ番号から選ぶ。系統（増設スイッチャー・客席モニター・配信…）ごとに行をまとめる |
| **確認する** | 制作（P・AD） | PC | 同じ画面を読む。増設機材が何台になるか・どのパッチ番号を使うかを見て、レンタルの手配と突き合わせる |
| **スタッフを登録する** | 制作・技術 | PC | 協力会社から届いたメンバー表を見ながら、③に作業日ごとの行を入れる。名前は⑥の技術人員から引き、足りない人は手入力する |
| **見る**（当日） | 現場の全員 | スマホ・紙 | ④で書き出した A4横、または配られた運営マニュアルの中のページを見る。スマホでは②③を閲覧で開く |
| **盤と人を守る**（随時） | manager | PC | ⑤でパッチ盤の転記を進め、機材名・名称を直す。⑥で会社と人を足す・やめた人を非表示にする |

GMO の現場に**専任の技術アシスタントはいない**。だから②の操作は「機材を選ぶ → 番号が出る」以上に増やさない。
mm を打つ欄も、盤の物理配置を覚える必要も作らない（会場図面 [`venue-layout.md`](venue-layout.md) §1 と同じ規律）。

---

## 4. 概念モデル

### 4-1. 見せる語と隠す語

| 隠す語 | どうするか |
| --- | --- |
| ジャック／チャンネル／ポート | **「パッチ番号」**。`VJP` の接頭辞は盤の名前（`VJP100`）にだけ出す |
| デバイス／ソース／デスティネーション | **「機材」** |
| ルーティング／パッチリスト／ビデオパッチ表 | **「映像パッチ」** |
| FROM／TO | **「送り」「受け」**（列の見出し）。`out`／`in` は書き出しの矢印表記にだけ出す（§8-1） |
| マスタ／DB／台帳／ジャックパネル | **「パッチ盤」「技術人員」**（管理画面の名前をそのまま語にする） |
| ロール／ポジション | **「役職」**（元の PDF の語をそのまま） |
| 所属／ベンダー | **「会社」** |
| 仮設機材／持込機材 | **「増設機材」** |
| メンバー表 | 画面では **「技術スタッフ」**。説明文で元の PDF を「メンバー表」と呼ぶのは可 |
| インポート／エクスポート | **「取り込む」「書き出す」** |

技術用語（MCP・JSONB・API・null・スナップショット）と開発文書の比喩語（道具・決めごと・棚・札・帯・木・種・口・手つき・作法・入口・出口）は
**画面文言に一切出さない**（[wording.md](../../wording.md) ルール5・11。モックは `scripts/check-mock-wording.mjs` が止め、`BASELINE` は空なので `:92` **新規ファイルは1件でも出たら止まる**）。
**この設計書の中は対象外**（ルール11）なので、以下では「台帳」も使う（画面では「口」は使わず「パッチ番号」「ch」と書く）。ラベルは12文字まで（ルール7）。

### 4-2. パッチ番号の読み方

**パッチ番号は「盤の百の位＋盤内の2桁＋段（A／B）」の合成**である。

| 例 | 分解 | 意味 |
| --- | --- | --- |
| `216B` | VJP**2**00 ＋ **16** 番 ＋ **B** 段 | VJP200 の16番目の B段 |
| `101A` | VJP**1**00 ＋ **01** 番 ＋ **A** 段 | VJP100 の1番目の A段 |
| `1301B` | VJP**13**00 ＋ **01** 番 ＋ **B** 段 | VJP1300 の1番目の B段（4桁の盤は百の位が2桁になる） |

根拠は完成図書の改訂一覧に残る実例「RTR AUX6〜9 の系統の VJP 番号を `VJP216B〜219B` → `VJP211B〜215B` に修正」（2026/9/9）。
依頼にあった `101A → 120B` もこの書式である。**盤面のシルク印字自体は裸の `1`〜`48`** で、合成 ID は人が組み立てている。
画面では **`VJP` を省いた `216B`** を主表記にし、盤の名前は列と絞り込みで示す。

**A段＝機材の OUT（送り出し）・B段＝機材の IN（受け）** で、同じ番号の A と B は常時つながっている（ノーマル対。パッチを挿すと切れる）。
ただしこれは**参考資料（別スタジオのパッチ表。`SR6out [1-06A] → 汎用FS①in [20-12A]` / `汎用FS①out [20-12B] → SR6 in [1-06B]`）での用例**であって、
**GMO の盤に凡例が見つかっていない** → §13-2 の判断待ちにする。それまで画面には「A段＝送り出し／B段＝受け」と書き、確定したら注記を外す。

音声は `AJP100`〜`AJP600`（アナログ）・`DAJP100`（デジタル）だが、**技術資料の初版は映像だけ**にする（§13-7）。

### 4-3. 送り／受けと増設機材

1行＝**送り（信号を出す側）→ 受け（信号を入れる側）**。片側だけが増設機材のこともある。

| 行の形 | 送り | 受け | 例 |
| --- | --- | --- | --- |
| 盤 → 増設 | 機材＋パッチ番号 | 増設機材（番号なし・端子の名前は手入力） | `CCU1 ／ 101A` → `ATEM 2 M/E（増設）／ IN1` |
| 増設 → 盤 | 増設機材（番号なし） | 機材＋パッチ番号 | `ATEM 2 M/E（増設）／ PGM OUT` → `入力ルーター ／ 136B` |
| 盤 → 盤 | 機材＋パッチ番号 | 機材＋パッチ番号 | `出力ルーター ／ 210A` → `配信ENC 1 ／ 1301B` |

**増設機材の側はパッチ番号を持たない。** 機材名の右に薄い「増設」の印を出し、端子の名前（`PGM OUT`・`HDMI IN`・`SDI IN`）は自由入力にする。

### 4-4. 系統・名称・版

| 語 | 中身 |
| --- | --- |
| **系統** | 映像パッチの行の**まとまりの見出し**（増設スイッチャー・客席モニター・配信…）。現場の技術者が使っている既存のパッチ表が `〈ニュース1サブ FS〉` のような見出しで機能ブロックを区切る形だったため、同じ単位を持つ |
| **名称** | 1行に付ける短い説明（`CAM1 3G-SDI`・`ATEM PGM → in36`）。**送り機材の名称を初期値にして、行ごとに書き換えられる**（依頼の「名称は微修正したい」がこれ） |
| **版** | `確定` するたびに `rev` を +1 する（会場図面と同じ）。メンバー表の `(ver2)` に相当するもので、**前の版の紙が何だったかを現場で照合できる**ようにする |

### 4-5. 技術スタッフと役職

- **1行＝1人の1作業日分の割当**（役職・名前・会社・作業日）。元のメンバー表が1枚＝1作業日なので、この単位に揃える
- **役職は人の固定属性ではない。** 同じ人が SW のときも CAM のときもある（37枚の実測で、3種類の役職に出る人もいた）。
  だから役職は**行が持ち**、人（⑥の技術人員）が持つのは「よく担当する役職」の候補だけにする
- 役職の語と並び順は**元の PDF の表記をそのまま使う**（`SW → CAM →（CAM-A）→ MIX → AUD → CA →（CA-A）→ VE →（LD）→（LD-A）→ PA／PA MIX → 配信管理 →（3Play・TP・Dv）`）。
  `CA` の正式名称は PDF に無い（32/37枚に出る主要役職なのに意味が確定していない）→ §13-3 の判断待ち
- **会社**は人が持つ（GMO 社員も1つの会社として持つ）。実体は**案件管理の取引先 `companies`**（§13-5・migration 307）で、案件の発注元とは別物として使うだけで混ぜない

---

## 5. データの持ち方

### 5-1. 表6本（migration **305**・会社は307で `companies` に統合）

設計時点（2026-09-22）の最新は `303_wiki.sql` だったので 304 を取ったが、並行 PR が `304_activity_body_edited.sql` を先にマージしたため **305 に取り直した**。
`scripts/check-migration-numbers.mjs:27-59` は番号の重複だけを見るので、**並行 PR とぶつかったら番号を取り直す**。
書き方（`TEXT PRIMARY KEY`・`TIMESTAMPTZ`・`deleted_at`・owner の CHECK・部分インデックス）は `297_qsheet_manuals.sql`／`298_venue_layout.sql:1-21` をそのまま写す。
接頭辞は techops の前例どおり **`qsheet_*`**（`client-techops/CLAUDE.md:16`）。

```sql
-- 305: 制作技術支援 — 技術資料（ミニアプリ）段A。設計: docs/design/v4/tech-docs.md §5

-- ── 資料（1件 = 1行） ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS qsheet_tech_docs (
  id                 TEXT PRIMARY KEY,
  doc_no             TEXT,                                -- TD-202610-0001（sequences.prod_doc_td）。必ず発番
  title              TEXT NOT NULL DEFAULT '',
  project_id         TEXT REFERENCES projects(id),
  program_id         TEXT REFERENCES qsheet_programs(id),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'fixed')),
  rev                INTEGER NOT NULL DEFAULT 0,          -- 確定するたびに +1
  copied_from        TEXT REFERENCES qsheet_tech_docs(id),
  fixed_at           TIMESTAMPTZ,
  fixed_by           TEXT REFERENCES users(id),
  locked_by          TEXT REFERENCES users(id),           -- 編集ロック（資料まるごと・§5-4）
  locked_at          TIMESTAMPTZ,
  lock_requested_by  TEXT REFERENCES users(id),
  lock_requested_at  TIMESTAMPTZ,
  created_by         TEXT REFERENCES users(id),
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT qsheet_tech_docs_owner_ck CHECK (num_nonnulls(project_id, program_id) = 1)
);
```

`owner` の CHECK は `298_venue_layout.sql` の `qsheet_venue_layouts_owner_ck` と同じ形にする。
`kind: 'document'` のミニアプリは `:ownerKey` を使わず `?project=`／`?program=` のクエリで絞る（`server/src/contexts/qsheet/routes/venue-layouts.routes.ts:41-45`）ので、
`server/src/contexts/qsheet/device-settings-owner.ts:34-37` の `Owner` には触らない。

```sql
-- ── 映像パッチの行（1行 = 1つの 送り→受け） ────────────────
CREATE TABLE IF NOT EXISTS qsheet_tech_patch_rows (
  id                TEXT PRIMARY KEY,
  tech_doc_id       TEXT NOT NULL REFERENCES qsheet_tech_docs(id) ON DELETE CASCADE,
  group_label       TEXT NOT NULL DEFAULT '',             -- 系統（増設スイッチャー・客席モニター…）
  sort_order        INTEGER NOT NULL DEFAULT 0,
  from_device_text  TEXT NOT NULL DEFAULT '',             -- 送りの機材名（増設機材もここ）
  from_jack_id      TEXT REFERENCES qsheet_patch_jacks(id),  -- 盤から引いたときだけ入る
  from_jack_text    TEXT NOT NULL DEFAULT '',             -- 101A / PGM OUT（写した値）
  from_is_extra     BOOLEAN NOT NULL DEFAULT false,       -- 送りが増設機材
  to_device_text    TEXT NOT NULL DEFAULT '',
  to_jack_id        TEXT REFERENCES qsheet_patch_jacks(id),
  to_jack_text      TEXT NOT NULL DEFAULT '',
  to_is_extra       BOOLEAN NOT NULL DEFAULT false,
  label             TEXT NOT NULL DEFAULT '',             -- 名称（送り機材の名称を初期値に・行ごとに編集可）
  signal            TEXT NOT NULL DEFAULT '',             -- 3G-SDI / 12G-SDI / HDMI …
  note              TEXT NOT NULL DEFAULT '',             -- 備考
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_patch_rows_doc
  ON qsheet_tech_patch_rows(tech_doc_id, sort_order);
```

**系統（`group_label`）を別の表にしない理由**:

| なぜ | 中身 |
| --- | --- |
| 元の形がそうだから | 現場のパッチ表は `〈系統名〉` の**見出し**で区切った箇条書きで、系統そのものに属性は無い（色も番号も持たない） |
| 並べ替えが1本で済む | 行の順は `sort_order` 1列で決まる（`216_qsheet_schedule.sql:71` の `qsheet_schedule_items` と同じ形）。表を割ると「系統の順」と「系統の中の行の順」の2本になり、行を別の系統へ移す操作が2本の更新になる |
| 空の系統という状態を作らない | 表にすると「行が0本の系統」が残り、画面に見出しだけが出る。文字列なら書き換えるだけで消える |
| 後から足せる | 系統に色や「紙に出す／出さない」が要るようになったら、そのとき `qsheet_tech_patch_groups` を足して `group_label` を移す。**先に作らない** |

系統名の付け替えは `UPDATE … SET group_label = $2 WHERE tech_doc_id = $1 AND group_label = $3` の1本で済ませる。

```sql
-- ── 技術スタッフの行（1行 = 1人の1作業日） ─────────────────
CREATE TABLE IF NOT EXISTS qsheet_tech_staff_rows (
  id            TEXT PRIMARY KEY,
  tech_doc_id   TEXT NOT NULL REFERENCES qsheet_tech_docs(id) ON DELETE CASCADE,
  work_date     DATE NOT NULL,                            -- 作業日（1行 = 1日。§4-5）
  role          TEXT NOT NULL DEFAULT '',                 -- SW / CAM / CAM-A / MIX …（元の PDF の語）
  person_id     TEXT REFERENCES qsheet_tech_persons(id),  -- 台帳から引いたときだけ入る
  person_name   TEXT NOT NULL DEFAULT '',                 -- 写した名前（手入力もここ）
  company_id    TEXT REFERENCES companies(id),            -- 会社（取引先。§13-5・migration 307）
  company_name  TEXT NOT NULL DEFAULT '',                 -- 写した会社名
  note          TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_staff_rows_doc
  ON qsheet_tech_staff_rows(tech_doc_id, work_date, sort_order);
```

```sql
-- ── パッチ盤（組織共通。案件に紐づけない） ─────────────────
CREATE TABLE IF NOT EXISTS qsheet_patch_panels (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,                             -- VJP100 … VJP1800
  jack_count   INTEGER NOT NULL CHECK (jack_count IN (32, 48)),
  kind         TEXT NOT NULL DEFAULT 'jack' CHECK (kind IN ('jack', 'trunk')),  -- trunk = TRK1〜32
  location     TEXT NOT NULL DEFAULT '',                  -- 第1調整室 / マシンルーム …
  model        TEXT NOT NULL DEFAULT '',                  -- 48MCK-H / 32MCKA-STS
  note         TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT REFERENCES users(id),
  CONSTRAINT qsheet_patch_panels_name_uq UNIQUE (name)
);

-- ── 盤の1ch（1ch × 段 = 1行。VJP100 なら 48 × 2 = 96 行） ───
CREATE TABLE IF NOT EXISTS qsheet_patch_jacks (
  id           TEXT PRIMARY KEY,
  panel_id     TEXT NOT NULL REFERENCES qsheet_patch_panels(id) ON DELETE CASCADE,
  jack_no      INTEGER NOT NULL,                          -- 盤面の裸の番号 1〜48（または 1〜32）
  jack_row     TEXT NOT NULL CHECK (jack_row IN ('A', 'B')),
  device_name  TEXT NOT NULL DEFAULT '',                  -- CCU1 / 入力ルーター …（空 = 未転記）
  label        TEXT NOT NULL DEFAULT '',                  -- CCU1 OUT / in1 …
  signal       TEXT NOT NULL DEFAULT '',
  area         TEXT NOT NULL DEFAULT '',                  -- マシンルーム / 第1調整室 …
  note         TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT REFERENCES users(id),
  CONSTRAINT qsheet_patch_jacks_pos_uq UNIQUE (panel_id, jack_no, jack_row)
);
```

- 列名が `position`／`row` ではなく **`jack_no`／`jack_row`** なのは、`ROW` が PostgreSQL の予約語、`POSITION` も予約語（関数名としてだけ使える）で、
  引用符なしに書けないため。盤面に出る語ではないので画面には出ない
- **パッチ番号（`216B`）は列に持たない。** 盤の名前と `jack_no`・`jack_row` から組み立てる（`shared/src/tech/patchNo.ts` の純粋関数・§7-2）。
  二重に持つと、盤の名前を直したときに番号だけ古くなる
- 「**転記の進み**」は列に持たず数えて出す。分母は盤のch数（`jack_count`）、分子は **A段か B段のどちらかに機材名が入っている番号の数**
  （`COUNT(DISTINCT jack_no) FILTER (WHERE device_name <> '')`）。行数（48×2＝96）ではなく**番号の数**で数える（§9-1）

```sql
-- ── 人（組織共通。案件に紐づけない。会社は案件管理の取引先 companies を使う） ──
CREATE TABLE IF NOT EXISTS qsheet_tech_persons (
  id                TEXT PRIMARY KEY,
  company_id        TEXT REFERENCES companies(id),         -- 会社（案件管理の取引先。§13-5・migration 307）
  name              TEXT NOT NULL,
  kana              TEXT NOT NULL DEFAULT '',             -- 元の PDF に無いので当面は空（§9-2）
  main_roles        TEXT[] NOT NULL DEFAULT '{}',         -- よく担当する役職（候補。固定属性ではない）
  active            BOOLEAN NOT NULL DEFAULT true,        -- false = 候補に出さない
  partner_id        TEXT REFERENCES partners(id),         -- 任意参照（§5-2）
  note              TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_persons_company_id
  ON qsheet_tech_persons(company_id) WHERE deleted_at IS NULL;
```

migration 305 は自前の `qsheet_tech_companies`（`name`・`short_name`・任意参照 `company_id`）を作ったが、
migration **307**（並行 PR の `306_notification_template_overdue_wording.sql` と衝突したため 306 から取り直し）（§13-5・2026-09-23 のご判断）で会社を**取引先 `companies` そのもの**に寄せ、
`qsheet_tech_persons.tech_company_id` を `company_id`（`companies` 参照）に置き換え、`qsheet_tech_companies` は DROP した
（`server/src/shared/db/migrations/307_tech_persons_companies.sql`）。

**参加回数は列に持たない。** `qsheet_tech_staff_rows` を `person_id` で数えて出す（`COUNT(DISTINCT (tech_doc_id, work_date))`）。
列に持つと、行を消したときに数だけ残る。

### 5-2. 名前を写す（会社を除き既存の表は書かない）

`qsheet_tech_persons.company_id` → `companies(id)`（§13-5・migration 307）、`qsheet_tech_persons.partner_id` → `partners(id)`、
`qsheet_tech_staff_rows.person_id`／`company_id`、`qsheet_tech_patch_rows.from_jack_id`／`to_jack_id` は**すべて任意参照**にし、
**表示に使う名前は必ず隣の列に写す**（`person_name`・`company_name`・`from_jack_text`・`to_jack_text`）。

| なぜ | 中身 |
| --- | --- |
| 消しても資料が空にならない | 台帳から人やパッチ番号を消しても、確定した資料の中の名前は残る |
| 手入力と同じ形で入る | 台帳に無い人・番号を持たない増設機材の端子を、同じ列にそのまま書ける |
| 読むのに JOIN が要らない | `130_project_members.sql:10-31` の `user_id`＋`member_name` と同じ二本立て |
| 既存の表の列を書き換えない | `partners`（`001b_postgresql_schema.sql:55-68`）・`equipment_items`（`007_equipment.sql:18-57`）の**列は触らない**（[`venue-layout.md`](venue-layout.md) §12-6。`298_venue_layout.sql:52,80` の `room_id`／`equipment_item_id` と同じ作法）。`companies`（`061_companies.sql:8-29`）も既存の行は書き換えないが、下の理由で**新しい行を足すことだけ**は例外的に行う |

会社の台帳は**案件管理の取引先 `companies` そのもの**（§13-5・2026-09-23 のご判断・migration 307）。`GET /companies` は
`requirePermission('sales')`（`server/src/contexts/sales/routes/companies.routes.ts:128`）で techops の利用者が `sales` 区画を持つとは限らないため、
techops 専用の口（`GET/POST /techops/tech-companies`・`tech-master.service.ts` の `listCompanies`／`createCompany`）を**qsheet 権限のまま**用意し、
`id`・`name`・`short_name`・人数（`person_count`）だけを読む（連絡先・支払条件などは出さない）。⑥の「会社を追加」は**同じ名前の取引先があれば
それを使い、無ければ仕入先（`is_vendor`）として作る**だけで、既存の取引先は書き換えない。**取引先の名前の変更・削除は案件管理で行う**
（`server/src/contexts/qsheet/services/tech-master.service.ts:243-247` のコメント）。

### 5-3. ミニアプリのレジストリへの登録

```ts
// shared/src/production/miniapps.ts の MINI_APPS に1件足す
// （server/src/shared/production/miniapps.ts にも本文が1文字も違わない複製を置く）
{
  kind: 'document',
  key: 'tech',
  label: '技術資料',
  docPrefix: 'TD',
  docNoSeq: 'prod_doc_td',
  table: 'qsheet_tech_docs',
  listPath: '/techops/tech-docs',
  docPath: '/techops/tech-docs/:id',
  stages: ['day'],
  enabled: true,
}
```

- `MiniAppKey` の union（`shared/src/production/miniapps.ts:52`）に `'tech'` を足す。ソースの `'tech'` は seed の見積カテゴリ文字列だけ（`server/src/shared/db/seed.ts:1240`）で衝突しない
- venue の1件は `shared/src/production/miniapps.ts:200-211` にあり、型の契約は `MiniAppDocumentDef`（同 `:67-81`）
- **`docPrefix`／`docNoSeq` は重複禁止・後から変えない**（同 `:69,71` のコメント）。使用中は `SB`／`SD`／`OM`／`VL`（同 `:109,121,133,205`）なので `TD`／`prod_doc_td` は空いている。§13-1 の回答を取ってから着手する
- **server の複製と2ファイル同時に直す**（`server/src/shared/production/miniapps.ts:11,148`）。`scripts/check-collab-parity.mjs:26` の `PAIRS` が本文の一致を見て、コメント以外が1行でも違うと止まる（`:42-90`）
- 重複の固定テストは `shared/tests/miniapps.test.ts:23-48`（key／docPrefix／docNoSeq／listPath／docPath の重複禁止・`docPath` に `:id` 必須）
- `kind: 'document'` にする理由は会場図面と同じ（[`venue-layout.md`](venue-layout.md) §5-3）: 1案件に資料が複数ある（本番用・リハ用）／冊子から `sourceId` で「どの資料か」を指す／確定・複製の作法を写せる／紙に `TD-…` で載せて現場で照合できる
- **`kind: 'document'` でも MCP `list_production_docs` とジャーニーの `days[].docs` には自動で出ない**（読む表を種類ごとに書いているため）。技術資料は `list_production_docs` にだけ足した（`doc-list.service.ts` の `fetchTechDocs`）。`days[].docs` には載せない（§7-5）

### 5-4. 資料番号・権限・同時編集

| 項目 | 中身 |
| --- | --- |
| **資料番号** | `server/src/contexts/qsheet/services/docNo.service.ts:14-20` の `issueDocNo('tech')` が `MINI_APP_BY_KEY` から `docNoSeq`／`docPrefix` を読んで `generateSequenceNumber()` を呼ぶ。書式は `PREFIX-YYYYMM-0001`（`server/src/shared/services/sequence.service.ts:6-24`）で **`TD-202610-0001`**。**月が変わるとカウンタが 1 に戻る** |
| **`sequences` の行** | `prod_doc_td` の行を**先に入れる必要は無い**。`INSERT … ON CONFLICT (seq_name) DO UPDATE` が作る（同 `:6-24`・表は `001b_postgresql_schema.sql:93`） |
| **権限区画** | `qsheet` のまま。**新しい区画を作らない**（`shared/src/client/apps.ts:87-94`・`client-techops/CLAUDE.md:14`） |
| **読む** | ルーター全体に `requireAuth, requirePermission('qsheet')`（`server/src/contexts/qsheet/routes/venue-layouts.routes.ts:30` の形）＝ reader 以上 |
| **書く** | 各ルートに `requirePermission('qsheet','editor')`（同 `:47,89,104,114,124,145,152,159`） |
| **確定・ロックの引き継ぎ・⑤⑥のマスタ編集** | `'manager'`（同 `:131,138,166`）。ミドルウェアの実体は `server/src/shared/middleware/auth.ts:193`、レベルは `:130` の `PermissionLevel`、`system_admin` は素通し（`:200-203`） |
| **行の可視性** | `server/src/contexts/qsheet/access.ts:125-140` の `canAccessVenueLayout` を写した `canAccessTechDoc`（作成者／`project_members`／`projects.assigned_to`／admin）。作成時のなりすましは同 `:148` `canAssignVenueLayoutProject` と同じ関所で止める。**存在秘匿で 404**（`venue-layouts.routes.ts:33-39`） |
| **同時編集** | **Yjs は使わない。** 運営マニュアル・会場図面と同じ「資料まるごとの編集ロック（`locked_by`／`locked_at`／`lock_requested_by`・10分で自動解除・60秒で延長）＋ `expected_updated_at` の楽観ロック」（[`venue-layout.md`](venue-layout.md) §5-6・`venue-layouts.routes.ts:145-170`）。`scripts/check-collab-parity.mjs:21-23` の Yjs 対にも触れない |
| **行は行ごとに更新する** | 表の本文は JSONB ではなく正規化した行（§5-1）なので、1行の編集は1行の UPDATE で済む。ロックは「同じ資料を2人が同時に組み替える」ことを防ぐためだけに持つ |

### 5-5. API

| メソッド | 道 | 権限 |
| --- | --- | --- |
| GET | `/techops/tech-docs?project=…&program=…` | qsheet reader |
| GET | `/techops/tech-docs/:id`（資料＋パッチ行＋スタッフ行） | qsheet reader |
| POST | `/techops/tech-docs`（`copy_from` で複製） | qsheet editor |
| PATCH | `/techops/tech-docs/:id`（名前・状態） | qsheet editor |
| POST/PATCH/DELETE | `/techops/tech-docs/:id/patch-rows`（`…/:rowId`・並べ替えは `sort_order` の一括 PATCH） | qsheet editor |
| POST/PATCH/DELETE | `/techops/tech-docs/:id/staff-rows`（同上） | qsheet editor |
| POST | `/techops/tech-docs/:id/fix`（確定＝`rev` +1）／ `…/unfix` | qsheet **manager** |
| POST/DELETE | `/techops/tech-docs/:id/lock`／ POST `…/lock/request` ／ `…/lock/takeover`（manager） | qsheet editor |
| GET | `/techops/tech-panels`（盤の一覧）・`/techops/tech-panels/:id`（パッチ番号の一覧） | qsheet reader |
| PATCH | `/techops/tech-panels/:id/jacks/:jackId` | qsheet **manager** |
| GET | `/techops/tech-persons`（人の一覧）・`/techops/tech-persons?company=…&q=…` | qsheet reader |
| POST/PATCH/DELETE | `/techops/tech-persons` | qsheet **manager** |
| GET | `/techops/tech-companies`（会社の一覧。中身は取引先 `companies`） | qsheet reader |
| POST | `/techops/tech-companies`（会社を追加。同名の取引先の再利用／無ければ仕入先として作成） | qsheet **manager**（名前の変更・削除は無い。案件管理で行う） |
| GET | `/techops/manuals/:id/resolve`（既存。`tech.*` を解決する分岐を足す） | qsheet reader |

ルーターは `server/src/contexts/qsheet/index.ts:70-72` に `router.use(prefix, techDocsRoutes)` として足す（import は同 `:20-21`）。
`server/src/routes/index.ts:32-33` が `createQsheetRoutes` を `/qsheet` と `/techops` の2回マウントしているので、**新しいルーターも自動的に両方に出る**。

---

## 6. 画面ごとの決めごと

### ① 一覧 `/techops/tech-docs`（`Main.dc.html`）

- 運営マニュアル・会場図面と同じ「資料が複数ある道具」の一覧。`?project=`／`?program=` で絞る。外枠は `PageShell`、名前は `PageHeader`（主ボタン「技術資料を作成」）
- 1行＝ 資料番号・名前・**映像パッチ n 行**・**技術スタッフ n 人**・状態（下書き／確定）・更新日時と更新した人
- 作成ダイアログは**2手**: 名前 → 「空から」／「前の資料を複製」。複製は `copied_from` に元を残し、パッチ行とスタッフ行をまるごと写す（作業日だけ空にする）

### ② 映像パッチ `/techops/tech-docs/:id`（`Patch.dc.html`）

見出し行は③と共通（`TD-202610-0001 ／ 本番用 映像プラン`・状態バッジ・「書き出す」「保存」・タブ `映像パッチ ｜ 技術スタッフ`）。

表の列は `#｜送り 機材｜送り パッチ番号｜→｜受け 機材｜受け パッチ番号｜名称｜備考`。系統ごとに見出し行で区切る。

| 操作 | 中身 |
| --- | --- |
| **機材を選ぶ** | 機材のセルを押すと候補が開く。先頭に検索欄、下に機材の一覧、**末尾に「増設機材として手入力」**。増設機材を選ぶと、そのセルは自由入力になり右に薄い「増設」の印が出る |
| **パッチ番号が絞られる** | 機材を選ぶと、**その機材に立ち上がっているパッチ番号だけ**に候補が絞られる（`qsheet_patch_jacks` を `device_name` で引く）。**空きが先**に出て、この資料で既に使っているパッチ番号には「使用中」の印を付ける。候補には番号・名称・盤の名前を並べる |
| **名称** | 送り機材の名称（`qsheet_patch_jacks.label`）を初期値に入れ、**行ごとに書き換えられる**。書き換えたら盤の側は変わらない（写した値・§5-2） |
| **行の操作** | 追加／並べ替え（つかんで動かす・`sort_order`）／削除。系統をまたいで動かせる |
| **右パネル** | 「この資料の増設機材 n」（手入力した機材の一覧）・「この資料で使うパッチ番号 n ／ うち増設機材へ n」・書き出しの形の見本1行（§8-1） |

モックでは **1行が機材のプルダウンを開いた状態**、**別の1行がパッチ番号のプルダウンを開いた状態**（使用中の印つき）で描く。

### ③ 技術スタッフ `/techops/tech-docs/:id/staff`（`Staff.dc.html`）

表の列は `役職｜名前｜会社｜10/14｜10/15｜入り時間｜備考`。役職の並びは元の PDF の順（§4-5）。

| 操作 | 中身 |
| --- | --- |
| **作業日** | 見出しの下に日のチップ（`10/14（水）仕込み・リハ` ／ `10/15（木）本番`）。押すとその日の行だけに絞る。1つの資料に複数の作業日を持つ（§13-4） |
| **人を選ぶ** | 名前のセルを押すと候補が開く。検索欄・**会社の絞り込み**・候補は「名前＋よく担当する役職＋参加回数」。**末尾に「手入力で追加」**（台帳に無い人をその場で入れる。台帳には足さない） |
| **会社** | 人を選ぶと自動で入る。手入力の行は会社も手入力 |
| **入り時間・備考** | 自由入力。元のメンバー表には無い項目なので、既定は空（§0-1） |

モックでは **1行が人の候補を開いた状態**で描く。

### ④ 書き出し `/techops/tech-docs/:id/print`（`Print.dc.html`・PC専用）

- A4横 1枚に**映像パッチ表**と**技術スタッフ表**を並べる。版面の内寸は **267×186mm**（A4横 297×210・余白 12/12/15/15。[`venue-layout.md`](venue-layout.md) §9-1）
- 右上に用紙の選択と「PDF で書き出す」（`window.print()`）。運営マニュアルへ差し込める旨は付箋で説明する
- 映像パッチは**矢印表記**で出す（§8-1）。技術スタッフは元のメンバー表と同じ「役職を見出しにして、その下に名前を1人1行」の形で、作業日ごとに塊にする

### ⑤ パッチ盤 `/techops/tech-panels`（`Panel.dc.html`・PC専用・manager）

- 左に**盤の一覧**（`VJP100 48ch 使用中 35` のように、名前・ch数・転記済みの数）。`VJP1700`／`VJP1800` は `TRK 32` と出す
- 中央に**番号の表**（`パッチ番号｜段｜機材｜名称｜信号｜備考`）。セルを押してその場で編集する（`BufferedInput`）
- 上に**盤の絵**（A段・B段の2列のジャック。`device_name` が入っているパッチ番号は塗り、空は白）。絵は位置合わせの目印で、押すと表の該当行に移る
- 見出しに「**転記の進み 35／48**」（§9-1）

### ⑥ 技術人員 `/techops/tech-persons`（`People.dc.html`・PC専用・manager）

- 左に**会社の一覧**（人数つき）。中央に**人の表**（`名前｜ふりがな｜役職（複数）｜参加回数｜最近の案件｜備考`）
- 右上に「追加」。**「メンバー表から取り込む」は押せない形で置き、付箋で理由**（§9-2 が段C の後半のため）
- 参加回数と最近の案件は `qsheet_tech_staff_rows` から数える（§5-1）

### スマホ（`Mobile.dc.html`）

- ②③の**閲覧だけ**。上部にタブ（映像パッチ／技術スタッフ）。同じ URL で、幅で中身を入れ替える（`/techops/manuals/:id` と同じ形・`pcOnlyScreens.ts:173-174`）
- 1行1カード。映像パッチは1行目に `送り → 受け`、2行目に名称。技術スタッフは名前・役職・会社
- 編集は PC の案内だけにする。「PC で見る」の文言は共通シェルが持っているので**作らない**

---

## 7. 守ること

### 7-1. 言葉

- 画面に出す語は §1 の10個と §4-1 の言い換え。**技術用語と比喩語を出さない**（[wording.md](../../wording.md) ルール5・11）
- ラベルは**12文字まで**（ルール7）。超えたら副題に落とす
- 動詞は**追加／編集／削除／キャンセル／保存**の1組（ルール8）。進行中は「保存中…」（三点リーダは `…`）
- **「探す」は使わず「検索」**（ルール9）。通じるカタカナ語は言い換えない（ルール10）
- モックの画面文字は `scripts/check-mock-wording.mjs` が見る。対象は `docs/design/v4/mockups/{native,…}/**/*.dc.html`（`:38-39,68-77`）で、
  HTML/JS コメントとタグを落とした**画面に出る文字**（`<script>` の中も見る・`placeholder`/`title`/`aria-label`/`alt` の値は残る・`:59-66`）。
  **`BASELINE` は空**（`:92`）なので**新規ファイルは0件が必須**（`:113`・`:28`）。「口」は比喩語なので画面には出さず「パッチ番号」「ch」と書く。「盤」の説明文は特に注意ので、画面では「パッチ番号」「パッチ盤」に寄せる

### 7-2. 1ファイル 400 行

`scripts/check-file-size.mjs:27` の上限は **400 行**、対象は `client-techops/src`・`shared/src` ほか（`:36`。**`server/src` は対象外**）。
方式はラチェットで、`scripts/file-size-baseline.json` より増えたら止まる（`:11-14`）。
会場図面が最初から9本以上に割った（[`venue-layout.md`](venue-layout.md) §12-4）のと同じく、**設計の段階で割り方を決めておく**。

| ファイル（目安） | 中身 |
| --- | --- |
| `client-techops/src/pages/tech/TechDocListPage.tsx` | ①一覧と作成ダイアログ |
| `client-techops/src/pages/tech/TechDocPage.tsx` | ②③の親（見出し行・タブ・保存・ロック） |
| `client-techops/src/pages/tech/PatchTable.tsx` | ②の表と系統の見出し・並べ替え |
| `client-techops/src/pages/tech/PatchRow.tsx` | 1行の描画と編集 |
| `client-techops/src/pages/tech/PatchRowExtras.tsx` | 増設機材の入力・「増設」の印・名称の初期値 |
| `client-techops/src/pages/tech/DevicePicker.tsx` | 機材の候補（検索・末尾の手入力） |
| `client-techops/src/pages/tech/JackPicker.tsx` | パッチ番号の候補（機材で絞る・空きが先・使用中の印） |
| `client-techops/src/pages/tech/StaffTable.tsx` | ③の表と作業日のチップ |
| `client-techops/src/pages/tech/PersonPicker.tsx` | 人の候補（会社の絞り込み・手入力） |
| `client-techops/src/pages/tech/TechDocPrintPage.tsx` | ④の紙面 |
| `client-techops/src/pages/tech/TechPanelsPage.tsx` | ⑤（盤の一覧・番号の表・盤の絵） |
| `client-techops/src/pages/tech/TechPanelBoard.tsx` | ⑤の盤の絵だけ |
| `client-techops/src/pages/tech/TechPersonsPage.tsx` | ⑥ |
| `client-techops/src/hooks/useTechDoc.ts`・`useTechMasters.ts` | 取得・保存・ロック |
| `client-techops/src/lib/techApi.ts` | API の呼び出し |
| `shared/src/tech/patchNo.ts` | パッチ番号の組み立て・分解（純粋関数・Vitest） |
| `shared/src/tech/patchExport.ts` | 矢印表記の組み立て（純粋関数・Vitest） |

サーバー側は 400 行の対象外なので、`routes/tech-docs.routes.ts`・`routes/tech-masters.routes.ts`・`services/tech-doc.service.ts`・`services/tech-master.service.ts` の4本で足りる。

### 7-3. 部品と外枠

| 守るもの | 中身 |
| --- | --- |
| `PageShell`／`PageHeader` | ①④⑤⑥の `…Page.tsx` は外枠を `PageShell`、名前を `PageHeader` で書く（[`_rules.md`](_rules.md)「5. ページの外枠」）。**`page-shell-missing` の client-techops のラチェットは 7**（`scripts/check-ui-tokens.mjs:968-970`）なので**増やさない** |
| 文字入力欄 | `BufferedInput`／`BufferedTextarea`（IME の二重入力。`client-techops/CLAUDE.md:75-78`）。②③⑤⑥は**表のセルが全部文字欄**なので、ここを外すと全画面で二重入力が出る。`<select>`・数値・日付は素のままでよい |
| 禁止語・比喩語 | `scripts/check-ui-tokens.mjs:353`（`forbidden-wording`）・`:391`（`metaphor-wording`・記録を持たず1件でも止まる） |
| ブラウザダイアログ | 行の削除・系統の付け替えの確認は `confirmAction()`／`notifyError()`（`browser-dialog` が `confirm()` を止める） |

### 7-4. 2つのレジストリの一致

`shared/src/production/miniapps.ts` と `server/src/shared/production/miniapps.ts`、
`shared/src/production/manualBlocks.ts` と `server/src/shared/production/manualBlocks.ts` は**2ファイル同時に**直す。
`scripts/check-collab-parity.mjs:26,28` の `PAIRS` が本文の一致を見て、コメント差は許容・実装差は停止（`:42-90`）。
`server` の `predev`／`prebuild` と CI が回す。

### 7-5. 自動では出ないもの

| 出ないもの | なぜ | どうするか |
| --- | --- | --- |
| MCP `list_production_docs` の一覧 | `doc-list.service.ts` は種類ごとに読む表を書いている（当初は `qsheet_documents` と `qsheet_schedules` だけ） | **対応済み**: `fetchTechDocs` を足した（`app=tech`）。見える範囲は `listTechDocs` と同じ SQL（作成者／案件メンバー／`assigned_to`／admin）。資料は日を持たないので `date` は常に null、`date` 絞り込みはスタッフ行の作業日で当てる。`app` の enum は一覧が実際に読む `LISTED_DOC_APPS`（sheet／schedule／tech）に揃えた（以前は `manual`／`venue` を渡すと台本・スケジュール表が返っていた）。運営マニュアル・会場図面は引き続き対象外 |
| ジャーニーの `days[].docs` | 同上 | **載せない（決定）**。1つの資料が複数の作業日を持ち（§13-4 の決定 A）「その資料の日」が無い。日が無い束（`date: null`）に入れると、技術資料しか無い案件に「日が決まっていない」カードが増え、進行台本・スケジュール表の「まだありません」を空振りで案内する。件数は下の行の別クエリで足り、MCP からは `list_production_docs` で引ける（`journey.service.ts` 冒頭の注記） |
| ハブのタイルの件数バッジ | `MiniAppTiles.tsx` は sheet／schedule だけ `days` から数える（`client-techops/src/components/journey/MiniAppTiles.tsx:50-55`） | **別クエリ**を足す（同 `:71-75` の `useQuery(['venue-layouts','list',scope,id])` が手本）。`count: null` ならバッジを出さない（`:171`）。格子は `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`（`:160`） |
| `MiniAppSwitcher` の切替 | `ORDER` は5つ固定（`MiniAppSwitcher.tsx:25-27`） | **足さない**（§1-2） |

---

## 8. 書き出しと運営マニュアル

### 8-1. 紙に出す形は「矢印」

現場の技術者が使っている既存のパッチ表は**列のある表ではなく**、`〈系統名〉` の見出しの下に
`機材 out [位置] → 機材 in [位置]` を1行ずつ並べた**矢印つきの箇条書き**だった（`・SR6out [1-06A]→ 汎用FS①in [20-12A]`）。
`FROM`／`TO`／`送り`／`受け` という見出し語は**現物に出てこない**（`out`／`in` が実質の FROM／TO）。

そこで、**画面の列見出しは「送り」「受け」**（§4-1）にしつつ、**紙は矢印表記**で出す。

```
〈増設スイッチャー〉
・CCU1 out [101A] → ATEM 2 M/E in [IN1]（増設）
・ATEM 2 M/E out [PGM OUT]（増設） → 入力ルーター in36 [136B]
〈客席モニター〉
・出力ルーター out [205A] → TRK AV-3 FOH下手 in [TRK12 / VJP1700]
```

組み立ては `shared/src/tech/patchExport.ts` の純粋関数1本に閉じ、④の紙面・`tech.patch` の差し込み・スマホの1行目で**同じ関数**を使う。
技術スタッフは元のメンバー表と同じ「役職を見出しにして、その下に名前を1人1行」で、作業日ごとの塊にする。

### 8-2. 差し込みブロック2種

| ブロック | 中身 | 既定の大きさ | options |
| --- | --- | --- | --- |
| `tech.patch` | 映像パッチ（系統の見出し＋矢印の行）＋ 札 `TD-202610-0001 rev.1` | 180×100mm | 系統で絞る／備考を出すか |
| `tech.staff` | 技術スタッフ（作業日ごと・役職の見出し＋名前） | 180×80mm | 作業日で絞る／会社を出すか |

`sourceGroup: "tech"`・表示名「技術資料」・`hasSecrets: false`・**`sourceId` 必須**（1案件に資料が複数あるため）。
既存の `defaultSize` は `{180,24}`〜`{220,120}` の範囲（会場図面の数量表は `defaultTabular: true`・`{180,60}`。`shared/src/production/manualBlocks.ts:184-200`）。

### 8-3. 触る 11 か所

[`venue-layout.md`](venue-layout.md) §9-2 の表をそのまま写す。**「3点セット」では足りない**ところまで含めて11か所ある。

| # | 場所 | 何をするか |
| --- | --- | --- |
| 1 | `shared/src/production/manualBlocks.ts:25-38` `ManualLinkedBlockKey` | `"tech.patch"`・`"tech.staff"` を union に足す |
| 2 | 同 `:42-61` `ManualLinkedSourceGroup` ＋ `MANUAL_LINKED_SOURCE_LABEL` | `"tech"` と表示名「技術資料」 |
| 3 | 同 `:78-201` `MANUAL_LINKED_BLOCKS` | 2件の定義（§8-2） |
| 4 | 同 `:207-217` `manualLinkedBlocksByGroup()` の `groups` 配列（`:209`） | `"tech"` を足す。**足さないと候補に出ない** |
| 5 | `server/src/shared/production/manualBlocks.ts` | 同じに直す（parity・§7-4） |
| 6 | `server/src/contexts/qsheet/services/manual-resolve.service.ts:84-111` の `switch` | `case 'tech.patch'`／`'tech.staff'` → 新設 `manual-resolvers/tech.resolver.ts` |
| 7 | 同 `:181-184` `listAvailableLinkedBlocks` | 実在チェック SQL を1本（`SELECT 1 FROM qsheet_tech_docs WHERE (project_id=$1 OR program_id=$1) AND deleted_at IS NULL LIMIT 1`） |
| 8 | 同 `listLinkSourcesFor` | `sourceId` の候補（資料の一覧）を返す分岐 |
| 9 | `InsertPanel.tsx` の `requiresSource = def.sourceGroup === "sheet"` | `"tech"` も `sourceId` 必須に |
| 10 | `LinkedBlockContent.tsx` の `switch` | 新設 `linked/TechLinkedContent.tsx` |
| 11 | `LinkedBlockInspector.tsx` の `OPTION_FIELDS` | 系統・作業日・出す列 |

### 8-4. resolver の決めごと

- resolver は **`sourceId` の資料が冊子と同じ案件か再検査する**（[`venue-layout.md`](venue-layout.md) §9-2 の決めごと。他案件の資料 id を差し込めないように）
- resolver の `data` は**自己完結**（外部 URL・画像 id を含めない。同 §9-3）。矢印表記まで組み立てて渡す
- 冊子を**確定**すると `link.frozen.data` に凍る。**資料を直しても配った紙は変わらない**
- 冊子から資料へ移って戻る `?return=` の5つの決めごとは同 §9-4（techops で初めて作る仕組み）。`/techops/` で始まる相対パスだけ受け付ける
- サーバー側で機材台帳を読むなら、`equipment.resolver.ts:29` の前例（`lendingService` をそのまま import し、`:20-23` のコメントで「resolve はサーバーの実行権限で読む」と明記）に合わせる。
  `GET /equipment/items` は `requirePermission('equipment')`（`server/src/contexts/equipment/routes/equipment.routes.ts:21`）で techops からは直接呼べない（§13-8）

---

## 9. 初期データの入れ方

### 9-1. パッチ盤は人が転記する（機械では取れない）

> **2026-09-23 更新: 初期データは外観図から書き写して入れた（migration 308）。** 利用者が完成図書の
> 「ビデオパッチ盤外観図_1〜5」（05260281-Z001〜Z005・2026-07-01 改訂）の PDF を添付し、ページを画像にして
> 番号ごと・A段／B段ごとに書き写した（文字は独自の符号化で埋め込まれていて抽出できないため画像で読んだ）。
> 盤は **19枚**（VJP1900 = 32ch の TRK と同期の混在が 305 に無かったので足した）。機材名は図面の系統の見出し
> （再生VTR・入力ルーターIN など）、名称は穴ごとの印字、シングルジャックと色付きは備考に入れた。
> 書き写した元の JSON は `scripts/data/tech-patch-panels-20260701.json`。**人が⑤で直した値は上書きしない**
> （機材名が空の行だけを埋める）。VJP1900 の同期は図面の印字が「Try Level Sync」だったが、利用者の確認（2026-09-23）で
> 正しい「Tri-Level Sync」に直して入れた。エリア列は図面に置き場所の枠が無いため空のまま（⑤で人が入れる）。
> 以下は当初の設計（人が転記する前提）の記録。

**機械抽出は無理だと実測で確かめた**（§0-1）。理由は3つ:

| # | 理由 |
| --- | --- |
| 1 | PDF のテキスト抽出は**2次元の配置を保たない**。VJP100 の抽出結果は `43,44,42,45,46,36,37,38,…` と物理配置の読み取り順で出て、48個の番号が過不足なく1回ずつ入っていることは分かるが、**どのラベルがどの番号の真上にあるか**は失われる |
| 2 | Box AI に単票 PDF で直接尋ねても「ジャック番号との対応関係が判別できない」「**画像化されていれば**図面上の文字・配置から抽出できる」と返った |
| 3 | 作業環境では図面を**画像として開く手段が使えなかった**（プレビュー・ダウンロードが不可）。60MB の完成図書への網羅質問は60秒で時間切れになった |

したがって**初期データは人が外観図を見て転記する**。⑤の画面はそのための道具であり、次の3つを守る。

| 決めごと | 中身 |
| --- | --- |
| **段Aで空のパッチ番号を作っておく** | migration 305 で `qsheet_patch_panels` 18行（VJP100〜1800・ch数 48／32・`kind`・`model`）と `qsheet_patch_jacks` の**全行を空の `device_name` で作る**（48×2×12 ＋ 32×2×6 ＝ **1,536 行**）。番号と段の存在だけは資料から確実に読み取れているので、ここは機械で入れてよい |
| **転記の進みを出す** | ⑤の見出しに「**転記の進み 35／48**」（機材名が入っている**番号**の数／`jack_count`。§5-1）。盤の一覧にも同じ数を出す。**進みがゼロの盤でも②の候補には出さない**（空の候補を選ばせない） |
| **あとで画像が読める AI に任せられる形にしておく** | 転記の入力は1ch ずつの PATCH（`/techops/tech-panels/:id/jacks/:jackId`）なので、将来「外観図から転記する」機能を足すときは**同じ API を呼ぶ**だけでよい。ただし AI を足すなら §10 の5条件を先に満たす |

転記の優先順は **VJP100（入力）→ VJP200（出力）→ VJP1300〜1600（収録卓）→ 残り**。段B の着手に要るのは VJP100・VJP200 の2枚だけである。

### 9-2. 技術人員は一度きりの取り込み

メンバー表 PDF は37枚（重複3件を除いた distinct）すべてが同じひな形で、テキストが素直に取れた（画像として読む必要はなかった）。
37枚は全件が **株式会社ヌーベルバーグ** 発行で、BOX の案件フォルダ（`GLS058`／`059`／`060`／`064`／`065`／`074`／`083-084`／`086`／`100` 配下）に散らばっている。
そこで **会社1件（株式会社ヌーベルバーグ）＋ 90人**を一度きりで入れる。

| 決めごと | 中身 |
| --- | --- |
| **入れ方** | **管理者が手元で回すスクリプト**（BOX を読み、取引先 `companies` に仕入先1件・`qsheet_tech_persons` に90行を入れる。§13-5・migration 307）。seed には入れない（本番は `SKIP_SEED=true`）。migration にも**入れない** |
| **なぜ migration ではないか** | 人の名前は**個人情報**で、migration に書くと git の履歴に永久に残り、リポジトリを読める全員が見る。退職・改名のときに履歴から消せない。中間の CSV も**git に入れない**（`.gitignore`）。会場図面が用賀のマスタを migration 299 で入れた（[`venue-layout.md`](venue-layout.md) §5-1）のと**ここだけ扱いを変える** |
| **作業日は本文を正とする** | ファイル名の日付は本文の「作業日：」と食い違うことがある（37枚中7枚で確認。`0620メンバー表.pdf` の本文は 2026/06/02）。**本文の作業日だけを読む** |
| **`(ver2)` は後の版が勝つ** | 同じ作業日に複数の名簿が来る。**発行日が新しいものを正**とする。改訂は役職の付け替え（CAM→CAM-A）と人の交代の両方があり得るので、単なる表記整理として無視しない |
| **現場の表記ゆれを直す** | 「GMOグローバルスタジオ」24枚／「GMO-G.st」13枚は同じ場所。正式名に寄せる |
| **役職は取り込まない（候補としてだけ持つ）** | 役職は回ごとの割当（§4-5）。取り込みで入れるのは `main_roles`（よく担当する役職の候補）までで、資料の行は作らない |
| **社内業務は除く** | 37枚のうち4枚に出る「社内業務」は研修参加者のリストで技術配置ではない。役職の候補にも出さない |
| **持たない項目** | **氏名だけを持ち、連絡先（電話・メール）は持たない。** 元の PDF にも一度も出てこない。ふりがな（`kana`）は当面空で、人が足す |
| **見られる範囲** | `qsheet` **reader** 以上（§5-4）。⑥の編集は manager。個人情報の扱いは §13-6 の判断待ち |

GMO 社員（社内）と、他の協力会社は**手で足す**（⑥の「追加」）。37枚の中に複数社の実例は無く、会社の次元を裏付けるデータは1社分しかない。

---

## 10. AI について

**段A〜D のこのアプリに AI は入れない。** 映像パッチもスタッフリストも、AI が間違えたときに人が気づけない種類のデータ
（`136B` が `137B` になっていても画面では読めない）で、間違いは当日の本番で出る。

一方で、§9 の2つは**将来 AI に任せたくなる仕事**である。足すときはルート [`CLAUDE.md`](../../../CLAUDE.md)
「開発の絶対原則: AIを使い捨てにしない」の5条件を `.claude/skills/ai-feedback-loop/` で満たしてから着手する。
いまの時点で**何が要るかだけ**を書き出しておく（**下の表はすべて未設計**）。

| 条件 | 「外観図から転記する」なら | 「メンバー表から取り込む」なら | 状態 |
| --- | --- | --- | --- |
| 1. AI 出力を記録・保存 | 1ch ずつの読み取り結果（盤・番号・段・機材名・名称・確からしさ）を**そのまま**別表に残す | 1枚ずつの読み取り結果（作業日・役職・氏名・発行日）を残す。元ファイルの id も持つ | **未設計** |
| 2. 人の修正を差分として残す | manager が⑤で直した値を「AI の値 → 人の値」の対で残す | 取り込み後に③⑥で直した値を同じ形で残す | **未設計** |
| 3. 顧客反応と成果指標を紐づける | 当日に**パッチのやり直しが出たか**（備考に残る）・転記1枚あたりの所要時間 | 当日の**名前の間違い**・取り込み後の手直しの件数 | **未設計** |
| 4. 貯めたものを改善に戻す経路 | 誤りの多い盤・ラベルの型をプロンプトと読み取りの前処理に反映する | 表記ゆれ（現場名・役職）の辞書に反映する | **未設計** |
| 5. レビューの頻度と担当 | 誰が・どの頻度で 1〜4 を見るかを決める | 同左 | **未設計** |

経路が作れない要素は「できない」で止めず、代替案（人の確認を必須にする・確からしさの低いパッチ番号だけ人に回す）を添える。
**その経路を作らずに AI を足さない。** 運営マニュアル・会場図面と同じ規律。

---

## 11. 作る順（段A〜D）

| 段 | 何を | 終わったときに何ができるか | 門 |
| --- | --- | --- | --- |
| **A 器** | レジストリ `tech`／`TD`／`prod_doc_td`（§5-3・server 複製も）・migration 305（表6本＋盤18枚と空のパッチ番号1,536行）・①一覧と作成ダイアログ（名前／空から・複製）・資料番号の発番・ハブのタイル（件数は別クエリ）・左メニュー・`pcOnlyScreens` の宣言 | 技術資料が案件から辿れ、`TD-202610-0001` が採れる | `npx tsc -b client-techops`・`npm run typecheck -w server`・`npm run lint`・`npm run test`・`node scripts/check-collab-parity.mjs` |
| **B 映像パッチ＋パッチ盤** | ②の表・系統・行の追加／並べ替え／削除・機材の候補・パッチ番号の候補（機材で絞る・空きが先・使用中の印）・増設機材の手入力・名称の初期値と上書き・右パネル・⑤の盤の画面と転記（VJP100／VJP200 を人が入れる）・`shared/src/tech/patchNo.ts` | **ここで道具になる。** 増設機材の映像プランが画面で組める | 上に加え `npm run verify:ui techops`・`npm run verify:ime`・`shared/src/tech/` の Vitest |
| **C 技術スタッフ＋技術人員** | ③の表・作業日のチップ・人の候補（会社の絞り込み・手入力）・⑥の会社と人・参加回数・§9-2 の一度きりの取り込み | 当日の技術スタッフが名前を打ち直さずに組める | 上に加え `server/tests/*-review.test.mjs`（行の可視性） |
| **D 書き出しと冊子とスマホ** | ④の A4横（矢印表記・`shared/src/tech/patchExport.ts`）・`tech.patch`／`tech.staff` の差し込み（§8-3 の11か所）・resolver と凍結・`?return=`・確定と版・スマホ閲覧 | 紙と冊子に出て、現場のスマホで読める | 上に加え parity・resolver の review 試験（他案件の `sourceId` を拒む）・④の PC専用宣言 |

- **段B まで通して初めて道具になる。** 段A だけで止めると「空の表がある画面」が増える
- 段B の前提は §9-1 の転記（VJP100・VJP200 の2枚）。**転記が終わっていない盤のパッチ番号は候補に出さない**
- 着手の前提は §13-1（名前と接頭辞 `TD`）の回答。接頭辞と seq は後から変えられない
- モックは [`mockups/native/tech-docs/`](mockups/native/tech-docs/README.md) が正。実装で迷ったらモックに合わせる

---

## 12. 触る場所

| # | 場所 | 何をするか |
| --- | --- | --- |
| 1 | `shared/src/production/miniapps.ts:52` | `MiniAppKey` の union に `'tech'` |
| 2 | `shared/src/production/miniapps.ts:103-212` | `MINI_APPS` に1件（venue は `:200-211`・型は `:67-81`） |
| 3 | `server/src/shared/production/miniapps.ts:11,148` | 上と本文が1文字も違わない複製 |
| 4 | `scripts/check-collab-parity.mjs:26` | 既に `PAIRS` に対がある。**新しく足す必要は無い**が、2ファイル同時に直す（`:42-90`） |
| 5 | `client-techops/src/components/layout/nav.ts:83` | `TECH_DOC_DETAIL_RE = /^\/techops\/tech-docs\/[^/?#]+(?:\/staff)?\/?$/`（`VENUE_DETAIL_RE` が手本。**`/print` は含めない**） |
| 6 | 同 `:134` | 一覧の文脈解決に `pathname === '/techops/tech-docs'` を足す |
| 7 | 同 `:147` | 詳細の文脈解決に `TECH_DOC_DETAIL_RE.test(pathname)` を or で足す |
| 8 | 同 `:159-165` | `listPathOf` の引数 union と三項に `'tech'` を足す |
| 9 | 同 `:248-259` `buildResolvedSections` | 「ミニアプリ」節に `{ label: MINI_APP_BY_KEY.tech.label, to: listPathOf('tech', ctx), icon: … }` |
| 10 | 同 `:196-203` `adminSection()`（＋ `AppShell.tsx` 側の `hasPermission('qsheet','manager')`・同 `:179-185`） | 「管理」節に「パッチ盤」「技術人員」 |
| 11 | `client-techops/src/App.tsx:206-210` | ルート4本（`/techops/tech-docs`・`/:id`・`/:id/staff`・`/:id/print`）＋ 管理2本（`/techops/tech-panels`・`/techops/tech-persons`） |
| 12 | `client-techops/src/pcOnlyScreens.ts:124-132` | `TECHOPS_PC_ONLY` に④⑤⑥（`path`・`what`・`why`・`instead`） |
| 13 | 同 `:173-174` | `TECHOPS_MOBILE_OK` に①②③ |
| 14 | `client-techops/src/components/journey/MiniAppTiles.tsx:102-109` | タイル1枚（`key/label/description/icon/to/count`）。件数は同 `:71-75` の形で別クエリ |
| 15 | `client-techops/src/components/journey/MiniAppSwitcher.tsx:25-27` | **触らない**（`ORDER` は5つ固定） |
| 16 | `client-techops/src/lib/productionNavContext.ts:48-55` | ページ側で `setProductionNavContext()` を呼ぶ（`JourneyPage.tsx:31` が手本） |
| 17 | `server/src/contexts/qsheet/index.ts:20-21` / `:70-72` | `techDocsRoutes`・`techMastersRoutes` の import と `router.use(prefix, …)` |
| 18 | `server/src/routes/index.ts:32-33` | **触らない**（`/qsheet` と `/techops` の二重マウントが自動で効く） |
| 19 | `server/src/contexts/qsheet/access.ts:125-140` / `:148` | `canAccessTechDoc`／`canAssignTechDocProject`（`canAccessVenueLayout` の写し） |
| 20 | `server/src/contexts/qsheet/services/docNo.service.ts:14-20` | **触らない**（`MINI_APP_BY_KEY` から読むので登録だけで効く） |
| 21 | `server/src/shared/db/migrations/305_tech_docs.sql` | 表6本＋盤18枚と空のパッチ番号1,536行（§5-1・§9-1）。会社の表は307で `companies` に統合 |
| 22 | `server/src/shared/db/migrations/307_tech_persons_companies.sql` | 会社を取引先 `companies` に統合（`qsheet_tech_persons.company_id`・`qsheet_tech_staff_rows.company_id`）。`qsheet_tech_companies` は DROP（§5-1・§5-2・§13-5） |
| 23 | `shared/src/production/manualBlocks.ts:25-38,42-61,78-201,207-217` ＋ `server/src/shared/production/manualBlocks.ts` | 段D の差し込み（§8-3 の #1〜#5） |
| 24 | `server/src/contexts/qsheet/services/manual-resolve.service.ts:84-111` / `:181-184` | 段D の resolver（§8-3 の #6〜#8） |
| 25 | `shared/tests/miniapps.test.ts:23-48` | 触らないが、重複があるとここで落ちる |
| 26 | `client-techops/CLAUDE.md` の「画面一覧」表 | **実装 PR で**1行足す（この設計 PR では足さない） |

---

## 13. 判断待ち（9件）

**2026-09-23 に全件ご判断をいただいた**（利用者との1件ずつの確認）。8件は推奨どおり、5 だけ推奨と違い「取引先 `companies` をそのまま使う」。下の論点の表は経緯として残す。

| # | 決定 |
| --- | --- |
| 1 | 接頭辞 `TD`・キー `tech` のまま（`TD-202610-0001`） |
| 2 | **A段＝送り出し（OUT）・B段＝受け（IN）**。画面と書き出しの説明はこのまま |
| 3 | 「CA」の正式名称は**カメラアシスタント**。画面の表記は「CA」のまま、正式名称を補足に持つ（`shared/src/tech/roles.ts`） |
| 4 | 1つの技術資料に複数の作業日を持たせる（いまの形） |
| 5 | **取引先 `companies` をそのまま使う**（推奨と違う）。独自の `qsheet_tech_companies` はやめ、`qsheet_tech_persons.company_id` → `companies(id)` に移す。techops からは qsheet 権限で名前だけ読み、「会社を追加」は取引先に仕入先として追加する（会社の編集・削除は案件管理で行う） |
| 6 | 氏名のみ。連絡先は持たない。閲覧は qsheet reader |
| 7 | 音声パッチ（AJP）はあとの段 |
| 8 | 増設機材と機材台帳・レンタル機材検索の接続はあとの段 |
| 9 | 名前は「技術資料」のまま |

| # | 論点 | 選択肢 | 主担当の推奨 | なぜ |
| --- | --- | --- | --- | --- |
| 1 | **資料番号の接頭辞とキー** | A. 接頭辞 `TD`・キー `tech`（`TD-202610-0001`）／B. 別の接頭辞・別のキー | **A** | 使用中は `SB`／`SD`／`OM`／`VL` だけで `TD` は空いている（`shared/src/production/miniapps.ts:109,121,133,205`）。キー `tech` も union に無い（`:52`）。**どちらも後から変えられない**（配った番号が意味を失い、連番が飛ぶ。同 `:69,71`）ので、着手の前に決める |
| 2 | **A段＝OUT・B段＝IN の意味づけ** | A. そう決めて画面に書く／B. GMO の盤で確認してから書く／C. 意味づけを画面に出さない | **B**（確認してから A） | 根拠が**別スタジオのパッチ表での用例**（`SR6out [1-06A]` と `SR6 in [1-06B]`）しかなく、**GMO の盤に凡例が見つかっていない**（§4-2）。逆だと②の候補の絞り込みが全部裏返る。現物の盤を1枚見れば決まる |
| 3 | **「CA」の正式名称** | A. カメラアシスタント／B. ケーブルアシスタント／C. 協力会社に確認する | **C** | 37枚中32枚に出る主要役職（延べ44人で3番目に多い）なのに、**PDF 本文に説明が無い**。画面には略号をそのまま出すので実害は無いが、説明文と⑥の役職の並びで意味を書くなら確定が要る。`AUD`・`Dv`・`TP`・`3Play` も同じ |
| 4 | **1つの技術資料に複数の作業日を持たせるか** | A. 持たせる（`work_date` は行が持つ）／B. 1日＝1資料にする | **A** | 元のメンバー表は1枚＝1作業日だが、**映像パッチは日をまたいで同じ**（仕込みから本番まで同じ結線）。B にすると同じパッチ表を日数分だけ複製することになる。A なら③の作業日のチップで切り替えるだけで済む（§6 ③） |
| 5 | **会社を `companies` で持つか、自前の表にするか** | A. 自前の `qsheet_tech_companies` ＋ `company_id` の任意参照／B. `companies` を直接参照する | **A** | `GET /companies` は `requirePermission('sales')`（`server/src/contexts/sales/routes/companies.routes.ts:128`）で、techops の利用者が `sales` 区画を持つとは限らない。会場図面が `room_id`／`equipment_item_id` を任意参照にとどめたのと同じ作法（`298_venue_layout.sql:52,80`）。`customers`／`vendors` は migration 208 で DROP 済みで、会社の正は `companies` 1本（`061_companies.sql:8-29`） |
| 6 | **技術人員の個人情報の扱い** | A. 氏名のみ・連絡先は持たない・閲覧は `qsheet` reader ／ B. 連絡先も持つ／C. 閲覧をさらに絞る | **A** | 元の PDF に連絡先が**一度も出てこない**（§0-1）ので、持たないのが実態に合う。取り込みを migration ではなくスクリプトにする理由（git の履歴に名前を残さない・§9-2）とセットで判断がほしい |
| 7 | **音声パッチ（AJP）を入れるか** | A. 後の段にする（初版は映像だけ）／B. 初版から入れる | **A** | `AJP100`〜`AJP600`（アナログ）・`DAJP100`（デジタル）は番号の体系こそ同じだが、**ch の総数が確認できていない**（抽出できたのは目盛りらしき断片のみ）。表の形は同じなので、盤の `kind` を増やせば後から足せる |
| 8 | **増設機材を機材台帳（レンタル）と結ぶか** | A. 後の段（当面は手入力の文字列）／B. 初版から `equipment_items` を引く | **A** | 引くには `/techops/…` に自前の読み取り API を作り、中で `itemService.list()` を呼ぶ必要がある（`equipment.resolver.ts:29` の前例。`/equipment/items` は `equipment` 区画必須・`equipment.routes.ts:21`）。増設機材は当日限りのレンタルが多く、台帳に無いものも入る |
| 9 | **名前「技術資料」の再利用でよいか** | A. 再利用する／B. 別の名前にする | **A** | 旧 `client-techsheet` は PR #278・migration 211 で削除済みで、後継の収録設定・配信設定に**パッチ表もスタッフリストも入っていない**（§0 の冒頭）。名前が指すもの（技術の資料）と中身が一致する。B にするなら `docPrefix` も変わるので #1 と同時に決める |

**決めてよいこと（技術・設計側で決めた）**: 表は `qsheet_tech_*`／`qsheet_patch_*` の6本（§5-1）／系統は列で持ち表にしない（§5-1）／
パッチ番号は列に持たず組み立てる（§5-1）／名前は写す（§5-2）／Yjs を使わず資料まるごとのロック（§5-4）／
`MiniAppSwitcher` とスマホ下タブには足さない（§1-2）／初期データの入れ方（§9）。

---

## 14. 関連する文書

- 手本にしたミニアプリ: [`venue-layout.md`](venue-layout.md)（会場図面）・[`production-manual.md`](production-manual.md)（運営マニュアル）
- 制作技術支援そのもの: [`client-techops/CLAUDE.md`](../../../client-techops/CLAUDE.md)（現役ルール・検査・壊してはいけない契約）
- 見た目の規律: [`_rules.md`](_rules.md)・[`_tokens.md`](_tokens.md)・[`mockups/DESIGN_POLICY.md`](mockups/DESIGN_POLICY.md)
- 言葉づかい: [`../../wording.md`](../../wording.md)（ルール5〜11）
- AI を足すときの規律: ルート [`CLAUDE.md`](../../../CLAUDE.md)「開発の絶対原則: AIを使い捨てにしない」
- 旧「技術資料」アプリの経緯: [`../qsheet-recording-streaming.md`](../qsheet-recording-streaming.md)
- モック: [`mockups/native/tech-docs/`](mockups/native/tech-docs/README.md)
