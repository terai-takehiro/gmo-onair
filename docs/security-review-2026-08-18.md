# セキュリティレビュー（2026-08-18）

## 結論

認証・権限、HTTP/Socket.IO の Origin 制限、JWT 秘密鍵の本番必須化、Helmet、SQL の
プレースホルダー利用、アップロード容量制限など、主要な防御は実装されている。一方、
ユーザー指定 ICS URL の取得に **SSRF（高）** があり、本レビュー内で修正した。残課題は
CSRF の多層防御、公開 CG API の公開データ契約、コンテナ権限、認証情報の取り扱いである。

## 対象と手法

- 対象: Express API、Socket.IO、全 React クライアント、PostgreSQL migration、MCP/OAuth、
  Nginx、Docker/Compose、依存 lockfile、外部 API・ファイルアップロード経路。
- 手法: 認証・認可境界の静的追跡、危険 API/秘密情報パターン検索、公開ルートの確認、
  SSRF/XSS/SQL injection/CSRF/IDOR/ファイル処理/運用設定のレビュー、TypeScript 検査。
- 制約: 稼働環境への侵入試験、実 DB データ・クラウド IAM・Nginx 実効設定・バックアップの
  復元試験は未実施。npm advisory API が HTTP 403 を返したため、依存脆弱性のオンライン照合は
  完了していない。

## 検出事項

### SEC-01（高・修正済み）ユーザー指定 ICS URL による SSRF

`partner_schedule` editor は任意の HTTPS URL を登録でき、サーバーが即時および15分ごとに
取得していた。スキームだけを検査していたため、`https://127.0.0.1`、クラウドのメタデータ、
社内サービス、public DNS から private IP への解決、リダイレクト/DNS rebinding を通じて
内部ネットワークへアクセスできた。

**対応:** 登録時に localhost と private/reserved IP literal を拒否し、実取得でも専用 HTTPS
agent が接続ごとの DNS 解決結果を検査する。リダイレクト先にも同じ agent が適用されるため、
登録時検査だけに依存しない。HTTPS と取得サイズ・タイムアウトの既存制限は維持した。

### SEC-02（中）Cookie 認証の CSRF 防御が SameSite のみに依存

認証 Cookie は `HttpOnly` / `Secure`（本番）/ `SameSite=Lax` だが、状態変更 API 全体に
Origin/Referer 検証または CSRF token はない。さらに Cookie は `.gmo-onair.jp` へ共有される。
同一サイト配下の別サブドメインが侵害された場合、SameSite は防御境界にならず、CORS も
ブラウザがレスポンスを読めなくする仕組みであって送信自体を止めない。

**推奨:** Cookie で認証された POST/PUT/PATCH/DELETE に厳密な Origin 検証を共通 middleware
として追加する。可能なら host-only Cookie に分割し、共有が必須なら double-submit token も
追加する。Bearer/MCP/webhook/OAuth callback は明示的に適用除外する。

### SEC-03（中）公開 CG API が `SELECT *` を公開契約にしている

Awards/Quiz の出力 URL は認証不要で、連番 ID を指定してイベント、候補、得票数、cue 状態を
取得できる。出力用途として公開自体は必要だが、`SELECT *` のため migration で列を追加すると
レビューなしに公開情報が増える。非公開・公開済みを示す capability token / publish flag もない。

**推奨:** 公開 DTO の列を列挙し、イベントごとの高エントロピーな出力 token または明示的な
`published` 状態を必須にする。公開レスポンスには `Cache-Control: no-store` と一貫した
`X-Robots-Tag` を付ける。

### SEC-04（中）実行コンテナが root のまま

production stage に `USER` 指定がなく、Node/画像・音声・文書パーサの脆弱性が悪用された際の
コンテナ内権限が不要に大きい。Compose にも read-only root filesystem、capability drop、
`no-new-privileges` がない。

**推奨:** 専用 UID/GID を作成し、必要な upload ディレクトリだけを書き込み可能にして `USER`
を指定する。Compose では `cap_drop: [ALL]`、`security_opt: [no-new-privileges:true]`、可能なら
`read_only: true` と tmpfs を使用する。

### SEC-05（中）OTP と招待 token が DB に平文保存

SMS OTP と招待 token は DB 漏えい時にそのまま利用できる。OTP は5分、招待は7日有効で、
招待 token は URL に入るためプロキシ・ブラウザ履歴等にも残り得る。

**推奨:** token は SHA-256/HMAC digest のみ保存して提示値を定数時間比較する。OTP は user ID
単位の試行回数も DB に記録し、成功・期限切れを含めて確実に無効化する。招待受理ページは
`Referrer-Policy: no-referrer` と `Cache-Control: no-store` を使用する。

### SEC-06（低）MCP API key の query parameter 対応

互換性のため `?key=` を受理しており、URL がアクセスログ、履歴、監視、Referer に残る可能性が
ある。ドキュメントでリスクは説明されているが、運用上の漏えい面は残る。

**推奨:** OAuth または Authorization header を標準にし、query key は期限付き・scope 付きの
別 token にするか廃止期限を設ける。少なくとも Nginx/アプリ/APM ですべての query string を
マスクする。

### SEC-07（低）依存監査の fail-closed な CI が確認できない

lockfile は存在するが、今回の `npm audit --omit=dev` は registry advisory endpoint の 403 で
完了できなかった。Docker production stage は server の lockfile を使わず `npm install
--omit=dev` を実行するため、ビルド時刻により解決結果が変わる余地もある。

**推奨:** CI から利用可能な advisory/SCA（Dependabot 等）を必須化し、production image も
root lockfile から `npm ci` で再現可能にする。イメージ自体も Trivy/Grype 等で検査する。

## 確認できた防御

- 本番は JWT secret（32文字以上）、DB URL、CORS origin の欠落で fail fast する。
- JWT は Cookie または Bearer から検証し、ユーザーを DB から再取得するため、削除済みユーザーを
  token だけで継続利用しない。モジュール権限は共通のレベル判定へ集約されている。
- Helmet CSP/HSTS、CORS allowlist、Socket.IO handshake の Origin allowlist がある。
- 認証・OTP endpoint に rate limit、パスワードに bcrypt、Cookie に HttpOnly/Secure/SameSite がある。
- SQL の通常入力は query parameter 化され、アップロードは主に memory storage と容量上限を使う。
- secret pattern 検索では追跡対象ファイルに実鍵を検出せず、追跡中の環境ファイルは
  `.env.example` のみだった。

## 優先順位

1. **完了:** SEC-01 をデプロイし、内部 IP・DNS rebinding・redirect の拒否を結合テストする。
2. **次スプリント:** SEC-02（Origin/CSRF）と SEC-03（公開 DTO/token）を実装する。
3. **次回リリース:** SEC-04（non-root）と SEC-05（token digest）を実装する。
4. **継続改善:** SEC-06/07、DAST、復元試験、クラウド IAM/secret rotation を運用手順へ組み込む。
