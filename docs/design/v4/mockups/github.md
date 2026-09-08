> **状態**: 参考（当時の記録）
> **最終確認**: 2026-09-08（v4.6.10）
> **位置づけ**: 2026-08-02 の同期記録（モック側から見た実装ファイルの対応）。現状はコードが正。いまの画面→ファイルの対応は [`../../../v4-progress.md`](../../../v4-progress.md)

repo: terai-takehiro/gmo-onair
branch: dev

## Last sync
date: 2026-08-02T07:05:00Z
upstream_read: client-daily（App.tsx / AppShell.tsx / HomePage / WeeklyDetailPage / DailyNewsPage / InviewDayPage / FinanceDocsPage / InquiriesPage / lib/types.ts / lib/securityCardApi.ts / manual/content.tsx）

### Updated in this project
- 日常業務のダッシュボードを廃止（ミニアプリの集合体なので、入口はトップページの階層メニュー）。既定の画面はウィークリー活動報告
- 内覧会を実装（v3.0.6）どおり2画面に分割：開催日の一覧（/inview＝全部の回をまたぐ検索・すべての回/今後の回・新しい順/古い順・日ごとの回チップと組/名・受付n/名・今日/終了・CSV全期間）と、その日の受付（/inview/:date＝回をまたぐ検索・並び替え5種・会社別サマリーの開閉・参加者ブロック＝代表/同行/氏名未登録ほかN名・同行者を1人ずつ受付・受付取消・案件化）
- 日常業務（v4-mockup-dailyops.dc.html）を新規作成。画面＝ウィークリー活動報告／デイリーニュース報告／内覧会 来場予約／受け取った書類／その他問い合わせ／セキュリティカード
- 重複を整理：①タスク・依頼は置かず案件管理へ（実装の /daily/tasks → /tasks?scope=me のリダイレクトに合わせた）②「見積/請求書」を「受け取った書類」に改称し、自社が出す請求（財務管理）と分けたうえで、承認後に「財務管理へ渡す」で仕入/販管費の下書きになる一本道にした ③その他問い合わせから「案件の受付（ネタ）へ送る」を置き、案件になるものは案件管理だけで追う ④内覧会の来場者は promoted_project_id に相当する「案件になりました」印を持たせ、案件化は案件管理へ ⑤セキュリティカードは機材の貸出とは別台帳であることを明記（エリア解錠権限で分かれる）⑥ニュースの採用（1〜5）を付けた行を週報のトピックに送る導線を追加し、二度打ちを止めた
- 実装準拠：週報＝自動集計→AI本文→人のトピック／確定後は追記不可、ニュース＝日付ナビ・カテゴリ・AI活用・採用1〜5・記入者、内覧会＝回をまたぐ検索・同行者を1人ずつ受付・会社別サマリー・CSV、書類＝受信→確認中→承認/却下→処理完了と原本表示、カード＝24枚・レベル別のエリア解錠・貸出/返却・返却遅延

## Sync history
### 2026-08-02（カレンダー）
date: 2026-08-02T06:36:24Z
upstream_read: client/src/contexts/production（SchedulePage / schedule/types.ts / schedule/dialogs.tsx / scheduleShared.tsx / CallSheetPage / SignagePage）

### Updated in this project
- カレンダー（v4-mockup-calendar.dc.html）を新規作成。予定（1本のカレンダー＋スタジオ/パートナー/自分のレイヤー）・部屋の空き（部屋 × 時間）・仮押さえ（本番日までの残り日数順・本予約への切替）・設定（部屋／外部カレンダー／サイネージ）の4画面
- v2.9系の機能を反映：フィードURLとトークン再生成、Google/Outlook/ICS購読と書き戻し、取込元の色分け（題名に混ぜない）、祝日・土日の色、部屋の略称チェイン、サイネージの「仮押さえ」札
- 香盤表はQシート（制作資料）へ移管する方針のためカレンダーからは外した
- トップの上部バーに 財務管理／カレンダー／機材管理／制作資料 の入口を追加し、アプリの行き先を openApp に集約。ページナビゲーション・サイトツリーのメニュー割りを実際のモックに合わせて更新

## Sync history
### 2026-08-02
date: 2026-08-02T10:40:00Z
upstream_read: client-equipment（App.tsx / EquipmentDailyPage.tsx / ThingsPage.tsx / lib/constants.ts）

