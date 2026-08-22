検証環境のレンタル機材スクレイパー（`rental_scraper_dev`）が「数時間経っても1件も捕捉できていない」と報告があり調査した結果、コンテナが起動直後にクラッシュし続けていたことが原因と判明した。`Dockerfile` の `COPY` がファイル名を1つずつ列挙する書き方だったため、PR #307 で足した `sync_requests.py`（手動「今すぐ取得」のキュー処理）だけがイメージに入っておらず、`scheduler.py` が `ModuleNotFoundError: No module named 'sync_requests'` で即死 → `restart: unless-stopped` で再起動を繰り返し、クロールが1回も走っていなかった。`docker compose up -d` はプロセスが直後に落ちても成功を返すため、デプロイのログは「✓ rental_scraper_dev 起動」と出ており、画面側も行が0件の会社は取得状況の欄から消える作りだったため、この形の失敗に気づく手段がどこにも無かった。

直したこと:
- `Dockerfile` を `COPY *.py ./` に変え、新しいモジュールを足しても取りこぼさないようにした。取りこぼし自体を検査する `test_dockerfile.py` を追加
- CI（`.github/workflows/ci.yml` の checks）に `rental-scraper` の単体テスト実行と `import scheduler` のスモークを追加した。**それまで CI は Python を1行も見ていなかった**
- `deploy.yml` はコンテナ起動後に `docker inspect` で state・再起動回数を確認し、生きていなければ Actions の注釈（`::warning::`）を出すようにした（`docker compose up -d` の成功表示だけに頼らない）
- 本体アプリの取得状況（`GET /qsheet/rental/sync-status`）は、行が0件の会社も「未取得」として必ず1行返すようにした（`rental.service.ts` の `getSyncStatus`）。以前は0件の会社が欄から消え、画面から見ても「何も分からない」状態だった

あわせて、根本原因とは別に見つけた「完走しないと画面に何も出ない」問題も直した。1回のクロールは数十分〜1時間超かかる一方、`rental_scraper_dev` は main へのマージのたびに作り直されるため、マージが立て込む日は永久に完走できない可能性があった。ステージング SQLite を永続ボリューム（`rental_scraper_data:/data`）に置き、`run_all.py` が1社終わるごと・クロール中も100件ごとに Postgres へ同期するようにした。これに伴い、`status`（掲載中/掲載終了）の判定を「company ごとの最新 last_seen との一致」という時刻推定から、SQLite `items.status` 列を明示的に持つ方式に変更した（時刻推定のままだと、途中で止まった回を同期すると未訪問の商品まで missing に倒れて画面から機材が消えるため）。

検証: `rental-scraper` の単体テスト19件（追加分含む）が通ることを確認。`sync_requests` を含む全モジュールの import スモークも確認。`server` の型チェック・対象ファイルの lint も確認。実 Postgres・実サイトへの疎通はこのセッションのサンドボックスでは行えないため未確認（検証環境へのデプロイ後、コンテナの state と再起動回数、および実際にクロールが進むことをログで確認する必要がある）。
