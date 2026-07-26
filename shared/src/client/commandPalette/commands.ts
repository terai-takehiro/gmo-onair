// ⌘K のコマンド表 (§4.5)
//
// レールから外した約40メニューは、すべてここから到達できることが受け入れ条件。
// 定義は静的テーブル1つだけに置き、権限でフィルタする (サーバー実装は増やさない)。
//
// パスは絶対で書く。別バンドルのアプリ (機材・Qシート等) も同じドメインなので、
// 呼び出し側が「アプリ内遷移」か「フルリロード」かを判断する。

import type { CommandDef, PaletteAccess } from './types';

/** ① やる — 操作。場所より先に出す */
const DO_COMMANDS: CommandDef[] = [
  { id: 'do-project-new', kind: 'do', label: '案件をつくる', hint: 'ヨミとして登録する。GLS発番はあとから', path: '/sales/projects/new', keywords: 'あんけん project new 新規 起票', module: 'sales' },
  { id: 'do-intake', kind: 'do', label: 'AIに投げる', hint: '口で言われた依頼や議事録をそのまま貼る', path: '/today', keywords: 'いらい task intake 依頼 タスク メモ 議事録', module: 'dailyops' },
  { id: 'do-activity', kind: 'do', label: 'やり取りを記録する', hint: 'メール・電話・打合せと次にやることを残す', path: '/sales/activity-logs', keywords: 'katsudou activity 営業活動 記録', module: 'sales' },
  { id: 'do-booking', kind: 'do', label: '予約を入れる', hint: 'スタジオの部屋を押さえる', path: '/schedule?layers=studio', keywords: 'yoyaku booking 仮押さえ スタジオ', module: 'studio' },
  { id: 'do-revenue', kind: 'do', label: '売上を登録する', hint: '税抜で入れる。請求書はここから出せる', path: '/finance?tab=revenue', keywords: 'uriage revenue 請求 見積', module: 'budget' },
  { id: 'do-purchase', kind: 'do', label: '仕入を登録する', hint: '見込みなら「仮」で先に入れる', path: '/finance?tab=purchase', keywords: 'shiire purchase 発注 原価', module: 'budget' },
  { id: 'do-sga', kind: 'do', label: '販管費を登録する', hint: '案件に紐づかない費用', path: '/finance?tab=sga', keywords: 'hankanhi sga 経費', module: 'budget' },
  { id: 'do-xpoint', kind: 'do', label: '精算PDFを取り込む', hint: 'X-Point / 楽楽精算のPDFから仕入・販管費に', path: '/finance/import?tool=xpoint', keywords: 'seisan pdf xpoint 楽楽', module: 'budget' },
  { id: 'do-lend', kind: 'do', label: '機材を貸し出す', hint: '番組単位でまとめて出せる', path: '/equipment/lendings', keywords: 'kizai lending 貸出 返却', module: 'equipment' },
  { id: 'do-scan', kind: 'do', label: 'QRで機材を読み取る', hint: 'カメラで機材IDを読む', path: '/equipment/scan', keywords: 'qr scan スキャン', module: 'equipment' },
  { id: 'do-qsheet', kind: 'do', label: 'Qシートをつくる', hint: '収録日とGLSを紐づけて新規作成', path: '/qsheet', keywords: 'qsheet キューシート 台本', module: 'qsheet' },
  { id: 'do-techsheet', kind: 'do', label: '技術資料をつくる', hint: 'カメラ・映像・音声・通信の仕様書', path: '/techsheet', keywords: 'gijutsu techsheet 技術 仕様', module: 'techsheet' },
];

