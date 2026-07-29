// 行き先の表 (§4.5) — **この製品のサイトツリーはこの1ファイル**
//
// ここが ⌘K (さがしてたどる) と 全体マップ `/map` (見てたどる) の両方の元になる。
// 2つに分けて書くと必ず片方だけ古くなるので、**表は1つ**にする。
//
// 決めごと:
//   1. **同じ行き先を2行に書かない。** 選ぶときに違いが分からず、どちらが正か迷う。
//      別の切り口で開きたいものは `keywords` で拾う (行を増やさない)。
//   2. **`hint` を必ず書く。** 全体マップは名前だけ80個並べても読めない。
//   3. **区分 (`section`) は仕事の順番。** アプリ名 (Qシート・機材…) では分けない —
//      アプリは配信の都合で、利用者の概念ではない (types.ts の説明)。
//   4. パスは絶対で書く。別バンドルのアプリも同じドメインなので、
//      呼び出し側が「アプリ内遷移」か「フルリロード」かを判断する。

import {
  ArrowRightLeft, BarChart3, Bell, BookOpen, Boxes, Building2,
  Calendar, CalendarCheck, CalendarClock, CalendarPlus, ClipboardCheck, ClipboardList,
  Copy, Database, DoorOpen, FileCheck, FileText, FileUp,
  FlaskConical, FolderKanban, FolderPlus, HardDriveDownload, Import, Inbox,
  KeyRound, Languages, LayoutDashboard, LineChart, ListChecks, Map as MapIcon,
  MapPin, MessageSquare, Newspaper, Package, PiggyBank, Presentation,
  QrCode, Receipt, Settings, Share2, Sliders, Sparkles,
  Sun, Table2, Tags, Timer, TrendingDown, TrendingUp,
  Truck, Tv, UserCheck, Users, UserSquare, Wrench,
} from 'lucide-react';
import { SITE_SECTIONS } from './types';
import type { CommandDef, PaletteAccess } from './types';

/** ① やる — 操作。場所より先に出す */
const DO_COMMANDS: CommandDef[] = [
  { id: 'do-intake', section: '今日', icon: Sparkles, kind: 'do', label: 'AIに投げる', hint: '口で言われた依頼・メール・議事録をそのまま貼る。何にするかは AI が選んで、押すまで登録しない', path: '/today', keywords: 'いらい task intake 依頼 タスク メモ 議事録 ai', module: 'dailyops' },
  { id: 'do-project-new', section: '仕事をとる', icon: FolderPlus, kind: 'do', label: '案件をつくる', hint: '入れるのは3項目だけ。GLS発番と残りの項目はあとから', path: '/sales/projects/new', keywords: 'あんけん project new 新規 起票 ヨミ ねた', module: 'sales' },
  { id: 'do-activity', section: '仕事をとる', icon: MessageSquare, kind: 'do', label: 'やり取りを記録する', hint: 'メール・電話・打合せと「次にやること」を残す。次にやることが待たせているものに出る', path: '/sales/activity-logs', keywords: 'katsudou activity 営業活動 記録 かつどう 接点', module: 'sales' },
  { id: 'do-booking', section: '段取りする', icon: CalendarPlus, kind: 'do', label: '予約を入れる', hint: 'スタジオの部屋を押さえる。仮押さえのままでも先に入れる', path: '/schedule?layers=studio', keywords: 'yoyaku booking 仮押さえ スタジオ よやく 部屋', module: 'studio' },
  { id: 'do-lend', section: '段取りする', icon: ArrowRightLeft, kind: 'do', label: '機材を貸し出す', hint: '番組単位でまとめて出せる。返却の記録もここ', path: '/equipment/lendings', keywords: 'kizai lending 貸出 返却 きざい', module: 'equipment' },
  { id: 'do-scan', section: '段取りする', icon: QrCode, kind: 'do', label: 'QRで機材を読み取る', hint: 'カメラで機材の番号を読む。棚卸しと貸出の両方で使う', path: '/equipment/scan', keywords: 'qr scan スキャン 棚卸', module: 'equipment' },
  { id: 'do-qsheet', section: '段取りする', icon: FileText, kind: 'do', label: 'Qシートをつくる', hint: '収録日と案件を紐づけて新規作成。稿は「稿を上げる」を押したときだけ上がる', path: '/qsheet', keywords: 'qsheet キューシート 台本 だいほん', module: 'qsheet' },
  { id: 'do-techsheet', section: '段取りする', icon: Wrench, kind: 'do', label: '技術資料をつくる', hint: 'カメラ・映像・音声・通信の仕様書。紙に出す前提の体裁で印刷できる', path: '/techsheet', keywords: 'gijutsu techsheet 技術 仕様 ぎじゅつ', module: 'techsheet' },
  { id: 'do-revenue', section: 'お金にする', icon: TrendingUp, kind: 'do', label: '売上を登録する', hint: '税抜で入れる。見積から確定させた分もここに並ぶ', path: '/finance?tab=revenue', keywords: 'uriage revenue 請求 見積 うりあげ', module: 'budget' },
  { id: 'do-purchase', section: 'お金にする', icon: TrendingDown, kind: 'do', label: '仕入を登録する', hint: '見込みなら「仮」で先に入れる。受注すると見積の仕入が自動で仮で入る', path: '/finance?tab=purchase', keywords: 'shiire purchase 発注 原価 しいれ', module: 'budget' },
  { id: 'do-sga', section: 'お金にする', icon: Receipt, kind: 'do', label: '販管費を登録する', hint: '案件に紐づかない費用', path: '/finance?tab=sga', keywords: 'hankanhi sga 経費 はんかんひ', module: 'budget' },
  { id: 'do-xpoint', section: 'お金にする', icon: FileUp, kind: 'do', label: '精算PDFを取り込む', hint: 'X-Point / 楽楽精算 の申請PDFから仕入・販管費の行をつくる', path: '/finance/import?tool=xpoint', keywords: 'seisan pdf xpoint 楽楽 せいさん', module: 'budget' },
];

