**営業活動記録の「案件」プルダウンが一部の案件を出せず、終了した案件まで並んでいたのを直した**（利用者指摘）。
①`ActivityLogDialog.tsx` は `GET /projects?limit=200` を使っていたため、案件が200件を超えるとそれ以降が
プルダウンに一切出せなかった（この一覧に検索欄は無く、全件から選ぶ作りのため）。②完了・失注（`TERMINAL_STAGES`）の
案件まで並び、選ぶときにゴミ案件が混ざって見えた。③並び順がステージ順で案件日と無関係だった。
`registerable-projects` などと同じ「絞ってから全件返す」専用口 `GET /projects/activity-log-projects`
（`ProjectService.getActivityLogProjects`）を新設し、終了2ステージだけ除いた全件を**案件日
（`event_start`）が近い順**（`ASC NULLS LAST`。`DEFAULT_SORT_SQL` と同じ書き方）で返すようにした。

同じ利用者から「他の同種のプルダウンも揃えてほしい」との追加指摘があり、お客様詳細（顧客360）の
「やり取りを記録」ダイアログ（`ActivityFormDialog.tsx`）の案件プルダウンも同じ穴を持っていたので直した。
こちらは同じ顧客の案件だけ（元から `GET /customers/:id/overview` が返す小さい配列）なので200件超の
問題は無いが、完了・失注まで並び、並び順も「進行中優先→実施日降順」で近い順ではなかった。この一覧は
同じ画面の「案件」セクション（履歴として完了・失注も見せるのが正しい）とデータを共有しているため、
API 側は変えずダイアログ側だけで終了2ステージを除いて案件日が近い順に並べ替えるようにした。

他の案件プルダウン（`registerable-projects`・`won-projects`・`gls-projects` を使う仕入・売上・書類引き渡し等、
検索欄付きの `MeetingRecordPage.tsx`・`StudioBookingDialog.tsx`、既に終了除外＋近い順を満たしている
`AddTaskDialog.tsx`）は、それぞれ別の理由で完了案件を含める設計（過去の利用者判断）か、既に同じ並びを
満たしているため変えていない。

検証: `npx tsc -b client server`・`npm run test`（shared Vitest 2468件 + server レビュー試験94件、いずれも0件失敗）。
