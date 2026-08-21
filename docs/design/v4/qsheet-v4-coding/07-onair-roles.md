# 制作資料 v4 — 本番の4役割と公開音声サポート

> **2026-08-21 新設。** 4観点の敵対的検査で、
> **本番4役割（進行／ランダウン／プロンプター／音声サポート）の設計が5本のどこにも無い**
> ことが分かったため新設しました（検査 機能#C1・C2）。
> **コードは書いていません。設計だけです。**
>
> 編集画面は [`06-editor.md`](06-editor.md)。実尺の表（`qsheet_cue_actuals`）の DDL は
> [`04-ai.md`](04-ai.md) §5-3a にあり、**この文書はその「書き手」と socket 契約を決めます。**

---

## 決めたこと

1. **本番4画面は「URL も見た目も今のまま」を最優先にする。**
   凍結の約束（`client-qsheet/CLAUDE.md`）に一番強く縛られるのがここです。
   tokens を差し替えるなら**この4画面だけ旧トークンでスコープ固定**します（01 §0-1）。
2. **実尺（`qsheet_cue_actuals`）を書くのは「進行（OnAir）の1台」だけ。**
   04 の初版は「`cue:next` を発火した端末」としていましたが、
   **実装では OnAir は `cue:next` を出しません**（§3）。
3. **`run_id` を socket で配る契約を足す。** 現行の `cue:reset` には payload が無く、
   run を識別する口がありません（§3-2）。
4. **公開音声サポート（`/qsheet/audio/:id`）は失効できるようにする。**
   migration 209 で失効カラムが DROP 済みで、**配った URL を取り消せません**（§4）。
5. **本番中の操作は MCP に出さない**（05 §12 のまま）。AI が1拍遅れて進行を送ると
   事故が事故のまま残り、Socket.IO の中継はサーバーに何も残らないので監査で再現もできません。

---

## 1. 4役割の棚卸し表（**空欄を残さない**）

| 画面 | URL | 実装 | v4での扱い |
| --- | --- | --- | --- |
| 進行（OnAir） | `/qsheet/onair/:id` | `OnAirPage.tsx` | **そのまま**＋実尺の記録を足す（§3） |
| ランダウン | `/qsheet/rundown/:id` | `RundownPage.tsx` | **そのまま**（実尺の計算は OnAir へ移す） |
| プロンプター | `/qsheet/prompter/:id` | `PrompterPage.tsx` | **そのまま** |
| 音声サポート（公開） | `/qsheet/audio/:id` | `AudioSupportPage.tsx` | **そのまま**＋失効（§4）＋返す情報を絞る（§4-2） |

### 1-1. 落としてはいけない挙動

| 機能 | 実装箇所 | 扱い |
| --- | --- | --- |
| 4役割の双方向同期（`cue:*` の中継） | `server/.../socket.ts:134-167` | **そのまま** |
| 進行のキーボード操作（次へ・戻る・ジャンプ） | `OnAirPage.tsx:270-305` | **そのまま** |
| 進行の cue 送出 | `OnAirPage.tsx:358`（`cue:update`） | **そのまま**＋実尺 POST を足す |
| ランダウンの進行操作・実尺表示 | `RundownPage.tsx:282-338,359-383` | **そのまま**（表示は残す。**永続化は OnAir 側**） |
| プロンプターの表示・ショートカット | `PrompterPage.tsx:98-127,172-177` | **そのまま** |
| 接続断トースト（「放送同期が切断されました」） | `lib/notify.ts` 経由 | **そのまま（`NoticeBar` に置き換えない）** |
| 公開音声の30秒ポーリング・差分5色 | `AudioSupportPage.tsx:289-301,365,448` | **そのまま** |
| 音声共有の QR 生成・URL コピー | `AudioShareDialog.tsx` | **そのまま**＋失効ボタンを足す（§4） |

⚠️ **接続断トーストを帯（`NoticeBar`）に変えないこと。** 放送中に出るものの見え方を、
この PR のついでに変えてはいけません（01 §0-1・§9-13）。

