# 実装設計 段2 — 公開音声サポート URL のトークン化と失効

> **これは実装設計です。コードは1行も書いていません。**
> 元の設計は [`../07-onair-roles.md`](../07-onair-roles.md) §4・§5-2、
> 順序は [`../README.md`](../README.md) §7 の **段2**、
> 個人情報の絞り込みは [`../03-excel.md`](../03-excel.md) §7-6 と対になります。
>
> **この文書を書くにあたって実装を読み直し、設計書との食い違いを6件見つけました**（§10）。
> うち2件は**設計どおりに作ると壊れる／守れない**ものなので、先に §2 と §10 を読んでください。

---

## 1. この段でやること

**配った公開URLを取り消せるようにする。** それだけです。

| やる | やらない |
| --- | --- |
| 公開音声サポートの URL を**トークン**にする（資料IDを URL に出さない） | 公開画面（`AudioSupportPage`）の**見た目・30秒ポーリング・差分5色**を変えること |
| 発行・再発行・失効を**編集画面の共有ダイアログ**に足す | 公開画面に**ログインを掛ける**こと（07 §4-3 のまま無認証） |
| 失効した URL に **410 Gone** を返す | 本番4画面（進行／ランダウン／プロンプター／公開音声）の CSS を触ること |
| 公開エンドポイントが返す個人名を**その台本で実際に使われている名前だけ**に絞る | Excel 取込の自動追加の話（段6・03 §7-6 の担当） |
| 公開URLの持ち主が **Socket.IO 経由で台本の編集差分・在席者の氏名まで受け取れる**のを止める（§6-3） | `cue:*` の中継そのもの（07 §1-1「そのまま」） |

**なぜ段2に置けるか**: この段は `qsheet_documents.data` を1文字も読み書きしません。
新しい表を1本足して、公開ルート1本と共有ダイアログ1枚を直すだけなので、
段0・段1・段3 のどれとも競合しません（README §7 の「他とほぼ独立」は事実でした）。

---

## 2. 実装前の事実確認

**すべて手元のコードを読んで確かめたものです。** 行番号は本ブランチ（`claude/qsheet-v4-coding-guide-udbo1u`）時点。

### 2-1. 今の公開URLは「資料IDを知っている人なら誰でも」開ける

| 確かめたこと | 事実 | 場所 |
| --- | --- | --- |
| 画面のルート | `/qsheet/audio/:id` は `ProtectedRoute` で**包まれていない**（他の4本は包まれている） | `client-qsheet/src/App.tsx:43-48` |
| 画面が呼ぶ API | `fetch('/api/v1/internal/qsheet/documents/${id}/public-audio', { credentials: 'omit' })` — **資格情報を意図的に送っていない** | `client-qsheet/src/pages/AudioSupportPage.tsx:291-292` |
| サーバー側の認証 | このルーターには `requireAuth` も `requirePermission` も**1つも付いていない**（`qsheet` の他3ルーターは全部付いている: `documents.routes.ts:11` / `pdf.routes.ts:10` / `upload.routes.ts:9`） | `server/src/contexts/qsheet/routes/public-audio.routes.ts` 全体 |
| なぜ素通しになるか | 全体の認証ミドルウェアは**通ったら `req.user` を埋めるだけ**で、拒否は各ルートの `requireAuth` が行う「オプトイン方式」 | `server/src/app.ts:86` / `server/src/shared/middleware/auth.ts:97-104` |
| 登録順 | 公開ルーターを `documentRoutes` **より前**に登録するコメント付きの意図的な作り | `server/src/contexts/qsheet/index.ts:11-12` |
| 静的配信 | `/qsheet/*` は全部 SPA の `index.html` を返すので、**パスの形を変えてもサーバー設定の変更は要らない** | `server/src/app.ts:130-143` |

→ **`/qsheet/audio/<資料ID>` は、資料ID を知っていれば誰でも開けます。**
資料ID は編集画面・ランダウン・プロンプターの URL にもそのまま出ているので、
**社内で本番4画面の URL を1度でも見た人は、公開URLを自分で組み立てられます。**

### 2-2. 失効の手段は本当に1つも無い

| 確かめたこと | 事実 |
| --- | --- |
| 失効カラム | `ALTER TABLE qsheet_documents DROP COLUMN IF EXISTS audio_share_revoked_at, DROP COLUMN IF EXISTS audio_share_revoked_by`（`server/src/shared/db/migrations/209_column_level_drift_cleanup.sql:39-41`）。**DROP 済みは事実** |
| 失効を見る側のコード | `grep -rn "audio_share" --include=*.ts --include=*.tsx` の結果は**0件**。サーバーにもクライアントにも、失効を読む行が1行も無い |
| 公開ルートの条件 | `if (!row \|\| row.deleted_at)` の1つだけ。**資料を消す以外に止める手段が無い**（`public-audio.routes.ts:53-56`） |
| 画面の注意書き | 「番組終了後は URL を**再生成する仕組みは現在ありません** — 必要時はドキュメントごと削除してください」と**ダイアログ自身が書いている**（`client-qsheet/src/components/editor/AudioShareDialog.tsx:112-115`） |

→ **設計書の「配った URL は取り消せません」は、実装でも文言でも裏が取れました。**

⚠️ ただし**カラムだけの話ではありません**（§10-2）。
`docs/version-history.md` の v2.9.267 は「migration 139 で `audio_share_revoked_at` を追加し、
止めると公開GETが **410 Gone** を返す」と書いていますが、
`server/src/shared/db/migrations/139_pricing_audit_columns.sql` は**まったく別の中身**で、
`audio_share` に触れる migration は 209 の DROP 以外に**1本も存在しません**。
**機能一式（列・エンドポイント・ボタン）が丸ごと消えていて、実DBに列だけ残っていた**
のを 209 が「ドリフト」として片づけた、というのが実際に起きたことです。

