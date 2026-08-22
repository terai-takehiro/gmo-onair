# レンタル機材スクレイパー — 常駐コンテナ（1日1回クロールして Postgres へ同期する）
#
# GHCR には積まない小さな Python イメージ。docker-compose 側で `build:` として
# VPS 上でその場ビルドする（本体アプリの Node イメージのような GHA での
# ビルド・GHCR push は行わない — 頻繁に変わらない・ビルドが軽いため）。
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY common_db.py toc_scraper.py restar_scraper.py sync_to_postgres.py run_all.py scheduler.py ./

# scheduler.py がコンテナのメインプロセス。ログはそのまま stdout に出るので
# `docker logs` で読める（system cron のように別ファイルへ吐かせて回収する手間がない）。
CMD ["python3", "scheduler.py"]
