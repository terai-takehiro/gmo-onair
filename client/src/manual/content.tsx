// client/src/manual/content.tsx — 案件管理アプリの利用マニュアル コンテンツ
// shared/src/client/manual/ManualModal に渡す ManualContent データ。
// 画面が変わったらここを更新すればマニュアルにも反映される。
import {
  LayoutGrid,
  Workflow,
  PanelLeft,
  FolderKanban,
  FilePlus2,
  Hash,
  TrendingUp,
  Film,
  GitBranch,
  FileText,
  KanbanSquare,
  ClipboardList,
  BarChart3,
  Store,
  Receipt,
  ShoppingCart,
  Truck,
  FlaskConical,
  Calendar,
  MonitorPlay,
  UserCog,
  Database,
  HardDrive,
  Settings,
  Search,
  HelpCircle,
} from "lucide-react";
import type { ManualContent } from "@gmo-onair/shared/src/client/manual/types";

export const SALES_MANUAL: ManualContent = {
  appLabel: "案件管理",
  appIcon: FolderKanban,
  intro:
    "GMO ONAiR の中核アプリです。案件（ヨミ〜受注〜完了）・売上仕入・スタジオ予約をひとつのGLS番号でつなげて管理します。左のメニューから各機能を探すか、下の目次・検索で調べたい内容を選んでください。",
  sections: [
    // ── はじめに ───────────────────────────────────────────
    {
      id: "intro-overview",
      group: "はじめに",
      icon: LayoutGrid,
      title: "GMO ONAiRとは",
      keywords: ["全体像", "アプリ一覧", "ブロックアプリ"],
      blocks: [
        {
          type: "p",
          text: "GMO ONAiR は GMOグローバルスタジオの制作管理プラットフォーム（会社OS）です。「案件管理」はそのうちの1つのブロックアプリで、案件の見積〜受注〜請求と、スタジオの予約管理を担当します。",
        },
        {
          type: "iconGrid",
          items: [
            { icon: FolderKanban, label: "案件管理", text: "今開いているアプリ", tone: "primary" },
            { icon: FileText, label: "Qシート", text: "台本・進行表" },
            { icon: ShoppingCart, label: "機材管理", text: "機材台帳・貸出" },
            { icon: FileText, label: "技術資料", text: "カメラ/音声仕様" },
            { icon: MonitorPlay, label: "ライブ運用", text: "本番オペ進行" },
            { icon: MonitorPlay, label: "リアルタイムCG", text: "放送CG送出" },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "GLS番号がすべてをつなぐ",
          text: "案件が受注に近づくと「GLS番号」が発番されます。この番号がQシートや機材管理など他アプリのデータとひも付くキーになるので、案件管理での入力・GLS発番がすべての起点になります。",
        },
        {
          type: "p",
          text: "画面右上の「他のアプリ」アイコン（グリッド）から他のブロックアプリにいつでも切り替えられます。",
        },
      ],
    },
    {
      id: "intro-lifecycle",
      group: "はじめに",
      icon: Workflow,
      title: "案件のライフサイクル（ステージ）",
      keywords: ["ステージ", "ヨミ", "受注", "失注", "ワークフロー"],
      blocks: [
        {
          type: "p",
          text: "1つの案件は、以下のステージを進んでいきます。ステージは案件編集ページから変更します。",
        },
        {
          type: "flow",
          steps: [
            { icon: Hash, label: "ネタ", sub: "初期接触", tone: "muted" },
            { icon: Calendar, label: "D 仮押さえ", sub: "日程仮確保", tone: "info" },
            { icon: FileText, label: "C 見積提案", sub: "見積・提案中", tone: "primary" },
            { icon: ClipboardList, label: "B 口頭決定", sub: "口頭で合意", tone: "warning" },
            { icon: TrendingUp, label: "A 受注済", sub: "正式受注", tone: "success" },
            { icon: FolderKanban, label: "S 完了", sub: "納品完了", tone: "success" },
          ],
          caption: "途中のどのステージからでも「E 失注」に進むことができます（下記参照）。",
        },
        {
          type: "callout",
          tone: "destructive",
          title: "E 失注",
          text: "受注に至らなかった案件はいつでも「E 失注」にできます。失注理由を記録しておくと、あとで営業レビューで振り返りに使えます。",
        },
        {
          type: "glossary",
          items: [
            { term: "ヨミ", def: "GLS番号がまだ発番されていない状態（ネタ〜B口頭決定）の総称。見込み案件として管理されます。" },
            { term: "GLS番号", def: "受注が固まった案件に発番される管理番号。他アプリ（Qシート・機材管理など）とのひも付けキーになります。" },
            { term: "D 仮押さえ", def: "スタジオの日程を仮確保した状態。ステージをこの状態にすると、スタジオ予約が自動生成されます。" },
          ],
        },
      ],
    },
    {
      id: "intro-nav",
      group: "はじめに",
      icon: PanelLeft,
      title: "画面の見方・共通操作",
      keywords: ["ヘッダー", "サイドバー", "メニュー", "検索", "マニュアル"],
      blocks: [
        {
          type: "steps",
          items: [
            {
              title: "サイドバー（左側）",
              text: "「案件」「タスク」「営業」「マスター」などのグループでメニューが並びます。スマホでは左上のハンバーガーボタンで開閉します。",
            },
            {
              title: "ヘッダー（上部）",
              text: "ロゴ横に現在のアプリ名、中央に案件・顧客・仕入先の横断検索、右側に他アプリ切替・利用マニュアル・ユーザーメニューがあります。",
            },
            {
              title: "利用マニュアル（このページ）",
              text: "ヘッダーの「？」アイコンからいつでも開けます。左の目次または上部のキーワード検索で読みたい項目を探してください。",
            },
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "全ての画面はスマートフォンでも操作できるように作られています。表が横に長い画面は横スクロールで、フォームは縦積みで表示されます。",
        },
      ],
    },

    // ── 案件管理 ───────────────────────────────────────────
    {
      id: "sales-list",
      group: "案件管理",
      icon: FolderKanban,
      title: "案件一覧の見方",
      keywords: ["検索", "フィルタ", "並び替え", "開催月"],
      blocks: [
        {
          type: "p",
          text: "「案件」→「案件一覧」で全案件を確認できます。一覧は「提案中（B/C/D)」「受注済・完了（S/A）」「その他（失注・ネタ）」の3グループに分かれて表示されます。",
        },
        {
          type: "table",
          columns: ["GLS番号", "案件名", "顧客", "ステージ", "開催日", "金額"],
          rows: [
            ["GLS0123", "○○発表会 2026", "株式会社Example", "A 受注済", "2026-08-10", "¥3,200,000"],
            ["（未発番）", "△△イベント（ヨミ）", "株式会社Sample", "C 見積提案", "2026-09-01", "¥1,500,000"],
          ],
          caption: "実際のデータのイメージです（例）。",
        },
        {
          type: "bullets",
          items: [
            "開催期間の絞り込み：既定は「半年（今月〜6ヶ月先）」。ほかに「月」「四半期」「年」「全件」を選択できます。",
            "並び順：おすすめ／イベント日／作成日／金額／名前／顧客 から選択できます。",
            "検索ボックスで案件名・GLS番号・顧客名から絞り込みできます。",
          ],
        },
        { type: "callout", tone: "info", text: "ヘッダー中央の横断検索を使うと、案件一覧を開かずに案件・顧客・仕入先をまとめて検索できます。" },
      ],
    },
    {
      id: "sales-new",
      group: "案件管理",
      icon: FilePlus2,
      title: "新規案件の登録（ヨミ）",
      keywords: ["新規作成", "登録", "ヨミ登録"],
      blocks: [
        {
          type: "steps",
          items: [
            { title: "基本情報を入力", text: "案件名・案件種別・開催日程などを入力します。" },
            { title: "担当者を設定", text: "営業担当・ディレクター等、案件に関わるメンバーを設定します。" },
            { title: "関係先を登録", text: "顧客・取引先を選択（未登録なら新規作成も可能）します。" },
            { title: "保存", text: "この時点ではGLS番号は発番されず「ヨミ」の状態で保存されます。" },
          ],
        },
        {
          type: "callout",
          tone: "success",
          title: "ヒント",
          text: "案件分類（スタジオ／ビジネス）は最初に選んでおくと、後のGLS発番がスムーズです。案件種別を選ぶと推奨の分類が自動で入力されます。",
        },
      ],
    },
    {
      id: "sales-gls",
      group: "案件管理",
      icon: Hash,
      title: "GLS番号の発番",
      keywords: ["gls", "発番", "分類", "スタジオ", "ビジネス"],
      blocks: [
        {
          type: "p",
          text: "受注が固まったら、案件編集ページの「GLS発番」ボタンから番号を発番します。発番後、その番号がQシートや機材管理などのデータと連携するキーになります。",
        },
        {
          type: "steps",
          items: [
            { title: "案件分類を選択", text: "「スタジオ」または「ビジネス」を選びます（A/Bの番号系列が分かれます）。" },
            { title: "発番ボタンを押す", text: "系列ごとの次の番号が自動的に採番されます。" },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "発番後の分類変更について",
          text: "発番後でも「分類を変更…」から別の分類・別案件のエピソードへ紐づけ直すことができます。ただしエピソード番号やBOXフォルダ名も自動的に振り直されるため、変更前に内容をよく確認してください。",
        },
      ],
    },
    {
      id: "sales-confirmed",
      group: "案件管理",
      icon: Film,
      title: "確定案件（スタジオ／ビジネス）",
      keywords: ["確定案件"],
      blocks: [
        {
          type: "p",
          text: "GLS発番済みの案件を、分類（スタジオ／ビジネス）別に一覧表示するページです。「確定案件（スタジオ）」「確定案件（ビジネス）」からそれぞれ確認できます。",
        },
      ],
    },
    {
      id: "sales-groups",
      group: "案件管理",
      icon: GitBranch,
      title: "按分グループ",
      keywords: ["費用按分", "グループ"],
      blocks: [
        {
          type: "p",
          text: "複数の案件にまたがる共通費用を、按分（比率で分配）して計上したい場合に使うグループです。同じグループに属する案件間で、売上・仕入を比率配分できます。",
        },
      ],
    },
    {
      id: "sales-estimate",
      group: "案件管理",
      icon: FileText,
      title: "見積書の作成",
      keywords: ["見積書", "pdf"],
      blocks: [
        {
          type: "p",
          text: "「見積書」ページ、または案件の売上明細から見積書PDFを発行できます。売上ステータスに関わらず「見積書」「請求書」のどちらのPDFも個別に発行可能です。",
        },
        { type: "callout", tone: "info", text: "PDFのファイル名・宛名は常に最新のGLS番号を参照するため、GLS番号を変更しても再発行すれば自動で反映されます。" },
      ],
    },
    {
      id: "sales-tasks",
      group: "案件管理",
      icon: KanbanSquare,
      title: "タスク管理（カンバン・リスト・ガント）",
      keywords: ["タスク", "カンバン", "ガントチャート"],
      blocks: [
        {
          type: "iconGrid",
          items: [
            { icon: KanbanSquare, label: "カンバン", text: "ステータス別に並べて表示" },
            { icon: ClipboardList, label: "タスクリスト", text: "一覧・チェックリスト形式" },
            { icon: BarChart3, label: "ガントチャート", text: "期間・進捗を横棒で可視化" },
          ],
        },
        { type: "p", text: "案件ごとの個別タスクは、各案件編集ページからも登録・確認できます。" },
      ],
    },
    {
      id: "sales-activity",
      group: "案件管理",
      icon: ClipboardList,
      title: "営業活動記録・営業レビュー・ダッシュボード",
      keywords: ["営業", "活動記録", "レビュー", "kpi"],
      blocks: [
        {
          type: "bullets",
          items: [
            "営業活動記録：商談・架電・訪問などの活動履歴を記録します。",
            "営業レビュー：受注／失注の振り返りや傾向分析に使います。",
            "ダッシュボード：受注件数・金額などのKPIをグラフで確認できます。",
          ],
        },
        {
          type: "kpi",
          items: [
            { label: "今月の受注", value: "¥12,400万", tone: "success" },
            { label: "進行中案件", value: "38件", tone: "primary" },
            { label: "今月の失注", value: "3件", tone: "destructive" },
          ],
        },
      ],
    },
    {
      id: "sales-masters",
      group: "案件管理",
      icon: Store,
      title: "取引先・顧客・料金表マスター",
      keywords: ["マスター", "取引先", "顧客", "料金表"],
      blocks: [
        {
          type: "bullets",
          items: [
            "取引先マスター：発注先・協力会社などの情報を管理します。",
            "顧客：案件の発注元（クライアント）情報を管理します。",
            "料金表：見積書に「料金表から追加」で呼び出せる標準単価表です。",
          ],
        },
      ],
    },

    // ── 財務管理 ───────────────────────────────────────────
    {
      id: "budget-dashboard",
      group: "財務管理",
      icon: BarChart3,
      title: "財務ダッシュボードの見方",
      keywords: ["粗利", "限界利益", "営業利益", "kpi", "集計期間"],
      blocks: [
        {
          type: "p",
          text: "売上・仕入・粗利・営業利益などのKPIを集計期間（月／四半期／年／期間指定）で確認できます。",
        },
        {
          type: "kpi",
          items: [
            { label: "売上", value: "¥25,641,463", tone: "primary" },
            { label: "粗利（限界利益）", value: "¥8,900,000", tone: "success" },
            { label: "営業利益", value: "¥3,200,000", tone: "success" },
          ],
        },
        {
          type: "glossary",
          items: [
            { term: "粗利（限界利益）", def: "売上 − 変動原価（案件に直接紐づく仕入）" },
            { term: "売上総利益", def: "限界利益 − 固定原価（スタジオ償却負担額など案件に紐づかない原価）" },
            { term: "営業利益", def: "売上総利益 − 販管費" },
          ],
        },
      ],
    },
    {
      id: "budget-revenue",
      group: "財務管理",
      icon: Receipt,
      title: "売上管理・請求書／見積書PDF",
      keywords: ["請求書", "見積書", "税込", "税抜"],
      blocks: [
        {
          type: "steps",
          items: [
            { title: "案件を選んで売上を登録", text: "計上日・請求日・支払期日は空欄なら自動で候補日を入力します（土日祝は前営業日にずらされます）。" },
            { title: "明細を追加", text: "「項目追加」「料金表から追加」から明細行を作成、単価は税込／税抜どちらで入力してもヘルパーが税抜金額に自動換算します。" },
            { title: "PDFを発行", text: "「見積書」「請求書」ボタンからそれぞれ個別にPDFを発行できます。" },
          ],
        },
      ],
    },
    {
      id: "budget-purchase",
      group: "財務管理",
      icon: ShoppingCart,
      title: "仕入管理",
      keywords: ["仕入", "固定原価", "仮登録"],
      blocks: [
        {
          type: "p",
          text: "案件に紐づく仕入（外注費・機材費など）を登録します。金額未確定の仕入は「仮」マークを付けて仮登録として区別できます。",
        },
        { type: "callout", tone: "info", text: "GLS番号を持たない固定費（スタジオ償却負担額など）は「固定原価」として自動で専用案件に計上され、財務ダッシュボードで変動原価と区別して表示されます。" },
      ],
    },
    {
      id: "budget-sga",
      group: "財務管理",
      icon: Receipt,
      title: "販管費",
      keywords: ["販管費", "経費精算"],
      blocks: [{ type: "p", text: "案件に直接紐づかない全社共通の経費（販管費）を登録します。精算申請URLを紐づけておくと一覧から直接開けます。" }],
    },
    {
      id: "budget-detail",
      group: "財務管理",
      icon: FolderKanban,
      title: "案件月別詳細",
      keywords: ["月別", "案件別損益"],
      blocks: [{ type: "p", text: "案件ごとの売上・仕入・損益を月単位で確認できるページです。" }],
    },
    {
      id: "budget-masters",
      group: "財務管理",
      icon: Truck,
      title: "仕入先・パートナー",
      keywords: ["仕入先", "パートナー", "集計"],
      blocks: [
        {
          type: "bullets",
          items: ["仕入先：発注する協力会社の情報を管理します。", "パートナー：継続的に取引するパートナー企業を管理します。", "仕入先集計：仕入先ごとの取引額を集計して確認できます。"],
        },
      ],
    },
    {
      id: "budget-kessan",
      group: "財務管理",
      icon: FlaskConical,
      title: "決算インポート",
      keywords: ["決算", "csv", "freee", "moneyforward"],
      blocks: [
        {
          type: "p",
          text: "会計システム（freee／MoneyForward）の総勘定元帳データを取り込み、売上・仕入・販管費として一括登録します（システム管理者のみ操作可能）。",
        },
        {
          type: "steps",
          items: [
            { title: "解析（dry-run）", text: "実際には登録せず、取り込み内容・重複候補・対象期間をプレビューします。" },
            { title: "投入（commit）", text: "内容を確認してから実際にデータベースへ登録します。" },
          ],
        },
        { type: "callout", tone: "warning", title: "重要", text: "本番データベースへの投入は影響が大きいため、必ず解析結果と重複候補を確認してから実行してください。" },
      ],
    },

    // ── スタジオ予約 ───────────────────────────────────────
    {
      id: "studio-calendar",
      group: "スタジオ予約",
      icon: Calendar,
      title: "スタジオカレンダー",
      keywords: ["予約", "カレンダー連携", "ical", "google"],
      blocks: [
        {
          type: "p",
          text: "スタジオ・会議室の予約状況をカレンダー形式で確認・登録します。案件のステージを「D 仮押さえ」にすると、予約が自動で作成されます。",
        },
        {
          type: "steps",
          items: [
            { title: "予約を登録", text: "日時・使用する部屋を選び、必要に応じて案件（GLS番号）を紐づけます。" },
            { title: "外部カレンダーと連携", text: "「カレンダーURL」を1つ取得すれば、全部屋の予約をまとめてGoogleカレンダー等に取り込めます。" },
          ],
        },
        { type: "callout", tone: "info", text: "サイネージ（会議室前ディスプレイ）表示用のURLは部屋ごとに個別発行されます。カレンダー連携用URLとは別物です。" },
      ],
    },
    {
      id: "studio-signage",
      group: "スタジオ予約",
      icon: MonitorPlay,
      title: "サイネージ表示",
      keywords: ["サイネージ", "会議室ディスプレイ"],
      blocks: [{ type: "p", text: "会議室・スタジオ前の物理ディスプレイに、その部屋の予約状況だけを表示するための専用画面です。URLは部屋ごとに発行されます。" }],
    },

    // ── システム管理 ───────────────────────────────────────
    {
      id: "admin-users",
      group: "システム管理",
      icon: UserCog,
      title: "ユーザー管理",
      keywords: ["ユーザー", "権限", "管理者"],
      blocks: [
        { type: "callout", tone: "muted", title: "システム管理者のみ", text: "この機能はシステム管理者権限を持つユーザーのみ利用できます。" },
        { type: "p", text: "ユーザーの追加・権限（アプリ別・役割別）の設定を行います。" },
      ],
    },
    {
      id: "admin-dataviewer",
      group: "システム管理",
      icon: Database,
      title: "データビューア",
      keywords: ["データ確認", "テーブル"],
      blocks: [{ type: "p", text: "データベースの内容をテーブル単位で確認できる画面です（システム管理者のみ）。" }],
    },
    {
      id: "admin-backup",
      group: "システム管理",
      icon: HardDrive,
      title: "DBバックアップ",
      keywords: ["バックアップ", "復元"],
      blocks: [
        { type: "p", text: "データベースは3時間ごとに自動でバックアップされ、BOXに保存されます。このページでは保存済みバックアップの一覧を確認できます。" },
        { type: "callout", tone: "warning", text: "復元は影響が大きい操作のため、コマンドライン経由で慎重に実行します（画面に手順が表示されます）。" },
      ],
    },
    {
      id: "admin-settings",
      group: "システム管理",
      icon: Settings,
      title: "システム設定",
      keywords: ["設定"],
      blocks: [{ type: "p", text: "アプリ全体に関わる各種設定を行います（システム管理者のみ）。" }],
    },

    // ── 困ったときは ───────────────────────────────────────
    {
      id: "help-search",
      group: "困ったときは",
      icon: Search,
      title: "案件・顧客・仕入先をすぐ探したい",
      keywords: ["検索方法"],
      blocks: [
        { type: "p", text: "ヘッダー中央の検索ボックスにキーワードを入力すると、案件・顧客・仕入先を横断して検索できます。結果をクリックするとそのまま該当ページに移動します。" },
      ],
    },
    {
      id: "help-other-apps",
      group: "困ったときは",
      icon: LayoutGrid,
      title: "他のアプリに切り替えたい",
      keywords: ["アプリ切替", "他のアプリ", "外部リンク"],
      blocks: [
        {
          type: "p",
          text: "ヘッダー左上のロゴ横にあるグリッドアイコン（他のアプリ）から、Qシート・機材管理・技術資料・ライブ運用・リアルタイムCG に切り替えられます。インタラクティブ演出・翻訳ツールは別サイトのため、新しいタブで開きます。",
        },
      ],
    },
    {
      id: "help-faq",
      group: "困ったときは",
      icon: HelpCircle,
      title: "よくある質問",
      keywords: ["faq", "トラブル"],
      blocks: [
        {
          type: "glossary",
          items: [
            { term: "GLS番号が発番できない", def: "案件の「案件分類（スタジオ／ビジネス）」が未設定の場合は発番できません。案件編集ページで分類を選択してください。" },
            { term: "請求書PDFのファイル名が古いGLS番号のまま", def: "PDFは発行のたびに最新のGLS番号を参照します。再発行すれば最新の番号に更新されます。" },
            { term: "スタジオのカレンダー連携が反映されない", def: "カレンダーアプリ側の自動更新には数時間かかる場合があります。しばらく待っても反映されない場合はURLを再生成してみてください。" },
          ],
        },
        { type: "p", text: "上記で解決しない場合は、システム管理者にお問い合わせください。" },
      ],
    },
  ],
};
