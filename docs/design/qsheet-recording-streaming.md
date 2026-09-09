# 制作資料 — 収録設定 / 配信設定（設計）

> **状態**: 実装済み（記録）
> **最終確認**: 2026-09-08（v4.6.10）
> **位置づけ**: 収録設定・配信設定の初版設計（PR #279・文書のみ）。ミニアプリとして実装したときの正は [v4/qsheet-v4-coding/08-recording-streaming.md](v4/qsheet-v4-coding/08-recording-streaming.md) と [impl/08](v4/qsheet-v4-coding/impl/08-recording-streaming-impl.md)。実装は `client-techops/src/pages/{recording,streaming}/`・migration 220。文中の「制作資料」は旧名（いまは制作技術支援）

GMO ONAiR の**制作資料**アプリに「収録設定」「配信設定」を足し、打ち込んだ内容を
**Excel で書き出す**。書き出した xlsx は、現場の **GMO ONAiR Assistant**
（`terai-takehiro/gmo-onair-assistant`）がそのまま取り込む。

- **モックアップ**: https://claude.ai/code/artifact/82ae03a9-e3ac-4027-a922-1f46c628514d
  （元ファイルは [`qsheet-recording-streaming/mockups/`](qsheet-recording-streaming/mockups/)）
- この文書は**手で書いたもの**。`docs/design/v4/*.md` は `extract-v4-design.mjs` の
  生成物なので、そちらには置かない

> **経緯**: 技術資料アプリ（`client-techsheet`）は PR #278 で「制作資料へのマージに向けて
> 内容を作り直すため」アプリごと削除され、DB も migration 211 で落ちている
> （`docs/changelog.d/claude-remove-tech-docs-app-ibvgo9.md`）。この設計は**その後継**にあたる。

---

## 0. いちばん大事な前提

| # | 事実 | 効いてくるところ |
| --- | --- | --- |
| 1 | **Assistant に Excel 出力は無い。** 往復ではなく **ONAiR → xlsx → Assistant の片道** | ONAiR 側が「正」。Assistant は反映先 |
| 2 | ONAiR は**機器に一切触らない。** 触るのは現場の Assistant だけ | 「送信」ボタンは作らない。作るのは「書き出す」 |
| 3 | Assistant の取込は **1 枚目のシートしか読まない**。シート名は見ない | データシートを必ず先頭に置く |
| 4 | 取込で**書ける項目は限られる**（収録 6 / 配信 11 列）。それ以外は列を出しても無視される | 打てるのに反映されない欄を作らない |
| 5 | **収録の「TCソース」は必ず弾かれる**（機器の REST に書く道が無く、候補が空で返る） | **列ごと出さない** |
| 6 | 解像度・コーデックは**機器の綴りと完全一致**でなければ弾かれる（大小区別あり・部分一致なし） | `1920x1080p59.94` / `ProRes:HQ`。`1080p59.94` / `ProRes 422 HQ` は不可 |
| 7 | **空欄 = 現地の設定を変えない。** 全部埋めると現場が直した値を上書きする | 「空欄で出す」を一級の操作として設計する |
| 8 | 配信の**ストリームキーは Excel に平文で入る**（Assistant は機器からキーを読み戻せない） | 書き出し時に扱いを明示し、履歴に残す |
| 9 | 配信の**セッション名は半角のみ・32 文字以内**（日本語を送ると機器が `-10` を返した実例あり） | ONAiR 側で弾くのが往復で一番効く |
| 10 | 収録中・配信中の行は Assistant 側で**反映されない** | 「番組前に流し込む」運用を前提に文言を書く |

---

## 1. 画面一覧（5）

| # | 画面 | 枠 | 目的 |
| --- | --- | --- | --- |
| ① | 収録設定（PC） | 1440 | HyperDeck 12 台を一覧のまま打ち込む・まとめて変える |
| ② | 配信設定（PC） | 1440 | ENC ごとの配信先を一覧で見て、右のインスペクタで 1 件ずつ打ち込む |
| ③ | Excel を書き出す | シート 760 | 出すシートを選ぶ → 点検を見る → 鍵の扱いを決める → 書き出す |
| ④ | 収録設定（スマホ） | 390 | 1 台ずつ直す・状態を確かめる |
| ⑤ | 配信設定（スマホ） | 390 | 配信先を 1 件ずつ直す（下から出るシート） |

