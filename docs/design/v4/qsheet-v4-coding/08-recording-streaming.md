# 収録設定・配信設定 — ミニアプリとしての実装設計

> **2026-08-21 作成。** PR #279（`docs/design/qsheet-recording-streaming.md`）で出した設計を、
> 制作資料 v4 の構造（ミニアプリ・ジャーニー）と UI/UX に合わせ直したものです。
>
> **モックアップ**: https://claude.ai/code/artifact/33ba14de-1fec-409f-967a-faf31962792d
> （PC 3枚・スマホ 1枚）
>
> ⚠️ **機器側の事実（Assistant が何を読むか）は #279 が正です。** この文書はそれを前提に、
> **置き場所・単位・見た目**だけを決め直します。#279 の §0（いちばん大事な前提）・§4（Excel の仕様）・
> §7（根拠）は**書き換えずそのまま使ってください**。

---

## 0. 決めたこと

1. **Qシートのサイドバーに足さない。** 収録設定・配信設定は
   **Qシート／スケジュール表と並ぶミニアプリ**として、案件のミニアプリ一覧から入る。
2. **設定の単位を「香盤表1本」から「案件（資料）」に変える。** #279 §6-2 の推奨 a を覆す。
3. **v4 への載せ替えは前提として解決済み。** #279 §6-1 の案 B を採る（この設計書群が載せ替え側）。
   したがって #279 §5-4「凍結のまま作る場合に必ずやること」は**不要**。
4. **Excel は2本ある。混ぜない。** 台本の往復（[`03-excel.md`](03-excel.md)）と、
   機器設定の片道（この文書）は**別物**。共通化するのは `excelResponse` の1関数だけ。
5. **ONAiR から機器には触らない。** 「送信」ボタンは作らない。作るのは「書き出す」だけ。
6. 画面は4つ: 収録設定（PC）／配信設定（PC）／Excel を書き出す／収録・配信（スマホ）。

---

## 1. #279 から変えたこと（3点）と、その理由

### 1-1. 置き場所 — Qシートの中 → Qシートと並ぶミニアプリ

| | #279 | この設計 |
| --- | --- | --- |
| URL | `/qsheet/recording` / `/qsheet/streaming` | `/qsheet/recording` / `/qsheet/streaming`（**同じ**） |
| 入口 | `client-qsheet/src/components/layout/Sidebar.tsx` の `navItems` に2行足す | **案件のミニアプリ一覧**（[`01-app-structure.md`](01-app-structure.md) のレジストリ） |
| 画面上の行き来 | Qシートのサイドバー | **上辺バーのセグメント**（スケジュール表／Qシート／収録／配信／計時・視聴者） |

**URL は #279 のままでよい**（`/qsheet/` は制作資料アプリのベースパスであって、
Qシート＝香盤表のパスではないため）。変えるのは**入口と、隣に何が並ぶか**だけです。

⚠️ **`01-app-structure.md` のミニアプリ・レジストリ（`shared/src/production/miniapps.ts`）に
2件足すこと。** レジストリが正なので、ここに載っていないミニアプリは一覧に出ません。

### 1-2. 設定の単位 — 香盤表 1:1 → 案件（資料）単位

**#279 §6-2 の推奨（a. 香盤表1本に1セット）は採りません。**

理由は3つ。

1. **兄弟の配下にぶら下げる形になる。** ミニアプリとして並べる以上、
   収録設定が「Qシート文書の子」だと、Qシートを消したら収録設定も消えます。
   スケジュール表を先に作って Qシートをまだ作っていない案件では、そもそも入口がありません。
2. **機器は1日に1セットしかない。** HyperDeck 12 台・Magewell 10 台は会場の設備で、
   同じ日に香盤表が2本あっても**デッキの設定は1つ**です。1:1 にすると、
   どちらの香盤表の設定が現地に出るのか決められません。
3. **Excel はその日の分をまとめて1本出す。** ファイル名も
   `収録配信設定_{GLS番号}_{日付}.xlsx` で案件・日付の単位です（#279 §4-6）。