/** ② ひらく — 場所 */
const OPEN_COMMANDS: CommandDef[] = [
  // ───────── 今日やること ─────────
  { id: 'open-today', section: '今日', icon: Sun, kind: 'open', label: '今日', hint: '待たせているもの・動いている案件・今日の現場。ここから始める', path: '/today', keywords: 'kyou today ホーム home 受信箱 inbox きょう 行列', onRail: true },
  { id: 'open-tasks-me', section: '今日', icon: UserCheck, kind: 'open', label: '自分のタスクと依頼', hint: '自分に来ているもの。受ける・相談する・辞退するをここで返す', path: '/tasks?scope=me', keywords: 'mytask 依頼 delegation 自分 9マス じぶん やること', module: 'dailyops' },
  { id: 'open-tasks', section: '今日', icon: ListChecks, kind: 'open', label: 'タスク', hint: '自分 / 案件 / 全体 を切り替えて、リスト・ボード・ガントで見る', path: '/tasks', keywords: 'task todo やること かんばん kanban gantt ガント リスト チームの負荷 負荷', modules: ['sales', 'dailyops'], onRail: true },
  { id: 'open-map', section: '今日', icon: MapIcon, kind: 'open', label: '全体マップ', hint: 'この製品にある行き先の全部を、仕事の順番に並べた1枚。迷ったらここ', path: '/map', keywords: 'map サイトマップ 全体 一覧 どこ さがす menu メニュー ぜんたい' },

  // ───────── 仕事をとる ─────────
  { id: 'open-projects', section: '仕事をとる', icon: FolderKanban, kind: 'open', label: '案件', hint: '一覧とボードを切り替える。確定案件の絞り込みもここ', path: '/projects', keywords: 'anken projects 一覧 あんけん pipeline yomi ヨミ パイプライン ボード 確定 かくてい', module: 'sales', onRail: true },
  { id: 'open-customers', section: '仕事をとる', icon: Building2, kind: 'open', label: 'お客様', hint: '累計売上・案件・最終接点・次の一手。ご無沙汰の会社が上に出る', path: '/customers', keywords: 'kokyaku customer 顧客 こきゃく 取引先 会社', module: 'sales', onRail: true },
  { id: 'open-activity-logs', section: '仕事をとる', icon: MessageSquare, kind: 'open', label: '営業活動の記録', hint: 'やり取りの一覧。期限を過ぎた「次にやること」がここから追える', path: '/sales/activity-logs', keywords: 'eigyou activity 活動 記録 えいぎょう 接点', module: 'sales' },
  { id: 'open-estimates', section: '仕事をとる', icon: FileText, kind: 'open', label: '見積 (案件から開く)', hint: '見積は案件の中にある。案件を開いて「見積」から。粗利がその場で出る', path: '/projects', keywords: 'mitsumori estimate 見積 みつもり 粗利 値引き PDF', module: 'sales' },
  { id: 'open-pricing', section: '仕事をとる', icon: Tags, kind: 'open', label: '料金表', hint: '見積に使う単価。定価とグループ内価格を持つ', path: '/sales/pricing', keywords: 'ryoukin pricing 単価 見積 りょうきん マスター', module: 'sales' },
  { id: 'open-sandbox', section: '仕事をとる', icon: FlaskConical, kind: 'open', label: 'お試し（練習）', hint: '実績に混ざらない練習用。新人研修とデモに使う', path: '/sales/sandbox', keywords: 'otameshi sandbox 練習 試す 研修 新人 デモ おためし', module: 'sales' },
  { id: 'open-gls-import', section: '仕事をとる', icon: Import, kind: 'open', label: '旧GLS (決算取込)', hint: '決算から取り込んだ過去の案件。名前や分類をここで直す', path: '/sales/gls-import', keywords: 'gls kessan 決算 旧 けっさん', module: 'sales' },

  // ───────── 段取りする ─────────
  { id: 'open-schedule', section: '段取りする', icon: Calendar, kind: 'open', label: '予定', hint: 'スタジオ・パートナー・自分の予定を1つのカレンダーで。ここから登録できる', path: '/schedule', keywords: 'yotei schedule カレンダー calendar よてい スタジオ studio partner 代休 有給 マイカレンダー google outlook', modules: ['studio', 'partner_schedule'], onRail: true },
  { id: 'open-equipment', section: '段取りする', icon: Package, kind: 'open', label: '機材の台帳', hint: '機材・貸出機材・ケーブル・コネクタ・ラック図を種別で切り替える', path: '/equipment/items', keywords: 'kizai equipment 機材 一覧 きざい cable ケーブル connector コネクタ rack ラック', module: 'equipment' },
  { id: 'open-equipment-lendings', section: '段取りする', icon: ClipboardList, kind: 'open', label: '貸出の状況', hint: '出ているもの・返ってきていないもの。返却をこの画面で記録できる', path: '/equipment/lendings', keywords: 'kashidashi lending 貸出 かしだし 返却 遅延', module: 'equipment' },
  { id: 'open-equipment-inventory', section: '段取りする', icon: ClipboardCheck, kind: 'open', label: '棚卸し', hint: '在るか無いかをその場で記録する', path: '/equipment/inventory', keywords: 'tanaoroshi inventory 棚卸 たなおろし', module: 'equipment' },
  { id: 'open-equipment-maintenance', section: '段取りする', icon: Wrench, kind: 'open', label: 'メンテナンス', hint: '直しているもの・点検の予定', path: '/equipment/maintenance', keywords: 'maintenance 修理 点検 故障', module: 'equipment' },
  { id: 'open-qsheet', section: '段取りする', icon: FileText, kind: 'open', label: 'Qシート', hint: '台本の一覧。ここから編集と本番の配布URLに進む', path: '/qsheet', keywords: 'qsheet 台本 ランダウン onair だいほん キューシート', module: 'qsheet' },
  { id: 'open-techsheet', section: '段取りする', icon: BookOpen, kind: 'open', label: '技術資料', hint: 'カメラ・映像・音声・通信の仕様書の一覧', path: '/techsheet', keywords: 'techsheet 技術 仕様 ぎじゅつ 印刷', module: 'techsheet' },
  { id: 'open-call-sheet', section: '段取りする', icon: CalendarClock, kind: 'open', label: '香盤表 (案件から開く)', hint: '当日の動きを1枚に。案件の日程・予約・Qシート・機材から自動で組む', path: '/projects', keywords: 'kouban call sheet 香盤 進行 当日 レーン こうばん', module: 'sales' },
  { id: 'open-manual', section: '段取りする', icon: BookOpen, kind: 'open', label: '運営マニュアル (案件から開く)', hint: '部品12種を束ねて1冊に。会場図は AI が下書きする', path: '/projects', keywords: 'manual unei 運営 マニュアル 部品 配置図 会場図 まにゅある うんえい', module: 'sales' },

  // ───────── 本番をまわす ─────────
  { id: 'open-live', section: '本番をまわす', icon: Timer, kind: 'open', label: '計時LIVE', hint: 'カウントダウンと視聴者カウンター。表示機に出す', path: '/live', keywords: 'live timer 計時 視聴者 カウントダウン けいじ', module: 'liveops' },
  { id: 'open-awards', section: '本番をまわす', icon: Tv, kind: 'open', label: 'リアルタイムCG', hint: 'テロップ・ランキングの送出。出力URLを配って OBS などに載せる', path: '/awards', keywords: 'cg awards テロップ ランキング 送出 そうしゅつ', module: 'awards' },
  { id: 'open-tools', section: '本番をまわす', icon: Boxes, kind: 'open', label: '現場で使う外部の道具', hint: '翻訳・インタラクティブ演出・CG。使ったものを案件に紐づけて残す', path: '/tools', keywords: 'tool honyaku translate interactive cg 翻訳 演出 道具 himozuke 紐づけ 未紐づけ 成果物 ほんやく ひもづけ', module: 'sales' },
  { id: 'open-translate', section: '本番をまわす', icon: Languages, kind: 'open', label: '翻訳 (別のサイト)', hint: 'GMO 翻訳ツール。別のタブで開く', path: '/tools', keywords: 'honyaku translate 翻訳 ほんやく 多言語', module: 'sales' },

  // ───────── お金にする ─────────
  { id: 'open-finance', section: 'お金にする', icon: PiggyBank, kind: 'open', label: 'お金', hint: '売上 − 仕入 − 販管費 = 粗利 の流れで見る。数字を押すと明細へ', path: '/finance', keywords: 'okane finance 財務 予算 損益 おかね 粗利 3列 レビュー', module: 'budget', onRail: true },
  { id: 'open-finance-revenue', section: 'お金にする', icon: TrendingUp, kind: 'open', label: '売上の明細', hint: '確定と見積を分けて並べる。請求書の番号もここ', path: '/finance?tab=revenue', keywords: 'uriage revenue 売上 うりあげ 明細', module: 'budget' },
  { id: 'open-finance-purchase', section: 'お金にする', icon: TrendingDown, kind: 'open', label: '仕入の明細', hint: '仮の仕入と確定の仕入。仕入先ごとの集計もここから', path: '/finance?tab=purchase', keywords: 'shiire purchase 仕入 しいれ 明細 発注', module: 'budget' },
  { id: 'open-finance-sga', section: 'お金にする', icon: Receipt, kind: 'open', label: '販管費の明細', hint: '案件に紐づかない費用の一覧', path: '/finance?tab=sga', keywords: 'sga 販管費 経費 はんかんひ', module: 'budget' },
  { id: 'open-billing', section: 'お金にする', icon: FileCheck, kind: 'open', label: '請求のしごと', hint: '締めの日にまとめて請求書を出す・入金を確認する・検収書を出す', path: '/finance/billing', keywords: 'seikyu invoice 請求 入金 検収 締め せいきゅう 未入金', module: 'budget' },
  { id: 'open-joint-events', section: 'お金にする', icon: Users, kind: 'open', label: '合同案件 (各社に請求)', hint: '1回のイベントを何社かで開いて、参加社数ぶんの請求書を出す', path: '/finance/joint', keywords: 'goudou joint 合同 株主総会 複数社 各社 請求 ごうどう', module: 'budget' },
  { id: 'open-project-groups', section: 'お金にする', icon: Share2, kind: 'open', label: '費用を分け合う案件', hint: '1社が払う費用を複数の案件で分ける。請求書は1枚 (合同案件とはここが違う)', path: '/sales/project-groups', keywords: 'group 配分 グループ 分担 原価 分け合う わけあう', module: 'sales' },
  { id: 'open-finance-import', section: 'お金にする', icon: FileUp, kind: 'open', label: '取り込む (精算・決算)', hint: '取り込む → 確認する → 登録する の1本道', path: '/finance/import', keywords: 'import 取込 精算 決算 とりこみ', module: 'budget' },
  { id: 'open-budget-detail', section: 'お金にする', icon: Table2, kind: 'open', label: '案件の月別詳細', hint: '案件ごとに月をまたいだ売上・仕入・粗利を並べる', path: '/budget/detail', keywords: 'tsukibetsu 月別 詳細 つきべつ', module: 'budget' },
  { id: 'open-vendor-report', section: 'お金にする', icon: BarChart3, kind: 'open', label: '仕入先ごとの集計', hint: 'どこにいくら払っているか', path: '/budget/reports/vendors', keywords: 'vendor report 集計 仕入先', module: 'budget' },

  // ───────── ふりかえる ─────────
  { id: 'open-review', section: 'ふりかえる', icon: LineChart, kind: 'open', label: 'ふりかえり', hint: '今週 / 隔週キープの資料 / 月次の損益 / 営業レビュー を1画面で切り替える', path: '/review', keywords: 'furikaeri review 週次 ふりかえり 報告 ほうこく funnel ファネル 失注 pl 損益 目標', module: 'sales' },
  { id: 'open-keep-deck', section: 'ふりかえる', icon: Presentation, kind: 'open', label: '隔週キープをつくる', hint: '18ページのうち16ページを AI が埋める。人が書くのは2ページ', path: '/sales/keep', keywords: 'keep kakushu 隔週 キープ 会議 資料 報告 mtg かくしゅう', module: 'sales' },
  { id: 'open-sales-dashboard', section: 'ふりかえる', icon: LayoutDashboard, kind: 'open', label: '全社ダッシュボード', hint: '会社全体の数字。個別の案件は追わない', path: '/sales/dashboard', keywords: 'dashboard kpi ダッシュボード 全社', module: 'sales' },
  { id: 'open-ai-activity', section: 'ふりかえる', icon: Sparkles, kind: 'open', label: 'AI がやったこと', hint: 'AI が作ったもの・直されたものの記録。確認していないものが上に出る', path: '/sales/ai-activity', keywords: 'ai 履歴 activity 自動 確認', module: 'sales' },

  // ───────── 日々の事務 ─────────
  { id: 'open-weekly', section: '日々の事務', icon: CalendarCheck, kind: 'open', label: 'ウィークリー活動報告', hint: '週の活動をまとめて出す。AI が下書きする', path: '/daily/weekly', keywords: 'weekly 週報 活動報告 しゅうほう', module: 'dailyops' },
  { id: 'open-news', section: '日々の事務', icon: Newspaper, kind: 'open', label: 'デイリーニュース報告', hint: '業界のニュースを集めて共有する', path: '/daily/news', keywords: 'news ニュース 業界 デイリー', module: 'dailyops' },
  { id: 'open-inview', section: '日々の事務', icon: DoorOpen, kind: 'open', label: '内覧会 来場予約', hint: '開催日を選んで、その日の受付をする。名前・会社・電話で探せる', path: '/daily/inview', keywords: 'nairankai inview 来場 見学 ないらんかい 受付 予約', module: 'dailyops' },
  { id: 'open-daily-finance', section: '日々の事務', icon: FileText, kind: 'open', label: '届いた見積・請求書', hint: 'メールで届いた書類。AI が読み取った値を確かめて承認する', path: '/daily/finance', keywords: 'seikyuu invoice 見積 請求 注文 せいきゅう 届いた 承認', module: 'dailyops' },
  { id: 'open-daily-inquiries', section: '日々の事務', icon: Inbox, kind: 'open', label: 'その他の問い合わせ', hint: '案件になっていない問い合わせ。ここからネタ案件にできる', path: '/daily/inquiries', keywords: 'toiawase inquiry 問い合わせ といあわせ ネタ', module: 'dailyops' },
  { id: 'open-security-cards', section: '日々の事務', icon: KeyRound, kind: 'open', label: 'セキュリティカード', hint: '入館証の貸出と返却', path: '/daily/security-cards', keywords: 'security card 入館 貸出 にゅうかん', module: 'dailyops' },

  // ───────── 決めごと ─────────
  { id: 'open-settings', section: '決めごと', icon: Settings, kind: 'open', label: '設定', hint: '決めごとの入口。ここから下の項目に辿れる', path: '/settings', keywords: 'settei settings マスター せってい', onRail: true },
  { id: 'open-notification-prefs', section: '決めごと', icon: Bell, kind: 'open', label: '通知の受け取り方', hint: '朝の1通をどこで受けるか。通知は流れて消えない', path: '/settings/notifications', keywords: 'notification 通知 朝 slack メール つうち' },
  { id: 'open-users', section: '決めごと', icon: Users, kind: 'open', label: '人と権限', hint: '役割テンプレートを当てて「この人にできること」を決める。変更は履歴に残る', path: '/settings/users', keywords: 'user 権限 メンバー 招待 やくわり 役割 けんげん', adminOnly: true },
  { id: 'open-companies', section: '決めごと', icon: Building2, kind: 'open', label: '取引先マスター', hint: '請求先の名前・住所', path: '/settings/billing-parties', keywords: 'torihikisaki company 請求先 とりひきさき', module: 'sales' },
  { id: 'open-vendors', section: '決めごと', icon: Truck, kind: 'open', label: '仕入先', hint: '発注先の登録と適格請求書の番号', path: '/budget/vendors', keywords: 'vendor 仕入先 発注先 しいれさき', module: 'budget' },
  { id: 'open-partners', section: '決めごと', icon: UserSquare, kind: 'open', label: 'パートナー', hint: '外部スタッフの登録', path: '/budget/partners', keywords: 'partner 外部スタッフ ぱーとなー', module: 'budget' },
  { id: 'open-equipment-masters', section: '決めごと', icon: MapPin, kind: 'open', label: '機材のマスター', hint: '保管場所・メーカー・機材色・貸出機材の既定', path: '/equipment/locations', keywords: 'master 保管場所 メーカー 色 貸出機材 マスター', module: 'equipment' },
  { id: 'open-slack-digest', section: '決めごと', icon: MessageSquare, kind: 'open', label: '朝の1通（Slack）の配信設定', hint: 'チャンネルごとに「いつ・何を出すか」。送る前に本文を読める', path: '/settings/slack-digest', keywords: 'slack digest 朝 日報 配信 チャンネル', module: 'admin' },
  { id: 'open-system-settings', section: '決めごと', icon: Sliders, kind: 'open', label: 'システム設定', hint: '会社の情報・連携の設定', path: '/settings/system', keywords: 'system 設定 せってい', adminOnly: true },
  { id: 'open-data-viewer', section: '決めごと', icon: Database, kind: 'open', label: 'データビューア', hint: 'テーブルの中身を直接見る', path: '/settings/data-viewer', keywords: 'data viewer テーブル', adminOnly: true },
  { id: 'open-db-backups', section: '決めごと', icon: HardDriveDownload, kind: 'open', label: 'DBバックアップ', hint: '3時間ごとの控えの一覧と、戻し方', path: '/settings/db-backups', keywords: 'backup 復元 db ばっくあっぷ', adminOnly: true },
  { id: 'open-kessan-import', section: '決めごと', icon: Import, kind: 'open', label: '決算インポート', hint: '仕訳帳から売上・仕入・販管費を取り込む', path: '/finance/import?tool=kessan', keywords: 'kessan 決算 仕訳帳 けっさん', adminOnly: true },
  { id: 'open-dedup', section: '決めごと', icon: Copy, kind: 'open', label: '同じ支払いが2回入っていないか調べる', hint: '手入力と決算取込が重なった行を見つけて片方を消す', path: '/finance/import?tool=dedup', keywords: 'dedup 二重 重複 じゅうふく', adminOnly: true },
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


/**
 * 現在地を1つに決める (v3.1.0)。
 *
 * ── なぜ要るか ─────────────────────────────────────────────
 *
 * 「いま自分がどこにいるか」の表示が**画面によって出ない**状態だった:
 *
 *   - レールが活性になるのは 7 項目の `matchPrefixes` に当たる画面だけ。
 *     `/search` `/review` `/tools` `/sales/sandbox` `/sales/keep` `/sales/pricing`
 *     `/sales/dashboard` `/sales/ai-activity` の **8 画面はどのレールも点かず**、
 *     パンくずも出ないので、画面の題名以外に手がかりが無い
 *   - 現場アプリ (機材・Qシート・技術資料・計時LIVE・リアルタイムCG) では
 *     **7 項目すべてが消灯**する。パンくずはアプリ名の固定文字列だったので、
 *     「機材管理」の中でどこに居るのかは分からない
 *
 * レールを増やす方向では解けない (レールはモノで分かれており、道具はモノではない)。
 * **区分は仕事の順番で1つに決めてある**ので、行き先の表から現在地を引く。
 * これで ~100 画面すべてが「区分 / 画面の名前」を持つ。
 *
 * 判定は**最長一致**。`/equipment/lendings` は「貸出の状況」に当たり、
 * `/equipment/xxx` は「機材の台帳」(`/equipment` の別名) に落ちる。
 */
const EXTRA_MATCH: Record<string, string[]> = {
  'open-projects': ['/sales/projects', '/sales/pipeline', '/sales/estimates'],
  'open-customers': ['/sales/customers', '/sales/companies'],
  'open-tasks': ['/sales/tasks', '/daily/tasks'],
  'open-schedule': ['/studio'],
  'open-finance': ['/budget/dashboard', '/revenues', '/purchases', '/sga'],
  'open-equipment': ['/equipment'],
  'open-qsheet': ['/qsheet'],
  'open-techsheet': ['/techsheet'],
  'open-live': ['/live'],
  'open-awards': ['/awards'],
  'open-settings': ['/settings', '/admin'],
  'open-activity-logs': ['/sales/activity-logs'],
  'open-review': ['/review', '/sales/review', '/sales/keep-report'],
  'open-billing': ['/finance/billing'],
  'open-joint-events': ['/finance/joint'],
  'open-weekly': ['/daily/weekly'],
  'open-inview': ['/daily/inview'],
  'open-daily-finance': ['/daily/finance'],
  'open-daily-inquiries': ['/daily/inquiries'],
  'open-security-cards': ['/daily/security-cards'],
  'open-users': ['/settings/users'],
  'open-companies': ['/settings/billing-parties'],
  'open-equipment-masters': [
    '/equipment/locations',
    '/equipment/manufacturers',
    '/equipment/colors',
    '/equipment/rental-settings',
    '/equipment/rental-categories',
  ],
};

/** 現在地に当たる行き先。`null` はどこにも当たらなかった (知らないURL) */
export function locatePath(pathname: string): { section: string; label: string } | null {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  let best: CommandDef | null = null;
  let bestLen = -1;
  for (const c of ALL_COMMANDS) {
    if (c.kind !== 'open') continue;
    const base = c.path.split('?')[0];
    for (const p of [base, ...(EXTRA_MATCH[c.id] ?? [])]) {
      if (p === '/') continue;
      if (path === p || path.startsWith(`${p}/`)) {
        if (p.length > bestLen) {
          bestLen = p.length;
          best = c;
        }
      }
    }
  }
  if (!best) return null;
  const section = SITE_SECTIONS.find((s) => s.id === best!.section);
  return { section: section?.title ?? best.section, label: best.label };
}