### 2-3. QR とコピーの実装（落としてはいけないもの）

`client-qsheet/src/components/editor/AudioShareDialog.tsx`

- URL の組み立ては `${window.location.origin}/qsheet/audio/${docId}`（`:19-21`）。**ここだけが URL の出どころ**
- QR は `qrcode` の `QRCode.toDataURL(url, { width: 256, margin: 1, ... })`（`:29`）
- コピーは `navigator.clipboard.writeText` ＋ `execCommand('copy')` の代替（`:39-57`）
- 開く導線は**編集画面のヘッダー**で、`audio_mic` ブロックがある資料にだけ出る（`client-qsheet/src/pages/EditorPage.tsx:650-662`、ダイアログは `:860-864`）

→ **共有ダイアログは編集画面の部品です。本番4画面ではありません。**
つまり「本番4画面の見た目を変えない」という制約は、**発行・失効の UI を足すことを1つも縛りません**（§5）。

### 2-4. `masters.persons` の全件返しは実在する（ただし「全社の人名簿」ではない）

- 公開ペイロードは `masters.persons` / `masters.micTypes` / `masters.micChannels` を**素通しで返します**
  （`public-audio.routes.ts:89-99`）。設計書の指摘は事実です。
- ただし `masters` は **`qsheet_documents.data` の中の、その資料ごとのリスト**です
  （編集画面のサイドバー「マスター」タブで人が足す: `client-qsheet/src/components/editor/EditorSidebar.tsx:455,546-568`）。
  **全社の人名マスターではありません。** DB に `qsheet_masters` のような表はありません（grep で0件）。
- ⚠️ **公開画面は `persons` と `micTypes` を1度も読んでいません。**
  型に宣言されているだけで（`AudioSupportPage.tsx:42-43`）、
  実際に使うのは `micChannels` だけです（`:340-341`）。
  → **絞り込みではなく「返すのをやめる」でも画面は1ドットも変わりません**（§6-1 で判断）。

### 2-5. Socket.IO の room は「資料IDを知っていれば入れる」（設計書に無い）

公開画面は HTTP だけでなく **Socket.IO にも資料IDで入っています**。

- `AudioSupportPage.tsx:308` が `getQsheetSocket(id)` を呼ぶ → `client-qsheet/src/lib/socket.ts:27-35` が
  `query: { docId }` で `/qsheet` 名前空間へ接続
- サーバーは **`docId` があれば無条件に `doc:<docId>` へ join** させる（`server/src/contexts/qsheet/socket.ts:49-56`）。
  認証は**そのあと**で、`canAccess` は「発火してよいか」の判定にしか使っていない
- そのため、**join だけした匿名クライアントに次のものが届きます**:

| 届くもの | 出どころ | 中身 |
| --- | --- | --- |
| `cue:sync` ほか `cue:*` | `socket.ts:138-168` | **これは意図どおり**（公開画面が使う） |
| `yjs:update` | `socket.ts:123`（`socket.to(room).emit`） | **編集中の台本の差分そのもの**。シナリオ本文・テロップ・放送日を含む |
| `awareness:update` | `socket.ts:131` | 誰がどのセルを選んでいるか |
| `presence:sync` | `socket.ts:84`（`qsheetNs.to(room).emit`） | **在席している社内ユーザーの `userId` と氏名** |
| `presence:query` の応答 | `socket.ts:92-95` | 同上（**匿名でも emit できる**） |

→ **公開URL（＝資料ID）を持つ人は、ブラウザの開発者コンソールから
「シナリオ本文や放送日は返却されません」の約束を迂回できます。**
ダイアログの注意書き（`AudioShareDialog.tsx:113`）は**HTTP のペイロードについてだけ**正しい。
**この事実は 07 にも 03 にも書かれていません**（§10-4）。

### 2-6. 数字と前例

| 確かめたこと | 事実 |
| --- | --- |
| migration の実際の最大番号 | **`211_drop_techsheet_schema.sql`**（`ls server/src/shared/db/migrations \| sort \| tail`）。README §6 は「最大が 210 の前提」で採番しており**1つずれています** |
| migration の実行 | ファイル名で `_migrations` に記録し、`readdirSync().sort()` の順に1本ずつトランザクションで流す（`server/src/shared/db/migrate.ts:16-42`）。**番号の重複は落ちない**（実際 `206_` が2本ある）が、順序が名前順になるので避ける |
| 資料IDの形 | `uuid()`（v4）。本番の投入経路は `documents.routes.ts:115` の1つだけ、検証シードも `uuidv4()`（`server/src/shared/db/seed-subapps.ts:191-192` ほか）。**36文字のハイフン付き** |
| トークン共有の前例 | **あります。** スタジオのカレンダー／サイネージ：`crypto.randomBytes(24).toString('hex')` を DB に**平文で**持ち、`?token=` で検証、`system_admin` だけが再生成できる（`server/src/contexts/production/routes/studio.routes.ts:26-42, 210-216, 291-303`） |
| 旧ID解決を記録する前例 | **あります。** 顧客・仕入先の legacy-ID 解決（`resolveLegacyCustomerId` / `resolveLegacyVendorId`。v4.1.6・PR #215） |
| レート制限 | `express-rate-limit` は導入済み（`server/package.json:29`、使用例 `platform/routes/auth.routes.ts:17-24` / `mcp/index.ts:12`）。**公開音声ルートには付いていない** |
| 型の作法 | 直近の migration は `TIMESTAMPTZ`（174〜187）。qsheet の既存表（`102_qsheet_document_shares.sql`）は `TIMESTAMP`。**混在は既にある** |
| SQL の書き方 | `queryOne` / `execute` は `?` を `$n` に変換する。**jsonb の `?` 演算子は使わない**（`shared/tests/sqlPlaceholder.test.ts` が検査する） |

---

## 3. DDL

### 3-1. migration 番号