**採る形**: `qsheet_documents` と同じ「資料」の単位に持たせる。
つまり **案件（`project_id`）＋実施日** で1セット。案件に紐づかない資料単体
（`doc_no` = `SB-…`）でも同じように持てます。

```
案件 60周年 記念式典（GLS-A012）
├── スケジュール表（2026-08-02）
├── Qシート（香盤表）  … 複数可
├── 収録設定           ← 1セット   ◀ ここ
├── 配信設定           ← 1セット   ◀ ここ
└── 計時・視聴者
```

### 1-3. 見た目 — v4 の前提で確定

#279 は「凍結のまま作るか、v4 に載せ替えるか」を判断待ちにしていましたが、
**この設計書群が載せ替え側**なので解決済みです。`tokens-v4.css`・LINE Seed JP・共通シェル・
`NoticeBar` が使えます。ただし**この2画面は `useState` のローカル状態なので、
素の `<input>` で構いません**（#279 §5-4-6 のとおり。`updateData` を通さないため
`BufferedInput` は不要）。

⚠️ ただし **`00-datamodel-fixes.md` の「凍結を解く作業」が先**です。

---

## 2. データモデル

**`qsheet_documents.data`（JSONB）には入れない。** [`README.md`](README.md) §3-3 の
「`data` は Yjs の所有物」という全体方針どおりで、設定は同時編集しないため
Y.Doc を通す理由がありません（#279 §5-2 と同じ結論）。

**専用テーブル2本**。migration 番号は `00-datamodel-fixes.md` の採番表に従うこと。

```sql
-- 収録設定（1案件 = 1行。明細は JSONB）
CREATE TABLE qsheet_recording_settings (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  doc_no            TEXT,                    -- 案件に紐づかない資料単体のとき
  service_date      DATE,                    -- 実施日（Excel のファイル名にも使う）
  decks             JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_exported_at  TIMESTAMPTZ,
  last_exported_by  TEXT REFERENCES users(id),
  last_export_name  TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT rec_owner_ck CHECK (project_id IS NOT NULL OR doc_no IS NOT NULL)
);
CREATE UNIQUE INDEX qsheet_recording_key
  ON qsheet_recording_settings (COALESCE(project_id, doc_no), service_date)
  WHERE deleted_at IS NULL;

-- 配信設定（1案件 = 1行。配信先の配列を JSONB）
CREATE TABLE qsheet_streaming_settings (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  doc_no            TEXT,
  service_date      DATE,
  destinations      JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_exported_at  TIMESTAMPTZ,
  last_exported_by  TEXT REFERENCES users(id),
  last_export_name  TEXT,
  key_mode          TEXT NOT NULL DEFAULT 'blank'
                    CHECK (key_mode IN ('blank','plain')),
  created_by        TEXT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT stream_owner_ck CHECK (project_id IS NOT NULL OR doc_no IS NOT NULL)
);
CREATE UNIQUE INDEX qsheet_streaming_key
  ON qsheet_streaming_settings (COALESCE(project_id, doc_no), service_date)
  WHERE deleted_at IS NULL;
```

### 明細の型（#279 §2 のとおり・項目名を変えないこと）

```ts
// decks[] — 収録。1要素 = デッキ1台
type Deck = {
  deckId: string;          // 'REC1'..'REC8' | 'REC1-P'..'REC4-P'  必須
  label?: string;          // 現場の呼び名。Excel には出さない
  videoFormat?: string;    // '1920x1080p59.94' 等。機器の綴りと完全一致
  codec?: string;          // 'ProRes:HQ' 等
  audioChannels?: number;  // 2 | 4 |（4K Pro のみ 8 | 16）
  slot?: string;           // 'ネットワーク' | 'ssd1' | 'sd1' | 'usb1' …
  filePrefix?: string;     // 検証なし
};

// destinations[] — 配信。1要素 = 配信先1件（同じ ENC を複数行に置ける）
type Destination = {
  encoderId: string;       // 'ENC1'..'ENC10'  必須
  name: string;            // セッション名。半角のみ・1〜32字・前後空白不可・ENC内で一意  必須
  protocol: 'RTMP' | 'SRT Caller' | 'SRT Listener';   // 実質必須
  url?: string;            // RTMP: rtmp://host/app ／ SRT Caller: ホスト ／ Listener: 不要
  port?: number;
  streamKey?: string;      // RTMP の新規は必須。更新は空欄で現地のキーを残す
  passphrase?: string;     // aes が「なし」以外のとき必須
  latencyMs?: number;
  bandwidthPct?: number;
  mtu?: number;
  aes?: 'なし' | 'AES-128' | 'AES-192' | 'AES-256';
};
```