### Updated in this project
- 取り込みを実装の1本道（routeAdapters の ImportFlow）に合わせて作り直した。取込元タブ＝精算PDF／総勘定元帳（freee 仕訳帳CSV・MoneyForward xlsx）／二重計上を調べる、上に「取り込む→確認する→登録する」の3ステップ。精算PDFはBOX経由をやめ、この画面に直接ドラッグしてAIが支払先・金額・発生日・案件(GLS)・税区分を読み取る形にし、一覧に読み取り信頼度の列を追加（低いものは橙）
- 総勘定元帳の取り込み（KessanImportPage）を追加：対象（すべて/販管費/売上/仕入）・案件顧客取引先の自動作成・固定原価除外・重複スキップ、解析（dry-run）→投入、結果表（区分別の件数・金額・重複候補）と足りないマスタ。二重計上スクリーニング（DedupScreeningPage）も追加：消す行＝取り込み側（赤・打消）／残す行＝手入力（緑）の対比表とKPI4枚
- 合同案件を廃止し、売上ページの「案件按分（複数社で分ける）」タブに統合。1つの案件を参加社の頭数で割り、会社ごとにGLS・売上・原価・粗利・請求書の状態を持つ形（幹事→代表社、端数は代表社）
- 損益をダッシュボードに改称し、KPIの並びを実際のお金の流れ（売上 − 仕入 − 固定原価 = 売上総利益 ／ 売上総利益 − 販管費 = 営業利益）に組み替え。内訳3列は案件名を主・GLS番号を従に変え、行から案件管理へつながるようにした。ヘッダーに売上・仕入・販管費の登録ボタン
- 財務管理を新規作成（v4-mockup-finance.dc.html／8画面）。UI/UX刷新前（v2.9.200 ころ）の形を土台にし、「損益の流れ」帯ではなく KPI カード＋集計条件＋内訳3列に戻した。画面は 損益／請求のしごと／売上／仕入（変動原価・固定原価タブ）／販管費／精算の取り込み／合同案件／取引先（仕入先・請求先・パートナー）
- 財務管理の押したときの姿を20種：売上・仕入・販管費の登録／Excel入出力／明細を探す／削除の確認（対象名入り・赤）／案件で絞り込む／印刷する／まとめて出す／請求書を見る／入金を記録／催促する／出した記録の取り消し／検収書を出す／取込元フォルダ／取り込む／合同案件をつくる／会社を足す／あまりを寄せる先／取引先を足す
- トップと各アプリの切替から財務管理へ行けるようにした
- ボタンを押したときの姿を全画面ぶん用意した。機材登録／貸出登録／メンテナンス記録／棚卸し作成に加えて、保管場所の追加・マスタ設定（拠点・種別）・メーカー追加・色追加・貸出カテゴリ追加・削除の確認（赤）・ブランクパネル追加・ラック追加・設置場所の変更・Excel入出力・QRシール印刷・機材を同期・返却の記録・表示する列 の14種を追加。「これから作ります」で止まる操作は表示列のような設計未定のものだけにした
- 設定の保管場所とメーカーを実装の項目に合わせて作り直した（LocationPage：場所名・拠点・種別＝ラック/オペ卓/AV盤・Uサイズ・建物/フロア/エリア・説明・表示順、拠点と種別は MasterDialog のマスタ設定。ManufacturerPage：メーカー名・担当者・電話・メール・住所・備考・表示順）
- 画面切替タブに「⑧ 設定」を追加
- 設定を1画面にまとめた（左メニューの「保管場所／メーカー・カラー／貸出設定」を「設定」1つに統合し、タブで 保管場所／メーカー・色／貸出カテゴリ／貸出の決めごと を切り替え）。保管場所は棚卸し対象のトグル＋拠点コード（Y/S）、メーカーは表記ゆれの統合、色は ColorPage の色マスタ（ラック図のセル色）、貸出カテゴリは RentalCategoryPage の並べ替え・改名・削除、決めごとは返却予定日の初期値・遅延を知らせるタイミング・社外貸出と承認・QRでの記録・修理中の貸出禁止
- ラック図の絵を実装（rackLayout/RackDisplay.tsx・config.ts）に寄せて作り直し。黒いラック筐体・左右のU番号（右は反対面に機材があるUをオレンジで表示）・種別色（TYPE_BG）のセル・No.バッジ・ブランクパネル／通線口／引き出し・6分割の割付（全幅／左右1/2／1/3）・下の「42U」表記。高さで文字の出し方を変える規則（1U＝型名＋No.、2U＝型名／機材名、3U以上＝機材名／型名）も踏襲。v4側の作法として、絵の右に桁のそろった実装リスト（U位置・ID・機材・種別・割付）を置いて読み取れるようにした
- ダッシュボードは左＝稼働停止中／返却期限超過、右＝本日明日の入出庫／棚卸しの2カラムに再配置（クイックアクション廃止で空いた右側を埋めた）
- ラック図を機材台帳のタブから独立ページへ。左メニューに「ラック図」を追加し、ラック一覧＋1U単位の実装図（前面／背面の切替、空きU、機材を押すと機材詳細へ）
- ダッシュボードのヘッダーに「機材登録」を追加し、クイックアクションのカードは廃止
- 資産管理は日常では畳む方針に変更。機材台帳と機材詳細のヘッダーに「資産管理を表示」トグルを置き、既定は非表示（列・資産情報カード・固定資産/リースの絞り込みがまとめて出入りする）
- 機材詳細を貸出可／常設で出し分け。貸出可＝貸出カテゴリ・貸出表示名・貸出履歴（EquipmentDetailPage の rental 限定カード）＋「貸出を登録」、常設＝ラック実装（U位置・高さ・横位置・面）と電源系統・接続先＋「設置場所を変える」
- 機材詳細に資産情報を追加（EquipmentDetailPage の「基本情報」「資産情報」カードに合わせ、所管・資産管理（固定資産／消耗品／リース／譲渡）・資産コード・償却年数・購入年月・保証期間・保証終了・コンディション。付属品/オプション品（children）も追加）。台帳に資産管理列と 固定資産／リース の絞り込みを追加。機材登録ダイアログにも資産項目を追加
- 機材管理を6画面に拡張：ダッシュボード／機材台帳／メンテナンス／棚卸し／QRスキャン／貸出・返却。棚卸しは保管場所ごとに ✓／× を押す形（InventoryPage の locKey グルーピングと found=1/2 を踏襲）、QRスキャンは ID 形式「拠点-種別-連番5桁」と手入力フォールバックを反映
- 制作資料（v4-mockup-production.dc.html）を新規作成。香盤表一覧を実装。本番は client-qsheet の LivePage の考え方どおり「1つのURL＋役割（進行／ランダウン／プロンプター／音声サポート）」に統一し、音声サポートだけログイン不要の公開URLとして明記
- 機材台帳の列を実装に合わせて修正（equipmentList/columns.ts の PRINT_COLS＝ID・種別・商品名・メーカー・型名・No.・設置場所、CablePage/ConnectorPage の既定列＝種別・商品名・メーカー・型名・m・色・設置場所・収納方法・本数/個数）。設置場所は拠点チップ＋部屋チップで縦にそろえた
- 機材台帳（ThingsPage の「同じ台帳＝種別タブ」の考え方）を追加。機材／貸出機材／ケーブル・コネクタ／ラック図を1画面のタブに集約
- 機材は「常設が基本」に整理。貸出は機材台帳で「貸出可」にチェックした機材だけが対象になる形に変更（チェックは一覧でその場で切替）
- 画面名・メニュー名を一般的な業務用語に統一（日々→ダッシュボード、もの→機材台帳、案件を開く→案件詳細、宿題→持ち帰り事項 ほか）
- v4モックアップをアプリ単位のファイルに分割：v4-mockup-main（共通・案件管理）／ v4-mockup-project（プロジェクト管理）／ v4-mockup-equipment（機材管理）。行き来は上辺のリンクで
- 機材管理「日々」を新規作成。実装の EquipmentDailyPage の構成（返ってきていないもの／今日と明日の出し入れ／直しているもの／棚卸し／種別ごとの在庫／KPI4／よく使う操作／消耗品）と constants.ts の種別コード・状態・種別色をそのまま反映
- 案件管理／プロジェクト管理に「全案件・全プロジェクト」の横断ビュー（タスク一覧・見積／請求・検収）を追加。全体と自分の切替＋期限・案件・状態の並べ替え
- プロジェクトの中に議事録を追加（文字起こし投入 → AI整形 → 決定事項・宿題・未確認事項を抽出してタスク／未確認事項へ送る）
- 標準工程テンプレートは設定へ移動。未確認事項の単独ページと活動履歴ページは廃止（タスク・プロジェクト内に内包）

