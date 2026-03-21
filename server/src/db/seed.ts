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

  // Projects
  const projSql = `INSERT INTO projects (id, gls_number, name, customer_id, rehearsal_start, rehearsal_end, event_start, event_end, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const projectData: [string, string, string, string | null, string | null, string | null, string | null, string][] = [
    ['GLS-202603-0001', 'GMO IR説明会 2026春', 'GMO-IG', '2026-03-18', '2026-03-18', '2026-03-19', '2026-03-19', 'completed'],
    ['GLS-202603-0002', 'テレ東 特番収録「未来の技術」', 'テレ東', '2026-03-20', '2026-03-20', '2026-03-22', '2026-03-22', 'confirmed'],
    ['GLS-202603-0003', 'ABEMA 生放送「Tech Night」', 'ABEMA', null, null, '2026-03-25', '2026-03-25', 'confirmed'],
    ['GLS-202603-0004', 'GMO-PG 新サービス発表会', 'GMO-PG', '2026-03-28', '2026-03-28', '2026-03-30', '2026-03-30', 'tentative'],
    ['GLS-202604-0001', 'Netflix ドキュメンタリー撮影', 'Netflix', '2026-04-02', '2026-04-03', '2026-04-05', '2026-04-07', 'confirmed'],
    ['GLS-202604-0002', 'CA 社内イベント中継', 'CA', null, null, '2026-04-10', '2026-04-10', 'tentative'],
    ['GLS-202604-0003', 'TBS 番組パイロット撮影', 'TBS', '2026-04-12', '2026-04-12', '2026-04-14', '2026-04-15', 'tentative'],
    ['GLS-202603-0005', 'フジ CM撮影「春キャンペーン」', 'フジ', '2026-03-10', '2026-03-10', '2026-03-12', '2026-03-12', 'completed'],
  ];
  for (const [gls, name, custKey, rs, re, es, ee, status] of projectData) {
    const id = uuidv4();
    PROJECTS[gls] = id;
    ins(projSql, [id, gls, name, CUSTOMERS[custKey], rs, re, es, ee, status, USERS.admin]);
  }

  // Sequences
  ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['gls_number', 'GLS', '202604', 3]);
  ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['opp_code', 'OPP', '202603', 15]);

  // Opportunities
  const oppSql = `INSERT INTO opportunities (id, opp_code, title, customer_id, stage, probability, expected_amount, expected_date, assigned_to, project_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const staffIds = [USERS.staff1, USERS.staff2, USERS.staff3];
  const oppData: [string, string, string, string, number, number, string, string | null][] = [
    ['OPP-202603-0001', '日テレ 春の特番企画', '日テレ', 'lead', 20, 3000000, '2026-05-01', null],
    ['OPP-202603-0002', 'GMO-IG サマーイベント', 'GMO-IG', 'lead', 30, 5000000, '2026-06-15', null],
    ['OPP-202603-0003', 'CA 動画配信スタジオ定期利用', 'CA', 'lead', 15, 1200000, '2026-04-20', null],
    ['OPP-202603-0004', 'テレ東 ドラマ撮影', 'テレ東', 'proposal', 40, 8000000, '2026-05-10', null],
    ['OPP-202603-0005', 'ABEMA 格闘技中継', 'ABEMA', 'proposal', 50, 6000000, '2026-04-25', null],
    ['OPP-202603-0006', 'Netflix リアリティ番組', 'Netflix', 'proposal', 45, 12000000, '2026-06-01', null],
    ['OPP-202603-0007', 'TBS 音楽番組収録', 'TBS', 'negotiation', 60, 4500000, '2026-04-18', null],
    ['OPP-202603-0008', 'フジ バラエティ撮影', 'フジ', 'negotiation', 70, 3500000, '2026-04-22', null],
    ['OPP-202603-0009', 'GMO-PG IR動画制作', 'GMO-PG', 'negotiation', 75, 2000000, '2026-04-08', null],
    ['OPP-202603-0010', 'GMO IR説明会 2026春', 'GMO-IG', 'won', 100, 4000000, '2026-03-19', 'GLS-202603-0001'],
    ['OPP-202603-0011', 'テレ東 特番収録「未来の技術」', 'テレ東', 'won', 100, 7500000, '2026-03-22', 'GLS-202603-0002'],
    ['OPP-202603-0012', 'ABEMA 生放送「Tech Night」', 'ABEMA', 'won', 100, 5500000, '2026-03-25', 'GLS-202603-0003'],
    ['OPP-202603-0013', '日テレ 年末特番企画', '日テレ', 'lost', 0, 10000000, '2026-03-01', null],
    ['OPP-202603-0014', 'GMOクリック CM撮影', 'GMOクリック', 'lost', 0, 2500000, '2026-02-20', null],
    ['OPP-202603-0015', 'TBS ドラマ撮影（延期）', 'TBS', 'lost', 0, 9000000, '2026-03-15', null],
  ];
  for (let i = 0; i < oppData.length; i++) {
    const [code, title, custKey, stage, prob, amt, date, projGls] = oppData[i];
    const projId = projGls ? PROJECTS[projGls] || null : null;
    ins(oppSql, [uuidv4(), code, title, CUSTOMERS[custKey], stage, prob, amt, date, staffIds[i % 3], projId, USERS.admin]);
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

  saveDb();
  console.log('Seed data inserted successfully.');
}

if (require.main === module) {
  runMigrations().then(() => seed()).then(() => closeDb());
}