**`212_qsheet_audio_share.sql`。** 実際の最大が `211_drop_techsheet_schema.sql` だからです。

⚠️ **PR を出す直前にもう一度 `ls server/src/shared/db/migrations | sort | tail -3` を見てください。**
番号は「枝を切った時刻」ではなく**マージされた順**で決まります
（`CLAUDE.md`「バージョンを上げるとき」と同じ理由）。段1（`qsheet_cue_actuals`）が先に入れば 212 は埋まります。
README §6 の採番表（この段は 217）は**最大が 210 の前提で書かれていて既に1つずれている**ので、
表の番号ではなく**そのときの実測値＋1**を使ってください。

### 3-2. 確定形

```sql
-- 212: 公開音声サポート URL を「取り消せる」ようにする
--
-- ── なぜ表を1本足すのか ────────────────────────────────────
--
-- 今は /qsheet/audio/<資料ID> が URL の全部で、資料IDは編集画面・ランダウン・
-- プロンプターの URL にもそのまま出ている。つまり社内で URL を1度見た人は
-- 公開URLを自分で組み立てられ、しかも配ったあとに止める手段が無い
-- (209 で audio_share_revoked_at / audio_share_revoked_by を DROP 済み。
--  それ以前も、失効を読むコードは1行も残っていなかった)。
--
-- ── なぜ qsheet_documents に列を足し直さないのか ────────────
--
-- 列で持つと「1資料に1本」しか持てず、**再発行すると前の URL の記録が消える**。
-- 「いつ配った分を、いつ誰が止めたか」を後から言えるようにしたいので、行で持つ。
-- 失効した行も**消さない**(消すと「止めた」という事実が消える)。

CREATE TABLE IF NOT EXISTS qsheet_audio_shares (
  token        TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  label        TEXT,
  created_by   TEXT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  revoked_by   TEXT REFERENCES users(id),
  last_seen_at TIMESTAMPTZ
);

-- 「この資料の生きている URL」を引くための索引。失効済みは入れない。
CREATE INDEX IF NOT EXISTS idx_qsheet_audio_shares_doc
  ON qsheet_audio_shares(document_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE  qsheet_audio_shares          IS '公開音声サポート URL のトークン。失効しても行は消さない';
COMMENT ON COLUMN qsheet_audio_shares.token    IS 'URL のパスに載る不透明な文字列。base64url 32文字 (192bit)';
COMMENT ON COLUMN qsheet_audio_shares.label    IS '「8/6 本番用」など、人が後で見分けるための覚え書き';
COMMENT ON COLUMN qsheet_audio_shares.last_seen_at IS '最後に開かれた時刻。使われているかを見るためだけで、人数は数えない';
```

**07 §4-1 の DDL からの変更点は 0 です**（`TIMESTAMPTZ` のまま・列も索引もそのまま）。
`COMMENT ON` を足したのは、直近の migration（例 `191_task_intake_warnings.sql:29-30`）の作法に揃えるためです。

**`UNIQUE(document_id) WHERE revoked_at IS NULL` は張りません。**
「同時に生きているのは1本」は第1版の**画面の決め**であって（§5-3）、
表の制約にすると「新しいのを出してから古いのを止める」順序でしか再発行できなくなり、
将来「本番用とリハ用を別にしたい」と言われたときに migration が要ります。

### 3-3. トークンの作り方

```ts
// server/src/contexts/qsheet/services/audio-share.service.ts (新規)
import crypto from 'crypto';
const newToken = () => crypto.randomBytes(24).toString('base64url'); // 32文字・192bit
```

| 決め | 中身 | 理由 |
| --- | --- | --- |
| 長さ | **24バイト＝192bit**（base64url で32文字） | 総当たりが成立しない。既存の資料IDの uuid v4 は 122bit なので、**今より弱くしない**のが最低線。前例（`studio.routes.ts:29`）も24バイト |
| 文字 | **base64url**（`A–Z a–z 0–9 - _`）。`toString('base64url')` は Node 16+ で `+/=` が出ない | パスに直接置けて（`encodeURIComponent` が要らない）、hex の48文字より**16文字短い**。QRのセル数が減って現場のスマホで読みやすくなる |
| 保存 | **平文**（ハッシュにしない） | ①ダイアログは**何度でも QR を出し直す**（`AudioShareDialog.tsx:26-37` は開くたびに QR を作る）。ハッシュにすると「発行した瞬間しか URL を表示できない」UX になり、当日の朝に配り直せない。②守る相手は「URL が転送されること」であって「DB が読まれること」ではない。**DB を読める相手は同じ行から `qsheet_documents.data`（台本本文）を読める**ので、トークンだけハッシュしても増える安全は無い。③前例（`studio_calendar_settings.feed_token`）も平文 |
| 生成元 | `crypto.randomBytes`（CSPRNG）。**`Math.random()` / `uuid()` / `Date.now()` を混ぜない** | uuid v4 は 122bit で、しかも文字面から「これは uuid だ」と分かる。生成器を推測させない |
| 秘密の置き場所 | **コードにも `.env` にも定数を置かない。** 鍵になるのは DB の行だけ | `CLAUDE.md` セキュリティポリシー |
| ログ | **トークンをサーバーログに出さない**（`console.log` に URL ごと出さない）。記録するのは `document_id` と「旧IDで開かれたか」だけ | ログは検証環境でも残る |

---

## 4. URL の互換

### 4-1. トークンをどこに載せるか

**決め: パスの資料ID部分をトークンに差し替えます。**
`/qsheet/audio/<32文字のトークン>` になり、**ルート定義（`App.tsx:48` の `/qsheet/audio/:id`）は1文字も変わりません。**

