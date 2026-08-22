# 計時・視聴者 軽量統合（バンドル分離のまま）— ミニアプリ導線・命名だけを揃える設計

> **2026-08-22 作成。**
>
> [`09-live-timer.md`](09-live-timer.md) は計時LIVE（`client-live/`・`/live/`）を制作技術支援の
> **ミニアプリとして完全に作り直す**設計でした。実装（PR1〜7）はそのうち PR1〜6
> （視聴者取得のサーバー移行・しきい値UI・表示画面のv4化・凍結解除）までは完了しましたが、
> **PR7 は §12-11 の判断でスコープを絞り、「導線・改称」は手を付けずに終わっています**
> （[`impl/09-live-timer-impl.md` §12-11](impl/09-live-timer-impl.md#12-11-pr5〜7着手時の追記2026-08-22利用者から凍結解除が進んでいると思っていたの指摘を受けて着手)）。
>
> **この文書はその積み残し3点（レジストリ登録・ハブ導線・改称）だけを対象にします。**
> セッション一覧の廃止・`/live/program/:id` → `/live/` への URL 再設計・案件からの
> `liveops_programs` 自動プロビジョニングといった **09 本体の大改修はやりません**
> （09 §2 のうち、この文書が触るのは名前と導線だけです）。
>
> ⚠️ **PR7 が見送った理由のうち1つはもう成立しません。** §12-11 が挙げた
> 「制作技術支援自身もまだ共通シェルに載せ替えていない」は、その後の PR で解消済みです
> （`client-qsheet/CLAUDE.md` 「共通シェル（`shared/src/client/shell/`）への載せ替え」）。
> **もう1つの理由——`client-live` が独立バンドルであること——は、依然として事実です。**
> この文書はその事実を前提として受け入れ、**別バンドルのまま**軽く繋ぐ設計を出します。
>
> ⚠️ **完全統合（09本体）とは別の選択肢です。** どちらを採るかの判断材料として
> §6 にトレードオフを書きました。この文書は「今すぐ軽く繋ぐならこう作る」の設計であって、
> 「これで09本体は不要になる」という意味ではありません。

---

## 0. 決めたこと

1. **バンドルは分離したまま。** `/live/*` の URL は 1 文字も変えません
   （09 §0-3 をそのまま維持。表示画面 `/live/display/:timerId` にも一切触れません）。
2. **`MiniAppDef` に `kind: 'external'` を新設**し、計時・視聴者をこの種別で登録します。
   「別バンドルへの通常遷移である」ことを型で明示します（§1）。
3. **ヘッダーの `MiniAppSwitcher` に計時・視聴者を追加**します。ただし遷移は
   ページ全体の読み直しを伴うため、**体感を完全には消せません**。効く手段だけを正直に書きます（§2）。
4. **`JourneyPage` の `MiniAppTiles` にタイルを追加**します。ただし
   **`scope === 'project'` のときだけ**出します（`scope === 'program'` では出せない理由は §4）。
5. **改称は表示名（`label`）だけ。** ディレクトリ名・ベースパス・権限モジュール名・DB のテーブル名/
   Socket 名前空間・`localStorage` キーといった内部識別子は一切変えません（§3）。
6. **DB スキーマは 1 バイトも変えません。** 案件 ↔ `liveops_programs` の橋渡しは、
   **既にある** `liveops_programs.project_id` と一意インデックス（migration 221・実装済み）
   だけで足ります（§4）。
7. Owner の解決（案件→セッション）は、**新設する API ルート1本**（コードのみ・migration 無し）で
   「取得または作成」をアトミックに行います。呼び出しは `client-live` 側の新設ページに寄せます（§4）。
8. 権限区画は **`liveops` のまま**（09 §0-6 を継承。増やしません）。
9. PR は **3 分割**します（型・橋渡し／導線／改称）。導線は橋渡しに依存するため、この順で出します（§5）。
10. `scope === 'program'`（qsheet 自身のマニュアル番組）への計時・視聴者の紐付けは
    **この設計の範囲では解決しません。** 代わりに既存の `/live/` からの
    スタンドアロン作成が抜け道として残っていることを明記します（§6）。

---

## 1. `MiniAppDef` / `MiniAppKind` の拡張案

### 1-1. 今の型が表せないもの

`shared/src/production/miniapps.ts` の `MiniAppDef` は現在
`kind: 'document' | 'panel'` の判別可能 union です。どちらも**同一バンドル内の URL**
（`client-qsheet` の React Router が受け持つパス）を前提にしています。
`docPathOf` / `panelPathOf` はいずれも文字列置換だけの純関数で、I/O を持ちません。

計時・視聴者はこの前提を破ります：

- 遷移先が**別の Vite バンドル**（`client-live`・`base: '/live/'`）
- `<Link to>`（react-router-dom）で飛んでも**qsheet 側のルーターには一致する route が無く、
  何も起きません**（内部遷移として飲み込まれて404にすらならない）。**通常の `<a href>` /
  `window.location.assign` による本物のブラウザナビゲーションが要ります**

### 1-2. 型の拡張

```
export type MiniAppKind = 'document' | 'panel' | 'external';

export interface MiniAppExternalDef extends MiniAppBase {
  kind: 'external';
  /** true 固定。「同一バンドル内の遷移ではない」ことを型で保証する（意図しない <Link> 誤用を防ぐ） */
  crossBundle: true;
  /** 遷移先 URL のひな形。:ownerId を置換する。別バンドルの絶対パスであること（例 '/live/open?project=:ownerId'） */
  path: string;
  /** このミニアプリが受け付けられる owner の種類。今回は 'project' のみ（§4） */
  supportedOwnerKinds: readonly ('project')[];
}

export type MiniAppDef = MiniAppDocumentDef | MiniAppPanelDef | MiniAppExternalDef;
```

- `crossBundle: true` は値として意味を持たせるためではなく、**呼び出し側のコンポーネントが
  「この kind は `<a>` でなければならない」と型で強制するためのフラグ**です
  （§1-4 の `ExternalMiniAppLink` 参照）
- `MiniAppKey` に **`'liveops'`** を追加します。`apps.ts` の `AppKey` にも同名の `'liveops'`
  がありますが、**型としては別物**（別ファイル・別 union）です。あえて同じ文字列を選ぶのは、
  「このミニアプリはトップレベルアプリ `liveops` と1:1対応する」ことがコード上も読み取れるようにするためです
  （`sheet`/`schedule`/`recording`/`streaming`/`rental` はどれも `qsheet` 単独の内部区分なので
  この対応関係を持ちません）。**`MiniAppKey` は「あとから変えない」安定キー**（同ファイル冒頭コメント）
  なので、この文字列選択は着手前に確定させ、実装後に変えないこと

```
{
  kind: 'external',
  key: 'liveops',
  label: '計時・視聴者',
  crossBundle: true,
  path: '/live/open?project=:ownerId',
  supportedOwnerKinds: ['project'],
  enabled: true,
}
```

### 1-3. 既存ヘルパーへの影響

| ヘルパー | 今の動作 | `kind: 'external'` を足すと |
| --- | --- | --- |
| `docPathOf` | `kind !== 'document'` なら throw | 変更不要（`external` は元から弾かれる） |
| `panelPathOf` | `kind !== 'panel'` なら throw | 変更不要 |
| `miniAppOfPath` | **全 `MiniAppDef` を候補にして URL の前方一致で逆引き** | ⚠️ **`kind === 'external'` は候補から除外すること。** この関数は「qsheet 自身の URL からミニアプリを判定する」ためのもので、`/live/*` という pathname が qsheet 側のルーターに渡ってくることは構造上ありません（別バンドルなので、そもそも qsheet の JS が動いていない）。除外しないと、`/live` で始まる何らかの内部パスと**誤って一致する事故**が理論上あり得ます |
| `enabledMiniApps` | `enabled: true` を返す（「＋新しく作る」等が使う） | `kind: 'external'` にも `docPrefix`/`table` は無いので、呼び出し側は **`kind === 'panel'` を除外しているのと同じ書き方で `kind === 'external'` も除外**すること（新規作成の概念が無いため） |
| 新設: `externalPathOf(key, ownerId)` | — | `panelPathOf` と同じ形（`:ownerId` を置換するだけの純関数）。**I/O は持たせません**（§4 の「取得または作成」はこの関数の外、遷移先ページ側でやります） |

### 1-4. 誤用を防ぐ小さな部品

`<Link>` と `<a>` はどちらも見た目が同じリンクに見えるため、レビューだけでは
`kind: 'external'` に `<Link to>` を使う誤りに気づきにくい。**型で塞ぎます**。

```
function ExternalMiniAppLink(props: { def: MiniAppExternalDef; ownerId: string; children: React.ReactNode }) {
  // <a href={...}> だけを返す。<Link> を書く余地を無くす。
}
```

`MiniAppTiles` / `MiniAppSwitcher` の側は、`kind` で分岐して
`document`/`panel` は今まで通り `<Link>`、`external` はこの部品を使う形にします。

### 1-5. サーバー側ミラーへの反映

`server/src/shared/production/miniapps.ts` は
`scripts/check-collab-parity.mjs` が client 側とのコード一致を検査する複製です
（コメントの差は許容・実装が1行でも違えば止まる）。**`kind: 'external'` の型・
`MINI_APPS` への1件追加は両方に同時に入れること。** サーバー側は `crossBundle`/`path` を
MCP のミニアプリ一覧などで読む可能性がありますが、**遷移や画面遷移のロジックは持ちません**
（サーバーはナビゲーションしないため）。

---

## 2. `MiniAppSwitcher` に足すときの「白い一瞬」をどう扱うか

### 2-1. 何が起きるか（前提の確認）

`client-qsheet` と `client-live` は別の Vite バンドルで、`server/src/app.ts` が
別々の SPA を配っています（[`impl/09-live-timer-impl.md` §12-8](impl/09-live-timer-impl.md#12-8-制作資料のミニアプリだが別バンドルである)）。
`MiniAppSwitcher` から計時・視聴者を選ぶと、**ブラウザの通常のページ遷移**が起きます：
現在の React ツリーが破棄され（Socket.IO 接続も切れます）、新しい HTML/JS が取得され、
`client-live` の React が再マウントされます。**これは "SPA 内遷移" ではなく "別ページへの移動" です。**

⚠️ **完全に消すことはできません。** 以下は「何が効いて、何が効かないか」を正直に書きます。

### 2-2. 効くもの・効かないもの

| 手段 | 何に効くか | 効かないもの・限界 |
| --- | --- | --- |
| **同一オリジンであること**（`/live/` も `/qsheet/` も同じホスト・同じサーバー） | DNS 解決・TLS ハンドシェイクの追加コストが**そもそも発生しない**（真のクロスオリジン遷移より軽い）。Cookie/JWT もそのまま使えるため**再ログイン画面が挟まりません** | HTML/JS の取得自体は必要（キャッシュが無ければ発生する待ち時間） |
| `<link rel="prefetch" href="/live/">`（または対象チャンクへの `modulepreload`） | ホバー時などに事前に投げておけば、**実際のクリック時にネットワーク取得を待たずに済む**確率が上がる | ブラウザの実装依存（必ず prefetch されるとは限らない）。**画面が一瞬白くなる遷移そのものは消えない**（ドキュメントのアンロード〜新ドキュメントの初回描画の間は、prefetch していても発生する） |
| **Speculation Rules API**（`<script type="speculationrules">` の `prerender`） | Chromium 系（Chrome/Edge）では、ホバーや `pointerdown` をトリガに**対象ページをバックグラウンドで実際にロード・描画まで済ませておける**。当たれば体感は SPA 内遷移に近づく | **Safari・Firefox は非対応**（2026-08時点）。同一オリジンなので実行はできるが、**副作用のある処理を実行してしまう危険がある**（§2-3） |
| 遷移直前にスケルトンを出す（クリック直後、`window.location.assign` を呼ぶ前の1フレーム） | クリックしてから実際にアンロードが始まるまでの**ごく短い間だけ**「反応した感」を出せる | 効果は数十ms 単位。**ドキュメント遷移中の空白そのものには効きません**（それはブラウザのネイティブな遷移描画で、アプリ側のJSが制御できる領域の外） |

### 2-3. Speculation Rules を使う場合の落とし穴（重要）

`prerender` は対象ページを**実際に読み込んで JS を実行**します。もし `/live/open?project=:id`
（§4 の橋渡しページ）が**マウントと同時に「取得または作成」の POST を叩く**実装だと、
**ユーザーがただホバーしただけで `liveops_programs` の行が作られてしまいます**
（クリックして遷移を確定させていないのに、です）。

**対処**: `/live/open` 側は、`document.prerendering`（Page Lifecycle API）を見て、
**プリレンダー中は API 呼び出しを保留し、`prerenderingchange` イベントで実際に
activate されてから初めて「取得または作成」を呼ぶ**実装にすること。これをやらないなら、
**`prerender` は使わず `prefetch`（副作用の無い静的アセットの前倒し取得だけ）に留める**のが安全です。

### 2-4. 結論

**「白い一瞬」を完全には消せません。** 効くのは
「同一オリジンなので接続コストが無い」「prefetch でアセット取得を前倒しできる」
「Chromium 系なら Speculation Rules で体感をかなり縮められる（副作用対策とセットで）」の3つで、
**Safari/Firefox では最後の手段が使えないため、それらでは 1〜2 秒の空白が残る**と利用者に伝えること。
これは 09 本体（完全統合）を選ばない限り解決しない構造的な制約です（§6）。

⚠️ **`MiniAppSwitcher` は今 `RecordingPage`/`StreamingPage` の2画面にしか出ていません。**
計時・視聴者を足すこと自体はこの2画面への変更で足りますが、
**「進行台本・スケジュール表の画面にもスイッチャーを出すか」は今回の変更範囲外**
（既存のまま・スコープを広げない）。

---

## 3. 改称・導線整理の実施範囲

### 3-1. 変えるもの（表示名だけ）

| 変えるもの | 今 | これから |
| --- | --- | --- |
| `shared/src/client/apps.ts` の `label` | `'計時LIVE'` | `'計時・視聴者'` |
| ルート `CLAUDE.md` のブロックアプリ一覧表の「概要」欄 | 「計時LIVE」表記 | 「計時・視聴者」に合わせる（制作技術支援の改称時と同じ扱い） |
| `client-live/CLAUDE.md` の見出し・本文中の固有名詞としての「計時LIVE」 | — | 「計時・視聴者」に合わせる（README的な説明文のみ。技術的な識別子は§3-2） |
| `docs/wording.md` | 未記載 | 「計時LIVE → 計時・視聴者」を追記（09 §7-7 が既に指摘済みの積み残し） |
| 画面内の表示文言（もし「計時LIVE」という固有名詞を直接表示している箇所があれば） | — | 洗い出して「計時・視聴者」に。**`MINI_APP_BY_KEY[key].label` から読む箇所は自動で追随するので触らない**（`MiniAppSwitcher.tsx` のコメント「ラベルはレジストリから読む。ここに文字列を書き写さない」と同じ設計） |

### 3-2. 変えないもの（内部識別子）

⚠️ **表示名だけを変え、以下は一切変えません。** 変えると壊れるものが多いためです。

| 識別子 | 値 | 変えない理由 |
| --- | --- | --- |
| ディレクトリ名 | `client-live/` | npm workspace 名・CI・Docker のビルドステージ名が参照 |
| ベースパス | `/live/` | 09 §0-3・配布済み URL |
| `permissionModule` / 権限区画 | `'liveops'` | migration 210 で統合済みの7区画（09 §0-6） |
| DB のテーブル名 | `liveops_programs` / `liveops_timers` / `liveops_snapshots` 等 | 09 §4 が既に「変えない」と決定済み |
| Socket.IO 名前空間 | `/liveops` | クライアント・サーバー両方のハードコード |
| `localStorage` キー | `lv_display_{timerId}` 等 | 表示画面の契約（09 §8 相当・`shared/tests/liveDisplayContract.test.ts`） |
| `MiniAppKey` の値 | `'liveops'`（§1-2 で新設） | 「あとから変えない」安定キー |

**対応表を `client-live/CLAUDE.md` に残すこと。** 「画面表示名は計時・視聴者だが、
コード上の識別子はどこも `liveops`/`live` のまま」という非対称さは、
知らずに触る人を混乱させます（制作技術支援の改称時に既に前例があるやり方 — 事前調査②参照）。

### 3-3. やらないもの

- 09 本体のセッション一覧廃止・URL 再設計（§2-3 の `/live/program/:id` → `/live/` 化）
- `viewer_overlay_program_id` の UI 化（09 §1-6 #3・引き続き見送り）
- Singular Live 連携（09 §1-6 #4・引き続き見送り）

---

## 4. DB スキーマ変更なしでの Owner 解決の橋渡し

### 4-1. 既にある部品で足りる

09 の完全統合設計（§4）は `main_timer_id` 列・案件との一意インデックスを**新設**する前提でしたが、
**その一意インデックスは PR1〜4（視聴者取得のサーバー移行）で既に実装済みです**：

```sql
-- migration 221（実装済み・このドキュメントでは触らない）
CREATE UNIQUE INDEX liveops_programs_project_key
  ON liveops_programs (project_id)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;
```

つまり「1案件につき `liveops_programs` は最大1件」という制約は**既にDBが担保しています**。
軽量統合に必要なのは、**この制約に乗っかって「取得または作成」をアトミックに行う経路**だけで、
**新しい列も新しいテーブルも要りません**。

### 4-2. 新設するのはコードだけ

```
POST /api/v1/liveops/programs/resolve-by-project/:projectId
```

- 既存の `GET /?project_id=X`（`programs.routes.ts:43-68`）と
  `POST /`（同 `:93〜`）の**組み合わせを1本のアトミックな処理にまとめるだけ**
- 実装は「`SELECT ... WHERE project_id = $1` → 無ければ `INSERT ... ON CONFLICT
  (project_id) WHERE project_id IS NOT NULL AND deleted_at IS NULL DO NOTHING RETURNING id`
  → それでも取れなければ（同時実行で誰かが先に作った）もう一度 `SELECT`」という形。
  **既存の一意インデックスがあるので、2人が同時に押しても行は2件できません**
- **migration は不要。** 新しいルートファイル（または既存 `programs.routes.ts` への追記）だけ

### 4-3. どちらの側から呼ぶか

| 案 | 呼び出し元 | 利点 | 欠点 |
| --- | --- | --- | --- |
| A. qsheet 側で事前に解決してから遷移 | `MiniAppTiles`/`MiniAppSwitcher` が遷移前に fetch し、結果の `programId` で URL を組み立てる | — | **クリックから実際のブラウザ遷移までの間に非同期待ちが挟まる**（体感が悪化する）。URL が「API 応答が返るまで決まらない」ため、§2 の Speculation Rules（静的な URL を先読みする仕組み）と相性が悪い |
| **B（採用）. `client-live` 側に小さな橋渡しページを置く** | 新設 `/live/open?project=:id`（`OpenByProjectPage`）が**マウント後に**「取得または作成」を呼び、`programId` が確定したら `/program/:id` へ client 側リダイレクト | qsheet 側は**静的な URL テンプレート**（`path: '/live/open?project=:ownerId'`）を組み立てるだけで済み、`externalPathOf` は純関数のままでいい。§2 のプリレンダーとも相性がいい（URL が事前に決まっている） | `client-live` に1画面追加する必要がある（ただし小さい・独立バンドル内で完結） |

**B を採ります。** §1-3 の `externalPathOf` に I/O を持たせない設計判断（「取得または作成」は
遷移先ページ側でやる）は、この選択と対になっています。

### 4-4. `scope === 'program'` では解決できない（受容する制約）

`liveops_programs.project_id` が指すのは `projects` テーブルだけです。
qsheet 自身の「番組（マニュアル）」= `qsheet_programs`（migration 227）は**別テーブル・
別 ID 型（`TEXT` と `UUID`）で、`liveops_programs` との FK 関係はありません**
（事前調査④）。

**DB スキーマを変えない**という §0-6 の前提の下では、`JourneyPage` の
`scope === 'program'`（GLS 案件に紐付かない、qsheet だけのマニュアル番組）から
計時・視聴者を解決する経路は**存在しません**。

- `MiniAppExternalDef.supportedOwnerKinds = ['project']` なので、
  `MiniAppTiles` は **`scope === 'project'` のときだけタイルを描画**します
  （`scope === 'program'` では計時・視聴者のタイル自体を出しません。他の4タイルは今まで通り）
- `scope === 'document'`（資料単体）はそもそも `MiniAppTiles` を描画しないので対象外
  （既存の挙動のまま）

この非対称は §6 のリスクとして扱います。

---

## 5. PR分割案

**A → B の順を守ること**（B は A が用意する橋渡しに依存します）。C は独立に出せます。

### PR-A: 型と橋渡し（スキーマ変更なし）

- `shared/src/production/miniapps.ts` / `server/src/shared/production/miniapps.ts`
  両方に `kind: 'external'` を追加し、`MINI_APPS` に計時・視聴者を1件登録（`enabled: false` で開始し、
  PR-B で `true` にする案も可 — 「押せるが誰も辿り着けない」状態を避けるため）
- `externalPathOf` ヘルパー・`miniAppOfPath` からの除外・`enabledMiniApps` 呼び出し側の
  `kind === 'external'` 除外
- サーバー: `POST /api/v1/liveops/programs/resolve-by-project/:projectId`（migration 無し）
- `client-live`: 新設 `/live/open` ルート・`OpenByProjectPage.tsx`
  （§2-3 の `document.prerendering` 対応込み）
- 検証: `npm run test`（`check-collab-parity.mjs` が client/server ミラーの一致を見る）・
  同時押下でも行が重複しないことの統合テスト（既存の一意インデックス任せであることの固定）

### PR-B: 導線（`MiniAppTiles` / `MiniAppSwitcher`）

- `MiniAppTiles` に `scope === 'project'` 限定でタイルを追加（`ExternalMiniAppLink` 経由）
- `MiniAppSwitcher` の `ORDER` に計時・視聴者を追加（`RecordingPage`/`StreamingPage` のみ。
  §2-4 の「他画面には広げない」を守る）
- §2 の体感緩和（prefetch／Speculation Rules）をここで実装
- PR-A で `enabled: false` にしていた場合はここで `true` に

### PR-C: 改称

- `apps.ts` の `label`、ルート `CLAUDE.md`・`client-live/CLAUDE.md` の記述更新
- `docs/wording.md` 追記
- 画面内の「計時LIVE」固有名詞表記の洗い出しと置換
- **バージョンは上げない**（作業 PR のルール通り。`docs/changelog.d/` に1文だけ置く）

---

## 6. リスクと対処／完全統合案とのトレードオフ

### 6-1. リスクと対処

| # | リスク | 対処 |
| --- | --- | --- |
| 1 | `kind: 'external'` に誤って `<Link to>` を使い、遷移が起きない（qsheet 側ルーターに一致が無く、内部で握りつぶされる） | §1-4 の `ExternalMiniAppLink` で `<a>` 以外を書けなくする。コードレビューでも「external は必ず `<a>`」を機械的に確認できる形にする |
| 2 | 「取得または作成」の同時実行レース（2人が同時に初回タイルを押す） | 既存の一意インデックス（migration 221・実装済み）に `ON CONFLICT DO NOTHING` を乗せて解決。**新しいロックの仕組みは要らない** |
| 3 | `scope === 'program'`（マニュアル番組）では計時・視聴者に辿り着けない非対称 UI | **この設計では解決しない**と明記した上で受容する。代わりに既存の `/live/` セッション一覧からの「スタンドアロン作成」（`SessionHomePage.tsx` の `mode: 'standalone'`）が抜け道として残っていることを利用者に案内する |
| 4 | Speculation Rules の `prerender` が、ホバーしただけで「取得または作成」を実行してしまう副作用 | §2-3 の `document.prerendering` 対応を必須にする。対応しないなら `prerender` を諦めて `prefetch` に留める |
| 5 | 表示名だけ変えて内部識別子は据え置く「中途半端な改称」が将来の開発者を混乱させる | `client-live/CLAUDE.md` に対応表（§3-2）を残す運用ルールにする |
| 6 | `MiniAppKey` に `'liveops'` を追加する判断が、後で「間違いだった」となる | 「あとから変えない安定キー」の原則に沿い、着手前にこのドキュメントでレビューを通してから実装する（実装後の変更コストは `docPrefix` 級に高い） |

### 6-2. 完全統合案（09本体）と比べたときの本質的なトレードオフ

| 観点 | 軽量統合（この文書） | 完全統合（09 本体） |
| --- | --- | --- |
| ページ遷移の一体感 | 別バンドルへの本物のページ遷移が残る。§2 で緩和はするが**消せない**（特に Safari/Firefox） | React Router 内の `<Link>` なので**切れ目が無い** |
| 実装コスト・変更範囲 | 小。型追加1件・ルート1本・画面1つ・文言。**DB migration ゼロ** | 大。URL 再設計・セッション一覧の廃止・案件からの自動プロビジョニング・複数画面の作り直し（09 §2〜§4 全体） |
| `/live/display/:timerId` への影響 | ゼロ（触らない） | ゼロ（09 も「触らない」と決めているが、変更範囲が広い分だけ事故の機会は相対的に多い） |
| `scope === 'program'`（マニュアル番組）対応 | **不可**（§4-4。DB を変えない前提の直接の帰結） | 09 §2-2 も「案件から1:1」を前提にしており、**マニュアル番組（`qsheet_programs`）を主体にする設計は09本体にも無い**。つまりこの制約は**軽量統合固有ではなく、09 の現在の設計でも未解決**という点は正直に書いておく |
| 権限区画の分離感 | `liveops` のまま別区画（ミニアプリとして並ぶのに権限だけ別、という違和感が残る） | 09 も区画は変えない判断（09 §0-6）なので**ここは同じ** |
| 将来、完全統合へ進むときの再利用性 | §1 の `MiniAppExternalDef`／§4 の `resolve-by-project` ルートは、完全統合時に
  `kind: 'document'`（案件配下の1件）へ差し替える土台として転用できる。**捨て作業にならない** | — |

**まとめ**: 軽量統合が本質的に諦めているのは「遷移の一体感」と「マニュアル番組対応」の2点だけです。
後者は完全統合でも未解決である以上、**この文書が完全統合に対して劣るのは実質「遷移の一体感」1点**
であり、そのコストは実装規模の桁を1つ落とせることで相殺できる、というのがこの設計の立場です。
