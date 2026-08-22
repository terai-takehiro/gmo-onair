# レンタル機材スクレイパー — 常駐コンテナ（1日1回クロールして Postgres へ同期する）
#
# GHCR には積まない小さな Python イメージ。docker-compose 側で `build:` として
# VPS 上でその場ビルドする（本体アプリの Node イメージのような GHA での
# ビルド・GHCR push は行わない — 頻繁に変わらない・ビルドが軽いため）。
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ⚠️ **ファイル名を1つずつ並べないこと。** 以前ここは
#   `COPY common_db.py toc_scraper.py ... scheduler.py ./`
# と個別列挙していたため、新しく足した sync_requests.py（手動「今すぐ取得」の
# キュー処理）を書き忘れ、検証環境のコンテナが
#   ModuleNotFoundError: No module named 'sync_requests'
# で約4時間クラッシュし続けた（その間クロールは1件も走っていない）。
# ディレクトリ内の .py を丸ごと入れておけば、モジュールを増やしてもここは直さなくてよい。
COPY *.py ./

# scheduler.py がコンテナのメインプロセス。ログはそのまま stdout に出るので
# `docker logs` で読める（system cron のように別ファイルへ吐かせて回収する手間がない）。
CMD ["python3", "scheduler.py"]