| 案 | 形 | 採否 |
| --- | --- | --- |
| **パス差し替え（採用）** | `/qsheet/audio/qX8_…` | 資料IDが URL に出ない。QR・ブラウザ履歴・スクリーンショット・`Referer` のどれにも資料IDが残らない。React Router のルート定義もサーバーの静的配信（`app.ts:130-143`）も変更不要 |
| クエリ | `/qsheet/audio/<資料ID>?t=qX8_…` | **不採用。** 資料IDが URL に残り続けるので、§2-1・§2-5 の「資料IDを知っていれば socket の room に入れる」が閉じない。加えて、クエリはコピペや転送で落ちやすく、落ちた URL は「トークン無しの旧URL」と見分けが付かない（＝失効の意味が半減する） |

**サーバー側は API パスも変えません。**
`GET /api/v1/internal/qsheet/documents/:key/public-audio` の `:key` が
**トークンでも旧資料IDでも受けられる**ようにします（解決の順序は下の 4-2）。
新しい API パスを作ると、**本番中に開きっぱなしのタブ**（30秒ごとに古いパスを叩き続ける）が
その場で 404 になります。`index.html` は `no-store` なので再読込すれば新しい JS を取りますが、
**本番中に再読込させる作りにはしません。**

### 4-2. どちらが来たかを間違いなく見分ける

資料IDは **uuid v4 の36文字（8-4-4-4-12）**、トークンは **base64url の32文字でハイフン無し**なので、
形だけで確実に分かれます。

```ts
const LEGACY_DOC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 1) LEGACY_DOC_ID に当たらなければ、トークンとしてだけ解決する
// 2) 当たったら「旧URL」として扱う (移行段階によって受けるか 410 か)
```

⚠️ **未確認**: 本番 DB に uuid 以外の形の資料IDが無いことは、手元からは確かめられません
（このセッションは本番へ直接アクセスできません）。**着手時に必ず次を実行してください。**

```sql
SELECT count(*) FROM qsheet_documents
 WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
-- 0 でなければ、その形を LEGACY_DOC_ID に足すか、旧IDの受け方を「DB に当てて確かめる」に変える
```

### 4-3. 配布済みの旧URLをいつ・どう止めるか

**3案を出して、①を推します。**

#### 移行案①（推奨）— 3段階で落とし、③の実施だけを利用者判断にする

| 段階 | 何をする | 旧URLを開いたとき | いつ |
| --- | --- | --- | --- |
| **①受け入れ＋記録** | 旧IDでも今までどおり開ける。ただし**「旧IDで開かれた」ことだけを記録する**（`document_id` と時刻。IPも UA も残さない） | 200（今までどおり） | この段の PR1 |
| **②予告** | 旧IDで開いたときだけ、画面の上に**細い帯**で「この URL は近く使えなくなります。新しい QR を配布元に頼んでください」を出す | 200 ＋ 予告 | PR2（①と同時でも可） |
| **③停止** | 旧IDを拒否する | **410 Gone** | **利用者が「もう配った分は無い」と言った日**、または①の記録が一定期間0件になった日 |

- **③の判断材料を①が作るのが要点です。** 今は「配布済みの QR が何枚あるか」を**誰も知りません**
  （配った記録がどこにも無い）。推測で止める日を決めるのではなく、
  **「旧IDでのアクセスが直近◯日で0件」を見てから止めます。**
  これは v4.1.6 で顧客・仕入先の legacy-ID に対してやったことと**同じ形**です（§2-6）。
- ③の切り替えは**コード内の定数1つ**（`ACCEPT_LEGACY_AUDIO_ID = false`）にして PR にします。
  環境変数にしない理由は、**本番と検証で値が食い違うと「検証では止まっているのに本番では開く」が起きる**うえ、
  いつ止めたかが版に残らないためです。

#### 移行案② — 即時停止（移行期間なし）

新しいトークンを発行した瞬間に旧IDを 410 にする。

- 良い点: いちばん安全。実装も最小（①②が要らない）
- 悪い点: **配布済みの QR が1枚でもあると、本番当日に音声さんの画面が「使えません」になります。**
  現場が止まるリスクを、記録が無い（＝何枚配ったか分からない）状態で取ることになります
- **利用者が「もう配ったものは無い」と明言した場合にだけ**、この案に切り替えてください（07 §5-2）

#### 移行案③ — 放送日で自動的に落とす

旧IDは `broadcast_date` が「今日−7日」以降の資料に限って受ける。

- 良い点: 人の判断も定数の書き換えも要らない。**終わった番組の QR から順に自然に死ぬ**
- 悪い点: **`broadcast_date` が空の台本がどれくらいあるか分かりません**（README §8 の 5 と同じ未確認事項）。
  空だと一律で落ちるか一律で通るかのどちらかになり、**どちらでも事故ります**
- 「本番の翌週には確実に閉じたい」という要望が出たときの**追加案**として残します（①の③段階と併用可）

### 4-4. 旧URLからの引っ越し導線

**旧URLを開いた人に、新しい URL を自動で渡すことはしません。**
渡してしまうと「資料IDを知っている人が新しいトークンを手に入れられる」ことになり、
トークン化の意味が消えます（**リダイレクトも `Location` ヘッダーも出さない**）。
配り直しは**人から人へ**（編集画面で新しい QR を出して渡す）です。

---

## 5. 画面

### 5-1. どこに置くか — 本番4画面は1ドットも触りません

発行・再発行・失効の UI は、**すべて編集画面の共有ダイアログ**
（`client-qsheet/src/components/editor/AudioShareDialog.tsx`）に入れます。

**編集画面は本番4画面ではありません**（07 §1 の表は 進行／ランダウン／プロンプター／公開音声 の4本）。
編集画面は v4 で作り直す対象（[`../06-editor.md`](../06-editor.md)）なので、
**「本番4画面の見た目を変えない」制約はこの UI を1つも縛りません。**
`npm run check:frozen`（凍結3アプリの CSS 検査）にも触れません。

### 5-2. ダイアログの中身（今の構造を保つ）

