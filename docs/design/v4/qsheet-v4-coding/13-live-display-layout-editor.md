# 13 計時・視聴者 — 表示画面の自由配置レイアウト＋全案件横断テンプレート（確定版）

> **2026-08-22 作成。コードは書いていません。**
>
> **この文書は何か**: 承認済みモックアップ（Claude Design、Artifact「計時・視聴者 表示レイアウト」
> https://claude.ai/code/artifact/76321518-c694-4c9f-b397-d66256601a13 、
> `Main.dc.html` / `TemplateLibrary.dc.html` / `DisplayPreview.dc.html`）を実装に落とす設計。
>
> **経緯**: 2案（案A「シンプルさ優先」・案B「運用のしやすさ優先」）を作り、2名の判定者
> （判定者1: 50/60でA推奨・判定者2: 172/240でA推奨）に評価させた。**両判定者は「配信中に
> 表示画面が勝手に動くリスクを避ける」という1点でAの立場（Socket.IOでの即時配信をしない）
> を明確に支持しつつ、「データモデルはBの独立コピー方式（テンプレート編集が他番組に波及しない）
> の方が筋が良い」という点でも一致した。** 本書はこの両判定者の一致点を採用し、
> **反応性（いつ反映するか）はA、データモデル（テンプレートとタイマーの関係）はBを土台に、
> 表示画面へのAPI設計はA・B双方の弱点を修正した第三の形**で確定する（§0・§4）。

---

## 0. 決めたこと

1. **リアルタイム配信はしない。エディタで保存しても、既に開いている表示画面
   （OBSのブラウザソース等）には次回リロードまで反映されない。** Socket.IOでのレイアウト
   配信は行わない（案Aを採用。案Bの「保存時のみSocket配信」は不採用）。理由は §5。
2. **データモデルは「テンプレート（全案件横断・読み取り専用プリセット）」と「タイマー個別の
   適用済みレイアウト（独立コピー）」を別テーブルに分離する（案Bを採用）。** テンプレートを
   「適用」した瞬間に関係は切れ、後からテンプレートを直したり削除したりしても、
   既に適用済みのタイマーには一切影響しない。案Aの「タイマーとテンプレートが共有参照を持ち、
   誰かがテンプレートを上書き保存すると参照する全タイマーに波及する」設計は、
   波及が事故に繋がりうるという判定者2の指摘を踏まえ不採用とする。
3. **タイマー個別のレイアウトは `liveops_timers` に列を足さず、専用の1:1テーブル
   （`liveops_timer_display_layouts`）に持つ（案Bを採用）。** `liveops_timers` は
   タイマーの運用状態（`phase`・`remaining_ms`等）が高頻度で更新されるホットテーブルであり、
   表示configという別の関心事をそこに同居させない。
4. **表示画面向けのレイアウト取得は、既存 `GET /:id/display` に埋め込まず、新しい
   専用エンドポイントに分離する（案Bの方針を採用するが、命名は案Aに寄せる）。**
   `GET /:id/display` は `programId` 解決という**既存の生命線**（視聴者数取得の起点）を
   返す最重要エンドポイントであり、そこにレイアウト解決のJOINを埋め込むと、
   新機能側の不具合が既存の必須機能を道連れにしうる（判定者2の指摘）。**新設ルートの
   名前は `'/:id/display'` という契約テスト監視対象の文字列から意図的に離す**
   （`/:id/display-layout` ではなく `/:id/layout` とする。判定者2が「将来のルート整理
   リファクタで保護対象行を巻き込みやすい」と指摘した近接命名を避ける）。
5. **`TimerDisplayPage.tsx` はこの機能のために変更する。** これは
   `client-live/CLAUDE.md` の「`TimerDisplayPage.tsx` は触らない」という現状の記述に対する
   **明示的な上書きである**。経緯は §1-2 に明記する。ただし
   `shared/tests/liveDisplayContract.test.ts` が固定する5項目は**例外なく守る**。
6. **既存タイマー（`liveops_timer_display_layouts` に行が無い）は現行の固定3パターン描画に
   フォールバックする。** データ移行は行わない。
7. **エディタは `client-qsheet` バンドル内に新設する。** 権限は既存の
   `requirePermission('qsheet', 'reader'|'manager')` パターンをそのまま使う
   （閲覧=reader、編集・保存・テンプレートCRUD・適用=manager）。
8. **マイグレーションの型は既存 liveops ドメイン（052・221・232）に合わせ `TIMESTAMP`
   （非 `TZ`）で統一する。** 案Aの草案が `TIMESTAMPTZ` を使っていた点は、
   ドメイン内の一貫性を優先して修正する（判定者1の指摘）。
9. **プレビューは表示画面と同一のレンダラー部品（`DisplayCanvas`）を使う。** ドラッグ中の
   ライブプレビューは持たず、保存後の状態を描画する（案Aを踏襲。§6-2）。
10. **PRは3本に分ける。各PRの検証項目に `liveDisplayContract.test.ts` green を明記する。**
    PR1（スキーマ＋API。表示画面ファイルには一切触れない）→ PR2（`TimerDisplayPage.tsx`
    改修。ここで初めて契約テストと向き合う）→ PR3（`client-qsheet` にエディタUI新設）。

---

## 1. 前提

### 1-1. 対象と現状（読んだ実装）

- `client-live/src/pages/TimerDisplayPage.tsx`（347行）: `storageKey = lv_display_${timerId}` で
  端末ローカルに `Toggles`（`youtube`/`jstream`/`zoom`/`teams`/`total`の表示ON/OFF・
  `showTimer`・`lightBase`＝背景明暗）を保存。レイアウトは固定3パターン
  （タイマーのみ中央／視聴者数のみ／横並び6:4）で自由配置ではない。色定数
  `phaseBarColors`（緑#16a34a/黄#d97706/赤#dc2626）・`VIEWER_ITEMS`
  （YouTube#ef4444/Jstream#06b6d4/Zoom#2D8CFF/Teams#6264A7/合計#a855f7）はこのファイル内に
  ハードコード。`programId` は `?programId=` 優先、無ければ
  `GET /api/v1/internal/liveops/timers/:id/display` から取得。視聴者数は
  `GET /api/v1/internal/liveops/snapshots/:programId/display` を15秒ポーリング。