### 2026-08-01
date: 2026-08-01T08:20:01Z
upstream_version_at_sync: v2.9.276（見積をつくる画面）

### Updated in this project
- 案件を開く ＞ 見積タブを新設。料金表v3（121_pricing_v3.sql の全7分類・約90品目）をそのままデータ層に取り込み、明細をスタジオ／技術・人員／制作・その他の3グループで表示
- 「料金表から足す」ダイアログを実装（検索・複数選択・グループ内価格／定価の切替）。選ぶだけにして数量・単価は明細で直す形
- 行ごとに仕入(見込み)を持たせ、粗利率がその場で動く。30%を切ると赤くなるが止めない
- 値引きは明細の単価を下げずに別建て。版（v1送付済み／v2作成中）と「ONAiRは送らない」を明記
- タスク追加モーダル：収録回に足すで対象エピソードのプルダウンを追加、担当を並列チップからプルダウンに変更
- 大量ホバー時のフリーズを解消（アイコン再生成と幅計測のデバウンス化）
- v4 モックアップを新規作成（共通：トップページ・ページナビゲーション・サイトツリー・スマホ／案件管理：機能の整理・受付の流れ・ダッシュボード・受付ビュー・案件一覧・案件を開く）
- 案件を開いた画面の「書類」タブを BOX 連携にあわせて設計（社内限り／社外共有可の2フォルダとサブフォルダ構成を実装に一致させた）
- 案件受付はネタ→案件の二段構え。受付者は「案件にする」を押した人を記録
- 案件担当者の概念は置かず、タスク単位で誰が何をするかを表す形に変更
- 案件管理の左メニューはダッシュボードと案件一覧の2つのみ（他はゼロベースで再検討中）