07 §1-1 が「そのまま」と指定した **QR 生成・URL コピー**（`:26-37` / `:39-57`）は形を変えません。
足すのは下の3つだけです。

```
音声サポート画面 共有 URL
────────────────────────────────
[ QR 256px ]                     ← 今のまま (:71-77)
[ https://…/qsheet/audio/qX8_… ] [コピー]   ← 今のまま (:80-99)
「新しいタブで開く」                ← 今のまま (:101-109)
────────────────────────────────
＋ この URL を作った人 / 作った日            ← 追加 (created_by, created_at)
＋ [ 新しい URL にする ]                     ← 追加 (再発行)
＋ [ この URL を失効させる ]                 ← 追加 (失効・危険色)
────────────────────────────────
※ シナリオ本文や放送日は返却されません。…  ← 文言を差し替え (:112-115)
```

- **開いたときに有効なトークンが1本も無ければ、その場で1本発行する。**
  `studio.routes.ts:26-36` の `getOrCreateFeedToken()` と同じ形です。
  「発行ボタンを押させてから QR を出す」にすると、**今まで開けば即 QR が出ていたのが1手増えます**。
- **「新しい URL にする」＝ 発行してから直前のものを失効**（1つの API 呼び出しの中で）。
  押した瞬間に QR が差し替わり、**古い QR はその場で死にます**。確認ダイアログを出します。
- **「この URL を失効させる」は取り消せない**ので、確認ダイアログを出します（07 §4-1 の決め）。
  失効後は QR を消し、「失効しました。新しい URL を発行できます」＋発行ボタンだけを出します。
- 注意書き（`:112-115`）は**事実に合わせて書き直します。**
  今の文は「再生成する仕組みは現在ありません」と、これから作るものと正反対のことを書いています。
- スマホ（375px）で QR とボタン3つが縦に積まれること。ボタンは 44px 以上（`CLAUDE.md` UI/UX ポリシー）。

### 5-3. 「同時に生きているのは1本」にする（第1版）

表は複数行を持てますが、**画面には1本しか出しません**（§3-2）。
`label`（「8/6 本番用」）を人に入れさせる UI も第1版では出しません。
理由は、**失効の意味が「今配ってあるやつが死ぬ」で一意になる**からです。
複数本を並べた瞬間、「どれを止めればいいのか」を現場が判断することになります。

### 5-4. 公開画面（`AudioSupportPage`）は文言の出し分けだけ

**見た目・配色・ポーリング間隔・差分5色には触りません。**
既にあるエラー画面（`AudioSupportPage.tsx:385-394`）に**分岐を1つ足すだけ**です。

| 状態 | 出すもの |
| --- | --- |
| 410（失効） | 「**この URL は使えなくなりました**／配布元に新しい QR をもらってください」 |
| 404（資料が無い・削除済み） | 今の文のまま |
| その他 | 今の文のまま |

- **404 と 410 を混ぜない**理由: 404 だと「URL を打ち間違えた」に見えて、現場が本番中に URL を探し続けます
  （`docs/ia.md:79` に書かれている判断で、これは今でも正しい。ただし同じ行が
  「実装済み」であるかのように書かれているので、文言はこの段で直します。§10-2）。
- 今の文言「ドキュメントが存在しないか、**共有が解除されている可能性があります**」（`:390`）は、
  失効機能が消えたときに取り残された文です。分岐を入れて実態に合わせます。
- ⚠️ **接続断トースト（`lib/notify.ts` 経由）を帯（`NoticeBar`）に変えないこと**（07 §1-1・01 §9-13）。
  ここで足すのは**読み込み失敗の画面**であって、放送中に出るものではありません。

---

## 6. 個人情報の絞り込み

### 6-1. `masters.persons` / `micTypes`

**07 §4-2 の決めどおり「その台本のマイク香盤に実際に出てくる名前だけ」に絞ります。**

```ts
// public-audio.routes.ts の payload を組む直前
const usedPersons  = new Set<string>();
const usedMicTypes = new Set<string>();
for (const sec of sections)
  for (const r of sec.rows)
    for (const cell of Object.values(r.cells))
      for (const a of cell.assignments) {
        if (a.person)  usedPersons.add(a.person);
        if (a.micType) usedMicTypes.add(a.micType);
      }
// masters: { persons: [...usedPersons], micTypes: [...usedMicTypes], micChannels }
```

- **画面は今この2つを1度も読んでいません**（§2-4）。したがって**この変更で画面は1ドットも変わりません。**
- 「読んでいないなら丸ごと消す」ではなく**絞って残す**のは、07 §4-2 の決めに合わせるためと、
  キーを消すと `AudioSupportPage.tsx:42-43` の型と実体がずれるためです（型も同時に直すなら消してもよい）。
- **`micChannels` は絞れません**（画面が使う: `:340-341`）。`label` に「社長」「MC」のような
  役職や個人名が入り得ることは**注意書きに残します**（ここは絞ると画面が壊れます）。

### 6-2. 03 §7-6 との整合

[`../03-excel.md`](../03-excel.md) §7-6 は「Excel 取込での自動追加は `video` / `audio` / `telop` の3種だけ、
`persons` / `micTypes` は dry_run の明示チェック（既定オフ）」と決めています。**これと矛盾しません。**

| 層 | 決め | 担当 |
| --- | --- | --- |
| **入る側**（Excel から `masters` に名前を足す） | 3種に限定・`persons`/`micTypes` は既定で足さない | 段6（03） |
| **出る側**（公開URLが返す） | 香盤に実際に出てくる名前だけ | **この段（段2）** |

**出る側を先に直します。** 入る側（段6）はまだ実装されておらず、
「入る側さえ絞れば出る側は要らない」ではありません — **人が編集画面のマスタータブで手入力した名前**
（`EditorSidebar.tsx:546-568`）は今でも全部漏れているからです。

### 6-3. ⚠️ いちばん大きい漏れは Socket.IO のほう（07 に無い）