- `server/src/contexts/liveops/routes/timers.routes.ts`（実際に読んで確認）:
  `router.get('/:id/display', async (req, res) => {...})` は
  `SELECT id, viewer_overlay_program_id, program_id FROM liveops_timers WHERE id = $1 AND
  deleted_at IS NULL` を返す無認証ルート。以降の `GET /` `GET /:id` `POST /` `PUT /:id`
  `DELETE /:id` はすべて `canRead`（`requireAuth` + `requirePermission('qsheet','reader')`）
  または `canWrite`（同 `'manager'`）で保護されている（migration 232 で `qsheet` 区画へ
  統合済み）。`snapshots.routes.ts` の `GET /:programId/display` も同様に無認証。
- 権限区画は `qsheet` に統合済み（migration 232。`client-live/CLAUDE.md` に記載あり）。
  運用画面は `client-qsheet/src/pages/live/`（`LiveDashboardPage.tsx` /
  `LiveTimerAdminPage.tsx` 等、移植先URL `/qsheet/live/:ownerKey/...`）に集約済み
  （[`12-live-timer-decision.md`](12-live-timer-decision.md) フェーズ2）。
- マイグレーションは `232_consolidate_liveops_into_qsheet.sql` が最新。既存 liveops
  ドメインのテーブル（`052_liveops_schema.sql`・`221_liveops_server_measure.sql`）は
  一貫して `TIMESTAMP`（非 `TZ`）を使っている。本書は233番から連番で新設する。

### 1-2. `TimerDisplayPage.tsx` に触ることについて（`client-live/CLAUDE.md` の上書き）

`client-live/CLAUDE.md` は現状こう書いている（実際のファイルを引用する）:

> ⚠️ 表示画面（`/live/display/:timerId`）だけは今までどおり例外
>
> 本番中に会場モニター・OBS が読む公開URL。認証を通さない。この画面だけは
> 「見た目を変えない」決まりのまま
>
> - **`TimerDisplayPage.tsx` は触らない。** `App.tsx` の `DisplayRouter`
>   （`AuthenticatedApp` も共通シェルも一切経由しない、完全に別のルーター）も同様。
>   URL・認証無しの挙動は1文字も変えていない

これは [`12-live-timer-decision.md`](12-live-timer-decision.md) §0-2 の
「公開URL `/live/display/:timerId` と、そこから呼ばれる実装…には、フェーズ1・
フェーズ2のどちらでも1バイトも触れない。例外は無い」という決定を踏まえたもので、
**ミニアプリ化（バンドル統合・導線整理）のスコープでの取り決め**である。
**表示画面自体に新機能（自由配置レイアウト）を足すことは、当時想定されていなかった。**

今回はユーザーが「表示画面（`/live/display/`：会場モニター・OBS出力）のレイアウトを
自由配置にしたい」と明示的に要求し、モックアップ `DisplayPreview.dc.html` が実際に
`TimerDisplayPage.tsx` の見た目を変えるものであることを確認した上で「いいですね。
これでいきましょう。」と承認している。**「触らない」の上書きは、ユーザーの明示的な
指示としてすでに成立している。** [`12-live-timer-decision.md`](12-live-timer-decision.md)
§4-2 が「フェーズ2でも表示画面専用ファイル（`socket.ts`/`useTimer.ts`）には1文字も
触れない」という原則を維持しつつ、それとは別に本書が `TimerDisplayPage.tsx` 自体を
今回だけ触るのは、**あの原則がバンドル統合という別の作業のために立てたものであり、
今回のようなユーザー起点の新機能追加は最初から対象にしていなかった**ためである。

**上書きされるのは「触らない」という広い方針だけであり、`shared/tests/liveDisplayContract.test.ts`
が固定する以下5項目は変わらず守る**（実際にテストソースを読んで確認済み）:

1. `client-live/src/App.tsx` が文字列 `'/live/display/'` を含む
2. `TimerDisplayPage.tsx` が文字列 `/api/v1/internal/liveops/timers/` と
   `/api/v1/internal/liveops/snapshots/` を含む
3. `timers.routes.ts` の `/:id/display` 行（`source.split('\n').find(l =>
   l.includes("'/:id/display'"))` で見つけた行）に `canRead`/`requireAuth` を含まない
4. `snapshots.routes.ts` の `/:programId/display` 行も同様
5. `measure.service.ts` の `liveops_snapshots` への INSERT が
   `total_count`/`captured_at` を書いていない

本書の設計（§3・§4）はこの5項目をすべて満たしたまま実装できる形にしている。
実装PRでは各PRの検証項目に必ず「`liveDisplayContract.test.ts` green」を明記する（§7）。
なお `client-live/src/lib/socket.ts` / `hooks/useTimer.ts`（[`12-live-timer-decision.md`](12-live-timer-decision.md)
§4-2 が「表示画面専用として凍結」と定めた2ファイル）には、本書のどのPRでも触れない
（自由配置レイアウトはタイマー状態そのものの取得経路とは無関係のため、触る理由が無い）。

---

## 2. データモデル

### 2-1. テーブル設計の考え方（案Bの独立コピー方式を採用）

- **テンプレート**＝「名前＋要素配置JSON」の**読み取り専用プリセット**。`project_id` を
  持たず、全案件横断で一覧・検索・適用できる。