## Sync history
### v3.1.5 → v2.9.276 参照（2026-08-01）
- README v2.9.276「見積をつくる画面を新設 (30章 37a)」と 145_estimate_builder.sql の設計意図を v4 モックアップに反映

### v3.1.5 (2026-07-31)
- 第 VII 部「アプリ単位の導線」を追加し、トップ＝アプリの入口＋個人の秘書ゾーンに戻した

### v2.9.275 (2026-07-26)チームの「前のUIのほうが分かりやすい」に対し、**導線だけ**アプリ単位に戻す（画面は第 II〜VI 部をそのまま引き継ぐ）
- トップページを再設計：上＝アプリの入口（10＋外部2）／下＝「今日」の秘書ゾーン（自分のやること・お待たせ中・今日の現場・AIの確認待ち）
- アプリの中の導線を復活：上辺にアプリ切替、左にそのアプリのメニュー。左の共通レール7項目はやめる
- 10アプリのメニュー割りを実装から数え直して作成（案件管理・財務管理・カレンダー・Qシート・機材・技術資料・計時LIVE・CG・日常業務・設定）
- タスクは入口3つ（トップ／案件管理／案件の中）・実体1つ（project_tasks）・画面1つ（スコープ×表示形式）に整理
- 判定表11件（戻す／引き継ぐ／やめる）と、URL・実装で触る場所・スマホ下タブ3つを追加。旧URL 36本の転送表は維持
- 上流 v3.1.0 の §4.5（分類を仕事の順番に統一・`/map` 新設・レール7項目維持）を読み、区分8つは現在地表示と ⌘K の並びだけに残す判断に変更
- 0 設計図 を7部構成に更新し、見直しの経緯を明記（付録のサイトマップは前の案の記録として残す）

## Sync history
### v2.9.275 (2026-07-26)
- 未着手だった画面をすべて作成：見積（30章）・請求と入金（31章）・検索結果/書類(BOX)/カード貸出（36章）・案件の成果物（15章）
- 実装との差の判断を反映：案件内タブは「お金」「予定」から先に作る、マイク香盤はQシートごとに調整（共通マスターは作らない・似た台本から引き継ぐ）
- 29章「隔週キープをつくる」を追加。①②③を毎回・④以降は追加式。AIが埋める16ページ/人が書く2ページに仕分け（6.5時間→45分）
- 隔週キープの出力スライド（16:9）を Ver.2.5 の型のまま本サイトの規格で作成
- AIが編集中の案件に追記する見せ方（v2.9.275）を 18章に反映
- 第18章「みんなで書く」を追加（v2.9.273/274）。メモ・チェックは同時編集、コメントと変更の記録は残るものとして分けた
- 金額は同時編集にしない（409で止める）方針と、接続失敗時の読み専用表示を設計に反映
- ボタン・バッジ・アイコン・行高・列幅・金額表記を全ファイルで統一（第6章に寸法の規定を記載）
- 書体をプロポーショナル道用（palt/kern）に。数字だけ tnum で桁を揃える
- 第10章「返信の下書き」を追加（v2.9.272）。ONAiR は送らないことを画面に明記し、AIの循琰5条件を設計に反映
- 第30章「実装で足した画面」を追加（v2.9.268/269/270）。朝の1通のSlack設定・見積請求の原本表示・権限の変更履歴
- 香盤表の目盛りを1時間88pxに広げ、短い枠の文字切れと重なりを解消
- 設計図を7ファイルに分割（0 設計図 ＋ 第I〜VI部）。データは onair-data.js に共通化
- Qシート・香盤表・技術資料・計時LIVE・CG・翻訳・インタラクティブを案件のタブに一本化。トップの「アプリを起動」とアプリ切替を廃止
- 案件外の試用を「お試し（/sandbox・14日・実績集計外・社外配布不可・案件に引き継ぎ可）」で受ける設計を追加
- 制作支援・素材納品は対象外として明示
- 設計図を体系化（6部構成：考え方 / 毎日 / 案件 / 現場 / 数字 / 土台）。先頭の目次を部ごとのマップに差し替え
- 第23章「徒底的に削る」：残す/統合/自動/やめる の判定表（16件）と、やめても困らないものの根拠
- 第24章「案件の入力を減らす」：ProjectFormPage の22項目を いま必要3 / 進んだら聞く9 / 自動で入る6 / やめる4 に仕分け
- リアルタイムCG（client-awards）の送出操作UIを設計。本番は1画面に統合し、準備（出力URL・リハーサル）を分離した
- ことばの設計（第20章）を追加し、行列→お待たせ中などを全体に適用
- 上流は全13フェーズ完了（v2.9.251〜266）。Phase 13（スマホ）は「出す量を決めた」段階なので、最適化を設計し直した
- 第16章を拡張: 19d 今日（片手）/ 19e その場で終わらせる（ボトムシート）/ 19f 現場モード（QR連続・オフラインキュー）/ 19g 本番中（音声・プロンプター）/ 19h スマホの決めごと8項目 / 19i さがす（⌘Kのスマホ版・打たずに選べる）