§2-5 のとおり、**公開URLを持つ人は `doc:<資料ID>` の room に入り、
`yjs:update`（台本の編集差分）・`awareness:update`・`presence:sync`（在席者の氏名）を受け取れます。**
`masters.persons` を絞っても、**ここが開いている限り「シナリオ本文は返しません」は守れていません。**

**決め: room を2つに分けます。**

| room | 誰が入るか | 流すもの |
| --- | --- | --- |
| `doc:<id>` | 今までどおり全員（匿名含む） | `cue:*` **だけ** |
| `doc:<id>:members` | `canAccess` が真のソケット**だけ**（`socket.ts:77` の判定の直後に join） | `yjs:update` / `awareness:update` / `presence:sync` |

- 変えるのは `socket.ts:84, 87, 94, 123, 131` の**発信先を `room` から `memberRoom` に差し替えるだけ**です。
  `cue:*` の5本（`:135-168`）は**1文字も触りません**（07 §1-1「そのまま」）。
- **クライアントの変更は要りません**（join はサーバー側で行うため）。
- 影響を受ける画面は **編集画面だけ**です。`yjs:*` と `presence:*` を使うのは
  `EditorPage.tsx:444-455` と `lib/collab/useCollabDoc.ts:77` の2か所だけで、
  **進行・ランダウン・プロンプター・公開音声は `cue:*` しか使っていません**（grep で確認）。
- `presence:query`（`:92-95`）も `canAccess` が偽なら**空配列を返す**ようにします。
  今は匿名でも emit でき、在席者の氏名が返ります。

**これをやらないと、この段の目的（配った URL の届く範囲を人が決められるようにする）が達成できません。**
別 PR に切ってもよい（§8）が、**トークン化と同じリリースに載せてください。**

### 6-4. あわせて足すもの

- **`X-Robots-Tag: noindex, nofollow` と `Cache-Control: no-store`** は既にあります（`:102-103`）。**そのまま。**
- **`express-rate-limit` をこの1本に付けます**（例: 同一IPから 60回/分）。
  総当たりが現実的だからではなく（192bit）、**このルートは資料の `data`（JSONB 全体）を毎回読んで組み立てる**ので、
  URL が外に出たときに**DB の負荷が本番中に上がる**ことを避けるためです。前例は `mcp/index.ts:12`。

---

## 7. 検証手順

**`npm run verify:up` で使い捨て Postgres（ポート5433・本番と完全分離）を立ててから回します。**

### 7-1. DB

1. `npm run verify:up` → `212_qsheet_audio_share.sql` が適用され、`_migrations` に行が入ること
2. **もう一度流しても落ちないこと**（`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` の冪等性）
3. `\d qsheet_audio_shares` で **PK が `token`**、`document_id` に FK、部分索引が付いていること
4. 資料を消したら（物理削除）トークンの行も消えること（`ON DELETE CASCADE`）

### 7-2. サーバー（実 Postgres・`x-user-id` ヘッダーで認証）

| # | やること | 期待 |
| --- | --- | --- |
| 1 | 発行 API を2回叩く | **2回とも違うトークン**が返る。32文字・`[A-Za-z0-9_-]` のみ |
| 2 | `GET /qsheet/documents/<トークン>/public-audio` | **200**。`last_seen_at` が更新される |
| 3 | 失効 → 同じ URL | **410**（404 ではない） |
| 4 | でたらめなトークン | **404**（「失効した」と「存在しない」を**外から区別させない**） |
| 5 | 旧資料ID（段階①） | **200** ＋ 旧IDで開かれた記録が1件増える |
| 6 | 旧資料ID（段階③・定数を false） | **410** |
| 7 | 権限なしのユーザーで発行 API | **403**（発行は `qsheet` の editor 以上＋その資料にアクセスできる人。`documents.routes.ts:287-296` の共有設定と同じ判定にする） |
| 8 | 認証なしで発行 API | **401** |
| 9 | 200 のペイロード | `masters.persons` に**香盤に出てこない名前が1つも無い**こと。`micTypes` も同様 |
| 10 | 200 のペイロード | `broadcast_date` / `episode_code` / シナリオ本文が**含まれない**こと（今の約束の再確認） |
| 11 | レート制限 | 61回目が 429 |

### 7-3. Socket.IO（§6-3 をやる場合）

12. トークンで接続 → **`cue:sync` は届く**
13. 同じ接続で **`yjs:update` / `awareness:update` / `presence:sync` が1度も届かない**
14. 認証済みで編集画面から接続 → **13 の3つが今までどおり届く**（＝共同編集が壊れていない）
15. `presence:query` を匿名で emit → **空配列**

### 7-4. 画面

16. 編集画面 → 音声共有 → **QR が今までどおり即出る**（有効なトークンが無ければ自動発行）
17. 「新しい URL にする」→ QR とテキストが**その場で変わる**。前の URL を開くと 410 の画面
18. 「失効させる」→ 確認 → QR が消え、発行ボタンだけになる
19. 公開画面: 失効した URL で「この URL は使えなくなりました」、存在しない資料で今までどおりの文
20. **375px** で QR・URL 欄・ボタン3つが崩れず、横スクロールが出ないこと（`npm run verify:ui`）
21. **`npm run check:frozen`**（`build:all` のあと）— 凍結アプリの CSS が変わっていないこと

### 7-5. gate

22. `npm run typecheck` / `npm run lint` / `npm run test`
23. **静的検査を1本足す**（`shared/tests/` に置く。前例: `sqlPlaceholder.test.ts` / `falseOkChecks.test.ts`）
    — 「`public-audio.routes.ts` が `masters.persons` を素通しで返していないこと」を見る。
    ここは**将来また素通しに戻りやすい場所**（型が `string[]` のままなので型検査では捕まらない）です。

---

## 8. PR の切り方

