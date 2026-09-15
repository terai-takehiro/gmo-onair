**営業活動記録の「案件」プルダウンが一部の案件を出せず、終了した案件まで並んでいたのを直した**（利用者指摘）。
①`ActivityLogDialog.tsx` は `GET /projects?limit=200` を使っていたため、案件が200件を超えるとそれ以降が
プルダウンに一切出せなかった（この一覧に検索欄は無く、全件から選ぶ作りのため）。②完了・失注（`TERMINAL_STAGES`）の
案件まで並び、選ぶときにゴミ案件が混ざって見えた。③並び順がステージ順で案件日と無関係だった。
`registerable-projects` などと同じ「絞ってから全件返す」専用口 `GET /projects/activity-log-projects`
（`ProjectService.getActivityLogProjects`）を新設し、終了2ステージだけ除いた全件を**案件日
（`event_start`）が近い順**（`ASC NULLS LAST`。`DEFAULT_SORT_SQL` と同じ書き方）で返すようにした。
検証: `npx tsc -b client server`。