---

## 2. 見た目（凍結との両立）

- **既定: この4画面だけ旧トークンで固定する。**
  `client-qsheet/src/styles/legacy-onair.css` に `tokens.css` の変数定義を
  `.qs-legacy-shell { … }` としてスコープ付きで複製し、4画面のルート要素に付ける。
- 共通シェル（`AppShell`）は**被せない**（今と同じ。全画面を使う）。
- 「本番画面も v4 の見た目にしてよい」という判断が取れたら、この CSS ごと落とせます（01 §9-12）。

---

## 3. 実尺の記録（`qsheet_cue_actuals` の書き手）

### 3-1. 何が問題だったか（実装を読んで確認した事実）

04 の初版は「`cue:next` / `cue:jump` を**発火した端末だけ**が POST する」としていましたが:

- **進行（OnAir）はローカルで `next()` を呼び、`cue:update` しか emit しません**
  （`OnAirPage.tsx:270-305` のキーボード操作、`:358` の emit）。
- `cue:next` / `cue:jump` を emit しているのは **`RundownPage` だけ**です。

→ **進行卓が普通に本番を回すと `cue:next` は誰も発火せず、実尺は1行も入りません。**
実際に測っているのは `RundownPage.tsx:129-145`（`cue:sync` 由来の cue 変化から
`actualDurations` を計算）で、**ランダウンを開いていない本番では測定自体が存在しません。**

### 3-2. 決め

**計測点を「進行（OnAir）の1台」に固定します。**

1. **run の開始**: OnAir が `genId('run')` で `runId` を採り、`runStartedAt` とともに
   **`cue:reset` の payload に載せて配る**（現行の `cue:reset` は payload 無し・`socket.ts:145-167`）。
   後から接続した端末には **`cue:sync` で同じものを配る**（`cue:sync` は既にあるので payload を足すだけ）。
2. **cue が切り替わったとき**、OnAir が直前の cue の `planned_sec` / `actual_sec` を算出して
   `POST /api/v1/internal/qsheet/runs/:documentId/cues` を投げる（04 §10-4b）。
   **ランダウンからの操作も `cue:*` を OnAir が受けてから記録する**ので、
   **二重送信が構造的に起きません。**
3. **`pass_no`** は OnAir が「その run でその行に入った回数」として送る（1 始まり）。
   `cue:jump` で戻ってやり直したとき、**最初の（多くは失敗した）尺で上書きされない**ため。
4. **`section_id` は必須。** CM/VTR/ロール一括のキューは `row_id = NULL` ＋ `section_id` で持つ。

⚠️ **`flatCues` が `section.id` を運ぶように直すこと。**
`RundownPage.tsx:218-240` の `flatCues` は CM/VTR/ロール一括に
**`cm-<sectionIdx>` / `vtr-<sectionIdx>` / `sec-<sectionIdx>` という配列 index 由来の合成 id** を
作り、`sectionIdx` しか持っていません。これを `row_id` に入れると
**ロールを1本足しただけで別のキューと同じ id になり**、
設計が避けたはずの「1行挿すと全部ずれる」がそのまま起きます（検査 AIループ#H5）。

### 3-3. 本番を止めない書き方（04 §8-2 と同じ）

- **fire-and-forget**（`await` しない）／失敗しても画面に何も出さない／`maxRetries: 0`。
- **`計時の正しさ > 記録の完全さ`。**
- サーバーは `ON CONFLICT DO NOTHING`（同じ pass の二重送信だけを無害にする）。
- 返りは **204 No Content**（画面は結果を見ない）。

### 3-4. 取得率を必ず見る

ランダウンを使わない現場でも OnAir を開けば記録されるようになりますが、
**進行卓を使わない本番（プロンプターだけ立ち上げる等）はやはり記録されません。**
→ `runs_measured / broadcasts_total`（実尺の取得率）を月次レポートと digest に
**必ず並べる**（04 §5-3a）。取得率が5割を切っている間は「尺の傾向は断定できません」を出す。