**3本に切ります。** 1本にすると、socket の変更と公開ルートの変更が同じ差分に混ざり、
本番中に効く箇所のレビューが薄くなります。

| PR | 中身 | 枝名（案） |
| --- | --- | --- |
| **PR1** | migration 212 ＋ 発行/失効/解決の API ＋ 公開ペイロードの絞り込み ＋ 旧IDの記録（段階①）＋ レート制限 ＋ **`docs/ia.md:79` の文言の訂正**（§10-2） | `feature/<Issue>-audio-share-token` |
| **PR2** | 共有ダイアログ（発行・再発行・失効）＋ 公開画面の 410 の文言 ＋ 旧URLの予告帯（段階②） | `feature/<Issue>-audio-share-ui` |
| **PR3** | Socket.IO の room 分離（§6-3） | `fix/<Issue>-qsheet-socket-room-split` |

- **PR3 は PR1 と独立に出せます**（順序の依存なし）。ただし**同じリリースに載せてください**。
- PR タイトルは `種類(アプリ): 何をしたか`（`docs/branching.md`）。
  例: `feat(qsheet): 公開音声サポートのURLを失効できるようにした`
- ⚠️ **PR を出したらその場で `.claude/skills/pr-watch` で見張る**（`CLAUDE.md` の必須事項）。
- ⚠️ **版の3か所（`package.json` / `CLAUDE.md` / `README.md`）は触らない。**

### changelog.d の1文案

`docs/changelog.d/<枝の名前>.md`（PR1・PR2 は同じファイルに書き足してよい）:

```markdown
**配った音声サポートの公開URLを取り消せるようにした**。公開URL
（`/qsheet/audio/…`）は**資料IDを知っていれば誰でも開けて、配ったあとに止める手段が
1つもありませんでした**（失効の列は migration 209 で消えており、それを読むコードも
1行も残っていなかった）。本番当日に QR で配るものなので、番組が終わってからも
開き続けられる状態でした。URL に載せるものを資料IDから**推測できないトークン**
(192bit) に変え、編集画面の共有ダイアログから**再発行と失効**をできるようにした。
失効した URL は **410** を返す（404 だと「URLを打ち間違えた」に見えて現場が本番中に
探し続けるため）。**配布済みの旧URLは当面そのまま開けます** — いつ止めるかを決める
材料が無かったので、まず「旧IDで開かれた」ことだけを記録するようにした。
あわせて、公開URLから見えていた個人名を**その台本のマイク香盤に実際に出てくる名前
だけ**に絞り、Socket.IO の room を分けて**台本の編集差分と在席者の氏名が公開URLの
持ち主に届いていたのを止めた**（`cue:*` の中継は1文字も変えていない）。
検証: 実 Postgres で 15 項目 / 375px の画面確認 / `npm run typecheck` `lint` `test` OK。
```

---

## 9. 未決・要確認

### 9-1. 利用者の判断待ち（README §4 の確認11）

| 確認 | 判断待ちでも**進められる** | 判断が要るまで**止まる** |
| --- | --- | --- |
| **配布済みの旧URLをいつ止めるか**（07 §5-2） | §4-3 の**段階①②が全部**（トークン発行・失効・記録・予告帯・個人名の絞り込み・room 分離）。つまり **PR1〜PR3 は全部出せます** | **段階③（旧IDを 410 にする）だけ**。定数1つを反転する PR なので、判断が出た日に1時間で出せます |
| **公開音声にログインを掛けるか**（07 §5-3） | 無認証のまま進める（今の設計どおり） | 掛けるなら**この段ごと作り直し**（トークンではなく招待になる）。着手前に潰しておきたい |

→ **「いつ止めるか」が決まらなくても、この段は最後まで実装できます。**
むしろ①の記録が無いと判断材料が作れないので、**先に作るのが正しい順序**です。

### 9-2. 着手時に手を動かして確かめること

1. **本番の `qsheet_documents.id` が全部 uuid v4 の形か**（§4-2 の SQL）。**未確認**（本番に直接アクセスできないため）
2. **配布済みの QR がどれくらいあるか**。**記録がどこにも無いので分かりません。**
   §4-3 案①の①段階が、これを初めて数えられるようにします
3. **`AudioShareDialog` を実際に使っているか**（`audio_mic` ブロックを持つ資料が本番に何本あるか）。
   0本なら移行案②（即時停止）を選べます

### 9-3. この段では決めていないこと

- **`label`（「8/6 本番用」）を人に入力させるか。** 第1版は出しません（§5-3）。列だけ先に用意します
- **`last_seen_at` を画面に出すか。** 第1版は出しません（「まだ誰も開いていない URL を配った」と
  分かると便利ですが、**人数を数える方向に育つと監視になります**。07 §4-1 が「人数は数えない」と決めています）
- **本番中に room へ入り直したときの現在位置。** 今も昔も、
  途中から開いた画面は**次に cue が動くまで先頭を出します**（`cue:*` は状態を配らないため）。
  この段では直しません（`cue:query` を足すと本番4画面の socket 契約が変わり、
  07 §3-2 の `run_id` の配り方と設計がぶつかります）。**段1・段2 のあとで一緒に見るのが良い**と考えます
- **旧URLの記録をどこに出すか。** サーバーログに出すだけ（`document_id` と時刻）にします。
  表を作ると「見る画面」が要るようになり、この段の範囲を超えます

---

## 10. 設計書との食い違い

**6件見つけました。重い順に並べます。**

### 10-1. ⚠️ トークン化すると **cue 同期が黙って止まります**（07 §4-1 に記述なし）

07 §4-1 は「URL は `/qsheet/audio/:token`（`documentId` を直接載せない）」とだけ書いています。
しかし**公開画面は URL の値をそのまま Socket.IO の room 名に使っています**
（`AudioSupportPage.tsx:308` → `lib/socket.ts:29` の `query: { docId }` → `socket.ts:49-56` の `doc:<docId>`）。