- **タイマー個別の適用済みレイアウト**は、テンプレートとは別の1:1テーブルに持つ。
  「適用」＝テンプレートの `layout` をこのテーブルへ**コピー**する操作であり、
  コピーした瞬間にテンプレートとの参照関係は切れる。**後からテンプレート側を
  編集・削除しても、既に適用済みのタイマーの見た目は一切変わらない。**
  `source_template_id` は「どのテンプレートから作られたか」という**表示ラベル専用の
  記録**であり、以後の同期には使わない（`ON DELETE SET NULL` — テンプレートを消しても
  タイマー側のレイアウトは残る。ラベルが消えるだけ）。
- **`liveops_timer_display_layouts` に行が無い ＝ 未設定**（既存タイマーの初期状態）。
  表示画面は現行の固定3パターンで描画する。
- 「現在のレイアウトをテンプレートとして保存」（モックアップの「現在のレイアウトを保存」
  タイル）は、タイマー側の行の `layout` を読み、`liveops_display_templates` へ
  新規行として書くだけの操作（コピーの向きが逆になるだけで、双方向に同期させる仕組みは
  一切持たない）。

この方式が案Aの「`liveops_timers` に列2本を足すだけ」より複雑になる点は認めた上で、
以下2つの実害を避けるために案Bを採る:

1. **共有波及の事故**: 案Aでは、複数タイマーが同じテンプレートを参照している状態で
   誰かがテンプレートを上書き保存すると、参照する全タイマーの見た目が（次回リロード時
   とはいえ）一括で変わる。案A設計書自身が「利用者に確認すべきこと」として最後まで
   自信を持ち切れていなかった論点であり、判定者2も「テンプレート＝雛形という直感と
   ズレる」と指摘した。独立コピー方式ではこの波及経路自体が構造的に存在しない。
2. **ホットテーブルの汚染**: `liveops_timers` はタイマーの運用状態
   （`phase`・`remaining_ms`等）が本番中に高頻度で更新されるテーブル。表示configという
   別の関心事のJSONBをそこに同居させず、専用テーブルに分離する。

### 2-2. レイアウトJSON構造

```ts
// shared/src/client/live/displayLayout.ts （新設）
// client-live（表示画面）・client-qsheet（エディタ）の両方から import する
// 唯一の型定義。表示画面とエディタで型がずれる事故を防ぐ。

export type DisplayElementKey =
  | 'timer'
  | 'youtube'
  | 'jstream'
  | 'zoom'
  | 'teams'
  | 'total';

export interface DisplayElementLayout {
  key: DisplayElementKey;
  visible: boolean;
  /**
   * 1280×720 の仮想キャンバスに対する割合 (0–100)。
   * 実際の表示解像度（会場モニターの実ピクセル数）に依らず相似で配置するため
   * px ではなく % を採用する。
   */
  x: number; // 左端の %
  y: number; // 上端の %
  w: number; // 幅の %
  h: number; // 高さの %
}

export interface DisplayLayout {
  /** 将来の構造変更に備えたスキーマバージョン。今回は 1 固定 */
  version: 1;
  background: 'dark' | 'light'; // 既存 Toggles.lightBase に対応
  /** 6キー固定。順不同・欠けは「非表示扱い」 */
  elements: DisplayElementLayout[];
}
```

- 要素キーは既存 `TimerDisplayPage.tsx` の `VIEWER_ITEMS`（`youtube`/`jstream`/`zoom`/
  `teams`/`total`）＋タイマー本体（`timer`）の6種で固定する。モックアップの「要素カード」
  一覧と一致させ、自由な要素追加（任意テキスト等）は今回のスコープに含めない
  （§9で利用者に確認する拡張余地）。
- `timer` 要素は現行の `timerBlock()`（数字表示＋進捗バー）を1つの塊として扱う。
  個別要素へのさらなる分解は行わない（要件に無い）。
- **色（フェーズ色・プラットフォーム色）は要素種別から一意に決まる固定値なので、
  JSONには持たせない。** `DisplayCanvas`（§4-2）側の定数で解決し、
  現行 `TimerDisplayPage.tsx` の `phaseBarColors`/`VIEWER_ITEMS` の色と**完全に同じ値**を
  そのまま移す（新しい色は作らない）。
- サーバー側は `elements` が配列であることだけをアプリ層で検証し、中身の型を
  DB制約としては強制しない（JSONBを素通しする既存の運用と同じ方針）。不正な形が
  入っても、クライアント側（`DisplayCanvas` の直前）で軽くvalidateし、
  不正なら未設定と同じ扱い（固定3パターンへフォールバック）にする（§8）。

### 2-3. DDL（migration 233）

```sql
-- server/src/shared/db/migrations/233_liveops_display_layout.sql
-- ============================================================
-- 233: 計時・視聴者 — 表示画面の自由配置レイアウト・全案件横断テンプレート
--
-- 設計: docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md
--
-- 独立コピー方式: テンプレートは読み取り専用のプリセットとして残し、
-- タイマーへ「適用」すると liveops_timer_display_layouts へ内容がコピーされる。
-- 適用後にテンプレート側を変更・削除しても、既に適用済みのタイマーには一切影響しない
-- （source_template_id は「どのテンプレートから作られたか」の表示ラベル用途のみ）。
--
-- 後方互換: 既存タイマーは liveops_timer_display_layouts に行を持たないため、
-- TimerDisplayPage.tsx は行が無いときは今までどおり固定3パターンで描画する。
-- データ移行は不要。
--
-- 型は既存 liveops ドメイン（052/221/232）に合わせ TIMESTAMP（非 TZ）に統一する。
-- ============================================================

-- ── ① テンプレート本体（全案件横断・project_id を持たない・読み取り専用プリセット） ──
CREATE TABLE IF NOT EXISTS liveops_display_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  -- レイアウトJSON本体。構造は 13-live-display-layout-editor.md §2-2
  -- （version・background・elements[]）。アプリ側で validate する
  -- （不正な形が入っても表示画面側は未設定と同じ扱いにフォールバックする）。
  layout      JSONB NOT NULL,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_liveops_display_templates_active
  ON liveops_display_templates (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_liveops_display_templates_name
  ON liveops_display_templates (name) WHERE deleted_at IS NULL;

-- ── ② タイマー個別の適用済みレイアウト（独立コピー・1タイマーにつき最大1行） ──
CREATE TABLE IF NOT EXISTS liveops_timer_display_layouts (
  timer_id            UUID PRIMARY KEY
    REFERENCES liveops_timers(id) ON DELETE CASCADE,
  layout              JSONB NOT NULL,
  -- 「どのテンプレートから作られたか」の表示ラベル用途のみ。以後の同期には使わない。
  source_template_id  UUID REFERENCES liveops_display_templates(id) ON DELETE SET NULL,
  updated_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 行が無い timer_id = 未設定（既存タイマー）。表示画面はこの場合だけ
-- 現行の固定3パターン描画（フォールバック）を使う。
```

