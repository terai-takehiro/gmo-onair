#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dockerfile がこのディレクトリの .py を全部イメージへ入れているかの検査。

⚠️ **これは実際に踏んだ事故の再発防止テスト**（2026-08-22）。
Dockerfile の COPY はファイル名を1つずつ並べる書き方だったため、新しく足した
`sync_requests.py`（手動「今すぐ取得」のキュー処理）を書き忘れ、検証環境の
コンテナが `ModuleNotFoundError: No module named 'sync_requests'` で
約4時間クラッシュし続けた。その間クロールは1件も走っていないのに、デプロイの
ログは「✓ rental_scraper_dev 起動」と出ていた（`docker compose up -d` は
プロセスが直後に落ちても成功を返すため）。
"""
import pathlib
import unittest

HERE = pathlib.Path(__file__).resolve().parent


def copied_py_targets() -> tuple[set, bool]:
    """Dockerfile の COPY 行から「明示的に並べられた .py」と
    「*.py のワイルドカードが使われているか」を取り出す。"""
    named = set()
    has_glob = False
    for line in (HERE / "Dockerfile").read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped.startswith("COPY "):
            continue
        # 最後のトークンはコピー先。それ以外がコピー元
        for token in stripped.split()[1:-1]:
            if token == "*.py":
                has_glob = True
            elif token.endswith(".py"):
                named.add(token)
    return named, has_glob


class DockerfileCopiesEveryModuleTest(unittest.TestCase):
    def test_every_python_file_reaches_the_image(self):
        named, has_glob = copied_py_targets()
        if has_glob:
            return  # *.py で丸ごと入るので、モジュールを増やしても取りこぼさない

        modules = {p.name for p in HERE.glob("*.py")}
        missing = modules - named
        self.assertEqual(
            missing, set(),
            "Dockerfile の COPY に入っていない Python ファイルがあります: "
            f"{sorted(missing)}。コンテナ起動時に ModuleNotFoundError で"
            "クラッシュし続けます。COPY *.py ./ にするか、ここへ足してください",
        )


if __name__ == "__main__":
    unittest.main()
