window.ONAIR_VALS = (function () {
    const blueprint = [
    { part: "第 I 部", title: "考え方", file: "1 考え方.dc.html",
      role: "何を削り、何を残すかの基準。ここが決まらないと画面は増え続けます。",
      items: [
        { no: "1", label: "全体設計", sub: "13アプリ・60メニューを6つの場所へ" },
        { no: "2", label: "徹底的に削る", sub: "残す／統合する／自動にする／キャンセル の判定" },
        { no: "3", label: "共通ルール", sub: "空・読み込み中・エラー・権限なしの4状態" },
        { no: "4", label: "ことばの設計", sub: "画面の名前のつけ方と言い換え" },
        { no: "5", label: "AIの使いどころ", sub: "ふわっとした話を形にする／AIに決めさせないこと" },
        { no: "6", label: "部品と数字のサイズ", sub: "ボタン5種・バッジ2種・金額と日時の書き方" },
      ] },
    { part: "第 II 部", title: "毎日ひらく画面", file: "2 毎日ひらく画面.dc.html",
      role: "朝ここだけ見れば足りる状態にします。一覧より先に「お待たせ中」。",
      items: [
        { no: "7", label: "今日", sub: "お待たせ中とAIに任せる欄" },
        { no: "8", label: "投入から確定まで", sub: "任せる→読む→確定 の3状態" },
        { no: "9", label: "お待たせ中", sub: "期限超過・見積請求・問い合わせ" },
        { no: "10", label: "検索 と 片づいたとき", sub: "⌘K とゼロの状態" },
        { no: "11", label: "返信の下書き", sub: "AIが書いて人が送る／使い捨てにしない" },
      ] },
    { part: "第 III 部", title: "案件を進める", file: "3 案件.dc.html",
      role: "1件を追う場所。起票は3つだけ聞いて、あとは進んだ段で聞きます。",
      items: [
        { no: "12", label: "案件（一覧）", sub: "リストとボードは表示切替" },
        { no: "13", label: "案件（1件）", sub: "左で進める・右で事実を直す" },
        { no: "14", label: "案件の入力を減らす", sub: "22項目 → 起票3つ＋段階的に" },
        { no: "15", label: "案件の成果物", sub: "揃っていない資料が期日順に出る棚" },
        { no: "16", label: "タスク", sub: "5つの入口を1つに" },
        { no: "17", label: "お客様", sub: "取引の状態が見える一覧と顧客360" },
        { no: "18", label: "みんなで書く", sub: "メモ・チェック・コメント・変更の記録" },
      ] },
    { part: "第 IV 部", title: "現場", file: "4 現場.dc.html",
      role: "道具はすべて案件の下。本番中に画面を移動させません。お試しは別の場所で。",
      items: [
        { no: "19", label: "Qシート", sub: "編集と本番（役割切替）" },
        { no: "20", label: "リアルタイムCG", sub: "送出の1画面・出力URLの配り方" },
        { no: "21", label: "香盤表", sub: "当日の動きを1枚に" },
        { no: "22", label: "運営マニュアル", sub: "部品を組んで1冊にする" },
        { no: "23", label: "機材", sub: "オペレーション／機材台帳／設定" },
        { no: "24", label: "技術資料・計時LIVE・内覧会", sub: "残っていた画面" },
        { no: "25", label: "道具の置き場所とお試し", sub: "案件に紐づける／サンドボックス" },
      ] },
    { part: "第 V 部", title: "数字とふりかえり", file: "5 数字とふりかえり.dc.html",
      role: "月と週のリズムの仕事。日常の画面から切り離します。",
      items: [
        { no: "26", label: "予定とお金", sub: "カレンダー1本／損益フロー" },
        { no: "27", label: "財務レビュー", sub: "MTG用の3列表示" },
        { no: "28", label: "ふりかえり", sub: "週次・隔週キープ・月次損益" },
        { no: "29", label: "隔週キープをつくる", sub: "①②③を毎回・④以降は足す。作成を45分に" },
        { no: "30", label: "見積を作成", sub: "料金表とAIの下書き・粗利がその場で出る" },
        { no: "31", label: "請求と入金", sub: "締めにまとめて出す・入金の確認・月次請求" },
        { no: "32", label: "合同案件", sub: "1回のイベントを複数社で分けて各社に請求" },
      ] },
    { part: "第 VI 部", title: "土台", file: "6 土台.dc.html",
      role: "気づく・入る・任せる。全画面の下で働く仕組みです。",
      items: [
        { no: "33", label: "通知", sub: "ベルと朝の1通だけ" },
        { no: "34", label: "スマホ", sub: "片手で終わらせる" },
        { no: "35", label: "設定と権限", sub: "役割で当てる権限" },
        { no: "36", label: "実装で足した画面", sub: "朝の1通のSlack設定・原本の表示・権限の履歴" },
        { no: "37", label: "残りの小さな画面", sub: "検索結果・案件の書類（BOX）・カードの貸出" },
      ] },
    { part: "第 VII 部", title: "アプリ単位の導線", file: "7 アプリの導線.dc.html",
      role: "トップにアプリ、その下に秘書。アプリの中はそのアプリのメニュー。画面そのものは前の案をそのまま引き継ぎます。",
      items: [
        { no: "38", label: "トップページ", sub: "上にアプリ・下に「今日」の秘書ゾーン" },
        { no: "39", label: "アプリの中の導線", sub: "アプリ切替＋そのアプリのメニュー" },
        { no: "40", label: "タスクの置き場所", sub: "入口は3つ・実体は1つ" },
        { no: "41", label: "前の案から何を戻すか", sub: "戻す／引き継ぐ／キャンセル とURL" },
      ] },
  ];
    const toc = [
      { no: "1", id: "10a", label: "全体設計", sub: "13アプリ・60メニューの棚卸しと、6つの場所への統合" },
      { no: "2", id: "3a", label: "今日", sub: "待たせているものとAIに任せる欄。朝ここだけ見れば足りる" },
      { no: "3", id: "4a", label: "投入から確定まで", sub: "投げる→AIが読む→確定 の3状態／スマホ版" },
      { no: "4", id: "5a", label: "お待たせ中", sub: "期限超過・見積請求・問い合わせを開いた中身" },
      { no: "5", id: "6a", label: "探し方とゼロ", sub: "⌘K コマンドパレットと、ぜんぶ片づいたとき" },
      { no: "6", id: "8a", label: "案件（一覧）", sub: "リストとボードを同じ画面の切替に統合" },
      { no: "7", id: "7a", label: "案件（1件）", sub: "左で進める・右で事実を直すワークスペース" },
      { no: "8", id: "9a", label: "タスク", sub: "5つの入口を1つに。スコープ × 表示形式" },
      { no: "9", id: "11a", label: "お客様", sub: "取引状況が見える一覧と、顧客360" },
      { no: "10", id: "13a", label: "予定とお金", sub: "カレンダー1本／損益フローと取込の一本道" },
      { no: "11", id: "15a", label: "財務レビュー", sub: "売上・仕入・販管費を横並びで読むMTG用表示" },
      { no: "12", id: "16a", label: "Qシート", sub: "編集画面と、本番（役割切替＋QR配布）" },
      { no: "13", id: "12a", label: "現場ツール", sub: "翻訳・インタラクティブ・CG を案件の道具にする" },
      { no: "14", id: "17a", label: "機材", sub: "14メニューを「オペレーション」「機材台帳」「設定」に割る" },
      { no: "15", id: "18a", label: "通知", sub: "溜まるベルと、朝に1通だけのまとめ" },
      { no: "16", id: "19d", label: "スマホ", sub: "片手で終わらせる。今日・シート・現場・本番・検索" },
      { no: "17", id: "20a", label: "設定と権限", sub: "役割で当てる権限と、マスターの集約先" },
      { no: "18", id: "21a", label: "ふりかえり", sub: "週次・隔週キープ・月次損益・ニュースを1か所に" },
      { no: "19", id: "22a", label: "共通ルール", sub: "空・読み込み中・エラー・権限なしの4状態と文言" },
      { no: "20", id: "23a", label: "ことばの設計", sub: "画面の名前のつけ方と、言い換えた語の一覧" },
      { no: "21", id: "24a", label: "リアルタイムCG", sub: "送出の1画面・出力URLの配り方・リハーサル・スマホ" },
      { no: "22", id: "25a", label: "残っていた画面", sub: "技術資料・計時LIVE・内覧会・ログイン・小さな画面" },
    ];
    const stage = {
      neta: { label: "ネタ", bg: "#f3f4f6", fg: "#3c424c", bd: "#dbdee3" },
      hold: { label: "D 仮押さえ", bg: "#e0f2fe", fg: "#0369a1", bd: "#bae6fd" },
      proposal: { label: "C 見積提案", bg: "#005bac", fg: "#ffffff", bd: "#005bac" },
      verbal: { label: "B 口頭決定", bg: "#fef3c7", fg: "#92400e", bd: "#fde68a" },
      won: { label: "A 受注済", fg: "#ffffff", bg: "#197a4b", bd: "#197a4b" },
    };

    return {
      toc, blueprint,

      // ───── 料金表マスター（実装 121_pricing_v3.sql そのまま）─────
      // unit_price = 定価（グループ外）／ group_price = グループ内価格（null は設定なし）
      estUnitByCalc: { fixed: "式", hours: "時間", days_people: "人", days_qty: "台", qty: "点", toggle: "式", days: "日" },
      estPricing: [
        { id: "c1", name: "①基本料金", group: "スタジオ", items: [
          { id: "p101", name: "【平日】9~20時 11時間基本パッケージ", sub: "WORLD + SKY + LOUNGE", price: 700000, gPrice: 560000, calc: "fixed" },
          { id: "p102", name: "【平日】9~20時 11時間基本パッケージ", sub: "SKY + LOUNGE", price: 350000, gPrice: 280000, calc: "fixed" },
          { id: "p103", name: "【平日】9~20時 11時間基本パッケージ", sub: "LOUNGE", price: 210000, gPrice: 168000, calc: "fixed" },
          { id: "p104", name: "【平日】9~20時 6時間利用パッケージ", sub: "WORLD + SKY + LOUNGE", price: 480000, gPrice: 384000, calc: "fixed" },
          { id: "p105", name: "【平日】9~20時 6時間利用パッケージ", sub: "SKY + LOUNGE", price: 240000, gPrice: 192000, calc: "fixed" },
          { id: "p106", name: "【平日】9~20時 6時間利用パッケージ", sub: "LOUNGE", price: 150000, gPrice: 120000, calc: "fixed" },
          { id: "p107", name: "【平日】9~20時 4時間ミニマムパッケージ", sub: "WORLD + SKY + LOUNGE", price: 390000, gPrice: 312000, calc: "fixed" },
          { id: "p108", name: "【平日】9~20時 4時間ミニマムパッケージ", sub: "SKY + LOUNGE", price: 200000, gPrice: 160000, calc: "fixed" },
          { id: "p109", name: "【平日】9~20時 4時間ミニマムパッケージ", sub: "LOUNGE", price: 120000, gPrice: 96000, calc: "fixed" },
          { id: "p110", name: "【休日】9~20時 11時間基本パッケージ", sub: "WORLD + SKY + LOUNGE", price: 1000000, gPrice: 800000, calc: "fixed" },
          { id: "p111", name: "【休日】9~20時 11時間基本パッケージ", sub: "SKY + LOUNGE", price: 500000, gPrice: 400000, calc: "fixed" },
          { id: "p112", name: "【休日】9~20時 11時間基本パッケージ", sub: "LOUNGE", price: 300000, gPrice: 240000, calc: "fixed" },
          { id: "p113", name: "【休日】9~20時 6時間利用パッケージ", sub: "WORLD + SKY + LOUNGE", price: 690000, gPrice: 552000, calc: "fixed" },
          { id: "p114", name: "【休日】9~20時 6時間利用パッケージ", sub: "SKY + LOUNGE", price: 350000, gPrice: 280000, calc: "fixed" },
          { id: "p115", name: "【休日】9~20時 6時間利用パッケージ", sub: "LOUNGE", price: 210000, gPrice: 168000, calc: "fixed" },
          { id: "p116", name: "【休日】9~20時 4時間ミニマムパッケージ", sub: "WORLD + SKY + LOUNGE", price: 550000, gPrice: 440000, calc: "fixed" },
          { id: "p117", name: "【休日】9~20時 4時間ミニマムパッケージ", sub: "SKY + LOUNGE", price: 280000, gPrice: 224000, calc: "fixed" },
          { id: "p118", name: "【休日】9~20時 4時間ミニマムパッケージ", sub: "LOUNGE", price: 170000, gPrice: 136000, calc: "fixed" },
          { id: "p119", name: "施設管理費・清掃対応費", sub: "", price: 50000, gPrice: 50000, calc: "fixed" },
          { id: "p120", name: "【平日】20~翌9時 1時間あたり", sub: "WORLD + SKY + LOUNGE", price: 100000, gPrice: 100000, calc: "hours" },
          { id: "p121", name: "【平日】20~翌9時 1時間あたり", sub: "SKY + LOUNGE", price: 65000, gPrice: 65000, calc: "hours" },
          { id: "p122", name: "【平日】20~翌9時 1時間あたり", sub: "LOUNGE", price: 50000, gPrice: 50000, calc: "hours" },
          { id: "p123", name: "【休日】20~翌9時 1時間あたり", sub: "WORLD + SKY + LOUNGE", price: 150000, gPrice: 150000, calc: "hours" },
          { id: "p124", name: "【休日】20~翌9時 1時間あたり", sub: "SKY + LOUNGE", price: 95000, gPrice: 95000, calc: "hours" },
          { id: "p125", name: "【休日】20~翌9時 1時間あたり", sub: "LOUNGE", price: 75000, gPrice: 75000, calc: "hours" },
          { id: "p126", name: "時間外対応料金", sub: "23:00~翌7:00の稼働が発生する場合", price: 40000, gPrice: 40000, calc: "days_people" },
        ] },
        { id: "c2", name: "②控室・スペース利用料金", group: "スタジオ", items: [
          { id: "p201", name: "ROOM A", sub: "", price: 20000, gPrice: 0, calc: "fixed" },
          { id: "p202", name: "ROOM B", sub: "", price: 20000, gPrice: 0, calc: "fixed" },
          { id: "p203", name: "ROOM C", sub: "", price: 20000, gPrice: 0, calc: "fixed" },
          { id: "p204", name: "VIP LOUNGE", sub: "", price: 50000, gPrice: 0, calc: "fixed" },
          { id: "p205", name: "全部屋利用", sub: "ROOM A/B/C、VIP LOUNGE", price: 100000, gPrice: 0, calc: "fixed" },
          { id: "p206", name: "パントリー利用", sub: "", price: 100000, gPrice: 50000, calc: "fixed" },
        ] },
        { id: "c3", name: "③テクニカル（オペレーション関連）", group: "技術・人員", items: [
          { id: "p301", name: "テクニカルディレクター・テクニカルサポート", sub: "", price: 55000, gPrice: null, calc: "days_people" },
          { id: "p302", name: "ビデオエンジニア", sub: "", price: 55000, gPrice: 50000, calc: "days_people" },
          { id: "p303", name: "LED", sub: "", price: 60000, gPrice: null, calc: "days_people" },
          { id: "p304", name: "スイッチャー", sub: "", price: 60000, gPrice: 55000, calc: "days_people" },
          { id: "p305", name: "カメラ", sub: "", price: 55000, gPrice: 50000, calc: "days_people" },
          { id: "p306", name: "カメラアシスタント", sub: "", price: 45000, gPrice: 35000, calc: "days_people" },
          { id: "p307", name: "音声ミキサー", sub: "", price: 55000, gPrice: 50000, calc: "days_people" },
          { id: "p308", name: "PAミキサー", sub: "", price: 55000, gPrice: 50000, calc: "days_people" },
          { id: "p309", name: "オーディオアシスタント", sub: "", price: 45000, gPrice: 40000, calc: "days_people" },
          { id: "p310", name: "ライティングディレクター", sub: "", price: 55000, gPrice: null, calc: "days_people" },
          { id: "p311", name: "ライティングオペレーター", sub: "", price: 55000, gPrice: 50000, calc: "days_people" },
          { id: "p312", name: "配信管理", sub: "", price: 55000, gPrice: 50000, calc: "days_people" },
        ] },
        { id: "c4", name: "④テクニカル（機材関連）", group: "技術・人員", items: [
          { id: "p401", name: "クレーンカメラ", sub: "最大1式", price: 150000, gPrice: 120000, calc: "fixed" },
          { id: "p402", name: "スタジオカメラ", sub: "最大2式", price: 100000, gPrice: 80000, calc: "fixed" },
          { id: "p403", name: "ワイヤレスジンバルカメラ", sub: "最大1式", price: 20000, gPrice: 16000, calc: "fixed" },
          { id: "p404", name: "PTZカメラ", sub: "常設6台で1式(セット)", price: 60000, gPrice: 48000, calc: "fixed" },
          { id: "p405", name: "PTZカメラ", sub: "最大3式", price: 20000, gPrice: 16000, calc: "fixed" },
          { id: "p406", name: "第1調整室利用費（映像・音声）", sub: "一式に含まれる機材は別途リスト化", price: 300000, gPrice: 240000, calc: "fixed" },
          { id: "p407", name: "第2調整室利用費（LED）", sub: "一式に含まれる機材は別途リスト化", price: 500000, gPrice: 400000, calc: "fixed" },
          { id: "p408", name: "照明機材一式", sub: "一式に含まれる機材は別途リスト化", price: 200000, gPrice: 160000, calc: "fixed" },
          { id: "p409", name: "スタジオ機材フルセット", sub: "#1~#8までをすべて利用可", price: 1200000, gPrice: 960000, calc: "fixed" },
        ] },
        { id: "c5", name: "⑤テクニカル（素材関連）", group: "技術・人員", items: [
          { id: "p501", name: "入稿チェック", sub: "", price: 1500, gPrice: 1200, calc: "qty" },
          { id: "p502", name: "動画エンコード", sub: "~10分未満", price: 300, gPrice: 240, calc: "qty" },
          { id: "p503", name: "動画エンコード", sub: "10分以上、30分未満", price: 180, gPrice: 144, calc: "qty" },
          { id: "p504", name: "動画エンコード", sub: "30分以上、60分未満", price: 150, gPrice: 120, calc: "qty" },
          { id: "p505", name: "動画エンコード", sub: "60分以上、90分未満", price: 120, gPrice: 96, calc: "qty" },
          { id: "p506", name: "動画エンコード", sub: "90分以上、120分未満", price: 90, gPrice: 72, calc: "qty" },
          { id: "p507", name: "動画エンコード", sub: "120分以上、180分未満", price: 60, gPrice: 48, calc: "qty" },
          { id: "p508", name: "動画エンコード", sub: "180分以上", price: 21000, gPrice: 16800, calc: "qty" },
          { id: "p509", name: "表示調整費", sub: "LED表示調整（フォーマット不適合修正）", price: 1000, gPrice: 800, calc: "qty" },
          { id: "p510", name: "動画エンコード", sub: "LED壁床・壁面・床面の全体サイズなど画角調整が要るもの", price: 2000, gPrice: 1600, calc: "qty" },
          { id: "p511", name: "表示調整費", sub: "LED全体表示に対するフォーマット不適合の修正", price: 3000, gPrice: 2400, calc: "qty" },
        ] },
        { id: "c6", name: "⑥制作（対応関連）", group: "制作・その他", items: [
          { id: "p601", name: "打ち合わせ", sub: "1h/回", price: 40000, gPrice: 20000, calc: "qty" },
          { id: "p602", name: "台本制作", sub: "1ページ", price: 10000, gPrice: 10000, calc: "qty" },
          { id: "p603", name: "制作スタッフ稼働", sub: "", price: 50000, gPrice: 50000, calc: "hours" },
          { id: "p604", name: "当日進行スタッフ", sub: "", price: 70000, gPrice: 70000, calc: "days_people" },
        ] },
        { id: "c7", name: "⑦追加オプション", group: "制作・その他", items: [
          { id: "p701", name: "特殊映像演出(AR/XR)", sub: "※内容によって変動", price: 300000, gPrice: 300000, calc: "fixed" },
          { id: "p702", name: "インタラクティブ演出(投票/スタンプ)", sub: "※内容によって変動", price: 200000, gPrice: 200000, calc: "fixed" },
          { id: "p703", name: "多言語配信", sub: "※内容によって変動", price: 150000, gPrice: 150000, calc: "fixed" },
          { id: "p704", name: "IP中継利用", sub: "※内容によって変動", price: 300000, gPrice: 300000, calc: "fixed" },
          { id: "p705", name: "Zoom中継", sub: "※内容によって変動", price: 100000, gPrice: 100000, calc: "fixed" },
          { id: "p706", name: "テロップシステム利用", sub: "※内容によって変動", price: 80000, gPrice: 80000, calc: "fixed" },
          { id: "p707", name: "PCレンタル利用", sub: "※内容によって変動", price: 15000, gPrice: 15000, calc: "days_qty" },
          { id: "p708", name: "提携ケータリング", sub: "ご予算に応じてご提案します", price: 0, gPrice: 0, calc: "fixed" },
          { id: "p709", name: "物販利用", sub: "売上金額の15%を手数料として申し受けます", price: 0, gPrice: 0, calc: "fixed" },
          { id: "p710", name: "保管料", sub: "1箱/1日 1,000円", price: 1000, gPrice: 1000, calc: "qty" },
        ] },
      ],

      // 60周年 記念式典（見積 v2・作成中）の初期明細。cost = 仕入(見込み)
      // qty ×  days で金額を出す。本番1日＋リハ1日 = 2日 のように日数が効く行がある
      estInitRows: [
        { pid: "p101", qty: 1, days: 1, cost: 0 },
        { pid: "p119", qty: 1, days: 1, cost: 0 },
        { pid: "p201", qty: 2, days: 1, cost: 0 },
        { pid: "p406", qty: 1, days: 1, cost: 0 },
        { pid: "p402", qty: 1, days: 1, cost: 0 },
        { pid: "p301", qty: 2, days: 2, cost: 0 },
        { pid: "p304", qty: 1, days: 2, cost: 40000 },
        { pid: "p305", qty: 3, days: 1, cost: 35000 },
        { pid: "p306", qty: 2, days: 1, cost: 28000 },
        { pid: "p307", qty: 1, days: 2, cost: 38000 },
        { pid: "p312", qty: 1, days: 1, cost: 0 },
        { pid: "p601", qty: 3, days: 1, cost: 0 },
        { pid: "p604", qty: 2, days: 1, cost: 45000, ai: true },
        { pid: "p703", qty: 1, days: 1, cost: 90000, ai: true },
      ],

      estVersions: [
        { v: "v2", state: "作成中", when: "8/03 いま編集中", who: "寺井", now: true },
        { v: "v1", state: "送付済み", when: "7/24 18:02 メールで送付", who: "寺井", now: false },
      ],

      // ───────── 第 VII 部 アプリ単位の導線 ─────────
      navApps: [
        { icon: "folder-kanban", label: "案件管理", route: "/projects", desc: "案件・お客様・見積・タスク", iconBg: "#eaf4fb", iconFg: "#005bac", badge: "6", badgeBg: "#c7243a" },
        { icon: "list-checks", label: "プロジェクト管理", route: "/pm-projects", desc: "グループ内案件・自社構築の進行管理", iconBg: "#eef2ff", iconFg: "#4338ca", badge: "5", badgeBg: "#005bac" },
        { icon: "piggy-bank", label: "財務管理", route: "/finance", desc: "売上・仕入・請求・損益", iconBg: "#e7f6ee", iconFg: "#197a4b", badge: "2", badgeBg: "#005bac" },
        { icon: "calendar-days", label: "カレンダー", route: "/schedule", desc: "スタジオ・パートナー・自分の予定", iconBg: "#f5f3ff", iconFg: "#6d28d9", badge: "3", badgeBg: "#005bac" },
        { icon: "clipboard-list", label: "日常業務", route: "/daily", desc: "週報・ニュース・内覧会・届いた書類", iconBg: "#effcf7", iconFg: "#0f766e", badge: "4", badgeBg: "#005bac" },
        { icon: "package", label: "機材管理", route: "/equipment", desc: "貸出・棚卸し・台帳", iconBg: "#fff7ed", iconFg: "#c2410e", badge: "1", badgeBg: "#c7243a" },
        { icon: "file-text", label: "制作資料", route: "/qsheet", desc: "Qシート・香盤・制作資料", iconBg: "#fff1f2", iconFg: "#e11d48", badge: "", badgeBg: "" },
        { icon: "book-open", label: "技術資料", route: "/techsheet", desc: "カメラ・映像・音声の仕様書", iconBg: "#ecfeff", iconFg: "#0e7490", badge: "", badgeBg: "" },
        { icon: "settings", label: "設定", route: "/settings", desc: "人と権限・通知・マスター", iconBg: "#f2f4f7", iconFg: "#5d6470", badge: "", badgeBg: "" },
      ],

      navEventApps: [
        { icon: "timer", label: "計時LIVE", route: "/live", desc: "カウントダウンと視聴者カウンター", iconBg: "#fef6f7", iconFg: "#c7243a", ext: "" },
        { icon: "tv", label: "リアルタイムCG", route: "/awards", desc: "テロップ・ランキングの送出", iconBg: "#fefce8", iconFg: "#a16207", ext: "" },
        { icon: "languages", label: "翻訳", route: "gmo-translate.jp", desc: "多言語の字幕・通訳", iconBg: "#f0fdf4", iconFg: "#16a34a", ext: "別サイト" },
        { icon: "sparkles", label: "インタラクティブ演出", route: "interactive.gmo-onair.jp", desc: "来場者参加型の演出", iconBg: "#fdf2f8", iconFg: "#be185d", ext: "別サイト" },
      ],

      navAppsExt: [
        { icon: "languages", label: "翻訳", route: "gmo-translate.jp", iconBg: "#f0fdf4", iconFg: "#16a34a" },
        { icon: "sparkles", label: "インタラクティブ演出", route: "interactive.gmo-onair.jp", iconBg: "#fdf2f8", iconFg: "#be185d" },
      ],

      navMyChips: [
        { label: "今日が期限", n: "3", bg: "#eaf4fb", fg: "#005bac", bd: "#cfe4f4" },
        { label: "期限を過ぎた", n: "2", bg: "#fef6f7", fg: "#b91c1c", bd: "#f6cdd2" },
        { label: "依頼の返事", n: "1", bg: "#fffbeb", fg: "#92400e", bd: "#fde68a" },
      ],

      navMyRows: [
        { title: "見積を送る — 60周年 記念式典", meta: "今日 18:00 ・ 案件から自動で立ちました", tag: "見積", tagBg: "#eaf4fb", tagFg: "#005bac" },
        { title: "申込書をもらう — 株主総会 ライブ配信", meta: "期限 7/29（2日過ぎています）", tag: "期限超過", tagBg: "#fef6f7", tagFg: "#b91c1c" },
        { title: "照明の見積を取ってほしい — 佐々木さんから", meta: "受ける / 相談する / 辞退する を返します", tag: "依頼", tagBg: "#fffbeb", tagFg: "#92400e" },
        { title: "内覧会の受付を割り振る", meta: "今日 15:00 ・ 自分で作りました", tag: "自分", tagBg: "#f3f4f6", tagFg: "#5d6470" },
      ],

      navWaitRows: [
        { title: "ミナトデジタル 宮田様 — 見積の送付", meta: "やり取りの記録の次のアクション ・ 3日待たせています", fg: "#b91c1c", cta: "下書きをひらく" },
        { title: "サンリバー音響 — 請求書の承認", meta: "AIが読み取り済み ・ ¥380,000 ・ 原本あり", fg: "#3c424c", cta: "原本を見る" },
        { title: "アオゾラ物流 井上様 — 問い合わせの返信", meta: "受信から2日 ・ AIの下書きあり", fg: "#3c424c", cta: "返信を書く" },
      ],

      navSiteRows: [
        { time: "09:30", end: "12:00", label: "用賀 STUDIO A ／ 記念式典 リハーサル", app: "カレンダー", kind: "現場", fg: "#005bac", bg: "#eaf4fb", now: "" },
        { time: "12:30", end: "13:00", label: "昼休み（予定を入れないでください）", app: "自分の予定", kind: "自分", fg: "#5d6470", bg: "#f2f4f7", now: "" },
        { time: "13:00", end: "15:30", label: "Qシート「株主総会 2026」本番", app: "制作資料", kind: "現場", fg: "#005bac", bg: "#eaf4fb", now: "いま" },
        { time: "16:00", end: "16:30", label: "ミナトデジタル 宮田様 とオンライン打合せ", app: "カレンダー", kind: "商談", fg: "#197a4b", bg: "#e7f6ee", now: "" },
        { time: "17:00", end: "17:30", label: "返却予定の機材 3点", app: "機材管理", kind: "締切", fg: "#b91c1c", bg: "#fef6f7", now: "" },
        { time: "19:00", end: "", label: "歯医者（非公開）", app: "自分の予定", kind: "自分", fg: "#5d6470", bg: "#f2f4f7", now: "" },
      ],

      navAiRows: [
        { label: "問い合わせの返信の下書き", n: "2" },
        { label: "AIが起票したネタ案件", n: "1" },
        { label: "案件メモへの追記", n: "3" },
      ],

      navHomeRules: [
        { topic: "上に置くもの", decision: "アプリだけ", why: "どのアプリに何があるかは全員が覚えている。分類を作らず、アプリ名のまま並べます。" },
        { topic: "下に置くもの", decision: "自分の仕事だけ", why: "一覧はアプリの中にあります。トップの下半分は「自分が今日片づけるもの」に限ります。" },
        { topic: "タイルの件数", decision: "ベルと同じ数字", why: "数え直しません。押せば片づく場所にだけ数を出します（0件は出しません）。" },
        { topic: "権限が無いアプリ", decision: "並べない", why: "押して403にしません。見えない理由は設定の「この人にできること」で説明します。" },
        { topic: "準備中のアプリ", decision: "置かない", why: "制作支援・素材納品は押せないのに場所を取っていました。できたら足します。" },
        { topic: "外部のサイト", decision: "下段に分けて ↗ を付ける", why: "翻訳・インタラクティブは別のサイト。同じ並びに混ぜると戻り方が分からなくなります。" },
      ],

      navMockSidebar: [
        { group: "業務", label: "案件一覧", icon: "folder-kanban", active: true },
        { group: "", label: "お客様", icon: "building-2", active: false },
        { group: "", label: "やり取りの記録", icon: "message-square", active: false },
        { group: "", label: "タスク", icon: "list-checks", active: false },
        { group: "当日の準備", label: "案件の成果物", icon: "folder-check", active: false },
        { group: "", label: "使った道具の記録", icon: "boxes", active: false },
        { group: "ふりかえる", label: "ふりかえり", icon: "line-chart", active: false },
        { group: "", label: "全社ダッシュボード", icon: "layout-dashboard", active: false },
        { group: "", label: "AIがやったこと", icon: "sparkles", active: false },
        { group: "マスター", label: "料金表", icon: "tags", active: false },
        { group: "", label: "請求先", icon: "building-2", active: false },
        { group: "", label: "お試し（練習）", icon: "flask-conical", active: false },
      ],

      navMockRows: [
        { name: "60周年 記念式典 配信・収録", cust: "株式会社ミナトデジタル", stage: "C 見積提案", bg: "#005bac", fg: "#ffffff", when: "10/17" },
        { name: "株主総会 ライブ配信", cust: "ジャパンネット株式会社", stage: "A 受注済", bg: "#197a4b", fg: "#ffffff", when: "09/26" },
        { name: "秋のブランド発表会", cust: "株式会社アオゾラ物流", stage: "B 口頭決定", bg: "#fef3c7", fg: "#92400e", when: "10/03" },
        { name: "社内表彰式 収録", cust: "サンリバーホールディングス", stage: "D 仮押さえ", bg: "#e0f2fe", fg: "#0369a1", when: "11/12" },
      ],

      navMenus: [
        { app: "案件管理", route: "/projects", icon: "folder-kanban", iconBg: "#eaf4fb", iconFg: "#005bac",
          groups: [
            { title: "業務", items: [
              { label: "ダッシュボード", tag: "" },
              { label: "案件一覧", tag: "" },
            ] },
            { title: "全案件", items: [
              { label: "タスク一覧", tag: "12" },
              { label: "見積・請求", tag: "8" },
            ] },
            { title: "設定", items: [
              { label: "標準工程テンプレート", tag: "設定" },
              { label: "料金表", tag: "設定" },
            ] },
          ] },
        { app: "財務管理", route: "/finance", icon: "wallet", iconBg: "#e7f6ee", iconFg: "#197a4b",
          groups: [
            { title: "見る", items: [
              { label: "ダッシュボード（KPI・内訳3列）", tag: "" },
              { label: "請求・入金管理", tag: "12" },
            ] },
            { title: "明細", items: [
              { label: "売上", tag: "38" },
              { label: "仕入", tag: "64" },
              { label: "販管費", tag: "22" },
            ] },
            { title: "取り込み", items: [
              { label: "取り込み（精算・決算）", tag: "9" },
            ] },
            { title: "設定", items: [
              { label: "取引先（仕入先・請求先・パートナー）", tag: "" },
            ] },
          ] },
        { app: "カレンダー", route: "/schedule", icon: "calendar-days", iconBg: "#fff7ed", iconFg: "#c2410e",
          groups: [
            { title: "見る", items: [
              { label: "予定（スタジオ・パートナー・自分を出し入れ）", tag: "" },
              { label: "部屋の空き（部屋 × 時間）", tag: "" },
              { label: "仮押さえ（本予約への切替）", tag: "7" },
            ] },
            { title: "設定", items: [
              { label: "部屋 ／ 外部カレンダー ／ サイネージ", tag: "設定" },
            ] },
          ] },
// GMO ONAiR 刷新案 — 画面に出すデータ（全ファイル共通）
        { app: "制作資料", route: "/qsheet", icon: "file-text", iconBg: "#fff1f2", iconFg: "#e11d48",
          groups: [
            { title: "台本・制作資料", items: [
              { label: "Qシート（台本）の一覧", tag: "" },
              { label: "新しくつくる", tag: "" },
              { label: "香盤表（当日の動き・時間 × レーン）", tag: "" },
              { label: "制作資料（絵コンテ・図面ほか）", tag: "拡張予定" },
            ] },
            { title: "編集中の台本", items: [
              { label: "出す列", tag: "" },
              { label: "マイク香盤", tag: "" },
              { label: "立ち位置図", tag: "" },
              { label: "稿を上げる・履歴30手", tag: "" },
            ] },
            { title: "本番", items: [
              { label: "本番をはじめる（役割切替）", tag: "" },
              { label: "配布URLとQR（4役割）", tag: "" },
            ] },
          ] },
        { app: "機材管理", route: "/equipment", icon: "package", iconBg: "#f2f4f7", iconFg: "#5d6470",
          groups: [
            { title: "現場", items: [
              { label: "ダッシュボード", tag: "" },
              { label: "機材台帳（機材・貸出機材・ケーブル・コネクタ）", tag: "2,140" },
              { label: "ラック図", tag: "12" },
              { label: "メンテナンス", tag: "4" },
              { label: "棚卸し", tag: "1" },
              { label: "QRスキャン", tag: "" },
            ] },
            { title: "貸出", items: [
              { label: "貸出・返却", tag: "14" },
              { label: "貸出対象機材", tag: "128" },
            ] },
            { title: "設定", items: [
              { label: "保管場所 ／ メーカー・色 ／ 貸出カテゴリ ／ 貸出の決めごと", tag: "設定" },
            ] },
          ] },
        { app: "技術資料", route: "/techsheet", icon: "book-open", iconBg: "#ecfeff", iconFg: "#0e7490",
          groups: [
            { title: "資料", items: [
              { label: "資料の一覧", tag: "" },
              { label: "新しくつくる", tag: "" },
            ] },
            { title: "編集中の資料", items: [
              { label: "基本・スタッフ", tag: "" },
              { label: "カメラ", tag: "" },
              { label: "映像・音声", tag: "" },
              { label: "通信", tag: "" },
            ] },
            { title: "出す", items: [
              { label: "印刷（PDF）", tag: "" },
            ] },
          ] },
        { app: "計時LIVE", route: "/live", icon: "timer", iconBg: "#fef6f7", iconFg: "#c7243a",
          groups: [
            { title: "セッション", items: [
              { label: "セッションの一覧", tag: "" },
              { label: "番組をつくる", tag: "" },
            ] },
            { title: "番組の中", items: [
              { label: "タイマー", tag: "" },
              { label: "視聴者カウンター", tag: "" },
              { label: "表示機のURL", tag: "" },
              { label: "番組の設定", tag: "" },
            ] },
          ] },
        { app: "リアルタイムCG", route: "/awards", icon: "tv", iconBg: "#fefce8", iconFg: "#a16207",
          groups: [
            { title: "イベント", items: [
              { label: "イベントの一覧", tag: "" },
              { label: "演出の編集", tag: "" },
              { label: "クイズ・アンケート", tag: "" },
            ] },
            { title: "準備", items: [
              { label: "データを入れる", tag: "" },
              { label: "出力URLの配り方", tag: "" },
              { label: "リハーサル", tag: "" },
            ] },
            { title: "本番", items: [
              { label: "送出（本番中に見る1画面）", tag: "" },
            ] },
          ] },
        { app: "日常業務", route: "/daily", icon: "clipboard-list", iconBg: "#effcf7", iconFg: "#0f766e",
          groups: [
            { title: "出す", items: [
              { label: "ウィークリー活動報告", tag: "" },
              { label: "デイリーニュース報告", tag: "" },
            ] },
            { title: "受ける", items: [
              { label: "届いた見積・請求書", tag: "" },
              { label: "その他の問い合わせ", tag: "" },
              { label: "内覧会 来場予約", tag: "" },
              { label: "セキュリティカード", tag: "" },
            ] },
          ] },
        { app: "設定", route: "/settings", icon: "settings", iconBg: "#f2f4f7", iconFg: "#5d6470",
          groups: [
            { title: "人", items: [
              { label: "人と権限（役割テンプレート）", tag: "管理者" },
              { label: "通知の受け取り方", tag: "" },
              { label: "朝の1通（Slack）の配信設定", tag: "管理者" },
            ] },
            { title: "全体", items: [
              { label: "システム設定", tag: "管理者" },
              { label: "データビューア ／ DBバックアップ", tag: "管理者" },
            ] },
          ] },
      ],

      navTaskEntries: [
        { where: "トップページ ＞ 今日", icon: "user-check", who: "自分の分だけ",
          what: "今日が期限・期限を過ぎた・依頼の返事。スコア順と9マスを切り替えられます。",
          opens: "「全部ひらく」でタスク画面（自分）へ" },
        { where: "案件管理 ＞ タスク", icon: "list-checks", who: "案件をまたいで全部",
          what: "かんばん／リスト／ガント。チームの負荷もここで見ます。",
          opens: "案件で絞ると1案件だけになります" },
        { where: "案件 ＞ タスク", icon: "folder-kanban", who: "その案件だけ",
          what: "案件を開いた文脈のまま足せます。担当と期限は案件から入ります。",
          opens: "同じ画面（案件で絞った状態）" },
      ],

      navTaskRules: [
        { head: "実体は1つ", body: "入口を3つにしても、期限の計算と完了の記録は1か所（project_tasks）のまま。「どちらが正か分からない」は作りません。" },
        { head: "画面も1つ", body: "スコープ×表示形式の切替は v3.1 で作ったものをそのまま使います。増やすのは入口だけで、画面は増やしません。" },
        { head: "個人のタスクは案件のボードに出さない", body: "案件の進みを見る場所に個人のToDoが混ざると、ボードが「案件がどこまで進んだか」を表さなくなります（前の判断を維持）。" },
        { head: "依頼はトップに常設", body: "人に頼んだもの・頼まれたものは秘書ゾーンに出します。返すのは 受ける／相談する／辞退する の3つだけ。" },
        { head: "AIに投げた文の行き先は3つ", body: "タスク・案件・予約のどれかになります。AIは下書きまでで、押すまで登録しません。" },
      ],

      navVerdicts: [
        { what: "左のレール7項目", verdict: "キャンセル", bg: "#f3f4f6", fg: "#5d6470",
          to: "トップのアプリ ＋ アプリの中のメニュー",
          why: "モノで7つに分けた並びが、アプリで覚えている全員の記憶と合っていませんでした。" },
        { what: "「今日」の画面", verdict: "引き継ぐ", bg: "#e7f6ee", fg: "#197a4b",
          to: "トップページの下半分（秘書ゾーン）",
          why: "中身は評判が良かったので、置き場所だけ変えます。画面は作り直しません。" },
        { what: "アプリのメニュー（二次ナビ）", verdict: "戻す", bg: "#eaf4fb", fg: "#005bac",
          to: "全アプリに置く（1項目のアプリも並べる）",
          why: "消したことで「そのアプリで何ができるか」を見る場所が無くなりました。" },
        { what: "全体マップ /map", verdict: "キャンセル", bg: "#f3f4f6", fg: "#5d6470",
          to: "トップページが地図の役をする",
          why: "トップにアプリが並ぶので、全体を見る画面を別に持つ理由がなくなります。" },
        { what: "⌘K（検索）", verdict: "残す", bg: "#eaf4fb", fg: "#005bac",
          to: "上辺の中央。打てる人には最短のまま",
          why: "キャンセル理由がありません。ただし「ここにしか全体が無い」状態はやめます。" },
        { what: "区分8つ（仕事の順番）", verdict: "裏に回す", bg: "#fffbeb", fg: "#92400e",
          to: "現在地の表示と⌘Kの並びだけに使う",
          why: "利用者が選ぶ分類はアプリ名に1本化します。行き先の表は1ファイルのまま。" },
        { what: "現場ツールを案件の道具に降格", verdict: "キャンセル", bg: "#f3f4f6", fg: "#5d6470",
          to: "アプリとして独立させ直す",
          why: "単発で開く仕事が実際にあります。案件から開く道は残すので、両方から入れます。" },
        { what: "案件のタブ（Qシート・香盤表ほか）", verdict: "残す", bg: "#eaf4fb", fg: "#005bac",
          to: "案件から開くと案件・日程・言語が入った状態",
          why: "行きも帰りも作ってあるので、アプリからの道と両立します。" },
        { what: "ベル・朝の1通・トーストなし", verdict: "残す", bg: "#eaf4fb", fg: "#005bac",
          to: "通知の入口は2つのまま",
          why: "消えない帯とベルは効いています。増やしません。" },
        { what: "レールのバッジ（件数）", verdict: "引き継ぐ", bg: "#e7f6ee", fg: "#197a4b",
          to: "アプリのタイルの件数に置き換える",
          why: "気づく仕掛けは効いています。数える元データはベルの1本のまま（同じ数字を2か所で数えません）。" },
        { what: "スマホの下タブ5つ", verdict: "直す", bg: "#fffbeb", fg: "#92400e",
          to: "ホーム ／ 自分のやること ／ 検索 の3つ",
          why: "アプリの中のメニューはハンバーガー。下タブでアプリを表現しません。" },
      ],

      navUrls: [
        { url: "/", what: "トップページ（アプリ ＋ 今日）", note: "新" },
        { url: "/today", what: "トップページへ転送", note: "ブックマークを壊さない" },
        { url: "/map", what: "トップページへ転送", note: "役目が重なるため" },
        { url: "/projects ・ /tasks ・ /customers", what: "変えない", note: "アプリのメニューから開く" },
        { url: "/schedule ・ /finance ・ /settings", what: "変えない", note: "同上" },
        { url: "/qsheet ・ /techsheet ・ /equipment", what: "変えない", note: "アプリのトップ" },
        { url: "/live ・ /awards ・ /daily", what: "変えない", note: "アプリのトップ" },
        { url: "旧URL 36本", what: "残す", note: "Slack・メール・ブックマークに残っている" },
      ],

      navImplFiles: [
        { file: "shell/railItems.ts", change: "アプリの表（appItems.ts）に置き換える。権限フィルタはそのまま使えます。" },
        { file: "shell/AppShell.tsx", change: "Rail を外し、アプリのメニューを既定の左列にする。上辺にアプリ切替を足します。" },
        { file: "platform/pages/TodayPage.tsx", change: "トップページの下半分として置き直す（中身は変えない）。上にアプリの一覧を足します。" },
        { file: "platform/pages/SiteMapPage.tsx", change: "削除。/map はトップへ転送します。" },
        { file: "commandPalette/commands.ts", change: "行き先の表は1ファイルのまま。並びの見出しだけアプリ名に読み替えます。" },
        { file: "client/src/App.tsx", change: "/ をトップページに。旧URLの転送表は触りません。" },
      ],

      // ───── v4 案件管理 ダッシュボード ─────
      pmKpis: [
        { label: "進行中の案件", n: "24", unit: "件", sub: "うち 自分のタスクがある 9件", fg: "#1a1d24", icon: "folder-kanban", iconBg: "#eaf4fb", iconFg: "#005bac" },
        { label: "今週の実施", n: "5", unit: "件", sub: "本番3件・リハ2件", fg: "#1a1d24", icon: "calendar-check", iconBg: "#f5f3ff", iconFg: "#6d28d9" },
        { label: "見積の返事待ち", n: "7", unit: "件", sub: "合計 ¥8,240,000", fg: "#1a1d24", icon: "receipt", iconBg: "#e7f6ee", iconFg: "#197a4b" },
        { label: "今月の受注", n: "12,480", unit: "千円", sub: "目標に対して 92%", fg: "#1a1d24", icon: "trending-up", iconBg: "#effcf7", iconFg: "#0f766e" },
        { label: "止まっている案件", n: "3", unit: "件", sub: "7日以上動いていません", fg: "#c7243a", icon: "alert-triangle", iconBg: "#fef6f7", iconFg: "#c7243a" },
      ],

      pmStages: [
        { stage: "A 受注済", n: "9", amount: "21,400", unit: "千", w: "100%", bg: "#197a4b" },
        { stage: "B 口頭決定", n: "5", amount: "9,800", unit: "千", w: "62%", bg: "#005bac" },
        { stage: "C 見積提案", n: "6", amount: "8,240", unit: "千", w: "70%", bg: "#4a9fd8" },
        { stage: "D 仮押さえ", n: "3", amount: "4,100", unit: "千", w: "38%", bg: "#a6ceeb" },
        { stage: "E 問合せ", n: "1", amount: "—", w: "14%", bg: "#cbd2da" },
      ],

      pmStuck: [
        { name: "周年パーティ 配信", cust: "ケイアイフーズ", days: "12", why: "見積を送ったまま連絡がありません", cta: "追いかける" },
        { name: "新商品発表会", cust: "ヒカリ食品", days: "9", why: "仮押さえの期限が近づいています", cta: "確認する" },
        { name: "社内研修 収録（全回）", cust: "サンリバー音響", days: "8", why: "日程が未定のままです", cta: "日程を決める" },
      ],

      pmWeek: [
        { day: "月 8/03", items: [{ label: "記念式典 リハーサル", place: "用賀 STUDIO A", fg: "#005bac" }] },
        { day: "火 8/04", items: [] },
        { day: "水 8/05", items: [{ label: "株主総会 ライブ配信", place: "先方会場", fg: "#c7243a" }, { label: "機材搬入", place: "前日入り", fg: "#5d6470" }] },
        { day: "木 8/06", items: [{ label: "ブランド発表会 下見", place: "港区", fg: "#5d6470" }] },
        { day: "金 8/07", items: [{ label: "表彰式 収録", place: "用賀 STUDIO B", fg: "#005bac" }] },
      ],

      pmFeed: [
        { who: "佐々木 遙", initial: "佐", bg: "#f5f3ff", fg: "#6d28d9", when: "12分前", what: "「60周年 記念式典」のステージを C → B にしました" },
        { who: "AI", initial: "AI", bg: "#ede9fe", fg: "#6d28d9", when: "48分前", what: "メールから「アオゾラ物流 問い合わせ」をネタ案件として下書きしました" },
        { who: "大森 亮", initial: "大", bg: "#fff7ed", fg: "#c2410e", when: "2時間前", what: "「株主総会」に技術資料（カメラ4台）を上げました" },
        { who: "寺井 赳博", initial: "寺", bg: "#eaf4fb", fg: "#005bac", when: "昨日", what: "「ミナトデジタル」に見積 ¥1,380,000 を送付しました" },
      ],

      pmMine: [
        { name: "60周年 記念式典 配信・収録", cust: "ミナトデジタル", stage: "B 口頭決定", bg: "#eaf4fb", fg: "#005bac", when: "10/17", task: "見積を送る", taskFg: "#c7243a" },
        { name: "株主総会 ライブ配信", cust: "ジャパンネット", stage: "A 受注済", bg: "#e7f6ee", fg: "#197a4b", when: "09/26", task: "申込書をもらう", taskFg: "#c7243a" },
        { name: "秋のブランド発表会", cust: "アオゾラ物流", stage: "C 見積提案", bg: "#eaf4fb", fg: "#005bac", when: "10/03", task: "香盤表をつくる", taskFg: "#5d6470" },
        { name: "社内表彰式 収録", cust: "サンリバーホールディングス", stage: "D 仮押さえ", bg: "#f2f4f7", fg: "#5d6470", when: "11/12", task: "会場を確かめる", taskFg: "#5d6470" },
      ],

      // ───── v4 案件管理 機能の因数分解 ─────
      pmFaObjects: [
        { name: "案件", role: "中心。ほかは全部これにぶら下がります", count: "24 件", icon: "folder-kanban", bg: "#eaf4fb", fg: "#005bac", core: true },
        { name: "お客様・連絡先", role: "会社と、その中の人。請求先は別に持ちます", count: "86 社 / 210 名", icon: "building-2", bg: "#f7f8fa", fg: "#5d6470", core: false },
        { name: "やり取りの記録", role: "メール・電話・打合せ。AIの下書きもここ", count: "1,240 件", icon: "message-square", bg: "#f7f8fa", fg: "#5d6470", core: false },
        { name: "タスク", role: "誰かが片づける単位。実体はここ1つだけ", count: "312 件", icon: "list-checks", bg: "#f7f8fa", fg: "#5d6470", core: false },
        { name: "見積", role: "金額の合意。財務の売上へつながります", count: "48 件", icon: "receipt", bg: "#f7f8fa", fg: "#5d6470", core: false },
        { name: "成果物・書類", role: "香盤表・運営マニュアル・当日の写真・納品データ", count: "—", icon: "folder-check", bg: "#f7f8fa", fg: "#5d6470", core: false },
        { name: "使った道具の記録", role: "機材・スタジオ・人。原価とふりかえりの材料", count: "—", icon: "boxes", bg: "#f7f8fa", fg: "#5d6470", core: false },
        { name: "マスター", role: "料金表・請求先・お試し（練習用）", count: "—", icon: "tags", bg: "#f7f8fa", fg: "#5d6470", core: false },
      ],

      pmFaVerbs: [
        { verb: "検索", icon: "search", desc: "目的の案件・お客様にたどり着く",
          fns: ["一覧（絞り込み・並べ替え・保存した条件）", "⌘K で名前から直行", "お客様から案件をたどる"] },
        { verb: "つくる", icon: "plus", desc: "案件を起こす",
          fns: ["案件をつくる", "メール・貼り付けからAIが下書き（ネタ案件）", "お試し（練習）から複製"] },
        { verb: "業務", icon: "arrow-right", desc: "受注に向けて動かす",
          fns: ["ステージを変える（A〜E）", "やり取りを記録する", "タスクを追加・終わらせる", "見積を作成・送る"] },
        { verb: "そなえる", icon: "clipboard-check", desc: "当日までに用意する",
          fns: ["香盤表・運営マニュアル", "成果物の置き場（BOX）", "使った道具の記録"] },
        { verb: "ふりかえる", icon: "line-chart", desc: "終わったあと数字にする",
          fns: ["案件ごとのふりかえり", "週次・月次・営業のふりかえり", "全社ダッシュボード", "AIがやったこと"] },
        { verb: "そろえる", icon: "settings-2", desc: "みんなが同じ言葉を使う",
          fns: ["料金表", "請求先", "旧GLSの取込（管理者）"] },
      ],

      pmFaDupes: [
        { issue: "タスクの入口が3か所ある", now: "トップ／案件管理／案件の中",
          fix: "入口は3つのまま、実体と画面は1つ", verdict: "整理済み", bg: "#e7f6ee", fg: "#197a4b" },
        { issue: "見積が「案件の中」と「一覧」の両方にある", now: "案件タブ ＋ 独立メニュー",
          fix: "案件の中だけに置く。横断で見るのは財務管理の役目", verdict: "寄せる", bg: "#eaf4fb", fg: "#005bac" },
        { issue: "ふりかえりと全社ダッシュボードが似ている", now: "別メニュー2つ",
          fix: "ふりかえり＝案件の数字／全社＝経営の数字。名前で分ける", verdict: "残す", bg: "#eaf4fb", fg: "#005bac" },
        { issue: "お客様と請求先が二重に登録される", now: "顧客マスター ＋ 請求先マスター",
          fix: "お客様が親、請求先はその下の枝にする", verdict: "つなぐ", bg: "#fffbeb", fg: "#92400e" },
        { issue: "「お試し（練習）」が本番の一覧に混ざる", now: "同じ一覧にフラグだけ",
          fix: "マスターの下に隔離。一覧には出しません", verdict: "分ける", bg: "#fffbeb", fg: "#92400e" },
        { issue: "ダッシュボードが無く、開いた先が常に一覧だった", now: "/projects が入口",
          fix: "ダッシュボードを先頭に。一覧はその次", verdict: "足す", bg: "#eaf4fb", fg: "#005bac" },
      ],

      pmFaScreens: [
        { screen: "ダッシュボード", holds: "案件 ・ タスク ・ 見積 ・ 現場", job: "今どうなっているかを1画面で知る", who: "全員", n: "新" },
        { screen: "案件一覧", holds: "案件", job: "検索・並べ替える・ステージを動かす", who: "全員", n: "" },
        { screen: "案件ワークスペース", holds: "案件のすべて", job: "1案件のことは全部ここで終える", who: "全員", n: "" },
        { screen: "お客様", holds: "お客様 ・ 連絡先", job: "会社から案件をたどる", who: "営業", n: "" },
        { screen: "やり取りの記録", holds: "やり取り", job: "誰と何を話したかを残す・AIの下書きを直す", who: "全員", n: "" },
        { screen: "タスク", holds: "タスク", job: "案件をまたいで片づける", who: "全員", n: "" },
        { screen: "案件の成果物", holds: "書類", job: "当日までに揃っているか確かめる", who: "制作", n: "" },
        { screen: "使った道具の記録", holds: "機材・人", job: "原価とふりかえりの材料にする", who: "技術", n: "" },
        { screen: "ふりかえり", holds: "数字", job: "終わった案件を数字で見る", who: "管理", n: "" },
        { screen: "全社ダッシュボード", holds: "数字", job: "経営として全体を見る", who: "管理者", n: "" },
        { screen: "AIがやったこと", holds: "AIの記録", job: "AIの作業をあとから確かめる", who: "管理者", n: "" },
        { screen: "マスター", holds: "料金表 ・ 請求先 ・ お試し", job: "言葉と値段を揃える", who: "管理者", n: "" },
      ],

      // ───── v4 案件ワークスペース ─────
      pwTabs: [
        { label: "概要", icon: "layout-dashboard", n: "" },
        { label: "やり取り", icon: "message-square", n: "12" },
        { label: "エピソード", icon: "clapperboard", n: "24" },
        { label: "タスク", icon: "list-checks", n: "26" },
        { label: "見積", icon: "receipt", n: "2" },
        { label: "書類", icon: "folder-check", n: "6" },
        { label: "当日", icon: "clipboard-list", n: "" },
        { label: "ふりかえり", icon: "line-chart", n: "" },
      ],

      pwStages: [
        { key: "E", label: "問合せ" },
        { key: "D", label: "仮押さえ" },
        { key: "C", label: "見積提案" },
        { key: "B", label: "口頭決定" },
        { key: "A", label: "受注済" },
      ],

      // 項目名・並びは案件登録フォーム（inManualFields）と揃えます
      pwFacts: [
        { label: "実施日", value: "2026/10/17（土）", sub: "10:00 開場 ／ 11:00 開演", icon: "calendar-days" },
        { label: "会場・スタジオ", value: "", sub: "仮押さえ中 ・ 期限 9/17", icon: "map-pin",          rooms: [
            { area: "用賀", room: "WORLD STUDIO" },
            { area: "用賀", room: "第1調整室" },
            { area: "渋谷", room: "ホワイエ" },
            { area: "渋谷", room: "A STUDIO" },
            { area: "渋谷", room: "B STUDIO" },
            { area: "渋谷", room: "C STUDIO" },
          ] },
        { label: "規模", value: "150名", sub: "配信 ＋ 収録", icon: "users" },
        { label: "金額", value: "¥1,380,000", sub: "見積 v2 ・ 予算 ¥150万", icon: "receipt" },
      ],

      // ① 全案件に共通する工程（上から順にやれば実施できる）
      pwFlow: [
        { name: "引き合い・受注", note: "やることと条件を決めて、受注まで持っていく", items: [
          { t: "内容を聞く（目的・配信先・登壇者・尺）", who: "寺井", due: "7/31 18:00", done: true },
          { t: "実施日と会場・スタジオを仮押さえする", who: "佐々木", due: "8/02 12:00", done: true },
          { t: "見積を出す", who: "寺井", due: "7/31 18:00", done: true },
          { t: "先方の稟議結果を確認する", who: "寺井", due: "8/05 17:00", done: false },
          { t: "発注書・契約を受け取る", who: "寺井", due: "8/07 18:00", done: false },
        ] },
        { name: "企画・設計", note: "どうつくるかを決めて、人と機材を押さえる", items: [
          { t: "実施要件を確定する（配信先・収録の有無・公開範囲）", who: "寺井", due: "8/12 15:00", done: true },
          { t: "技術構成を決める（カメラ・音声・回線・スイッチング）", who: "大森", due: "8/20 18:00", done: false },
          { t: "スタッフをアサインする", who: "佐々木", due: "8/25 18:00", done: false },
          { t: "機材を押さえる", who: "大森", due: "9/01 12:00", done: false },
          { t: "会場の下見と回線を確認する", who: "佐々木", due: "9/05 17:00", done: false },
        ] },
        { name: "制作準備", note: "当日の進行と素材をそろえる", items: [
          { t: "香盤表（進行台本）をつくる", who: "佐々木", due: "9/20 18:00", done: false },
          { t: "登壇者・関係者の一覧をもらう", who: "寺井", due: "9/20 18:00", done: false },
          { t: "テロップ・映像素材を受け取る", who: "大森", due: "9/30 18:00", done: false },
          { t: "配信URLと公開設定を発行する", who: "大森", due: "10/01 10:00", done: false },
          { t: "運営マニュアルを配る", who: "佐々木", due: "10/05 18:00", done: false },
        ] },
        { name: "直前", note: "事故を起こさないための最終確認", items: [
          { t: "リハーサルの日程を決める", who: "佐々木", due: "10/08 15:00", done: false },
          { t: "搬入・仕込みの計画を出す", who: "大森", due: "10/10 18:00", done: false },
          { t: "通しリハーサルをやる", who: "全員", due: "10/15 17:00", done: false },
          { t: "バックアップ回線と緊急連絡網を用意する", who: "大森", due: "10/15 17:00", done: false },
        ] },
        { name: "当日", note: "当日タブと同じ並びで進みます", items: [
          { t: "搬入・セットアップ", who: "大森", due: "10/17 09:00", done: false },
          { t: "接続テストと音声チェック", who: "大森", due: "10/17 09:00", done: false },
          { t: "本番", who: "全員", due: "10/17 09:00", done: false },
          { t: "収録データを回収してバックアップする", who: "大森", due: "10/17 09:00", done: false },
        ] },
        { name: "実施後", note: "納品して、お金とふりかえりまで終わらせる", items: [
          { t: "撤収・機材返却", who: "大森", due: "10/18 12:00", done: false },
          { t: "編集して納品する（アーカイブ公開）", who: "大森", due: "10/31 18:00", done: false },
          { t: "請求する", who: "寺井", due: "11/05 15:00", done: false },
          { t: "ふりかえりとお礼の連絡", who: "寺井", due: "11/10 17:00", done: false },
        ] },
      ],

      // 標準工程テンプレート（設定画面）

      // エピソード管理（レギュラー案件）
      epSummary: [
        { label: "全エピソード", value: "24", unit: "本", sub: "#01～#24（年間契約）" },
        { label: "収録済み", value: "18", unit: "本", sub: "未収録 6本" },
        { label: "納品済み", value: "15", unit: "本", sub: "編集中 3本" },
        { label: "今月の請求対象", value: "4", unit: "本", sub: "¥640,000（単価 ¥160,000）" },
      ],

      // レギュラー（シリーズ）用テンプレート
      flowSeriesSpec: [
        { name: "シリーズ共通（初回だけ）", badge: "初回のみ", items: [
          { t: "年間契約・発注書を受け取る", role: "営業", when: "初回収録 -30日", must: true },
          { t: "レギュレーション（尺・構成・納品形式）を確定する", role: "プロデューサー", when: "初回収録 -21日", must: true },
          { t: "技術構成とスタジオの固定セットを決める", role: "テクニカル", when: "初回収録 -14日", must: true },
          { t: "エピソード単価と請求サイクルを取り決める", role: "営業", when: "初回収録 -14日", must: true },
        ] },
        { name: "収録日（回）ごと", badge: "毎回", items: [
          { t: "香盤表（進行台本）をつくる", role: "プロデューサー", when: "収録日 -7日", must: true },
          { t: "テロップ・映像素材を受け取る", role: "テクニカル", when: "収録日 -5日", must: false },
          { t: "スタッフと機材を確定する", role: "プロデューサー", when: "収録日 -4日", must: true },
          { t: "仕込み・収録", role: "全員", when: "収録日 当日", must: true },
          { t: "編集して初稿を出す", role: "テクニカル", when: "収録日 +14日", must: true },
          { t: "納品して請求対象にする", role: "テクニカル", when: "公開日 当日", must: true },
        ] },
        { name: "月末の締め", badge: "毎月", items: [
          { t: "当月に納品したエピソードを集計する", role: "営業", when: "月末 -3日", must: true },
          { t: "請求書を発行する", role: "営業", when: "月末 当日", must: true },
        ] },
      ],

      epSeriesFlow: [
        { t: "年間契約・発注書の受領", who: "寺井", due: "済 4/10", done: true },
        { t: "レギュレーション（尺・構成・納品形式）の確定", who: "佐々木", due: "済 4/18", done: true },
        { t: "技術構成とスタジオの固定セットを決める", who: "大森", due: "済 4/25", done: true },
        { t: "エピソード単価と請求サイクルの取り決め", who: "寺井", due: "済 4/28", done: true },
      ],

      epSessions: [
        { date: "2026/08/05（水）", studio: "用賀 SKY STUDIO", note: "2本撮り", state: "予定", sBg: "#f2f4f7", sFg: "#5d6470", flow: [
          { t: "香盤表（進行台本）をつくる", who: "佐々木", due: "7/29", done: false },
          { t: "テロップ・映像素材を受け取る", who: "大森", due: "7/31 18:00", done: false },
          { t: "スタッフと機材を確定する", who: "佐々木", due: "8/01", done: false },
          { t: "仕込み・収録", who: "全員", due: "8/05 17:00", done: false },
          { t: "編集して初稿を出す", who: "大森", due: "8/19", done: false },
          { t: "納品して請求対象にする", who: "寺井", due: "8/19", done: false },
        ], eps: [
          { no: "#19", title: "新事業部のこれから", air: "8/12 公開", status: "未収録", bg: "#f2f4f7", fg: "#5d6470", amount: "¥160,000", bill: "未請求", billFg: "#9aa1ab" },
          { no: "#20", title: "若手社員座談会", air: "8/19 公開", status: "未収録", bg: "#f2f4f7", fg: "#5d6470", amount: "¥160,000", bill: "未請求", billFg: "#9aa1ab" },
        ] },
        { date: "2026/07/22（水）", studio: "用賀 SKY STUDIO", note: "3本撮り", state: "収録済み", sBg: "#e7f6ee", sFg: "#197a4b", flow: [
          { t: "香盤表（進行台本）をつくる", who: "佐々木", due: "7/15", done: true },
          { t: "テロップ・映像素材を受け取る", who: "大森", due: "7/17", done: true },
          { t: "スタッフと機材を確定する", who: "佐々木", due: "7/18", done: true },
          { t: "仕込み・収録", who: "全員", due: "7/22", done: true },
          { t: "編集して初稿を出す", who: "大森", due: "8/05 17:00", done: false },
          { t: "納品して請求対象にする", who: "寺井", due: "8/05 17:00", done: false },
        ], eps: [
          { no: "#16", title: "工場見学レポート", air: "7/29 公開", status: "納品済み", bg: "#eaf4fb", fg: "#005bac", amount: "¥160,000", bill: "請求済み", billFg: "#197a4b" },
          { no: "#17", title: "新商品のご紹介", air: "8/05 公開", status: "編集中", bg: "#fffbeb", fg: "#92400e", amount: "¥160,000", bill: "今月請求", billFg: "#c7243a" },
          { no: "#18", title: "支店長インタビュー", air: "8/12 公開", status: "編集中", bg: "#fffbeb", fg: "#92400e", amount: "¥160,000", bill: "今月請求", billFg: "#c7243a" },
        ] },
        { date: "2026/06/24（水）", studio: "用賀 SKY STUDIO", note: "2本撮り", state: "収録済み", sBg: "#e7f6ee", sFg: "#197a4b", flow: [
          { t: "香盤表（進行台本）をつくる", who: "佐々木", due: "6/17", done: true },
          { t: "テロップ・映像素材を受け取る", who: "大森", due: "6/19", done: true },
          { t: "スタッフと機材を確定する", who: "佐々木", due: "6/20", done: true },
          { t: "仕込み・収録", who: "全員", due: "6/24", done: true },
          { t: "編集して初稿を出す", who: "大森", due: "7/08", done: false },
          { t: "納品して請求対象にする", who: "寺井", due: "7/08", done: false },
        ], eps: [
          { no: "#14", title: "周年企画のご案内", air: "7/01 公開", status: "納品済み", bg: "#eaf4fb", fg: "#005bac", amount: "¥160,000", bill: "請求済み", billFg: "#197a4b" },
          { no: "#15", title: "サステナビリティ報告", air: "7/08 公開", status: "納品済み", bg: "#eaf4fb", fg: "#005bac", amount: "¥160,000", bill: "請求済み", billFg: "#197a4b" },
        ] },
      ],

      // やり取りタブ（時系列タイムライン）
      thread: [
        { day: "2026/07/30（木）", items: [
          { kind: "打合せ", icon: "mic", iconBg: "#f5f3ff", iconFg: "#6d28d9", time: "14:00–15:10", ai: true,
            title: "第2回 制作打合せ（先方4名・当社3名）",
            who: "寺井 恭平", avatar: "寺", meta: "録音 70分 ・ 文字起こし 12,400字 ・ AIが要点を抽出",
            body: "式典本編とインタビュー収録の進め方を確認。配信は限定公開で確定し、収録データの二次利用範囲は先方の広報部で持ち帰りとなった。会場の電源容量に懸念があり、当社から設備担当への確認を打診。",
            decisions: [
              { t: "配信は YouTube 限定公開。一般公開はしない", field: "実施要件" },
              { t: "式典後に創業家族インタビューを別撮りする（30分）", field: "香盤表" },
              { t: "手話通訳はワイプで入れる。位置は右下", field: "技術構成" },
            ],
            tasks: [
              { t: "創業者インタビューの収録可否を確認", who: "佐々木", due: "8/12 15:00", done: false },
              { t: "手話通訳のワイプ枠を検討する", who: "大森", due: "8/20 18:00", done: false },
              { t: "会場の電源容量を先方設備担当に確認", who: "大森", due: "9/01 12:00", done: false },
            ],
            files: [
              { name: "打合せ_文字起こし.txt", meta: "12.4千字", icon: "file-text", fg: "#5d6470" },
              { name: "会場図面_v2.pdf", meta: "2.1 MB", icon: "file", fg: "#c7243a" },
            ] },
        ] },
        { day: "2026/07/28（火）", items: [
          { kind: "メール", icon: "mail", iconBg: "#eaf4fb", iconFg: "#005bac", time: "11:24",
            title: "Re: 見積書のご送付（60周年記念式典）",
            who: "田中 誠一 様", avatar: "田", meta: "株式会社ミナトデジタル 広報部 → 寺井",
            quote: "見積を拝見しました。総額は社内稟議に回します。配信のみのプランとの差額が分かる形でいただけますと助かります。実施日は 10/17 で固めて問題ありません。",
            decisions: [
              { t: "実施日 2026/10/17（土）で確定", field: "実施日" },
            ],
            tasks: [
              { t: "配信のみプランとの差額を出して再送", who: "寺井", due: "7/31 18:00", done: true },
            ] },
          { kind: "電話", icon: "phone", iconBg: "#e7f6ee", iconFg: "#197a4b", time: "09:40",
            title: "田中様より着信（5分）",
            who: "寺井 恭平", avatar: "寺", meta: "手入力メモ",
            body: "稟議のスケジュール確認。8/5 の役員会にかけるため、それまでに差額資料が欲しいとのこと。" },
        ] },
        { day: "2026/07/24（金）", items: [
          { kind: "メール", icon: "mail", iconBg: "#eaf4fb", iconFg: "#005bac", time: "18:02",
            title: "見積書のご送付（60周年記念式典 配信・収録）",
            who: "寺井 恭平", avatar: "寺", meta: "→ 田中様・佐藤様（CC: sales@）",
            body: "見積 v2 を送付。会場費・技術費・編集費の3本立てで、アーカイブ編集をオプション表記に変更した。",
            files: [
              { name: "見積書_v2.pdf", meta: "310 KB", icon: "file", fg: "#c7243a" },
            ] },
          { kind: "受付", icon: "inbox", iconBg: "#f2f4f7", iconFg: "#5d6470", time: "10:15",
            title: "問い合わせフォームから受付",
            who: "システム", avatar: "S", meta: "Kairos3 通知メールから自動取り込み",
            body: "60周年記念式典の配信・収録について。想定150名、10月中旬、都内会場。" },
        ] },
      ],

      thDecided: [
        { day: "7/30", t: "配信は YouTube 限定公開" },
        { day: "7/30", t: "創業家族インタビューを別撮り（30分）" },
        { day: "7/30", t: "手話通訳はワイプ・右下" },
        { day: "7/28", t: "実施日 2026/10/17（土）で確定" },
        { day: "7/24", t: "アーカイブ編集はオプション扱い" },
      ],

      thOpenItems: [
        { t: "収録データの二次利用範囲（先方広報部で持ち帰り）" },
        { t: "会場の電源容量" },
        { t: "登壇者リストの確定" },
      ],

      thPeople: [
        { initial: "田", name: "田中 誠一 様", role: "ミナトデジタル 広報部長", n: "8", bg: "#eaf4fb", fg: "#005bac" },
        { initial: "佐", name: "佐藤 由紀 様", role: "ミナトデジタル 広報部", n: "3", bg: "#eaf4fb", fg: "#005bac" },
        { initial: "寺", name: "寺井 恭平", role: "当社 営業", n: "12", bg: "#f5f3ff", fg: "#6d28d9" },
        { initial: "大", name: "大森 亮", role: "当社 テクニカル", n: "5", bg: "#e7f6ee", fg: "#197a4b" },
      ],

      // 案件の種類（受付時に確定し、標準工程テンプレートを決めます）
      projectKinds: [
        { group: "LIVE", groupLabel: "ライブ", groupNote: "その場で進行するもの", items: [
          { name: "リアルイベント", aud: "有観客", cast: "放送・配信なし", steps: "18", using: "4" },
          { name: "ハイブリッドイベント", aud: "有観客", cast: "放送・配信あり", steps: "26", using: "12" },
          { name: "生放送／配信", aud: "無観客", cast: "放送・配信あり", steps: "24", using: "5" },
        ] },
        { group: "REC", groupLabel: "収録", groupNote: "あとで使う映像をつくるもの", items: [
          { name: "公開収録", aud: "有観客", cast: "収録中心", steps: "22", using: "3" },
          { name: "収録ありイベント", aud: "有観客", cast: "イベント中心", steps: "20", using: "2" },
          { name: "スタジオ収録", aud: "無観客", cast: "収録のみ", steps: "14", using: "8" },
        ] },
      ],

      // 選んだ型の中身（実施日からの逆算で期限が入ります）
      flowSpec: [
        { name: "引き合い・受注", items: [
          { t: "内容を聞く（目的・配信先・登壇者・尺）", role: "営業", when: "受付から 1日", must: true },
          { t: "実施日と会場・スタジオを仮押さえする", role: "営業", when: "受付から 3日", must: true },
          { t: "見積を出す", role: "営業", when: "受付から 5日", must: true },
          { t: "発注書・契約を受け取る", role: "営業", when: "実施日 -60日", must: true },
        ] },
        { name: "企画・設計", items: [
          { t: "実施要件を確定する（配信先・収録の有無・公開範囲）", role: "プロデューサー", when: "実施日 -55日", must: true },
          { t: "技術構成を決める（カメラ・音声・回線）", role: "テクニカル", when: "実施日 -50日", must: true },
          { t: "スタッフをアサインする", role: "プロデューサー", when: "実施日 -45日", must: true },
          { t: "機材を押さえる", role: "テクニカル", when: "実施日 -40日", must: true },
          { t: "会場の下見と回線を確認する", role: "テクニカル", when: "実施日 -35日", must: false },
        ] },
        { name: "制作準備", items: [
          { t: "香盤表（進行台本）をつくる", role: "プロデューサー", when: "実施日 -25日", must: true },
          { t: "登壇者・関係者の一覧をもらう", role: "営業", when: "実施日 -25日", must: false },
          { t: "テロップ・映像素材を受け取る", role: "テクニカル", when: "実施日 -15日", must: false },
          { t: "配信URLと公開設定を発行する", role: "テクニカル", when: "実施日 -14日", must: true },
          { t: "運営マニュアルを配る", role: "プロデューサー", when: "実施日 -10日", must: false },
        ] },
        { name: "直前", items: [
          { t: "リハーサルの日程を決める", role: "プロデューサー", when: "実施日 -9日", must: true },
          { t: "搬入・仕込みの計画を出す", role: "テクニカル", when: "実施日 -7日", must: true },
          { t: "通しリハーサルをやる", role: "全員", when: "実施日 -2日", must: true },
          { t: "バックアップ回線と緊急連絡網を用意する", role: "テクニカル", when: "実施日 -2日", must: true },
        ] },
        { name: "当日", items: [
          { t: "搬入・セットアップ", role: "テクニカル", when: "実施日 当日", must: true },
          { t: "接続テストと音声チェック", role: "テクニカル", when: "実施日 当日", must: true },
          { t: "本番", role: "全員", when: "実施日 当日", must: true },
          { t: "収録データを回収してバックアップする", role: "テクニカル", when: "実施日 当日", must: true },
        ] },
        { name: "実施後", items: [
          { t: "撤収・機材返却", role: "テクニカル", when: "実施日 +1日", must: true },
          { t: "編集して納品する（アーカイブ公開）", role: "テクニカル", when: "実施日 +14日", must: false },
          { t: "請求する", role: "営業", when: "実施日 +19日", must: true },
          { t: "ふりかえりとお礼の連絡", role: "営業", when: "実施日 +24日", must: false },
        ] },
      ],

      // ② 個別タスク（打合せなどで出たもの）
      pwNext: [
        { title: "配信先を確かめる（YouTube か限定公開か）", who: "寺井", due: "8/07 18:00", dueFg: "#c7243a", from: "受付の「未確認事項」から" },
        { title: "創業者インタビューの収録可否を確認", who: "佐々木", due: "8/12 15:00", dueFg: "#3c424c", from: "7/30 打合せで出た宿題" },
        { title: "手話通訳のワイプ枠を検討する", who: "大森", due: "8/20 18:00", dueFg: "#3c424c", from: "7/30 打合せで出た宿題" },
        { title: "会場の電源容量を先方設備担当に確認", who: "大森", due: "9/01 12:00", dueFg: "#3c424c", from: "手で足しました" },
      ],

      pwTimeline: [
        { who: "寺井 赳博", initial: "寺", bg: "#eaf4fb", fg: "#005bac", when: "12分前", what: "見積 v2（¥1,380,000）を宮田様に送りました", kind: "見積" },
        { who: "AI", initial: "AI", bg: "#ede9fe", fg: "#6d28d9", when: "1時間前", what: "返信メールから「会場は未定のまま」と読み取り、メモに追記しました", kind: "AI" },
        { who: "佐々木 遥", initial: "佐", bg: "#f5f3ff", fg: "#6d28d9", when: "昨日", what: "ステージを C 見積提案 → B 口頭決定 にしました", kind: "ステージ" },
        { who: "宮田 里香 様", initial: "宮", bg: "#f2f4f7", fg: "#5d6470", when: "昨日", what: "「社内で確認します。8/7までに返答します」とメールが届きました", kind: "お客様" },
        { who: "寺井 赳博", initial: "寺", bg: "#eaf4fb", fg: "#005bac", when: "7/31", what: "受付から案件にしました（メールから取り込み）", kind: "受付" },
      ],

      pwOpen: [
        { q: "配信先はYouTubeですか、限定公開ですか", why: "回線と演出の構成が変わります" },
        { q: "登壇者は何名ですか", why: "マイクとカメラの台数に直結します" },
      ],

      pwSide: [
        { label: "お客様", value: "株式会社ミナトデジタル", sub: "過去 3件 ・ 直近 2025/11", icon: "building-2" },
        { label: "ご担当", value: "宮田 里香 様（広報部）", sub: "miyata@minato-d.co.jp", icon: "user" },
        { label: "受付", value: "寺井 赳博", sub: "2026/07/31 10:24 ・ メールから", icon: "inbox" },
        { label: "入手経路", value: "直接のご依頼", sub: "info@ 宛", icon: "share-2" },
      ],

      pwFiles: [
        { name: "御見積書_v2.pdf", meta: "7/31 ・ 寺井", icon: "file-text", bg: "#fef6f7", fg: "#c7243a" },
        { name: "式典_進行案.xlsx", meta: "7/31 ・ お客様から", icon: "table", bg: "#e7f6ee", fg: "#197a4b" },
        { name: "会場候補メモ.docx", meta: "7/30 ・ 佐々木", icon: "file-type", bg: "#eaf4fb", fg: "#005bac" },
      ],


      studioGroups: [
        { area: "用賀", rooms: [
          { name: "WORLD STUDIO", short: "WORLD" },
          { name: "SKY STUDIO", short: "SKY" },
          { name: "LOUNGE STUDIO", short: "LOUNGE" },
          { name: "第1調整室", short: "第1調整室" },
        ] },
        { area: "渋谷", rooms: [
          { name: "ホワイエ", short: "ホワイエ" },
          { name: "A STUDIO", short: "A" },
          { name: "B STUDIO", short: "B" },
          { name: "C STUDIO", short: "C" },
        ] },
        { area: "青山", rooms: [
          { name: "STUDIO", short: "STUDIO" },
        ] },
        { area: "その他", rooms: [
          { name: "GMOアリーナさいたま", short: "アリーナさいたま" },
          { name: "GMO Yours・セルリアン", short: "Yours・セルリアン" },
          { name: "GMO Yours・フクラス", short: "Yours・フクラス" },
        ] },
      ],

      // ───── v4 設計メモ（使う人の目線） ─────
      docScenes: [
        { icon: "phone", when: "お客様から電話が来た", you: "通話が終わったら、文字起こしをそのまま貼ります",
          sys: "AIが会社・日程・やりたいことを拾い、受付ビューに1件つくります",
          where: "案件管理 ＞ 案件受付 ＞ 電話・その他を貼る", time: "30秒" },
        { icon: "mail", when: "朝、メールが届いていた", you: "何もしません。ダッシュボードを開くだけです",
          sys: "MCPが自動で読み込み、受付の未処理として数えます",
          where: "案件管理 ＞ ダッシュボード ＞ 案件受付（未処理 4）", time: "0秒" },
        { icon: "inbox", when: "未処理を片づけたい", you: "読み取り結果を確かめ、聞くことを選び、案件にするか決めます",
          sys: "文面の下書きを用意します。送るのはあなたです",
          where: "受付ビュー", time: "2〜3分" },
        { icon: "folder-kanban", when: "動いている案件を見たい", you: "ヨミで絞って眺めます",
          sys: "止まっている案件に赤い印を付けます",
          where: "案件一覧", time: "1分" },
        { icon: "list-checks", when: "自分の仕事を片づけたい", you: "チェックを押して消し込みます",
          sys: "案件からも、トップからも、同じタスクが消えます",
          where: "トップページ ＞ 自分のやること", time: "随時" },
      ],

      docFlow: [
        { n: "1", title: "受ける", you: "電話・対面は貼る。メールは何もしない",
          sys: "AIが読み取り、確信度（高・中・低）を付ける",
          judge: "", tip: "整った文章でなくて大丈夫です" },
        { n: "2", title: "確かめる", you: "赤や黄色の項目だけ直す",
          sys: "同じ会社の続きなら束ね、別件そうなら「別件かも」と出す",
          judge: "", tip: "全部直す必要はありません" },
        { n: "3", title: "聞く", you: "聞くことにチェック → 文面をコピー、または下書きを開く",
          sys: "メール文面と電話メモの下書きを書く",
          judge: "", tip: "送信はあなたの手で" },
        { n: "4", title: "決める", you: "案件にする／聞いてから決める／ネタのまま／見送り",
          sys: "「案件にする」を押した人を受付者として記録する",
          judge: "日程か見積が動いたら案件にします", tip: "迷ったらネタのままで構いません" },
        { n: "5", title: "進める", you: "ステージを動かし、タスクを追加",
          sys: "BOXのフォルダを2つ自動でつくる（社内・社外）",
          judge: "", tip: "書類はBOXに集まります" },
      ],

      docFaq: [
        { q: "日程が決まっていないけど、案件にしていい？", a: "できます。必須はお客様・案件名・ステージの3つだけです。" },
        { q: "同じ会社から2件相談が来た。どうする？", a: "日程かやりたいことが違えば別件です。受付ビューの「別のネタに分ける」を押してください。" },
        { q: "AIの読み取りが間違っている", a: "その場で直せます。直すと「人が直した」に変わり、確信度の色は消えます。" },
        { q: "金額はどこに入れる？", a: "入れません。見積を作成と、一覧にも財務にも同じ数字が出ます。" },
        { q: "誰の案件か分からない", a: "案件に担当者はいません。誰が何をするかはタスクで表します。" },
        { q: "見送りにしたものを探したい", a: "案件一覧の「ネタ」タブにあります。過去のネタも見送りもここです。" },
        { q: "受付を専門にやる人が必要？", a: "要りません。受けた人がその場で入れて、気づいた人が片づけます。" },
        { q: "スマホでどこまでできる？", a: "貼る・送る・チェックを消す、まで。読み取りの細かい修正はPCが向いています。" },
      ],

      docWhere: [
        { thing: "ご依頼を入れる", place: "案件管理 ＞ ダッシュボード ＞ 案件受付", icon: "inbox" },
        { thing: "案件を検索", place: "案件管理 ＞ 案件一覧（ヨミで絞る）", icon: "search" },
        { thing: "1つの案件のことを全部やる", place: "案件一覧から案件を開く", icon: "folder-kanban" },
        { thing: "書類を置く・見る", place: "案件を開く ＞ 書類（BOX）", icon: "hard-drive" },
        { thing: "自分の仕事を見る", place: "トップページ ＞ 自分のやること", icon: "user-check" },
        { thing: "今日の予定を見る", place: "トップページ ＞ 今日の予定", icon: "calendar-clock" },
      ],


      ifProblems: [
        { issue: "同じことを2回聞いている", detail: "受付で読み取った日程・会場を、案件にするときにもう一度入れています。", where: "受付ビュー ／ 案件をつくる" },
        { issue: "一覧に出したい情報が入る場所がない", detail: "金額とステージは一覧の主役なのに、入れる場所は案件の中の別タブです。", where: "案件一覧" },
        { issue: "「案件にする」で何が必須か決まっていない", detail: "日程が未定でも案件にしたいのに、フォームは全部埋める形になっています。", where: "案件にする" },
        { issue: "AIが読んだ値と人が入れた値が混ざる", detail: "どちらが正かが画面から分かりません。上書きの記録も残りません。", where: "全体" },
      ],

      ifFields: [
        { field: "お客様", must: "必須", mustBg: "#fef6f7", mustFg: "#b91c1c", where: "受付", who: "AIが読む → 人が確かめる", shown: "一覧・案件・請求", note: "既存に寄せます。新規は人が選んだときだけ" },
        { field: "ご担当", must: "任意", mustBg: "#f2f4f7", mustFg: "#5d6470", where: "受付", who: "AIが読む", shown: "案件・やり取り", note: "" },
        { field: "案件名", must: "必須", mustBg: "#fef6f7", mustFg: "#b91c1c", where: "案件にする", who: "AIが下書き → 人が直す", shown: "一覧・案件・BOX", note: "BOXのフォルダ名になります" },
        { field: "実施日", must: "任意", mustBg: "#f2f4f7", mustFg: "#5d6470", where: "受付", who: "AIが読む", shown: "一覧・カレンダー", note: "未定のまま案件にできます" },
        { field: "ステージ", must: "必須", mustBg: "#fef6f7", mustFg: "#b91c1c", where: "案件にする", who: "既定は D 仮押さえ", shown: "一覧・ボード・ヨミ", note: "あとはヘッダーで動かします" },
        { field: "金額", must: "任意", mustBg: "#f2f4f7", mustFg: "#5d6470", where: "見積タブ", who: "見積から自動", shown: "一覧・ボード・財務", note: "手では入れません（二重管理を作らない）" },
        { field: "会場・スタジオ", must: "任意", mustBg: "#f2f4f7", mustFg: "#5d6470", where: "受付", who: "一覧から選ぶ（手入力も可）", shown: "案件・カレンダー・当日", note: "用賀・渋谷・青山・その他" },
        { field: "入手経路", must: "任意", mustBg: "#f2f4f7", mustFg: "#5d6470", where: "受付", who: "人が選ぶ", shown: "ふりかえり", note: "あとで集計します" },
        { field: "受付者", must: "自動", mustBg: "#eaf4fb", mustFg: "#005bac", where: "案件にする", who: "押した人", shown: "案件", note: "変えられません" },
        { field: "最初のタスク", must: "任意", mustBg: "#f2f4f7", mustFg: "#5d6470", where: "案件にする", who: "AIが提案 → 人が決める", shown: "一覧・タスク", note: "一覧の「次のタスク」になります" },
      ],

      ifRule: [
        { head: "入れる場所は1つだけ", body: "同じ項目を2画面から入れられるようにしません。受付で入ったものは、案件では「直す」だけです。" },
        { head: "必須は3つ", body: "お客様・案件名・ステージ。これだけあれば案件になります。日程も金額も未定で構いません。" },
        { head: "金額は見積から", body: "手入力の欄を作りません。見積を作れば一覧にも財務にも同じ数字が出ます。" },
        { head: "AIの値は出どころを残す", body: "AIが読んだ値には確信度と出典が付きます。人が直すと「人が直した」に変わります。" },
        { head: "足りないものは一覧で分かる", body: "実施日や金額が空の案件は、一覧で薄いダッシュになります。埋めるのはその場からできます。" },
      ],

      ifDialog: [
        { label: "お客様", value: "株式会社ミナトデジタル", src: "受付から", conf: "高", cBg: "#e7f6ee", cFg: "#197a4b", must: true },
        { label: "案件名", value: "60周年 記念式典 配信・収録", src: "AIの下書き", conf: "中", cBg: "#fffbeb", cFg: "#92400e", must: true },
        { label: "ステージ", value: "D 仮押さえ", src: "既定", conf: "", cBg: "", cFg: "", must: true },
        { label: "実施日", value: "2026/11/14（土）", src: "受付から", conf: "中", cBg: "#fffbeb", cFg: "#92400e", must: false },
        { label: "会場", value: "未定（都内・150名規模）", src: "受付から", conf: "低", cBg: "#fef6f7", cFg: "#b91c1c", must: false },
        { label: "最初のタスク", value: "寺井：見積を送る（8/7まで）", src: "AIの提案", conf: "", cBg: "", cFg: "", must: false },
      ],


      boxFolders: [
        { scope: "社内", name: "【社内】GLS-2026-0142_60周年 記念式典 配信・収録", note: "社外には見せません",
          bg: "#fef6f7", fg: "#b91c1c",
          subs: [
            { name: "02_発注・契約", n: "2" },
            { name: "03_請求", n: "1" },
            { name: "07_原価・利益管理", n: "3" },
          ] },
        { scope: "社外", name: "【社外】GLS-2026-0142_60周年 記念式典 配信・収録", note: "お客様と共有できます",
          bg: "#e7f6ee", fg: "#197a4b",
          subs: [
            { name: "01_見積・提案", n: "4" },
            { name: "04_Qシート", n: "1" },
            { name: "05_台本・進行表", n: "2" },
            { name: "06_納品物", n: "0" },
          ] },
      ],

      boxFiles: [
        { name: "御見積書_v2.pdf", folder: "01_見積・提案", scope: "社外", by: "寺井 赳博", when: "7/31 10:24", size: "212 KB", icon: "file-text", bg: "#fef6f7", fg: "#c7243a", from: "" },
        { name: "式典_進行案.xlsx", folder: "05_台本・進行表", scope: "社外", by: "お客様から", when: "7/31 08:12", size: "48 KB", icon: "table", bg: "#e7f6ee", fg: "#197a4b", from: "受付のメール添付から入りました" },
        { name: "会場候補メモ.docx", folder: "01_見積・提案", scope: "社外", by: "佐々木 遥", when: "7/30 16:40", size: "31 KB", icon: "file-type", bg: "#eaf4fb", fg: "#005bac", from: "" },
        { name: "発注書_ミナトデジタル様.pdf", folder: "02_発注・契約", scope: "社内", by: "寺井 赳博", when: "7/29 11:05", size: "180 KB", icon: "file-text", bg: "#f2f4f7", fg: "#5d6470", from: "" },
        { name: "原価表_v1.xlsx", folder: "07_原価・利益管理", scope: "社内", by: "大森 亮", when: "7/28 19:20", size: "64 KB", icon: "table", bg: "#f2f4f7", fg: "#5d6470", from: "" },
      ],

      boxRules: [
        { head: "フォルダは案件をつくった時に自動でできる", body: "社内限りと社外共有可の2つを同時に作ります。サブフォルダの構成も決まっているので、迷う余地がありません。" },
        { head: "名前が変わればBOXも変わる", body: "案件名を直したときとGLS番号が出たときは、両方のフォルダ名を自動で書き換えます。人は触りません。" },
        { head: "社内と社外を混ぜない", body: "見積・台本・納品物は社外。発注・請求・原価は社内。この画面でも赤（社内）と緑（社外）で分けて出します。" },
        { head: "この画面から入れられる", body: "ここに落としたファイルは、選んだフォルダにそのまま入ります。BOXを別に開く必要はありません。" },
        { head: "BOXが止まっても案件は止めない", body: "BOXにつながらないときは、この欄だけ「つながりません」と出して、案件の作成や更新は普通に続けます。" },
      ],


      plChips: [
        { label: "すべて", n: "58", key: "all" },
        { label: "A 受注済", n: "9", key: "A" },
        { label: "B 口頭決定", n: "5", key: "B" },
        { label: "C 見積提案", n: "6", key: "C" },
        { label: "D 仮押さえ", n: "3", key: "D" },
        { label: "E 問合せ", n: "1", key: "E" },
        { label: "終了", n: "31", key: "done" },
      ],

      plRows: [
        { name: "60周年 記念式典 配信・収録", cust: "株式会社ミナトデジタル", stage: "B 口頭決定", bg: "#eaf4fb", fg: "#005bac",
          when: "10/17", amount: "1,380,000", task: "寺井：見積を送る", due: "今日", dueFg: "#c7243a", moved: "12分前", flag: "" },
        { name: "夏フェス 中継（3日間）", cust: "ライトウェーブ音響", stage: "A 受注済", bg: "#e7f6ee", fg: "#197a4b",
          when: "08/22", amount: "4,260,000", task: "大森：機材を押さえる", due: "8/05 17:00", dueFg: "#b45309", moved: "1時間前", flag: "" },
        { name: "株主総会 ライブ配信", cust: "ジャパンネット株式会社", stage: "A 受注済", bg: "#e7f6ee", fg: "#197a4b",
          when: "09/26", amount: "2,180,000", task: "寺井：申込書をもらう", due: "7/29 超過", dueFg: "#c7243a", moved: "2時間前", flag: "" },
        { name: "秋のブランド発表会", cust: "株式会社アオゾラ物流", stage: "C 見積提案", bg: "#eaf4fb", fg: "#005bac",
          when: "10/03", amount: "980,000", task: "佐々木：香盤表をつくる", due: "8/12 15:00", dueFg: "#3c424c", moved: "昨日", flag: "" },
        { name: "新商品発表会 ライブ配信", cust: "ヒカリ食品株式会社", stage: "C 見積提案", bg: "#eaf4fb", fg: "#005bac",
          when: "09/05", amount: "1,540,000", task: "佐々木：追いかける", due: "8/08", dueFg: "#3c424c", moved: "9日前", flag: "止まっている" },
        { name: "社内表彰式 収録", cust: "サンリバーホールディングス", stage: "D 仮押さえ", bg: "#f2f4f7", fg: "#5d6470",
          when: "11/12", amount: "", task: "— 誰のタスクもありません", due: "", dueFg: "#9aa1ab", moved: "3日前", flag: "" },
        { name: "周年パーティ 配信", cust: "ケイアイフーズ株式会社", stage: "C 見積提案", bg: "#eaf4fb", fg: "#005bac",
          when: "12/06", amount: "720,000", task: "寺井：追いかける", due: "8/01", dueFg: "#b45309", moved: "12日前", flag: "止まっている" },
        { name: "社内研修 収録（全12回）", cust: "サンリバー音響株式会社", stage: "E 問合せ", bg: "#f2f4f7", fg: "#5d6470",
          when: "未定", amount: "", task: "寺井：相場を返す", due: "8/06", dueFg: "#3c424c", moved: "昨日", flag: "" },
      ],

      plBoard: [
        { stage: "E 問合せ", n: "1", amount: "—", bg: "#cbd2da",
          cards: [{ name: "社内研修 収録（全12回）", cust: "サンリバー音響", when: "未定", task: "相場を返す", warn: "" }] },
        { stage: "D 仮押さえ", n: "3", amount: "4,100", unit: "千", bg: "#a6ceeb",
          cards: [
            { name: "社内表彰式 収録", cust: "サンリバーHD", when: "11/12", task: "—", warn: "期限 8/12" },
            { name: "秋の展示会 配信", cust: "コトブキ電機", when: "10/28", task: "会場を確かめる", warn: "" },
            { name: "決算説明会", cust: "ジャパンネット", when: "11/20", task: "日程を詰める", warn: "" },
          ] },
        { stage: "C 見積提案", n: "3", amount: "3,240", unit: "千", bg: "#4a9fd8",
          cards: [
            { name: "秋のブランド発表会", cust: "アオゾラ物流", when: "10/03", task: "香盤表をつくる", warn: "" },
            { name: "新商品発表会 ライブ配信", cust: "ヒカリ食品", when: "09/05", task: "追いかける", warn: "9日 動いていません" },
            { name: "周年パーティ 配信", cust: "ケイアイフーズ", when: "12/06", task: "追いかける", warn: "12日 動いていません" },
          ] },
        { stage: "B 口頭決定", n: "1", amount: "1,380", unit: "千", bg: "#005bac",
          cards: [{ name: "60周年 記念式典 配信・収録", cust: "ミナトデジタル", when: "10/17", task: "見積を送る", warn: "今日が期限" }] },
        { stage: "A 受注済", n: "2", amount: "6,440", unit: "千", bg: "#197a4b",
          cards: [
            { name: "夏フェス 中継（3日間）", cust: "ライトウェーブ音響", when: "08/22", task: "機材を押さえる", warn: "" },
            { name: "株主総会 ライブ配信", cust: "ジャパンネット", when: "09/26", task: "申込書をもらう", warn: "期限を過ぎています" },
          ] },
      ],

      plSaved: [
        { label: "今週さわる案件", n: "9" },
        { label: "見積の返事待ち", n: "7" },
        { label: "用賀STUDIOを使うもの", n: "14" },
      ],

      plSeedRows: [
        { cust: "株式会社ミナトデジタル", gist: "記念式典のライブ配信。見積と資料が欲しい", ch: "メール", icon: "mail", when: "今日 08:12", conf: "高", cBg: "#e7f6ee", cFg: "#197a4b", state: "未処理" },
        { cust: "ジャパンネット株式会社", gist: "来年の株主総会。日程未定、まず相場が知りたい", ch: "電話", icon: "phone", when: "今日 09:40", conf: "中", cBg: "#fffbeb", cFg: "#92400e", state: "未処理" },
        { cust: "株式会社アオゾラ物流", gist: "会場が決まった続報。別件で社内研修の相談も", ch: "メール", icon: "mail", when: "昨日 17:05", conf: "高", cBg: "#e7f6ee", cFg: "#197a4b", state: "束ねた" },
        { cust: "ケイアイフーズ株式会社", gist: "展示会で名刺交換。「配信を検討中」とだけ", ch: "その他", icon: "message-square", when: "7/29", conf: "低", cBg: "#fef6f7", cFg: "#b91c1c", state: "要確認" },
        { cust: "コトブキ電機株式会社", gist: "問い合わせフォーム。社内配信の相談", ch: "その他", icon: "globe", when: "7/28", conf: "中", cBg: "#fffbeb", cFg: "#92400e", state: "見送り" },
      ],


      inJourney: [
        { yomi: "E", stage: "引き合い", what: "メール・電話・その他で依頼が届く", who: "全員", state: "ネタ", bg: "#f2f4f7", fg: "#5d6470" },
        { yomi: "E", stage: "受付・解析", what: "文面や文字起こしを入れて、AIが分かることを出す", who: "受けた人", state: "ネタ", bg: "#f2f4f7", fg: "#5d6470" },
        { yomi: "D", stage: "仮押さえ", what: "日程が出たらスタジオを押さえる（期限はその日程の1か月前）", who: "営業", state: "案件", bg: "#e0f2fe", fg: "#0369a1" },
        { yomi: "D", stage: "ヒアリング", what: "足りないことを聞く。資料を送る", who: "営業", state: "案件", bg: "#e0f2fe", fg: "#0369a1" },
        { yomi: "C", stage: "見積提案", what: "見積を出す。返事を待つ", who: "営業", state: "案件", bg: "#eaf4fb", fg: "#005bac" },
        { yomi: "B", stage: "口頭決定", what: "やることが決まった。書面はこれから", who: "営業", state: "案件", bg: "#dbeafe", fg: "#1d4ed8" },
        { yomi: "A", stage: "受注", what: "申込書・発注書が届いた", who: "営業", state: "案件", bg: "#e7f6ee", fg: "#197a4b" },
        { yomi: "—", stage: "実施・請求・ふりかえり", what: "当日を回し、請求して、数字にする", who: "制作・管理", state: "案件", bg: "#f7f8fa", fg: "#5d6470" },
      ],

      inChannels: [
        { ch: "メール", icon: "mail", how: "MCPで自動取り込み", detail: "info@ / sales@ に加えて、担当者宛の個人メールも対象です。入ったものは必ず「ネタ」から始まります。",
          auto: "自動", bg: "#e7f6ee", fg: "#197a4b",
          notes: ["宛先・件名・署名から会社と担当者を当てます", "添付（Excel・PDF）も中身まで読みます", "同じ引き合いの続きは束ねます（重複のネタを作りません）"] },
        { ch: "電話", icon: "phone", how: "通話後に文字起こしを貼る", detail: "通話が終わってから、文字起こしをこの画面に貼ります。要点はAIが拾います。",
          auto: "手で入れる", bg: "#fffbeb", fg: "#92400e",
          notes: ["受けた人・日時は自動で入ります", "聞けなかったことは「未確認」として残します", "折り返しの約束はタスクになります"] },
        { ch: "その他の問い合わせ", icon: "message-square", how: "文字起こしを貼る", detail: "フォーム・チャット・対面・展示会など。文面をそのまま貼ります。",
          auto: "手で入れる", bg: "#fffbeb", fg: "#92400e",
          notes: ["入手経路を選びます（あとで集計します）", "紹介元があれば残します", "写真・名刺も一緒に置けます"] },
      ],

      inAsks: [
        { ask: "イベントの日程", icon: "calendar-days", freq: "ほぼ必ず", note: "確定・仮・未定の3段階。未定でも押さえたい日があれば聞きます", act: "空き状況を出す ／ 仮押さえをつくる" },
        { ask: "イベントの内容", icon: "clipboard-list", freq: "濃淡が大きい", note: "「配信したい」だけのこともあれば、香盤まで決まっていることもあります", act: "似た案件を出す ／ 聞くことリストを出す" },
        { ask: "見積", icon: "receipt", freq: "多い", note: "内容が薄いと出せません。概算か正式かを先に決めます", act: "概算のたたき台をつくる（送信はしません）" },
        { ask: "各種資料", icon: "book-open", freq: "多い", note: "会社案内・スタジオ資料・機材リスト・実績など", act: "資料セットを選ぶ ／ 送付をタスクにする" },
      ],

      inExtract: [
        { field: "お客様", value: "株式会社ミナトデジタル", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "署名" },
        { field: "ご担当", value: "宮田 里香 様 ／ 広報部", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "署名" },
        { field: "実施日", value: "2026/11/14（土）ほか2案", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "本文" },
        { field: "会場・スタジオ", value: "未定（都内）", conf: "低", bg: "#fef6f7", fg: "#b91c1c", src: "推測" },
            { field: "規模", value: "150名", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "本文" },
        { field: "やりたいこと", value: "式典のライブ配信と収録", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "本文" },
        { field: "予算", value: "記載なし", conf: "—", bg: "#f2f4f7", fg: "#5d6470", src: "—" },
        { field: "返事の期限", value: "8/7（金）まで", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "本文" },
        { field: "求められているもの", value: "見積 ・ スタジオ資料", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "本文" },
      ],

      inSuggest: [
        { icon: "calendar-plus", label: "11/14 の用賀 STUDIO A を仮押さえ", why: "同規模の式典で使っている部屋。いまは空いています", cta: "仮押さえる" },
        { icon: "copy", label: "似た案件「60周年 記念式典」から概算見積を作成", why: "配信＋収録・150名・2カメ。金額まで入れて出します（社内用）", cta: "概算をつくる" },
        { icon: "send", label: "スタジオ資料セットを送る", why: "会社案内・用賀STUDIO・機材リストの3点", cta: "送付をタスクに" },
        { icon: "help-circle", label: "聞けていないことが 4つ あります", why: "会場・配信先・登壇者数・予算の目安", cta: "聞くことを見る" },
      ],

      inAsk: [
        { kind: "メール", icon: "mail", to: "宮田 里香 様（株式会社ミナトデジタル）", subject: "Re: 記念式典のライブ配信について",
          note: "AIの下書きです。送るのは押したときだけ",
          body: [
            "宮田様", "",
            "お世話になっております。GMOグローバルスタジオの寺井です。",
            "ご依頼ありがとうございます。お見積のご用意にあたり、4点うかがえますでしょうか。", "",
            "・会場はお決まりでしょうか（未定の場合、候補地だけでも）",
            "・配信先はYouTubeでしょうか、限定公開でしょうか",
            "・ご登壇者は何名を想定されていますか",
            "・ご予算の目安はございますか", "",
            "11/14（土）につきましては、用賀 STUDIO A を仮で押さえております。",
            "8/7（金）までにお見積をお出しできるよう進めます。",
          ] },
        { kind: "電話", icon: "phone", to: "鈴木 健一 様（ジャパンネット株式会社）", subject: "確認したいこと（通話メモ用）",
          note: "電話のときは、この順で聞けば漏れません",
          body: [
            "・通訳は何言語ですか（英語のみ／他にもありますか）",
            "・去年と同じ会場を想定されていますか",
            "・6月のどのあたりを考えていますか（上旬・中旬・下旬）",
            "・概算はいつまでに必要ですか（役員会の日程）",
          ] },
      ],

      inVerdict: [
        { key: "yes", label: "案件にする", desc: "日程か見積が動いた", icon: "folder-plus", primary: true },
        { key: "ask", label: "聞いてから決める", desc: "足りないことを尋ねる", icon: "send", primary: false },
        { key: "keep", label: "ネタのまま置く", desc: "動いたら知らせます", icon: "clock", primary: false },
        { key: "drop", label: "見送りにする", desc: "追いかけません", icon: "x-circle", primary: false },
      ],


      inRules: [
        { head: "AIは下書きまで", body: "文面も概算も、AIは書くだけです。送るのも登録するのも押した人。誰が押したかは記録に残ります。" },
        { head: "確信度を必ず出す", body: "高・中・低の3つ。低いものは黄色で、確かめないと次に進めない印を付けます。" },
        { head: "会社は新規で作らない", body: "似た名前があれば既存のお客様に寄せます。新規で作るのは、人が「別会社です」と選んだときだけ。" },
        { head: "ネタのままでも置ける", body: "内容が薄い引き合いを無理に案件にしません。日程か見積が動いたときだけ案件に変えます。" },,
        { head: "受付した人＝案件にした人", body: "「案件にする」を押した人が、その案件の受付者として記録されます。担当を決めるためではなく、あとで経緯を聞けるようにするためです。" },
        { head: "元の文面は消さない", body: "メール本文も文字起こしも、そのまま「やり取りの記録」に残します。解析はあくまで上に載る解釈です。" },
      ],

      inDecisions: [
        { q: "ネタと案件を分けるか", a: "分ける",
          detail: "引き合いはまずネタ。日程か見積が動いたときに案件に変えます。ネタは案件一覧には出しません。" },
        { q: "個人宛メールも取り込むか", a: "取り込む",
          detail: "info@ / sales@ に加えて担当者宛も対象。ただし入口に関係なく、最初は必ずネタです。" },
        { q: "ネタの重複をどう防ぐか", a: "自動で束ねる",
          detail: "会社・担当者・件名・日程が重なれば同じ引き合いに追記します（新しいネタを立てません）。" },
        { q: "同じ会社の別件は", a: "分ける合図を出す",
          detail: "束ねたあとでも、日程や内容が違えば「別件かもしれません」と出し、1押しで分けられます。" },
        { q: "仮押さえの期限", a: "日程の1か月前",
          detail: "押さえた日からの日数ではなく、イベント日の1か月前が期限。近づくとトップに出ます。" },
        { q: "概算見積はAIが金額まで出すか", a: "出す（社内用）",
          detail: "料金表と似た案件から金額を入れて出します。人が再整理してからでないと送れません。" },
        { q: "電話の文字起こし", a: "通話後に貼る",
          detail: "リアルタイムの読み取りはやりません。通話が終わってから貼る1手だけです。" },
      ],

      pmKpisAll: [
        { label: "進行中の案件", n: "58", unit: "件", sub: "今週動いたもの 21件", fg: "#1a1d24", icon: "folder-kanban", iconBg: "#eaf4fb", iconFg: "#005bac" },
        { label: "今週の実施", n: "11", unit: "件", sub: "本番7件・リハ4件", fg: "#1a1d24", icon: "calendar-check", iconBg: "#f5f3ff", iconFg: "#6d28d9" },
        { label: "見積の返事待ち", n: "19", unit: "件", sub: "合計 ¥24,600,000", fg: "#1a1d24", icon: "receipt", iconBg: "#e7f6ee", iconFg: "#197a4b" },
        { label: "今月の受注", n: "38,900", unit: "千円", sub: "目標に対して 104%", fg: "#1a1d24", icon: "trending-up", iconBg: "#effcf7", iconFg: "#0f766e" },
        { label: "止まっている案件", n: "9", unit: "件", sub: "7日以上動いていません", fg: "#c7243a", icon: "alert-triangle", iconBg: "#fef6f7", iconFg: "#c7243a" },
      ],

      pmAll: [
        { name: "60周年 記念式典 配信・収録", cust: "ミナトデジタル", stage: "B 口頭決定", bg: "#eaf4fb", fg: "#005bac", when: "10/17", task: "寺井：見積を送る", taskFg: "#c7243a" },
        { name: "夏フェス 中継（3日間）", cust: "ライトウェーブ音響", stage: "A 受注済", bg: "#e7f6ee", fg: "#197a4b", when: "08/22", task: "大森：機材を押さえる", taskFg: "#c7243a" },
        { name: "新商品発表会 ライブ配信", cust: "ヒカリ食品", stage: "C 見積提案", bg: "#eaf4fb", fg: "#005bac", when: "09/05", task: "佐々木：追いかける", taskFg: "#5d6470" },
        { name: "株主総会 ライブ配信", cust: "ジャパンネット", stage: "A 受注済", bg: "#e7f6ee", fg: "#197a4b", when: "09/26", task: "寺井：申込書をもらう", taskFg: "#c7243a" },
        { name: "社内表彰式 収録", cust: "サンリバーホールディングス", stage: "D 仮押さえ", bg: "#f2f4f7", fg: "#5d6470", when: "11/12", task: "— 誰のタスクもありません", taskFg: "#9aa1ab" },
      ],

      inDetails: [
        { kind: "メール", by: "自動取り込み（MCP）", byWho: "最初に開いたのは 寺井 赳博", byWhen: "07/31 08:12 受信 → 08:20 開封", subj: "記念式典のライブ配信について", from: "宮田 里香 様（株式会社ミナトデジタル）", meta: "今日 08:12 ・ info@ 宛", att: "式典_進行案.xlsx",
          body: [
            { t: "株式会社GMOグローバルスタジオ 御中", muted: true },
            { t: "お世話になっております。ミナトデジタルの宮田です。", muted: false },
            { t: "弊社周年の記念式典につき、ライブ配信と収録をお願いできないかとご連絡しました。", muted: false },
            { t: "日程は 11/14（土）を第一希望として、他に2案ございます。規模は150名ほどを見込んでいます。", hl: true, muted: false },
            { t: "会場はこれから探す段階です。スタジオをお借りできる場合の資料もいただけますと幸いです。", muted: false },
            { t: "お見積を 8/7（金）までにいただけますでしょうか。", hl: true, muted: false },
            { t: "——— 株式会社ミナトデジタル 広報部 宮田 里香", muted: true },
          ],
          extract: [
            { field: "お客様", value: "株式会社ミナトデジタル", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "署名" },
            { field: "ご担当", value: "宮田 里香 様 ／ 広報部", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "署名" },
            { field: "実施日", value: "2026/11/14（土）ほか2案", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "本文" },
            { field: "会場・スタジオ", value: "未定（都内）", conf: "低", bg: "#fef6f7", fg: "#b91c1c", src: "推測" },
            { field: "規模", value: "150名", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "本文" },
            { field: "やりたいこと", value: "式典のライブ配信と収録", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "本文" },
            { field: "予算", value: "記載なし", conf: "—", bg: "#f2f4f7", fg: "#5d6470", src: "—" },
            { field: "返事の期限", value: "8/7（金）まで", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "本文" },
            { field: "求められているもの", value: "見積 ・ スタジオ資料", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "本文" },
          ],
          unknowns: [
            { q: "会場はどこですか（未定なら候補も）", why: "移動と機材の見積が変わります" },
            { q: "配信先はYouTubeですか、限定公開ですか", why: "回線と演出の構成が変わります" },
            { q: "登壇者は何名ですか", why: "マイクとカメラの台数に直結します" },
            { q: "予算の目安はありますか", why: "概算を出す幅を決められます" },
          ],
          suggest: [
            { icon: "calendar-plus", label: "11/14 の用賀 STUDIO A を仮押さえ", why: "同規模の式典で使っている部屋。いまは空いています", cta: "仮押さえる" },
            { icon: "copy", label: "似た案件から概算見積を作成", why: "配信＋収録・150名・2カメ。金額まで入れて出します", cta: "概算をつくる" },
            { icon: "send", label: "スタジオ資料セットを送る", why: "会社案内・用賀STUDIO・機材リストの3点", cta: "送付をタスクに" },
          ],
          split: "「社内研修の収録」は日程もやりたいことも違います。分けておくと、あとで数えやすくなります。" },

        { kind: "電話", by: "寺井 赳博 が受けました", byWho: "文字起こしを貼ったのも 寺井 赳博", byWhen: "07/31 09:40 通話 → 10:05 貼付", subj: "来年の株主総会について（電話メモ）", from: "鈴木 健一 様（ジャパンネット株式会社）", meta: "今日 09:40 ・ 電話", att: "",
          body: [
            { t: "＜通話の文字起こし＞", muted: true },
            { t: "来年の株主総会をまたお願いしたい。時期は6月の予定だが、日程はまだ決まっていない。", hl: true, muted: false },
            { t: "去年と同じ形でよいが、今年は海外の株主向けに英語の同時通訳も入れたい。", hl: true, muted: false },
            { t: "まずは相場が知りたい。正式な見積は日程が決まってからで構わない。", muted: false },
            { t: "決裁は9月の役員会。それまでに概算がほしい。", muted: false },
          ],
          extract: [
            { field: "お客様", value: "ジャパンネット株式会社", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "既存" },
            { field: "ご担当", value: "鈴木 健一 様", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "既存" },
            { field: "実施日", value: "2027年6月ごろ（未定）", conf: "低", bg: "#fef6f7", fg: "#b91c1c", src: "通話" },
            { field: "やりたいこと", value: "株主総会の配信＋英語の同時通訳", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "通話" },
            { field: "予算", value: "相場を知りたい段階", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "通話" },
            { field: "返事の期限", value: "9月の役員会まで", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "通話" },
          ],
          unknowns: [
            { q: "通訳は何言語ですか", why: "回線と人の手配が変わります" },
            { q: "去年と同じ会場ですか", why: "下見の要否が決まります" },
          ],
          suggest: [
            { icon: "history", label: "去年の「株主総会 ライブ配信」を開く", why: "同じお客様。構成と金額をそのまま参考にできます", cta: "ひらく" },
            { icon: "copy", label: "去年の実績から概算をつくる", why: "通訳ぶんを足した金額で出します", cta: "概算をつくる" },
            { icon: "languages", label: "翻訳チームに相談する", why: "英語の同時通訳は別サイトの手配が要ります", cta: "相談をタスクに" },
          ],
          split: "" },

        { kind: "メール", by: "自動取り込み（MCP）", byWho: "最初に開いたのは 佐々木 遙", byWhen: "07/30 17:05 受信 → 17:22 開封", subj: "Re: 秋のブランド発表会の件", from: "井上 翔太 様（株式会社アオゾラ物流）", meta: "昨日 17:05 ・ 寺井宛", att: "",
          body: [
            { t: "いつもお世話になっております。アオゾラ物流の井上です。", muted: false },
            { t: "先日ご相談した発表会ですが、会場が「品川フロントホール」に決まりました。", hl: true, muted: false },
            { t: "それと別件で、社内研修の収録も相談したいと考えています。こちらは時期未定です。", hl: true, muted: false },
          ],
          extract: [
            { field: "お客様", value: "株式会社アオゾラ物流", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "既存" },
            { field: "ご担当", value: "井上 翔太 様", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "既存" },
            { field: "束ね先", value: "秋のブランド発表会（既存のネタ）", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "スレッド" },
            { field: "会場・スタジオ", value: "品川フロントホール（確定）", conf: "高", bg: "#e7f6ee", fg: "#197a4b", src: "本文" },
            { field: "別件の可能性", value: "社内研修の収録（時期未定）", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "本文" },
          ],
          unknowns: [
            { q: "研修の収録は何回ぶんですか", why: "1本か通年かで規模が変わります" },
          ],
          suggest: [
            { icon: "git-branch", label: "「社内研修の収録」を別のネタに分ける", why: "日程もやりたいことも違います", cta: "分ける" },
            { icon: "map-pin", label: "会場を案件に反映する", why: "品川フロントホール。下見のタスクも作れます", cta: "反映する" },
          ],
          split: "研修の収録は、この発表会とは別の案件になりそうです。" },

        { kind: "その他", by: "大森 亮 が受けました", byWho: "展示会のブースで対応", byWhen: "07/29 14:30 面談 → 07/29 19:40 貼付", subj: "展示会で名刺交換（メモ）", from: "ケイアイフーズ株式会社", meta: "7/29 ・ 入手経路 展示会", att: "",
          body: [
            { t: "＜担当者のメモ＞", muted: true },
            { t: "ブースに立ち寄られ、「配信を検討中」とだけ伺いました。担当部署も規模も未確認です。", hl: true, muted: false },
            { t: "名刺は総務部の方。決裁者かどうかは分かりません。", muted: false },
          ],
          extract: [
            { field: "お客様", value: "ケイアイフーズ株式会社", conf: "中", bg: "#fffbeb", fg: "#92400e", src: "名刺" },
            { field: "ご担当", value: "総務部（氏名は名刺のみ）", conf: "低", bg: "#fef6f7", fg: "#b91c1c", src: "名刺" },
            { field: "やりたいこと", value: "配信を検討中（内容不明）", conf: "低", bg: "#fef6f7", fg: "#b91c1c", src: "メモ" },
          ],
          unknowns: [
            { q: "何を配信したいのですか", why: "話を進める入口になります" },
            { q: "時期の目安はありますか", why: "追いかける間隔を決められます" },
            { q: "決裁される方はどなたですか", why: "見積の出し先が変わります" },
          ],
          suggest: [
            { icon: "send", label: "お礼と会社案内を送る", why: "展示会から2日以内が目安です", cta: "送付をタスクに" },
            { icon: "clock", label: "2週間後に思い出す", why: "動きがなければ、そこで見送りにします", cta: "リマインドする" },
          ],
          split: "" },
      ],

      inDedupe: [
        { key: "会社", how: "署名・ドメイン・電話番号から同定", weight: "必須" },
        { key: "担当者", how: "メールアドレスが一致すれば同一人物", weight: "強い" },
        { key: "件名・スレッド", how: "Re: の連なりは同じ引き合い", weight: "強い" },
        { key: "イベント日", how: "日程が違えば別件の候補", weight: "分ける側" },
        { key: "やりたいこと", how: "配信と収録で内容が別なら別件の候補", weight: "分ける側" },
      ],

      inIntakeActions: [
        { key: "mail", label: "メールから取り込む", sub: "MCPが自動で取り込み済み", subIcon: "zap", icon: "mail", n: "4", primary: true },
        { key: "paste", label: "電話・打合せを取り込む", sub: "貼るか、その場で録音する", subIcon: "sparkles", icon: "phone", n: "", primary: false },
        { key: "manual", label: "手で登録する", sub: "内容が分かっているとき", subIcon: "pencil", icon: "folder-plus", n: "", primary: false },
      ],

      inMailQueue: [
        { idx: 0, cust: "株式会社ミナトデジタル", person: "宮田 里香 様", subj: "記念式典のライブ配信について", to: "info@", when: "今日 08:12",
          gist: "11/14（土）ほか2案 ・ 150名 ・ 配信＋収録 ・ 見積と資料希望",
          conf: "高", cBg: "#e7f6ee", cFg: "#197a4b", state: "新しいネタ", sBg: "#eaf4fb", sFg: "#005bac", att: "1", warn: "" },
        { idx: 1, cust: "ジャパンネット株式会社", person: "鈴木 健一 様", subj: "来年の株主総会について（電話メモ）", to: "電話", when: "今日 09:40",
          gist: "2027年6ごろ ・ 日程未定 ・ 英語の同時通訳を追加したい ・ まず相場が知りたい",
          conf: "中", cBg: "#fffbeb", cFg: "#92400e", state: "新しいネタ", sBg: "#eaf4fb", sFg: "#005bac", att: "", warn: "" },
        { idx: 2, cust: "株式会社アオゾラ物流", person: "井上 翔太 様", subj: "Re: 秋のブランド発表会の件", to: "寺井", when: "昨日 17:05",
          gist: "会場が品川フロントホールに決定 ・ 別件で社内研修の収録も相談したい",
          conf: "高", cBg: "#e7f6ee", cFg: "#197a4b", state: "束ねました", sBg: "#f2f4f7", sFg: "#5d6470", att: "", warn: "別件かも" },
        { idx: 3, cust: "ケイアイフーズ株式会社", person: "総務部（名刺のみ）", subj: "展示会で名刺交換（メモ）", to: "展示会", when: "7/29",
          gist: "「配信を検討中」とだけ ・ 部署も規模も未確認",
          conf: "低", cBg: "#fef6f7", cFg: "#b91c1c", state: "要確認", sBg: "#fef6f7", sFg: "#b91c1c", att: "", warn: "" },
      ],

      recvOptions: [
        { key: "A", name: "独立ページを持つ", where: "左メニューに「ご依頼の受付」",
          good: ["未処理が1か所に集まる", "解析・束ね・分岐を専用UIで置ける", "受付だけを担当する人に渡しやすい"],
          bad: ["画面が1つ増える", "案件一覧と役割が近く、どちらを開くか迷う", "毎日ここを開く人は限られる"],
          fit: "受付を担当する人が決まっている場合", pick: false },
        { key: "B", name: "ダッシュボードの中だけで完結", where: "案件受付ゾーン＋開くと全画面",
          good: ["入口が1つ。開いた最初の画面で気づける", "画面数が増えない", "受付は「作業」ではなく「今日の仕事」の一部として扱える"],
          bad: ["ネタが多い日は一覧性が足りない", "過去のネタを探しにくい", "ダッシュボードが重くなりやすい"],
          fit: "1日あたり数件〜十数件の規模", pick: true },
        { key: "C", name: "案件一覧のタブにする", where: "一覧の「ネタ」タブ（ヨミE）",
          good: ["案件とネタを同じ物差しで並べられる", "絞り込み・並べ替えをそのまま使える", "新しい画面を作らない"],
          bad: ["ネタ特有の項目（確信度・束ね）が一覧に馴染まない", "案件一覧のノイズが増える", "「まだ案件じゃない」感が薄れる"],
          fit: "ネタをそのまま案件として数えたい場合", pick: false },
        { key: "D", name: "やり取りの記録に置く", where: "受信箱の中の未処理",
          good: ["元の文面と同じ場所で完結する", "メール中心の運用と相性が良い"],
          bad: ["電話・対面が主役になれない", "「案件を起こす」動作が奥に入る", "営業以外には縁遠い画面になる"],
          fit: "ほぼメールだけで受けている場合", pick: false },
      ],

      recvCriteria: [
        { q: "毎日開くか", a: "開かない。ネタは1日 数件です", lean: "B" },
        { q: "誰が見るか", a: "受けた本人＋営業。専任はいません", lean: "B" },
        { q: "取りこぼしが怖いか", a: "怖い。未処理の件数はどこかに常時出したい", lean: "B / A" },
        { q: "過去のネタを探すか", a: "たまに探す。失注の理由も見たい", lean: "C" },
        { q: "画面を増やしたいか", a: "増やしたくない（v4の方針）", lean: "B / C" },
        { q: "ネタ特有の操作", a: "確信度の直し・束ね・別件分け が要る", lean: "A" },
      ],

      recvPlan: [
        { step: "気づく", where: "トップページ ／ 案件管理ダッシュボード", detail: "「案件受付」ゾーンに未処理の件数。ベルにも出します。" },
        { step: "確かめる", where: "全画面のビュー（メニューには出しません）", detail: "いまの3ペインをそのまま使います。閉じると元の画面に戻ります。" },
        { step: "探す", where: "案件一覧の「ネタ」タブ", detail: "過去のネタ・見送りはここ。専用の一覧は作りません。" },
      ],

      inPasteKinds: [
        { label: "電話", icon: "phone", on: true },
        { label: "問い合わせフォーム", icon: "globe", on: false },
        { label: "対面・打合せ", icon: "users", on: false },
        { label: "展示会・名刺", icon: "id-card", on: false },
        { label: "紹介", icon: "share-2", on: false },
        { label: "チャット", icon: "message-circle", on: false },
      ],

      inPasteText: "宮田様からお電話。11月の記念式典でライブ配信を考えているとのこと。日程は11/14を第一希望。会場は未定で、スタジオも検討したい。150名規模。見積は8/7までに欲しいとのこと。担当は広報部の宮田様。",

      // 項目名は手で登録するフォームと完全に揃えます
      inManualFields: [
        { label: "お客様", value: "株式会社ミナトデジタル", icon: "building-2", req: true, hint: "既存から選びます。無ければ新しくつくります", w: "half" },
        { label: "ご担当", value: "宮田 里香 様（広報部）", icon: "user", req: false, hint: "", w: "half" },
        { label: "案件名", value: "周年記念式典 配信・収録", icon: "folder-kanban", req: true, hint: "あとから変えられます", w: "full" },
        { label: "案件の種類", value: "LIVE ／ ハイブリッドイベント", icon: "clapperboard", req: true, hint: "標準工程がこれで決まります", w: "half" },
        { label: "継続区分", value: "単発", icon: "repeat", req: true, hint: "レギュラーならエピソード管理になります", w: "half" },
        { label: "ステージ", value: "D 仮押さえ", icon: "flag", req: true, hint: "あとから変えられます", w: "half" },
        { label: "実施日", value: "2026/11/14（土）", icon: "calendar-days", req: false, hint: "未定のままでも登録できます", w: "half" },
        { label: "会場・スタジオ", value: "用賀／WORLD STUDIO（仮）", icon: "map-pin", req: false, hint: "下で選べます", w: "half" },
        { label: "規模", value: "150名", icon: "users", req: false, hint: "", w: "half" },
        { label: "やりたいこと", value: "式典のライブ配信と収録", icon: "clipboard-list", req: false, hint: "", w: "half" },
        { label: "予算", value: "（未記入）", icon: "receipt", req: false, hint: "見積を作成と金額は自動で入ります", w: "half" },
        { label: "返事の期限", value: "（未記入）", icon: "clock", req: false, hint: "", w: "half" },
        { label: "求められているもの", value: "（未記入）", icon: "inbox", req: false, hint: "見積・資料など", w: "half" },
        { label: "入手経路", value: "直接のご依頼", icon: "share-2", req: false, hint: "あとで集計します", w: "half" },
        { label: "最初のタスク", value: "寺井：見積を送る（8/7まで）", icon: "list-checks", req: false, hint: "あとで足せます", w: "half" },
        { label: "メモ", value: "会場はこれから探すとのこと。", icon: "align-left", req: false, hint: "", w: "full" },
      ],

      inInbox: [
        { cust: "株式会社ミナトデジタル", person: "宮田 里香 様", ch: "メール", icon: "mail", when: "今日 08:12",
          gist: "周年式典の配信と収録。見積とスタジオ資料が欲しい", conf: "高", cBg: "#e7f6ee", cFg: "#197a4b",
          state: "未処理", sBg: "#fef6f7", sFg: "#b91c1c", warn: "", active: true },
        { cust: "ジャパンネット株式会社", person: "鈴木 健一 様", ch: "電話", icon: "phone", when: "今日 09:40",
          gist: "来年の株主総会。日程は未定。まず相場が知りたい", conf: "中", cBg: "#fffbeb", cFg: "#92400e",
          state: "未処理", sBg: "#fef6f7", sFg: "#b91c1c", warn: "", active: false },
        { cust: "株式会社アオゾラ物流", person: "井上 翔太 様", ch: "メール", icon: "mail", when: "昨日 17:05",
          gist: "会場が決まったという続報。別に社内研修の収録も相談したい", conf: "高", cBg: "#e7f6ee", cFg: "#197a4b",
          state: "束ねた", sBg: "#eaf4fb", sFg: "#005bac", warn: "別件かも", active: false },
        { cust: "ケイアイフーズ株式会社", person: "（名前なし）", ch: "その他", icon: "message-square", when: "7/29",
          gist: "展示会で名刺交換。「配信を検討中」とだけ", conf: "低", cBg: "#fef6f7", cFg: "#b91c1c",
          state: "未処理", sBg: "#fef6f7", sFg: "#b91c1c", warn: "", active: false },
      ],

      inSteps: [
        { n: "1", label: "入れる", sub: "メールは自動、電話・その他は貼る" },
        { n: "2", label: "確かめる", sub: "読み取りを直し、聞くことを決める" },
        { n: "3", label: "案件にする", sub: "日程か見積が動いたら" },
      ],

      inMailBody: [
        { t: "株式会社GMOグローバルスタジオ 御中", muted: true },
        { t: "お世話になっております。ミナトデジタルの宮田です。", muted: false },
        { t: "弊社周年の記念式典につき、ライブ配信と収録をお願いできないかとご連絡しました。", muted: false },
        { t: "日程は 11/14（土）を第一希望として、他に2案ございます。規模は150名ほどを見込んでいます。", hl: true, muted: false },
        { t: "会場はこれから探す段階です。スタジオをお借りできる場合の資料もいただけますと幸いです。", muted: false },
        { t: "お見積を 8/7（金）までにいただけますでしょうか。", hl: true, muted: false },
        { t: "何卒よろしくお願いいたします。", muted: false },
        { t: "——— 株式会社ミナトデジタル 広報部 宮田 里香", muted: true },
      ],

      inUnknowns: [
        { q: "会場はどこですか（未定なら候補も）", why: "移動と機材の見積が変わります" },
        { q: "配信先はYouTubeですか、限定公開ですか", why: "回線と演出の構成が変わります" },
        { q: "登壇者は何名ですか", why: "マイクとカメラの台数に直結します" },
        { q: "予算の目安はありますか", why: "概算を出す幅を決められます" },
      ],

      navMobileTabs: [
        { label: "ホーム", icon: "home", what: "アプリの一覧と、自分の今日" },
        { label: "やること", icon: "user-check", what: "自分のタスクと依頼だけ" },
        { label: "検索", icon: "search", what: "⌘K のスマホ版（打たずに選べる）" },
      ],

      banDays: [
        { label: "前日 2/13", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "当日 2/14", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "翌日 撤収", bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      banPalette: [
        { label: "設営", dot: "#5d6470", bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "リハーサル", dot: "#f0a000", bg: "#fffbeb", fg: "#92400e", bd: "#fde68a" },
        { label: "本番", dot: "#c7243a", bg: "#fef2f2", fg: "#b91c1c", bd: "#f6cdd2" },
        { label: "休憩", dot: "#b6bcc4", bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "客入れ・客出し", dot: "#0d9488", bg: "#f0fdfa", fg: "#0f766e", bd: "#99f6e4" },
        { label: "移動", dot: "#2563eb", bg: "#eff6ff", fg: "#1d4ed8", bd: "#bfdbfe" },
        { label: "撤収", dot: "#5d6470", bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
      ],

      banHours: ["8:00", "9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"],

      banLanes: [
        { name: "表彰式 会場", sub: "WORLD STUDIO", bg: "#fff",
          blocks: [
            { time: "10:00-12:00", label: "機材立ち上げ", top: "176px", h: "169px", edge: "#5d6470", bg: "#f7f8fa", fg: "#3c424c", timeFg: "#5d6470" },
            { time: "14:30-16:30", label: "表彰式 本番", top: "572px", h: "176px", edge: "#c7243a", bg: "#fef2f2", fg: "#b91c1c", timeFg: "#b91c1c" },
            { time: "17:25-19:00", label: "祝賀会 本番", top: "828px", h: "139px", edge: "#c7243a", bg: "#fef2f2", fg: "#b91c1c", timeFg: "#b91c1c" },
          ] },
        { name: "懇親会 会場", sub: "SKY STUDIO", bg: "#fff",
          blocks: [
            { time: "16:30", label: "ケータリング搬入", top: "748px", h: "78px", edge: "#5d6470", bg: "#f7f8fa", fg: "#3c424c", timeFg: "#5d6470" },
            { time: "17:25-18:40", label: "祝賀会", top: "828px", h: "110px", edge: "#c7243a", bg: "#fef2f2", fg: "#b91c1c", timeFg: "#b91c1c" },
          ] },
        { name: "前室", sub: "LOUNGE STUDIO", bg: "#fff",
          blocks: [
            { time: "13:45-14:30", label: "客入れ", top: "506px", h: "66px", edge: "#0d9488", bg: "#f0fdfa", fg: "#0f766e", timeFg: "#0f766e" },
            { time: "18:55-", label: "お見送り", top: "960px", h: "61px", edge: "#0d9488", bg: "#f0fdfa", fg: "#0f766e", timeFg: "#0f766e" },
          ] },
        { name: "社長・副社長", sub: "ホスト", bg: "#fafbfc",
          blocks: [
            { time: "12:30-13:00", label: "流れ確認", top: "396px", h: "44px", edge: "#f0a000", bg: "#fffbeb", fg: "#92400e", timeFg: "#92400e" },
            { time: "13:00-14:20", label: "ご休憩", top: "440px", h: "117px", edge: "#b6bcc4", bg: "#fff", fg: "#3c424c", timeFg: "#5d6470" },
          ] },
        { name: "受賞者", sub: "ご来場", bg: "#fafbfc",
          blocks: [
            { time: "12:35-13:30", label: "バスで移動", top: "404px", h: "81px", edge: "#2563eb", bg: "#eff6ff", fg: "#1d4ed8", timeFg: "#1d4ed8" },
            { time: "13:30-14:20", label: "誘導・待機", top: "486px", h: "73px", edge: "#0d9488", bg: "#f0fdfa", fg: "#0f766e", timeFg: "#0f766e" },
          ] },
        { name: "MC", sub: "司会", bg: "#fafbfc",
          blocks: [
            { time: "10:30-", label: "進行説明", top: "220px", h: "68px", edge: "#f0a000", bg: "#fffbeb", fg: "#92400e", timeFg: "#92400e" },
            { time: "11:00-12:00", label: "登壇リハ", top: "264px", h: "88px", edge: "#f0a000", bg: "#fffbeb", fg: "#92400e", timeFg: "#92400e" },
          ] },
        { name: "テクニカル", sub: "映像・音響・照明", bg: "#fafbfc",
          blocks: [
            { time: "13:00-13:30", label: "接続チェック", top: "440px", h: "44px", edge: "#5d6470", bg: "#f7f8fa", fg: "#3c424c", timeFg: "#5d6470" },
            { time: "13:45", label: "オールスタンバイ", top: "506px", h: "44px", edge: "#c7243a", bg: "#fef2f2", fg: "#b91c1c", timeFg: "#b91c1c" },
            { time: "19:30-20:30", label: "撤収", top: "1004px", h: "88px", edge: "#5d6470", bg: "#f7f8fa", fg: "#3c424c", timeFg: "#5d6470" },
          ] },
      ],

      banSources: [
        { from: "案件の日程", to: "本番日・リハ日・飛び日から、その日の枠を用意します", icon: "calendar" },
        { from: "スタジオの予約", to: "部屋のレーンと、押さえている時間が入ります", icon: "calendar-days" },
        { from: "Qシート", to: "本番の中の進行（開場・オープニング・表彰…）が入ります", icon: "file-text" },
        { from: "機材の貸出", to: "出庫・返却の時刻が入ります", icon: "package" },
        { from: "案件メンバーとパートナー", to: "人のレーンになります。名前は1か所で直します", icon: "users" },
      ],

      banToTimer: [
        { label: "表彰式 本番", len: "2:00:00" },
        { label: "祝賀会 本番", len: "1:35:00" },
        { label: "休憩（幕間）", len: "0:15:00" },
      ],

      banWarnings: [
        "同じ人が2か所に置かれている（14:30の受賞者誘導と受賞物対応）",
        "本番の枠がQシートの合計尺より 10分短い",
        "撤収が完全退館の時刻をまたいでいる（20:00）",
      ],

      banLaneChips: [
        { label: "会場（3）", bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "ホスト", bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "受賞者", bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "MC", bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "テクニカル", bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "運営", bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "オンライン登壇", bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "美術", bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "ケータリング", bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "バス", bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
      ],

      manualParts: [
        { label: "表紙・改訂履歴", src: "P1", icon: "book", bg: "#eaf4fb", fg: "#005bac", bd: "#e6e9ed",
          what: "案件名・実施日・版数・更新日。第何版で何を変えたかを残します。", auto: "自動：案件名・日付・版数", autoFg: "#005bac" },
        { label: "当日の連絡先", src: "P29-30", icon: "phone", bg: "#eaf4fb", fg: "#005bac", bd: "#e6e9ed",
          what: "誰に何を聞くか。社外に出す版では携帯番号を隠します。", auto: "自動：スタッフ表から", autoFg: "#005bac" },
        { label: "スタッフ表", src: "P8", icon: "users", bg: "#eaf4fb", fg: "#005bac", bd: "#e6e9ed",
          what: "所属・役割区分・氏名・業務内容・シーバー（無線）の割り当て。", auto: "自動：案件メンバーとパートナー", autoFg: "#005bac" },
        { label: "香盤表", src: "P9-10", icon: "table-2", bg: "#eaf4fb", fg: "#005bac", bd: "#e6e9ed",
          what: "前日・当日・撤収。縦が時間、横が人と部屋。", auto: "自動：25章でつくったもの", autoFg: "#005bac" },
        { label: "進行表", src: "P12-13", icon: "list-ordered", bg: "#eaf4fb", fg: "#005bac", bd: "#e6e9ed",
          what: "TIME・尺・項目・出演者・備考・使う素材。表彰式と祝賀会で分けます。", auto: "自動：Qシートから", autoFg: "#005bac" },
        { label: "会場図・動線", src: "P11", icon: "map", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed",
          what: "フロアごとの部屋の位置と、来場者・搬入の動線。", auto: "手で描く（平面図はBoxから）", autoFg: "#5d6470" },
        { label: "配置図", src: "P14-22", icon: "map-pin", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed",
          what: "場面ごとの人と物の位置。記号はスタッフ表から引きます。", auto: "半自動：記号と凡例", autoFg: "#005bac" },
        { label: "セット・美術", src: "P5-7", icon: "layout-template", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed",
          what: "ステージの絵、LEDの寸法、備品の置き場所（お水・トロフィー）。", auto: "手で入れる（画像）", autoFg: "#5d6470" },
        { label: "受賞者・登壇者一覧", src: "P28", icon: "trophy", bg: "#f5f3ff", fg: "#6d28d9", bd: "#ddd6fe",
          what: "氏名・所属・賞・登壇の順番・読み。リアルタイムCGと同じ名簿を使います。", auto: "自動：CGのノミネートから", autoFg: "#6d28d9" },
        { label: "テクニカル", src: "—", icon: "wrench", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed",
          what: "カメラ割り・音声・回線・配信の仕様。", auto: "自動：技術資料（17章）から", autoFg: "#005bac" },
        { label: "ケータリング・備品", src: "P25", icon: "utensils", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed",
          what: "食事の内容と搬入時刻、ノベルティ・記念品の数。", auto: "手で入れる", autoFg: "#5d6470" },
        { label: "緊急時の動き", src: "—", icon: "shield-alert", bg: "#fffbeb", fg: "#b45309", bd: "#fde68a",
          what: "地震・停電・体調不良・配信が落ちたとき。会場ごとに定型があります。", auto: "定型から入れる", autoFg: "#005bac" },
      ],

      manualDropped: [
        { what: "凡例だけのページ（P4・P23）", why: "図の中に凡例を入れるので、独立したページを作りません" },
        { what: "「更新中」のまま出ていたページ", why: "できていない部品として一覧に残し、白紙のページは作りません" },
        { what: "写真だけの見開き（P24・P26-27）", why: "イメージ共有は部品ではなく、案件の書類（Box）に置きます" },
      ],

      manualToc: [
        { label: "表紙・改訂履歴", pages: "1", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", warn: false },
        { label: "当日の連絡先", pages: "2", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", warn: false },
        { label: "スタッフ表", pages: "3", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", warn: false },
        { label: "香盤表（前日・当日）", pages: "4-6", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", warn: false },
        { label: "会場図・動線", pages: "7", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", warn: false },
        { label: "進行表", pages: "8-11", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", warn: false },
        { label: "配置図（4場面）", pages: "12-19", bg: "#fffbeb", bd: "#fde68a", fg: "#92400e", warn: true },
        { label: "テクニカル", pages: "20-22", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", warn: false },
        { label: "緊急時の動き", pages: "23-24", bg: "#fffbeb", bd: "#fde68a", fg: "#92400e", warn: true },
      ],

      manualPages: [
        { no: "1", label: "表紙", bd: "1px solid #e6e9ed", thumbBg: "#f4faff", line: "#a6ceeb", body: "#eaf4fb", fg: "#1a1d24", warn: false },
        { no: "2", label: "連絡先", bd: "1px solid #e6e9ed", thumbBg: "#fff", line: "#cbd2da", body: "#f7f8fa", fg: "#1a1d24", warn: false },
        { no: "3", label: "スタッフ表", bd: "1px solid #e6e9ed", thumbBg: "#fff", line: "#cbd2da", body: "#f2f4f7", fg: "#1a1d24", warn: false },
        { no: "4", label: "香盤（当日）", bd: "1px solid #e6e9ed", thumbBg: "#fff", line: "#cbd2da", body: "#eef0f3", fg: "#1a1d24", warn: false },
        { no: "9", label: "進行表（表彰式）", bd: "1px solid #e6e9ed", thumbBg: "#fff", line: "#cbd2da", body: "#f2f4f7", fg: "#1a1d24", warn: false },
        { no: "13", label: "配置図（本番）", bd: "1.5px solid #fde68a", thumbBg: "#fffbeb", line: "#f0c987", body: "#fef3c7", fg: "#92400e", warn: true },
        { no: "21", label: "テクニカル", bd: "1px solid #e6e9ed", thumbBg: "#fff", line: "#cbd2da", body: "#f2f4f7", fg: "#1a1d24", warn: false },
        { no: "24", label: "緊急時の動き", bd: "1.5px solid #fde68a", thumbBg: "#fffbeb", line: "#f0c987", body: "#fef3c7", fg: "#92400e", warn: true },
      ],

      manualAudience: [
        { label: "社内・パートナー", detail: "全部入り。連絡先と原価も出ます", bg: "#f4faff", bd: "#005bac", fg: "#005bac" },
        { label: "お客様（主催）", detail: "進行と会場図まで。社内レーンと原価を外します", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24" },
        { label: "当日のアルバイト", detail: "自分の担当と動線だけ。3ページに収めます", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24" },
      ],

      manualOutRules: [
        "版数と更新日は表紙に必ず入れます（現場で古い紙が混ざるのを防ぐため）。",
        "各ページの右下に「第3版 2/14」を刷ります。",
        "PDFにした瞬間の中身を残します（あとで部品を直しても、配った版は変わりません）。",
        "できていない部品は、白紙にせず「これから作ります」と印を付けて出せます。",
      ],

      layoutSymbols: [
        { mark: "進", label: "進行", count: "4名", bg: "#eaf4fb", fg: "#005bac", radius: "8px" },
        { mark: "AD", label: "運営AD", count: "3名", bg: "#f5f3ff", fg: "#6d28d9", radius: "8px" },
        { mark: "C", label: "カメラ", count: "3台", bg: "#fef2f2", fg: "#b91c1c", radius: "999px" },
        { mark: "S", label: "受賞者", count: "15名", bg: "#e7f6ee", fg: "#197a4b", radius: "999px" },
        { mark: "D", label: "ホスト・役員", count: "3名", bg: "#fffbeb", fg: "#92400e", radius: "999px" },
        { mark: "T", label: "トロフィー台", count: "2", bg: "#f2f4f7", fg: "#3c424c", radius: "4px" },
      ],

      layoutScenes: [
        { label: "設営", bg: "transparent", fg: "#5d6470" },
        { label: "リハーサル", bg: "transparent", fg: "#5d6470" },
        { label: "本番", bg: "#fff", fg: "#1a1d24" },
        { label: "撤収", bg: "transparent", fg: "#5d6470" },
      ],

      layoutPlaced: [
        { mark: "D", x: "44%", y: "96px", bg: "#fffbeb", fg: "#92400e", radius: "999px" },
        { mark: "D", x: "52%", y: "96px", bg: "#fffbeb", fg: "#92400e", radius: "999px" },
        { mark: "T", x: "62%", y: "98px", bg: "#f2f4f7", fg: "#3c424c", radius: "4px" },
        { mark: "S", x: "30%", y: "160px", bg: "#e7f6ee", fg: "#197a4b", radius: "999px" },
        { mark: "S", x: "38%", y: "160px", bg: "#e7f6ee", fg: "#197a4b", radius: "999px" },
        { mark: "S", x: "46%", y: "160px", bg: "#e7f6ee", fg: "#197a4b", radius: "999px" },
        { mark: "進", x: "18%", y: "204px", bg: "#eaf4fb", fg: "#005bac", radius: "8px" },
        { mark: "AD", x: "72%", y: "204px", bg: "#f5f3ff", fg: "#6d28d9", radius: "8px" },
        { mark: "C", x: "50%", y: "252px", bg: "#fef2f2", fg: "#b91c1c", radius: "999px" },
      ],

      cutVerdicts: [
        { label: "残す", count: "6", icon: "check", fg: "#197a4b", bg: "#e7f6ee", bd: "#d8ecdd",
          rule: "毎日か毎週、その画面を目的にして開く人がいる。レールに置くのはこれだけ。" },
        { label: "統合する", count: "23", icon: "layers", fg: "#005bac", bg: "#eaf4fb", bd: "#cfe4f4",
          rule: "同じデータを別の見方で見ていた。表示切替かタブに降格し、入口を1つにする。" },
        { label: "自動にする", count: "9", icon: "sparkles", fg: "#6d28d9", bg: "#f5f3ff", bd: "#ddd6fe",
          rule: "人が転記していただけ。他の操作の結果として勝手に入る形にする。" },
        { label: "キャンセル", count: "11", icon: "x", fg: "#b91c1c", bg: "#fee2e2", bd: "#f6cdd2",
          rule: "入れる手間だけがかかり、無くても判断が止まらない。入口と入力欄を消す。" },
      ],

      cutRows: [
        { what: "ヨミ・パイプライン", path: "/sales/pipeline", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "案件 ＞ ボード表示", why: "案件一覧と同じ進行中案件を別画面で見ていた" },
        { what: "確定案件（スタジオ／ビジネス）", path: "/sales/projects/confirmed/*", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "案件 ＞ 絞り込み", why: "分類は列の値。画面を分ける理由がない" },
        { what: "カンバン／タスクリスト／ガント", path: "/sales/tasks/{3}", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "タスク ＞ 表示切替", why: "1画面の view 切替がメニュー3行を占めていた" },
        { what: "カレンダー4本", path: "/studio/{4}", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "予定 ＞ レイヤー", why: "同じ枠を見る人が違うだけ。重ねて見たいのが実態" },
        { what: "取引先マスター", path: "/sales/companies", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "お客様 ＞ 請求先", why: "同じ会社の情報を2か所で持っていた" },
        { what: "統合送出コックピット", path: "/awards/cockpit", verdict: "残す", vBg: "#e7f6ee", vFg: "#197a4b", to: "CG ＞ 送出（唯一の画面）", why: "本番はこれ1つにし、単独3画面をキャンセル（逆に統合する）" },
        { what: "ランキング／字幕／クイズの各送出", path: "/awards/{3}control", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "CG ＞ レイヤータブ", why: "本番中に画面を移動させない" },
        { what: "機材ダッシュボード", path: "/equipment/dashboard", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "機材 ＞ オペレーション上部", why: "同じKPIとアラートを2か所に置いていた" },
        { what: "精算PDF／決算CSV／二重計上", path: "/budget/{3}", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "お金 ＞ 取り込む", why: "どれも「取り込む→確認→登録」の同じ流れ" },
        { what: "営業レビュー／報告資料／週次", path: "/sales/review ほか", verdict: "統合", vBg: "#eaf4fb", vFg: "#005bac", to: "ふりかえり ＞ タブ", why: "終わったことを見る画面が3つに分かれていた" },
        { what: "GLS番号の採番（起票時）", path: "案件フォーム", verdict: "自動", vBg: "#f5f3ff", vFg: "#6d28d9", to: "受注が決まった時に採る", why: "先に採ると消えた案件の番号が空く" },
        { what: "案件の稼働メンバー入力", path: "技術資料・Qシート", verdict: "自動", vBg: "#f5f3ff", vFg: "#6d28d9", to: "案件メンバーから引く", why: "同じ名前を3か所に手打ちしていた" },
        { what: "機材の出庫リスト作成", path: "貸出管理", verdict: "自動", vBg: "#f5f3ff", vFg: "#6d28d9", to: "案件の日程から作る", why: "本番日とリハ日が分かれば出し入れは決まる" },
        { what: "イベント実施報告の起票", path: "報告資料", verdict: "自動", vBg: "#f5f3ff", vFg: "#6d28d9", to: "終わった案件から候補を出す", why: "書き忘れの原因は「作る操作」そのもの" },
        { what: "既読にする", path: "通知・受信箱", verdict: "キャンセル", vBg: "#fee2e2", vFg: "#b91c1c", to: "終わったら消える", why: "読んだだけでは何も終わっていない" },
        { what: "トースト（一時表示の通知）", path: "全アプリ", verdict: "キャンセル", vBg: "#fee2e2", vFg: "#b91c1c", to: "消えないお知らせ帯", why: "見ていない瞬間に消えるものは通知にならない" },
      ],

      cutRemoved: [
        { what: "案件種類（その他）の自由記入", why: "選択肢に無いものを書く欄。集計に使えず、同じ意味の言葉が10通り増えた" },
        { what: "タグ（カンマ区切り）", why: "検索でほぼ使われていない。分類はステージと案件分類で足りている" },
        { what: "教訓・学び（失注時）", why: "書く場が失注ダイアログだと誰も読み返さない。ふりかえりのトピックに書く" },
        { what: "所要時間（分）（活動記録）", why: "入力率が低く、集計にも使っていない。記録が面倒になる原因" },
        { what: "略称（会社）", why: "画面のどこにも出ていない。表示は正式名で足りる" },
      ],

      cutMetrics: [
        { label: "レール／サイドバーの項目", before: "60+", after: "6" },
        { label: "アプリ切替の入口", before: "3", after: "1" },
        { label: "案件の入力項目（起票時）", before: "22", after: "3" },
        { label: "本番中に開く画面（CG）", before: "4", after: "1" },
        { label: "1案件を追うために回る場所", before: "7", after: "1" },
      ],

      fieldBuckets: [
        { label: "いま必要", count: "3", icon: "check", fg: "#197a4b", bd: "#d8ecdd", headBg: "#f7fdf9", itemFg: "#1a1d24",
          rule: "起票の瞬間に必ず分かっていること。これ以上増やしません。",
          items: [
            { name: "案件名", note: "「用賀 10月 発表会」のようなメモでも可" },
            { name: "お客様", note: "その場で新規作成できる" },
            { name: "スタジオを使うか", note: "この後に聞く項目が変わる分岐" },
          ] },
        { label: "進んだら聞く", count: "7", icon: "corner-down-right", fg: "#005bac", bd: "#cfe4f4", headBg: "#f8fbfe", itemFg: "#1a1d24",
          rule: "ステージが上がったときに、その場で1〜2問だけ出します。",
          items: [
            { name: "本番日・リハ日", note: "仮押さえのとき" },
            { name: "使用する部屋", note: "仮押さえのとき" },
            { name: "想定金額", note: "見積を作るとき" },
            { name: "追加の日程（飛び日）", note: "複数日になったとき" },
            { name: "申込書・ロゴ使用許諾", note: "受注のとき" },
            { name: "主担当", note: "自分以外に渡すとき" },
            { name: "失注理由", note: "失注にするとき" },
          ] },
        { label: "自動で入る", count: "6", icon: "sparkles", fg: "#6d28d9", bd: "#ddd6fe", headBg: "#faf9ff", itemFg: "#1a1d24",
          rule: "他の操作の結果として入ります。人は確認するだけです。",
          items: [
            { name: "GLS番号", note: "受注にしたとき採番" },
            { name: "案件分類", note: "スタジオを使うかで決まる" },
            { name: "Boxフォルダ", note: "案件を作った時に作成" },
            { name: "登録済みの予約", note: "予定から入る" },
            { name: "次回アクション", note: "やり取りを記録したとき" },
            { name: "案件メンバー", note: "貸出・Qシート・技術資料から引く" },
          ] },
        { label: "キャンセル", count: "3", icon: "x", fg: "#b91c1c", bd: "#f6cdd2", headBg: "#fef7f8", itemFg: "#5d6470",
          rule: "入れる手間だけがかかっていた項目です。",
          items: [
            { name: "案件種類（その他）", note: "同じ意味の言葉が増えるだけ" },
            { name: "タグ", note: "検索に使われていない" },
            { name: "教訓・学び", note: "ふりかえりに書く" },
          ] },
      ],

      intakeKind: [
        { label: "使う", sub: "スタジオ案件", bg: "#f4faff", bd: "#005bac", fg: "#005bac" },
        { label: "使わない", sub: "ビジネス案件（月次の請求など）", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24" },
      ],

      askMatrix: [
        { stage: "ネタ → 仮押さえ", stageBg: "#e0f2fe", stageFg: "#0369a1", field: "本番日 ・ リハ日", req: "必須", reqFg: "#b91c1c", why: "枠を取る操作。日付がないと予約できません", auto: "予約・カレンダー・機材の出し入れの見込み" },
        { stage: "ネタ → 仮押さえ", stageBg: "#e0f2fe", stageFg: "#0369a1", field: "使用する部屋", req: "必須", reqFg: "#b91c1c", why: "同上。空きから選びます", auto: "スタジオ予約（仮）" },
        { stage: "仮押さえ → 見積提案", stageBg: "#eaf4fb", stageFg: "#005bac", field: "想定金額", req: "必須", reqFg: "#b91c1c", why: "見積を作るときに初めて要ります", auto: "粗利の見込み・ヨミの集計" },
        { stage: "仮押さえ → 見積提案", stageBg: "#eaf4fb", stageFg: "#005bac", field: "追加の日程（飛び日）", req: "任意", reqFg: "#5d6470", why: "複数日になったときだけ", auto: "予約が日数ぶん増える" },
        { stage: "見積提案 → 口頭決定", stageBg: "#fef3c7", stageFg: "#92400e", field: "（聞きません）", req: "—", reqFg: "#5d6470", why: "「決まった」と押すだけ", auto: "次回アクション「申込書をもらう」が立つ" },
        { stage: "口頭決定 → 受注", stageBg: "#e7f6ee", stageFg: "#197a4b", field: "申込書", req: "必須", reqFg: "#b91c1c", why: "これが無いと請求できません", auto: "GLS番号の採番・請求のしごとに追加" },
        { stage: "口頭決定 → 受注", stageBg: "#e7f6ee", stageFg: "#197a4b", field: "ロゴ使用許諾", req: "案件による", reqFg: "#b45309", why: "ロゴを出す案件のみ", auto: "書類の棚に反映" },
        { stage: "どこからでも", stageBg: "#f7f8fa", stageFg: "#3c424c", field: "主担当", req: "任意", reqFg: "#5d6470", why: "自分以外に渡すときだけ", auto: "通知の宛先が変わる" },
        { stage: "どこからでも（失注）", stageBg: "#fef6f7", stageFg: "#b91c1c", field: "失注理由", req: "必須（選ぶだけ）", reqFg: "#b91c1c", why: "予算・日程・他社・見送り から選ぶ。自由記入は任意", auto: "ふりかえりの集計に入る" },
      ],

      progressiveAsk: [
        { stage: "ネタ → 仮押さえ", stageBg: "#e0f2fe", stageFg: "#0369a1", stageBd: "#bae6fd", bd: "#e6e9ed", count: "2問",
          ask: "いつ、どの部屋を押さえますか", why: "枠を取る操作なので日付と部屋がないと進みません。押さえた枠は予定に出て、期限が近づくと今日の画面に出ます。", auto: "予約・カレンダー・機材の出し入れの見込み" },
        { stage: "仮押さえ → 見積提案", stageBg: "#eaf4fb", stageFg: "#005bac", stageBd: "#cfe4f4", bd: "#e6e9ed", count: "1問",
          ask: "いくらで出しますか", why: "見積を作るときに初めて金額が要ります。料金表から選べば明細から自動で入ります。", auto: "想定金額・粗利の見込み" },
        { stage: "見積提案 → 口頭決定", stageBg: "#fef3c7", stageFg: "#92400e", stageBd: "#fde68a", bd: "#e6e9ed", count: "0問",
          ask: "聞くことはありません", why: "「決まった」と押すだけ。次のアクション（申込書をもらう）が自動で立ちます。", auto: "次回アクション・期限" },
        { stage: "口頭決定 → 受注", stageBg: "#e7f6ee", stageFg: "#197a4b", stageBd: "#d8ecdd", bd: "#e6e9ed", count: "2つ",
          ask: "申込書とロゴの許諾は揃いましたか", why: "ここが揃わないと請求できません。チェックだけで、書類はBoxに置けば紐づきます。", auto: "GLS番号の採番・請求のしごとに追加" },
        { stage: "どこからでも", stageBg: "#f7f8fa", stageFg: "#3c424c", stageBd: "#e6e9ed", bd: "#f6cdd2", count: "1問",
          ask: "失注：なぜ決まらなかったか", why: "選択肢から選ぶだけ（予算・日程・他社・見送り）。自由記入は任意にします。", auto: "" },
      ],

      progressiveGains: [
        "電話を切った直後に15秒で起票できる。あとで入れ直す前提の空欄が消える。",
        "空欄が「まだ聞いていない」ことを意味するようになる（いまは入れ忘れと区別が付かない）。",
        "必須マークを付ける必要がなくなる。聞く瞬間に聞くので、そもそも空で進めない。",
        "同じ情報を2度打たない。日程は予定から、メンバーは案件から、金額は見積から入る。",
      ],

      toolOldCards: [
        { label: "Qシート", deco: "line-through" },
        { label: "技術資料", deco: "line-through" },
        { label: "計時LIVE", deco: "line-through" },
        { label: "リアルタイムCG", deco: "line-through" },
        { label: "翻訳（外部）", deco: "line-through" },
        { label: "インタラクティブ（外部）", deco: "line-through" },
        { label: "制作支援", deco: "line-through" },
        { label: "素材納品", deco: "line-through" },
      ],

      toolNewTabs: ["Qシート", "香盤表", "技術資料", "機材", "計時LIVE", "CG・翻訳・演出"],

      toolPlacement: [
        { name: "Qシート", icon: "file-text", bg: "#fff1f2", fg: "#e11d48",
          from: "案件 ＞ Qシート", prefilled: "案件名・実施日・場所・登場人物・案件メンバー",
          removed: "Qシートアプリ／ドキュメント一覧／アプリ切替", sandbox: "できる", sbBg: "#f5f3ff", sbFg: "#6d28d9" },
        { name: "香盤表", icon: "table-2", bg: "#f5f3ff", fg: "#6d28d9",
          from: "案件 ＞ 香盤表", prefilled: "当日の時刻・部屋・スタッフ・機材の出し入れ",
          removed: "香盤表の単独メニュー／サイネージの別画面", sandbox: "できる", sbBg: "#f5f3ff", sbFg: "#6d28d9" },
        { name: "技術資料", icon: "wrench", bg: "#ecfeff", fg: "#0891b2",
          from: "案件 ＞ 技術資料", prefilled: "スタッフの役割・貸出機材・部屋",
          removed: "技術資料アプリ／ドキュメント一覧", sandbox: "できる", sbBg: "#f5f3ff", sbFg: "#6d28d9" },
        { name: "計時LIVE", icon: "timer", bg: "#fef2f2", fg: "#ef4444",
          from: "案件 ＞ 予定（本番の行）", prefilled: "本番尺・番組名・配信URL",
          removed: "計時LIVEアプリ／番組一覧の独立メニュー", sandbox: "できる", sbBg: "#f5f3ff", sbFg: "#6d28d9" },
        { name: "リアルタイムCG", icon: "tv", bg: "#fefce8", fg: "#a16207",
          from: "案件 ＞ CG・翻訳・演出", prefilled: "出演者・部門・進行（Qシートから）",
          removed: "リアルタイムCGアプリ／イベント一覧／送出3画面", sandbox: "できる", sbBg: "#f5f3ff", sbFg: "#6d28d9" },
        { name: "翻訳", icon: "languages", bg: "#f0fdf4", fg: "#16a34a",
          from: "案件 ＞ CG・翻訳・演出", prefilled: "案件名・言語（前回の設定を引き継ぐ）",
          removed: "トップの「翻訳」カード／アプリ切替の外部リンク", sandbox: "できる", sbBg: "#f5f3ff", sbFg: "#6d28d9" },
        { name: "インタラクティブ演出", icon: "sparkles", bg: "#fdf2f8", fg: "#db2777",
          from: "案件 ＞ CG・翻訳・演出", prefilled: "イベント名・配信先・参加者の入口URL",
          removed: "トップの「インタラクティブ演出」カード", sandbox: "できる", sbBg: "#f5f3ff", sbFg: "#6d28d9" },
      ],

      toolGoneEntries: [
        "トップの「アプリを起動」（13枚のカード）",
        "ヘッダーのアプリ切替（3×13のグリッド）",
        "各アプリのサイドバー下部「他のアプリ」",
        "道具ごとのドキュメント一覧・イベント一覧",
      ],

      toolDeferred: [
        { name: "制作支援", why: "スケジュールとスタッフ配置。予定とタスクで足りているか見極めてから作ります。" },
        { name: "素材納品", why: "VTR・素材の受け渡し。いまはBoxで回っているので、必要になったら案件のタブとして足します。" },
      ],

      sandboxTools: [
        { name: "リアルタイムCG", sample: "架空の表彰式（3部門・ランキング入り）", icon: "tv", bd: "#005bac", bg: "#f4faff", iconBg: "#fefce8", iconFg: "#a16207" },
        { name: "Qシート", sample: "30分の発表会のサンプル台本", icon: "file-text", bd: "#e6e9ed", bg: "#fff", iconBg: "#fff1f2", iconFg: "#e11d48" },
        { name: "計時LIVE", sample: "45分の番組（押し引きの練習）", icon: "timer", bd: "#e6e9ed", bg: "#fff", iconBg: "#fef2f2", iconFg: "#ef4444" },
        { name: "翻訳", sample: "社内資料をそのまま貼って試す", icon: "languages", bd: "#e6e9ed", bg: "#fff", iconBg: "#f0fdf4", iconFg: "#16a34a" },
        { name: "インタラクティブ演出", sample: "スタンプと投票のデモ（社内10名想定）", icon: "sparkles", bd: "#e6e9ed", bg: "#fff", iconBg: "#fdf2f8", iconFg: "#db2777" },
        { name: "技術資料・香盤表", sample: "用賀 STUDIO A の標準セットから", icon: "wrench", bd: "#e6e9ed", bg: "#fff", iconBg: "#ecfeff", iconFg: "#0891b2" },
      ],

      sandboxItems: [
        { kind: "CG", kindBg: "#fefce8", kindFg: "#a16207", name: "リアルタイムCG の練習", meta: "寺井 ・ 7/24 に作成 ・ 送出テスト 12回", left: "あと13日", leftFg: "#3c424c", cta: "ひらく" },
        { kind: "翻訳", kindBg: "#f0fdf4", kindFg: "#16a34a", name: "英語字幕の精度を見る", meta: "佐々木 ・ 7/22 に作成", left: "あと11日", leftFg: "#3c424c", cta: "ひらく" },
        { kind: "演出", kindBg: "#fdf2f8", kindFg: "#db2777", name: "スタンプ演出のデモ（商談用）", meta: "寺井 ・ 7/19 に作成 ・ 商談で使用", left: "あと8日", leftFg: "#3c424c", cta: "案件に引き継ぐ" },
        { kind: "Qシート", kindBg: "#fff1f2", kindFg: "#e11d48", name: "新人向けの練習台本", meta: "大森 ・ 7/13 に作成", left: "あと2日", leftFg: "#b45309", cta: "残す" },
      ],

      sandboxRules: [
        { text: "売上・稼働・粗利には入りません。ふりかえりの数字にも出ません。", icon: "check", fg: "#197a4b" },
        { text: "14日で自動的に消えます。残したいものは案件に引き継ぐか、「残す」を押します。", icon: "check", fg: "#197a4b" },
        { text: "配布URLは社内だけで開きます。お客様には配れません。", icon: "check", fg: "#197a4b" },
        { text: "画面の上に必ず紫の帯が出ます。本番と見間違えません。", icon: "check", fg: "#197a4b" },
        { text: "案件が決まったら引き継げます。作ったものはそのまま移ります。", icon: "check", fg: "#197a4b" },
        { text: "誰が何を試したかは残ります（消えるのは中身だけ）。", icon: "check", fg: "#197a4b" },
      ],

      sandboxEntries: [
        { where: "⌘K", how: "「お試し」または道具の名前を打つと「お試しで使う」が候補に出ます。" },
        { where: "設定", how: "設定 ＞ お試し。管理者は全員のお試しを見られます。" },
        { where: "案件から", how: "案件の道具タブで「まず練習する」を押すと、その案件のサンプルでお試しに入ります。" },
      ],

      sandboxLimits: [
        "お客様や外部パートナーに配布URLを渡すこと",
        "請求・仕入・売上に金額を入れること",
        "スタジオ予約を本予約にすること",
        "案件の実績（ふりかえり・KPI）に載せること",
      ],

      tsTabs: [
        { label: "基本・スタッフ", icon: "users", bd: "transparent", fg: "#5d6470", count: "", empty: false },
        { label: "カメラ", icon: "camera", bd: "#005bac", fg: "#005bac", count: "4", empty: false },
        { label: "映像", icon: "monitor", bd: "transparent", fg: "#5d6470", count: "6", empty: false },
        { label: "音声", icon: "music", bd: "transparent", fg: "#5d6470", count: "9", empty: false },
        { label: "通信", icon: "radio", bd: "transparent", fg: "#5d6470", count: "", empty: true },
      ],

      tsCameras: [
        { no: "1C", model: "HDC-4300", lens: "UA107 ・ 三脚", who: "大野 拓", place: "客席後方 センター", cable: "光 60m" },
        { no: "2C", model: "HDC-4300", lens: "UA22 ・ 三脚", who: "大森 亮", place: "ステージ下手", cable: "光 40m ・ 客席側" },
        { no: "3C", model: "PXW-Z750", lens: "内蔵 ・ 手持ち", who: "林 さやか", place: "フロア（手元寄り）", cable: "無線" },
        { no: "4C", model: "FR7", lens: "24-70 ・ リモート", who: "（技術で操作）", place: "ステージ上手 高所", cable: "光 30m" },
      ],

      tsStaff: [
        { role: "TD", name: "寺井 赳博", warn: false },
        { role: "SW", name: "佐々木 遥", warn: false },
        { role: "VE", name: "大森 亮", warn: false },
        { role: "MIX", name: "—", warn: true },
        { role: "CAM", name: "大野・大森・林 ＋1名", warn: false },
      ],

      tsPages: ["1 概要", "2 カメラ", "3 映像・音声"],

      liveAdjust: ["−1分", "−30秒", "−10秒", "+10秒", "+30秒", "+1分"],

      liveTimersList: [
        { label: "本番尺", time: "12:38", state: "走行中", bg: "#1c1418", bd: "#c7243a", fg: "#fff" },
        { label: "休憩", time: "10:00", state: "止まっています", bg: "#161b23", bd: "#2b323d", fg: "#cfd5dd" },
        { label: "質疑応答", time: "06:00", state: "止まっています", bg: "#161b23", bd: "#2b323d", fg: "#cfd5dd" },
      ],

      liveViewers: [
        { value: "1,204", label: "YouTube", fg: "#fff", bd: "#2b323d" },
        { value: "512", label: "Jstream", fg: "#fff", bd: "#2b323d" },
        { value: "126", label: "Zoom", fg: "#fff", bd: "#2b323d" },
        { value: "—", label: "Teams（切）", fg: "#3c424c", bd: "#232a35" },
      ],

      liveChart: ["22%", "28%", "26%", "34%", "40%", "38%", "46%", "52%", "50%", "58%", "64%", "62%", "70%", "76%", "74%", "82%", "88%", "94%"],

      liveErrors: [
        { title: "Teams の人数が取れていません", detail: "会議のURLが入っていません。番組の設定で貼ってください。", cta: "番組の設定を開く", bg: "#1e1a12", bd: "#4a3a18", fg: "#f5d9a0" },
        { title: "YouTube のサブ配信が見つかりません", detail: "URLが配信終了になっています。差し替えるか、取得を止めてください。", cta: "URLを直す", bg: "#1c1418", bd: "#4a2028", fg: "#f3c7cd" },
      ],

      inviewRows: [
        { name: "宮田 涼子 様", company: "株式会社ミナトデジタル ・ 宣伝部", initial: "ミ", avBg: "#eaf4fb", avFg: "#005bac", people: "2名", state: "お客様と一致", stateBg: "#e7f6ee", stateFg: "#197a4b", cta: "" },
        { name: "井上 徹 様", company: "株式会社アオゾラ物流 ・ 総務", initial: "ア", avBg: "#eaf4fb", avFg: "#005bac", people: "1名", state: "お客様と一致", stateBg: "#e7f6ee", stateFg: "#197a4b", cta: "" },
        { name: "木村 みなみ 様", company: "（会社名の書き方が違うようです）", initial: "木", avBg: "#fef3c7", avFg: "#92400e", people: "3名", state: "確認して", stateBg: "#fef3c7", stateFg: "#92400e", cta: "会社を選ぶ" },
        { name: "高橋 学 様", company: "ケイ・フーズ株式会社 ・ 広報", initial: "ケ", avBg: "#e7f6ee", avFg: "#197a4b", people: "1名", state: "受付済み", stateBg: "#eaf4fb", stateFg: "#005bac", cta: "" },
        { name: "新規のお客様", company: "サンリバー音響株式会社（新しく作ります）", initial: "サ", avBg: "#f2f4f7", avFg: "#3c424c", people: "2名", state: "確認して", stateBg: "#fef3c7", stateFg: "#92400e", cta: "お客様を作る" },
      ],

      inviewAfter: [
        { text: "来場した人数と写真は、ふりかえりのイベント報告に自動で入ります。", icon: "clipboard-list" },
        { text: "相談ごとが書かれていた申込は、ネタ案件の候補として今日の画面に出ます。", icon: "folder-plus" },
        { text: "来た会社の記録は、お客様の「来訪・見学」に残ります。", icon: "building-2" },
      ],

      otpBoxes: [
        { v: "4", bd: "1px solid #e6e9ed", bg: "#fff" },
        { v: "9", bd: "1px solid #e6e9ed", bg: "#fff" },
        { v: "2", bd: "1px solid #e6e9ed", bg: "#fff" },
        { v: "7", bd: "1.5px solid #005bac", bg: "#f4faff" },
        { v: "", bd: "1px solid #e6e9ed", bg: "#fff" },
        { v: "", bd: "1px solid #e6e9ed", bg: "#fff" },
      ],

      leftoverScreens: [
        { label: "香盤表・サイネージ", icon: "table-2", where: "案件 ＞ 予定", how: "当日の並びは予定タブから出します。部屋の入口に出すサイネージは、そのURLを「表示画面を渡す」で配るだけにします。" },
        { label: "費用を分け合う（1社が払う場合）", icon: "layers", where: "案件 ＞ お金", how: "1社が払って費用を複数案件で分けるときは、案件のお金タブに「他の案件と分け合う」を置きます。各社が払う合同案件は32章です。" },
        { label: "旧GLSの取り込み", icon: "upload", where: "設定 ＞ お金のルール", how: "年に数回の作業です。取込の1本道と同じ「取り込む→確認する→登録する」に載せます。" },
        { label: "月次の請求（ビジネス案件）", icon: "receipt", where: "お金 ＞ 請求のしごと", how: "毎月同じ金額を出す案件は、締め日に一覧で出して「まとめて出す」を押すだけにします。" },
        { label: "セキュリティカード", icon: "id-card", where: "お客様 ＋ 設定", how: "誰に貸したかはお客様側、カードそのものの台帳は設定側。2か所に分けると探す場所が決まります。" },
        { label: "全文検索の結果", icon: "search", where: "⌘K の続き", how: "⌘Kで絞りきれないときだけ、Enterで結果の一覧に進みます。単独のメニューには置きません。" },
      ],

      searchTabs: [
        { label: "すべて", count: 28, bd: "#005bac", fg: "#005bac" },
        { label: "案件", count: 6, bd: "transparent", fg: "#5d6470" },
        { label: "やり取り", count: 12, bd: "transparent", fg: "#5d6470" },
        { label: "書類", count: 7, bd: "transparent", fg: "#5d6470" },
        { label: "お客様", count: 1, bd: "transparent", fg: "#5d6470" },
        { label: "タスク", count: 2, bd: "transparent", fg: "#5d6470" },
      ],

      searchResults: [
        { kind: "お客様", title: "株式会社ミナトデジタル", sub: "宮田 涼子 様 ・ 累計 ¥18,420,000 ・ 案件6件", when: "2日前", icon: "building-2", bg: "#eaf4fb", fg: "#005bac" },
        { kind: "案件", title: "秋のブランド発表会 配信・収録", sub: "B 口頭決定 ・ 10/03 ・ GLS-B012", when: "今日", icon: "folder-kanban", bg: "#fef3c7", fg: "#92400e" },
        { kind: "やり取り", title: "見積のご確認について", sub: "メール 7/23 ・ 宮田様「社内決裁が8月頭のため…」", when: "3日前", icon: "mail", bg: "#f5f3ff", fg: "#6d28d9" },
        { kind: "書類", title: "見積_秋のブランド発表会_v2.pdf", sub: "BOX ・ 社外用 ・ 送付済み", when: "3日前", icon: "file-text", bg: "#f2f4f7", fg: "#5d6470" },
        { kind: "タスク", title: "ミナトデジタル様に見積を送る", sub: "期限 7/23 18:00（2日超過）・ 担当 寺井", when: "2日超過", icon: "list-checks", bg: "#fee2e2", fg: "#b91c1c" },
        { kind: "案件", title: "年末の全社総会 配信", sub: "ネタ ・ 12/19 ・ 想定 ¥3,200,000", when: "6月", icon: "folder-kanban", bg: "#f2f4f7", fg: "#3c424c" },
      ],

      boxFoldersOld: [
        { name: "社外用", note: "お客様に出すもの。共有URLを作れます", count: "4件", icon: "share-2", headBg: "#f4faff", fg: "#005bac",
          files: [
            { name: "見積_秋のブランド発表会_v2.pdf", when: "7/23", who: "寺井" },
            { name: "会場のご案内_用賀.pdf", when: "7/18", who: "佐々木" },
          ] },
        { name: "社内用", note: "外に出しません。共有URLは作れません", count: "6件", icon: "lock", headBg: "#fafbfc", fg: "#3c424c",
          files: [
            { name: "原価の内訳_2026秋.xlsx", when: "7/22", who: "寺井" },
            { name: "技術メモ_配線図.png", when: "7/20", who: "大森" },
          ] },
        { name: "お客様からもらったもの", note: "申込書・許諾・支給素材", count: "2件", icon: "inbox", headBg: "#fafbfc", fg: "#3c424c",
          files: [
            { name: "ロゴデータ一式.zip", when: "7/15", who: "宮田様" },
          ] },
        { name: "本番後", note: "写真・納品データ", count: "0件", icon: "image", headBg: "#fafbfc", fg: "#3c424c",
          files: [] },
      ],

      cardRows: [
        { no: "A-03", who: "大野 拓（外部）", why: "商品発表会 スタジオ収録の設営", from: "7/24", due: "7/25 超過", dueFg: "#b91c1c", cta: "返却", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac", bg: "#fef6f7" },
        { no: "A-05", who: "林 さやか", why: "10月案件のリハーサル準備", from: "7/25", due: "8/01", dueFg: "#3c424c", cta: "返却", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed", bg: "#fff" },
        { no: "B-01", who: "みなと工芸（設営）", why: "秋のブランド発表会の搬入", from: "7/26", due: "8/05 17:00", dueFg: "#3c424c", cta: "返却", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed", bg: "#fff" },
        { no: "B-02", who: "大森 亮", why: "常時貸出（社員）", from: "4/01", due: "—", dueFg: "#5d6470", cta: "返却", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed", bg: "#fff" },
        { no: "B-04", who: "—", why: "貸出可", from: "—", due: "—", dueFg: "#5d6470", cta: "貸出登録", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4", bg: "#fff" },
      ],

      slackDmItems: [
        { label: "期限を過ぎているもの", icon: "triangle-alert", bg: "#fef6f7", bd: "#f6cdd2", fg: "#b91c1c" },
        { label: "今日が期限のタスク", icon: "calendar-clock", bg: "#fffbeb", bd: "#fde68a", fg: "#92400e" },
        { label: "今日の現場", icon: "calendar", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac" },
        { label: "確認待ちで止まっているもの", icon: "inbox", bg: "#faf9ff", bd: "#ddd6fe", fg: "#6d28d9" },
        { label: "あなたへの依頼", icon: "user-check", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac" },
        { label: "返事待ちの依頼", icon: "clock", bg: "#fff", bd: "#e6e9ed", fg: "#3c424c" },
      ],

      slackChannels: [
        { time: "6:00", channel: "#org-グローバルスタジオ営業", warn: "",
          items: [
            { label: "お待たせ中の件数", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac" },
            { label: "今日の現場", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac" },
            { label: "AIが作ったもの（確認待ち）", bg: "#faf9ff", bd: "#ddd6fe", fg: "#6d28d9" },
          ] },
        { time: "18:30", channel: "#org-グローバルスタジオ営業", warn: "",
          items: [
            { label: "今日終わったこと", bg: "#f7fdf9", bd: "#d8ecdd", fg: "#197a4b" },
            { label: "明日の現場", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac" },
          ] },
        { time: "月初 9:00", channel: "#org-スタジオ経営",
          warn: "金額を出します：このチャンネルにいる全員に見えます（権限の外に出ます）。個人名は出しません。",
          items: [
            { label: "先月の売上と営業利益", bg: "#fef6f7", bd: "#f6cdd2", fg: "#b91c1c" },
            { label: "請求のしごとの残り", bg: "#fffbeb", bd: "#fde68a", fg: "#92400e" },
          ] },
      ],

      docFields: [
        { label: "取引先", value: "サンリバー音響株式会社", fg: "#1a1d24" },
        { label: "金額（税抜）", value: "¥380,000", fg: "#1a1d24" },
        { label: "消費税", value: "¥38,000（10%）", fg: "#1a1d24" },
        { label: "紐づく案件", value: "株主総会 ライブ配信（AIの推定）", fg: "#b45309" },
        { label: "計上月", value: "2026年7月", fg: "#1a1d24" },
      ],

      docDupes: [
        { name: "回線費用（7月）", meta: "仕入 ・ 計上 7/31 ・ 株主総会 ライブ配信", cur: "¥", amt: "418,000" },
        { name: "回線費用（6月）", meta: "仕入 ・ 計上 6/30 ・ 同じ取引先", cur: "¥", amt: "418,000" },
      ],

      permAudit: [
        { when: "2026/07/20 10:13", module: "機材", before: "見えない", after: "書ける", afterFg: "#005bac", who: "寺井 赳博", reason: "1行だけ直した" },
        { when: "2026/07/20 10:12", module: "案件", before: "見えない", after: "見るだけ", afterFg: "#005bac", who: "寺井 赳博", reason: "役割テンプレートを当てた（外部パートナー）" },
        { when: "2026/07/20 10:12", module: "タスク", before: "見えない", after: "書ける", afterFg: "#005bac", who: "寺井 赳博", reason: "役割テンプレートを当てた（外部パートナー）" },
        { when: "2026/07/20 10:12", module: "お金", before: "見るだけ", after: "見えない", afterFg: "#b91c1c", who: "寺井 赳博", reason: "役割テンプレートを当てた（外部パートナー）" },
        { when: "2026/06/02 15:40", module: "Qシート", before: "見えない", after: "見るだけ", afterFg: "#005bac", who: "佐々木 遥（退職）", reason: "1行だけ直した" },
      ],

      permAuditRules: [
        "1行＝1モジュールの変化。保存1回でまとめて1行にすると、どの行がどう変わったか読めません。",
        "実際に変わった行だけ記録します。保存を押しただけで履歴が伸びると読めなくなります。",
        "消せません（下書き削除も持ちません）。消せる監査記録は監査になりません。",
        "変えた人はそのときの名前も残します。退職して消えても「誰か分からない」になりません。",
        "役割テンプレートを当てた保存かどうかを残します。読み方が変わるためです。",
      ],

      moneyCards: [
        { title: "取り込む（1本道）", icon: "file-search", iconBg: "#eaf4fb", iconFg: "#005bac", bg: "#fff", bd: "#cfe4f4",
          body: "精算PDF・仕訳CSV・二重計上のチェックを「取り込む→確認する→登録する」の1つの流れにまとめました。",
          note: "AIが読み取った値を人が承認します。同じ支払いが2回入っていないかも、この確認の段で出ます。" },
        { title: "見積を作成", icon: "receipt", iconBg: "#faf9ff", iconFg: "#6d28d9", bg: "#fff", bd: "#ddd6fe",
          body: "似た案件と料金表からAIが明細を下書きします。粗利率はその場で出て、値引きを入れると動きます。",
          note: "仕入の列に入れた金額は、受注したときそのまま仕入の明細になります。二度打ちしません。" },
        { title: "請求と入金", icon: "wallet", iconBg: "#f2f4f7", iconFg: "#3c424c", bg: "#fff", bd: "#e6e9ed",
          body: "締めの日に対象を集めて、まとめて発行します。申込書が揃っていない案件は選べません。",
          note: "毎月同じ金額の請求は、先月と違うものだけ印が付きます。" },
      ],

      sitemap: [
        { rail: "今日", route: "/today", icon: "sun", fg: "#005bac", iconBg: "#eaf4fb", iconFg: "#005bac", headBg: "#f4faff", bd: "#cfe4f4",
          items: [
            { label: "AIに任せる欄", dot: "#6d28d9", weight: "700", tag: "", tagBg: "", tagFg: "" },
            { label: "お待たせ中", dot: "#c7243a", weight: "700", tag: "6", tagBg: "#fee2e2", tagFg: "#b91c1c" },
            { label: "進行中の案件", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "今日と明日の現場", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "今月の数字", dot: "#5d6470", weight: "400", tag: "畳む", tagBg: "#f2f4f7", tagFg: "#3c424c" },
            { label: "AIがやったこと", dot: "#6d28d9", weight: "400", tag: "畳む", tagBg: "#f2f4f7", tagFg: "#3c424c" },
          ] },
        { rail: "案件", route: "/projects", icon: "folder-kanban", fg: "#005bac", iconBg: "#eaf4fb", iconFg: "#005bac", headBg: "#f4faff", bd: "#cfe4f4",
          items: [
            { label: "一覧（リスト／ボード）", dot: "#005bac", weight: "700", tag: "", tagBg: "", tagFg: "" },
            { label: "1件：概要・やり取り", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "1件：お金・予定", dot: "#005bac", weight: "700", tag: "タブ", tagBg: "#eaf4fb", tagFg: "#005bac" },
            { label: "1件：書類と成果物", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "1件：Qシート・技術資料・香盤表", dot: "#5d6470", weight: "400", tag: "道具", tagBg: "#f2f4f7", tagFg: "#3c424c" },
            { label: "1件：機材・CG・翻訳・演出", dot: "#5d6470", weight: "400", tag: "道具", tagBg: "#f2f4f7", tagFg: "#3c424c" },
          ] },
        { rail: "タスク", route: "/tasks", icon: "list-checks", fg: "#005bac", iconBg: "#eaf4fb", iconFg: "#005bac", headBg: "#f4faff", bd: "#cfe4f4",
          items: [
            { label: "自分／案件／全体", dot: "#005bac", weight: "700", tag: "", tagBg: "", tagFg: "" },
            { label: "リスト／ボード／ガント", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "あなたへの依頼", dot: "#6d28d9", weight: "700", tag: "3", tagBg: "#f5f3ff", tagFg: "#6d28d9" },
            { label: "出した依頼の返事待ち", dot: "#5d6470", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "9マス（重要度×緊急度）", dot: "#5d6470", weight: "400", tag: "", tagBg: "", tagFg: "" },
          ] },
        { rail: "お客様", route: "/customers", icon: "building-2", fg: "#005bac", iconBg: "#eaf4fb", iconFg: "#005bac", headBg: "#f4faff", bd: "#cfe4f4",
          items: [
            { label: "一覧（取引の状態）", dot: "#005bac", weight: "700", tag: "", tagBg: "", tagFg: "" },
            { label: "1社：接点と実績", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "1社：案件", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "1社：請求先", dot: "#005bac", weight: "400", tag: "統合", tagBg: "#eaf4fb", tagFg: "#005bac" },
            { label: "1社：連絡先", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "来訪・見学の記録", dot: "#5d6470", weight: "400", tag: "", tagBg: "", tagFg: "" },
          ] },
        { rail: "予定", route: "/schedule", icon: "calendar", fg: "#005bac", iconBg: "#eaf4fb", iconFg: "#005bac", headBg: "#f4faff", bd: "#cfe4f4",
          items: [
            { label: "月／週／日／一覧", dot: "#005bac", weight: "700", tag: "", tagBg: "", tagFg: "" },
            { label: "レイヤー：スタジオ予約", dot: "#c7243a", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "レイヤー：パートナー", dot: "#0d9488", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "レイヤー：自分の予定", dot: "#2563eb", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "期限が近い仮押さえ", dot: "#f0a000", weight: "700", tag: "3", tagBg: "#fef3c7", tagFg: "#92400e" },
          ] },
        { rail: "お金", route: "/finance", icon: "piggy-bank", fg: "#005bac", iconBg: "#eaf4fb", iconFg: "#005bac", headBg: "#f4faff", bd: "#cfe4f4",
          items: [
            { label: "損益フロー", dot: "#005bac", weight: "700", tag: "", tagBg: "", tagFg: "" },
            { label: "3列レビュー", dot: "#005bac", weight: "400", tag: "MTG用", tagBg: "#eaf4fb", tagFg: "#005bac" },
            { label: "取り込む（1本道）", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "見積", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "請求のしごと・入金", dot: "#005bac", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "合同案件", dot: "#005bac", weight: "700", tag: "新規", tagBg: "#e7f6ee", tagFg: "#197a4b" },
          ] },
        { rail: "設定", route: "/settings", icon: "settings", fg: "#3c424c", iconBg: "#f2f4f7", iconFg: "#3c424c", headBg: "#fafbfc", bd: "#e6e9ed",
          items: [
            { label: "人と権限", dot: "#5d6470", weight: "400", tag: "管理者", tagBg: "#fef3c7", tagFg: "#92400e" },
            { label: "お客様・取引先", dot: "#5d6470", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "スタジオと部屋", dot: "#5d6470", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "機材のマスター", dot: "#5d6470", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "会計のルール", dot: "#5d6470", weight: "400", tag: "", tagBg: "", tagFg: "" },
            { label: "AIと連携・システム", dot: "#5d6470", weight: "400", tag: "管理者", tagBg: "#fef3c7", tagFg: "#92400e" },
          ] },
      ],

      sitemapHidden: [
        { label: "ふりかえり", route: "/review", icon: "clipboard-list" },
        { label: "お試し", route: "/sandbox", icon: "flask-conical" },
        { label: "機材（オペレーション）", route: "/equipment", icon: "package" },
        { label: "本番（Qシート）", route: "/live/:id", icon: "radio" },
        { label: "検索結果", route: "/search", icon: "search" },
        { label: "通知", route: "ヘッダーのベル", icon: "bell" },
      ],

      sitemapDepth: [
        { level: "1階層", what: "レール6項目＋設定。ここだけ覚えれば全部に行けます" },
        { level: "2階層", what: "一覧・損益フロー・カレンダーなど、レールを押して出る画面" },
        { level: "3階層", what: "1件の中（案件のタブ、お客様のタブ、お金のタブ）" },
        { level: "4階層", what: "道具の中（Qシートの本番、CGの送出、取込の確認）。ここが最深" },
      ],

      flowIn: [
        { label: "メール（info@ / sales@）", detail: "問い合わせと請求書。AIが読んで種別を判定します", icon: "mail", fg: "#6d28d9" },
        { label: "電話・打合せ・口頭の依頼", detail: "そのまま貼るか声で入れます", icon: "phone", fg: "#ea580c" },
        { label: "精算PDF・仕訳CSV", detail: "X-Point / 楽楽精算 / freee", icon: "file-text", fg: "#005bac" },
        { label: "内覧会の申込フォーム", detail: "来場予約。会社をお客様に突き合わせます", icon: "users", fg: "#0d9488" },
      ],

      flowTodayOut: ["案件にする", "タスクにする", "予約にする"],

      flowProjectLinks: [
        { label: "お客様", detail: "接点と実績。1社の全案件がここに集まる", icon: "building-2", fg: "#005bac" },
        { label: "タスク", detail: "案件のタスクと個人のタスクが同じ並びに入る", icon: "list-checks", fg: "#005bac" },
        { label: "予定", detail: "本番・リハ・仮押さえ。カレンダーに出る", icon: "calendar", fg: "#005bac" },
        { label: "お金", detail: "見積 → 売上・仕入 → 請求 → 入金", icon: "circle-dollar-sign", fg: "#005bac" },
        { label: "書類（BOX）", detail: "揃っていないものは今日にも出る", icon: "folder-open", fg: "#5d6470" },
        { label: "Qシート・香盤表", detail: "案件の日程と人から最初の1枚を組む", icon: "file-text", fg: "#e11d48" },
        { label: "技術資料・機材", detail: "貸出は案件の日程から出庫リストになる", icon: "wrench", fg: "#0891b2" },
        { label: "CG・翻訳・演出", detail: "開いた時点で出演者と進行が入っている", icon: "tv", fg: "#a16207" },
        { label: "計時LIVE", detail: "本番の行から開く。番組尺が入っている", icon: "timer", fg: "#ef4444" },
      ],

      flowNumbers: [
        { label: "案件の見積", detail: "料金表とAIの下書きから金額を決める", arrow: true, bd: "#cfe4f4", fg: "#005bac" },
        { label: "売上・仕入", detail: "受注で確定。仕入は見積の列から入る", arrow: true, bd: "#e6e9ed", fg: "#1a1d24" },
        { label: "月次の損益", detail: "損益フローと3列レビュー", arrow: true, bd: "#e6e9ed", fg: "#1a1d24" },
        { label: "ふりかえり", detail: "週次の数字・イベント報告・AIの成績", arrow: true, bd: "#e6e9ed", fg: "#1a1d24" },
        { label: "隔週キープ", detail: "16ページをAIが埋め、人は2ページ書く", arrow: false, bd: "#d8ecdd", fg: "#197a4b" },
      ],

      sharedSources: [
        { data: "お待たせ中", where: "今日／通知のベル／朝の1通／案件の「次の一手」" },
        { data: "次回アクション", where: "案件／タスク／今日／朝の1通" },
        { data: "揃っていない書類", where: "案件の書類の棚／今日／請求のしごと（出せるかの判定）" },
        { data: "スタジオ予約", where: "予定／案件の予定タブ／機材の出し入れ／香盤表" },
        { data: "案件メンバー", where: "技術資料のスタッフ／Qシートの登場人物／機材の貸出先" },
      ],

      splitKinds: [
        { name: "費用を分け合う", tag: "いまの形", tagBg: "#f2f4f7", tagFg: "#3c424c", icon: "layers", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed",
          what: "1社が払い、かかった費用を複数の案件で分けます。社内の原価配分の話です。",
          entry: "案件 ＞ お金 ＞「他の案件と分け合う」",
          rows: [
            { label: "払う会社", value: "1社" },
            { label: "請求書", value: "1枚" },
            { label: "分けるもの", value: "費用（原価）" },
            { label: "分ける先", value: "案件（社内）" },
          ] },
        { name: "合同案件", tag: "この章で作る", tagBg: "#eaf4fb", tagFg: "#005bac", icon: "users", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac",
          what: "1回のイベントを複数社で開き、総額を分けて各社に請求します。お金を受け取る側の話です。",
          entry: "お金 ＞ 合同案件",
          rows: [
            { label: "払う会社", value: "参加した社数（例 9社）" },
            { label: "請求書", value: "参加社数ぶん（例 9枚）" },
            { label: "分けるもの", value: "総額（売上）" },
            { label: "分ける先", value: "会社（社外）" },
          ] },
      ],

      jointSteps: [
        { no: "1", label: "会社を選ぶ", bd: "transparent", fg: "#5d6470", numBg: "#f2f4f7", numFg: "#3c424c" },
        { no: "2", label: "総額を入れる", bd: "transparent", fg: "#5d6470", numBg: "#f2f4f7", numFg: "#3c424c" },
        { no: "3", label: "分け方を選ぶ", bd: "#005bac", fg: "#005bac", numBg: "#005bac", numFg: "#fff" },
        { no: "4", label: "確認して出す", bd: "transparent", fg: "#5d6470", numBg: "#f2f4f7", numFg: "#3c424c" },
      ],

      splitModes: [
        { label: "均等に分ける", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "割合で分ける", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "金額を直接入れる", bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      jointCompanies: [
        { name: "GMOインターネットグループ", note: "幹事 ・ あまりの1円はここ", initial: "G", avBg: "#eaf4fb", avFg: "#005bac", ratio: "11.2%", amt: "955,254", due: "7/31 18:00", inv: "出せる", invBg: "#e7f6ee", invFg: "#197a4b", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#f4faff" },
        { name: "GMOペイメントゲートウェイ", note: "", initial: "P", avBg: "#f2f4f7", avFg: "#3c424c", ratio: "11.1%", amt: "955,253", due: "7/31 18:00", inv: "出せる", invBg: "#e7f6ee", invFg: "#197a4b", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#fff" },
        { name: "GMOメディア", note: "", initial: "M", avBg: "#f2f4f7", avFg: "#3c424c", ratio: "11.1%", amt: "955,253", due: "7/31 18:00", inv: "出せる", invBg: "#e7f6ee", invFg: "#197a4b", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#fff" },
        { name: "GMOグローバルサイン", note: "", initial: "S", avBg: "#f2f4f7", avFg: "#3c424c", ratio: "11.1%", amt: "955,253", due: "7/31 18:00", inv: "出せる", invBg: "#e7f6ee", invFg: "#197a4b", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#fff" },
        { name: "GMOアドパートナーズ", note: "請求先が本社と違います", initial: "A", avBg: "#fef3c7", avFg: "#92400e", ratio: "11.1%", amt: "955,253", due: "8/31", inv: "確認して", invBg: "#fef3c7", invFg: "#92400e", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#fff" },
        { name: "GMOフィナンシャルホールディングス", note: "", initial: "F", avBg: "#f2f4f7", avFg: "#3c424c", ratio: "11.1%", amt: "955,253", due: "7/31 18:00", inv: "出せる", invBg: "#e7f6ee", invFg: "#197a4b", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#fff" },
        { name: "GMO TECH", note: "", initial: "T", avBg: "#f2f4f7", avFg: "#3c424c", ratio: "11.1%", amt: "955,253", due: "7/31 18:00", inv: "出せる", invBg: "#e7f6ee", invFg: "#197a4b", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#fff" },
        { name: "GMOリサーチ＆AI", note: "", initial: "R", avBg: "#f2f4f7", avFg: "#3c424c", ratio: "11.1%", amt: "955,253", due: "7/31 18:00", inv: "出せる", invBg: "#e7f6ee", invFg: "#197a4b", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#fff" },
        { name: "GMOくまポン", note: "", initial: "K", avBg: "#f2f4f7", avFg: "#3c424c", ratio: "11.1%", amt: "955,252", due: "7/31 18:00", inv: "出せる", invBg: "#e7f6ee", invFg: "#197a4b", pay: "—", payBg: "#f2f4f7", payFg: "#3c424c", bg: "#fff" },
      ],

      jointTotals: [
        { label: "売上（9社合計・税抜）", cur: "¥", amt: "8,597,277", size: "17px", weight: "700", fg: "#1a1d24", labelFg: "#3c424c" },
        { label: "仕入", cur: "¥", amt: "3,879,212", size: "14px", weight: "400", fg: "#3c424c", labelFg: "#5d6470" },
        { label: "粗利", cur: "¥", amt: "4,718,065", size: "20px", weight: "700", fg: "#197a4b", labelFg: "#3c424c" },
        { label: "粗利率", cur: "", amt: "54.8%", size: "16px", weight: "700", fg: "#197a4b", labelFg: "#5d6470" },
      ],

      jointRules: [
        "会社を選ぶと、その社数ぶんの案件が自動でできます（手で9個作りません）。",
        "見積は全体で1本。30章の見積画面をそのまま使います（明細のグループも仕入の列もそのまま）。",
        "分け方の既定は均等。割合と金額の直接入力も選べます。",
        "あまりの1円は幹事に付けます。付ける先は画面で変えられます（黙って先頭に寄せません）。",
        "金額は税抜で持ちます。消費税と支払額は表示のときに足します。",
        "請求書の番号は1枚ごとに採ります。9枚出せば9本です。",
      ],

      quoteBases: [
        { label: "春の新製品発表会（2026/04・¥5,140,000）", icon: "history" },
        { label: "料金表 2026年度版", icon: "book-open" },
        { label: "この案件の予定（カメラ3台・配信2系統）", icon: "calendar" },
      ],

      quoteGroups: [
        { name: "スタジオ", sum: "¥1,680,000",
          rows: [
            { item: "用賀 STUDIO A 終日", note: "10/03（土）8:00-20:00", noteFg: "#5d6470", qty: "1", unit: "日", price: "1,200,000", amount: "1,200,000", cost: "—", costFg: "#5d6470" },
            { item: "予備日（仮押さえ）", note: "8/15までに本予約へ", noteFg: "#b45309", qty: "1", unit: "日", price: "480,000", amount: "480,000", cost: "—", costFg: "#5d6470" },
          ] },
        { name: "技術・人員", sum: "¥2,240,000",
          rows: [
            { item: "カメラ 3台＋オペレーター", note: "うち1名は外部（大野）", noteFg: "#5d6470", qty: "3", unit: "台", price: "280,000", amount: "840,000", cost: "180,000", costFg: "#3c424c" },
            { item: "配信オペレーション（2系統）", note: "YouTube / Zoom", noteFg: "#5d6470", qty: "2", unit: "系統", price: "320,000", amount: "640,000", cost: "120,000", costFg: "#3c424c" },
            { item: "音声・照明", note: "", noteFg: "#5d6470", qty: "1", unit: "式", price: "760,000", amount: "760,000", cost: "240,000", costFg: "#3c424c" },
          ] },
        { name: "制作・その他", sum: "¥900,000",
          rows: [
            { item: "Qシート作成・進行", note: "", noteFg: "#5d6470", qty: "1", unit: "式", price: "380,000", amount: "380,000", cost: "—", costFg: "#5d6470" },
            { item: "回線費用", note: "サンリバー音響（前回と同額）", noteFg: "#5d6470", qty: "1", unit: "式", price: "420,000", amount: "420,000", cost: "418,000", costFg: "#b45309" },
            { item: "諸経費", note: "AIが補いました", noteFg: "#b45309", qty: "1", unit: "式", price: "100,000", amount: "100,000", cost: "—", costFg: "#5d6470" },
          ] },
      ],

      quoteTotals: [
        { label: "小計（税抜）", cur: "¥", amt: "4,820,000", size: "16px", weight: "700", fg: "#1a1d24", labelFg: "#3c424c" },
        { label: "消費税 10%", cur: "¥", amt: "482,000", size: "14px", weight: "400", fg: "#3c424c", labelFg: "#5d6470" },
        { label: "お客様の支払額", cur: "¥", amt: "5,302,000", size: "18px", weight: "700", fg: "#1a1d24", labelFg: "#3c424c" },
        { label: "仕入（見込み）", cur: "¥", amt: "958,000", size: "14px", weight: "400", fg: "#3c424c", labelFg: "#5d6470" },
        { label: "粗利", cur: "¥", amt: "3,862,000", size: "20px", weight: "700", fg: "#197a4b", labelFg: "#3c424c" },
        { label: "粗利率", cur: "", amt: "80.1%", size: "16px", weight: "700", fg: "#197a4b", labelFg: "#5d6470" },
      ],

      quoteCompare: [
        { name: "春の新製品発表会 配信・収録", when: "2026/04 ・ 同じお客様", amount: "¥5,140,000", gp: "39%", gpFg: "#3c424c" },
        { name: "社内表彰式 配信", when: "2026/06 ・ 同じ規模", amount: "¥3,180,000", gp: "44%", gpFg: "#3c424c" },
        { name: "商品発表会 スタジオ収録", when: "2026/10 ・ 用賀A 終日", amount: "¥1,380,000", gp: "41%", gpFg: "#3c424c" },
      ],

      quoteAfter: [
        { text: "「この金額で確定する」を押すと想定金額に入り、案件のステージが見積提案になります。", icon: "check", fg: "#197a4b" },
        { text: "PDFはBOXに残ります。送るのは自分のメールです（ONAiRは送りません）。", icon: "printer", fg: "#5d6470" },
        { text: "送ったら次のアクション（申込書をもらう）が自動で立ちます。", icon: "calendar-clock", fg: "#005bac" },
        { text: "仕入の列に入れた金額は、受注したときに仕入の明細になります（二度打ちしません）。", icon: "receipt", fg: "#5d6470" },
      ],

      billingTabs: [
        { label: "請求書を出す", count: 6, bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "入金の確認", count: 4, bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "検収書を出す", count: 2, bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      billingRows: [
        { project: "商品発表会 スタジオ収録", party: "ケイ・フーズ株式会社 ・ 月末締め翌月末払い", amt: "1,380,000", month: "7月", due: "8/31", dueFg: "#3c424c", lack: "", lackFg: "#5d6470", state: "出せる", stBg: "#e7f6ee", stFg: "#197a4b", picked: true, boxBd: "#005bac", boxBg: "#005bac" },
        { project: "株主総会 ライブ配信", party: "エヌ・ワイ商事株式会社", amt: "2,640,000", month: "7月", due: "8/31", dueFg: "#3c424c", lack: "", lackFg: "#5d6470", state: "出せる", stBg: "#e7f6ee", stFg: "#197a4b", picked: true, boxBd: "#005bac", boxBg: "#005bac" },
        { project: "月次運用（7月分）", party: "株式会社ミナトデジタル", amt: "880,000", month: "7月", due: "8/31", dueFg: "#3c424c", lack: "", lackFg: "#5d6470", state: "出せる", stBg: "#e7f6ee", stFg: "#197a4b", picked: true, boxBd: "#005bac", boxBg: "#005bac" },
        { project: "社内表彰式 配信", party: "GMOインターネットグループ", amt: "3,180,000", month: "7月", due: "8/31", dueFg: "#3c424c", lack: "", lackFg: "#5d6470", state: "出せる", stBg: "#e7f6ee", stFg: "#197a4b", picked: true, boxBd: "#005bac", boxBg: "#005bac" },
        { project: "採用説明会 第1回", party: "NKトレーディング株式会社", amt: "240,000", month: "7月", due: "8/31", dueFg: "#3c424c", lack: "申込書", lackFg: "#b91c1c", state: "出せない", stBg: "#fee2e2", stFg: "#b91c1c", picked: false, boxBd: "#d3d7dd", boxBg: "#f2f4f7" },
        { project: "春の新製品発表会 追加収録", party: "株式会社ミナトデジタル", amt: "1,240,000", month: "7月", due: "8/31", dueFg: "#3c424c", lack: "検収書", lackFg: "#b45309", state: "確認中", stBg: "#fef3c7", stFg: "#92400e", picked: false, boxBd: "#d3d7dd", boxBg: "#fff" },
      ],

      paymentRows: [
        { party: "サンリバー音響株式会社", project: "回線費用（6月分）・ 請求済み", amt: "418,000", due: "7/31 超過", fg: "#b91c1c", cta: "催促する", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
        { party: "エヌ・ワイ商事株式会社", project: "株主総会 ライブ配信", amt: "2,640,000", due: "7/31 18:00", fg: "#b45309", cta: "入金を記録", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
        { party: "株式会社ミナトデジタル", project: "月次運用（6月分）", amt: "880,000", due: "8/31", fg: "#3c424c", cta: "入金を記録", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed" },
        { party: "ケイ・フーズ株式会社", project: "商品発表会 スタジオ収録", amt: "1,380,000", due: "8/31", fg: "#3c424c", cta: "入金を記録", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed" },
      ],

      recurringRows: [
        { name: "月次運用（配信サポート）", party: "株式会社ミナトデジタル", amount: "¥880,000", changed: false },
        { name: "スタジオ月額利用", party: "GMOインターネットグループ", amount: "¥1,240,000", changed: true },
        { name: "回線・保守", party: "サンリバー音響株式会社", amount: "¥418,000", changed: false },
      ],

      keepStats: [
        { label: "毎回のページ数", value: "18", sub: "①②③まで。④以降は足した分だけ増える", fg: "#1a1d24", bd: "#e6e9ed" },
        { label: "前回の作成時間", value: "6.5時間", sub: "76ページ・数字の転記と体裁に4時間", fg: "#b91c1c", bd: "#f6cdd2" },
        { label: "これからの見込み", value: "45分", sub: "①②③の回。議題を足すと＋15分/件", fg: "#197a4b", bd: "#d8ecdd" },
        { label: "AIが埋めるページ", value: "16 / 18", sub: "人が書くのは①の理由と③の打ち手だけ", fg: "#6d28d9", bd: "#ddd6fe" },
      ],

      keepSections: [
        { page: "0. 利用方法チェックリスト", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "Ver.2.5 の11項目を自動で照合", human: "落ちている項目だけ直す", before: "10分", after: "0分" },
        { page: "1. 会議スローガン", by: "固定", byBg: "#f2f4f7", byFg: "#3c424c", from: "前回と同じ（変更なし）", human: "方針が変わったときだけ書き換える", before: "0分", after: "0分" },
        { page: "2. 情報サマリ", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "設定の会議マスター", human: "変更があれば赤字（自動で色が付く）", before: "5分", after: "0分" },
        { page: "3. 責任者＆組織図", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "設定の人と権限（役職・メール）", human: "入退社があれば確認だけ", before: "10分", after: "1分" },
        { page: "4. 参加者＆欠席者", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "前回の出席と動画視聴の記録", human: "なし", before: "10分", after: "0分" },
        { page: "5. 前回議事録サマリ", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "前回の議事録＋ToDoのID", human: "要約を読んで削る", before: "40分", after: "5分" },
        { page: "6. ToDoリスト", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "タスク（期限・担当・緊急×重要・AI活用率）", human: "進捗の一言を足す", before: "30分", after: "3分" },
        { page: "7. 全体スケジュール", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "予定とマイルストーン。「イマココ」は日付から", human: "節目の増減だけ", before: "40分", after: "3分" },
        { page: "8. KPIツリー", by: "固定", byBg: "#f2f4f7", byFg: "#3c424c", from: "前回と同じ（変更なし）", human: "KGI/KPIを変えるときだけ", before: "0分", after: "0分" },
        { page: "9. 進捗状況（定量）", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "お金の画面と稼働率（グラフも自動）", human: "なし", before: "45分", after: "0分" },
        { page: "10. アジェンダ", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "本編の構成から自動（時間配分つき）", human: "順番の入れ替え", before: "10分", after: "1分" },
        { page: "① 数値報告・営業進捗", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "目標と実績、ヨミ表、稼働カレンダー", human: "見通しの理由を1行", before: "90分", after: "8分" },
        { page: "② 案件実施報告", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "終わった案件の売上・粗利・来場数・写真", human: "何が良かったかを1行", before: "60分", after: "6分" },
        { page: "③ 重点取組課題", by: "AI＋人", byBg: "#fef3c7", byFg: "#92400e", from: "6テーマの担当・関連タスクの進捗・AI活用の効果", human: "テーマごとに打ち手と相談したいことを1行", before: "60分", after: "12分" },
        { page: "④以降（都度追加）", by: "人", byBg: "#fee2e2", byFg: "#b91c1c", from: "テーマを選ぶと、関係する数字は自動で入る", human: "その回に議題があるときだけ足す", before: "40分", after: "15分" },
        { page: "11. ToDo＆次回開催日", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "会議中に増えたタスク＋次回の予定", human: "なし（会議中に確定）", before: "10分", after: "0分" },
        { page: "Appendix", by: "AI", byBg: "#f5f3ff", byFg: "#6d28d9", from: "前回の本編から自動で移す（削除しない）", human: "なし", before: "20分", after: "0分" },
      ],

      keepAuto: [
        "数字はすでに ONAiR の中にあります（売上・仕入・販管費・稼働・タスク・予約）。転記をやめれば間違いも消えます。",
        "型が Ver.2.5 で決まっているので、置き場所を迷いません。AIは型に値を入れるだけです。",
        "前回との差は機械が見つけられます。赤字にするのも自動です。",
        "グラフは同じ形の繰り返しなので、毎回作り直す必要がありません。",
        "Appendix への移動と保管（削除厳禁）は、人がやると忘れます。",
      ],

      keepHuman: [
        "見通しが目標に届かない理由と、どう戻すか。",
        "比較して選んだ判断（倉庫・工事・機材の相見積もり）。",
        "重点取組課題の打ち手と、社長に相談したいこと。",
        "何を捨てるか。数字には出ない現場の事情。",
        "会議で決めたこと（議事録は書くが、決めるのは人）。",
      ],

      keepAgenda: [
        { no: "①", label: "数値報告・営業進捗", kind: "毎回", kindBg: "#e7f6ee", kindFg: "#197a4b", time: "5分", detail: "目標と見通し・ヨミ表・稼働率。数字はお金の画面から入ります。" },
        { no: "②", label: "案件実施報告", kind: "毎回", kindBg: "#e7f6ee", kindFg: "#197a4b", time: "5分", detail: "終わった案件の売上・粗利・来場数・AI活用の効果。" },
        { no: "③", label: "重点取組課題 進捗", kind: "毎回", kindBg: "#e7f6ee", kindFg: "#197a4b", time: "10分", detail: "6テーマの担当・進捗・打ち手。数字と進捗はタスクから、判断は人が1行。" },
      ],

      keepAgendaOptional: [
        { label: "用賀/渋谷 構築", icon: "hammer", note: "工事や設備の判断があるとき", auto: "見積・請求・相見積もりの比較" },
        { label: "採用・内製化", icon: "user-plus", note: "入社や選考の報告があるとき", auto: "入社日・内定状況" },
        { label: "グループ技術支援", icon: "share-2", note: "支援案件が動いたとき", auto: "案件から件数と内容" },
        { label: "そのほか（自由）", icon: "plus", note: "上に当てはまらない議題", auto: "なし（人が書く）" },
      ],

      keepPages: [
        { no: "0", label: "利用方法チェックリスト", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
        { no: "2", label: "情報サマリ", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
        { no: "4", label: "参加者＆欠席者", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
        { no: "5", label: "前回議事録サマリ", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
        { no: "6", label: "ToDoリスト", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
        { no: "7", label: "全体スケジュール", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
        { no: "9", label: "進捗状況（定量）", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
        { no: "①", label: "数値報告・営業進捗", edge: "#f0a000", bg: "#fffbeb", weight: "700", icon: "pencil", iconFg: "#b45309" },
        { no: "②", label: "案件実施報告", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
        { no: "③", label: "重点取組課題 進捗", edge: "#005bac", bg: "#f4faff", weight: "700", icon: "pencil", iconFg: "#005bac" },
        { no: "＋", label: "議題を足す（④以降）", edge: "#cbd2da", bg: "#fff", weight: "400", icon: "plus", iconFg: "#5d6470" },
        { no: "11", label: "ToDo＆次回開催日", edge: "#197a4b", bg: "#fff", weight: "400", icon: "check", iconFg: "#197a4b" },
      ],

      keepThemes: [
        { no: "1", theme: "技術内製化（採用）", owner: "寺井", auto: "内定2名・入社日 8/1・9/1", progress: "70%", barFg: "#005bac", human: "1チーム完全内製化の時期", state: "書いた", stBg: "#e7f6ee", stFg: "#197a4b" },
        { no: "2", theme: "技術力強化", owner: "唐澤", auto: "研修3件・機材デモ2件", progress: "45%", barFg: "#005bac", human: "尖りをどこに作るか", state: "書いた", stBg: "#e7f6ee", stFg: "#197a4b" },
        { no: "3", theme: "AI活用", owner: "橋本", auto: "外注削減 ¥176万・作業93時間短縮", progress: "80%", barFg: "#197a4b", human: "次に自動化する工程", state: "書いた", stBg: "#e7f6ee", stFg: "#197a4b" },
        { no: "4", theme: "新規案件獲得", owner: "長野", auto: "ヨミ6件・内覧会 来場14名", progress: "35%", barFg: "#f0a000", human: "パッケージの打ち出し方", state: "未記入", stBg: "#fef3c7", stFg: "#92400e" },
        { no: "5", theme: "グループへの技術支援", owner: "寺井", auto: "支援3件（LED・音響・カンファレンス）", progress: "60%", barFg: "#005bac", human: "支援の優先順位", state: "書いた", stBg: "#e7f6ee", stFg: "#197a4b" },
        { no: "6", theme: "GMOサムライコンテンツスタジオ", owner: "掛田", auto: "8/7 Web更新・8/10 プレスリリース", progress: "25%", barFg: "#f0a000", human: "オープン後の使い方", state: "未記入", stBg: "#fef3c7", stFg: "#92400e" },
      ],

      keepFacts: [
        { label: "技術内製化（採用）", value: "2名 入社", src: "8/1 林さん・9/1 萩田さん", fg: "#197a4b" },
        { label: "AI活用の効果（今期）", value: "¥176万", src: "外注をやめた分（仕入の明細から）", fg: "#197a4b" },
        { label: "作業時間の削減", value: "93時間", src: "アワード2026 ・ タスクの実績から", fg: "#197a4b" },
        { label: "グループ技術支援", value: "3件", src: "案件から自動集計", fg: "#1a1d24" },
        { label: "新規案件（ヨミ）", value: "6件", src: "案件のボードから", fg: "#1a1d24" },
        { label: "ToDoの期限内完了率", value: "82%", src: "タスクから（前回 74%）", fg: "#b45309" },
      ],

      keepAsk: [
        { q: "①この2週間で何が動きましたか（1行）", a: "採用が2名決まり、内製化フェーズ①の責任者がそろいました。", fg: "#1a1d24", hint: "AIの下書き：採用2名の内定承諾を確認しました。事実だけ書いています。" },
        { q: "②うまくいっていないことは何ですか（1行）", a: "7月の売上見通しが目標に対して27.8%。外部案件の獲得が遅れています。", fg: "#1a1d24", hint: "数字はAIが入れました。理由だけ書いてください。" },
        { q: "③社長に相談したいことはありますか（1行）", a: "", fg: "#5d6470", hint: "空でも進めます。書かないという判断も記録されます。" },
      ],

      keepChecklist: [
        { label: "最新のフォーマットを使っている", icon: "check", fg: "#197a4b" },
        { label: "変更点が赤文字になっている", icon: "check", fg: "#197a4b" },
        { label: "前回参加状況を記載している", icon: "check", fg: "#197a4b" },
        { label: "議事録サマリにToDoのIDがある", icon: "check", fg: "#197a4b" },
        { label: "「イマココ」が中央にある", icon: "circle-alert", fg: "#b45309" },
        { label: "次回開催日が入っている", icon: "check", fg: "#197a4b" },
      ],

      keepDiffs: [
        { what: "全体スケジュール", detail: "8/7 Webページ更新・8/10 プレスリリースを追加" },
        { what: "7月の見通し", detail: "売上 5,024千円（前回報告 6,200千円から下方）" },
        { what: "ToDo 27・29", detail: "本MTGにて報告 → 完了" },
        { what: "参加者", detail: "三浦を追加（前回まで欠席）" },
        { what: "重点取組課題", detail: "③AI活用の外注削減 ¥176万を追記" },
      ],

      keepPlRows: [
        { label: "売上高", target: "18,100", actual: "5,024", judge: "✕", judgeFg: "#b91c1c", ratio: "27.8%", diff: "-13,075", diffFg: "#b91c1c", bg: "#fff", weight: "700" },
        { label: "原価", target: "22,226", actual: "20,122", judge: "○", judgeFg: "#197a4b", ratio: "90.5%", diff: "-2,104", diffFg: "#197a4b", bg: "#fff", weight: "400" },
        { label: "　固定原価（償却費用）", target: "19,726", actual: "18,539", judge: "○", judgeFg: "#197a4b", ratio: "94.0%", diff: "-1,187", diffFg: "#197a4b", bg: "#fafbfc", weight: "400" },
        { label: "　変動原価（仕入）", target: "2,500", actual: "1,582", judge: "○", judgeFg: "#197a4b", ratio: "63.3%", diff: "-917", diffFg: "#197a4b", bg: "#fafbfc", weight: "400" },
        { label: "売上総利益", target: "-4,126", actual: "-15,097", judge: "✕", judgeFg: "#b91c1c", ratio: "22.7%", diff: "-10,970", diffFg: "#b91c1c", bg: "#fff", weight: "700" },
        { label: "販管費", target: "26,427", actual: "21,864", judge: "○", judgeFg: "#197a4b", ratio: "82.7%", diff: "-4,593", diffFg: "#197a4b", bg: "#fff", weight: "400" },
        { label: "営業利益", target: "-30,584", actual: "-36,961", judge: "✕", judgeFg: "#b91c1c", ratio: "-", diff: "-6,377", diffFg: "#b91c1c", bg: "#f4faff", weight: "700" },
      ],

      keepEventKpis: [
        { label: "売上", value: "¥859万", sub: "8,597,277円", fg: "#1a1d24" },
        { label: "粗利", value: "¥471万", sub: "54.8%", fg: "#197a4b" },
        { label: "会場参加", value: "280名", sub: "実数", fg: "#1a1d24" },
        { label: "オンライン参加", value: "7,800名", sub: "同時接続の最大", fg: "#1a1d24" },
      ],

      keepEventCompare: [
        { label: "制作・作業時間", y2025: "120時間", y2026: "27時間", cut: "93時間" },
        { label: "外注コスト", y2025: "47.3万円", y2026: "6.0万円", cut: "41.3万円" },
      ],

      deliverables: [
        { name: "申込書", who: "お客様に出してもらう", detail: "ひな形を送付済み。返送待ち", due: "8/07 18:00", dueFg: "#b45309", state: "未着", stBg: "#fee2e2", stFg: "#b91c1c", icon: "file-signature", bg: "#fef2f2", fg: "#c7243a", cta: "催促する", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
        { name: "ロゴ使用許諾", who: "お客様に出してもらう", detail: "先方の法務確認中", due: "8/07 18:00", dueFg: "#b45309", state: "未着", stBg: "#fee2e2", stFg: "#b91c1c", icon: "badge-check", bg: "#fef2f2", fg: "#c7243a", cta: "催促する", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
        { name: "技術資料", who: "大森 亮", detail: "カメラ4台まで入力済み。音声が未記入", due: "10/01 10:00", dueFg: "#b45309", state: "作成中", stBg: "#fef3c7", stFg: "#92400e", icon: "wrench", bg: "#ecfeff", fg: "#0891b2", cta: "つづける", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
        { name: "Qシート", who: "佐々木 遥", detail: "第3稿 ・ 26キュー ・ 案件メンバーに共有済み", due: "10/01 10:00", dueFg: "#3c424c", state: "確定", stBg: "#e7f6ee", stFg: "#197a4b", icon: "file-text", bg: "#fff1f2", fg: "#e11d48", cta: "ひらく", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed" },
        { name: "香盤表", who: "寺井 赳博", detail: "設営〜撤収まで。重なり1件を確認中", due: "10/01 10:00", dueFg: "#3c424c", state: "作成中", stBg: "#fef3c7", stFg: "#92400e", icon: "table-2", bg: "#f5f3ff", fg: "#6d28d9", cta: "つづける", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
        { name: "運営マニュアル", who: "—", detail: "部品は11/12そろっています（配置図が未作成）", due: "10/01 10:00", dueFg: "#3c424c", state: "未作成", stBg: "#f2f4f7", stFg: "#3c424c", icon: "book-open", bg: "#eaf4fb", fg: "#005bac", cta: "AIに作らせる", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
        { name: "見積", who: "寺井 赳博", detail: "¥1,380,000 ・ 送付済み（7/12）", due: "—", dueFg: "#3c424c", state: "確定", stBg: "#e7f6ee", stFg: "#197a4b", icon: "receipt", bg: "#eaf4fb", fg: "#005bac", cta: "ひらく", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed" },
        { name: "当日の写真", who: "現場で撮る", detail: "本番後にBOXへ。ふりかえりに自動で載ります", due: "10/03", dueFg: "#3c424c", state: "本番後", stBg: "#f2f4f7", stFg: "#3c424c", icon: "image", bg: "#f2f4f7", fg: "#5d6470", cta: "BOXを開く", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed" },
        { name: "納品データ", who: "現場で書き出す", detail: "収録素材の受け渡し（いまはBOXで運用）", due: "10/10 18:00", dueFg: "#3c424c", state: "本番後", stBg: "#f2f4f7", stFg: "#3c424c", icon: "hard-drive", bg: "#f2f4f7", fg: "#5d6470", cta: "BOXを開く", ctaBg: "#fff", ctaFg: "#3c424c", ctaBd: "#e6e9ed" },
      ],

      deliverableMissing: [
        { name: "申込書をもらう", due: "8/07 18:00 まで ・ あと12日", fg: "#b45309", cta: "催促する" },
        { name: "ロゴ使用許諾をもらう", due: "8/07 18:00 まで ・ あと12日", fg: "#b45309", cta: "催促する" },
        { name: "配置図をつくる", due: "10/01 まで（リハ前）", fg: "#3c424c", cta: "AIに作らせる" },
      ],

      deliverableRules: [
        "1つの案件の資料は1か所に集める。道具ごとに探しに行かせません。",
        "実体はBOXに置き、ONAiRは「何が揃っていないか」を持ちます（二重に持ちません）。",
        "揃っていないものは「今日」のお待たせ中に出ます。この画面を見に来なくても気づけます。",
        "本番後にできるもの（写真・納品データ）は、期日が来るまで急ぎに出しません。",
      ],

      collabPresence: [
        { name: "寺井 赳博", initial: "寺", bg: "#eaf4fb", fg: "#005bac" },
        { name: "佐々木 遥", initial: "佐", bg: "#f5f3ff", fg: "#6d28d9" },
        { name: "大野 拓（外部）", initial: "大", bg: "#fff7ed", fg: "#c2410c" },
      ],

      collabMemo: [
        { text: "先方の希望：カメラ3台＋配信2系統（YouTube / Zoom）。司会は先方手配。", fg: "#1a1d24", caret: false, caretFg: "", who: "" },
        { text: "10/03 は用賀Aを仮押さえ済み。予備日は 8/15 までに本予約へ切り替える。", fg: "#1a1d24", caret: false, caretFg: "", who: "" },
        { text: "宮田様の決裁は8月頭。見積は7/29までに送る。", fg: "#1a1d24", caret: true, caretFg: "#6d28d9", who: "佐々木" },
        { text: "回線は前回と同じサンリバー音響に見積依頼中", fg: "#3c424c", caret: true, caretFg: "#c2410c", who: "大野" },
      ],

      collabChecks: [
        { label: "見積を送る", done: true, boxBd: "#005bac", boxBg: "#005bac", fg: "#5d6470", deco: "line-through", who: "寺井" },
        { label: "申込書をもらう", done: false, boxBd: "#d3d7dd", boxBg: "#fff", fg: "#1a1d24", deco: "none", who: "寺井" },
        { label: "予備日を本予約にする", done: false, boxBd: "#d3d7dd", boxBg: "#fff", fg: "#1a1d24", deco: "none", who: "佐々木" },
        { label: "Qシートの第3稿を共有する", done: true, boxBd: "#005bac", boxBg: "#005bac", fg: "#5d6470", deco: "line-through", who: "佐々木" },
        { label: "機材の出庫リストを作る", done: false, boxBd: "#d3d7dd", boxBg: "#fff", fg: "#1a1d24", deco: "none", who: "大野" },
      ],

      collabComments: [
        { name: "佐々木 遥", initial: "佐", bg: "#f5f3ff", fg: "#6d28d9", when: "10分前",
          text: "配信2系統だと回線が足りないかもしれません。前回の構成を確認します。", mention: "" },
        { name: "大野 拓", initial: "大", bg: "#fff7ed", fg: "#c2410c", when: "1時間前",
          text: "当日のカメラは3台でいけます。ただし2台目は客席側を通すので養生が必要です。", mention: "知らせる人：寺井 赳博（ベルに出ました）" },
        { name: "寺井 赳博", initial: "寺", bg: "#eaf4fb", fg: "#005bac", when: "昨日",
          text: "先方の決裁が8月頭なので、見積は7/29の午前に送ります。", mention: "" },
      ],

      collabChanges: [
        { when: "今日 17:40", what: "想定金額", before: "¥4,200,000", after: "¥4,820,000", who: "寺井" },
        { when: "今日 14:12", what: "ステージ", before: "見積提案", after: "口頭決定", who: "寺井" },
        { when: "7/23 11:05", what: "実施日", before: "10/10", after: "10/03", who: "佐々木" },
        { when: "7/18 16:30", what: "主担当", before: "佐々木 遥", after: "寺井 赳博", who: "佐々木" },
      ],

      writePlaces: [
        { place: "みんなで書くメモ", icon: "pencil", fg: "#005bac", what: "いまの状態・工程・気をつけること", keep: "書き換わる", keepFg: "#b45309",
          why: "全員で最新に保つ場所。古い内容は消していい" },
        { place: "当日までのチェック", icon: "list-checks", fg: "#005bac", what: "抜けると困る手順", keep: "書き換わる", keepFg: "#b45309",
          why: "終わったら消える。誰がやるかも横に置く" },
        { place: "コメント", icon: "message-square", fg: "#005bac", what: "社内の相談・気づき", keep: "残る", keepFg: "#197a4b",
          why: "経緯を後から読む。@で相手のベルに出る" },
        { place: "やり取りを記録", icon: "history", fg: "#005bac", what: "お客様との接点（電話・メール・打合せ）", keep: "残る", keepFg: "#197a4b",
          why: "顧客360に出る。社内の相談とは分ける" },
        { place: "変更の記録", icon: "clock", fg: "#5d6470", what: "自動（金額・日程・ステージ・担当）", keep: "残る", keepFg: "#197a4b",
          why: "人は書かない。誰がいくらに変えたかを辿るため" },
      ],

      replyDraft: [
        { text: "木村様", fg: "#1a1d24", bg: "transparent" },
        { text: "お問い合わせいただきありがとうございます。GMOグローバルスタジオの寺井です。", fg: "#1a1d24", bg: "transparent" },
        { text: "スタジオ見学のご希望をいただきました。9月中旬でご案内できる日をお調べしますので、ご都合のよい曜日と時間帯をお知らせいただけますでしょうか。", fg: "#1a1d24", bg: "transparent" },
        { text: "（ここに候補日を入れてください。AIは日程を決めません）", fg: "#b45309", bg: "#fffbeb" },
        { text: "当日は用賀のスタジオを一通りご覧いただき、配信のご相談も承ります。所要は1時間ほどです。", fg: "#1a1d24", bg: "transparent" },
        { text: "どうぞよろしくお願いいたします。", fg: "#1a1d24", bg: "transparent" },
      ],

      replyGuards: ["日程・金額・可否を断定しない", "数字を作らない", "先方の名前と敬称は元メールから取る"],

      replySteps: [
        { no: "1", label: "AIが書く", detail: "要約と分類から下書きを作ります。決められないところは空けて印を付けます。", arrow: true, bd: "#ddd6fe", numBg: "#6d28d9", numFg: "#fff" },
        { no: "2", label: "人が直す", detail: "オレンジの箇所から見ます。直した差分は自動で記録されます。", arrow: true, bd: "#fde68a", numBg: "#fef3c7", numFg: "#92400e" },
        { no: "3", label: "コピーして送る", detail: "自分のメールソフトで送ります。ONAiR は送りません。", arrow: true, bd: "#cfe4f4", numBg: "#005bac", numFg: "#fff" },
        { no: "4", label: "送ったと記録", detail: "押すとこの問い合わせが片づきます。返信までの日数も残ります。", arrow: false, bd: "#d8ecdd", numBg: "#197a4b", numFg: "#fff" },
      ],

      replyLoop: [
        { no: "1", label: "出したものを残す", detail: "下書きの全文を切り詰めずに保存します。" },
        { no: "2", label: "直したところを差分で残す", detail: "直した／直さず保存／使わなかった の3通りで記録します。" },
        { no: "3", label: "結果を紐づける", detail: "送ったか、返信までの日数、直した割合。" },
        { no: "4", label: "AIに戻す", detail: "次の下書きを作る前に、直された傾向を読ませます。" },
        { no: "5", label: "見る", detail: "ふりかえりで種類ごとの成績を見ます。" },
      ],

      replyStats: [
        { label: "無修正で送った割合", value: "34%", fg: "#3c424c" },
        { label: "直した文字の割合（平均）", value: "18%", fg: "#3c424c" },
        { label: "使わなかった割合", value: "12%", fg: "#b45309" },
      ],

      cgTemplates: [
        { name: "アワード", tag: "作る", tagBg: "#e7f6ee", tagFg: "#197a4b", opacity: "1", bd: "#005bac", bg: "#f4faff", icon: "trophy", iconBg: "#fefce8", iconFg: "#a16207",
          what: "いまのツール一式。表彰の発表、ランキング演出、アンケート連動、祝賀の演出まで含みます。",
          input: "部門・受賞者・所属・読み・写真・コメント",
          layers: ["受賞テロップ", "ランキング", "アンケート", "祝賀演出"] },
        { name: "ランキング単体", tag: "今後", tagBg: "#f2f4f7", tagFg: "#5d6470", opacity: ".55", bd: "#e6e9ed", bg: "#fff", icon: "bar-chart-3", iconBg: "#f2f4f7", iconFg: "#5d6470",
          what: "売上や投票数の順位だけを出す用途。アワードから切り出す形で足します。",
          input: "項目名・数値・単位", layers: ["ランキング"] },
        { name: "クイズ・投票", tag: "今後", tagBg: "#f2f4f7", tagFg: "#5d6470", opacity: ".55", bd: "#e6e9ed", bg: "#fff", icon: "list-checks", iconBg: "#f2f4f7", iconFg: "#5d6470",
          what: "その場で出題して結果を出す用途。参加者の入口URLが必要になります。",
          input: "問題・選択肢・正解", layers: ["出題", "集計結果"] },
        { name: "字幕スーパー", tag: "今後", tagBg: "#f2f4f7", tagFg: "#5d6470", opacity: ".55", bd: "#e6e9ed", bg: "#fff", icon: "captions", iconBg: "#f2f4f7", iconFg: "#5d6470",
          what: "登壇者の名前や翻訳字幕を常時出す用途。翻訳とつながります。",
          input: "話者・肩書き・字幕文", layers: ["下部字幕"] },
        { name: "自由テロップ", tag: "今後", tagBg: "#f2f4f7", tagFg: "#5d6470", opacity: ".55", bd: "#e6e9ed", bg: "#fff", icon: "type", iconBg: "#f2f4f7", iconFg: "#5d6470",
          what: "決まった型のない1枚もの。急な差し込みに使います。",
          input: "見出し・本文", layers: ["フリー"] },
        { name: "（あとで足す）", tag: "枠", tagBg: "#f2f4f7", tagFg: "#5d6470", opacity: ".4", bd: "#e6e9ed", bg: "#fff", icon: "plus", iconBg: "#f2f4f7", iconFg: "#5d6470",
          what: "テンプレートは4つの決めごとを外から与えるだけで増やせます。画面は作り直しません。",
          input: "—", layers: [] },
      ],

      cgTemplateDefines: [
        { what: "入れるデータ", detail: "列の名前と並び（部門・受賞者・所属・読み…）。貼り付けた表をこれに合わせます。" },
        { what: "出るレイヤー", detail: "本番の送出画面に並ぶボタン。使わないレイヤーは出しません。" },
        { what: "進める順番", detail: "ステップレール（部門→ノミネート→受賞者→ランキング→祝賀）。" },
        { what: "見た目", detail: "テロップの型と、案件のロゴから作る色・書体の候補。" },
      ],

      cgDataTabs: [
        { label: "部門と受賞者", icon: "trophy", bd: "#005bac", fg: "#005bac", count: "18", warn: "" },
        { label: "ランキング", icon: "bar-chart-3", bd: "transparent", fg: "#5d6470", count: "5", warn: "" },
        { label: "アンケート", icon: "list-checks", bd: "transparent", fg: "#5d6470", count: "3", warn: "" },
        { label: "写真", icon: "image", bd: "transparent", fg: "#5d6470", count: "", warn: "2" },
        { label: "進行（Qシートから）", icon: "file-text", bd: "transparent", fg: "#5d6470", count: "", warn: "" },
      ],

      cgImportShortcuts: ["2025年の部門構成を引き継ぐ", "去年の受賞者を除外リストに入れる", "所属名の表記を去年に合わせる"],

      cgAwardGroups: [
        { name: "最優秀賞", count: "1名", mode: "",
          rows: [
            { rank: "—", rankFg: "#5d6470", name: "宮田 涼子", org: "株式会社ミナトデジタル 宣伝部", kana: "ミヤタ リョウコ", kanaFg: "#3c424c", photo: "あり", photoBg: "#e7f6ee", photoFg: "#197a4b", state: "確認済み", stBg: "#e7f6ee", stFg: "#197a4b" },
          ] },
        { name: "部門賞（映像）", count: "3名", mode: "5位から順に出す",
          rows: [
            { rank: "1", rankFg: "#005bac", name: "大野 拓", org: "フリーランス", kana: "オオノ タク", kanaFg: "#3c424c", photo: "あり", photoBg: "#e7f6ee", photoFg: "#197a4b", state: "確認済み", stBg: "#e7f6ee", stFg: "#197a4b" },
            { rank: "2", rankFg: "#005bac", name: "髙橋 学", org: "ケイ・フーズ株式会社", kana: "タカハシ マナブ", kanaFg: "#b45309", photo: "なし", photoBg: "#fef3c7", photoFg: "#92400e", state: "要確認", stBg: "#fef3c7", stFg: "#92400e" },
            { rank: "3", rankFg: "#005bac", name: "林 さやか", org: "株式会社アオゾラ物流", kana: "（未入力）", kanaFg: "#b45309", photo: "あり", photoBg: "#e7f6ee", photoFg: "#197a4b", state: "要確認", stBg: "#fef3c7", stFg: "#92400e" },
          ] },
      ],

      cgIssues: [
        { title: "「髙橋」の字が2通りあります", detail: "受賞者リストは髙橋、顧客台帳は高橋。どちらでテロップに出しますか。", cta: "リストの字に合わせる" },
        { title: "読みが入っていません（1名）", detail: "林 さやか。AIの推定は「ハヤシ サヤカ」です。", cta: "推定を入れる" },
        { title: "写真がありません（2名）", detail: "テロップは名前だけで出ます。写真ありの型と混ざると見え方が変わります。", cta: "名前だけの型に寄せる" },
        { title: "所属が去年と違います（1名）", detail: "大野 拓：去年は「株式会社ミナトデジタル」。今年はフリーランスで届いています。", cta: "今年の表記で出す" },
      ],

      cgLookTemplates: [
        { label: "案件のロゴ色", bd: "#005bac", bg: "#f4faff", fg: "#005bac" },
        { label: "黒地・白文字", bd: "#e6e9ed", bg: "#fff", fg: "#3c424c" },
        { label: "去年と同じ", bd: "#e6e9ed", bg: "#fff", fg: "#3c424c" },
      ],

      cgReadyList: [
        { label: "受賞者の確認（残り2名）", state: "あと2件", icon: "circle-alert", fg: "#b45309" },
        { label: "リハーサルで全テロップを流す", state: "未実施", icon: "circle", fg: "#5d6470" },
        { label: "出力URLを配る（送出先3台）", state: "済み", icon: "check", fg: "#197a4b" },
        { label: "進行をQシートから読み込む", state: "済み", icon: "check", fg: "#197a4b" },
      ],

      cgLamps: [
        { label: "ランキング", state: "出ています", dot: "#f87171", bg: "#1c1418", bd: "#4a2028", fg: "#fff", subFg: "#f3c7cd" },
        { label: "字幕スーパー", state: "6分 出たまま", dot: "#f0a000", bg: "#1e1a12", bd: "#4a3a18", fg: "#fff", subFg: "#f5d9a0" },
        { label: "クイズ", state: "止まっています", dot: "#3c424c", bg: "#161b23", bd: "#2b323d", fg: "#8b939f", subFg: "#6b7480" },
      ],

      cgProgramBars: [
        { rank: "5", name: "佐々木 遥", pt: "1,240", bar: "48%", barBg: "#2f3846", fg: "#cfd5dd", nameFg: "#e8ebef" },
        { rank: "4", name: "大森 亮", pt: "1,480", bar: "58%", barBg: "#2f3846", fg: "#cfd5dd", nameFg: "#e8ebef" },
        { rank: "3", name: "林 さやか", pt: "1,910", bar: "74%", barBg: "#005bac", fg: "#fff", nameFg: "#fff" },
        { rank: "2", name: "つぎに出ます", pt: "—", bar: "0%", barBg: "#232a35", fg: "#3c424c", nameFg: "#3c424c" },
      ],

      cgSteps: [
        { label: "IDLE", sub: "透過", bg: "#161b23", bd: "#2b323d", fg: "#6b7480", subFg: "#3c424c", arrow: true },
        { label: "TITLE", sub: "済み", bg: "#161b23", bd: "#2b323d", fg: "#6b7480", subFg: "#3c424c", arrow: true },
        { label: "NOMINEES", sub: "済み", bg: "#161b23", bd: "#2b323d", fg: "#6b7480", subFg: "#3c424c", arrow: true },
        { label: "RANKS 5→2", sub: "いま出ています", bg: "#1c1418", bd: "#c7243a", fg: "#fff", subFg: "#f3c7cd", arrow: true },
        { label: "WINNER BAR", sub: "次のTAKE", bg: "#0f1a26", bd: "#005bac", fg: "#fff", subFg: "#8ec2ec", arrow: true },
        { label: "ONE SHOT", sub: "大賞", bg: "#161b23", bd: "#2b323d", fg: "#cfd5dd", subFg: "#6b7480", arrow: true },
        { label: "CELEB", sub: "紙吹雪 ・ 賞の最後", bg: "#161b23", bd: "#2b323d", fg: "#cfd5dd", subFg: "#6b7480", arrow: true },
        { label: "SURVEY No.1", sub: "連動アンケートがある賞のみ", bg: "#161b23", bd: "#2b323d", fg: "#cfd5dd", subFg: "#6b7480", arrow: false },
      ],

      cgLayerTabs: [
        { label: "ランキング", icon: "trophy", bg: "#005bac", fg: "#fff", on: true },
        { label: "字幕スーパー", icon: "subtitles", bg: "transparent", fg: "#8b939f", on: true },
        { label: "クイズ", icon: "circle-help", bg: "transparent", fg: "#8b939f", on: false },
      ],

      cgDivisions: [
        { label: "キャリア新人賞 ／ 営業部門", count: "5名", live: true, done: false, bg: "#1c1418", bd: "#c7243a", fg: "#fff" },
        { label: "キャリア新人賞 ／ 技術部門", count: "5名", live: false, done: false, bg: "#161b23", bd: "#2b323d", fg: "#cfd5dd" },
        { label: "シナジー賞 ／ 全社", count: "8名", live: false, done: false, bg: "#161b23", bd: "#2b323d", fg: "#cfd5dd" },
        { label: "ベストチーム賞 ／ 全社", count: "6チーム", live: false, done: true, bg: "#161b23", bd: "#2b323d", fg: "#6b7480" },
      ],

      cgStyles: [
        { label: "Classic", bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "Shards", bg: "#161b23", fg: "#cfd5dd", bd: "#2b323d" },
        { label: "Spotlight", bg: "#161b23", fg: "#cfd5dd", bd: "#2b323d" },
        { label: "Slit", bg: "#161b23", fg: "#cfd5dd", bd: "#2b323d" },
      ],

      cgKeys: [
        { key: "Space", what: "TAKE" },
        { key: "Esc", what: "CLEAR" },
        { key: "←", what: "1つ戻す" },
        { key: "1 2 3", what: "レイヤー切替" },
      ],

      cgUrlChoices: [
        { label: "本番（OA）に出す", hint: "TAKEした内容が映ります", on: true, limit: "", bg: "#f4faff", bd: "#cfe4f4", boxBd: "#005bac", boxBg: "#005bac" },
        { label: "次に出るものを映す（NEXT）", hint: "副調整室のモニター用", on: false, limit: "", bg: "#fff", bd: "#e6e9ed", boxBd: "#d3d7dd", boxBg: "#fff" },
        { label: "音を鳴らす", hint: "演出SEが鳴ります", on: true, limit: "1枚だけ", bg: "#f4faff", bd: "#cfe4f4", boxBd: "#005bac", boxBg: "#005bac" },
        { label: "背景を付ける", hint: "単独で全画面に出すとき。合成には使いません", on: false, limit: "", bg: "#fff", bd: "#e6e9ed", boxBd: "#d3d7dd", boxBg: "#fff" },
        { label: "英語で出す", hint: "賞・部門の英訳が未入力だと日本語のまま出ます", on: false, limit: "未訳 3件", bg: "#fff", bd: "#e6e9ed", boxBd: "#d3d7dd", boxBg: "#fff" },
      ],

      cgSources: [
        { layer: "ランキング", use: "本番（OA）・ 音を鳴らす", machine: "副調PC / OBS シーン「AWARD」", audio: "鳴ります", audioFg: "#197a4b", lang: "日本語", state: "つながっています", stateBg: "#e7f6ee", stateFg: "#197a4b" },
        { layer: "ランキング", use: "次に出るもの（NEXT）", machine: "副調PC / モニター2", audio: "—", audioFg: "#5d6470", lang: "日本語", state: "つながっています", stateBg: "#e7f6ee", stateFg: "#197a4b" },
        { layer: "字幕スーパー", use: "本番（OA）", machine: "副調PC / OBS シーン「AWARD」", audio: "—", audioFg: "#5d6470", lang: "日本語", state: "つながっています", stateBg: "#e7f6ee", stateFg: "#197a4b" },
        { layer: "クイズ", use: "本番（OA）", machine: "配信PC / vMix Input 4", audio: "—", audioFg: "#5d6470", lang: "日本語", state: "つながっています", stateBg: "#e7f6ee", stateFg: "#197a4b" },
        { layer: "ランキング", use: "本番（OA）・ 英語", machine: "予備PC（10:40 から反応なし）", audio: "—", audioFg: "#5d6470", lang: "英語", state: "切れています", stateBg: "#fee2e2", stateFg: "#b91c1c" },
      ],

      cgChecks: [
        { title: "音の出るURLは1枚だけです", detail: "2枚以上あると音が重なって鳴ります。いまは副調PCの1枚だけ", icon: "check", fg: "#197a4b", titleFg: "#1a1d24", bg: "#fff", bd: "#e6e9ed", cta: "" },
        { title: "英語の出力が切れています", detail: "予備PCが 10:40 から反応していません。英語で出す予定があるなら復帰させてください", icon: "triangle-alert", fg: "#b91c1c", titleFg: "#b91c1c", bg: "#fef6f7", bd: "#f6cdd2", cta: "URLを再発行" },
        { title: "英訳が入っていない賞が3件あります", detail: "英語で出すと、その部分は日本語のまま映ります", icon: "triangle-alert", fg: "#b45309", titleFg: "#92400e", bg: "#fffbeb", bd: "#fde68a", cta: "英訳を入れる" },
        { title: "写真が未登録のノミネートが2名います", detail: "大賞で顔が出る演出のとき、灰色の枠が映ります", icon: "triangle-alert", fg: "#b45309", titleFg: "#92400e", bg: "#fffbeb", bd: "#fde68a", cta: "写真を入れる" },
        { title: "透過の設定は出力側では見られません", detail: "背景が黒く映るときは、OBS側の「透明度を許可」がOFFです", icon: "info", fg: "#5d6470", titleFg: "#1a1d24", bg: "#fff", bd: "#e6e9ed", cta: "" },
      ],

      cgRehearsalTools: [
        { label: "ダミーのノミネートを入れる", icon: "users" },
        { label: "ポイントを自動生成", icon: "dice-5" },
        { label: "通しで流す（自動TAKE）", icon: "play" },
        { label: "SEの試聴", icon: "volume-2" },
      ],

      cgGoLive: [
        { label: "音の出るURLが1枚だけ", state: "OK", icon: "check", fg: "#197a4b" },
        { label: "出力が全部つながっている", state: "1本 切れています", icon: "triangle-alert", fg: "#b91c1c" },
        { label: "写真の未登録", state: "2名", icon: "triangle-alert", fg: "#b45309" },
        { label: "英訳の未入力", state: "3件", icon: "triangle-alert", fg: "#b45309" },
        { label: "出したままのCGがない", state: "OK", icon: "check", fg: "#197a4b" },
      ],

      cgMobileLayers: [
        { label: "ランキング", detail: "RANKS 5→2 ・ 42秒", dot: "#f87171", bg: "#1c1418", bd: "#4a2028", fg: "#fff", clear: true },
        { label: "字幕スーパー", detail: "田辺 健 ／ ケイ・フーズ ・ 6分", dot: "#f0a000", bg: "#1e1a12", bd: "#4a3a18", fg: "#fff", clear: true },
        { label: "クイズ", detail: "止まっています", dot: "#3c424c", bg: "#161b23", bd: "#2b323d", fg: "#8b939f", clear: false },
      ],

      namingPrinciples: [
        { no: "1", title: "画面の名前は名詞ひとつ", body: "「〜する」「〜のこと」を付けない。レールも見出しも短い名詞で言い切る。", example: "○ 今日／案件／タスク　✕ やることの管理" },
        { no: "2", title: "状態は「〜中」で言う", body: "誰かを待たせているのか、自分が動くのかが名前で分かるようにする。", example: "○ お待たせ中／確認待ち／進行中　✕ 行列・滞留" },
        { no: "3", title: "ルールは「ルール」と呼ぶ", body: "社内の言い回し（決めごと・お作法）を画面に持ち込まない。", example: "○ 通知のルール　✕ 通知の決めごと" },
        { no: "4", title: "業界語はそのまま、社内語は説明する", body: "現場で通じるカタカナは使う。社内だけの略語は初出に一文添える。", example: "○ プロンプター／ランダウン　△ ネタ（＋説明）" },
      ],

      namingGroups: [
        { label: "今日まわり",
          rows: [
            { before: "待たせている行列", after: "お待たせ中", why: "「行列」は人が並ぶ絵になる。待たせているのはお客様や同僚" },
            { before: "AIに投げる", after: "AIに任せる", why: "「投げる」は放り出す響き。任せて、返ってきたものを人が確定する" },
            { before: "今すべきこと／今やること", after: "次の一手", why: "案件でも自分のタスクでも同じ呼び方に統一" },
            { before: "動いている案件", after: "進行中の案件", why: "口語をキャンセル。ステージ名と並べても浮かない" },
            { before: "ゼロ状態／行列が空", after: "ぜんぶ片づいたとき", why: "空っぽの説明ではなく、その人にとっての意味で書く" },
          ] },
        { label: "機材",
          rows: [
            { before: "日々", after: "オペレーション", why: "頻度ではなく仕事の種類で名づける。貸出・返却・棚卸し・修理" },
            { before: "モノ", after: "機材台帳", why: "何がどこにあるかの台帳。カタカナにすると新人に通じない" },
          ] },
        { label: "お金",
          rows: [
            { before: "損益の流れ", after: "損益フロー", why: "図の名前として短く。並びが式であることが伝わる" },
            { before: "お金の決めごと（設定）", after: "会計のルール", why: "料金表・税・締め・固定原価が入る場所なので会計と呼ぶ" },
            { before: "3列レビュー", after: "3列レビュー", why: "そのまま。財務MTGでこの呼び方が既に定着している" },
          ] },
        { label: "そのほか",
          rows: [
            { before: "現場の道具", after: "現場ツール", why: "翻訳・インタラクティブ・CG。道具は物理的な物に聞こえる" },
            { before: "スマホの決めごと", after: "モバイルのルール", why: "端末の呼び方をそろえる（本文では「スマホ」のままで良い）" },
            { before: "書き方の5つの決めごと", after: "文章のルール（5つ）", why: "数を先に出さない。ルールであることを先に言う" },
            { before: "探し方とゼロの状態", after: "検索 と 片づいたとき", why: "章の名前も画面の名前と同じ言葉にする" },
            { before: "今日の中身", after: "投入から確定まで", why: "何の話か分かる。中身・詳細のような中身のない語を使わない" },
          ] },
      ],

      namingKeep: [
        { term: "今日／案件／タスク／お客様／予定／お金", why: "レールの6つ。実装済みで社内に浸透している。短くて誤解も無い" },
        { term: "ネタ／ヨミ", why: "営業の会話がこの言葉で回っている。初出画面に一文の説明を添える（22b）" },
        { term: "GLS番号", why: "経理と請求で使う識別子。呼び替えると突合できなくなる" },
        { term: "押し／巻き", why: "本番の現場語。置き換えると通じない" },
        { term: "Qシート／プロンプター／ランダウン", why: "放送の業界語。カタカナのまま使う" },
      ],

      namingBanned: ["行列", "決めごと", "モノ", "日々", "実行: 共用キー", "エピソード", "按分", "按分グループ", "スクリーニング", "トースト", "データがありません", "MCP／トークン／500"],

      namingKatakana: [
        { text: "現場や業界で意味が定まっているものは使う（プロンプター・ランダウン・レビュー・スタジオ）。", icon: "check", fg: "#197a4b" },
        { text: "日本語のほうが短いときは日本語にする（ステータス→状態、アサイン→担当、デッドライン→期限）。", icon: "check", fg: "#197a4b" },
        { text: "英語と社内語をカタカナで混ぜない（✕ ヨミ・パイプライン → ○ 商談ボード）。", icon: "x", fg: "#b91c1c" },
      ],

      intakeText: "井上さんから電話。60周年の式典、10/17に用賀で配信したい。見積は来週水曜の朝までに",
      intakeChips: ["議事録を貼る", "口頭の依頼をメモ", "自分のタスクを追加"],



      projectsA: [
        { stageShort: "B", avBg: "#fef3c7", avFg: "#92400e", name: "秋のブランド発表会 配信・収録", customer: "株式会社ミナトデジタル", last: "メール 昨日", cur: "¥", amt: "4,820,000" },
        { stageShort: "C", avBg: "#eaf4fb", avFg: "#005bac", name: "60周年式典 配信・収録", customer: "株式会社アオゾラ物流", last: "メール 今日", cur: "¥", amt: "2,150,000" },
        { stageShort: "A", avBg: "#e7f6ee", avFg: "#197a4b", name: "商品発表会 スタジオ収録", customer: "ケイ・フーズ株式会社", last: "打合せ 3日前", cur: "¥", amt: "1,380,000" },
        { stageShort: "D", avBg: "#e0f2fe", avFg: "#0369a1", name: "採用説明会 ライブ配信（全4回）", customer: "NKトレーディング株式会社", last: "電話 5日前", cur: "¥", amt: "960,000" },
      ],


      stateCards: [
        { title: "何もないとき（空）", when: "データが0件", icon: "inbox", iconBg: "#eaf4fb", iconFg: "#005bac",
          demoBg: "#fff", demoBd: "1px dashed #cbd2da", innerBg: "#fbfdff", demoIcon: "folder-plus", demoIconFg: "#005bac",
          demoTitle: "この会社の案件はまだありません", demoText: "問い合わせや電話があったら、ここから案件にできます。", demoCta: "案件をつくる",
          rules: ["「データがありません」で終わらせず、次にやれることを必ず1つ置く。", "検索結果が0件のときは、外すべき条件を名指しで書く（例：期間を「全件」にすると出ます）。", "権限で見えていない場合は、空ではなく権限の説明を出す。"] },
        { title: "読み込み中", when: "取得に1秒以上かかる", icon: "loader-circle", iconBg: "#f2f4f7", iconFg: "#5d6470",
          demoBg: "#fff", demoBd: "1px solid #e9ecf0", innerBg: "#fff", demoIcon: "", demoIconFg: "",
          demoTitle: "", demoText: "枠の形のまま薄い灰色で置く（骨組み表示）。画面全体をぐるぐるで覆わない。", demoCta: "",
          rules: ["前の内容を消さない。数字が更新されるまで古い数字を残し、更新中だけ薄くする。", "ぐるぐるは1秒未満なら出さない（点滅して逆に遅く見える）。", "表・カードは行の形のまま骨組みを出すので、レイアウトが飛ばない。"] },
        { title: "うまくいかなかったとき", when: "通信・サーバーのエラー", icon: "triangle-alert", iconBg: "#fee2e2", iconFg: "#b91c1c",
          demoBg: "#fff", demoBd: "1px solid #f6cdd2", innerBg: "#fef6f7", demoIcon: "triangle-alert", demoIconFg: "#c7243a",
          demoTitle: "保存できませんでした", demoText: "通信が切れたようです。入力した内容は残っています。もう一度「保存」を押してください。", demoCta: "もう一度保存する",
          rules: ["入力を消さない。「内容は残っています」と明言する。", "原因と次の一手を1文ずつ。技術用語（500・タイムアウト等）は出さない。", "何度も失敗するときだけ、管理者への連絡先を出す。"] },
        { title: "権限がないとき", when: "見る資格がない画面", icon: "lock", iconBg: "#fef3c7", iconFg: "#b45309",
          demoBg: "#fff", demoBd: "1px solid #fde68a", innerBg: "#fffbeb", demoIcon: "lock", demoIconFg: "#b45309",
          demoTitle: "この画面はあなたには開けません", demoText: "「お金」を見る権限がありません。必要なら管理者に依頼できます（何が必要かは自動で入ります）。", demoCta: "権限を依頼する",
          rules: ["白紙やエラーで突き放さない。何の権限が必要かを名前で書く。", "メニューにも出さない。開けない画面は最初から見せない。", "依頼ボタンは管理者への依頼タスクになる（口頭で頼まなくて済む）。"] },
      ],

      wordingRows: [
        { before: "実行: 共用キー", after: "AI（担当者の記録なし）", why: "認証の方式は利用者に関係ない" },
        { before: "AI (MCP経由)がこの1週間に実行した書き込みの履歴です", after: "AIがこの1週間に作ったり直したりした記録です", why: "手段ではなく結果を書く" },
        { before: "この案件はAIにより起票されました", after: "AIがメールから作った案件です。内容が合っているか見てください", why: "次のアクションまで書く" },
        { before: "確定するまで想定金額には反映されません", after: "「確定する」を押すと想定金額に入ります", why: "否定形より、押せば何が起きるか" },
        { before: "エピソード", after: "回（第1回・7月分）", why: "社内語が画面の主語になっていた" },
        { before: "按分グループ", after: "費用を分け合う案件のまとまり", why: "初見で意味が取れない" },
        { before: "二重計上スクリーニング", after: "同じ支払いが2回入っていないか調べる", why: "動作をそのまま書く" },
        { before: "ヨミ・パイプライン", after: "商談ボード（ヨミ）", why: "英語＋社内語の二重で分からない" },
        { before: "データがありません", after: "（対象ごとに）まだ1件もありません＋作る導線", why: "同じ文言を使い回さない" },
      ],

      glossary: [
        { term: "ネタ", short: "初期の見込み", def: "まだ提案していない案件のタネ。動かすか捨てるかを決める段階です。" },
        { term: "ヨミ", short: "GLS発番前の見込み全体", def: "受注できるかを「読む」段階の案件。ネタ→提案→口頭決定までを含みます。" },
        { term: "GLS番号", short: "正式な案件番号", def: "受注が固まった案件に付ける番号（GLS-A…はスタジオ、GLS-B…はビジネス）。経理と請求で使います。" },
        { term: "押し / 巻き", short: "本番の進行のズレ", def: "予定より遅れているのが「押し」、早いのが「巻き」。本番画面では赤と緑で出します。" },
      ],

      writingRules: [
        { no: "1", rule: "1文に1つのことだけ書く", example: "「AIが作りました。内容を見てください」と2文に分ける" },
        { no: "2", rule: "次のアクションを先に書く", example: "×「反映されません」→ ○「確定を押すと入ります」" },
        { no: "3", rule: "期限は何月何日何時何分まで", example: "×「金曜まで」→ ○「8/01（金）18:00 まで」" },
        { no: "4", rule: "数字で書く。感想は書かない", example: "×「順調です」→ ○「未対応 2件・最古 2日」" },
        { no: "5", rule: "技術の言葉は画面に出さない", example: "MCP・トークン・500エラー・タイムアウト は使わない" },
      ],

      reviewTabs: [
        { label: "今週", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "隔週キープ", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "月次の損益", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "営業レビュー", bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      weeklyStats: [
        { label: "営業活動", value: "38件", sub: "メール22 / 電話9 / 打合せ7", fg: "#1a1d24" },
        { label: "新しいネタ", value: "5件", sub: "うちAI取込 3件", fg: "#1a1d24" },
        { label: "受注", value: "2件", sub: "¥4,020,000", fg: "#197a4b" },
        { label: "失注", value: "1件", sub: "予算が合わず", fg: "#b91c1c" },
        { label: "確定売上", value: "¥6,180,000", sub: "先週 ¥4,240,000", fg: "#1a1d24" },
        { label: "本番・収録", value: "6件", sub: "用賀4 / 渋谷2", fg: "#1a1d24" },
        { label: "期限を守れた率", value: "82%", sub: "次アクション 38件中31件", fg: "#b45309" },
        { label: "AIがやったこと", value: "23件", sub: "うち無修正で確定 8件", fg: "#6d28d9" },
      ],

      weeklyTopics: [
        { cat: "受注", catBg: "#e7f6ee", catFg: "#197a4b", text: "ケイ・フーズの商品発表会が受注。10月に3回シリーズの相談も出ています", note: "次回は9月頭に提案", who: "寺井" },
        { cat: "現場", catBg: "#eaf4fb", catFg: "#005bac", text: "用賀の照明が1台故障。代替を手配済みで本番に影響なし", note: "", who: "大野" },
        { cat: "改善", catBg: "#f5f3ff", catFg: "#6d28d9", text: "メールからの案件起票をAIに任せ始めた。1件あたり15分ほど短縮", note: "確認の押し忘れが2件あった", who: "佐々木" },
        { cat: "課題", catBg: "#fffbeb", catFg: "#b45309", text: "見積の送付が2件遅れた。作る時間ではなく確認待ちで止まっている", note: "", who: "寺井" },
      ],

      newsRows: [
        { picked: true, pickBd: "#005bac", pickBg: "#005bac", cat: "配信", catBg: "#eaf4fb", catFg: "#005bac", title: "縦型ライブ配信の同時視聴が前年比2倍、企業イベントにも波及", source: "業界メディア ・ 7/24", ai: false },
        { picked: true, pickBd: "#005bac", pickBg: "#005bac", cat: "AI", catBg: "#f5f3ff", catFg: "#6d28d9", title: "リアルタイム字幕の多言語対応が実用水準に。展示会での導入事例", source: "技術ブログ ・ 7/23", ai: true },
        { picked: false, pickBd: "#d3d7dd", pickBg: "#fff", cat: "機材", catBg: "#fffbeb", catFg: "#b45309", title: "新型スイッチャー発表、IP伝送を標準搭載", source: "メーカー発表 ・ 7/22", ai: false },
        { picked: false, pickBd: "#d3d7dd", pickBg: "#fff", cat: "AI", catBg: "#f5f3ff", catFg: "#6d28d9", title: "生成AIによる番組ダイジェスト自動生成の実証実験", source: "放送局発表 ・ 7/21", ai: true },
      ],

      weeklyMissing: [
        { name: "大森 亮", initial: "大", bg: "#f2f4f7", fg: "#3c424c" },
        { name: "林 さやか", initial: "林", bg: "#f2f4f7", fg: "#3c424c" },
      ],

      reviewDeadlines: [
        { when: "金 12:00", what: "週次活動報告の確定", who: "全員", fg: "#b45309" },
        { when: "8/05", what: "請求書の発行（6件）", who: "経理", fg: "#3c424c" },
        { when: "8/07", what: "隔週キープ資料", who: "寺井", fg: "#3c424c" },
        { when: "8/10", what: "7月の月次損益の確定", who: "経理", fg: "#3c424c" },
      ],

      keepEvents: [
        { name: "株主総会 ライブ配信", meta: "6/27 ・ エヌ・ワイ商事 ・ GLS-A104", cur: "¥", amt: "2,640,000", gp: "粗利 38%", state: "未作成", stateBg: "#fee2e2", stateFg: "#b91c1c", cta: "トピックを書く", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
        { name: "春の新製品発表会 追加収録", meta: "7/04 ・ ミナトデジタル ・ GLS-B004", cur: "¥", amt: "1,240,000", gp: "粗利 41%", state: "未作成", stateBg: "#fee2e2", stateFg: "#b91c1c", cta: "トピックを書く", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
        { name: "定期内覧会（第3回）", meta: "7/25 ・ 来場 14名 ・ 写真 8枚", cur: "", amt: "—", gp: "—", state: "未作成", stateBg: "#fee2e2", stateFg: "#b91c1c", cta: "トピックを書く", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
        { name: "社内表彰式 配信", meta: "6/13 ・ GMOインターネットグループ ・ GLS-A121", cur: "¥", amt: "3,180,000", gp: "粗利 44%", state: "確定", stateBg: "#e7f6ee", stateFg: "#197a4b", cta: "内容を見る", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
      ],

      keepPl: [
        { label: "売上", actual: "¥23,800,000", target: "¥22,000,000", judge: "○", judgeFg: "#197a4b" },
        { label: "粗利", actual: "¥9,680,000", target: "¥9,000,000", judge: "○", judgeFg: "#197a4b" },
        { label: "販管費", actual: "¥5,280,000", target: "¥5,000,000", judge: "✕", judgeFg: "#b91c1c" },
        { label: "営業利益", actual: "¥1,840,000", target: "¥2,400,000", judge: "✕", judgeFg: "#b91c1c" },
      ],

      keepMinutes: [
        { date: "7/24 朝会", text: "見積の確認待ちが詰まっている。AIの下書きを当日中に確定する運用に変更。" },
        { date: "7/17 定例", text: "10月は用賀が埋まりやすいので、仮押さえの期限を2週間に短縮する。" },
        { date: "7/10 定例", text: "外部パートナーの権限は「参加案件のみ」に統一。金額は出さない方針を確認。" },
      ],

      roleTemplates: [
        { label: "営業", icon: "trending-up", detail: "案件・お客様・予定・お金（見るだけ）", fg: "#1a1d24", bg: "#fff", bd: "#e6e9ed", current: false },
        { label: "制作・技術", icon: "wrench", detail: "案件・予定・Qシート・機材・技術資料", fg: "#1a1d24", bg: "#fff", bd: "#e6e9ed", current: false },
        { label: "外部パートナー", icon: "users", detail: "自分の予定とタスク、参加する案件だけ", fg: "#005bac", bg: "#f4faff", bd: "#005bac", current: true },
        { label: "経理", icon: "piggy-bank", detail: "お金の全部と取込、案件は見るだけ", fg: "#1a1d24", bg: "#fff", bd: "#e6e9ed", current: false },
        { label: "管理者", icon: "shield-check", detail: "すべて。設定と権限も触れます", fg: "#1a1d24", bg: "#fff", bd: "#e6e9ed", current: false },
      ],

      permLevels: ["見えない", "見るだけ", "書ける", "任せる"],

      permRows: [
        { label: "案件", note: "案件・見積・やり取り", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "お客様", note: "会社・連絡先・接点", cells: [
          { mark: "○", bg: "#f2f4f7", fg: "#3c424c", bd: "#cbd2da" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "タスク", note: "自分のタスクと依頼", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "予定（スタジオ）", note: "スタジオ予約カレンダー", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "予定（自分・パートナー）", note: "代休・有給・出張・リモート", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "お金", note: "売上・仕入・販管費・損益", cells: [
          { mark: "○", bg: "#f2f4f7", fg: "#3c424c", bd: "#cbd2da" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "Qシート", note: "台本の作成と本番進行", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "機材", note: "台帳・貸出・棚卸し", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "技術資料", note: "カメラ・映像・音声の仕様書", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "計時LIVE", note: "タイマー・視聴者カウンター", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "リアルタイムCG", note: "字幕・クイズ・ランキング送出", cells: [
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "○", bg: "#eaf4fb", fg: "#005bac", bd: "#005bac" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "日常業務", note: "問い合わせ・見積請求・内覧会", cells: [
          { mark: "○", bg: "#f2f4f7", fg: "#3c424c", bd: "#cbd2da" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
        { label: "設定・権限", note: "マスターとユーザー管理", cells: [
          { mark: "○", bg: "#f2f4f7", fg: "#3c424c", bd: "#cbd2da" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" },
          { mark: "", bg: "#fff", fg: "#5d6470", bd: "#e6e9ed" }] },
      ],

      permPreview: [
        { label: "今日", icon: "sun", state: "出る", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac", stateFg: "#005bac" },
        { label: "案件", icon: "folder-kanban", state: "参加する案件だけ", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac", stateFg: "#005bac" },
        { label: "タスク", icon: "list-checks", state: "出る（書ける）", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac", stateFg: "#005bac" },
        { label: "予定", icon: "calendar", state: "出る", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac", stateFg: "#005bac" },
        { label: "お客様", icon: "building-2", state: "出ない", bg: "#fafbfc", bd: "#e6e9ed", fg: "#5d6470", stateFg: "#5d6470" },
        { label: "お金", icon: "piggy-bank", state: "出ない", bg: "#fafbfc", bd: "#e6e9ed", fg: "#5d6470", stateFg: "#5d6470" },
      ],

      permWarnings: [
        "「見るだけ」でも金額は出ます。外部の方に金額を見せたくない案件は、案件側で金額を隠す設定を使ってください。",
        "2要素認証が未設定です。外部の方には設定を必須にすることをおすすめします。",
        "案件の参加メンバーから外すと、この人には案件そのものが見えなくなります（権限とは別の判定です）。",
      ],

      permHistory: [
        { what: "権限を「外部パートナー」に変更（寺井）", when: "2026/07/20 10:12" },
        { what: "機材を「書ける」に個別変更（寺井）", when: "2026/07/20 10:13" },
        { what: "招待メールを送信", when: "2026/07/19 18:40" },
      ],

      settingGroups: [
        { label: "人と権限", icon: "user-cog", bg: "#eaf4fb", fg: "#005bac", bd: "#cfe4f4", admin: true,
          items: ["ユーザー", "役割テンプレート", "2要素認証の必須化", "招待とログイン履歴"] },
        { label: "お客様・取引先", icon: "building-2", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed", admin: false,
          items: ["請求先・支払条件", "仕入先", "パートナー会社", "適格請求書の登録番号"] },
        { label: "スタジオと部屋", icon: "calendar-days", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed", admin: false,
          items: ["拠点（用賀・渋谷・青山）", "部屋", "予約の種別と色", "カレンダー連携・サイネージ"] },
        { label: "機材のマスター", icon: "package", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed", admin: false,
          items: ["保管場所とラック", "メーカー", "機材色", "貸出カテゴリ・表示設定", "カスタム列"] },
        { label: "会計のルール", icon: "piggy-bank", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed", admin: false,
          items: ["料金表", "固定原価プロジェクト", "消費税と締めの規則", "決算CSVの取込", "二重計上の整理"] },
        { label: "Qシートのマスター", icon: "file-text", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed", admin: false,
          items: ["マイクCh", "LED/XR シーン", "立ち位置図テンプレート", "人物・映像・音声の候補"] },
        { label: "AIと連携", icon: "sparkles", bg: "#f5f3ff", fg: "#6d28d9", bd: "#ddd6fe", admin: true,
          items: ["AIコネクタ（MCP）", "AIが触れる範囲", "AIがやったこと（監査）", "Box・Slack・カレンダー連携"] },
        { label: "システム", icon: "server", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed", admin: true,
          items: ["データを見る", "バックアップ", "バージョン履歴", "利用マニュアル"] },
      ],

      settingRemoved: [
        "取引先マスター（案件管理と財務の2か所）",
        "仕入先／パートナー",
        "料金表",
        "保管場所・メーカー・機材色・貸出機材設定",
        "決算インポート／二重計上スクリーニング",
        "システム管理の4メニュー",
      ],

      spTodayCounts: [
        { value: "2", label: "期限を過ぎた", fg: "#c7243a", bd: "#f6cdd2" },
        { value: "5", label: "今日が期限", fg: "#b45309", bd: "#fde68a" },
        { value: "2", label: "AIの確認待ち", fg: "#6d28d9", bd: "#ddd6fe" },
      ],

      spQueue: [
        { kind: "期限超過", tagBg: "#fee2e2", tagFg: "#b91c1c", elapsed: "2日", elapsedBg: "#fee2e2", elapsedFg: "#b91c1c", edge: "#c7243a", bd: "#f6cdd2",
          title: "ミナトデジタル様に見積を送る", sub: "秋のブランド発表会 ・ 7/23 18:00 の約束", cta: "見積を送る", alt: "もう送った" },
        { kind: "AI作成", tagBg: "#f5f3ff", tagFg: "#6d28d9", elapsed: "18時間", elapsedBg: "#fef3c7", elapsedFg: "#b45309", edge: "#7c3aed", bd: "#ddd6fe",
          title: "60周年式典 配信・収録", sub: "アオゾラ物流 ・ 金額と日程が入っています", cta: "中身を見る", alt: "あとで" },
        { kind: "見積・請求", tagBg: "#fef3c7", tagFg: "#92400e", elapsed: "9時間", elapsedBg: "#fef3c7", elapsedFg: "#b45309", edge: "#f0a000", bd: "#fde68a",
          title: "請求書 ¥418,000 の内容確認", sub: "サンリバー音響 ・ 二重計上の疑いあり", cta: "確認する", alt: "却下" },
      ],

      spTodayField: [
        { time: "8:00", title: "機材 8点を出す", place: "用賀 STUDIO A", dot: "#005bac" },
        { time: "13:00", title: "ケイ・フーズ 商品発表会 本番", place: "用賀 STUDIO A", dot: "#c7243a" },
        { time: "18:00", title: "採用説明会 リハーサル", place: "渋谷 STUDIO", dot: "#f0a000" },
      ],

      spTabsToday: [
        { label: "今日", icon: "sun", fg: "#005bac", badge: "6" },
        { label: "案件", icon: "folder-kanban", fg: "#5d6470", badge: "" },
        { label: "タスク", icon: "list-checks", fg: "#5d6470", badge: "3" },
        { label: "予定", icon: "calendar", fg: "#5d6470", badge: "" },
        { label: "検索", icon: "search", fg: "#5d6470", badge: "" },
      ],

      spSearchRecent: [
        { title: "商品発表会 スタジオ収録", sub: "ケイ・フーズ ・ 10/02 本番", icon: "folder-kanban", bg: "#eaf4fb", fg: "#005bac" },
        { title: "株式会社ミナトデジタル", sub: "宮田 涼子 様 ・ 見積を待たせています", icon: "building-2", bg: "#eaf4fb", fg: "#005bac" },
        { title: "ケイ・フーズ 商品発表会 進行台本", sub: "Qシート 第3稿", icon: "file-text", bg: "#fff1f2", fg: "#e11d48" },
      ],

      spSearchActionsShort: [
        { label: "やり取りを記録する", hint: "電話・打合せの内容。案件は後から付けられます", icon: "pencil" },
        { label: "機材を貸出登録・返す", hint: "QRスキャン", icon: "qr-code" },
        { label: "予定を入れる", hint: "スタジオ予約・自分の予定", icon: "calendar-plus" },
      ],

      spSearchActions: [
        { label: "やり取りを記録する", hint: "電話・打合せの内容。案件は後から付けられます", icon: "pencil" },
        { label: "機材を貸出登録・返す", hint: "QRスキャン", icon: "qr-code" },
        { label: "予定を入れる", hint: "スタジオ予約・自分の予定", icon: "calendar-plus" },
        { label: "案件をつくる", hint: "ネタとして起票", icon: "folder-plus" },
      ],

      spSearchPlaces: [
        { label: "お客様", icon: "building-2" },
        { label: "お金", icon: "piggy-bank" },
        { label: "機材", icon: "package" },
        { label: "Qシート", icon: "file-text" },
        { label: "ふりかえり", icon: "clipboard-list" },
        { label: "設定", icon: "settings" },
      ],

      spTabsSearch: [
        { label: "今日", icon: "sun", fg: "#5d6470", badge: "6" },
        { label: "案件", icon: "folder-kanban", fg: "#5d6470", badge: "" },
        { label: "タスク", icon: "list-checks", fg: "#5d6470", badge: "3" },
        { label: "予定", icon: "calendar", fg: "#5d6470", badge: "" },
        { label: "検索", icon: "search", fg: "#005bac", badge: "" },
      ],

      spSheetFacts: [
        { label: "お客様", value: "株式会社ミナトデジタル" },
        { label: "担当者", value: "宮田 涼子 様（宣伝部）" },
        { label: "想定金額", value: "¥4,820,000" },
        { label: "実施日", value: "2026/10/03（土）用賀 A" },
      ],

      spSheetLog: [
        { subject: "見積のご確認について", meta: "メール 7/23 11:40 ・ 宮田様", icon: "mail", bg: "#f5f3ff", fg: "#6d28d9" },
        { subject: "内容確定。カメラ3台＋配信で進める", meta: "打合せ 7/18 14:00 ・ 寺井", icon: "users", bg: "#fff7ed", fg: "#ea580c" },
      ],

      spSheetDue: ["明日 18:00", "3日後 18:00", "日時を選ぶ"],

      spFieldCounts: [
        { value: "412", label: "確認できた", fg: "#4ade80" },
        { value: "3", label: "見つからない", fg: "#f87171" },
        { value: "189", label: "のこり", fg: "#cfd5dd" },
      ],

      spFieldActions: [
        { label: "手で入れる", icon: "keyboard" },
        { label: "見つからない一覧", icon: "search-x" },
        { label: "中断する", icon: "pause" },
      ],

      spLiveMicsNow: [
        { label: "Ch3 ON", bg: "#3a1417", fg: "#fca5a5" },
        { label: "Ch1 STBY", bg: "#3a2c12", fg: "#fcd34d" },
        { label: "Ch2 OFF", bg: "#1c222c", fg: "#8b939f" },
      ],

      spLiveMicsNext: [
        { label: "Ch3 ON", bg: "#3a1417", fg: "#fca5a5" },
        { label: "Ch1 STBY", bg: "#3a2c12", fg: "#fcd34d" },
        { label: "客席マイク", bg: "#0f2337", fg: "#8ec2ec" },
      ],

      spLiveToggles: [
        { label: "文字を大きく", icon: "type", bg: "#161b23", fg: "#cfd5dd", bd: "#2b323d" },
        { label: "一覧を見る", icon: "list", bg: "#161b23", fg: "#cfd5dd", bd: "#2b323d" },
        { label: "画面を消さない", icon: "lock-open", bg: "#0f2337", fg: "#8ec2ec", bd: "#005bac" },
      ],

      spRules: [
        { title: "主操作は下半分に置く", icon: "hand", bg: "#eaf4fb", fg: "#005bac",
          body: "押すものは画面の下から400px以内。上半分は読むだけにする。ヘッダーの右上に「保存」だけを置かない（親指が届かない）。",
          no: "右上だけにある確定ボタン" },
        { title: "終わらせるのはシートで", icon: "panel-bottom", bg: "#eaf4fb", fg: "#005bac",
          body: "一覧の行から画面遷移させない。下から出るシートで確定し、終わったら次の1件を入れる。戻ったときに位置を失わせない。",
          no: "行タップ→別画面→戻ると先頭に戻る" },
        { title: "1画面に1つのことだけ", icon: "square", bg: "#eaf4fb", fg: "#005bac",
          body: "PCの2〜3カラムは縦に積まず、優先度の低い列は畳む。案件の入力フォームは既定で閉じ、「案件の中身を開いて直す」で開く。",
          no: "PCの右カラムをそのまま下に流す" },
        { title: "セーフエリアを空ける", icon: "smartphone", bg: "#eaf4fb", fg: "#005bac",
          body: "下タブの下に22px、上は48px以上。固定のボタンはホームバーと重ねない。横向きでも下タブは同じ位置に出す。",
          no: "画面の最下端に貼り付けたボタン" },
        { title: "入力は端末に任せる", icon: "keyboard", bg: "#eaf4fb", fg: "#005bac",
          body: "金額は数字キーパッド、日付は端末のピッカー、音声はキーボードのマイク。期限は「明日18:00／3日後18:00／日時を選ぶ」のプリセットを先に出す。",
          no: "自作の録音UI・自作の日付ホイール" },
        { title: "電波が弱い前提で作る", icon: "cloud-off", bg: "#eaf4fb", fg: "#005bac",
          body: "現場の記録（棚卸し・返却・出庫）は端末に溜めて後で送る。送信中も操作を止めない。アプリを閉じても消えない。",
          no: "1件ごとに通信して失敗で止まる" },
        { title: "本番中は画面を消さない", icon: "radio", bg: "#fef2f2", fg: "#c7243a",
          body: "役割URLを開いている間は自動ロックを止める。暗い配色にして、いま／つぎの2枚だけを大きく出す。切断は赤で明示する。",
          no: "切れているのに緑のまま" },
        { title: "スワイプに意味を持たせない", icon: "move-horizontal", bg: "#f2f4f7", fg: "#3c424c",
          body: "横スワイプで完了・削除は割り当てない（手袋と片手では誤爆する）。押す場所を見せる。引き下げの更新だけは入れる。",
          no: "スワイプでしか出せない操作" },
      ],

      spNotOnPhone: [
        { label: "お客様", why: "列が多く読めない", icon: "building-2" },
        { label: "お金", why: "表が横に伸びる", icon: "piggy-bank" },
        { label: "設定・権限", why: "落ち着いて触るもの", icon: "settings" },
        { label: "ガント", why: "PCで見る（リストへ誘導）", icon: "chart-gantt" },
        { label: "3列レビュー", why: "MTG用の印刷向き", icon: "columns-3" },
        { label: "Qシートの編集", why: "本番の受け取りだけ出す", icon: "file-text" },
      ],

      spProjectFacts: [
        { label: "想定", value: "¥482万", fg: "#1a1d24" },
        { label: "仕入", value: "¥124万", fg: "#1a1d24" },
        { label: "粗利", value: "74%", fg: "#197a4b" },
      ],

      spTimeline: [
        { subject: "見積のご確認について", meta: "メール 7/23 11:40 ・ 宮田様 ・ AI取込", icon: "mail", bg: "#f5f3ff", fg: "#6d28d9" },
        { subject: "内容確定。カメラ3台＋配信で進める", meta: "打合せ 7/18 14:00 ・ 寺井", icon: "users", bg: "#fff7ed", fg: "#ea580c" },
        { subject: "10/03で仮押さえ。予算は500万前後", meta: "電話 7/02 16:20 ・ 寺井", icon: "phone", bg: "#fff7ed", fg: "#ea580c" },
      ],

      spProjectTools: [
        { label: "予定を見る", icon: "calendar" },
        { label: "機材", icon: "package" },
        { label: "Qシート", icon: "file-text" },
        { label: "BOX", icon: "folder-open" },
      ],

      spTabs: [
        { label: "今日", icon: "sun", fg: "#5d6470", badge: "6" },
        { label: "案件", icon: "folder-kanban", fg: "#005bac", badge: "" },
        { label: "タスク", icon: "list-checks", fg: "#5d6470", badge: "3" },
        { label: "予定", icon: "calendar", fg: "#5d6470", badge: "" },
        { label: "検索", icon: "search", fg: "#5d6470", badge: "" },
      ],

      spTabsTask: [
        { label: "今日", icon: "sun", fg: "#5d6470", badge: "6" },
        { label: "案件", icon: "folder-kanban", fg: "#5d6470", badge: "" },
        { label: "タスク", icon: "list-checks", fg: "#005bac", badge: "3" },
        { label: "予定", icon: "calendar", fg: "#5d6470", badge: "" },
        { label: "検索", icon: "search", fg: "#5d6470", badge: "" },
      ],

      spTabsCal: [
        { label: "今日", icon: "sun", fg: "#5d6470", badge: "6" },
        { label: "案件", icon: "folder-kanban", fg: "#5d6470", badge: "" },
        { label: "タスク", icon: "list-checks", fg: "#5d6470", badge: "3" },
        { label: "予定", icon: "calendar", fg: "#005bac", badge: "" },
        { label: "検索", icon: "search", fg: "#5d6470", badge: "" },
      ],

      spTaskScopes: [
        { label: "自分", count: 14, bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "案件", count: 62, bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "全体", count: 128, bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      spTaskRows: [
        { title: "ミナトデジタル様に見積を送る", where: "秋のブランド発表会 配信・収録", due: "2日超過", dueFg: "#b91c1c", score: "9", scoreBg: "#fee2e2", scoreFg: "#b91c1c", bd: "#f6cdd2" },
        { title: "内覧会の来場者リストを共有する", where: "定期内覧会（第3回）・ 大野さんの依頼", due: "今日 18:00", dueFg: "#b45309", score: "6", scoreBg: "#fef3c7", scoreFg: "#92400e", bd: "#e6e9ed" },
        { title: "AIが作った案件の中身を見る", where: "60周年式典 配信・収録", due: "今日 18:00", dueFg: "#b45309", score: "6", scoreBg: "#fef3c7", scoreFg: "#92400e", bd: "#e6e9ed" },
        { title: "10月分の香盤表をつくる", where: "商品発表会 スタジオ収録", due: "7/31 17:00", dueFg: "#3c424c", score: "4", scoreBg: "#eaf4fb", scoreFg: "#005bac", bd: "#e6e9ed" },
        { title: "週次報告のトピックを1行書く", where: "案件なし（自分のタスク）", due: "8/01 12:00", dueFg: "#3c424c", score: "3", scoreBg: "#eaf4fb", scoreFg: "#005bac", bd: "#e6e9ed" },
      ],

      spDayTabs: [
        { label: "今日", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "明日", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "今週", bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      spDayItems: [
        { time: "8:00", tag: "出庫", tagBg: "#eaf4fb", tagFg: "#005bac", title: "機材 8点を出す（カメラ3台＋音声一式）", place: "用賀 STUDIO A", note: "返却予定 10/02 20:00", edge: "#005bac" },
        { time: "10:00", tag: "リハ", tagBg: "#fffbeb", tagFg: "#b45309", title: "ケイ・フーズ 商品発表会 リハーサル", place: "用賀 STUDIO A ・ 大野（外部）同行", note: "", edge: "#f0a000" },
        { time: "13:00", tag: "本番", tagBg: "#fef2f2", tagFg: "#b91c1c", title: "ケイ・フーズ 商品発表会 収録", place: "用賀 STUDIO A", note: "Qシート 第3稿 ・ 本番画面はここから開けます", edge: "#c7243a" },
        { time: "18:00", tag: "リハ", tagBg: "#fffbeb", tagFg: "#b45309", title: "採用説明会 リハーサル", place: "渋谷 STUDIO", note: "", edge: "#f0a000" },
        { time: "終日", tag: "仮押さえ", tagBg: "#fefce8", tagFg: "#a16207", title: "秋のブランド発表会 予備日", place: "用賀 STUDIO A", note: "8/15 までに本予約へ切り替え", edge: "#f2c200" },
      ],

      notifyGroups: [
        { label: "お客様を待たせている", count: 2, icon: "triangle-alert", fg: "#b91c1c", bg: "#fee2e2", rule: "終わらせると消えます",
          items: [
            { title: "ミナトデジタル様に見積を送る", meta: "秋のブランド発表会 ・ 7/23 18:00 の約束", time: "2日", timeBg: "#fee2e2", timeFg: "#b91c1c", cta: "見積を開く", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
            { title: "NKトレーディング様に日程3案を返す", meta: "採用説明会 ライブ配信 ・ 7/24 18:00 の約束", time: "1日", timeBg: "#fee2e2", timeFg: "#b91c1c", cta: "案件を開く", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
          ] },
        { label: "依頼の返事", count: 2, icon: "inbox", fg: "#6d28d9", bg: "#f5f3ff", rule: "受ける／相談／辞退で消えます",
          items: [
            { title: "10月分の香盤表をつくる（佐々木さんから）", meta: "7/31 17:00 まで ・ 商品発表会 スタジオ収録", time: "18時間", timeBg: "#fef3c7", timeFg: "#b45309", cta: "受ける", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
            { title: "大野さんが「相談」で差し戻しました", meta: "青山スタジオの下見に同行 ・ あなたが出した依頼", time: "3時間", timeBg: "#f2f4f7", timeFg: "#5d6470", cta: "見る", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
          ] },
        { label: "AIが作ったもの（確認待ち）", count: 2, icon: "sparkles", fg: "#6d28d9", bg: "#f5f3ff", rule: "確定すると消えます",
          items: [
            { title: "アオゾラ物流 60周年式典 配信・収録", meta: "メールから作成 ・ 想定 ¥2,150,000", time: "18時間", timeBg: "#fef3c7", timeFg: "#b45309", cta: "中身を見る", ctaBg: "#005bac", ctaFg: "#fff", ctaBd: "#005bac" },
            { title: "請求書 サンリバー音響 ¥418,000", meta: "二重計上の疑いあり ・ 支払期日 08/31", time: "9時間", timeBg: "#fef3c7", timeFg: "#b45309", cta: "確認する", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
          ] },
        { label: "今日の現場", count: 1, icon: "calendar", fg: "#005bac", bg: "#eaf4fb", rule: "その日が終わると消えます",
          items: [
            { title: "ケイ・フーズ 商品発表会 本番", meta: "8:00 出庫 ・ 用賀 STUDIO A ・ 機材8点", time: "今日", timeBg: "#eaf4fb", timeFg: "#005bac", cta: "予定を見る", ctaBg: "#f4faff", ctaFg: "#005bac", ctaBd: "#cfe4f4" },
          ] },
      ],

      morningBlocks: [
        { title: "期限を過ぎているもの 2件", icon: "triangle-alert", fg: "#b91c1c", bd: "#f6cdd2", bg: "#fef6f7",
          lines: ["見積を送る（ミナトデジタル・2日超過）", "日程3案を返す（NKトレーディング・1日超過）"] },
        { title: "今日が期限のタスク 5件", icon: "calendar-clock", fg: "#b45309", bd: "#fde68a", bg: "#fffbeb",
          lines: ["内覧会の来場者リストを共有（18:00）", "AIが作った案件の中身を見る（18:00）", "ほか3件"] },
        { title: "今日の現場", icon: "calendar", fg: "#005bac", bd: "#cfe4f4", bg: "#f4faff",
          lines: ["8:00 機材出庫 8点（用賀）", "13:00 ケイ・フーズ 商品発表会 本番", "18:00 採用説明会 リハーサル（渋谷）"] },
        { title: "確認待ちのまま止まっているもの 2件", icon: "inbox", fg: "#5d6470", bd: "#e6e9ed", bg: "#fafbfc",
          lines: ["AIが作った案件 1件（18時間）", "出した依頼の返事待ち 3件（最長2日）"] },
      ],

      notifyRules: [
        { text: "トーストは作らない。見ていない瞬間に消えるものは通知として成立しないため。", icon: "x", fg: "#b91c1c" },
        { text: "溜まる場所はベル1か所。今日の画面（お待たせ中）と同じ元データを見る。", icon: "check", fg: "#197a4b" },
        { text: "消える条件は「終わった」こと。既読では消えない。", icon: "check", fg: "#197a4b" },
        { text: "朝は1通だけ。件数と期限だけを書き、感想は書かない。", icon: "check", fg: "#197a4b" },
        { text: "辞退・相談で差し戻された依頼は、依頼した人の通知に戻る（消えない）。", icon: "check", fg: "#197a4b" },
      ],

      notifyPrefs: [
        { label: "朝のまとめ（Slack）", detail: "平日 6:00 ・ 自分宛のDM", on: "#005bac", side: "right" },
        { label: "朝のまとめ（メール）", detail: "Slackを見ない人向け", on: "#d3d7dd", side: "left" },
        { label: "期限を過ぎたときのみ即時Slack", detail: "1日1回まで、まとめて送る", on: "#005bac", side: "right" },
        { label: "依頼を受けたときの即時Slack", detail: "依頼された本人にだけ", on: "#005bac", side: "right" },
      ],

      eqNowMenus: [
        { label: "貸出管理", icon: "clipboard-list", tag: "毎日", tagBg: "#eaf4fb", tagFg: "#005bac" },
        { label: "棚卸し", icon: "clipboard-check", tag: "毎日", tagBg: "#eaf4fb", tagFg: "#005bac" },
        { label: "QRスキャン", icon: "qr-code", tag: "毎日", tagBg: "#eaf4fb", tagFg: "#005bac" },
        { label: "メンテナンス", icon: "wrench", tag: "毎日", tagBg: "#eaf4fb", tagFg: "#005bac" },
        { label: "ダッシュボード", icon: "bar-chart-3", tag: "重複", tagBg: "#fee2e2", tagFg: "#b91c1c" },
        { label: "機材一覧", icon: "package", tag: "台帳", tagBg: "#f2f4f7", tagFg: "#3c424c" },
        { label: "ケーブル管理", icon: "cable", tag: "台帳", tagBg: "#f2f4f7", tagFg: "#3c424c" },
        { label: "コネクタ管理", icon: "plug", tag: "台帳", tagBg: "#f2f4f7", tagFg: "#3c424c" },
        { label: "貸出機材一覧", icon: "layers", tag: "台帳", tagBg: "#f2f4f7", tagFg: "#3c424c" },
        { label: "ラック実装", icon: "server", tag: "台帳", tagBg: "#f2f4f7", tagFg: "#3c424c" },
        { label: "貸出機材設定", icon: "settings", tag: "設定", tagBg: "#fef3c7", tagFg: "#92400e" },
        { label: "保管場所管理", icon: "map-pin", tag: "設定", tagBg: "#fef3c7", tagFg: "#92400e" },
        { label: "メーカー管理", icon: "building-2", tag: "設定", tagBg: "#fef3c7", tagFg: "#92400e" },
        { label: "機材色", icon: "palette", tag: "設定", tagBg: "#fef3c7", tagFg: "#92400e" },
      ],

      eqNewPlaces: [
        { label: "オペレーション", icon: "arrow-left-right", bg: "#eaf4fb", fg: "#005bac", bd: "#cfe4f4", freq: "毎日",
          role: "今日出す・戻す・直す。案件の予定から出庫リストが自動で出ます。",
          absorbs: "貸出管理・返却・QRスキャン・棚卸しの実施・メンテナンス記録・要注意アラート" },
        { label: "機材台帳", icon: "package", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed", freq: "週に数回",
          role: "何がどこにあるかの台帳。一覧・ラック図・ケーブル/コネクタ在庫を1つの検索で。",
          absorbs: "機材一覧・貸出機材一覧・ケーブル・コネクタ・ラック実装・Excel入出力・印刷" },
        { label: "設定", icon: "settings", bg: "#f2f4f7", fg: "#3c424c", bd: "#e6e9ed", freq: "たまに",
          role: "マスターと表示のルール。日常の画面から外します。",
          absorbs: "保管場所・拠点・種別・メーカー・機材色・貸出カテゴリ・貸出機材設定・カスタム列" },
      ],

      eqFixes: [
        "「ダッシュボード」は独立メニューをやめ、「オペレーション」の最上部に統合（同じKPIとアラートを2か所に置かない）。",
        "ケーブル・コネクタ・貸出機材一覧は別メニューではなく「機材台帳」の中の絞り込み（種別タブ）に。",
        "貸出は案件から始められるようにする（案件の「機材」タブ→出庫リスト→そのまま貸出登録）。",
        "機材IDは検索と照合のための番号なので、一覧では商品名を主に、IDは副に置く。",
      ],

      eqOverdue: [
        { code: "Y-C-00012", name: "ハンディカメラ 本体", who: "大野（外部）", project: "株主総会 ライブ配信", late: "4日超過" },
        { code: "Y-A-00043", name: "ワイヤレスマイク 2ch セット", who: "佐々木 遥", project: "採用説明会 第1回", late: "2日超過" },
        { code: "S-NW-00007", name: "配信用ルーター", who: "大森 亮", project: "社内表彰式 配信", late: "1日超過" },
      ],

      eqToday: [
        { kind: "出庫", kindBg: "#eaf4fb", kindFg: "#005bac", time: "今日 8:00", project: "商品発表会 スタジオ収録", detail: "用賀 STUDIO A ・ カメラ3台＋音声一式", count: "8点" },
        { kind: "返却", kindBg: "#e7f6ee", kindFg: "#197a4b", time: "今日 20:00", project: "定期内覧会（第3回）", detail: "用賀 ・ 三脚2本ほか", count: "4点" },
        { kind: "出庫", kindBg: "#eaf4fb", kindFg: "#005bac", time: "明日 9:00", project: "秋のブランド発表会 収録", detail: "青山 STUDIO ・ LEDパネル一式", count: "12点" },
        { kind: "返却", kindBg: "#e7f6ee", kindFg: "#197a4b", time: "明日 18:00", project: "採用説明会 リハーサル", detail: "渋谷 STUDIO ・ インカム4台", count: "6点" },
      ],

      eqRepair: [
        { code: "Y-V-00021", name: "スイッチャー 予備機", issue: "電源が入らない ・ メーカー修理見積待ち", state: "対応中", stateBg: "#fef3c7", stateFg: "#92400e" },
        { code: "Y-L-00009", name: "LEDライト（大）", issue: "調光つまみの反応が悪い", state: "報告済", stateBg: "#fee2e2", stateFg: "#b91c1c" },
        { code: "S-IC-00004", name: "インカム親機", issue: "定期点検", state: "対応中", stateBg: "#fef3c7", stateFg: "#92400e" },
      ],

      eqStock: [
        { label: "カメラ", dot: "#0284c7", outBar: "78%", text: "貸出 14 / 18台" },
        { label: "音声", dot: "#d97706", outBar: "45%", text: "貸出 18 / 40台" },
        { label: "映像", dot: "#7c3aed", outBar: "30%", text: "貸出 9 / 30台" },
        { label: "インカム", dot: "#0d9488", outBar: "100%", text: "全台 貸出中 12台" },
        { label: "照明", dot: "#ca8a04", outBar: "20%", text: "貸出 5 / 25台" },
        { label: "LED/XR", dot: "#db2777", outBar: "60%", text: "貸出 6 / 10台" },
      ],

      eqActions: [
        { label: "案件から出庫リストを作る", icon: "folder-kanban" },
        { label: "返却をまとめて記録する", icon: "check" },
        { label: "故障を報告する", icon: "wrench" },
        { label: "棚卸し用の紙を印刷する", icon: "printer" },
      ],

      qPresence: [
        { name: "寺井 赳博", initial: "寺", bg: "#eaf4fb", fg: "#005bac" },
        { name: "佐々木 遥", initial: "佐", bg: "#f5f3ff", fg: "#6d28d9" },
        { name: "大野 拓（外部）", initial: "大", bg: "#fff7ed", fg: "#c2410c" },
      ],

      qMeta: [
        { label: "放送", value: "10/02（金）" },
        { label: "収録", value: "—（生）" },
        { label: "開始", value: "13:00" },
        { label: "場所", value: "用賀 STUDIO A" },
        { label: "リハ", value: "10/01 13:00" },
      ],

      qMicSetup: [
        { ch: "Ch1", who: "司会 田辺", type: "ピンマイク", note: "本番前にバッテリー交換", state: "使う", stBg: "#e7f6ee", stFg: "#197a4b" },
        { ch: "Ch2", who: "社長 川井", type: "ピンマイク", note: "登壇時のみON", state: "使う", stBg: "#e7f6ee", stFg: "#197a4b" },
        { ch: "Ch3", who: "客席（質疑）", type: "ハンドマイク", note: "2本を渡して回す", state: "使う", stBg: "#e7f6ee", stFg: "#197a4b" },
        { ch: "Ch4", who: "開発 林", type: "ピンマイク", note: "デモ中のみ", state: "使う", stBg: "#e7f6ee", stFg: "#197a4b" },
        { ch: "Ch5", who: "—", type: "予備", note: "", state: "使わない", stBg: "#f2f4f7", stFg: "#3c424c" },
        { ch: "Ch6", who: "—", type: "予備", note: "", state: "使わない", stBg: "#f2f4f7", stFg: "#3c424c" },
      ],

      qMicRules: [
        "マイク香盤はイベントごとに違うので、この台本の中で決めます（全社共通のマスターは作りません）。",
        "使わないChは列に出しません。6ch全部を毎回見せません。",
        "似た案件の台本から「この設定を引き継ぐ」で丸ごとコピーできます（ゼロから入れません）。",
        "人の名前はこの台本の登場人物から選びます。手で打ちません。",
        "ONとSTBYの切り替えは各キューの行で指定します（この画面は割り当てだけ）。",
      ],

      qColumns: [
        { label: "シナリオ", on: true, bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "映像", on: true, bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "音声", on: true, bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "マイク香盤", on: true, bg: "#005bac", fg: "#fff", bd: "#005bac" },
        { label: "テロップ", on: false, bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "LED/XR", on: false, bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "立ち位置図", on: false, bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
        { label: "備考", on: false, bg: "#fff", fg: "#3c424c", bd: "#e6e9ed" },
      ],

      qRolls: [
        { name: "ロール1 オープニング", time: "13:00 - 13:08", tag: "", tagBg: "", tagFg: "", bg: "#f4faff", fg: "#005bac",
          rows: [
            { no: "1", dur: "0:30", bg: "#fff", speaker: "", scenario: "会場暗転。オープニングVTR", qword: "", video: "OP_VTR_v3", audio: "VTR音源", mics: [{ label: "Ch1 OFF", bg: "#f2f4f7", fg: "#5d6470" }, { label: "Ch2 OFF", bg: "#f2f4f7", fg: "#5d6470" }] },
            { no: "2", dur: "1:30", bg: "#fff", speaker: "司会 田辺", scenario: "皆さま、本日はお集まりいただきありがとうございます。ただいまより新製品発表会を開催いたします。", qword: "ありがとうございます", video: "カメラ1（司会）", audio: "BGM_A F.O.", mics: [{ label: "Ch1 ON", bg: "#fef2f2", fg: "#b91c1c" }, { label: "Ch2 STBY", bg: "#fffbeb", fg: "#b45309" }] },
            { no: "3", dur: "2:00", bg: "#fff", speaker: "社長 川井", scenario: "本日は、私たちが2年かけて開発してきた新しい商品をご紹介します。", qword: "", video: "カメラ2（登壇）", audio: "—", mics: [{ label: "Ch2 ON", bg: "#fef2f2", fg: "#b91c1c" }, { label: "Ch1 STBY", bg: "#fffbeb", fg: "#b45309" }] },
          ] },
        { name: "CM・休憩", time: "13:08 - 13:11", tag: "CM", tagBg: "#fef3c7", tagFg: "#92400e", bg: "#fffbeb", fg: "#92400e",
          rows: [
            { no: "4", dur: "3:00", bg: "#fffdf7", speaker: "", scenario: "CM（自動で次へ進みます）", qword: "", video: "CM_3本", audio: "CM音源", mics: [{ label: "全Ch OFF", bg: "#f2f4f7", fg: "#5d6470" }] },
          ] },
        { name: "ロール2 商品紹介", time: "13:11 - 13:32", tag: "", tagBg: "", tagFg: "", bg: "#f4faff", fg: "#005bac",
          rows: [
            { no: "5", dur: "4:00", bg: "#fff", speaker: "開発 林", scenario: "こちらが新商品です。まず特徴を3つご説明します。", qword: "特徴を3つ", video: "カメラ3（手元）", audio: "BGM_B F.I.", mics: [{ label: "Ch3 ON", bg: "#fef2f2", fg: "#b91c1c" }] },
            { no: "6", dur: "2:30", bg: "#fff", speaker: "", scenario: "商品紹介VTR", qword: "", video: "PRODUCT_VTR", audio: "VTR音源", mics: [{ label: "全Ch STBY", bg: "#fffbeb", fg: "#b45309" }] },
          ] },
      ],

      qAddButtons: [
        { label: "ロールを足す", icon: "plus" },
        { label: "CM・休憩", icon: "coffee" },
        { label: "VTR", icon: "film" },
        { label: "改ページ", icon: "scissors" },
      ],

      qQuickInsert: [
        { label: "前のキューからマイクを引き継ぐ", icon: "copy" },
        { label: "この台本をテンプレにする", icon: "bookmark" },
        { label: "CSVから流し込む", icon: "file-spreadsheet" },
        { label: "立ち位置図を入れる", icon: "map-pin" },
      ],

      qPeople: ["司会 田辺", "社長 川井", "開発 林", "MC 大森", "通訳 ソン"],

      qHistory: [
        { what: "キュー5の尺を 3:30 → 4:00", who: "佐々木 ・ 1分前" },
        { what: "キュー2にQワードを追加", who: "寺井 ・ 6分前" },
        { what: "ロール2に行を2つ追加", who: "大野 ・ 12分前" },
      ],

      liveRoles: [
        { label: "進行", icon: "radio", bg: "#c7243a", fg: "#fff" },
        { label: "ディレクター", icon: "list", bg: "transparent", fg: "#8b939f" },
        { label: "出演者", icon: "monitor", bg: "transparent", fg: "#8b939f" },
        { label: "音声", icon: "mic", bg: "transparent", fg: "#8b939f" },
      ],

      liveCues: [
        { no: "13", label: "商品紹介VTR", detail: "PRODUCT_VTR ・ VTR音源", badge: "", badgeBg: "", dur: "2:30", real: "2:34", bg: "#12151a", edge: "#232a35", fg: "#8b939f", subFg: "#6b7480", noFg: "#6b7480", timeFg: "#6b7480", realFg: "#6b7480" },
        { no: "14", label: "質疑の前振り", detail: "司会 田辺 ・ カメラ1", badge: "", badgeBg: "", dur: "1:00", real: "0:58", bg: "#12151a", edge: "#232a35", fg: "#8b939f", subFg: "#6b7480", noFg: "#6b7480", timeFg: "#6b7480", realFg: "#6b7480" },
        { no: "15", label: "デモ（実演）", detail: "開発 林 ・ カメラ3（手元）・ Ch3 ON", badge: "現在", badgeBg: "#c7243a", dur: "5:00", real: "3:12", bg: "#1f1418", edge: "#c7243a", fg: "#fff", subFg: "#cfd5dd", noFg: "#fff", timeFg: "#fff", realFg: "#4ade80" },
        { no: "16", label: "質疑応答", detail: "客席マイク ・ Ch3 ON / Ch1 STBY", badge: "NEXT", badgeBg: "#005bac", dur: "6:00", real: "—", bg: "#131a24", edge: "#005bac", fg: "#fff", subFg: "#cfd5dd", noFg: "#8ec2ec", timeFg: "#cfd5dd", realFg: "#6b7480" },
        { no: "17", label: "CM・休憩", detail: "自動で次へ進みます", badge: "CM", badgeBg: "#b45309", dur: "3:00", real: "—", bg: "#12151a", edge: "#232a35", fg: "#cfd5dd", subFg: "#6b7480", noFg: "#6b7480", timeFg: "#cfd5dd", realFg: "#6b7480" },
        { no: "18", label: "記念撮影", detail: "全員登壇 ・ カメラ1 引き", badge: "", badgeBg: "", dur: "2:00", real: "—", bg: "#12151a", edge: "#232a35", fg: "#cfd5dd", subFg: "#6b7480", noFg: "#6b7480", timeFg: "#cfd5dd", realFg: "#6b7480" },
        { no: "19", label: "クロージング", detail: "司会 田辺 ・ BGM_A F.I.", badge: "", badgeBg: "", dur: "1:30", real: "—", bg: "#12151a", edge: "#232a35", fg: "#cfd5dd", subFg: "#6b7480", noFg: "#6b7480", timeFg: "#cfd5dd", realFg: "#6b7480" },
      ],

      liveTimers: [
        { label: "経過", value: "3:12", fg: "#fff", bd: "#2b323d" },
        { label: "残り", value: "1:48", fg: "#4ade80", bd: "#2b323d" },
        { label: "予定尺", value: "5:00", fg: "#cfd5dd", bd: "#2b323d" },
      ],

      liveTransport: [
        { label: "前へ", icon: "chevron-left" },
        { label: "一時停止", icon: "pause" },
        { label: "リセット", icon: "rotate-ccw" },
      ],

      liveKeys: [
        { key: "Space", what: "次へ" },
        { key: "← →", what: "前 / 次" },
        { key: "P", what: "一時停止" },
        { key: "↑ ↓", what: "±1分" },
        { key: "Esc", what: "本番を終わる" },
      ],

      liveShares: [
        { label: "ディレクター", state: "2人が見ています", icon: "list", fg: "#8ec2ec" },
        { label: "出演者（プロンプター）", state: "1台", icon: "monitor", fg: "#8ec2ec" },
        { label: "音声卓", state: "1台 ・ 認証なし", icon: "mic", fg: "#f0a000" },
        { label: "紙・PDF", state: "10/01 に配布", icon: "printer", fg: "#8b939f" },
      ],

      moneyViews: [
        { label: "ふだんの表示", icon: "layout-dashboard", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "3列レビュー", icon: "columns-3", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
      ],

      reviewStrip: [
        { label: "売上", value: "¥23,800,000", pct: "", op: "−", fg: "#1a1d24" },
        { label: "変動原価", value: "¥14,120,000", pct: "", op: "=", fg: "#1a1d24" },
        { label: "粗利", value: "¥9,680,000", pct: "40.7%", op: "−", fg: "#197a4b" },
        { label: "固定原価", value: "¥2,560,000", pct: "", op: "=", fg: "#1a1d24" },
        { label: "売上総利益", value: "¥7,120,000", pct: "29.9%", op: "−", fg: "#197a4b" },
        { label: "販管費", value: "¥5,280,000", pct: "", op: "=", fg: "#1a1d24" },
        { label: "営業利益", value: "¥1,840,000", pct: "7.7%", op: "", fg: "#005bac" },
      ],

      revRows: [
        { name: "商品発表会 スタジオ収録", sub: "ケイ・フーズ ・ GLS-A118", cur: "¥", amt: "1,380,000" },
        { name: "株主総会 ライブ配信", sub: "エヌ・ワイ商事 ・ GLS-A104", cur: "¥", amt: "2,640,000" },
        { name: "月次運用（7月分）", sub: "ミナトデジタル ・ GLS-B005-2607", cur: "¥", amt: "880,000" },
        { name: "春の新製品発表会 追加収録", sub: "ミナトデジタル ・ GLS-B004", cur: "¥", amt: "1,240,000" },
        { name: "社内表彰式 配信", sub: "GMOインターネットグループ ・ GLS-A121", cur: "¥", amt: "3,180,000" },
        { name: "採用説明会 第1回", sub: "NKトレーディング ・ GLS-B009", cur: "¥", amt: "240,000" },
      ],

      varRows: [
        { name: "配信オペレーション 1名", sub: "大野（外部） ・ GLS-A118", cur: "¥", amt: "180,000", flag: "仮", url: true },
        { name: "回線費用（7月）", sub: "サンリバー音響 ・ GLS-A104", cur: "¥", amt: "418,000", flag: "", url: true },
        { name: "カメラ 3台 レンタル", sub: "東京映像機材 ・ GLS-A121", cur: "¥", amt: "264,000", flag: "", url: false },
        { name: "会場設営 一式", sub: "みなと工芸 ・ GLS-A121", cur: "¥", amt: "880,000", flag: "仮", url: true },
        { name: "字幕オペレーター 2名", sub: "フリー（大森・林） ・ GLS-B009", cur: "¥", amt: "132,000", flag: "", url: true },
      ],

      fixedRows: [
        { name: "スタジオ償却負担額（用賀）", sub: "固定原価Pj ・ 7月分", cur: "¥", amt: "1,640,000" },
        { name: "スタジオ償却負担額（渋谷）", sub: "固定原価Pj ・ 7月分", cur: "¥", amt: "520,000" },
        { name: "常設機材リース", sub: "固定原価Pj ・ 7月分", cur: "¥", amt: "280,000" },
        { name: "回線基本料", sub: "固定原価Pj ・ 7月分", cur: "¥", amt: "120,000" },
      ],

      sgaRows: [
        { name: "家賃（用賀）", sub: "7月分", cur: "¥", amt: "2,380,000", url: false },
        { name: "採用広告費", sub: "リクルーティング ・ 7月分", cur: "¥", amt: "680,000", url: true },
        { name: "SaaS利用料", sub: "Box / Slack / freee ほか", cur: "¥", amt: "412,000", url: true },
        { name: "交通費（精算）", sub: "X-Point 12件まとめ", cur: "¥", amt: "184,000", url: true },
        { name: "通信費", sub: "7月分", cur: "¥", amt: "96,000", url: false },
        { name: "備品購入", sub: "事務用品ほか", cur: "¥", amt: "64,000", url: true },
        { name: "会議費", sub: "来客対応 ほか", cur: "¥", amt: "42,000", url: true },
      ],

      calViews: [
        { label: "月", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "週", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "日", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "一覧", bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      calLayers: [
        { label: "スタジオ予約", icon: "calendar-days", bg: "#c7243a", fg: "#fff", bd: "#c7243a" },
        { label: "パートナー", icon: "users", bg: "#0d9488", fg: "#fff", bd: "#0d9488" },
        { label: "自分の予定", icon: "calendar-clock", bg: "#2563eb", fg: "#fff", bd: "#2563eb" },
      ],

      calRooms: [
        { label: "用賀", dot: "#005bac" },
        { label: "渋谷", dot: "#7c3aed" },
        { label: "青山", dot: "#0d9488" },
        { label: "外現場", dot: "#5d6470" },
      ],

      calDays: [
        { dow: "月", day: "27", fg: "#5d6470", numFg: "#1a1d24" },
        { dow: "火", day: "28", fg: "#5d6470", numFg: "#1a1d24" },
        { dow: "水", day: "29", fg: "#5d6470", numFg: "#1a1d24" },
        { dow: "木", day: "30", fg: "#5d6470", numFg: "#1a1d24" },
        { dow: "金", day: "31", fg: "#5d6470", numFg: "#1a1d24" },
        { dow: "土", day: "1", fg: "#2563eb", numFg: "#1a1d24" },
        { dow: "日", day: "2", fg: "#c7243a", numFg: "#1a1d24" },
      ],

      calLanes: [
        { name: "用賀 STUDIO A", sub: "本番スタジオ", cells: [
          { bg: "#fff", events: [{ label: "ミナトデジタル 収録", time: "9:00-18:00", edge: "#2563eb", bg: "#eff6ff", fg: "#1d4ed8", timeFg: "#3b82f6" }] },
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [{ label: "ケイ・フーズ リハ", time: "13:00-18:00", edge: "#f0a000", bg: "#fffbeb", fg: "#92400e", timeFg: "#b45309" }] },
          { bg: "#fff", events: [{ label: "ケイ・フーズ 本番", time: "8:00-20:00", edge: "#c7243a", bg: "#fef2f2", fg: "#b91c1c", timeFg: "#dc2626" }] },
          { bg: "#fff", events: [] },
          { bg: "#fafbfc", events: [{ label: "仮押さえ（予備日）", time: "終日", edge: "#f2c200", bg: "#fefce8", fg: "#a16207", timeFg: "#a16207" }] },
          { bg: "#fafbfc", events: [] },
        ] },
        { name: "用賀 STUDIO B", sub: "サブ", cells: [
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [{ label: "社内利用（研修）", time: "10:00-12:00", edge: "#5d6470", bg: "#f7f8fa", fg: "#3c424c", timeFg: "#5d6470" }] },
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [{ label: "定期内覧会（第4回）", time: "14:00-16:00", edge: "#5d6470", bg: "#f7f8fa", fg: "#3c424c", timeFg: "#5d6470" }] },
          { bg: "#fafbfc", events: [] },
          { bg: "#fafbfc", events: [] },
        ] },
        { name: "渋谷 STUDIO", sub: "配信", cells: [
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [{ label: "NK 採用説明会 放送", time: "15:00-17:00", edge: "#197a4b", bg: "#f0fdf4", fg: "#15803d", timeFg: "#16a34a" }] },
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [{ label: "メンテナンス", time: "終日", edge: "#5d6470", bg: "#f2f4f7", fg: "#3c424c", timeFg: "#5d6470" }] },
          { bg: "#fff", events: [] },
          { bg: "#fafbfc", events: [] },
          { bg: "#fafbfc", events: [] },
        ] },
        { name: "大野（外部）", sub: "パートナー", cells: [
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [{ label: "他社現場", time: "終日", edge: "#0d9488", bg: "#f0fdfa", fg: "#0f766e", timeFg: "#0d9488" }] },
          { bg: "#fff", events: [{ label: "ケイ・フーズ 本番に参加", time: "8:00-20:00", edge: "#0d9488", bg: "#f0fdfa", fg: "#0f766e", timeFg: "#0d9488" }] },
          { bg: "#fff", events: [] },
          { bg: "#fafbfc", events: [] },
          { bg: "#fafbfc", events: [] },
        ] },
        { name: "自分（寺井）", sub: "個人予定", cells: [
          { bg: "#fff", events: [{ label: "朝会", time: "9:30-10:00", edge: "#2563eb", bg: "#eff6ff", fg: "#1d4ed8", timeFg: "#3b82f6" }] },
          { bg: "#fff", events: [{ label: "ミナトデジタル 訪問", time: "14:00-15:30", edge: "#2563eb", bg: "#eff6ff", fg: "#1d4ed8", timeFg: "#3b82f6" }] },
          { bg: "#fff", events: [] },
          { bg: "#fff", events: [{ label: "現場立ち会い", time: "8:00-20:00", edge: "#2563eb", bg: "#eff6ff", fg: "#1d4ed8", timeFg: "#3b82f6" }] },
          { bg: "#fff", events: [{ label: "有給", time: "終日", edge: "#0d9488", bg: "#f0fdfa", fg: "#0f766e", timeFg: "#0d9488" }] },
          { bg: "#fafbfc", events: [] },
          { bg: "#fafbfc", events: [] },
        ] },
      ],

      calHolds: [
        { date: "8/22（土）", name: "秋のブランド発表会 予備日", room: "用賀 STUDIO A", customer: "ミナトデジタル", limit: "8/15 まで" },
        { date: "9/05（金）", name: "採用説明会 第2回", room: "渋谷 STUDIO", customer: "NKトレーディング", limit: "8/20 まで" },
        { date: "10/10（土）", name: "60周年式典 予備日", room: "用賀 STUDIO A", customer: "アオゾラ物流", limit: "9/01 まで" },
      ],

      bookingTypes: [
        { label: "本番", dot: "#c7243a" },
        { label: "リハーサル", dot: "#f0a000" },
        { label: "仮押さえ", dot: "#f2c200" },
        { label: "内覧", dot: "#94a3b8" },
        { label: "相談", dot: "#94a3b8" },
        { label: "設営/準備", dot: "#94a3b8" },
        { label: "メンテナンス", dot: "#5d6470" },
        { label: "社内利用", dot: "#94a3b8" },
        { label: "その他", dot: "#94a3b8" },
      ],

      moneyPeriods: [
        { label: "月", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "四半期", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "年", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "期間指定", bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      plFlow: [
        { label: "売上", value: "¥23,800,000", sub: "確定売上 14件", op: "−", flex: "1.25", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", subFg: "#5d6470" },
        { label: "仕入（変動原価）", value: "¥14,120,000", sub: "案件に紐づく 38件", op: "=", flex: "1.25", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", subFg: "#5d6470" },
        { label: "粗利（限界利益）", value: "¥9,680,000", sub: "40.7%", op: "−", flex: "1.25", bg: "#f7fdf9", bd: "#d8ecdd", fg: "#197a4b", subFg: "#197a4b" },
        { label: "固定原価", value: "¥2,560,000", sub: "スタジオ償却など", op: "=", flex: "1", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", subFg: "#5d6470" },
        { label: "売上総利益", value: "¥7,120,000", sub: "29.9%", op: "−", flex: "1.1", bg: "#f7fdf9", bd: "#d8ecdd", fg: "#197a4b", subFg: "#197a4b" },
        { label: "販管費", value: "¥5,280,000", sub: "案件に紐づかない", op: "=", flex: "1", bg: "#fff", bd: "#e6e9ed", fg: "#1a1d24", subFg: "#5d6470" },
        { label: "営業利益", value: "¥1,840,000", sub: "7.7% ・ 前月比 -6.2%", op: "", flex: "1.15", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac", subFg: "#005bac" },
      ],

      importSteps: [
        { no: 1, label: "取り込む", detail: "PDF・CSVを落とすか、Boxのフォルダを読む", arrow: true, bd: "#cfe4f4", bg: "#f4faff", numBg: "#005bac", numFg: "#fff" },
        { no: 2, label: "確認する", detail: "AIが読んだ値を人が見る。二重計上の疑いはここで出す", arrow: true, bd: "#e6e9ed", bg: "#fff", numBg: "#f2f4f7", numFg: "#3c424c" },
        { no: 3, label: "登録する", detail: "仕入・販管費・売上に入る。処理した人が残る", arrow: false, bd: "#e6e9ed", bg: "#fff", numBg: "#f2f4f7", numFg: "#3c424c" },
      ],

      importQueue: [
        { name: "楽-004821 サンリバー音響 ¥418,000", meta: "楽楽精算 ・ 7/25 受信 ・ AIが読み取り済み", warn: "二重計上の疑い", cta: "確認する", icon: "file-text", iconFg: "#b45309" },
        { name: "X-002190 大野 交通費 ¥12,400", meta: "X-Point ・ 7/24 受信", warn: "", cta: "確認する", icon: "file-text", iconFg: "#5d6470" },
        { name: "GLS202607仕訳帳.csv", meta: "freee 仕訳帳 ・ 明細 1,284行 ・ 税抜換算済み", warn: "管理者のみ", cta: "確認する", icon: "table-2", iconFg: "#5d6470" },
      ],

      moneyTabs: [
        { label: "売上", count: 14, bg: "#fff", fg: "#1a1d24" },
        { label: "仕入", count: 38, bg: "transparent", fg: "#5d6470" },
        { label: "固定原価", count: 4, bg: "transparent", fg: "#5d6470" },
        { label: "販管費", count: 26, bg: "transparent", fg: "#5d6470" },
      ],

      moneyRows: [
        { name: "商品発表会 スタジオ収録", meta: "ケイ・フーズ株式会社 ・ 計上 7/31 ・ GLS-A118", flag: "", cur: "¥", amt: "1,380,000" },
        { name: "株主総会 ライブ配信", meta: "エヌ・ワイ商事株式会社 ・ 計上 7/31 ・ GLS-A104", flag: "", cur: "¥", amt: "2,640,000" },
        { name: "月次運用（7月分）", meta: "株式会社ミナトデジタル ・ GLS-B005-2607", flag: "", cur: "¥", amt: "880,000" },
        { name: "配信オペレーション 1名", meta: "大野（外部） ・ 計上 7/31", flag: "仮", cur: "¥", amt: "180,000" },
        { name: "回線費用（7月）", meta: "サンリバー音響株式会社 ・ 計上 7/31", flag: "", cur: "¥", amt: "418,000" },
      ],

      moneyMonths: [
        { month: "2月", value: "¥2,140,000", bar: "72%", barFg: "#a6ceeb", fg: "#3c424c" },
        { month: "3月", value: "¥2,980,000", bar: "100%", barFg: "#005bac", fg: "#3c424c" },
        { month: "4月", value: "¥1,120,000", bar: "38%", barFg: "#a6ceeb", fg: "#3c424c" },
        { month: "5月", value: "-¥340,000", bar: "12%", barFg: "#f6cdd2", fg: "#b91c1c" },
        { month: "6月", value: "¥1,960,000", bar: "66%", barFg: "#a6ceeb", fg: "#3c424c" },
        { month: "7月", value: "¥1,840,000", bar: "62%", barFg: "#005bac", fg: "#005bac" },
      ],

      billingTasks: [
        { label: "請求書を出す", meta: "今月締め ・ 8/05 まで", count: "6件", icon: "receipt", fg: "#b45309" },
        { label: "入金の確認", meta: "支払期日 7/31", count: "4件", icon: "wallet", fg: "#3c424c" },
        { label: "検収書を出す", meta: "受注済みの案件", count: "2件", icon: "file-check", fg: "#3c424c" },
      ],

      adminOnlyTools: [
        { label: "決算CSVの取込（freee仕訳帳）", icon: "table-2" },
        { label: "二重計上の整理", icon: "copy-check" },
      ],


      toolProjectTabs: [
        { label: "概要", icon: "layout-dashboard", bd: "transparent", fg: "#5d6470" },
        { label: "やり取り", icon: "history", bd: "transparent", fg: "#5d6470" },
        { label: "お金", icon: "circle-dollar-sign", bd: "transparent", fg: "#5d6470" },
        { label: "予定", icon: "calendar", bd: "transparent", fg: "#5d6470" },
        { label: "Qシート", icon: "file-text", bd: "transparent", fg: "#5d6470" },
        { label: "翻訳", icon: "languages", bd: "#005bac", fg: "#005bac" },
        { label: "インタラクティブ", icon: "sparkles", bd: "transparent", fg: "#5d6470" },
      ],

      toolTranslateRows: [
        { name: "式次第_v3.pdf → 英語", meta: "10/03 本番用 ・ 7/24 に作成 ・ 寺井", state: "訳し終わり", stateBg: "#e7f6ee", stateFg: "#197a4b", icon: "file-text" },
        { name: "登壇者プロフィール → 英語・中国語", meta: "2言語 ・ 7/22 に作成 ・ 佐々木", state: "訳し終わり", stateBg: "#e7f6ee", stateFg: "#197a4b", icon: "file-text" },
        { name: "字幕原稿 → 英語", meta: "本番の字幕スーパー用 ・ 下書き", state: "作業中", stateBg: "#fef3c7", stateFg: "#92400e", icon: "captions" },
      ],




      toolChips: [
        { label: "⌘K から", icon: "command", fg: "#005bac" },
        { label: "案件のタブから", icon: "folder-kanban", fg: "#005bac" },
        { label: "レールには置かない", icon: "x", fg: "#b91c1c" },
        { label: "ホームにも置かない", icon: "x", fg: "#b91c1c" },
      ],

      customerRows: [
        { name: "株式会社ミナトデジタル", contact: "宮田 涼子 様（宣伝部）", initial: "ミ", avBg: "#eaf4fb", avFg: "#005bac",
          revenue: "¥18,420,000", projects: "2 / 6", last: "2日前", lastFg: "#3c424c",
          na: "見積を送る（2日超過）", naFg: "#b91c1c", naIcon: "triangle-alert" },
        { name: "ケイ・フーズ株式会社", contact: "田辺 健 様（広報）", initial: "ケ", avBg: "#e7f6ee", avFg: "#197a4b",
          revenue: "¥9,860,000", projects: "1 / 4", last: "3日前", lastFg: "#3c424c",
          na: "本予約に切り替える（8/15）", naFg: "#1d4ed8", naIcon: "calendar-clock" },
        { name: "株式会社アオゾラ物流", contact: "井上 徹 様（総務）", initial: "ア", avBg: "#eaf4fb", avFg: "#005bac",
          revenue: "¥1,880,000", projects: "1 / 2", last: "今日", lastFg: "#197a4b",
          na: "見積の下書きを確定する（明日）", naFg: "#1d4ed8", naIcon: "calendar-clock" },
        { name: "NKトレーディング株式会社", contact: "小坂 まり 様（人事）", initial: "N", avBg: "#f2f4f7", avFg: "#3c424c",
          revenue: "¥3,240,000", projects: "1 / 3", last: "5日前", lastFg: "#3c424c",
          na: "日程3案を返す（1日超過）", naFg: "#b91c1c", naIcon: "triangle-alert" },
        { name: "エヌ・ワイ商事株式会社", contact: "村瀬 直人 様（IR）", initial: "エ", avBg: "#f2f4f7", avFg: "#3c424c",
          revenue: "¥12,700,000", projects: "0 / 5", last: "41日前", lastFg: "#b45309",
          na: "次のアクションが決まっていません", naFg: "#b45309", naIcon: "triangle-alert" },
        { name: "サンリバー音響株式会社", contact: "—", initial: "サ", avBg: "#f2f4f7", avFg: "#3c424c",
          revenue: "¥0", projects: "0 / 0", last: "9時間前", lastFg: "#3c424c",
          na: "請求書の内容を確認する", naFg: "#1d4ed8", naIcon: "receipt" },
      ],

      customerTabs: [
        { label: "接点と実績", icon: "history", bd: "#005bac", fg: "#005bac", count: "" },
        { label: "案件", icon: "folder-kanban", bd: "transparent", fg: "#5d6470", count: "6" },
        { label: "請求先", icon: "receipt", bd: "transparent", fg: "#5d6470", count: "" },
        { label: "連絡先", icon: "users", bd: "transparent", fg: "#5d6470", count: "3" },
      ],

      customerTiles: [
        { label: "累計売上（確定）", value: "¥18,420,000", sub: "2021年から6件", icon: "trending-up", iconFg: "#197a4b", fg: "#1a1d24", bd: "#e6e9ed" },
        { label: "案件", value: "2 / 6", sub: "進行中 / 全体", icon: "folder-kanban", iconFg: "#005bac", fg: "#1a1d24", bd: "#e6e9ed" },
        { label: "最終接点", value: "2日前", sub: "7/23 メール（宮田様）", icon: "clock", iconFg: "#5d6470", fg: "#1a1d24", bd: "#e6e9ed" },
        { label: "待たせているもの", value: "1件", sub: "見積の送付（2日超過）", icon: "calendar-clock", iconFg: "#b91c1c", fg: "#b91c1c", bd: "#f6cdd2" },
      ],

      customerTimeline: [
        { kind: "メール", date: "07/23 11:40", who: "宮田様", ai: true, project: "秋のブランド発表会", subject: "見積のご確認について", body: "社内決裁が8月頭にあるため、それまでにいただけると助かります。", icon: "mail", iconBg: "#f5f3ff", iconBd: "#ddd6fe", iconFg: "#6d28d9" },
        { kind: "打合せ", date: "07/18 14:00", who: "寺井", ai: false, project: "秋のブランド発表会", subject: "内容確定。カメラ3台＋配信で進める", body: "配信はYouTubeとZoomの2系統。司会は先方が手配。", icon: "users", iconBg: "#fff", iconBd: "#e6e9ed", iconFg: "#ea580c" },
        { kind: "電話", date: "06/12 10:20", who: "寺井", ai: false, project: "", subject: "年末の全社総会も相談したいとのこと", body: "12/19で会場を探している。予算は300万前後。", icon: "phone", iconBg: "#fff", iconBd: "#e6e9ed", iconFg: "#ea580c" },
        { kind: "訪問", date: "05/28 15:00", who: "寺井・佐々木", ai: false, project: "", subject: "先方オフィスへ挨拶。宣伝部の体制が変わった", body: "", icon: "users", iconBg: "#fff", iconBd: "#e6e9ed", iconFg: "#ea580c" },
        { kind: "メール", date: "04/03 09:15", who: "宮田様", ai: true, project: "春の新製品発表会", subject: "無事に終わりました。ありがとうございました", body: "", icon: "mail", iconBg: "#f5f3ff", iconBd: "#ddd6fe", iconFg: "#6d28d9" },
      ],

      customerProjects: [
        { stage: "口頭決定", badgeBg: "#fef3c7", badgeFg: "#92400e", badgeBd: "#fde68a", name: "秋のブランド発表会 配信・収録", date: "2026/10/03", gls: "GLS-B012", cur: "¥", amt: "4,820,000", gp: "想定" },
        { stage: "ネタ", badgeBg: "#f7f8fa", badgeFg: "#3c424c", badgeBd: "#e6e9ed", name: "年末の全社総会 配信", date: "2026/12/19", gls: "GLS発番前", cur: "¥", amt: "3,200,000", gp: "想定" },
        { stage: "完了", badgeBg: "#f7f8fa", badgeFg: "#3c424c", badgeBd: "#e6e9ed", name: "春の新製品発表会 配信・収録", date: "2026/04/02", gls: "GLS-B004", cur: "¥", amt: "5,140,000", gp: "粗利 39%" },
        { stage: "完了", badgeBg: "#f7f8fa", badgeFg: "#3c424c", badgeBd: "#e6e9ed", name: "社内表彰式 収録", date: "2025/11/21", gls: "GLS-A091", cur: "¥", amt: "2,860,000", gp: "粗利 44%" },
      ],

      customerOpen: [
        { title: "見積を送る", due: "7/23 18:00 ・ 2日超過", bd: "#f6cdd2", bg: "#fef6f7", fg: "#b91c1c", subFg: "#b91c1c" },
        { title: "申込書をもらう", due: "8/07 18:00 まで", bd: "#e6e9ed", bg: "#fff", fg: "#1a1d24", subFg: "#5d6470" },
      ],

      customerYears: [
        { year: "2026", value: "¥5,140,000", bar: "62%", barFg: "#005bac" },
        { year: "2025", value: "¥8,240,000", bar: "100%", barFg: "#005bac" },
        { year: "2024", value: "¥3,180,000", bar: "39%", barFg: "#a6ceeb" },
        { year: "2023", value: "¥1,860,000", bar: "23%", barFg: "#a6ceeb" },
        { year: "2022", value: "¥0", bar: "2%", barFg: "#e6e9ed" },
      ],

      customerVisits: [
        { date: "2026/06/18", what: "定期内覧会（第2回）に参加", who: "宮田様 ほか2名" },
        { date: "2026/03/05", what: "用賀スタジオ 下見", who: "宮田様・制作会社2名" },
        { date: "2025/09/12", what: "定期内覧会（第5回）に参加", who: "前任の担当者" },
      ],

      sizeButtons: [
        { label: "小", h: "32px", px: "12px", r: "9px", bd: "1px solid #e6e9ed", bg: "#fff", fg: "#3c424c", fs: "12.5px", use: "表の中" },
        { label: "標準", h: "36px", px: "14px", r: "10px", bd: "1px solid #e6e9ed", bg: "#fff", fg: "#3c424c", fs: "13px", use: "行の操作" },
        { label: "見出し", h: "40px", px: "15px", r: "11px", bd: "1px solid #e6e9ed", bg: "#fff", fg: "#3c424c", fs: "13.5px", use: "上辺" },
        { label: "主ボタン", h: "44px", px: "20px", r: "11px", bd: "none", bg: "#005bac", fg: "#fff", fs: "14.5px", use: "画面の主役" },
        { label: "スマホ", h: "48px", px: "18px", r: "12px", bd: "none", bg: "#005bac", fg: "#fff", fs: "15px", use: "指で押す" },
      ],

      sizeBadgeS: [
        { label: "AI作成", bg: "#f5f3ff", bd: "#ddd6fe", fg: "#6d28d9" },
        { label: "2日", bg: "#fee2e2", bd: "#fecaca", fg: "#b91c1c" },
        { label: "仮", bg: "#fef3c7", bd: "#fde68a", fg: "#92400e" },
        { label: "GLS-B012", bg: "#f2f4f7", bd: "#e6e9ed", fg: "#5d6470" },
      ],

      sizeBadgeM: [
        { label: "A 受注済", bg: "#197a4b", bd: "#197a4b", fg: "#ffffff" },
        { label: "確認待ち", bg: "#fef3c7", bd: "#fde68a", fg: "#92400e" },
        { label: "テンプレート：アワード", bg: "#eaf4fb", bd: "#cfe4f4", fg: "#005bac" },
      ],

      stageChips: [
        { label: "ネタ", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#3c424c", ls: "0" },
        { label: "D 仮押さえ", bg: "#e0f2fe", bd: "#bae6fd", fg: "#0369a1", ls: "-.02em" },
        { label: "C 見積提案", bg: "#005bac", bd: "#005bac", fg: "#ffffff", ls: "-.01em" },
        { label: "B 口頭決定", bg: "#fef3c7", bd: "#fde68a", fg: "#92400e", ls: "-.01em" },
        { label: "A 受注済", bg: "#197a4b", bd: "#197a4b", fg: "#ffffff", ls: "0" },
        { label: "完了", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#3c424c", ls: "0" },
      ],

      sizeRules: [
        "高さは 22 / 26（バッジ）と 32 / 36 / 40 / 44 / 48（ボタン）だけ。中間の値を作らない。",
        "バッジは padding で高さを作らない。高さを決めて中央寄せにする（文字数で高さが変わらない）。",
        "表の中のバッジは幅も固定する。右隣の要素の始まりが行ごとにずれない。",
        "幅を固定したバッジは中の文字も均等割り付け（62px）にする。ただし和文2字以上に限る — 1字とラテン略語（AI・GLS）は中央寄せ（A I と割れて読めなくなる）。",
        "収まらない語は字間を −0.01〜0.02em 詰めて収める。文字サイズは下げない（読みにくくなる）。",
        "アイコン＋文字のボタンは gap 7〜8px、アイコンは文字サイズ＋2px。",
        "並ぶボタンは同じ高さ。主ボタンだけ色で立て、大きさでは差を付けない。",
      ],

      detailRules: [
        { what: "アイコンの大きさ", rule: "14 / 16 / 18 / 20 / 22px の5段だけ。文字サイズ＋2px を目安に", why: "15や17pxが混ざると、行の高さが1〜2px ずれて見える" },
        { what: "経過時間のバッジ", rule: "幅56px・高さ22pxで固定。中央に置く", why: "「2日」と「18時間」で幅が変わると、右隣の要素の始まりがずれる" },
        { what: "行の余白", rule: "上下12px・左右16または18px", why: "11pxと13pxが混ざると、カードを並べたとき境界線が横に通らない" },
        { what: "カードの見出しの帯", rule: "高さ48px以上で固定。補足の有無で変えない", why: "左右に並べたカードの中身の開始位置が揃う" },
        { what: "進捗バーとドット", rule: "バーは高さ10px、ドットは直径9px", why: "8・16・18pxが混在すると、同じ意味のものが違って見える" },
        { what: "表の列幅", rule: "56 / 72 / 96 / 128 / 160 / 200 / 240px の7段", why: "章をまたいでも表の骨格が揃う。中間値を作らない" },
      ],

      moneySample: [
        { label: "秋のブランド発表会 配信・収録", plain: "¥4,820,000", cur: "¥", amt: "4,820,000" },
        { label: "商品発表会 スタジオ収録", plain: "¥1,380,000", cur: "¥", amt: "1,380,000" },
        { label: "採用説明会 ライブ配信", plain: "¥960,000", cur: "¥", amt: "960,000" },
        { label: "字幕オペレーター 2名", plain: "¥132,000", cur: "¥", amt: "132,000" },
      ],

      sizeNumbers: [
        { kind: "金額", rule: "¥は左端・数字は右端・桁区切りあり", ok: "¥ 4,820,000", ng: "4820000円", why: "桁が縦に揃い、合計との比較がすぐできる" },
        { kind: "日付", rule: "M/D（曜）。年は必要なときだけ", ok: "10/03（土）", ng: "2026年10月3日", why: "幅が一定になり、列で揃う" },
        { kind: "時刻", rule: "H:MM。24時間表記", ok: "13:00", ng: "午後1時", why: "並べたときに縦の位置が合う" },
        { kind: "期限", rule: "M/D H:MM まで", ok: "8/01 18:00 まで", ng: "金曜まで", why: "何時までかを必ず書く" },
        { kind: "経過", rule: "分・時間・日で1単位だけ", ok: "2日 / 18時間", ng: "2日3時間20分", why: "急ぎかどうかだけ分かればよい" },
        { kind: "件数", rule: "半角数字＋件（単位は文字）", ok: "34件", ng: "３４件", why: "全角は幅が変わり揃わない" },
      ],

      aiTiers: [
        { label: "AIが黙ってやる", icon: "zap", fg: "#197a4b", bg: "#e7f6ee", bd: "#d8ecdd",
          rule: "取り違えても損が出ない転記と分類。メールの取り込み、会社名の突合、機材の出し入れの見込み、ニュースの収集。",
          ui: "結果だけ出す。やったことは「AIがやったこと」に残す。" },
        { label: "AIが下書き、人が確定", icon: "sparkles", fg: "#6d28d9", bg: "#f5f3ff", bd: "#ddd6fe",
          rule: "作るのに時間がかかるもの、決まっていないことを含むもの。案件の起票、見積、香盤表、会場図面、マニュアル、返信文。",
          ui: "紫の「AI作成・確認待ち」バッジ。AIが推測した箇所はオレンジ。確定するまで相手に出ない。" },
        { label: "人だけが決める", icon: "user", fg: "#1a1d24", bg: "#f2f4f7", bd: "#e6e9ed",
          rule: "確定的な時間と金額、そして約束。本予約、請求金額、値引き、受注・失注、お客様への送信。",
          ui: "AIは候補を並べるところまで。押すのは必ず人。" },
      ],

      aiUsage: [
        { where: "今日（投入欄）", input: "電話のメモ・議事録・転送メール", output: "案件・タスク・予約の下書き（宛先と期限つき）", human: "内容を見て確定。読めなかった項目を選ぶ", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "お待たせ中", input: "溜まっているメールと書類", output: "種別の判定・経過時間・次の一手の候補", human: "終端まで進める（送る・承認する・返す）", tier: "自動", tierBg: "#e7f6ee", tierFg: "#197a4b" },
        { where: "案件（起票）", input: "「用賀 10月 発表会」程度のメモ", output: "案件名の整え・顧客の推定・分類の判定", human: "案件名とお客様の確認", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "見積", input: "過去の似た案件・料金表", output: "明細の下書き（数量・単価・人数）", human: "金額の決定と送付", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "Qシート", input: "ざっくりした進行メモ・過去の台本", output: "ロール分けと尺の割り振り、Qワードの候補", human: "実際の進行に合わせて直す", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "香盤表", input: "本番日・部屋・スタッフ・機材", output: "設営から撤収までの時間割の下書き", human: "現場の都合で前後を入れ替える", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "運営マニュアル", input: "案件の情報と部品（12種）", output: "1冊の組み立て・不足している部品の指摘", human: "当日の判断が要る箇所を書き足す", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "会場図面・立ち位置図", input: "部屋の標準図・カメラ台数・出演者数", output: "場面ごとの配置図（人・カメラ・機材）", human: "実測と安全確認、動線の修正", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "技術資料", input: "貸出機材とスタッフ", output: "カメラ割り・信号系統・音声系統の下書き", human: "現場の仕様に合わせて確定", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "リアルタイムCG", input: "受賞者リスト・アンケート結果", output: "テロップの流し込み・誤字の指摘・並び順", human: "本番の送出（押すのは人）", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "お金（取り込む）", input: "精算PDF・仕訳CSV", output: "金額・税・案件の紐づけ・二重計上の疑い", human: "承認（金額の確定）", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "ふりかえり", input: "1週間の記録", output: "数字の集計・議事録のまとめ・資料の組み立て", human: "数字に出ないトピックを足す", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "お客様への返信", input: "先方のメールと過去の経緯", output: "返信文の下書き（Slackに出す）", human: "読んで直して、自分の手で送る", tier: "下書き", tierBg: "#f5f3ff", tierFg: "#6d28d9" },
        { where: "予定（仮押さえ）", input: "希望日と部屋の空き", output: "空いている枠の候補3つ", human: "本予約にする判断", tier: "人だけ", tierBg: "#f2f4f7", tierFg: "#3c424c" },
      ],

      aiRulesCore: [
        { text: "推測した箇所は色を変える。埋めた根拠（元のメール・過去の案件）をその場で開ける。", icon: "check", fg: "#197a4b" },
        { text: "空欄で出さない。分からないところは「分かりません」と書いて、選ぶだけにする。", icon: "check", fg: "#197a4b" },
        { text: "作り直しをさせない。直したら次から同じ直し方を反映する（AIの学習に残す）。", icon: "check", fg: "#197a4b" },
        { text: "待たせるときは何をしているか4行で出す。途中でやめられる。", icon: "check", fg: "#197a4b" },
        { text: "確定していないものは相手に出ない。押すまで下書きのまま。", icon: "check", fg: "#197a4b" },
        { text: "人が直した率と無修正で確定した率を残す。ふりかえりで見て、精度が低い所は下書きをキャンセル。", icon: "check", fg: "#197a4b" },
      ],

      aiNever: [
        "お客様へのメール送信（下書きまで。送るのは人）",
        "請求金額・値引き・支払条件の決定",
        "仮押さえから本予約への切り替え",
        "受注・失注の確定",
        "本番の送出ボタン（テロップ・CG・配信の開始）",
      ],

      aiFlow: [
        { no: "1", label: "ふわっと投げる", detail: "電話のメモ、口頭の依頼、写真、前回の資料。形式は問いません。", arrow: true, bd: "#cfe4f4", numBg: "#005bac", numFg: "#fff" },
        { no: "2", label: "AIが形にする", detail: "何をしているかを4行で出しながら、下書きを組み立てます。", arrow: true, bd: "#ddd6fe", numBg: "#6d28d9", numFg: "#fff" },
        { no: "3", label: "人が直す", detail: "推測した箇所（オレンジ）から見る。全部読まなくて済みます。", arrow: true, bd: "#fde68a", numBg: "#fef3c7", numFg: "#92400e" },
        { no: "4", label: "確定する", detail: "押した時点で相手に出ます。直した内容は次の下書きに反映されます。", arrow: false, bd: "#d8ecdd", numBg: "#197a4b", numFg: "#fff" },
      ],

      aiHeavy: [
        { what: "会場図面・立ち位置図", place: "運営マニュアル", icon: "map-pin", bg: "#f5f3ff", fg: "#6d28d9",
          how: "部屋の標準図に、カメラ台数と出演者数から場面ごとの配置を置く。人の記号は香盤表のレーンと同じ人を指す。", before: "3〜4時間", after: "15分で直すだけ" },
        { what: "運営マニュアル1冊", place: "運営マニュアル", icon: "book-open", bg: "#eaf4fb", fg: "#005bac",
          how: "案件の情報と12種の部品から31ページを組む。足りない部品は名前で指摘する。", before: "1日", after: "1時間" },
        { what: "香盤表", place: "案件 ＞ 香盤表", icon: "table-2", bg: "#f5f3ff", fg: "#6d28d9",
          how: "本番尺・部屋・スタッフ・機材から、設営〜撤収の時間割を作る。前後の入れ替えはドラッグ。", before: "2時間", after: "20分" },
        { what: "見積の明細", place: "案件 ＞ お金", icon: "receipt", bg: "#eaf4fb", fg: "#005bac",
          how: "似た案件と料金表から明細を出す。金額の決定は人。", before: "1時間", after: "10分" },
        { what: "テロップの流し込み", place: "リアルタイムCG", icon: "tv", bg: "#fefce8", fg: "#a16207",
          how: "受賞者リストから全テロップを作り、誤字と表記ゆれを指摘する。送出は人。", before: "2時間", after: "15分" },
        { what: "隔週キープ資料", place: "ふりかえり", icon: "clipboard-list", bg: "#e7f6ee", fg: "#197a4b",
          how: "終わった案件・月次損益・議事録から資料を組む。人はトピックを足すだけ。", before: "半日", after: "30分" },
      ],

      auditStats: [
        { value: "13", label: "ブロックアプリ", note: "案件管理・財務・カレンダー・Qシート・機材・技術資料・計時LIVE・CG・日常業務・翻訳ほか", fg: "#1a1d24" },
        { value: "60+", label: "サイドバーのメニュー", note: "案件20 / 財務11 / 機材14 / 日常業務6 / カレンダー4 / 管理4 ほか", fg: "#b91c1c" },
        { value: "3", label: "アプリ切替の入口", note: "ヘッダーのアプリ切替・サイドバー下の「他のアプリ」・ホームの「アプリを起動」", fg: "#b91c1c" },
        { value: "7", label: "1案件の情報が散る場所", note: "案件・売上・仕入・カレンダー・タスク・Qシート・技術資料", fg: "#b45309" },
      ],

      auditProblems: [
        { no: 1, title: "アプリで切ってあるので、1つの案件を追うのに7か所を回る",
          detail: "同じ案件の見積・予約・香盤・機材・技術仕様が別アプリにあり、行き先を覚えていないと辿れません。",
          evidence: "ProjectQuickLinks が案件／売上／仕入／カレンダー／タスクの5本を並べて補っている" },
        { no: 2, title: "アプリを切り替える入口が3つある",
          detail: "同じ「他のアプリへ行く」動作にヘッダー・サイドバー下・ホームの3経路。どれが正しいか分かりません。",
          evidence: "AppSwitcher（ONAIR_APPS 13件）＋各Sidebarの getAccessibleApps ＋ HomePage の BLOCK_APPS" },
        { no: 3, title: "同じ画面がメニュー3行を占めている",
          detail: "カンバン／タスクリスト／ガントは同じ1画面の表示切替なのに、サイドバーでは別メニューに見えます。",
          evidence: "TaskDashboardPage が view パラメータで3ビューを切替（/sales/tasks/:view）" },
        { no: 4, title: "同じ台帳が複数のメニューから出ている",
          detail: "取引先マスターは案件管理と財務の両方に、カレンダーは統合／スタジオ／パートナー／マイの4本。",
          evidence: "APP_NAV の sales と budget に同一 /sales/companies、studio に4カレンダー" },
        { no: 5, title: "1画面しかないアプリが、アプリとして独立している",
          detail: "Qシート・技術資料・リアルタイムCGはサイドバーに項目が1つだけ。アプリの皮の分だけ遠くなっています。",
          evidence: "各 Sidebar の navItems が1件（ドキュメント一覧／ダッシュボード／イベント一覧）" },
      ],

      newPlaces: [
        { label: "今日", icon: "sun", bg: "#eaf4fb", fg: "#005bac",
          role: "待たせているものとAIに任せる欄。朝ここだけ見れば足りる状態にする。",
          absorbs: "ホーム・受信箱・AI起票の確認・問い合わせ・見積請求の受信" },
        { label: "案件", icon: "folder-kanban", bg: "#eaf4fb", fg: "#005bac",
          role: "1案件を追う場所。中でお金も予約も現場ツールもタブで開く。",
          absorbs: "案件一覧・パイプライン・確定案件2種・費用を分け合うまとまり・旧GLS・売上/仕入の案件別・Qシート・技術資料・計時LIVE・CG" },
        { label: "タスク", icon: "list-checks", bg: "#eaf4fb", fg: "#005bac",
          role: "自分/案件/全体のスコープ × リスト・ボード・ガント。依頼もここ。",
          absorbs: "カンバン・タスクリスト・ガント・案件内タスク・日常業務のタスク・依頼" },
        { label: "お客様", icon: "building-2", bg: "#eaf4fb", fg: "#005bac",
          role: "会社ごとの接点と実績。次に会う前の下調べを1画面で。",
          absorbs: "顧客一覧・顧客360・取引先マスター・内覧会の来場者" },
        { label: "予定", icon: "calendar", bg: "#eaf4fb", fg: "#005bac",
          role: "1つのカレンダーにレイヤー切替（スタジオ／パートナー／自分）。",
          absorbs: "統合・スタジオ・パートナー・マイの4カレンダー・香盤・サイネージ" },
        { label: "お金", icon: "piggy-bank", bg: "#eaf4fb", fg: "#005bac",
          role: "月次の損益と請求。取込は「取り込む→確認→登録」の1本道に。",
          absorbs: "財務ダッシュボード・売上・仕入・販管費・精算PDF取込・決算取込・二重計上・レポート" },
      ],

      leftovers: [
        { what: "機材管理（14メニュー）", where: "「機材台帳」＝台帳・ラック・保管場所と、「オペレーション」＝貸出・棚卸・スキャンの2つに畳む" },
        { what: "週次報告・業界ニュース", where: "「ふりかえり」として お金 の隣（月次と同じリズムの仕事）" },
        { what: "セキュリティカード・内覧会", where: "お客様（来訪の管理）と 設定（カード台帳）に分ける" },
        { what: "翻訳・インタラクティブ・CG・計時LIVE", where: "案件の道具としてタブに置く。案件がない試用は「お試し」で受ける" },
      ],

      railNew: [
        { label: "今日", icon: "sun", bg: "transparent", fg: "#5d6470", badge: "6" },
        { label: "案件", icon: "folder-kanban", bg: "#eaf4fb", fg: "#005bac", badge: "" },
        { label: "タスク", icon: "list-checks", bg: "transparent", fg: "#5d6470", badge: "3" },
        { label: "お客様", icon: "building-2", bg: "transparent", fg: "#5d6470", badge: "" },
        { label: "予定", icon: "calendar", bg: "transparent", fg: "#5d6470", badge: "" },
        { label: "お金", icon: "piggy-bank", bg: "transparent", fg: "#5d6470", badge: "" },
      ],

      projectTabPlan: [
        { label: "概要", when: "いまのまま", note: "案件の中身。ここが起点", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#3c424c" },
        { label: "お金", when: "先に作る", note: "見積・売上・仕入・粗利。見積を見ながら仕入を確認する往復が多い", bg: "#f4faff", bd: "#005bac", fg: "#005bac" },
        { label: "予定", when: "先に作る", note: "本番・リハ・仮押さえ。日程を見ながら機材と人を確認する", bg: "#f4faff", bd: "#005bac", fg: "#005bac" },
        { label: "やり取り・タスク・書類", when: "あとで", note: "1画面で往復しない。当面はリンクのまま", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#3c424c" },
        { label: "Qシート・技術資料・香盤表・機材・CG", when: "リンクのまま", note: "現場の道具。開いたら戻らずそこで作業する", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#3c424c" },
      ],

      projectTabs: [
        { label: "概要", icon: "layout-dashboard", bd: "#005bac", fg: "#005bac", count: "" },
        { label: "やり取り", icon: "history", bd: "transparent", fg: "#5d6470", count: "6" },
        { label: "お金", icon: "circle-dollar-sign", bd: "transparent", fg: "#5d6470", count: "" },
        { label: "予定", icon: "calendar", bd: "transparent", fg: "#5d6470", count: "3" },
        { label: "タスク", icon: "list-checks", bd: "transparent", fg: "#5d6470", count: "12" },
        { label: "Qシート", icon: "file-text", bd: "transparent", fg: "#5d6470", count: "1" },
        { label: "技術資料", icon: "wrench", bd: "transparent", fg: "#5d6470", count: "" },
        { label: "香盤表", icon: "table-2", bd: "transparent", fg: "#5d6470", count: "" },
        { label: "CG・翻訳・演出", icon: "tv", bd: "transparent", fg: "#5d6470", count: "" },
        { label: "機材", icon: "package", bd: "transparent", fg: "#5d6470", count: "8" },
        { label: "書類", icon: "folder-open", bd: "transparent", fg: "#5d6470", count: "" },
      ],

      fieldTools: [
        { label: "Qシート", state: "作成済み ・ 最終更新 昨日", icon: "file-text", bg: "#fff1f2", fg: "#e11d48" },
        { label: "技術資料", state: "未作成", icon: "wrench", bg: "#ecfeff", fg: "#0891b2" },
        { label: "機材の貸出", state: "8点 ・ 10/01 出庫", icon: "package", bg: "#fffbeb", fg: "#d97706" },
        { label: "計時LIVE", state: "番組を作る", icon: "timer", bg: "#fef2f2", fg: "#ef4444" },
        { label: "リアルタイムCG", state: "使わない", icon: "tv", bg: "#fefce8", fg: "#a16207" },
        { label: "香盤表", state: "用賀 10/02", icon: "table-2", bg: "#f5f3ff", fg: "#6d28d9" },
      ],

      ctxMoney: [
        { label: "確定売上", value: "¥1,380,000", fg: "#1a1d24" },
        { label: "仕入", value: "¥814,000", fg: "#1a1d24" },
        { label: "粗利", value: "¥566,000", fg: "#197a4b" },
      ],

      ctxDay: [
        { time: "08:00", what: "設営・機材搬入" },
        { time: "10:00", what: "リハーサル" },
        { time: "13:00", what: "本番（収録）" },
        { time: "18:00", what: "撤収" },
      ],

      iaBefore: [
        { path: "/sales/tasks/kanban", label: "カンバン（サイドバー1行目）", what: "全案件のタスクをカンバンで表示", problem: "実体は同じ1画面", tagBg: "#fee2e2", tagFg: "#b91c1c", bd: "#f6cdd2" },
        { path: "/sales/tasks/list", label: "タスクリスト（2行目）", what: "同じデータをリストで表示", problem: "実体は同じ1画面", tagBg: "#fee2e2", tagFg: "#b91c1c", bd: "#f6cdd2" },
        { path: "/sales/tasks/gantt", label: "ガントチャート（3行目）", what: "同じデータをガントで表示", problem: "実体は同じ1画面", tagBg: "#fee2e2", tagFg: "#b91c1c", bd: "#f6cdd2" },
        { path: "/sales/projects/:id/tasks", label: "案件内のタスク", what: "案件1件のタスク。ここにも独立した表示切替がある", problem: "切替UIが二重", tagBg: "#fef3c7", tagFg: "#92400e", bd: "#fde68a" },
        { path: "/daily/tasks", label: "タスク・依頼（別アプリ）", what: "個人タスクと人からの依頼。投入欄もここ", problem: "別アプリに分離", tagBg: "#fef3c7", tagFg: "#92400e", bd: "#fde68a" },
      ],

      iaScopes: ["自分", "案件", "全体"],
      iaViews: ["リスト", "ボード", "ガント"],

      iaRules: [
        "サイドバーは「タスク」1行だけ。カンバン／リスト／ガントは画面内の表示形式に降格する（3行 → 1行）。",
        "案件内のタスクは同じ画面のスコープ「案件」。案件ワークスペースからは絞り込んだ状態で開く。",
        "個人タスクと依頼を別アプリに置かない。案件に紐づかないタスクも同じ並びに入れる。",
        "期限は「何月何日何時何分まで」。期限なしは点数を下げて自然に下に沈める。",
      ],

      taskScopes: [
        { label: "自分", icon: "user", count: 14, bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "案件", icon: "folder-kanban", count: 62, bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "全体", icon: "users", count: 128, bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      taskViewTabs: [
        { label: "リスト", icon: "list", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "ボード", icon: "columns-3", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "ガント", icon: "chart-gantt", bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],

      delegations: [
        { title: "10月分の香盤表をつくる", from: "佐々木", due: "7/31 17:00", dueFg: "#5d6470", project: "商品発表会 スタジオ収録" },
        { title: "内覧会の来場者リストを共有する", from: "大野", due: "7/25 18:00（期限超過）", dueFg: "#b91c1c", project: "定期内覧会" },
      ],

      taskRows: [
        { score: 9, scoreBg: "#fee2e2", scoreFg: "#b91c1c", title: "ミナトデジタル様に見積を送る", where: "秋のブランド発表会 配信・収録", requester: "", due: "7/23 18:00", dueFg: "#b91c1c", state: "超過", stateBg: "#fee2e2", stateFg: "#b91c1c" },
        { score: 6, scoreBg: "#fef3c7", scoreFg: "#92400e", title: "内覧会の来場者リストを共有する", where: "定期内覧会（第3回）", requester: "大野", due: "今日 18:00", dueFg: "#b45309", state: "今日", stateBg: "#fef3c7", stateFg: "#92400e" },
        { score: 6, scoreBg: "#fef3c7", scoreFg: "#92400e", title: "AIが作った案件の中身を見る", where: "60周年式典 配信・収録", requester: "", due: "今日 18:00", dueFg: "#b45309", state: "今日", stateBg: "#fef3c7", stateFg: "#92400e" },
        { score: 4, scoreBg: "#eaf4fb", scoreFg: "#005bac", title: "10月分の香盤表をつくる", where: "商品発表会 スタジオ収録", requester: "佐々木", due: "7/31 17:00", dueFg: "#3c424c", state: "未返答", stateBg: "#f5f3ff", stateFg: "#6d28d9" },
        { score: 3, scoreBg: "#eaf4fb", scoreFg: "#005bac", title: "週次報告のトピックを1行書く", where: "案件なし（自分のタスク）", requester: "", due: "8/01 12:00", dueFg: "#3c424c", state: "予定", stateBg: "#f7f8fa", stateFg: "#3c424c" },
        { score: 1, scoreBg: "#f2f4f7", scoreFg: "#5d6470", title: "機材の棚卸しの標準工程を考える", where: "案件なし（自分のタスク）", requester: "", due: "期限なし", dueFg: "#5d6470", state: "後で", stateBg: "#f7f8fa", stateFg: "#5d6470" },
      ],

      sentRequests: [
        { title: "10/17の配信オペを1名手配", to: "大野（外部）", state: "返事待ち 2日" },
        { title: "請求書の内容を確認", to: "経理", state: "返事待ち 1日" },
        { title: "青山スタジオの下見に同行", to: "佐々木", state: "相談中に差し戻し" },
      ],

      matrixCells: [
        { count: 1, label: "重要・急ぎ", bg: "#fef2f2", bd: "#f6cdd2", fg: "#b91c1c" },
        { count: 2, label: "重要・中", bg: "#fff7ed", bd: "#fed7aa", fg: "#c2410c" },
        { count: 3, label: "重要・急がない", bg: "#f4faff", bd: "#cfe4f4", fg: "#005bac" },
        { count: 2, label: "中・急ぎ", bg: "#fffbeb", bd: "#fde68a", fg: "#b45309" },
        { count: 4, label: "中・中", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#3c424c" },
        { count: 1, label: "中・急がない", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#3c424c" },
        { count: 1, label: "低・急ぎ（任せる）", bg: "#fffbeb", bd: "#fde68a", fg: "#b45309" },
        { count: 0, label: "低・中", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#5d6470" },
        { count: 0, label: "低・急がない（キャンセル）", bg: "#f7f8fa", bd: "#e6e9ed", fg: "#5d6470" },
      ],

      listViews: [
        { label: "リスト", icon: "list", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
        { label: "ボード", icon: "columns-3", bg: "transparent", fg: "#5d6470", shadow: "none" },
      ],
      listViewsBoard: [
        { label: "リスト", icon: "list", bg: "transparent", fg: "#5d6470", shadow: "none" },
        { label: "ボード", icon: "columns-3", bg: "#fff", fg: "#1a1d24", shadow: "0 1px 2px rgba(16,24,40,.08)" },
      ],

      listTabs: [
        { label: "すべて", count: 34, bg: "#fff", fg: "#1a1d24" },
        { label: "ヨミ", count: 12, bg: "transparent", fg: "#5d6470" },
        { label: "進行中", count: 18, bg: "transparent", fg: "#5d6470" },
        { label: "完了", count: 3, bg: "transparent", fg: "#5d6470" },
        { label: "失注", count: 1, bg: "transparent", fg: "#5d6470" },
      ],

      listGroups: [
        {
          label: "ネタ", count: 4, total: "¥1,180万", dot: "#b6bcc4", hint: "まだ提案前。動かすか捨てるかを決める",
          rows: [
            { name: "年末の全社総会 配信", customer: "株式会社ミナトデジタル", date: "12/19（金）", owner: "寺井", gls: "GLS発番前", stageShort: "ネタ", avBg: "#f2f4f7", avFg: "#3c424c",
              stage: "ネタ", badgeBg: "#f7f8fa", badgeFg: "#3c424c", badgeBd: "#e6e9ed", cur: "¥", amt: "3,200,000", amountNote: "想定", opacity: "1",
              ai: false, hot: false, na: "次のアクションが決まっていません", naFg: "#b45309", naIcon: "triangle-alert" },
            { name: "スタジオ見学（9月中旬）", customer: "木村 みなみ 様", date: "日程未定", owner: "寺井", gls: "GLS発番前", stageShort: "ネタ", avBg: "#f2f4f7", avFg: "#3c424c",
              stage: "ネタ", badgeBg: "#f7f8fa", badgeFg: "#3c424c", badgeBd: "#e6e9ed", cur: "", amt: "—", amountNote: "金額未定", opacity: "1",
              ai: true, hot: false, na: "9/10 までに見学日を返す", naFg: "#1d4ed8", naIcon: "calendar-clock" },
          ],
        },
        {
          label: "提案中", count: 8, total: "¥3,420万", dot: "#005bac", hint: "仮押さえ・見積提案・口頭決定。ここが本番",
          rows: [
            { name: "秋のブランド発表会 配信・収録", customer: "株式会社ミナトデジタル", date: "10/03（土）", owner: "寺井", gls: "GLS-B012", stageShort: "B", avBg: "#fef3c7", avFg: "#92400e",
              stage: "口頭決定", badgeBg: "#fef3c7", badgeFg: "#92400e", badgeBd: "#fde68a", cur: "¥", amt: "4,820,000", amountNote: "想定", opacity: "1",
              ai: false, hot: true, na: "見積を送る（7/23 18:00 ・ 2日超過）", naFg: "#b91c1c", naIcon: "calendar-clock" },
            { name: "60周年式典 配信・収録", customer: "株式会社アオゾラ物流", date: "10/17（金）", owner: "寺井", gls: "GLS発番前", stageShort: "C", avBg: "#eaf4fb", avFg: "#005bac",
              stage: "見積提案", badgeBg: "#005bac", badgeFg: "#fff", badgeBd: "#005bac", cur: "¥", amt: "2,150,000", amountNote: "AIの下書きから", opacity: "1",
              ai: true, hot: true, na: "見積の下書きを確定する（明日）", naFg: "#1d4ed8", naIcon: "calendar-clock" },
            { name: "採用説明会 ライブ配信（全4回）", customer: "NKトレーディング株式会社", date: "9/08〜9/26 ・ 4日（飛び日）", owner: "佐々木", gls: "GLS-B009", stageShort: "D", avBg: "#e0f2fe", avFg: "#0369a1",
              stage: "仮押さえ", badgeBg: "#e0f2fe", badgeFg: "#0369a1", badgeBd: "#bae6fd", cur: "¥", amt: "960,000", amountNote: "想定", opacity: "1",
              ai: false, hot: false, na: "日程3案を返す（7/24 ・ 1日超過）", naFg: "#b91c1c", naIcon: "calendar-clock" },
          ],
        },
        {
          label: "受注済・完了", count: 21, total: "¥2,640万", dot: "#197a4b", hint: "制作と請求のフェーズ",
          rows: [
            { name: "商品発表会 スタジオ収録", customer: "ケイ・フーズ株式会社", date: "10/02（金）", owner: "寺井", gls: "GLS-A118", stageShort: "A", avBg: "#e7f6ee", avFg: "#197a4b",
              stage: "受注済", badgeBg: "#197a4b", badgeFg: "#fff", badgeBd: "#197a4b", cur: "¥", amt: "1,380,000", amountNote: "確定売上 ・ 粗利 41%", opacity: "1",
              ai: false, hot: false, na: "仮押さえを本予約に切り替える（8/15）", naFg: "#1d4ed8", naIcon: "calendar-clock" },
            { name: "株主総会 ライブ配信", customer: "エヌ・ワイ商事株式会社", date: "6/27（金）", owner: "佐々木", gls: "GLS-A104", stageShort: "S", avBg: "#f2f4f7", avFg: "#3c424c",
              stage: "完了", badgeBg: "#f7f8fa", badgeFg: "#3c424c", badgeBd: "#e6e9ed", cur: "¥", amt: "2,640,000", amountNote: "確定売上 ・ 粗利 38%", opacity: ".72",
              ai: false, hot: false, na: "終わっています", naFg: "#5d6470", naIcon: "check" },
          ],
        },
      ],

      boardColumns: [
        { label: "ネタ", count: 4, total: "¥1,180万", dot: "#b6bcc4", empty: false,
          cards: [
            { name: "年末の全社総会 配信", customer: "ミナトデジタル", cur: "¥", amt: "3,200,000", bd: "#e6e9ed", na: "次アクション未設定", naFg: "#b45309", naIcon: "triangle-alert" },
            { name: "スタジオ見学（9月中旬）", customer: "木村 みなみ 様", cur: "", amt: "—", bd: "#e6e9ed", na: "9/10 見学日を返す", naFg: "#1d4ed8", naIcon: "calendar-clock" },
          ] },
        { label: "仮押さえ", count: 5, total: "¥1,340万", dot: "#0369a1", empty: false,
          cards: [
            { name: "採用説明会 ライブ配信（全4回）", customer: "NKトレーディング", cur: "¥", amt: "960,000", bd: "#f6cdd2", na: "日程3案を返す・1日超過", naFg: "#b91c1c", naIcon: "calendar-clock" },
          ] },
        { label: "見積提案", count: 6, total: "¥1,880万", dot: "#005bac", empty: false,
          cards: [
            { name: "60周年式典 配信・収録", customer: "アオゾラ物流", cur: "¥", amt: "2,150,000", bd: "#fed7aa", na: "下書きを確定する・明日", naFg: "#1d4ed8", naIcon: "calendar-clock" },
          ] },
        { label: "口頭決定", count: 3, total: "¥980万", dot: "#92400e", empty: false,
          cards: [
            { name: "秋のブランド発表会 配信・収録", customer: "ミナトデジタル", cur: "¥", amt: "4,820,000", bd: "#f6cdd2", na: "見積を送る・2日超過", naFg: "#b91c1c", naIcon: "calendar-clock" },
          ] },
        { label: "受注", count: 4, total: "¥480万", dot: "#197a4b", empty: false,
          cards: [
            { name: "商品発表会 スタジオ収録", customer: "ケイ・フーズ", cur: "¥", amt: "1,380,000", bd: "#e6e9ed", na: "本予約に切り替える・8/15", naFg: "#1d4ed8", naIcon: "calendar-clock" },
          ] },
      ],

      wsQuickLinks: [
        { label: "案件", icon: "briefcase", bg: "#005bac", fg: "#ffffff", bd: "#005bac", iconFg: "#ffffff" },
        { label: "売上", icon: "wallet", bg: "#ffffff", fg: "#3c424c", bd: "#e6e9ed", iconFg: "#5d6470" },
        { label: "仕入", icon: "truck", bg: "#ffffff", fg: "#3c424c", bd: "#e6e9ed", iconFg: "#5d6470" },
        { label: "カレンダー", icon: "calendar", bg: "#ffffff", fg: "#3c424c", bd: "#e6e9ed", iconFg: "#5d6470" },
        { label: "タスク", icon: "kanban-square", bg: "#ffffff", fg: "#3c424c", bd: "#e6e9ed", iconFg: "#5d6470" },
      ],

      wsJourney: [
        { label: "ネタ", mark: "✓", date: "6/20", barBg: "#197a4b", dotBg: "#197a4b", dotFg: "#fff", fg: "#1a1d24", weight: "400" },
        { label: "仮押さえ", mark: "✓", date: "7/02", barBg: "#197a4b", dotBg: "#197a4b", dotFg: "#fff", fg: "#1a1d24", weight: "400" },
        { label: "見積提案", mark: "✓", date: "7/18", barBg: "#197a4b", dotBg: "#197a4b", dotFg: "#fff", fg: "#1a1d24", weight: "400" },
        { label: "口頭決定", mark: "4", date: "7/22 から", barBg: "#005bac", dotBg: "#005bac", dotFg: "#fff", fg: "#005bac", weight: "700" },
        { label: "受注", mark: "5", date: "—", barBg: "#e9ecf0", dotBg: "#f2f4f7", dotFg: "#5d6470", fg: "#5d6470", weight: "400" },
        { label: "完了", mark: "6", date: "—", barBg: "#e9ecf0", dotBg: "#f2f4f7", dotFg: "#5d6470", fg: "#5d6470", weight: "400" },
      ],

      wsTodos: [
        { bd: "#f6cdd2", bg: "#fef6f7", titleFg: "#b91c1c", subFg: "#b91c1c", title: "見積を送る", sub: "7/23 18:00 までの約束 ・ 2日超過" },
        { bd: "#e6e9ed", bg: "#fff", titleFg: "#1a1d24", subFg: "#5d6470", title: "申込書をもらう", sub: "8/07 18:00 まで ・ 宮田様に依頼済み" },
      ],

      wsTimeline: [
        { kind: "メール", date: "07/23 11:40", who: "宮田様", ai: true, subject: "見積のご確認について", body: "先日の打合せ内容で見積をお願いできますか。社内決裁が8月頭にあるため、それまでにいただけると助かります。", next: "7/23 18:00 見積を送る（超過）", nextFg: "#b91c1c", icon: "mail", iconBg: "#f5f3ff", iconBd: "#ddd6fe", iconFg: "#6d28d9" },
        { kind: "打合せ", date: "07/18 14:00", who: "寺井", ai: false, subject: "内容確定。カメラ3台＋配信で進める", body: "会場は用賀 STUDIO A。配信はYouTubeとZoomの2系統。当日の司会は先方が手配。", next: "", nextFg: "#1d4ed8", icon: "users", iconBg: "#fff", iconBd: "#e6e9ed", iconFg: "#ea580c" },
        { kind: "提案", date: "07/18 09:00", who: "AI", ai: true, subject: "見積の下書きを作成（¥4,820,000・未確定）", body: "", next: "", nextFg: "#1d4ed8", icon: "file-text", iconBg: "#f5f3ff", iconBd: "#ddd6fe", iconFg: "#6d28d9" },
        { kind: "電話", date: "07/02 16:20", who: "寺井", ai: false, subject: "10/03で仮押さえ。予算は500万前後", body: "", next: "", nextFg: "#1d4ed8", icon: "phone", iconBg: "#fff", iconBd: "#e6e9ed", iconFg: "#ea580c" },
        { kind: "メール", date: "06/20 10:05", who: "宮田様", ai: true, subject: "発表会の配信について相談したい", body: "", next: "", nextFg: "#1d4ed8", icon: "mail", iconBg: "#f5f3ff", iconBd: "#ddd6fe", iconFg: "#6d28d9" },
      ],

      wsMoney: [
        { label: "想定金額", value: "¥4,820,000", note: "見積の下書きから", fg: "#1a1d24", bg: "#fff" },
        { label: "確定売上", value: "¥0", note: "受注後に登録します", fg: "#5d6470", bg: "#fff" },
        { label: "仕入", value: "¥1,240,000", note: "3件 ・ 2件は仮", fg: "#1a1d24", bg: "#fff" },
        { label: "粗利（見込み）", value: "¥3,580,000", note: "74.3%", fg: "#197a4b", bg: "#f7fdf9" },
      ],

      wsMoneyActions: [
        { label: "見積の明細を見る", icon: "list" },
        { label: "見積書PDFを出す", icon: "printer" },
        { label: "仕入を足す", icon: "shopping-cart" },
        { label: "料金表から組む", icon: "calculator" },
      ],

      wsFacts: [
        { label: "お客様", value: "株式会社ミナトデジタル" },
        { label: "先方担当", value: "宮田 涼子 様" },
        { label: "案件の種類", value: "イベント配信・収録" },
        { label: "分類", value: "ビジネス案件（GLS-B）" },
        { label: "実施日", value: "2026/10/03（土）" },
        { label: "配信", value: "YouTube ・ Zoom" },
        { label: "社内担当", value: "寺井 赳博" },
        { label: "タグ", value: "発表会 / 3カメ / 2言語" },
        { label: "メモ", value: "司会は先方手配。当日9:00入り。" },
      ],

      wsBookings: [
        { label: "本番", when: "10/03（土）9:00〜20:00", room: "用賀 STUDIO A", dot: "#c7243a" },
        { label: "リハーサル", when: "10/02（金）13:00〜18:00", room: "用賀 STUDIO A", dot: "#f0a000" },
        { label: "仮押さえ（予備日）", when: "10/10（土）終日", room: "用賀 STUDIO A", dot: "#f2c200" },
      ],

      wsDocs: [
        { label: "申込書", state: "未提出", icon: "file-warning", fg: "#b45309" },
        { label: "ロゴ使用許諾", state: "受領済み", icon: "file-check", fg: "#197a4b" },
      ],

      wsPlaces: [
        { label: "BOX（社外共有可）", icon: "folder-open" },
        { label: "BOX（社内限り）", icon: "folder-lock" },
      ],

      wsMembers: [
        { name: "寺井", initial: "寺", bg: "#eaf4fb", fg: "#005bac" },
        { name: "佐々木", initial: "佐", bg: "#f2f4f7", fg: "#3c424c" },
        { name: "大野（外部）", initial: "大", bg: "#fff7ed", fg: "#c2410c" },
      ],

      paletteActions: [
        { label: "見積を作る", hint: "案件を選んで料金表から組む", icon: "file-text", iconBg: "#eaf4fb", iconFg: "#005bac", bg: "#f4faff", enter: true },
        { label: "見積書PDFを出す", hint: "確定済みの明細から", icon: "printer", iconBg: "#f2f4f7", iconFg: "#5d6470", bg: "transparent", enter: false },
        { label: "見積の下書きをAIに作らせる", hint: "案件のやり取りから組む", icon: "sparkles", iconBg: "#f5f3ff", iconFg: "#6d28d9", bg: "transparent", enter: false },
        { label: "請求書Excelを出す", hint: "月締めの請求単位で", icon: "file-spreadsheet", iconBg: "#f2f4f7", iconFg: "#5d6470", bg: "transparent", enter: false },
      ],

      palettePlaces: [
        { label: "料金表", path: "案件管理 › マスター", icon: "circle-dollar-sign" },
        { label: "売上管理", path: "財務管理 › 収支", icon: "receipt" },
        { label: "案件月別詳細", path: "財務管理 › 収支", icon: "folder-kanban" },
        { label: "精算PDF取込", path: "財務管理 › 収支", icon: "file-search" },
        { label: "ヨミ・パイプライン", path: "案件管理 › 商談", icon: "trending-up" },
      ],

      paletteHits: [
        { code: "GLS-B012", name: "秋のブランド発表会 配信・収録", customer: "株式会社ミナトデジタル ・ 見積送付待ち", stage: "B 口頭決定", badgeBg: "#fef3c7", badgeFg: "#92400e", badgeBd: "#fde68a" },
        { code: "GLS-A118", name: "商品発表会 スタジオ収録", customer: "ケイ・フーズ株式会社", stage: "A 受注済", badgeBg: "#197a4b", badgeFg: "#ffffff", badgeBd: "#197a4b" },
        { code: "GLS発番前", name: "60周年式典 配信・収録", customer: "株式会社アオゾラ物流 ・ 見積の下書きあり", stage: "C 見積提案", badgeBg: "#005bac", badgeFg: "#ffffff", badgeBd: "#005bac" },
      ],

      zeroSuggestions: [
        { title: "見積を出したまま止まっている案件を見る", sub: "3件 ・ 提案から2週間以上", icon: "trending-up" },
        { title: "10月の仮押さえを本予約に切り替える", sub: "4件 ・ 用賀 / 渋谷", icon: "calendar-clock" },
        { title: "週次報告のトピックを書く", sub: "金曜 12:00 まで", icon: "presentation" },
      ],

      overdueTimeline: [
        { icon: "mail", bg: "#eaf4fb", fg: "#005bac", text: "「見積のご確認について」を受信（返信なし）", meta: "メール 07/23 11:40 ・ 宮田様" },
        { icon: "users", bg: "#e7f6ee", fg: "#197a4b", text: "打合せ。カメラ3台＋配信で進める方向に", meta: "打合せ 07/18 14:00 ・ 寺井" },
        { icon: "file-text", bg: "#f5f3ff", fg: "#6d28d9", text: "見積の下書きを作成（¥4,820,000・未送付）", meta: "AI作成 07/18 ・ 指示: 寺井" },
      ],

      overdueFacts: [
        { label: "ヨミ", value: "B 口頭決定" },
        { label: "想定金額", value: "¥4,820,000" },
        { label: "実施日", value: "2026/10/03（土）" },
        { label: "スタジオ", value: "用賀 STUDIO A（仮押さえ中）" },
      ],

      postponeOpts: ["明日 18:00", "3日後 18:00", "日時を指定"],

      financeFields: [
        { label: "種別", value: "請求書", guessed: false },
        { label: "送付元", value: "サンリバー音響株式会社", guessed: false },
        { label: "金額（税抜）", value: "¥380,000", guessed: false },
        { label: "消費税", value: "¥38,000（10%）", guessed: false },
        { label: "紐づく案件", value: "秋のブランド発表会", guessed: true },
        { label: "計上月", value: "2026年7月", guessed: true },
      ],

      inquirySlots: ["9/10（木）14:00 用賀", "9/11（金）15:00 用賀", "9/17（木）13:00 用賀"],

      progressSteps: [
        { label: "何の話か読む", icon: "check", bg: "#e7f6ee", fg: "#197a4b", textFg: "#1a1d24", weight: "400", bar: "100%", barFg: "#197a4b", note: "案件の相談" },
        { label: "お客様と担当を検索", icon: "check", bg: "#e7f6ee", fg: "#197a4b", textFg: "#1a1d24", weight: "400", bar: "100%", barFg: "#197a4b", note: "既存のお客様" },
        { label: "日程と場所を取り出す", icon: "loader-circle", bg: "#eaf4fb", fg: "#005bac", textFg: "#1a1d24", weight: "700", bar: "62%", barFg: "#005bac", note: "読んでいます" },
        { label: "期限を決める", icon: "clock", bg: "#f3f4f6", fg: "#5d6470", textFg: "#5d6470", weight: "400", bar: "0%", barFg: "#005bac", note: "待機" },
      ],

      queueMobile: [
        { kind: "期限超過", tagBg: "#fee2e2", tagFg: "#b91c1c", tagBd: "#fecaca", elapsed: "2日", elapsedBg: "#fee2e2", elapsedFg: "#b91c1c", cardBd: "#f6cdd2",
          title: "ミナトデジタル様に見積を送る", sub: "秋のブランド発表会 配信・収録 ・ ミナトデジタル", cta: "見積を開く" },
        { kind: "AI作成", tagBg: "#f5f3ff", tagFg: "#6d28d9", tagBd: "#ddd6fe", elapsed: "18時間", elapsedBg: "#fef3c7", elapsedFg: "#b45309", cardBd: "#cfe4f4",
          title: "アオゾラ物流 60周年式典 配信・収録", sub: "内容を見て確定してください", cta: "中身を見る" },
        { kind: "見積・請求", tagBg: "#fef3c7", tagFg: "#92400e", tagBd: "#fde68a", elapsed: "9時間", elapsedBg: "#fef3c7", elapsedFg: "#b45309", cardBd: "#e6e9ed",
          title: "請求書 ¥418,000 の内容を確認する", sub: "サンリバー音響 ・ 支払期日 08/31", cta: "中身を見る" },
        { kind: "期限超過", tagBg: "#fee2e2", tagFg: "#b91c1c", tagBd: "#fecaca", elapsed: "1日", elapsedBg: "#fee2e2", elapsedFg: "#b91c1c", cardBd: "#f6cdd2",
          title: "NKトレーディング様に日程3案を返す", sub: "採用説明会 ライブ配信 ・ NKトレーディング", cta: "案件を開く" },
      ],

      tabsMobile: [
        { label: "ホーム", icon: "home", fg: "#005bac" },
        { label: "お待たせ中", icon: "inbox", fg: "#5d6470" },
        { label: "案件", icon: "folder-kanban", fg: "#5d6470" },
        { label: "予定", icon: "calendar", fg: "#5d6470" },
      ],

      railLight: [
        { icon: "inbox", label: "受信箱", short: "受信", bg: "#eaf4fb", fg: "#005bac" },
        { icon: "folder-kanban", label: "案件", short: "案件", bg: "transparent", fg: "#5d6470" },
        { icon: "building-2", label: "お客様", short: "顧客", bg: "transparent", fg: "#5d6470" },
        { icon: "calendar", label: "カレンダー", short: "予定", bg: "transparent", fg: "#5d6470" },
        { icon: "piggy-bank", label: "財務", short: "財務", bg: "transparent", fg: "#5d6470" },
        { icon: "clipboard-list", label: "日常業務", short: "日常", bg: "transparent", fg: "#5d6470" },
      ],

      queueLight: [
        { kind: "期限超過", tagBg: "#fee2e2", tagFg: "#b91c1c", tagBd: "#fecaca", elapsed: "2日", elapsedBg: "#fee2e2", elapsedFg: "#b91c1c",
          icon: "mail", iconBg: "#fef2f2", iconFg: "#c7243a", cardBd: "#f6cdd2",
          title: "ミナトデジタル様に見積を送る", sub: "秋のブランド発表会（ミナトデジタル）・ 7/23 18:00 までの約束",
          cta: "見積を開く", ctaIcon: "arrow-right", open: false },
        { kind: "AI作成", tagBg: "#f5f3ff", tagFg: "#6d28d9", tagBd: "#ddd6fe", elapsed: "18時間", elapsedBg: "#fef3c7", elapsedFg: "#b45309",
          icon: "sparkles", iconBg: "#f5f3ff", iconFg: "#6d28d9", cardBd: "#005bac",
          title: "アオゾラ物流 60周年式典 配信・収録", sub: "株式会社アオゾラ物流 ・ 担当 井上様 ・ 10/17（金） 用賀 STUDIO A",
          cta: "閉じる", ctaIcon: "chevron-up", open: true },
        { kind: "見積・請求", tagBg: "#fef3c7", tagFg: "#92400e", tagBd: "#fde68a", elapsed: "9時間", elapsedBg: "#fef3c7", elapsedFg: "#b45309",
          icon: "receipt", iconBg: "#fffbeb", iconFg: "#b45309", cardBd: "#e6e9ed",
          title: "請求書 ¥418,000 の内容を確認する", sub: "サンリバー音響 ・ 支払期日 08/31",
          cta: "中身を見る", ctaIcon: "chevron-down", open: false },
        { kind: "問い合わせ", tagBg: "#e0f2fe", tagFg: "#0369a1", tagBd: "#bae6fd", elapsed: "3時間", elapsedBg: "#f3f4f6", elapsedFg: "#5d6470",
          icon: "message-square", iconBg: "#f0f9ff", iconFg: "#0369a1", cardBd: "#e6e9ed",
          title: "スタジオ見学の希望（9月中旬）に返す", sub: "問い合わせフォーム ・ 個人",
          cta: "中身を見る", ctaIcon: "chevron-down", open: false },
        { kind: "期限超過", tagBg: "#fee2e2", tagFg: "#b91c1c", tagBd: "#fecaca", elapsed: "1日", elapsedBg: "#fee2e2", elapsedFg: "#b91c1c",
          icon: "phone", iconBg: "#fef2f2", iconFg: "#c7243a", cardBd: "#f6cdd2",
          title: "NKトレーディング様に日程3案を返す", sub: "採用説明会 ライブ配信（全4回）・ NKトレーディング",
          cta: "案件を開く", ctaIcon: "arrow-right", open: false },
      ],

      queueTabs: [
        { label: "期限超過", count: 2, bg: "#fee2e2", fg: "#b91c1c" },
        { label: "AI作成", count: 2, bg: "#f5f3ff", fg: "#6d28d9" },
        { label: "問い合わせ", count: 1, bg: "#e0f2fe", fg: "#0369a1" },
        { label: "見積・請求", count: 1, bg: "#fef3c7", fg: "#92400e" },
      ],


      aiFields: [
        { label: "お客様", value: "株式会社アオゾラ物流", guessed: false },
        { label: "案件名", value: "60周年式典 配信・収録", guessed: false },
        { label: "実施日", value: "2026/10/17（金）", guessed: false },
        { label: "場所", value: "用賀 STUDIO A", guessed: false },
        { label: "想定金額", value: "¥2,150,000", guessed: true },
        { label: "見積の期限", value: "07/29（水）18:00", guessed: true },
      ],

      actionsB: [
        { icon: "calendar-plus", label: "用賀を仮押さえ" },
        { icon: "file-text", label: "見積の下書きを作る" },
        { icon: "corner-up-left", label: "依頼者に差し戻す" },
      ],


      scheduleB: [
        { time: "10:00", title: "ケイ・フーズ 商品発表会 本番", room: "用賀 STUDIO A", dot: "#c7243a" },
        { time: "14:30", title: "定期内覧会（第3回）", room: "用賀 エントランス", dot: "#5d6470" },
        { time: "18:00", title: "採用説明会 リハーサル", room: "渋谷 STUDIO", dot: "#f0a000" },
        { time: "明日 09:00", title: "ミナトデジタル 収録", room: "青山 STUDIO", dot: "#005bac" },
      ],

      kpiB: [
        { label: "売上", value: "¥2,380万", delta: "+12.4%", deltaFg: "#197a4b" },
        { label: "粗利", value: "¥712万", delta: "+3.1%", deltaFg: "#197a4b" },
        { label: "営業利益", value: "¥184万", delta: "-6.2%", deltaFg: "#c7243a" },
      ],

      aiLogB: [
        { text: "アオゾラ物流の案件を作りました", time: "18時間前 ・ 指示: 寺井" },
        { text: "サンリバー音響の請求書を取り込みました", time: "昨日 ・ 指示: 経理メール" },
        { text: "内覧会の来場予約 6件を登録しました", time: "2日前 ・ 指示: 自動" },
      ],










    };
})();