**PC 専用にしない**（`docs/v4-native-ui-plan.md` の「PC 専用は原則廃止」）。
ただしスマホは**まとめて変える操作を置かない** — 「まとめて変えるときは PC で」と案内する。

### 操作の骨格

```
打ち込む  →  点検する  →  Excel を書き出す  →（現場）Assistant で取り込む
   ①②           ③              ③                    プレビュー → 差分 → 反映
```

「点検する」は**書き出す前に ONAiR 側で行う検査**で、Assistant の取込が弾く条件を
先回りして出す（下の §4-5）。ここで潰しておかないと、**現場で初めて分かる**ことになる。

---

## 2. 画面が扱うデータ

### 2-1. 収録設定（1 行 = デッキ 1 台・固定 12 行）

**項目 (7)**: `deckId` / `label` / `videoFormat` / `codec` / `audioChannels` / `slot` / `filePrefix`

```js
{ deckId: 'REC1', label: '本線 PGM', videoFormat: '1920x1080p59.94',
  codec: 'ProRes:HQ', audioChannels: 2, slot: 'ネットワーク',
  filePrefix: 'GLS002-003_PGM' }
```

| 項目 | 内容 | 必須 | 空欄のとき |
| --- | --- | --- | --- |
| `deckId` | `REC1`〜`REC8`（Studio 4K Pro・本線）／ `REC1-P`〜`REC4-P`（HD Plus・控え） | **必須** | — |
| `label` | 現場の呼び名。**Excel には出さない**（ONAiR 側の見やすさのため） | 任意 | — |
| `videoFormat` | `1920x1080p59.94` / `1920x1080i59.94` / `1920x1080p29.97` / `3840x2160p59.94`（4K Pro のみ） | 任意 | 現地の値を変えない |
| `codec` | `H.264:High` / `H.265:High` / `ProRes:HQ` / `ProRes:422` / `DNxHR:HQ`（4K Pro のみ） | 任意 | 同上 |
| `audioChannels` | `2` / `4` ／ 4K Pro は `8` / `16` も | 任意 | 同上 |
| `slot` | `ネットワーク` / `SSD 1` / `SSD 2` / `SD 1` / `SD 2` / `USB-C`（機種で持っているものが違う） | 任意 | 同上 |
| `filePrefix` | クリップ名の頭。**検証なし**（機器側も文字種を見ていない） | 任意 | 同上 |

**機種の差**（画面の選択肢を機種で絞る）:

| | Studio 4K Pro（REC1–8） | HD Plus（REC1-P–4-P） |
| --- | --- | --- |
| 解像度 | 1080 系 3 種 ＋ **3840x2160p59.94** | 1080 系 3 種のみ |
| コーデック | 4 種 ＋ **DNxHR:HQ** | 4 種（DNxHR なし） |
| 音声 | 2 / 4 / **8 / 16** | 2 / 4 |
| 収録先 | ネットワーク・SSD 1・SSD 2・SD 1・USB-C | ネットワーク・SD 1・SD 2・USB-C（**SSD なし**） |

> ⚠️ この表を**唯一の正にしない**。機器の `capabilities` が本当の正で、ラックが変われば変わる。
> ONAiR 側は「よく使う候補」として出し、**自由入力も許す**（弾くのは現地の仕事）。

**扱わないもの**: TCソース（§0-5）／ IP・機種・本線対応（`mirrors`）・NAS 接続先
（＝設置時に 1 回決めるもの。Assistant の `config.json` / `onair-setup.json` の担当で、
Excel 取込の対象外）。

### 2-2. 配信設定（1 行 = 配信先 1 件・同じ ENC を複数行に置ける）

**項目 (11)**: `encoderId` / `name` / `protocol` / `url` / `port` / `streamKey` / `passphrase` / `latencyMs` / `bandwidthPct` / `mtu` / `aes`

