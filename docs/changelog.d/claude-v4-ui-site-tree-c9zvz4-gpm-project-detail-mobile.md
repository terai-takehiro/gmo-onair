**③ プロジェクト詳細（GPM・7タブ）を実測してスマホに開放した**
（`docs/v4-native-ui-audit-2026-08-20.md`「③ プロジェクト詳細」の指摘に対応）。

実装を読むと、`pcOnlyScreens.ts` の理由文「工程表と体制図が横に伸びる画面です」は
実測に基づかない一文で、案件管理の「顧客」「取引先マスター」がM10で同種の理由を
書き直した前例と同じパターンだった。7タブを1つずつ確かめた:

- **概要（工程）・未確認事項・体制・議事録・書類の5タブ**は実装済みの
  `Row stackOnMobile`／`hideOnMobile`（`PhaseRows.tsx`／`TaskRows.tsx`／
  `OpenItemRows.tsx`／`FolderCard`）とカードグリッド（`MembersTab.tsx`の
  `sm:grid-cols-2 lg:grid-cols-3`）で375pxでも崩れないことを実測で確認した。
- **見積タブ**は一覧の`<Row>`に`stackOnMobile`が付いておらず、固定4列
  （提出先72＋状態72＋金額128＋PDFボタン56）だけで408pxと375px幅を
  最初から超える崩れを実測で発見し、`stackOnMobile`を足して解消した。
- **請求タブ**だけは、案件と共用の`BusinessProjectView`（2,042行・月次の
  請求・入金を横に並べる未対応の表）を1行も変えずに呼んでおり、今回は
  スマホに出さないまま残した。

`/gpm/projects/:id`・`/gpm/projects/:id/:tab`を`CLIENT_PC_ONLY`から
`CLIENT_MOBILE_OK`へ移した。7タブの切替は案件詳細⑥の`MOBILE_TABS_BY_PHASE`と
同じ考え方で、プロジェクトの段階（一覧・ダッシュボードと共通の`STAGE_GROUPS`を
流用）ごとに3つへ絞る仕組み（`projectDetail/DetailHeader.tsx`の
`MOBILE_TABS_BY_PHASE`）を新設した: 準備中＝概要／見積／未確認事項、
進行中＝概要／未確認事項／体制、完了・見送り＝概要／議事録／書類。段階に
無いタブのURLを直接開いたときは概要へ自動で戻し（案件詳細⑥と同じ
「2種類の『開けない』を混ぜない」設計）、請求だけは常に「PCで見る画面です」
の案内（`PcOnlyPanel`・「それでもこのまま開く」で解除可）に倒す。PC（7タブの
横スクロール）は変えていない。データの出どころ・APIは変えていない。

検証: `npx tsc -b client` / `npm run lint`（`check-mobile-declared.mjs`・
`check-links.mjs`含む） / `npm run test`（1144件）OK。
`npm run verify:up` + `npm run dev -w server` + `npm run dev -w client` +
Playwright（375px・`x-user-id`ヘッダーでのモック認証）で実ブラウザ確認も
実施: `gpm-1`（進行中・a_won）と`gpm-2`（準備中・c_proposal）の両方で
概要／未確認事項／体制／見積の各タブが横スクロール・要素はみ出し0pxで描画され、
段階に無いタブへの直接アクセスが概要へリダイレクトされ、請求タブでPC専用の
案内が正しく出ることを確認した。