- `liveops_display_templates.id` を `UUID`・`gen_random_uuid()` にしたのは、
  `liveops_timers.id`（UUID・052で定義）と型を揃え、FKを跨ぐときの型不一致を避けるため。
- `liveops_timer_display_layouts.timer_id` を主キー兼FKにすることで「1タイマーにつき
  最大1行」をDBが保証する（履歴やバージョニングは要件に無いため、これで十分）。
  `ON DELETE CASCADE` はタイマー本体が削除されたら表示config行も一緒に消える、という
  自然な後始末。

---

## 3. 表示画面（`/live/display/:timerId`）がレイアウトを取得する経路

### 3-1. 新設エンドポイント（既存 `/:id/display` には触れない）

`GET /api/v1/internal/liveops/timers/:id/display`（`programId` 解決の起点・視聴者数取得の
生命線）には**一切手を入れない**。レイアウトの取得は別の新設ルートに分離する。

```ts
// server/src/contexts/liveops/routes/timers.routes.ts（既存 /:id/display の直後に追記）
// 公開: 表示画面用（認証不要・読み取り専用）。自由配置レイアウトの配信。
// 行が無いタイマーは data: null → TimerDisplayPage.tsx 側で固定3パターンにフォールバック。
//
// ⚠️ ルート名は '/:id/display' という契約テスト監視対象の文字列から意図的に離す
// （'/:id/display-layout' のような近接命名は避ける。将来ルートをグルーピングする
// リファクタが入った際に保護対象行を巻き込みにくくするため）。
router.get('/:id/layout', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT layout FROM liveops_timer_display_layouts WHERE timer_id = $1`,
      [req.params.id]
    );
    res.json({ success: true, data: row ? (row as any).layout : null });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
```

`TimerDisplayPage.tsx` はマウント時に、既存の2本（`/:id/display`・
`/:programId/display`）に加えてこの新しい1本を呼ぶ（一度きりの取得。§5でリアルタイム
配信をしない理由と合わせて、ポーリングもしない）。

### 3-2. 新エンドポイントを分離する判断の根拠（案A草案からの修正点）

案Aの当初案は「既存 `GET /:id/display` のSQLをJOINに変え、レスポンスに
`display_layout` フィールドを1本足す」という**レスポンス拡張**だった。これは
往復が1本増えない・契約テストが見る5項目は変わらない、という利点はあるが、
判定者2から次の弱点を指摘され、本書ではこの部分だけ不採用にする:

> 新設したレイアウト解決ロジック（テンプレートJOIN）を、既存の本番稼働中エンドポイント
> `/:id/display` の同じレスポンスに直接埋め込んでいる。このJOINが例外を出すと、
> レイアウト機能だけでなく `programId` 解決・視聴者数取得という既存の生命線まで
> 巻き添えで500になる（新機能の不具合が旧機能を道連れにする設計）。

**新設エンドポイントに分離すれば、この巻き添えリスクが構造的に消える。** レイアウト
解決に不具合があっても、`try/catch` で500を返すのはこの新設ルートだけであり、
`programId` 解決・視聴者数取得は無傷のまま動き続ける。往復が1本増えるコストは、
マウント時1回きりの取得（15秒ポーリングのような継続負荷ではない）であり、
表示画面の初期化体感には実質影響しない。

### 3-3. 無認証のまま新設することのセキュリティ評価

- **読み取り専用であること**: `GET`のみ。書き込み（`PUT`・テンプレートCRUD）はすべて
  `canWrite`（`requireAuth` + `requirePermission('qsheet','manager')`）で守る（§6-4）。
  無認証で書き込める経路は増えない。
- **タイマーIDがUUIDで推測困難であること**: 既存の `/:id/display` と同じ
  `liveops_timers.id`（`gen_random_uuid()`）を鍵にしており、推測可能性は既存
  エンドポイントと変わらない。新たな攻撃面を作らない。
- **露出する情報の性質**: `layout` は「画面上の要素の位置・サイズ・表示ON/OFF・
  背景の明暗」であり、タイマーIDさえ知っていれば誰でもブラウザで実際に見える
  レンダリング結果そのもの（会場モニター・OBSが映す絵）を数値化しただけの情報。
  視聴者数・アカウント情報・GLS番号等の業務データは一切含まない。現状すでに無認証で
  「実際に何が表示されているか」がまるごと見える設計なので、レイアウトJSONを
  追加公開しても露出の質は変わらない（機密情報の追加露出ではない）。

---

## 4. 表示画面側のレンダリング

### 4-1. 後方互換（フォールバック）

`GET /:id/layout` が `null`（＝行が無い既存タイマー、または不正な形のJSONをクライアント側
validateで弾いた場合）のときは、**`TimerDisplayPage.tsx` の既存コード（固定3パターン＋
端末ローカルのトグル設定パネル）をそのまま使う。このコードパスには一切手を入れない。**

`layout` が非 `null` かつ有効な形のときだけ、新しい自由配置の描画を使う。このとき、
既存の「歯車ボタン→設定パネル」（表示トグル・背景明暗の**端末ローカル**設定）は
**表示しない**。表示ON/OFF・背景はレイアウトJSON（＝サーバー側・全端末共通）が
唯一の情報源になるため、端末ローカルのトグルと二重の情報源を持たせない
（矛盾した状態を防ぐための意図的な仕様）。

### 4-2. 共有レンダラー（`DisplayCanvas`）

エディタのプレビュー（§6-2）と表示画面本番が**ピクセル単位で同じ見た目**になることを
保証するため、自由配置の描画ロジックを1つの部品として切り出し、両方から import する。

```ts
// shared/src/client/live/DisplayCanvas.tsx（新設）
// 入力: レイアウトJSON + 現在の値（タイマー状態・視聴者数）→ 絶対配置で描画するだけの
// 純粋な表示部品。データ取得・ポーリング・Socket購読は一切持たない
// （TimerDisplayPage.tsx / エディタのプレビューがそれぞれ既存の手段でデータを取り、
//  この部品には値として渡すだけ）。

