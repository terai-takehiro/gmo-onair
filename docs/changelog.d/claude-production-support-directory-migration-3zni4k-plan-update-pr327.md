**qsheet移行計画を、並行してマージされた「計時・視聴者のミニアプリ化フェーズ2」（PR #327）
の内容を反映して更新した**（コード変更なし）。`client-live`の運用画面が`/qsheet/live/*`系
5ルートとして`client-qsheet`へバンドル統合されたこと、`permissionModule: 'liveops'`が
ユーザーの明示的決定で`'qsheet'`へ統合されたこと（migration 232）を検知し、
[docs/reviews/qsheet-techops-migration-plan.md](../reviews/qsheet-techops-migration-plan.md)
の§2・§3-2・§7・§6を更新。§7で引用していた「識別子は表示名変更では変えない」という
前例の記述を「表示名変更のみが動機のときは変えない」という条件付きの基準に修正し、
`client-live`の空洞化・将来削除とtechopsリネームのタイミング調整を新規の要判断事項として
§6に追加した。DBオブジェクト数・サーバールートマウント数に変化はないことも確認済み。