```js
{ encoderId: 'ENC1', name: 'YouTube Pri', protocol: 'RTMP',
  url: 'rtmp://a.rtmp.youtube.com/live2', port: null,
  streamKey: '****', passphrase: '', latencyMs: null,
  bandwidthPct: null, mtu: null, aes: 'なし' }
```

| 項目 | 内容 | 必須 |
| --- | --- | --- |
| `encoderId` | `ENC1`〜`ENC10` | **必須** |
| `name` | セッション名。**半角英数＋空白＋`._-+'[]()` のみ / 1〜32 文字 / 前後に空白不可 / 日本語不可 / ENC 内で一意**。この名前で現地の既存設定と突き合わせる | **必須** |
| `protocol` | `RTMP` / `SRT Caller` / `SRT Listener` | **実質必須**（省くと新規は RTMP 扱い） |
| `url` | RTMP は `rtmp://host/app`、SRT Caller はホスト。**SRT Listener は不要** | プロトコル次第 |
| `port` | SRT の宛先／待受ポート | SRT で必須 |
| `streamKey` | RTMP のキー。**新規は必須**、更新は空欄で現地のキーを残す | RTMP で条件付き |
| `passphrase` | `aes` が「なし」以外のとき必須 | 条件付き |
| `latencyMs` / `bandwidthPct` / `mtu` | SRT の詳細。**範囲は機器が答える**ので ONAiR 側で強制しない | 任意 |
| `aes` | `なし` / `AES-128` / `AES-192` / `AES-256` | 任意 |

**同じ台の中で重複させてはいけない組み合わせ**（現地が送る前に断る）:

| プロトコル | 重複の鍵 |
| --- | --- |
| RTMP | 宛先 URL ＋ ストリームキー |
| SRT Caller | 宛先 ＋ ポート |
| SRT Listener | 待受ポート |

**扱わないもの**: `Stream ID`（Assistant の取込に列が無い）／ 解像度・fps・ビットレート・
コーデック・GOP・音声（取込対象外。Assistant の画面にも入口が無い）／ ENC の IP とログイン
（設置時の担当）。**これらを ONAiR の画面に出すと「打てるのに反映されない欄」になる。**

---

## 3. 画面の作り

### 3-1. 収録設定（PC）

上から: 見出し＋操作 → **状態の帯**（準備完了 / 未入力 / 注意 / ネットワーク収録の台数、最後に書き出したファイル名）
→ 絞り込み（すべて 12 / 本線 8 / 控え 4）＋**選んだ台にまとめて** → 本線の表（8 行）→ 控えの表（4 行）→ 注記。

- **表の中でそのまま直す。** セルは高さ 32px・角丸 9px の小さな入力に見せ、押すと選択肢が出る
- **未入力のセルは橙の帯**（`#fff7ed` ＋ `#fed7aa`）にして「まだ何も決めていない」を見せる。
  **赤にしない** — 空欄は不正ではなく「現地の値を変えない」という意味だから
- **控えの表には「本線の設定を写す」**を置く（`REC1-P ← REC1` の対応を表示する）
- 一括変更は**機種グループを越えない**（HD Plus に 4K を配ると必ず弾かれる）

### 3-2. 配信設定（PC）

左に **ENC ごとにまとまった配信先の一覧**、右に **372px のインスペクタ**。

- 1 台に複数の配信先を置けることを、**ENC の見出し行 ＋ その下にぶら下がる配信先**という
  形で見せる。「配信先を足す」は ENC の行に置く
- 配信先が無い台は「配信先がまだありません。この台は Excel に出ません。」と**明示**する
  （黙って消えるのがこの手の機能でいちばん危険な壊れ方）
- キーの状態は **設定済み / 未入力 / キー不要** の 3 つを**文字で**出す（色だけで伝えない）
- インスペクタは**プロトコルで出す欄を変える**。RTMP のときは SRT の詳細を伏せ、
  「プロトコルを SRT に変えると出てきます」と書いておく

### 3-3. Excel を書き出す