export interface DisplayCanvasProps {
  layout: DisplayLayout;
  timerDisplay: string;       // formatTimer 済みの文字列
  timerPhase: TimerPhase;
  progress: number | null;
  counts: { youtube: number; jstream: number; zoom: number; teams: number; total: number };
}

export function DisplayCanvas(props: DisplayCanvasProps): JSX.Element { /* ... */ }
```

- 色定数（フェーズ色・プラットフォーム色）もこのファイルに集約し、
  `TimerDisplayPage.tsx` に現状ハードコードされている `phaseBarColors` / `VIEWER_ITEMS`
  の色と**完全に同じ値**を参照する（値のズレを型で防げないため、実装PRでは既存の値を
  そのままここへ移すだけにし、新しい色は作らない）。
- ⚠️ **この新設ファイルは [`12-live-timer-decision.md`](12-live-timer-decision.md) §4-2 が
  「表示画面専用として凍結する」と定めた `client-live/src/lib/socket.ts` /
  `hooks/useTimer.ts` とは無関係。** `DisplayCanvas` はタイマー状態・視聴者数を
  値として受け取るだけの純粋な描画部品であり、Socket接続もタイマー取得ロジックも
  持たないため、あの凍結原則には抵触しない。
- `client-live`（表示画面）と `client-qsheet`（エディタ）はモノレポの別ワークスペースだが、
  どちらも `shared/` に依存しているので import は既存パターンと同じ形で問題ない。

---

## 5. リアルタイム性

### 5-1. 結論: リアルタイム反映はしない（案Aを採用・案Bの即時配信は不採用）

エディタでレイアウトを保存しても、**既に開いている表示画面（OBSのブラウザソース等）
には反映されない。次回そのページを開き直す（＝ブラウザソースを更新する）まで
古いレイアウトのまま。** Socket.IOでのレイアウト配信は行わない。

### 5-2. 根拠（両判定者の一致点）

判定者1・判定者2はいずれも、この要求文自体が名指しした事故シナリオ
（「配信中に画面が動くと事故になりうる」）に対して、**Socket配信を持たない案Aの方が
構造的に安全**と評価した。案Bは「保存の瞬間だけ配信・ドラッグ中は配信しない・進行中
タイマーへの保存に確認ダイアログを挟む」という緩和策を用意していたが、判定者2は
次のように指摘している:

> 「保存を押した瞬間に本番画面が即座に変わる」設計は、変更の反映タイミングを
> OBSオペレーター自身の手（リロード操作）から編集者側の手（保存ボタン）へ移してしまう。
> `phase !== 'idle'` の確認ダイアログはあるが、フェーズ判定のズレや、配信を見ていない
> 別担当者が保存する状況までは救えない。

加えて判定者2は、案Bが表示画面（無認証の公開ページ）から実際のタイマー制御が流れる
`/liveops` Socket名前空間へ新しいイベントハンドラを増設する点についても、
「例外処理が無いまま実装すると、想定外のペイロードで進行中の全番組のタイマー制御ごと
Node プロセスを巻き込みうる」と、REST の500より遥かに被害範囲が広いリスクとして
挙げている。**本書はこのリスクを取らない。**

- **本番中に画面が勝手に動くことは事故になりうる。** レイアウト編集は「配信前に
  画面を整える」性質の作業であり、視聴者数・タイマーのように「常に最新であるべき値」
  ではない。むしろ**配信中に予期せず動かないことの方が安全**。
- **既存の設計と一貫する。** 現行の固定3パターン切り替え・背景明暗トグルは
  そもそも「この端末にだけ覚えます」という**端末ローカルかつ非同期な**設計で、
  他の端末やSocket経由で同期されたことは一度もない。今回の「次回ロードで反映」は
  この既存の心理的モデルを維持したまま自由配置に拡張しただけで、新しいパラダイムを
  持ち込まない。
- **独立コピー方式（§2-1）とも整合する。** テンプレート編集は元々「適用済みの
  タイマーには波及しない」設計なので、リアルタイム配信を持たないことで生じる
  追加の制約は無い（案Aで懸念されていた「共有テンプレートの波及がリアルタイムに
  飛んだ場合の事故」は、独立コピー方式を採用した時点でそもそも解消している）。
- 運用上の反映手順は「OBSのブラウザソースを右クリック→更新」という、配信オペレーターに
  とって既知の操作で完結する。Socket.IOの新規配線（クライアント側の2本目の接続・
  サーバー側の新規イベントハンドラ）を持ち込まないため、実装・QAの範囲も小さく保てる。

---

## 6. エディタ画面（`client-qsheet`）

### 6-1. 置き場所とルーティング

| 画面 | 役割（モックアップ対応） | ルート | `:ownerKey` |
| --- | --- | --- | --- |
| レイアウトエディタ | `Main.dc.html` | `/qsheet/live/:ownerKey/timers/:timerId/layout` | あり（案件配下のタイマーを編集するため） |
| テンプレートライブラリ | `TemplateLibrary.dc.html` | `/qsheet/live-display-templates` | なし（全案件横断。既存の `/qsheet/live-org-settings` と同じ非 ownerKey パターン） |
| プレビュー | `DisplayPreview.dc.html` | 独立ルートを増やさない。エディタ内のプレビュー枠として `DisplayCanvas`（§4-2）を直接描画する | — |

- `LiveTimerAdminPage.tsx`（タイマー一覧）の各行に「レイアウト編集」ボタンを足し、
  上記エディタへ遷移する導線を追加する。
- テンプレートライブラリはエディタから `?fromTimer=<timerId>` 付きで開くと
  「現在のレイアウトを保存」タイル（モックアップにあるもの）が有効になり、
  それ以外（単独でライブラリを開いたとき）はこのタイルを出さない
  （保存先のタイマーが無いと成立しない操作のため）。

### 6-2. プレビューの方式（案Aを踏襲）

`DisplayPreview.dc.html` が求める「実際の会場モニター出力プレビュー」は、表示画面と
**同じ `DisplayCanvas` 部品**（§4-2）を使い、エディタ内の1280×720枠にそのまま描画する
ことで実現する。データ（タイマー状態・視聴者数）は `useLiveProgram`/`useTimer`
（qsheet側の既存フック）から通常どおり取得する。

⚠️ **プレビューはドラッグ中の値をリアルタイムには反映しない。** 要素をドラッグ・
リサイズしている間はエディタのキャンバス自体（＝編集操作のUI）が見た目のフィードバック
を兼ね、「プレビュー枠」は**直近に保存した状態**を描画する（保存→プレビューが再読込、
というワンテンポ挟む方式）。ライブに一致したドラッグ中プレビューを作るには編集中の
未保存状態をプレビュー枠にも配線する必要があり、実装・QAの複雑さが増す割に、
本番安全性（§5）には寄与しないため見送る。この判断の妥当性は §9 で利用者に確認する。

### 6-3. 権限

- 閲覧: `requirePermission('qsheet', 'reader')`。要素のドラッグ・リサイズ・保存・
  テンプレートの作成/更新/削除/適用は**すべて不可**（UIをdisabledにする、または
  そもそも編集系のボタンを描画しない）。
- 編集: `requirePermission('qsheet', 'manager')`。
- サーバー側は §6-4 のとおり `canWrite` で二重防御する
  （[`12-live-timer-decision.md`](12-live-timer-decision.md) §2-2 の「見えるのに
  押せない」を作らない原則と同じ考え方をここでも踏襲する）。
- エディタ画面（`Main.dc.html`相当）はドラッグ&リサイズ操作前提のため
  `client-qsheet/src/pcOnlyScreens.ts` の `QSHEET_PC_ONLY` に登録する。
  **テンプレートライブラリ（閲覧・適用のみ）はスマホ対応の対象とする**
  （§9で利用者に確認する）。

### 6-4. API

```ts
// server/src/contexts/liveops/routes/display-templates.routes.ts（新設）
import { Router } from 'express';
import { queryAll as query, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const canRead  = [requireAuth, requirePermission('qsheet', 'reader')] as const;
const canWrite = [requireAuth, requirePermission('qsheet', 'manager')] as const;

// 一覧（検索・使用件数つき）。使用件数 = このテンプレートを source_template_id に持つ、
// 削除されていないタイマーの件数（独立コピー後の同期は無いので、あくまで「現在この
// テンプレート由来と表示ラベルされているタイマーの数」であり、その後タイマー側を
// 手直しされていても数える。§9で利用者に確認する）。
router.get('/', ...canRead, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const params: string[] = [];
  let where = 'WHERE tpl.deleted_at IS NULL';
  if (q) { params.push(`%${q}%`); where += ` AND tpl.name ILIKE $${params.length}`; }
  const rows = await query(
    `SELECT tpl.*,
            (SELECT COUNT(*) FROM liveops_timer_display_layouts l
               JOIN liveops_timers t ON t.id = l.timer_id AND t.deleted_at IS NULL
              WHERE l.source_template_id = tpl.id) AS usage_count
       FROM liveops_display_templates tpl
       ${where}
       ORDER BY tpl.updated_at DESC`,
    params
  );
  res.json({ success: true, data: rows });
});