⚠️ **`streamKey` は平文で入る。** Assistant が機器から読み戻せないため（#279 §0-8）。
DB に置く以上、**`liveops_settings` と同じ AES-256-GCM で暗号化する**こと
（`server/src/contexts/liveops/crypto.ts` が既にある）。画面には伏せ字で出し、
書き出し時に「入れる／空欄で出す」を選ばせます。

---

## 3. API

```
GET    /api/v1/internal/qsheet/production/:ownerKey/recording     reader
PUT    /api/v1/internal/qsheet/production/:ownerKey/recording     editor
GET    /api/v1/internal/qsheet/production/:ownerKey/streaming     reader
PUT    /api/v1/internal/qsheet/production/:ownerKey/streaming     editor
POST   /api/v1/internal/qsheet/production/:ownerKey/settings/preflight   reader
GET    /api/v1/internal/qsheet/production/:ownerKey/settings/export-xlsx editor
POST   /api/v1/internal/qsheet/production/:ownerKey/settings/copy-from   editor
```

- `:ownerKey` は `project_id` か `doc_no`＋`?date=YYYY-MM-DD`
- 応答封筒は全社共通の `{ success, data }` / `{ success:false, error:{ code, message } }`
- **権限は既存の `qsheet` 区画**（`hasPermission('qsheet','editor')`）。
  収録・配信で区画を分けない（migration 210 で7区画に統合済みのため増やさない）
- 権限が無いときは**存在秘匿のため 403 ではなく 404**（`access.ts` の作法）
- `copy-from` は「前回の設定を写す」。**同じ案件の別日、または別案件から**コピーする

⚠️ **`export-xlsx` を `reader` にしない。** ストリームキーが平文で出る経路なので
`editor` 以上に限り、`last_exported_*` に**誰がいつ何を出したかを必ず記録**します。

---

## 4. Excel — 台本の Excel と混ぜない

**ここが実装で最も事故りやすいところです。** 制作資料には Excel が2本あり、
**設計の前提が正反対**です。

| | 台本の Excel（[`03-excel.md`](03-excel.md)） | 機器設定の Excel（この文書） |
| --- | --- | --- |
| 向き | **往復**（書き出し ↔ 取込） | **片道**（ONAiR → 現地。戻せない） |
| 正はどっち | ONAiR と Excel が行き来する | **ONAiR が正**。Assistant は反映先 |
| ヘッダ | 2行（日本語＋機械キー）＋隠しシート `_schema` | **1行だけ。A1 から。列順は自由** |
| シート | 何枚でも・順不同 | **データを必ず1枚目**（Assistant は1枚目しか読まない） |
| 空欄の意味 | 「その項目を変更しない」 | **「現地の設定を変えない」** |
| 空行 | 無視 | **禁止**（行番号がずれる） |
| ライブラリ | exceljs（入力規則・書式・保護が要る） | `buildExcelWorkbook`（`server/src/shared/utils/excel.ts`）で足りる |

**共通化してよいのは `excelResponse`（`Content-Disposition` の作り）だけ**です。
`03-excel.md` の2行ヘッダや `_schema` シートを**こちらに持ち込むと、現地で読めなくなります**
（Assistant は1行目を見出しとして読むので、2行目の機械キー行がデータ行になる）。