1. **シートに出すもの**（収録設定 / 配信設定 / 入力ガイド）を選ぶ。
   **選んだ並びがそのままシートの並び**で、**開いた画面のシートを既定で 1 枚目**にする
   （Assistant は 1 枚目しか読まないため。以前は常に「収録 → 配信」に固定され、
   配信設定の画面からの既定の書き出しが現地でそのまま取り込めなかった — 2026-08-30 修正）
2. **1 枚目の見出し行の見本**を出す — 実際に出る列と、空欄がどう出るかを見せる。
   **鍵の扱い（④）も見本に反映する**（伏せ字 `****`。平文は見本に出さない）
3. **点検の結果**（§4-5）。「キーを入れて出す」のときは**復号できない鍵**も赤に出す
   （`ENCRYPTION_KEY` が保存時と違うと、キー列が空欄の Excel が黙って出来上がるため）
4. **鍵の扱い**（入れる / 空欄で出す）を切り替える。入れるときは赤い面で警告する。
   **書き出し自体は閲覧できる人なら誰でもよい**（Excel の中身は画面で見られるものと同じ）。
   editor が要るのは「キーを入れて出す」だけ（サーバーも同じ線で守る）
5. ファイル名を確かめて書き出す。ファイル名の実施日は **1 枚目のシートの実施日**

### 3-4. レイアウトで守ること（実測して決めたもの）

**値は 1 行。折り返さない。入らないときは長体で詰める。** 説明文（注記）は自然に折り返してよい。
「2 行になって読みにくい」のは**値が語の途中で折り返したとき**なので、そこだけを禁じる。

| 対象 | 決めごと |
| --- | --- |
| 表のセル・一覧の値・URL・ファイル名 | `white-space: nowrap` ＋ 長体。**折り返させない** |
| 列見出し・バッジ・件数 | `white-space: nowrap`。文字数で幅を変えない（`_rules.md` の 1.） |
| 注記・ヘルプ文 | 折り返してよい。ただし**強調（`<strong>`）は語の途中で切らない**（`white-space: nowrap` を当てる） |
| 長体の強さ | 既定 **0.94**、本当に詰まるところだけ **0.90**。これ以上は読みにくい |

**長体は「枠を広げてから縮める」**。`transform: scaleX()` だけでは文字数は増えない
（`text-overflow: ellipsis` が**変形前の幅**で切る位置を決めるため）。実装は
[`qsheet-recording-streaming/mockups/README.md`](qsheet-recording-streaming/mockups/README.md)
の「レイアウトの決めごと」に置いた `.condw` / `.cond` / `.cond-s` / `.cond-r` のとおり。
⚠️ **JS で測って書き戻す「長体フィット」は入れない**（`docs/design/v4/mockups/DESIGN_POLICY.md`）。

**実装するときも実ブラウザで測ること。** モックでは 49 件のはみ出し・切れ・2 行を実測で見つけ、
4 件（注記が 2 行になっているだけ）まで落とした。見るのは
①値が 2 行になっていないか ②… で切れていないか ③枠から下が切れていないか
④タップ対象 44px、の 4 つ。既存の `npm run verify:ui` と同じ考え方。

### 3-5. スマホ

- 一覧は**縦積みの行**（60px）。2 行目に `解像度・コーデック・音声・収録先` を長体でまとめる
  （区切りは詰めの「・」。前後に空白を入れると 390px で収録先が切れる）
- 直すのは**下から出るシート**。iOS の「設定」と同じ、左にラベル・右に値の行
- **まとめて変える操作は置かない。** 代わりに「まとめて変えるのは PC で。」と案内する
- タップ対象は 44px 以上、主アクションは**下端に幅いっぱい 52px**
- **OS の時計・電池・キーボードは描かない**（実機では上に重なる）
- 一覧は**そこだけスクロール**させ、要約・切替・主アクションは常に見えるようにする

---

## 4. Excel の仕様（現場が読む形）

Assistant の取込実装（`crates/server/src/sheet.rs` ＋ `record/import/` ＋ `stream/import/`）
から起こしたもの。**ここを外すと現場で読めない。**

### 4-1. ブックの決まり