### Previous sync (v2.9.249)
- 実装仕様書（docs/UI刷新_実装仕様書.md）を作成。新ルート・リダイレクト表・画面別仕様・13フェーズの順序・受け入れ条件
- v2.9.249 との整合確認と反映（読み取れなかったときの状態、他人の負荷は件数のみ、案件の在席表示）
- 共通ルール（4状態・文言・用語）と、ふりかえり・設定と権限・スマホ・通知・機材・Qシートを追加
- Qシートを追加。編集画面（列の出し入れ・稿の手動更新・共有の既定化）と本番画面（4画面→役割切替＋QR配布）
- 財務レビューの3列表示を1番上に追加
- 予定（カレンダー4本→1本・部屋レーン・仮押さえの期限）とお金（損益の流れ・取込一本道）を追加
- 翻訳・インタラクティブ・リアルタイムCGを「案件の道具だが単発でも使える」形に設計
- お客様（一覧・顧客360）を新設計で追加。顧客マスターのCRUD表と360の行き止まりを解消
- 全アプリのサイドバーを棚卸し、13アプリ・60メニューを6つの場所に統合するIA案と共通ナビを作成
- タスク導線を整理。同じ project_tasks を見る5つの入口を、1メニュー（スコープ×表示形式）に統合する案を作成
- 案件一覧を追加。現行の案件一覧と「ヨミ・パイプライン」を1画面のリスト／ボード切替に統合
- 案件ワークスペース（案件編集ページ）の刷新案を追加。クイックリンクは ProjectQuickLinks.tsx の実際のリンク集合に合わせた
- ナビゲーション表記を案件名＋顧客名主体に変更し、GLS番号は識別子として従属表示に
- 没案（初期2案・投入欄強調版）を削除し、3a系（白ベース）に一本化
- 書体を LINE Seed JP（400/700/800）に変更。現行再現（0a）は製品どおり Noto Sans JP のまま

| v4 案件を開く ＞ 書類（BOX） | server/src/contexts/sales/services/box-folder.service.ts（社内限り／社外共有可の2親フォルダ・サブフォルダ名・【社内】【社外】接頭辞・リネーム挙動）, server/src/shared/services/box.ts, server/src/contexts/dailyops/routes/finance-doc-original.routes.ts（原本のBOX保存・テキスト抽出） |