**逆に、こちらの「1枚目しか読まない」を台本側に持ち込む必要もありません。**
実装するときは**別のモジュールに分ける**こと（`recording-excel.service.ts` /
`qsheet-excel.service.ts`）。

Excel の中身（列・綴り・型・受け付ける表記）は **#279 §4 が正**。書き換えないでください。

---

## 5. 画面

モックアップのとおり。#279 §3 から変えたのは**シェルと見た目**だけで、
中身（点検の3段・未入力を橙にする・キーの扱い・機種で選択肢を絞る）はそのままです。

- **収録設定（PC）**: 状態の帯 → 絞り込み（すべて12／本線8／控え4）→ 本線8行・控え4行の表。
  **未入力のセルは橙**（`#fff7ed` / `#fed7aa`）。赤にしない — 空欄は不正ではなく
  「現地の値を変えない」という意味だから。控えには「本線の設定を写す」。
  一括変更は**機種グループを越えない**
- **配信設定（PC）**: 左に ENC ごとの配信先、右に 372px のインスペクタ。
  **プロトコルで出す欄を変える**（RTMP のとき SRT の詳細を伏せ、変えると出てくると書く）。
  キーの状態は**文字で**（設定済み／未入力／キー不要）。
  配信先が無い ENC は「この台は Excel に出ません」と明示する
- **Excel を書き出す**: 4段（シートを選ぶ → 見出しの見本 → 点検 → キーの扱い）。
  **赤があっても書き出しは止めない**が、件数をボタンの手前に必ず出す
- **スマホ**: 収録／配信をセグメントで切り替え、**1台ずつ直す**。
  まとめて変える操作は置かず「まとめて変えるのは PC で」と案内する

---

## 6. ジャーニーの中での位置

[`01-app-structure.md`](01-app-structure.md) のジャーニーは
「当日の枠 → 番組の流れ → 台本の中身」と**縦に降りる**流れですが、
収録・配信設定は**その横に並ぶ「技術の仕込み」**です。

```
案件を選ぶ
   ├─ 当日の枠を置く    （スケジュール表）
   │     ↓
   ├─ 番組の流れを組む  （Qシート・香盤表）
   │     ↓
   ├─ 台本を詰める      （Qシート・進行台本）
   │
   └─ 技術の仕込み      （収録設定・配信設定・計時）  ◀ 横に並ぶ
```

⚠️ **進み具合の手がかりに混ぜないこと。** 収録設定が空でも台本は完成しますし、
その逆もあります。`01-app-structure.md` §ジャーニーの「3値の手がかり」は
**枠／流れ／台本の3本のまま**にし、技術の仕込みは**別の行**として出します。

---

## 7. 利用者に確認すべきこと

| # | 論点 | なぜ聞くか |
| --- | --- | --- |
| 1 | **設定の単位を「案件＋実施日」にしてよいか** | #279 の推奨（香盤表1:1）を覆しています。複数日にまたがる案件で、日ごとに機器設定を変えるのが実態と合っているか |
| 2 | **ストリームキーを DB に持ってよいか** | 暗号化して持ちますが、「ONAiR には置かず毎回手で入れる」という運用もありえます |
| 3 | 「前回の設定を写す」のコピー元をどこまで広げるか | 同じ案件の別日だけか、別案件からも引くか |
| 4 | **書き出しの履歴**をどこまで残すか | いまの設計は最後の1回だけ。全履歴を残すなら別テーブルが要ります |
| 5 | Excel の**取込**（ONAiR に読ませる）も作るか | #279 §6-3-3。Assistant からは戻せないので、用途は「別の番組の表を読み込む」 |
| 6 | 収録の**接続設定**（IP・機種・NAS）を ONAiR で持つか | いまは Assistant の `onair-setup.json` の担当。持つなら別画面（Excel には出さない） |
| 7 | 台の**呼び名**を機材管理（`client-equipment`）と紐づけるか | 台帳に HyperDeck があるなら引けます |