| 事項 | 決めごと | 理由 |
| --- | --- | --- |
| 形式 | **`.xlsx`**（`.xlsm` / `.xls` / `.ods` も可。**`.xlsb` は不可**） | 拡張子で処理が分かれる |
| シート | **データを 1 枚目に置く。** 表紙・凡例を先頭にしない | 1 枚目しか読まない |
| シート名 | 何でもよい（実装は見ない）。`収録設定` / `配信設定` を推奨 | — |
| 見出し | **A1 から・1 行目**。列の並びは自由 | 見出し文字列で対応づける |
| 空行 | **入れない** | 空行は詰められ、現地に出る行番号がずれる |
| セルの型 | **文字列か数値だけ。真偽値セル・日付書式セルを使わない** | `true` / 日付は catch-all に落ちて必ず弾かれる |
| 数式 | 使わない（値をベタ書き） | キャッシュ値が無いと読めない恐れ |
| 結合セル・先頭の空列 | 使わない | 列の位置がずれる |
| CSV で出すなら | **UTF-8**。Windows Excel の既定（Shift_JIS）は**断られる** | 文字化けさせずにエラーにする実装 |

**未知の列はエラーにならず、現地の画面に「無視した列: …」と出るだけ。**
そのため `番組名` `収録日` `担当` などの参考列は置いてよい。
ただし **`TC` / `tc` / `timecode` に前方一致する見出しは置かない**（TCソース列として読まれる）。

### 4-2. 1 枚目「収録設定」

| 列 | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- |
| **見出し** | `デッキ` | `解像度` | `コーデック` | `音声ch` | `収録先` | `ファイル名` |
| **必須** | ✅ | 任意 | 任意 | 任意 | 任意 | 任意 |
| **型** | 文字列 | 文字列 | 文字列 | 数値 | 数値 or 文字列 | 文字列 |
| **空欄** | 行ごと読めない | 現状維持 | 現状維持 | 現状維持 | 現状維持 | 現状維持 |

```
デッキ    解像度              コーデック    音声ch  収録先        ファイル名
REC1     1920x1080p59.94    ProRes:HQ     2       1            GLS002-003_PGM
REC7     3840x2160p59.94    H.265:High    4       3            GLS002-003_4K
REC1-P   1920x1080p59.94    ProRes:422    2       ssd1         GLS002-003_PGM_BK
REC8                                      2       ネットワーク
```

- **デッキ 1 台につき 1 行**。収録側はシート内の重複を検出しないので、2 行あると両方送られる
- **`収録先` は番号（`1`）か device 名（`smb` / `ssd1` / `sd1` / `usb1`）で出すのが確実。**
  日本語は `ネットワーク` だけが安全（`SSD` などは device が `ssd1` のとき解決されない）
  - ONAiR の書き出しは画面の呼び名を**自動で device 名に写す**（`SSD 1`→`ssd1`・`SD 1`→`sd1`・
    `USB-C`→`usb1`。`ネットワーク` はそのまま）。とくに `USB-C` は空白とハイフンを落とすと
    `usbc` になり `usb1` に一致しないため、**写さないと現地で行ごと弾かれていた**（2026-08-30 修正・
    `device-excel.service.ts` の `exportSlotValue`）
- **`TCソース` 列は出さない**（§0-5）
- `DNx:HRHQX (MXF)` のように container 付きで書くと、**現在値は container 抜きで返るため
  毎回差分が出る**。ProRes など container が 1 つのコーデックに寄せるのが無難

### 4-3. 2 枚目「配信設定」

| 列 | A | B | C | D | E | F | G | H | I | J | K |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **見出し** | `ENC` | `セッション名` | `プロトコル` | `宛先` | `ポート` | `ストリームキー` | `パスフレーズ` | `Latency` | `Bandwidth` | `MTU` | `暗号化` |
| **必須** | ✅ | ✅ | 実質✅ | 条件 | 条件 | 条件 | 条件 | 任意 | 任意 | 任意 | 任意 |
| **型** | 文字列 | 文字列 | 文字列 | 文字列 | 数値 | 文字列 | 文字列 | 数値 | 数値 | 数値 | 文字列 |

