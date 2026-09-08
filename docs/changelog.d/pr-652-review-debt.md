**PR #652（リリース v4.6.7 の版上げ）のレビュー指摘を棚卸しに移した**（[docs/branching.md](../branching.md)「マージしたら、その PR のレビューを棚卸しに移す」）。📝 Code Review は Codex の usage limits で一度も実行されず、🔒 Security Review は最初のコミットでのみ完了して findings なし。CI 修正で足した2つ目のコミットにはどちらのレビューも再実行されておらず、その旨を [docs/reviews/codex-findings-v4.md](../reviews/codex-findings-v4.md) に記録した（**表に移す未対応の指摘は無い**）。

あわせて、#652 で直った `npm run lint` の `check-changelog.mjs` の不具合も記録する — リリースPRの版チェック除外が「枝の名前が `release/` で始まる」ときにしか効かず、Claude Code の Web セッションが作る `claude/release-version-update-<乱数>` のような固定形の枝ではリリースPRでも通常の作業PRと誤判定されて CI の `checks` が落ちていた。判定を「枝のいずれかのセグメントの先頭が `release`」に緩め、`claude/release-…` も拾うようにした。

検証: `npm run check:version`・`RELEASE=1 npm run lint`・`npm run test`（shared Vitest 164ファイル/2269件）。