## Screen map
| 画面 | 元となるリポジトリのファイル |
| --- | --- |
| v4 日常業務（v4-mockup-dailyops.dc.html） | client-daily/src/App.tsx（ルート＝メニュー構成・/tasks は案件管理へリダイレクト）, components/layout/AppShell.tsx（NAV_ITEMS 7件）, pages/HomePage.tsx（メニューカードと件数バッジ）, pages/WeeklyDetailPage.tsx（自動集計KPI・パイプライン・活動内訳・AI本文・週次トピックス・確定）, pages/DailyNewsPage.tsx（日付ナビ・テーブル列・採用1〜5・確認済み）, pages/InviewPage.tsx（開催日の一覧・全部の回をまたぐ検索・upcoming/並び順・回チップ）, pages/InviewDayPage.tsx（その日の受付・並び替え・会社別サマリー・CSV）, pages/inview/shared.tsx（来場者カード・代表/同行の個別受付・案件化・登録ダイアログの全項目）, pages/inview/logic.ts（dayKey/UNDATED・NFKC正規化とカタカナ→ひらがなの検索・matchedFields・SORT_LABELS・CSVの参加者展開）, pages/FinanceDocsPage.tsx（種別/状態タブ・状態遷移・原本・PDF落として登録）, pages/InquiriesPage.tsx（重要度・分類・対応済み）, lib/securityCardApi.ts（SECURITY_AREAS 10エリア・24枚・貸出/返却・overdue）, lib/types.ts（カテゴリ・ラベル定義）, manual/content.tsx |
| v4 カレンダー（v4-mockup-calendar.dc.html） | client/src/contexts/production/pages/SchedulePage.tsx（1本化・レイヤー・部屋ごとの行・期限が近い仮押さえ・ビュー切替）, pages/schedule/types.ts（予約種別の色/ラベル・祝日・取込元の色・略称チェイン・daysUntil）, pages/schedule/dialogs.tsx（カレンダー連携＝フィードURL・サイネージURL・トークン再生成・種別ピッカー）, components/schedule/scheduleShared.tsx（パートナー予定の種別色・ICS購読・表示状態の保存）, pages/SignagePage.tsx（表示機の「仮押さえ」札・空室/ご利用中） |
| v4 機材管理 ＞ 機材詳細・登録ダイアログ | client-equipment/src/pages/EquipmentDetailPage.tsx（基本情報／資産情報／貸出履歴／メンテナンス記録／付属品・オプション品・編集ダイアログの全項目）, client-equipment/src/lib/constants.ts（ASSET_CLASS_OPTIONS・STATUS_OPTIONS・CONDITION_OPTIONS・LOC_CODES・SECTIONS）, EquipmentListPage.tsx（新規登録フォームの項目） |
| v4 財務管理 ＞ 取り込み（3取込元） | client/src/components/layout/routeAdapters.tsx（ImportFlow＝3ステップ・取込元の選択・管理者のみの出し分け）, client/src/contexts/finance/pages/XpointImportPage.tsx（PDFアップロード→解析→仕入/販管費に登録）, client/src/contexts/platform/pages/KessanImportPage.tsx（総勘定元帳：scope・createMasters・excludeFixed・skipDuplicates・dry-run/commit・区分別サマリー・未登録マスタ・重複候補）, DedupScreeningPage.tsx（消す行/残す行・論理削除） |
| v4 財務管理（v4-mockup-finance.dc.html） | client/src/contexts/finance/pages/FinancePage.tsx（KPI＝売上/仕入/変動原価/限界利益/固定原価/売上総利益/販管費/営業利益・集計期間 月/四半期/年/期間指定・案件絞り込み時は販管費を外す・内訳3列）, BillingWorkPage.tsx（請求書を出す/入金の確認/検収書を出す・書類が揃わない行は選べない・まとめて出す・最近入金した分・月次運用）, RevenueListPage.tsx / PurchaseListPage.tsx / SgaListPage.tsx（登録フォームの項目）, XpointImportPage.tsx（Box取込・読み取り項目・仕入/販管費の振り分け）, JointEventsPage.tsx（幹事・参加社・あまりは幹事・合同の粗利）, VendorListPage.tsx / PartnerListPage.tsx（取引先） |
| v4 機材管理 ＞ 設定（1画面4タブ） | client-equipment/src/pages/LocationPage.tsx（保管場所マスタ）, ManufacturerPage.tsx（メーカー）, ColorPage.tsx（色マスタ＝ラック図のセル色・凡例・並び順）, RentalCategoryPage.tsx（貸出カテゴリの追加・改名・並べ替え・削除時の挙動）, RentalSettingsPage.tsx（貸出一覧に出す／出さないの切替は機材台帳側に集約）, lib/constants.ts（LOC_CODES） |
| v4 機材管理 ＞ ラック図（独立ページ） | client-equipment/src/pages/rackLayout/RackDisplay.tsx（ラック筐体・セル・U番号・反対面ハイライト・ブランクパネル種別・高さ別の文字組み）, rackLayout/config.ts（CELL_H/RACK_W/slotToColumn の6分割）, pages/RackLayoutPage.tsx（前面/背面の切替・棚卸しモード・印刷）, lib/constants.ts（TYPE_BG・RACK_SLOT_OPTIONS） |
| v4 機材管理 ＞ メンテナンス／棚卸し／QRスキャン／貸出・返却 | client-equipment/src/pages/MaintenancePage.tsx（種別・状態・業者・修理費）, InventoryPage.tsx（保管場所グルーピング・found 1/2・機材同期・下書き/実施中/完了）, ScanPage.tsx（QR/ID の解決・使い方）, LendingListPage.tsx（貸出状態） |
| v4 制作資料 ＞ 香盤表一覧（v4-mockup-production.dc.html） | client-qsheet/src/App.tsx（ルート構成・音声サポートの公開URL）, client-qsheet/src/pages/LivePage.tsx（本番1入口＋?role= の役割切替）, DashboardPage.tsx / EditorPage.tsx（稿・項目・尺の持ち方） |
| v4 機材管理 ＞ 機材台帳（v4-mockup-equipment.dc.html） | client-equipment/src/pages/ThingsPage.tsx（機材・貸出機材・ケーブル・コネクタ・ラック図を種別タブに集約）, EquipmentListPage.tsx / ModelGroupPage.tsx / CablePage.tsx / ConnectorPage.tsx / RackLayoutPage.tsx（各台帳の列） |
| v4 機材管理 ＞ ダッシュボード（v4-mockup-equipment.dc.html） | client-equipment/src/pages/EquipmentDailyPage.tsx（返ってきていないもの・今日と明日の出し入れ・棚卸し・種別ごとの在庫・KPI・クイックアクション・消耗品）, client-equipment/src/lib/constants.ts（種別コード/色・状態・コンディション）, client-equipment/src/App.tsx（ルート＝メニュー構成） |
| 42a トップページ / 42b 決めごと（第 VII 部） | client/src/contexts/platform/pages/TodayPage.tsx（あいさつ・投入・お待たせ中・今日の現場）, client/src/contexts/platform/AuthContext.tsx（BLOCK_APPS の13アプリ・外部URL・準備中）, shared/src/client/notifications/NotificationBell.tsx, shared/src/client/shell/railBadges.ts |
| 43a アプリの中の導線 / 43b 10アプリのメニュー割り | shared/src/client/shell/{AppShell,Rail,TopBar,SecondaryNavList,LocationCrumb}.tsx, shared/src/client/shell/railItems.ts, shared/src/client/commandPalette/{commands.ts,types.ts}（SITE_SECTIONS）, client/src/App.tsx, client-equipment/src/components/layout/AppShell.tsx（NAV_ITEMS 10件）, client-daily/src/components/layout/AppShell.tsx（NAV_ITEMS 7件）, client-{qsheet,techsheet,live,awards}/src/App.tsx（各アプリのルート） |
| 44a タスクの置き場所 | client/src/contexts/tasks/pages/*, docs/archive/2026/ia-v2.9-rail-era.md §Phase 5（スコープ×表示形式）, docs/archive/2026/ia-v2.9-rail-era.md v2.9.271（個人タスクを案件ボードに出さない） |
| 45a 判定表 / 45b URL・実装・スマホ | docs/archive/2026/ia-v2.9-rail-era.md §4.5（v3.1.0 の分類見直し・/map・NotFoundPanel）, client/src/App.tsx（旧URL 36本の転送表）, client/src/contexts/platform/pages/SiteMapPage.tsx, shared/src/client/shell/railItems.ts（RailItem.mobile） |
| v4 案件を開く ＞ 見積 | server/src/shared/db/migrations/121_pricing_v3.sql（料金表v3マスター全件）, 064_pricing_group_price.sql（定価/グループ内価格の使い分け）, 145_estimate_builder.sql（行の仕入・値引き・版・送付記録・BOX PDF）, client/src/contexts/sales/components/estimate/PricingPickerDialog.tsx（3グループへの寄せ方・calc_type→単位・選ぶだけの原則）, client/src/contexts/sales/pages/EstimatePage.tsx |
| 0a 現行ホーム（再現） | client/src/contexts/platform/pages/HomePage.tsx, client/src/components/layout/{AppShell,Header,Sidebar}.tsx, shared/src/client/{AppHeader,SharedHeader,AppSwitcher}.tsx, shared/src/client/dashboard/{DashboardHeader,KpiCard,SectionCard,EmptyState}.tsx, client/src/contexts/sales/pages/InboxPage.tsx, client/src/contexts/platform/AuthContext.tsx, shared/src/constants/statuses.ts, shared/src/client/tokens.css, shared/tailwind.preset.ts, client/src/index.css |
| 3a 白ベースのワークスペース（ホーム刷新） | HomePage.tsx, InboxPage.tsx, Sidebar.tsx, tokens.css |
| 4a 投入の3状態 / 4b スマホ版 | InboxPage.tsx, README.md（改革要件: 投入欄・期限・確認待ち） |
| 5a 行列の種別別展開 | InboxPage.tsx（KIND_LABELS / DOC_TYPE_LABELS / FD_STATUS_LABELS / 完了・延期・対応済み） |
| 6a コマンドパレット / 6b ゼロ状態 | Sidebar.tsx（APP_NAV の全メニュー）, statuses.ts |
| 26a 削る判定 / 27a-c 案件の入力 | client/src/contexts/sales/pages/ProjectFormPage.tsx（全入力項目）, ProjectGroupListPage.tsx（按分・グループ）, ActivityLogPage.tsx（活動記録の項目）, CompanyListPage / CustomerListPage（会社の項目）, docs/archive/2026/ia-v2.9-rail-era.md（統合済みのルート） |
| 25a〜25e 技術資料・計時LIVE・内覧会・入口 | client-techsheet/src/manual/content.tsx, client-live/src/manual/content.tsx, client-live/src/pages/*, client-daily（内覧会・セキュリティカード） |
| 24a〜24d リアルタイムCG | client-awards/src/manual/content.tsx（3レイヤー・OA/NEXT/TAKE/CLEAR・ステップ進行・Style・黒ベース濃さ・?bg=1/?audio=1/?lang・統合コックピット・FAQ）, client-awards/src/pages/{CgCockpitPage,ControlPage,OneShotControlPage,QuizStackControlPage,Output*}.tsx, client-awards/src/cg/steps/*, client-awards/src/components/SoundConfigSection.tsx |
| 19d〜19i スマホ最適化 | docs/archive/2026/ia-v2.9-rail-era.md（Phase 13 = 下タブ5つ / 案件フォームは CSS で隠す / FullCalendar buttonText / 音声は端末のもの）, docs/archive/2026/ia-v2.9-rail-era.md Phase 9（トースト削除・消えないお知らせ帯）, Phase 10（返却をその場で記録）, Phase 11（切断検知の実バグ・役割URL配布）, shared/src/client/shell/railItems.ts |
| 実装仕様書 docs/UI刷新_実装仕様書.md | 上記すべて＋package.json（v2.9.249）, docs/requirements/2026-07-25-collaboration-and-personal-agent.md（投入・9マス・依頼・AIループの実装状況） |
| 17a 機材の導線 / 17b 機材（日々） | client-equipment/src/components/layout/Sidebar.tsx（14メニュー）, client-equipment/src/manual/content.tsx（台帳・貸出・棚卸し・メンテ・ラック・Excel）, client-equipment/src/lib/constants.ts（種別コード・色・状態・コンディション） |
| 16a Qシート 編集 / 16b 本番 | client-qsheet/src/manual/content.tsx（全画面の項目・ボタン・FAQ）, client-qsheet/src/pages/{OnAirPage,RundownPage,AudioSupportPage,PrompterPage,EditorPage}.tsx（番組経過・残り・予定尺・実尺・押し/巻き・NEXT・キー操作）, client-qsheet/src/components/layout/Sidebar.tsx |
| 15a お金 3列レビュー | client/src/contexts/finance/pages/BudgetDashboardPage.tsx（売上/仕入(変動)/固定原価/販管費の4内訳・仮バッジ・申請㌧RL） |
| 13a 予定 / 14a お金 | client/src/contexts/production/pages/UnifiedCalendarPage.tsx（レイヤー・作成不可の制約）, client/src/contexts/production/components/schedule/scheduleShared（BOOKING_TYPE_COLORS）, client/src/contexts/finance/pages/BudgetDashboardPage.tsx（損益の式・KPI7枚・内訳）, README.md（精算PDF取込・決算インポート・二重計上） |
| 12a 道具の置き方（翻訳・インタラクティブ・CG） | shared/src/client/AppSwitcher.tsx（外部URL）, client/src/contexts/platform/AuthContext.tsx（translate / interactive 権限）, Sidebar.tsx |
| 11a お客様一覧 / 11b 顧客360 | client/src/contexts/sales/pages/CustomerListPage.tsx, client/src/contexts/sales/pages/CustomerDetailPage.tsx, statuses.ts |
| 10a 全体IAの棚卸し / 10b 新共通ナビ | client/src/components/layout/Sidebar.tsx, shared/src/client/AppSwitcher.tsx, client/src/contexts/platform/AuthContext.tsx（BLOCK_APPS）, client/src/contexts/shared/components/ProjectQuickLinks.tsx, client-daily/src/components/layout/Sidebar.tsx, client-equipment/src/components/layout/Sidebar.tsx, client-qsheet/src/components/layout/Sidebar.tsx, client-techsheet/src/components/layout/Sidebar.tsx, client-live/src/components/layout/Sidebar.tsx, client-awards/src/components/layout/Sidebar.tsx, client/src/contexts/tasks/pages/TaskDashboardPage.tsx |
| 9a 導線マップ / 9b 統合タスク画面 | client/src/contexts/tasks/pages/{TaskDashboardPage,ProjectTasksPage}.tsx, client/src/contexts/tasks/components/{ViewToggle,MyTasksSummarySection}.tsx, client/src/components/layout/Sidebar.tsx, README.md（改革要件: 重要度×緊急度 3×3・依頼・期限） |
| 8a 案件一覧（リスト）/ 8b ボード | client/src/contexts/sales/pages/ProjectListPage.tsx, client/src/contexts/sales/pages/PipelinePage.tsx, statuses.ts |
| 7a 案件ワークスペース | client/src/contexts/sales/pages/ProjectFormPage.tsx, client/src/contexts/shared/components/ProjectQuickLinks.tsx, statuses.ts, tokens.css |
| 29章 隔週キープをつくる（35a-c）| uploads/260722_橋口社長隔週キープv2.pdf（76ページの全構成）, uploads/GMO流会議フォーマット_Ver_2_5.pptx, docs/archive/2026/ia-v2.9-rail-era.md（v2.9.275 AIが編集中の案件に追記：Y.Textの末尾に足す） |
| 18章 みんなで書く（34a/34b）| docs/archive/2026/ia-v2.9-rail-era.md（v2.9.273 案件の同時編集：メモはY.Text・チェックはY.Array→Y.Map / v2.9.274 コメントと変更の記録：主要な項目だけ・金額は記録する）, docs/wording.md（コメントする・知らせる人・変更の記録・同時編集のエラー文） |
| 10章 返信の下書き（31a）/ 30章 実装で足した画面（32a-c） | docs/archive/2026/ia-v2.9-rail-era.md（v2.9.268 朝の1通のSlack / v2.9.269 原本を開く / v2.9.270 権限の変更履歴 / v2.9.271 ボードに出さない判断 / v2.9.272 問い合わせの返信の下書き）, package.json（v2.9.272） |
