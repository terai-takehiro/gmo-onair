import { v4 as uuidv4 } from 'uuid';
import { initDb, getDb, saveDb, closeDb, queryOne, execute } from './connection';
import { runMigrations } from './migrate';

const USERS = {
  admin: '00000000-0000-0000-0000-000000000001',
  staff1: '00000000-0000-0000-0000-000000000002',
  staff2: '00000000-0000-0000-0000-000000000003',
  staff3: '00000000-0000-0000-0000-000000000004',
  viewer: '00000000-0000-0000-0000-000000000005',
  external: '00000000-0000-0000-0000-000000000006',
};

const CUSTOMERS: Record<string, string> = {};
const VENDORS: Record<string, string> = {};
const PROJECTS: Record<string, string> = {};

export async function seed() {
  await initDb();

  const row = queryOne('SELECT COUNT(*) as c FROM users');
  if (row && (row.c as number) > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  const ins = (sql: string, params: unknown[]) => execute(sql, params);

  // Users
  const userSql = `INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)`;
  ins(userSql, [USERS.admin, '山田 太郎', 'yamada@gmo-globalstudio.com', 'system_admin']);
  ins(userSql, [USERS.staff1, '佐藤 花子', 'sato@gmo-globalstudio.com', 'staff']);
  ins(userSql, [USERS.staff2, '鈴木 一郎', 'suzuki@gmo-globalstudio.com', 'staff']);
  ins(userSql, [USERS.staff3, '高橋 美咲', 'takahashi@gmo-globalstudio.com', 'staff']);
  ins(userSql, [USERS.viewer, '田中 健二', 'tanaka@gmo-globalstudio.com', 'viewer']);
  ins(userSql, [USERS.external, '外部 クライアント', 'client@example.com', 'external_client']);

  // Customers
  const custSql = `INSERT INTO customers (id, name, short_name, notes) VALUES (?, ?, ?, ?)`;
  const customerData: [string, string][] = [
    ['GMOインターネットグループ株式会社', 'GMO-IG'],
    ['GMOペイメントゲートウェイ株式会社', 'GMO-PG'],
    ['GMOクリック証券株式会社', 'GMOクリック'],
    ['株式会社テレビ東京', 'テレ東'],
    ['日本テレビ放送網株式会社', '日テレ'],
    ['株式会社TBSテレビ', 'TBS'],
    ['株式会社フジテレビジョン', 'フジ'],
    ['株式会社ABEMA', 'ABEMA'],
    ['Netflix株式会社', 'Netflix'],
    ['株式会社サイバーエージェント', 'CA'],
  ];
  for (const [name, short] of customerData) {
    const id = uuidv4();
    CUSTOMERS[short] = id;
    ins(custSql, [id, name, short, null]);
  }

  // Vendors
  const vendSql = `INSERT INTO vendors (id, name, address, vendor_type, invoice_registration_number, notes) VALUES (?, ?, ?, ?, ?, ?)`;
  const vendorData: [string, string, string, string | null][] = [
    ['株式会社テクノハウス', '東京都港区', '技術', 'T1234567890123'],
    ['有限会社ライトワークス', '東京都渋谷区', '照明', 'T9876543210987'],
    ['株式会社サウンドクリエイト', '東京都新宿区', '音響', 'T1111222233334'],
    ['ケータリングサービス花', '東京都千代田区', '弁当', null],
    ['株式会社セットデザイン', '東京都中央区', '美術', 'T5555666677778'],
    ['映像機器レンタル株式会社', '東京都品川区', '機材', 'T2222333344445'],
    ['株式会社エディットファクトリー', '東京都目黒区', '編集', 'T3333444455556'],
    ['配信テクノロジー株式会社', '東京都世田谷区', '配信', 'T4444555566667'],
  ];
  for (const [name, addr, type, inv] of vendorData) {
    const id = uuidv4();
    VENDORS[type] = id;
    ins(vendSql, [id, name, addr, type, inv, null]);
  }

  // Partners
  const partSql = `INSERT INTO partners (id, name, email, phone, role_title, specialties, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const partnerData: [string, string, string, string, string][] = [
    ['中村 誠', 'nakamura@example.com', '090-1111-2222', 'チーフカメラマン', '["撮影","ドローン"]'],
    ['小林 真理', 'kobayashi@example.com', '090-3333-4444', '照明ディレクター', '["照明","舞台演出"]'],
    ['渡辺 隆', 'watanabe@example.com', '090-5555-6666', '音声エンジニア', '["音響","MA"]'],
    ['伊藤 美穂', 'ito@example.com', '090-7777-8888', 'ディレクター', '["演出","構成"]'],
    ['木村 大輔', 'kimura@example.com', '090-9999-0000', 'テクニカルディレクター', '["TD","XR","LED"]'],
    ['松本 さくら', 'matsumoto@example.com', '090-1234-5678', 'フロアディレクター', '["FD","進行"]'],
  ];
  for (const [name, email, phone, title, specs] of partnerData) {
    ins(partSql, [uuidv4(), name, email, phone, title, specs, null]);
  }

  // Projects (broadcast_type: live/recording, media_platform: youtube/terrestrial_tv/net_media/zoom/teams/other)
  const projSql = `INSERT INTO projects (id, gls_number, name, customer_id, rehearsal_start, rehearsal_end, event_start, event_end, status, broadcast_type, media_platform, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const projectData: [string, string, string, string | null, string | null, string | null, string | null, string, string, string][] = [
    ['GLS-202603-0001', 'GMO IR説明会 2026春', 'GMO-IG', '2026-03-18', '2026-03-18', '2026-03-19', '2026-03-19', 'completed', 'live', 'youtube'],
    ['GLS-202603-0002', 'テレ東 特番収録「未来の技術」', 'テレ東', '2026-03-20', '2026-03-20', '2026-03-22', '2026-03-22', 'confirmed', 'recording', 'terrestrial_tv'],
    ['GLS-202603-0003', 'ABEMA 生放送「Tech Night」', 'ABEMA', null, null, '2026-03-25', '2026-03-25', 'confirmed', 'live', 'net_media'],
    ['GLS-202603-0004', 'GMO-PG 新サービス発表会', 'GMO-PG', '2026-03-28', '2026-03-28', '2026-03-30', '2026-03-30', 'tentative', 'live', 'zoom'],
    ['GLS-202604-0001', 'Netflix ドキュメンタリー撮影', 'Netflix', '2026-04-02', '2026-04-03', '2026-04-05', '2026-04-07', 'confirmed', 'recording', 'net_media'],
    ['GLS-202604-0002', 'CA 社内イベント中継', 'CA', null, null, '2026-04-10', '2026-04-10', 'tentative', 'live', 'teams'],
    ['GLS-202604-0003', 'TBS 番組パイロット撮影', 'TBS', '2026-04-12', '2026-04-12', '2026-04-14', '2026-04-15', 'tentative', 'recording', 'terrestrial_tv'],
    ['GLS-202603-0005', 'フジ CM撮影「春キャンペーン」', 'フジ', '2026-03-10', '2026-03-10', '2026-03-12', '2026-03-12', 'completed', 'recording', 'terrestrial_tv'],
  ];
  for (const [gls, name, custKey, rs, re, es, ee, status, bType, mPlatform] of projectData) {
    const id = uuidv4();
    PROJECTS[gls] = id;
    ins(projSql, [id, gls, name, CUSTOMERS[custKey], rs, re, es, ee, status, bType, mPlatform, USERS.admin]);
  }

  // Sequences
  ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['gls_number', 'GLS', '202604', 3]);
  ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['opp_code', 'OPP', '202603', 15]);

  // Pricing Categories & Items
  const catSql = `INSERT INTO pricing_categories (id, name, sort_order) VALUES (?, ?, ?)`;
  const itemSql = `INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, calc_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const CATS: Record<string, string> = {};

  const catData: [string, number][] = [
    ['基本料金', 1], ['控室利用料金', 2], ['機材費', 3],
    ['技術人件費', 4], ['技術運用費', 5], ['追加演出', 6], ['その他', 7],
  ];
  for (const [name, order] of catData) {
    const id = uuidv4();
    CATS[name] = id;
    ins(catSql, [id, name, order]);
  }

  // 基本料金
  ins(itemSql, [uuidv4(), CATS['基本料金'], '基本利用料金', '平日', 1500000, 'days', 1]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '基本利用料金', '土日祝／繁忙期', 2000000, 'days', 2]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外利用料金', '平日', 100000, 'days', 3]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外利用料金', '土日祝／繁忙期', 150000, 'days', 4]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外対応料金', null, 40000, 'hours', 5]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '施設管理費・清掃対応費', null, 50000, 'fixed', 6]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], 'パントリー利用', null, 100000, 'days', 7]);

  // 控室利用料金
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], '全室利用', null, 100000, 'days', 1]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM A', null, 20000, 'days', 2]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM B', null, 20000, 'days', 3]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM C', null, 20000, 'days', 4]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'VIP LOUNGE', null, 50000, 'days', 5]);

  // 機材費
  ins(itemSql, [uuidv4(), CATS['機材費'], 'クレーンカメラ', null, 150000, 'days_qty', 1]);
  ins(itemSql, [uuidv4(), CATS['機材費'], 'スタジオカメラ', null, 100000, 'days_qty', 2]);
  ins(itemSql, [uuidv4(), CATS['機材費'], 'ワイヤレスジンバルカメラ', null, 50000, 'days_qty', 3]);
  ins(itemSql, [uuidv4(), CATS['機材費'], '汎用PC', null, 15000, 'days_qty', 4]);

  // 技術人件費
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'テクニカルサポート（TD）', null, 50000, 'days_people', 1]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'LEDエンジニア', null, 60000, 'days_people', 2]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'スイッチャー', null, 60000, 'days_people', 3]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'ビデオエンジニア', null, 55000, 'days_people', 4]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'スタジオカメラ', null, 55000, 'days_people', 5]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'オーディオミキサー', null, 55000, 'days_people', 6]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'PAミキサー', null, 55000, 'days_people', 7]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'テクニカルアシスタント', null, 45000, 'days_people', 8]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], '配信管理・収録', null, 55000, 'days_people', 9]);
  ins(itemSql, [uuidv4(), CATS['技術人件費'], 'ライティングディレクター／オペレーター', null, 55000, 'days_people', 10]);

  // 技術運用費
  ins(itemSql, [uuidv4(), CATS['技術運用費'], 'LED／XR調整費', null, 10000, 'days', 1]);
  ins(itemSql, [uuidv4(), CATS['技術運用費'], '照明事前調整費', null, 10000, 'days', 2]);

  // 追加演出
  ins(itemSql, [uuidv4(), CATS['追加演出'], 'XR/AR演出制作費用', null, 150000, 'toggle', 1]);
  ins(itemSql, [uuidv4(), CATS['追加演出'], '多言語演出', null, 200000, 'toggle', 2]);
  ins(itemSql, [uuidv4(), CATS['追加演出'], 'ZOOM中継', null, 100000, 'toggle', 3]);
  ins(itemSql, [uuidv4(), CATS['追加演出'], 'IP中継', null, 200000, 'toggle', 4]);

  // その他
  ins(itemSql, [uuidv4(), CATS['その他'], 'ロケハン対応', null, 0, 'toggle', 1]);

  // Opportunities (新ステージ体系)
  const oppSql = `INSERT INTO opportunities (id, opp_code, title, customer_id, project_type, stage, probability, expected_amount, expected_date, assigned_to, project_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const staffIds = [USERS.staff1, USERS.staff2, USERS.staff3];
  const oppData: [string, string, string, string, string, number, number, string, string | null][] = [
    ['OPP-202603-0001', '日テレ 春の特番企画', '日テレ', 'recording', 'neta', 0, 3000000, '2026-05-01', null],
    ['OPP-202603-0002', 'GMO-IG サマーイベント', 'GMO-IG', 'hybrid_event', 'neta', 0, 5000000, '2026-06-15', null],
    ['OPP-202603-0003', 'CA 動画配信スタジオ定期利用', 'CA', 'live_broadcast', 'd_hold', 20, 1200000, '2026-04-20', null],
    ['OPP-202603-0004', 'テレ東 ドラマ撮影', 'テレ東', 'recording', 'c_proposal', 40, 8000000, '2026-05-10', null],
    ['OPP-202603-0005', 'ABEMA 格闘技中継', 'ABEMA', 'live_broadcast', 'c_proposal', 40, 6000000, '2026-04-25', null],
    ['OPP-202603-0006', 'Netflix リアリティ番組', 'Netflix', 'recording', 'c_proposal', 40, 12000000, '2026-06-01', null],
    ['OPP-202603-0007', 'TBS 音楽番組収録', 'TBS', 'recording', 'd_hold', 20, 4500000, '2026-04-18', null],
    ['OPP-202603-0008', 'フジ バラエティ撮影', 'フジ', 'offline_event', 'd_hold', 20, 3500000, '2026-04-22', null],
    ['OPP-202603-0009', 'GMO-PG IR動画制作', 'GMO-PG', 'gmo_project', 'c_proposal', 40, 2000000, '2026-04-08', null],
    ['OPP-202603-0010', 'GMO IR説明会 2026春', 'GMO-IG', 'hybrid_event', 'a_won', 100, 4000000, '2026-03-19', 'GLS-202603-0001'],
    ['OPP-202603-0011', 'テレ東 特番収録「未来の技術」', 'テレ東', 'recording', 'a_won', 100, 7500000, '2026-03-22', 'GLS-202603-0002'],
    ['OPP-202603-0012', 'ABEMA 生放送「Tech Night」', 'ABEMA', 'live_broadcast', 'a_won', 100, 5500000, '2026-03-25', 'GLS-202603-0003'],
    ['OPP-202603-0013', '日テレ 年末特番企画', '日テレ', 'recording', 'e_lost', 0, 10000000, '2026-03-01', null],
    ['OPP-202603-0014', 'GMOクリック CM撮影', 'GMOクリック', 'offline_event', 'e_lost', 0, 2500000, '2026-02-20', null],
    ['OPP-202603-0015', 'TBS ドラマ撮影（延期）', 'TBS', 'recording', 'e_lost', 0, 9000000, '2026-03-15', null],
  ];
  for (let i = 0; i < oppData.length; i++) {
    const [code, title, custKey, projType, stage, prob, amt, date, projGls] = oppData[i];
    const projId = projGls ? PROJECTS[projGls] || null : null;
    ins(oppSql, [uuidv4(), code, title, CUSTOMERS[custKey], projType, stage, prob, amt, date, staffIds[i % 3], projId, USERS.admin]);
  }

  // Revenues
  const revSql = `INSERT INTO revenues (id, billing_key, project_id, customer_id, assigned_to, tax_category, amount, recognition_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const revenueData: [string, string, string, number, string, string][] = [
    ['GLS-202603-0001', 'GMO-IG', 'tax10', 4000000, '2026-03-31', 'スタジオ利用+技術費'],
    ['GLS-202603-0002', 'テレ東', 'tax10', 5000000, '2026-03-31', 'スタジオ利用料'],
    ['GLS-202603-0002', 'テレ東', 'tax10', 2500000, '2026-03-31', '技術スタッフ費'],
    ['GLS-202603-0003', 'ABEMA', 'tax10', 3500000, '2026-03-31', 'スタジオ利用+配信技術'],
    ['GLS-202603-0003', 'ABEMA', 'tax10', 2000000, '2026-03-31', '追加機材レンタル'],
    ['GLS-202603-0004', 'GMO-PG', 'tax10', 2800000, '2026-04-30', 'スタジオ利用料（仮）'],
    ['GLS-202604-0001', 'Netflix', 'tax10', 8000000, '2026-04-30', '撮影スタジオ3日間'],
    ['GLS-202604-0001', 'Netflix', 'tax10', 4000000, '2026-04-30', '技術スタッフ+機材'],
    ['GLS-202604-0002', 'CA', 'tax10', 1500000, '2026-04-30', 'スタジオ利用料'],
    ['GLS-202604-0003', 'TBS', 'tax10', 3000000, '2026-04-30', 'パイロット撮影費'],
    ['GLS-202604-0003', 'TBS', 'tax10', 1500000, '2026-04-30', '編集室利用料'],
    ['GLS-202603-0005', 'フジ', 'tax10', 3200000, '2026-03-31', 'CM撮影一式'],
  ];
  for (let i = 0; i < revenueData.length; i++) {
    const [glsNum, custKey, tax, amount, recDate, note] = revenueData[i];
    ins(revSql, [uuidv4(), `${glsNum}-${(i % 3) + 1}`, PROJECTS[glsNum], CUSTOMERS[custKey], staffIds[i % 3], tax, amount, recDate, note]);
  }

  // Purchases
  const purSql = `INSERT INTO purchases (id, project_id, vendor_id, assigned_to, settlement_method, tax_category, invoice_qualified, amount, description, recognition_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const purchaseData: [string, string, string, string, number, number, string, string][] = [
    ['GLS-202603-0001', '技術', 'rakuraku', 'tax10', 1, 800000, 'カメラクルー2名', '2026-03-31'],
    ['GLS-202603-0001', '弁当', 'rakuraku', 'tax8', 0, 50000, 'ケータリング30名分', '2026-03-31'],
    ['GLS-202603-0002', '技術', 'xpoint', 'tax10', 1, 1200000, '撮影技術チーム', '2026-03-31'],
    ['GLS-202603-0002', '照明', 'xpoint', 'tax10', 1, 600000, '照明セット+オペレーター', '2026-03-31'],
    ['GLS-202603-0002', '弁当', 'rakuraku', 'tax8', 0, 80000, 'ケータリング50名分', '2026-03-31'],
    ['GLS-202603-0003', '配信', 'other', 'tax10', 1, 900000, 'ライブ配信システム', '2026-03-31'],
    ['GLS-202603-0003', '音響', 'other', 'tax10', 1, 450000, '音響機材+オペレーター', '2026-03-31'],
    ['GLS-202603-0004', '技術', 'rakuraku', 'tax10', 1, 700000, '技術スタッフ（見積）', '2026-04-30'],
    ['GLS-202604-0001', '技術', 'xpoint', 'tax10', 1, 2500000, '撮影チーム3日間', '2026-04-30'],
    ['GLS-202604-0001', '機材', 'xpoint', 'tax10', 1, 1800000, '特殊機材レンタル', '2026-04-30'],
    ['GLS-202604-0001', '美術', 'other', 'tax10', 1, 600000, 'セットデザイン', '2026-04-30'],
    ['GLS-202604-0001', '弁当', 'rakuraku', 'tax8', 0, 120000, 'ケータリング3日間', '2026-04-30'],
    ['GLS-202604-0002', '配信', 'rakuraku', 'tax10', 1, 400000, '中継システム', '2026-04-30'],
    ['GLS-202604-0003', '技術', 'xpoint', 'tax10', 1, 900000, '撮影チーム', '2026-04-30'],
    ['GLS-202603-0005', '技術', 'rakuraku', 'tax10', 1, 1000000, 'CM撮影技術チーム', '2026-03-31'],
  ];
  for (const [glsNum, vendorType, method, tax, invQual, amount, desc, recDate] of purchaseData) {
    ins(purSql, [uuidv4(), PROJECTS[glsNum], VENDORS[vendorType], staffIds[Math.floor(Math.random() * 3)], method, tax, invQual, amount, desc, recDate, null]);
  }

  // Episodes - テレ東特番(GLS-202603-0002): 12話一括 + 1話追加
  const epSql = `INSERT INTO episodes (id, project_id, episode_number, episode_code, recording_date, broadcast_date, delivery_date, revenue_budget, cost_budget, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const EPISODES: Record<string, string> = {};
  const teltoProject = PROJECTS['GLS-202603-0002'];
  for (let i = 1; i <= 13; i++) {
    const epId = uuidv4();
    const code = `GLS-202603-0002-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const recDate = `2026-${String(3 + Math.floor((i - 1) / 4)).padStart(2, '0')}-${String(((i - 1) % 28) + 1).padStart(2, '0')}`;
    const bcastDate = `2026-${String(3 + Math.floor(i / 4)).padStart(2, '0')}-${String((i % 28) + 7).padStart(2, '0')}`;
    ins(epSql, [epId, teltoProject, i, code, recDate, bcastDate, bcastDate, 600000, 350000, USERS.admin]);
  }

  // Episodes - ABEMA生放送(GLS-202603-0003): 4話(生放送なので収録日=放送日)
  const abemaProject = PROJECTS['GLS-202603-0003'];
  for (let i = 1; i <= 4; i++) {
    const epId = uuidv4();
    const code = `GLS-202603-0003-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const liveDate = `2026-03-${String(24 + i).padStart(2, '0')}`;
    ins(epSql, [epId, abemaProject, i, code, liveDate, liveDate, liveDate, 1200000, 700000, USERS.admin]);
  }

  // Netflix(GLS-202604-0001): 6話
  const netflixProject = PROJECTS['GLS-202604-0001'];
  for (let i = 1; i <= 6; i++) {
    const epId = uuidv4();
    const code = `GLS-202604-0001-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const recDate = `2026-04-${String(i * 2 + 1).padStart(2, '0')}`;
    const bcastDate = `2026-05-${String(i * 3).padStart(2, '0')}`;
    ins(epSql, [epId, netflixProject, i, code, recDate, bcastDate, bcastDate, 2000000, 900000, USERS.admin]);
  }

  // Episode Orders
  const eoSql = `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  ins(eoSql, [uuidv4(), teltoProject, '2025-12-02', 12, 1, 12, '初回一括発注', USERS.admin]);
  ins(eoSql, [uuidv4(), teltoProject, '2026-05-01', 1, 13, 13, '追加発注', USERS.admin]);
  ins(eoSql, [uuidv4(), abemaProject, '2026-02-15', 4, 1, 4, '4話一括発注', USERS.admin]);
  ins(eoSql, [uuidv4(), netflixProject, '2026-03-01', 6, 1, 6, 'シーズン1発注', USERS.admin]);

  // Invoice Groups - テレ東: 4話ずつグループ化
  const igSql = `INSERT INTO invoice_groups (id, project_id, title, invoice_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?)`;
  const igEpSql = `INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)`;
  const ig1 = uuidv4();
  ins(igSql, [ig1, teltoProject, '第1Q請求 (#1-#4)', '2026-03-31', 'paid', USERS.admin]);
  for (let i = 1; i <= 4; i++) {
    ins(igEpSql, [ig1, EPISODES[`GLS-202603-0002-${String(i).padStart(3, '0')}`]]);
  }
  const ig2 = uuidv4();
  ins(igSql, [ig2, teltoProject, '第2Q請求 (#5-#8)', '2026-06-30', 'sent', USERS.admin]);
  for (let i = 5; i <= 8; i++) {
    ins(igEpSql, [ig2, EPISODES[`GLS-202603-0002-${String(i).padStart(3, '0')}`]]);
  }
  const ig3 = uuidv4();
  ins(igSql, [ig3, teltoProject, '第3Q請求 (#9-#12)', '2026-09-30', 'draft', USERS.admin]);
  for (let i = 9; i <= 12; i++) {
    ins(igEpSql, [ig3, EPISODES[`GLS-202603-0002-${String(i).padStart(3, '0')}`]]);
  }

  saveDb();
  console.log('Seed data inserted successfully.');
}

if (require.main === module) {
  runMigrations().then(() => seed()).then(() => closeDb());
}