```
ENC   セッション名     プロトコル      宛先                                ポート  ストリームキー          パスフレーズ  Latency  Bandwidth  MTU   暗号化
ENC1  YouTube Pri     RTMP           rtmp://a.rtmp.youtube.com/live2            xxxx-xxxx-xxxx-xxxx
ENC1  YouTube Bkup    RTMP           rtmp://b.rtmp.youtube.com/live2            xxxx-xxxx-xxxx-xxxx
ENC2  Center SRT      SRT Caller     srt.example.invalid                 9000                          pass-phrase   120      25         1316  AES-128
ENC5  Return Rcv      SRT Listener                                       9001
```

- **1 行 = 1 つの配信先。** 同じ ENC を複数行に書けば 2 本立てになる
- **`プロトコル` は必ず出す**（省くと新規行が RTMP 扱いになる）
- 受け付ける綴り: `RTMP` / `RTMPS` ／ `SRT` `SRT Caller` `Caller` ／ `SRT Listener` `Listener` `受信待ち`。
  暗号化は `なし` / `AES-128` / `AES-192` / `AES-256`（`0/128/192/256`・`0/16/24/32` も可）
- **`Stream ID` の列は出さない**（現地に取り込む道が無い）

### 4-4. 3 枚目「入力ガイド」

`項目` / `説明` の 2 列（既存の `server/src/shared/utils/excel.ts` を使う機材の Excel と同じ形）。
現地では読まれないが、**表を触る人が決まりを見られる場所**として必ず付ける。
「セッション名は半角 32 文字まで」「空欄は現地の設定を変えない」などをここに書く。

### 4-5. 書き出す前の点検

Assistant が取込時に弾く条件を**ONAiR 側で先に出す**。段は 3 つ。

| 段 | 意味 | 例 |
| --- | --- | --- |
| **直したほうがよい**（赤） | 現地で必ず弾かれる | RTMP なのにストリームキーが空／セッション名が 33 文字以上・日本語・前後に空白／同じ台に同じ宛先＋キーの RTMP が 2 件／SRT なのにポートが空／暗号化ありでパスフレーズが空 |
| **そのままでよい**（橙） | 出せるが、意図の確認がいる | 解像度・コーデック・ファイル名が空欄（＝現地の値を変えない）／HD Plus に 4K や DNxHR を入れている／同じデッキの行が 2 つある |
| **出さない**（灰） | 対象から外れる | 配信先が 1 件も無い ENC ／ 使わないと決めた台 |

**赤があっても書き出しは止めない**（現地で 1 行だけ弾かれても他は通るため）。
ただし**赤の件数を書き出しボタンの手前に必ず出す**。

### 4-6. ファイル名

```
収録配信設定_{GLS番号 または 番組名}_{YYYY-MM-DD}.xlsx
```

既存の作法どおり `Content-Disposition: attachment; filename*=UTF-8''...`
（`server/src/shared/utils/excel.ts` の `excelResponse`）。

---

## 5. 受け入れ側（実装のあたり）

### 5-1. 置き場所

| 事項 | 案 |
| --- | --- |
| URL | `/qsheet/recording` / `/qsheet/streaming`（**既存 8 ルートは 1 文字も変えない**） |
| ナビ | `client-qsheet/src/components/layout/Sidebar.tsx` の `navItems` に 2 行足す |
| 画面 | `client-qsheet/src/pages/recording/`・`streaming/` に分割（1 ファイル 400 行以内） |
| サーバー | `server/src/contexts/qsheet/routes/recording.routes.ts` を新設し、`index.ts` に 1 行 |

### 5-2. 保存先

**`qsheet_documents.data`（JSONB）には入れない。**
あちらは Yjs の同時編集の対象で、差分器が `id` を鍵に突き合わせるため、
配列を入れると `id` の付け忘れで増殖する（実測で 8 回の編集で 3 → 769 ロール）。
設定は同時編集しないので、Y.Doc を通す理由が無い。