router.get('/:id', ...canRead, async (req, res) => {
  const row = await queryOne(
    'SELECT * FROM liveops_display_templates WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id]
  );
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: row });
});

// 作成（「名前を付けて保存」）
router.post('/', ...canWrite, async (req, res) => {
  const userId = (req as any).user?.id;
  const { name, layout } = req.body;
  if (!name || !layout) return res.status(400).json({ success: false, message: 'name and layout required' });
  const id = uuidv4();
  await execute(
    `INSERT INTO liveops_display_templates (id, name, layout, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$4)`,
    [id, name, JSON.stringify(layout), userId]
  );
  const row = await queryOne('SELECT * FROM liveops_display_templates WHERE id = $1', [id]);
  res.status(201).json({ success: true, data: row });
});

// 更新。独立コピー方式なので、これは「テンプレート自身の以後の適用結果」を変えるだけ
// ── 既に適用済みのタイマーには一切影響しない（§2-1）。
router.put('/:id', ...canWrite, async (req, res) => {
  const userId = (req as any).user?.id;
  const { name, layout } = req.body;
  await execute(
    `UPDATE liveops_display_templates SET
       name = COALESCE($2, name), layout = COALESCE($3, layout),
       updated_by = $4, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [req.params.id, name ?? null, layout ? JSON.stringify(layout) : null, userId]
  );
  const row = await queryOne('SELECT * FROM liveops_display_templates WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: row });
});

router.delete('/:id', ...canWrite, async (req, res) => {
  await execute(
    'UPDATE liveops_display_templates SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id]
  );
  res.json({ success: true });
});

// テンプレートを特定タイマーへ「適用」＝ layout をコピーして
// liveops_timer_display_layouts へ upsert する（独立コピー。以後テンプレートと非同期）。
router.post('/:id/apply', ...canWrite, async (req, res) => {
  const userId = (req as any).user?.id;
  const { timerId } = req.body;
  if (!timerId) return res.status(400).json({ success: false, message: 'timerId required' });
  const tpl = await queryOne(
    'SELECT layout FROM liveops_display_templates WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id]
  );
  if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });
  await execute(
    `INSERT INTO liveops_timer_display_layouts (timer_id, layout, source_template_id, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (timer_id) DO UPDATE SET
       layout = EXCLUDED.layout,
       source_template_id = EXCLUDED.source_template_id,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [timerId, JSON.stringify((tpl as any).layout), req.params.id, userId]
  );
  res.json({ success: true });
});

export default router;
```

`server/src/contexts/liveops/index.ts` に1行追加してマウントする
（既存の `router.use('/liveops/...', ...)` の並びに揃える）:

```ts
import displayTemplatesRoutes from './routes/display-templates.routes';
// ...
router.use('/liveops/display-templates', displayTemplatesRoutes);
```

タイマー個別の直接編集（テンプレートを介さず「このタイマーだけ」ドラッグして保存する
操作。§3-1の公開GETと対になる書き込み側）は `timers.routes.ts` に1本足す:

```ts
// PUT /api/v1/internal/liveops/timers/:id/layout（認証あり・canWrite）
// エディタでの直接編集の保存。テンプレート適用（§6-4 の /apply）とは別経路。
router.put('/:id/layout', ...canWrite, async (req, res) => {
  const userId = (req as any).user?.id;
  const { layout } = req.body as { layout?: DisplayLayout };
  if (!layout || !Array.isArray(layout.elements)) {
    return res.status(400).json({ success: false, message: 'layout.elements required' });
  }
  await execute(
    `INSERT INTO liveops_timer_display_layouts (timer_id, layout, source_template_id, updated_by, updated_at)
     VALUES ($1, $2, NULL, $3, NOW())
     ON CONFLICT (timer_id) DO UPDATE SET
       layout = EXCLUDED.layout,
       source_template_id = NULL,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [req.params.id, JSON.stringify(layout), userId]
  );
  res.json({ success: true, data: layout });
});

// DELETE /api/v1/internal/liveops/timers/:id/layout（認証あり・canWrite）
// 「未設定に戻す」＝ 固定3パターン描画へ戻す。
router.delete('/:id/layout', ...canWrite, async (req, res) => {
  await execute('DELETE FROM liveops_timer_display_layouts WHERE timer_id = $1', [req.params.id]);
  res.json({ success: true });
});
```

（`PUT`/`DELETE /:id/layout` は §3-1 の `GET /:id/layout` と同じパスだが、契約テストが
監視するのは `'/:id/display'`（完全一致文字列）だけなので、この新設パス群は無関係。）

---

## 7. PR分割案

各PRの検証項目に **`npm run test`（`liveDisplayContract.test.ts` を含む）green** を
必ず明記する。

| PR | 内容 | 触るファイル | 契約テストへの影響 |
| --- | --- | --- | --- |
| PR1 | migration 233（テーブル2本のみ）。サーバーAPI: `GET/PUT/DELETE /:id/layout`（`timers.routes.ts` に追記）、`display-templates.routes.ts` 新設＋`liveops/index.ts` へのマウント | `server/.../migrations/233_*.sql`、`timers.routes.ts`、新設ファイル、`liveops/index.ts` | 既存 `GET /:id/display` の宣言行・SQL本体はどちらも無変更（§3-2 の判断どおり別ルートに分離したため）。**`liveDisplayContract.test.ts` green を明記**。`git diff --stat` に `TimerDisplayPage.tsx`・`App.tsx`・`client-live/src/lib/socket.ts`・`hooks/useTimer.ts` のいずれも出ていないことを確認する。新規: レイアウトCRUD・適用のユニットテスト |
| PR2 | 共有レンダラー・型（`shared/src/client/live/{displayLayout,DisplayCanvas}.tsx`）＋ `TimerDisplayPage.tsx` を `GET /:id/layout` 対応に変更（フォールバック込み） | `shared/src/client/live/*`、`client-live/src/pages/TimerDisplayPage.tsx` | **本設計で唯一 `TimerDisplayPage.tsx` を触るPR。** §1-2 の上書き経緯をPR説明に明記。`liveDisplayContract.test.ts` green を最重要検証項目にする。既存タイマー（layout未設定）が旧来と1px単位で同じに見えることを検証環境で目視確認する |
| PR3 | `client-qsheet` にレイアウトエディタ・テンプレートライブラリを新設（`Main.dc.html`/`TemplateLibrary.dc.html` 相当）＋ `LiveTimerAdminPage.tsx` からの導線 | `client-qsheet/src/pages/live/*` | 表示画面ファイルは対象外。`liveDisplayContract.test.ts` は無関係だが green のまま維持されることを確認。`pcOnlyScreens.ts` 登録（エディタのみ）・`check-mobile-declared.mjs` green |

各PRの `docs/changelog.d/<枝の名前>.md` は1文ずつ（ルート `CLAUDE.md` のブランチ運用
ルールどおり）。

---

## 8. リスクと対処・ロールバック

| # | リスク | 対処 |
| --- | --- | --- |
| 1 | 不正な形の `layout` JSON（要素の型が想定外・座標が数値でない等）で表示画面がクラッシュする | クライアント側（`DisplayCanvas` の直前）でレイアウトを軽くvalidateし、不正なら未設定扱いにして固定3パターンへフォールバックする |
| 2 | 新設 `GET /:id/layout` の不具合が既存の生命線（`programId`解決・視聴者数取得）を巻き込む | §3-1・3-2のとおり別エンドポイントに分離済み。`try/catch`で500に丸め、他の2本のAPIとは独立して失敗する |
| 3 | 無認証 `GET /:id/layout` の追加で新しい情報が漏れる | §3-3のとおり、既に無認証で見える描画結果と同質の情報であり、追加の機密性は無いと評価。読み取り専用のまま・書き込み経路は増やさない |
| 4 | テンプレートの一括修正（誤字・ブランド色変更等）をしたい場面で、独立コピー方式のため各タイマーへ手動で再適用する運用コストが発生する | 許容する（§2-1で選んだトレードオフ）。テンプレート一覧に「最終更新日」を出し、古いテンプレートから作られたタイマーは再適用を促す運用でカバーする（実装PRの対象外・運用ガイドとして案内） |
| 5 | PR2（`TimerDisplayPage.tsx` 変更）で本番の表示画面が壊れる | 影響が出た場合は PR2 単体を `git revert` すれば、`layout` 取得を呼ばない旧コードに戻る（DBの新テーブルはそのまま残るが、参照されなくなるだけで無害）。契約テストの5項目は変更していないため、他の依存箇所（`App.tsx`の分岐・サーバー側の認可）への影響は無い |
| 6 | migration 233 自体の後方互換 | 新設テーブル2本のみで、既存テーブルへの `ALTER`/`DROP`/`RENAME` を含まない。ロールバック（down）は不要（新テーブルを参照しなくなるだけで旧コードはそのまま動く） |
| 7 | テンプレート削除時、「使用件数」に表示されていたタイマーが混乱する | 独立コピー方式なので実害は無い（表示は変わらない）。削除操作の確認ダイアログに「適用済みのタイマー◯件の表示は変わりません（ラベルが消えるだけです）」と明記する（PR3） |

**ロールバック**: PR1・PR3は新規追加のみなので revert すれば跡形も無く消える
（既存機能への影響ゼロ）。PR2は「layoutが取得できない場合は自動的にレガシー描画に落ちる」
設計のため、緊急時は `GET /:id/layout` の呼び出し元を握りつぶして常に `null` 扱いにする
1行revertでも十分に効く。

---

## 9. 利用者に確認すべきこと

1. **独立コピー方式（§2-1）でよいか。** テンプレートを一括修正したい運用ニーズ
   （誤字・ブランド色変更等）がある場合、各タイマーへの再適用は手動になる
   （§8のリスク4）。頻度が高いようなら、案Aの「共有参照」方式や、
   「このテンプレート由来のタイマーへ一括再適用」ボタンの追加を再検討する。
2. **プレビューは「保存後の状態」を表示する設計（§6-2）でよいか。** ドラッグ中に
   リアルタイムでプレビュー枠が追従する体験は、本設計では持たない。
3. **エディタ本体（`Main.dc.html`相当）をPC専用にする判断でよいか。** テンプレート
   ライブラリはスマホ対応の対象とするが、ドラッグ&リサイズ操作の375px幅対応は
   工数が別途かかるため、本書のスコープには含めていない。
4. **テンプレート削除時、それを参照していた（ラベルとして持っていた）タイマーの
   表示自体は変わらない（§2-1・§8のリスク7）という理解でよいか。** 独立コピー方式のため
   実害は無いが、「削除しても表示テンプレートを使っているタイマーの表示は変わらない」
   ことを削除確認ダイアログに明記する想定。
5. **要素キー（timer/youtube/jstream/zoom/teams/total）の6種固定でよいか、将来
   フリーテキスト要素などの拡張余地を残すべきか。** §2-2のJSON構造は今回の6種固定を
   前提にしており、将来の拡張は別途スキーマ変更が要る。

---

## 10. 参照

- モックアップ（Claude Design Artifact）: 「計時・視聴者 表示レイアウト」
  https://claude.ai/code/artifact/76321518-c694-4c9f-b397-d66256601a13
  （`Main.dc.html` / `TemplateLibrary.dc.html` / `DisplayPreview.dc.html`）
- [`12-live-timer-decision.md`](12-live-timer-decision.md) — ミニアプリ化段階統合設計。
  権限区画統合（migration 232）・`client-qsheet`側の運用画面構成・
  「表示画面専用ファイルには1文字も触れない」原則（§4-2）の前提
- `client-live/CLAUDE.md` — 「`TimerDisplayPage.tsx`は触らない」の現状記述
  （本書§1-2のとおり、今回の機能追加はユーザーの明示的な指示による上書きとして扱う）
- `client-live/src/pages/TimerDisplayPage.tsx`（実際に読んで確認: 347行、
  `phaseBarColors`/`VIEWER_ITEMS`の色定数・`storageKey`パターンの出典）
- `server/src/contexts/liveops/routes/timers.routes.ts`（実際に読んで確認:
  `GET /:id/display`の無認証実装・`canRead`/`canWrite`パターンの出典）/
  `snapshots.routes.ts` / `server/src/contexts/liveops/index.ts`
- `shared/tests/liveDisplayContract.test.ts` — 5項目を固定する契約テスト
  （実際に読んで確認: `'/:id/display'`は完全一致文字列検索のため、
  `/:id/layout`のような別名の新設ルートは抵触しない）
- `server/src/shared/db/migrations/{052_liveops_schema,221_liveops_server_measure,
  232_consolidate_liveops_into_qsheet}.sql` — DDL・型（`TIMESTAMP`統一）の出典