/** ② ひらく — 場所。旧サイドバーの全メニューをここに畳む */
const OPEN_COMMANDS: CommandDef[] = [
  // レール
  { id: 'open-today', kind: 'open', label: '今日', path: '/today', keywords: 'kyou today ホーム home 受信箱 inbox' },
  { id: 'open-projects', kind: 'open', label: '案件', path: '/projects', keywords: 'anken projects 一覧', module: 'sales' },
  { id: 'open-tasks', kind: 'open', label: 'タスク', path: '/tasks', keywords: 'task todo やること', module: 'sales' },
  { id: 'open-customers', kind: 'open', label: 'お客様', path: '/customers', keywords: 'kokyaku customer 顧客', module: 'sales' },
  { id: 'open-schedule', kind: 'open', label: '予定', path: '/schedule', keywords: 'yotei schedule カレンダー calendar', modules: ['studio', 'partner_schedule'] },
  { id: 'open-finance', kind: 'open', label: 'お金', path: '/finance', keywords: 'okane finance 財務 予算 損益', module: 'budget' },
  { id: 'open-notification-prefs', kind: 'open', label: '通知の受け取り方', path: '/settings/notifications', keywords: 'notification 通知 朝 slack メール' },
  { id: 'open-slack-digest', kind: 'open', label: '朝の1通（Slack）の配信設定', path: '/settings/slack-digest', keywords: 'slack digest 朝 日報 配信 チャンネル', module: 'admin' },
  { id: 'open-settings', kind: 'open', label: '設定', path: '/settings', keywords: 'settei settings マスター' },
  // 現場の道具 (§4.14) — レールとホームには出さないので、単発で開く経路はここ
  // 「まだ案件に紐づいていないもの」は同じ画面の下段なので、別項目にはせずキーワードで拾う
  //  (行き先が同じ項目を2つ並べると、選ぶときに違いが分からない)
  { id: 'open-tools', kind: 'open', label: '現場の道具（翻訳・インタラクティブ・CG）', path: '/tools', keywords: 'tool honyaku translate interactive cg 翻訳 演出 道具 himozuke 紐づけ 未紐づけ 成果物', module: 'sales' },

  // 案件
  { id: 'open-projects-board', kind: 'open', label: '案件 (ボード表示)', path: '/projects?view=board', keywords: 'pipeline yomi ヨミ パイプライン ボード', module: 'sales' },
  { id: 'open-projects-studio', kind: 'open', label: '確定案件 (スタジオ)', path: '/projects?filter=confirmed_studio', keywords: 'kakutei studio 確定 A系', module: 'sales' },
  { id: 'open-projects-business', kind: 'open', label: '確定案件 (ビジネス)', path: '/projects?filter=confirmed_business', keywords: 'kakutei business 確定 B系', module: 'sales' },
  { id: 'open-billing', kind: 'open', label: '請求のしごと', path: '/finance/billing', keywords: 'seikyu invoice 請求 入金 検収 締め', module: 'budget' },
  // 合同案件 (32章) と 費用を分け合う案件 は別物。見分け方は「請求書が何枚出るか」。
  { id: 'open-manual-help', kind: 'open', label: '運営マニュアル (案件から開く)', path: '/projects', keywords: 'manual unei 運営 マニュアル 部品 配置図 会場図', module: 'sales' },
  { id: 'open-call-sheet-help', kind: 'open', label: '香盤表 (案件から開く)', path: '/projects', keywords: 'kouban call sheet 香盤 進行 当日 レーン', module: 'sales' },
  { id: 'open-sandbox', kind: 'open', label: 'お試し（練習）', path: '/sales/sandbox', keywords: 'otameshi sandbox 練習 試す 研修 新人 デモ 実績に混ざらない', module: 'sales' },
  { id: 'open-keep-deck', kind: 'open', label: '隔週キープをつくる', path: '/sales/keep', keywords: 'keep kakushu 隔週 キープ 会議 資料 報告 mtg', module: 'sales' },
  { id: 'open-joint-events', kind: 'open', label: '合同案件 (各社に請求)', path: '/finance/joint', keywords: 'goudou joint 合同 株主総会 複数社 各社 請求 分ける', module: 'budget' },
  { id: 'open-project-groups', kind: 'open', label: '費用を分け合う案件', path: '/sales/project-groups', keywords: 'group 配分 グループ 分担 原価', module: 'sales' },
  { id: 'open-gls-import', kind: 'open', label: '旧GLS (決算取込)', path: '/sales/gls-import', keywords: 'gls kessan 決算 旧', module: 'sales' },
  { id: 'open-activity-logs', kind: 'open', label: '営業活動記録', path: '/sales/activity-logs', keywords: 'eigyou activity 活動 記録', module: 'sales' },

  // タスク
  { id: 'open-tasks-board', kind: 'open', label: 'タスク (カンバン)', path: '/tasks?scope=all&view=board', keywords: 'kanban board カンバン', module: 'sales' },
  { id: 'open-tasks-list', kind: 'open', label: 'タスク (リスト)', path: '/tasks?scope=all&view=list', keywords: 'list リスト', module: 'sales' },
  { id: 'open-tasks-gantt', kind: 'open', label: 'タスク (ガント)', path: '/tasks?scope=all&view=gantt', keywords: 'gantt ガント 工程', module: 'sales' },
  { id: 'open-tasks-me', kind: 'open', label: '自分のタスクと依頼', path: '/tasks?scope=me', keywords: 'mytask 依頼 delegation 自分 9マス', module: 'dailyops' },
  { id: 'open-tasks-project', kind: 'open', label: '案件のタスク', path: '/tasks?scope=project', keywords: 'project task 案件', module: 'sales' },
  // 「タスク (リスト)」と同じ画面だが、チームの負荷は一覧の下にあるので #team-load まで送る
  { id: 'open-tasks-team', kind: 'open', label: 'チームの負荷 (件数だけ)', path: '/tasks?scope=all&view=list#team-load', keywords: 'team load 負荷 チーム', module: 'dailyops' },

  // ふりかえり
  { id: 'open-review', kind: 'open', label: 'ふりかえり（今週）', path: '/review', keywords: 'furikaeri review 週次 ふりかえり', module: 'sales' },
  { id: 'open-sales-review', kind: 'open', label: 'ふりかえり（営業レビュー）', path: '/review?tab=sales', keywords: 'review funnel ファネル 失注', module: 'sales' },
  { id: 'open-keep-report', kind: 'open', label: 'ふりかえり（隔週キープの資料）', path: '/review?tab=keep', keywords: 'houkoku keep 報告 資料', module: 'sales' },
  { id: 'open-monthly-pl', kind: 'open', label: 'ふりかえり（月次の損益）', path: '/review?tab=pl', keywords: 'pl 損益 月次 目標', module: 'sales' },
  { id: 'open-ai-activity', kind: 'open', label: 'AI がやったこと', path: '/sales/ai-activity', keywords: 'ai 履歴 activity', module: 'sales' },
  { id: 'open-sales-dashboard', kind: 'open', label: '全社ダッシュボード', path: '/sales/dashboard', keywords: 'dashboard kpi ダッシュボード', module: 'sales' },
  { id: 'open-weekly', kind: 'open', label: 'ウィークリー活動報告', path: '/daily/weekly', keywords: 'weekly 週報 活動報告', module: 'dailyops' },
  { id: 'open-news', kind: 'open', label: 'デイリーニュース報告', path: '/daily/news', keywords: 'news ニュース 業界', module: 'dailyops' },

  // お金
  { id: 'open-finance-revenue', kind: 'open', label: '売上管理', path: '/finance?tab=revenue', keywords: 'uriage revenue 売上', module: 'budget' },
  { id: 'open-finance-purchase', kind: 'open', label: '仕入管理', path: '/finance?tab=purchase', keywords: 'shiire purchase 仕入', module: 'budget' },
  { id: 'open-finance-sga', kind: 'open', label: '販管費', path: '/finance?tab=sga', keywords: 'sga 販管費 経費', module: 'budget' },
  { id: 'open-finance-import', kind: 'open', label: '取り込む (精算・決算)', path: '/finance/import', keywords: 'import 取込 精算 決算', module: 'budget' },
  { id: 'open-budget-detail', kind: 'open', label: '案件月別詳細', path: '/budget/detail', keywords: 'tsukibetsu 月別 詳細', module: 'budget' },
  { id: 'open-vendor-report', kind: 'open', label: '仕入先集計', path: '/budget/reports/vendors', keywords: 'vendor report 集計', module: 'budget' },
  { id: 'open-vendors', kind: 'open', label: '仕入先', path: '/budget/vendors', keywords: 'vendor 仕入先 発注先', module: 'budget' },
  { id: 'open-partners', kind: 'open', label: 'パートナー', path: '/budget/partners', keywords: 'partner 外部スタッフ', module: 'budget' },
  { id: 'open-companies', kind: 'open', label: '取引先マスター', path: '/settings/billing-parties', keywords: 'torihikisaki company 請求先', module: 'sales' },
  { id: 'open-pricing', kind: 'open', label: '料金表', path: '/sales/pricing', keywords: 'ryoukin pricing 単価 見積', module: 'sales' },

  // 予定
  { id: 'open-schedule-studio', kind: 'open', label: 'スタジオカレンダー', path: '/schedule?layers=studio', keywords: 'studio calendar 香盤', module: 'studio' },
  { id: 'open-schedule-partner', kind: 'open', label: 'パートナースケジュール', path: '/schedule?layers=partner', keywords: 'partner 代休 有給 出張', module: 'partner_schedule' },
  { id: 'open-schedule-me', kind: 'open', label: 'マイカレンダー', path: '/schedule?layers=me', keywords: 'my calendar 個人 google outlook', module: 'partner_schedule' },

  // 日常業務
  { id: 'open-daily-finance', kind: 'open', label: '見積/請求書 (届いたもの)', path: '/daily/finance', keywords: 'seikyuu invoice 見積 請求 注文', module: 'dailyops' },
  { id: 'open-daily-inquiries', kind: 'open', label: 'その他問い合わせ', path: '/daily/inquiries', keywords: 'toiawase inquiry 問い合わせ', module: 'dailyops' },
  { id: 'open-inview', kind: 'open', label: '内覧会 来場予約', path: '/daily/inview', keywords: 'nairankai inview 来場 見学', module: 'dailyops' },
  { id: 'open-security-cards', kind: 'open', label: 'セキュリティカード', path: '/daily/security-cards', keywords: 'security card 入館 貸出', module: 'dailyops' },

  // 機材
  { id: 'open-equipment', kind: 'open', label: '機材台帳', path: '/equipment/items', keywords: 'kizai equipment 機材 一覧', module: 'equipment' },
  { id: 'open-equipment-lendings', kind: 'open', label: '貸出管理', path: '/equipment/lendings', keywords: 'kashidashi lending 貸出', module: 'equipment' },
  { id: 'open-equipment-inventory', kind: 'open', label: '棚卸し', path: '/equipment/inventory', keywords: 'tanaoroshi inventory 棚卸', module: 'equipment' },
  { id: 'open-equipment-maintenance', kind: 'open', label: 'メンテナンス', path: '/equipment/maintenance', keywords: 'maintenance 修理 点検', module: 'equipment' },
  { id: 'open-equipment-racks', kind: 'open', label: 'ラック実装', path: '/equipment/items?kind=racks', keywords: 'rack ラック 実装', module: 'equipment' },
  { id: 'open-equipment-cables', kind: 'open', label: 'ケーブル管理', path: '/equipment/items?kind=cables', keywords: 'cable ケーブル', module: 'equipment' },
  { id: 'open-equipment-connectors', kind: 'open', label: 'コネクタ管理', path: '/equipment/items?kind=connectors', keywords: 'connector コネクタ', module: 'equipment' },
  { id: 'open-equipment-masters', kind: 'open', label: '機材のマスター (保管場所・メーカー・色)', path: '/equipment/locations', keywords: 'master 保管場所 メーカー 色', module: 'equipment' },

  // 現場の道具
  { id: 'open-qsheet', kind: 'open', label: 'Qシート', path: '/qsheet', keywords: 'qsheet 台本 ランダウン onair', module: 'qsheet' },
  { id: 'open-techsheet', kind: 'open', label: '技術資料', path: '/techsheet', keywords: 'techsheet 技術 仕様', module: 'techsheet' },
  { id: 'open-live', kind: 'open', label: '計時LIVE', path: '/live', keywords: 'live timer 計時 視聴者', module: 'liveops' },
  { id: 'open-awards', kind: 'open', label: 'リアルタイムCG', path: '/awards', keywords: 'cg awards テロップ ランキング', module: 'awards' },

  // 設定
  { id: 'open-users', kind: 'open', label: '人と権限', path: '/settings/users', keywords: 'user 権限 メンバー 招待 やくわり 役割', adminOnly: true },
  { id: 'open-data-viewer', kind: 'open', label: 'データビューア', path: '/settings/data-viewer', keywords: 'data viewer テーブル', adminOnly: true },
  { id: 'open-db-backups', kind: 'open', label: 'DBバックアップ', path: '/settings/db-backups', keywords: 'backup 復元 db', adminOnly: true },
  { id: 'open-system-settings', kind: 'open', label: 'システム設定', path: '/settings/system', keywords: 'system 設定', adminOnly: true },
  { id: 'open-kessan-import', kind: 'open', label: '決算インポート', path: '/finance/import?tool=kessan', keywords: 'kessan 決算 仕訳帳', adminOnly: true },
  { id: 'open-dedup', kind: 'open', label: '同じ支払いが2回入っていないか調べる', path: '/finance/import?tool=dedup', keywords: 'dedup 二重 重複', adminOnly: true },
];

export const ALL_COMMANDS: CommandDef[] = [...DO_COMMANDS, ...OPEN_COMMANDS];

/** 権限で絞る。system_admin は全部見える */
export function resolveCommands({ role, permissions }: PaletteAccess): CommandDef[] {
  const isAdmin = role === 'system_admin' || !!permissions?._all;
  const has = (m: string) => isAdmin || !!permissions?.[m];
  return ALL_COMMANDS.filter((c) => {
    if (c.adminOnly) return isAdmin;
    if (c.modules && c.modules.length > 0) return c.modules.some(has);
    if (c.module) return has(c.module);
    return true;
  });
}

/** 入力に対する当たり判定。ラベル・当たり語・パスを見る */
export function matchCommand(c: CommandDef, q: string): boolean {
  if (!q) return true;
  const hay = `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.path}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}