**新しいテーブルを migration `212_` から作る**（205 は revert 済み・206 が 2 本ある・最新は 211）。
一覧で絞り込む項目は列にし、明細だけ JSONB に置く。`document_id` で `qsheet_documents` に紐づけ、
GLS 連携キー（`project_id` / `episode_id` / `episode_code`）は単独で引けるよう冗長に持つ。

### 5-3. API

```
GET    /api/qsheet/documents/:id/recording                    reader
PUT    /api/qsheet/documents/:id/recording                    editor
GET    /api/qsheet/documents/:id/streaming                    reader
PUT    /api/qsheet/documents/:id/streaming                    editor
POST   /api/qsheet/documents/:id/settings/preflight           reader    ← §4-5 の点検
GET    /api/qsheet/documents/:id/settings/export-xlsx         exporter  ← §4 の Excel
```

- 応答封筒は全社共通の `{ success, data }` / `{ success:false, error:{ code, message } }`
- **`canAccessDoc` を必ず通す。** 権限が無いときは存在秘匿のため **403 ではなく 404**
- 画面側の権限判定は `hasPermission('qsheet','editor')`
  （サーバーが `owner` を求めても画面は `manager` で判定する。段位表で同じ 3 のため）
- **Excel はサーバーで作る**（`buildExcelWorkbook` + `excelResponse`）。
  `xlsx` は `server/package.json` にしか入っておらず、client-qsheet に足すと数百 KB 増える

### 5-4. 凍結アプリとしての制約（案 A を採る場合）

制作資料は v4.0.0 で凍結扱いのため、**そのままだと次が使えない**:

| 使えない | 理由 |
| --- | --- |
| `tokens-v4.css`（v4 の色・`--radius: 12px`） | `index.css` の import を差し替えない決まり。`:root` に効くのでスコープもできない |
| LINE Seed JP | `index.html` に足さない決まり |
| 共通シェル `shared/src/client/shell/` | `check-shared-wiring.mjs` が落とす |
| お知らせ帯 `NoticeBar` / `confirmAction` | 同上（凍結アプリでは 0 個であることを検査） |

一方 **型スケール（`text-h1` 等）・角丸の役割名（`rounded-card` 等）・状態の帯の色
（`bg-success-surface` 等）・`min-h-tap`・`shared/src/client/states/*` は qsheet でも使える**
（`tailwind.preset.ts` と `tokens.css` に入っているため）。

つまり凍結のままだと **「部品と型は v4、色と書体と角丸だけ v3」という中途半端な見た目**になる。
**モックアップは v4（macOS/iOS 寄り）で描いてある**ので、そのとおりに作るには
制作資料を v4 に載せ替える必要がある。→ §6-1。

**凍結のまま作る場合に必ずやること**:

1. PR で `npm run build:all && npm run check:frozen` を回す（`npm run lint` には入っていない・約 2 分）
2. 増えた CSS は `-- --update "新機能◯◯の画面追加で新しいユーティリティが N 個増えた。既存画面の描画は不変"` で基準を更新
3. **既存ファイルの className を 1 文字も触らない**（`--update` の前提が崩れる）
4. 通知は既存の**トースト**（`client-qsheet/src/lib/notify.ts`）。確認は `DashboardPage` の削除確認 Dialog を真似る
5. フォームは `.dialog-bottom-sheet`（qsheet に既にある CSS）で下から出すシートにする
6. 設定はローカル `useState` で持つので**素の `<input>` で可**。
   もし `updateData` 経由にするなら **`BufferedInput` 必須**（日本語が二重に入る）

---

## 6. 決めていただきたいこと