---

## 4. 公開音声サポート（`/qsheet/audio/:id`）

### 4-1. 失効できるようにする

**現状: 配った URL は取り消せません。**
migration 209 で `audio_share_revoked_at` / `audio_share_revoked_by` が **DROP 済み**で、
`AudioShareDialog` は現役で QR を配っています。
02 §9-4 は「だから進行表に公開URLは作らない」と正しく避け、
05 §12 は「まず画面と DB を直すのが先」と書きましたが、
**その「先に直す」を誰の仕事にもしていませんでした**（検査 機能#M5）。

**決め: トークン方式にして失効できるようにします。**

```sql
-- 21n_qsheet_audio_share.sql（番号は README の採番表）
CREATE TABLE IF NOT EXISTS qsheet_audio_shares (
  token        TEXT PRIMARY KEY,                 -- URL に載る不透明な文字列（推測不能）
  document_id  TEXT NOT NULL REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  label        TEXT,                             -- 「8/6 用に配った分」など
  created_by   TEXT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  revoked_by   TEXT REFERENCES users(id),
  last_seen_at TIMESTAMPTZ                       -- 使われているかを見るため（人数は数えない）
);

CREATE INDEX IF NOT EXISTS idx_qsheet_audio_shares_doc
  ON qsheet_audio_shares(document_id) WHERE revoked_at IS NULL;
```

- **URL は `/qsheet/audio/:token`**（`documentId` を直接載せない）。
  資料 id が URL に出ていると、**id を知るだけで開けて**しまいます。
- 既存の `/qsheet/audio/:documentId` は**当面そのまま残す**（配布済みの QR が死ぬため）。
  移行期間の後に落とす（→ §5-2 で確認）。
- `AudioShareDialog` に「**この URL を失効させる**」を足す。失効済みの token は 410 を返す。
- **失効は取り消せる操作ではない**ので、確認ダイアログを出す。

### 4-2. 返す情報を絞る

`/documents/:id/public-audio` は現在 **`masters.persons` と `masters.micTypes` を全件返します**
（`public-audio.routes.ts` の payload・**認証なし**）。
03 §7-6 の「Excel に現れた名前をマスターに自動追加する」をそのまま実装すると、
**Excel に書いた名前が URL を知る全員に見えるようになります**（検査 地雷#17）。

**決め:**

- 公開エンドポイントが返す `persons` を
  **「その台本のマイク香盤に実際に出てくる名前だけ」**に絞る。
- `micTypes` も同様に、**実際に割り当てられている種別だけ**。
- 03 §7-6 の自動追加は `video` / `audio` / `telop` だけにする（03 側で反映済み）。

### 4-3. 変えないもの

30秒ポーリング・差分5色・無認証で開けること（現場のスタッフがログインを持たないため）は
**そのまま**です。認証を掛ける判断はしていません（→ §5-3）。

---

## 5. 利用者に確認すべきこと

1. ⚠️ **本番4画面の見た目を v4 に変えてよいですか。**
   既定では**変えません**（この4画面だけ旧トークンで固定）。変えてよければ CSS が1本減ります（§2・01 §9-12）。
2. **配布済みの音声サポート URL（`/qsheet/audio/<資料ID>`）をいつ止めますか。**
   新しいトークン方式に移したあと、旧 URL を**当面は生かす**設計です（§4-1）。
   「もう配ったものは無い」なら、すぐ止められます。
3. **公開音声サポートにログインを掛けたい場面はありますか。**
   現状も設計も**無認証**です（現場のスタッフがアカウントを持たないため）。
4. **進行卓（OnAir）を開かずに本番を回すことはありますか。**
   ある場合、その本番の実尺は記録されません（§3-4）。
   「プロンプターだけ立ち上げる」運用があるなら、計測点をもう1つ考えます。
5. **本番中に「今どこを流しているか」を Claude から読めると嬉しいですか。**
   設計では**本番の操作も読み取りも MCP に出していません**（05 §12）。
   読むだけなら検討できます。