**このまま `:id` をトークンに差し替えると、公開画面は `doc:<トークン>` という
誰もいない room に入り、`cue:sync` が1つも届かなくなります。**
HTTP の 30秒ポーリングは効いたままなので**画面は正常に見え**、
**「進行に追従しなくなったこと」に本番中まで気づけません。**

**必要な追加作業**（設計書に無いぶん）:

- クライアント: `lib/socket.ts` に `query: { shareToken }` で繋ぐ経路を足す
  （`getQsheetSocket(docId)` は**そのまま残す** — 本番4画面が使っています）
- サーバー: `socket.ts` の接続ハンドラで `shareToken` を資料IDへ解決してから join する。
  ⚠️ **`docId` で来た経路のコードは1文字も変えないこと**（`:48-56` の同期 join は
  「接続直後の `yjs:sync` を取りこぼさないため同期関数にしてある」という**踏んだ実績のある**理由付きです）。
  `shareToken` の枝でだけ非同期に join し、`disconnect` ハンドラ（`:170-179`）が
  参照している `docId` を `socket.data.docId ?? docId` に読み替えます
- **代案**（小さい）: 公開ペイロードに `room`（＝資料ID）を返して画面がそれで繋ぐ。
  ただし**§6-3 の room 分離が前提**です。分離しないと、資料IDを知った時点で
  台本の編集差分が読めてしまい、トークン化の意味が消えます

### 10-2. 「失効カラムが DROP 済み」は**過小評価**。機能が丸ごと消えている

07 §4-1・02 §9-4・03 §7-6 はいずれも「migration 209 で列が DROP された」と書いています。**列の話は事実です。**
しかし実際には:

- `audio_share` に触れる migration は **209 の DROP 以外に1本も存在しません**
- 失効を**読む**コードも**書く**コードも、サーバー・クライアントの**どこにも1行もありません**（grep で0件）
- `docs/version-history.md` の v2.9.267 は「**migration 139** で追加し、410 を返すところまで作った」と
  書いていますが、`139_pricing_audit_columns.sql` は**まったく別の中身**です（採番がぶつかって消えたと見られます）
- 残骸が3か所に残っています:
  `AudioShareDialog.tsx:112-115`「再生成する仕組みは現在ありません」（**新しい方が正しい**）、
  `AudioSupportPage.tsx:390`「共有が解除されている可能性があります」（**存在しない機能を前提にした文**）、
  そして **`docs/ia.md:79`** — 「配布URLの無効化 ｜ `qsheet_documents.audio_share_revoked_at`。
  止めると公開GETが **410 Gone** を返す」と、**今も実装されているかのように書かれたまま**です。
  **この段の PR で `docs/ia.md:79` も直してください**（410 と 404 を分ける判断そのものは
  今でも正しいので、§5-4 はこの行を引き継いでいます）

→ **「列を戻せば済む」ではありません。**表・API・画面・文言の4点をゼロから作ります（§3〜§5）。
また、**これは採番の衝突で機能が消えた実例**なので、§3-1 の「PR 直前に番号を見直す」は形式ではなく実害の予防です。

### 10-3. ⚠️ 公開URLから漏れているのは `masters.persons` だけではない（07 §4-2 の範囲不足）

07 §4-2 は HTTP のペイロードだけを見ています。
**Socket.IO の room に匿名で入れるので、台本の編集差分（`yjs:update`）・
選択位置（`awareness:update`）・在席している社内ユーザーの氏名（`presence:sync`）が
公開URLの持ち主に届きます**（§2-5 に行番号付きで整理）。

「シナリオ本文・`broadcast_date`・`episode_code` は意図的に含めない」というコメント
（`public-audio.routes.ts:44-45`）と、ダイアログの注意書き（`AudioShareDialog.tsx:113`）は、
**HTTP についてだけ正しく、実際には守れていません。**
→ §6-3 で room を2つに分ける案を出しました。**この段に入れることを強く推します。**

### 10-4. migration の採番が README §6 と実際で1つずれている

- README §6 は「現在の最大が **210** の前提」で 211〜217 を割り当てています
- 実際の最大は **`211_drop_techsheet_schema.sql`** です
- さらに、02（スケジュール表）の付録は自分の migration を **`211_qsheet_schedule.sql`** と書いており、
  README §6 の表（213）と**同じ設計群の中で食い違っています**

→ README §6 の但し書き（「着手時に実測して振り直す」）が**既に必要になっている**状態です。
この段は **212** を取りますが、**PR 直前に必ず実測してください**（§3-1）。

### 10-5. 「`masters.persons` を全件返す」の「全件」は全社の名簿ではない

03 §7-6 と 07 §4-2 の書き方（「`masters.persons` をそのまま全件返します」）は、
**全社の人名マスターが漏れる**ようにも読めます。実際は
**`qsheet_documents.data.masters` — その資料の中のリスト**です（`qsheet_masters` のような表は存在しません）。
漏れる範囲は「**その台本のマスター欄に登録された名前ぜんぶ**」で、
**Excel 取込の自動追加（03 §7-6）が入ると、その台本に取り込んだ Excel の全人名に広がる**、が正確な言い方です。
危険度が下がるわけではありませんが、**対策の置き場所が「資料ごと」で足りる**ことが分かるので、
文言を直しておく価値があります。

### 10-6. `public-audio.routes.ts` の型注釈が実際の列型と違う（小・この段では直さない）

`public-audio.routes.ts:17` は `deleted_at: Date | null` と宣言していますが、
`qsheet_documents.deleted_at` は **`TEXT`** です（`012_qsheet_schema.sql:25`）。
`if (!row || row.deleted_at)` の真偽判定は文字列でも正しく動くので**実害はありません**。
直すと `qsheet` の他ルートの型も揃えたくなるので、**この段では触りません**（棚卸しに残す）。