### 6-1. 見た目 — 制作資料を v4 に載せ替えるか（いちばん大きい）

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| **A. 凍結のまま足す** | 既存 Qシートの色・書体・トーストに合わせる | 凍結条文に完全準拠。`check:frozen` の増分が最小 | **モックアップどおりにならない**。v4.1 で載せ替えるとき書き直し |
| **B. 制作資料を v4 に載せ替えてから足す（推奨）** | `tokens-v4.css`・LINE Seed JP・共通シェル・お知らせ帯へ移す | **モックアップどおりになる**。技術資料の後継として筋が通る。v4 の規律（縦の整列・44px・スマホ）がそのまま効く | 既存 6 画面（一覧・台本・本番・ランダウン・プロンプター・音声サポート）の見た目が変わる。**本番の業務が乗っている画面なので、別 PR に分けて慎重に** |
| C. 新画面だけ v4 の構造を借りる | `Row` / `TableBadge` / 型スケールは使い、色は既存のまま | v4.1 の載せ替えが楽 | 色・角丸・書体だけ違う "v4 もどき"。隣の画面ともずれる |

「v4 への作業を進めています」とのことなので **B** を前提に描いてありますが、
**この機能の PR で載せ替えまでやるか、載せ替えを別 PR に切るか**を決めてください。
（推奨は分ける: 「① 制作資料を v4 に載せ替える」→「② 収録設定・配信設定を足す」の 2 本）

### 6-2. 設定の単位

| 案 | 内容 |
| --- | --- |
| **a. 香盤表 1 本に 1 セット（推奨）** | `qsheet_documents` と 1:1。`/qsheet/editor/:id` から入る |
| b. エピソード単位 | 同じ回で香盤表が複数あるときに共有できる |
| c. 独立した設定ドキュメント | 旧技術資料と同じ形。番組をまたいで使い回せる |

### 6-3. そのほか

| # | 論点 | 補足 |
| --- | --- | --- |
| 1 | **前回の設定を写す**を作るか | モックには置いてある。実運用ではほぼ毎回使うはず |
| 2 | **書き出しの履歴**を残すか | 「いつ・誰が・どの内容で出したか」。現場で「どの表が最新か」を追える |
| 3 | Excel の**取込**（ONAiR に読ませる）も作るか | 既存の xlsx 取込（dry_run → commit）の作法がそのまま使える。**Assistant からは戻せない**（キーを返さないため）ので、使い道は「別の番組の表を読み込む」 |
| 4 | 収録の**接続設定**（IP・機種・NAS）も ONAiR で持つか | いまは Assistant の `onair-setup.json` の担当。持つなら**別画面**（Excel には出さない） |
| 5 | 台の**呼び名**を機材管理（`client-equipment`）と紐づけるか | 台帳に HyperDeck があるなら、そこから引ける |

---

## 7. 根拠（Assistant 側の実装）

| 内容 | ファイル |
| --- | --- |
| 表を格子に読む（収録・配信で共通） | `crates/server/src/sheet.rs` |
| 収録の列定義・照合 | `crates/server/src/record/import/{mod,values,context}.rs` |
| 配信の列定義・照合・反映 | `crates/server/src/stream/import/{mod,values,apply,context}.rs` |
| 収録の設定の型・能力照合 | `crates/hyperdeck-rest/src/{model,lib}.rs`, `client/{caps,settings}.rs` |
| 配信の設定の型・検証・エラー文 | `crates/magewell/src/{model,validate,error}.rs` |
| 機種ごとの能力差（唯一の定義・モック） | `crates/hyperdeck-rest/src/mock/fixtures.rs` |
| API 仕様 | `docs/record-api.md` / `docs/stream-api.md` |
| 機器プロトコル | `docs/protocols/hyperdeck-rest.md` / `docs/protocols/magewell-ultraencode.md` |

ONAiR 側:

| 内容 | ファイル |
| --- | --- |
| Excel を作る共通基盤 | `server/src/shared/utils/excel.ts`（`buildExcelWorkbook` / `excelResponse`） |
| Excel の取込・テンプレの作法 | `server/src/shared/utils/excel-resource.ts` |
| 設定を打ち込む画面の手本 | `client-equipment/src/pages/settings/RentalRulesPanel.tsx` |
| Qシート内のフォームの手本 | `client-qsheet/src/pages/DashboardPage.tsx` の新規作成ダイアログ |
| Qシートの取込 UI の手本 | `client-qsheet/src/components/editor/CsvImportDialog.tsx` |
| 凍結の検査 | `scripts/check-frozen-css.mjs` / `scripts/check-shared-wiring.mjs` |
