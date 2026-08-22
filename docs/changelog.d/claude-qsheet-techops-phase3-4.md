**qsheet→techops移行 Phase 3（Socket.IOブリッジ）・Phase 4（MCPツール名の二重登録）を実装した。**

- **Phase 3**: Socket.IOはHTTPと違い単純な二重マウントができない（ネームスペースが違うと
  同名ルームでも別集合になり、片方へのブロードキャストがもう片方に届かない）ため、
  `/qsheet`・`/techops` の両ネームスペースを同じハンドラで待受し、ルームをまたいで
  イベントを中継する「ブリッジ」（`server/src/contexts/qsheet/socket.ts`）を実装した。
  旧ビルドのタブ（`/qsheet` に接続したまま）と新ビルドのタブ（`/techops`）が同じ台本を
  同時に開いていても yjs:update / awareness:update / presence:sync / cue:* が双方に届く。
  クライアント（`client-techops/src/lib/socket.ts`）は新規ビルドから `/techops` に接続する。
  - **実 Postgres + 実 http サーバー + 実 socket.io-client 2本でブリッジの動作を検証した**
    （`scripts/dev-verify/socket-bridge-check.mjs`。新設・再利用可能な手動検証ツール）。
    在席表示・cue同期・Yjs同期の中継すべてが両ネームスペース間で正しく届くことを確認済み
  - この検証中に見つけた既存の穴（不正な yjs:update バイナリを受けるとサーバープロセスが
    丸ごと落ちる。qsheetだけでなく案件の共同編集とも共有する `roomManager.ts` が対象）も
    ついでに直した（`applyUpdate` に try/catch を追加）
- **Phase 4**: MCPツール5本（`get_qsheet`/`find_similar_qsheets`/`create_qsheet`/
  `propose_qsheet_draft`/`discard_qsheet_proposal`）を `get_sheet`/`find_similar_sheets`/
  `create_sheet`/`propose_sheet_draft`/`discard_sheet_proposal` へ改名し、旧名も同じ実装で
  二重登録した（MCPプロトコルにエイリアス機構が無いため）。`gate.ts` の
  `WRITE_TOOL_PERMISSIONS` にも新旧両方を登録（片方だけ登録すると旧名が権限ゲート無しで
  通ってしまう）。`docs/mcp-server.md` を更新
- Socket.IOネームスペースの撤去（`/qsheet` を外す）・MCPツール旧名の撤去は、
  観測期間を置いてから別途判断する（`docs/reviews/qsheet-techops-migration-plan.md` §6）
- 検証: `npx tsc -b`（全ワークスペース）/ `npm run test`（1452件）/ `npm run lint` /
  `node scripts/generate-mcp-tools.mjs`（権限ゲート検証OK・新旧とも正しくread/write判定）
