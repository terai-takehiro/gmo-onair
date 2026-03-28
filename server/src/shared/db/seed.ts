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
const EPISODES: Record<string, string> = {};

export async function seed() {
  await initDb();

  const row = queryOne('SELECT COUNT(*) as c FROM users');
  if (row && (row.c as number) > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  const ins = (sql: string, params: unknown[]) => execute(sql, params);
  const staffIds = [USERS.staff1, USERS.staff2, USERS.staff3];

  // ============================================================
  // Users
  // ============================================================
  const userSql = `INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)`;
  ins(userSql, [USERS.admin, '山田 太郎', 'yamada@globalstudio.example.com', 'system_admin']);
  ins(userSql, [USERS.staff1, '佐藤 花子', 'sato@globalstudio.example.com', 'staff']);
  ins(userSql, [USERS.staff2, '鈴木 一郎', 'suzuki@globalstudio.example.com', 'staff']);
  ins(userSql, [USERS.staff3, '高橋 美咲', 'takahashi@globalstudio.example.com', 'staff']);
  ins(userSql, [USERS.viewer, '田中 健二', 'tanaka@globalstudio.example.com', 'viewer']);
  ins(userSql, [USERS.external, '外部 クライアント', 'client@example.com', 'external_client']);

  // ============================================================
  // Customers
  // ============================================================
  const custSql = `INSERT INTO customers (id, name, short_name, notes) VALUES (?, ?, ?, ?)`;
  const customerData: [string, string][] = [
    ['株式会社グローバルホールディングス', 'GH'],
    ['株式会社ペイメントワークス', 'PW'],
    ['株式会社デジタルトレード', 'DT'],
    ['東都テレビ株式会社', '東都TV'],
    ['サンネットワーク株式会社', 'SN'],
    ['グローバルエンターテインメント株式会社', 'GE'],
    ['JBCテレビ株式会社', 'JB'],
    ['富士見放送株式会社', '富士見'],
    ['株式会社デジタルアドバンス', 'DA'],
    ['中央放送株式会社', '中央放送'],
  ];
  for (const [name, short] of customerData) {
    const id = uuidv4();
    CUSTOMERS[short] = id;
    ins(custSql, [id, name, short, null]);
  }

  // ============================================================
  // Vendors
  // ============================================================
  const vendorSql = `INSERT INTO vendors (id, name, vendor_type, invoice_registration_number) VALUES (?, ?, ?, ?)`;
  const vendorData: [string, string, string | null][] = [
    ['株式会社テクニカルプロ', '技術', 'T1234567890123'],
    ['ライティングサービス株式会社', '照明', 'T2345678901234'],
    ['株式会社サウンドクリエイト', '音響', 'T3456789012345'],
    ['ストリームテック株式会社', '配信', 'T4567890123456'],
    ['株式会社アートワークス', '美術', 'T5678901234567'],
    ['プロレンタル株式会社', '機材', 'T6789012345678'],
    ['ケータリングデリシャス株式会社', '弁当', null],
    ['株式会社トランスポートサービス', '運送', 'T8901234567890'],
  ];
  for (const [name, vType, regNum] of vendorData) {
    const id = uuidv4();
    VENDORS[vType] = id;
    ins(vendorSql, [id, name, vType, regNum]);
  }

  // ============================================================
  // Pricing Categories & Items
  // ============================================================
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

  ins(itemSql, [uuidv4(), CATS['基本料金'], '基本利用料金', '平日', 1500000, 'days', 1]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '基本利用料金', '土日祝／繁忙期', 2000000, 'days', 2]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外利用料金', '平日', 100000, 'days', 3]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外利用料金', '土日祝／繁忙期', 150000, 'days', 4]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外対応料金', null, 40000, 'hours', 5]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], '施設管理費・清掃対応費', null, 50000, 'fixed', 6]);
  ins(itemSql, [uuidv4(), CATS['基本料金'], 'パントリー利用', null, 100000, 'days', 7]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], '全室利用', null, 100000, 'days', 1]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM A', null, 20000, 'days', 2]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM B', null, 20000, 'days', 3]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM C', null, 20000, 'days', 4]);
  ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'VIP LOUNGE', null, 50000, 'days', 5]);
  ins(itemSql, [uuidv4(), CATS['機材費'], 'クレーンカメラ', null, 150000, 'days_qty', 1]);
  ins(itemSql, [uuidv4(), CATS['機材費'], 'スタジオカメラ', null, 100000, 'days_qty', 2]);
  ins(itemSql, [uuidv4(), CATS['機材費'], 'ワイヤレスジンバルカメラ', null, 50000, 'days_qty', 3]);
  ins(itemSql, [uuidv4(), CATS['機材費'], '汎用PC', null, 15000, 'days_qty', 4]);
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
  ins(itemSql, [uuidv4(), CATS['技術運用費'], 'LED／XR調整費', null, 10000, 'hours', 1]);
  ins(itemSql, [uuidv4(), CATS['技術運用費'], '照明事前調整費', null, 10000, 'hours', 2]);
  ins(itemSql, [uuidv4(), CATS['追加演出'], 'XR/AR演出制作費用', null, 150000, 'toggle', 1]);
  ins(itemSql, [uuidv4(), CATS['追加演出'], '多言語演出', null, 200000, 'toggle', 2]);
  ins(itemSql, [uuidv4(), CATS['追加演出'], 'ZOOM中継', null, 100000, 'toggle', 3]);
  ins(itemSql, [uuidv4(), CATS['追加演出'], 'IP中継', null, 200000, 'toggle', 4]);
  ins(itemSql, [uuidv4(), CATS['その他'], 'ロケハン対応', null, 0, 'toggle', 1]);

  // ============================================================
  // Sequences
  // ============================================================
  ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['gls_global', 'GLS', '000000', 8]);
  ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['opp_code', 'OPP', '202603', 15]);

  // ============================================================
  // Projects (統合: ヨミ段階 + GLS発番済み)
  // ============================================================
  const projSql = `INSERT INTO projects (id, code, gls_number, name, customer_id, stage, project_type, expected_amount, event_start, event_end, broadcast_type, media_platform, assigned_to, tags, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  // --- ヨミ段階（GLS番号なし）---
  const yomiData: [string, string, string, string, string, number, string, string][] = [
    ['OPP-202603-0001', '中央放送 春の特別企画', '中央放送', 'recording', 'neta', 3000000, '2026-05-01', ''],
    ['OPP-202603-0002', 'GH サマーカンファレンス', 'GH', 'hybrid_event', 'neta', 5000000, '2026-06-15', ''],
    ['OPP-202603-0003', 'DA 動画配信スタジオ定期利用', 'DA', 'live_broadcast', 'd_hold', 1200000, '2026-04-20', ''],
    ['OPP-202603-0004', '東都TV ドラマ撮影', '東都TV', 'recording', 'c_proposal', 8000000, '2026-05-10', ''],
    ['OPP-202603-0005', 'SN スポーツ中継', 'SN', 'live_broadcast', 'c_proposal', 6000000, '2026-04-25', ''],
    ['OPP-202603-0006', 'GE リアリティ番組制作', 'GE', 'recording', 'c_proposal', 12000000, '2026-06-01', ''],
    ['OPP-202603-0007', 'JB 音楽番組収録', 'JB', 'recording', 'd_hold', 4500000, '2026-04-18', ''],
    ['OPP-202603-0008', '富士見 バラエティ撮影', '富士見', 'offline_event', 'd_hold', 3500000, '2026-04-22', ''],
    ['OPP-202603-0009', 'PW IR動画制作', 'PW', 'gmo_project', 'c_proposal', 2000000, '2026-04-08', ''],
  ];
  for (let i = 0; i < yomiData.length; i++) {
    const [code, name, custKey, projType, stage, amt, date, tags] = yomiData[i];
    const id = uuidv4();
    ins(projSql, [id, code, null, name, CUSTOMERS[custKey], stage, projType, amt, date, null, null, null, staffIds[i % 3], tags, USERS.admin]);
  }

  // --- 失注 ---
  const lostData: [string, string, string, string, number, string][] = [
    ['OPP-202603-0013', '中央放送 年末特別企画', '中央放送', 'recording', 10000000, '2026-03-01'],
    ['OPP-202603-0014', 'DT CM撮影', 'DT', 'offline_event', 2500000, '2026-02-20'],
    ['OPP-202603-0015', 'JB ドラマ撮影（延期）', 'JB', 'recording', 9000000, '2026-03-15'],
  ];
  for (let i = 0; i < lostData.length; i++) {
    const [code, name, custKey, projType, amt, date] = lostData[i];
    const id = uuidv4();
    execute(
      `INSERT INTO projects (id, code, name, customer_id, stage, project_type, expected_amount, event_start, assigned_to, lost_reason, created_by) VALUES (?, ?, ?, ?, 'e_lost', ?, ?, ?, ?, ?, ?)`,
      [id, code, name, CUSTOMERS[custKey], projType, amt, date, staffIds[i % 3], '予算不足', USERS.admin]
    );
  }

  // --- GLS発番済み（案件進行中）---
  const glsData: [string, string, string, string, string, number, string, string, string, string, string][] = [
    ['GLS001', 'GH IR説明会 2026春', 'GH', 'hybrid_event', 's_completed', 4000000, '2026-03-19', '2026-03-19', 'live', 'youtube', '株主総会2026'],
    ['GLS002', '東都TV 特番収録「サイエンス・フロンティア」', '東都TV', 'recording', 'a_won', 7500000, '2026-03-22', '2026-03-22', 'recording', 'terrestrial_tv', ''],
    ['GLS003', 'SN 生放送「ナイトトーク」', 'SN', 'live_broadcast', 'a_won', 5500000, '2026-03-25', '2026-03-25', 'live', 'net_media', ''],
    ['GLS004', 'PW 新サービス発表会', 'PW', 'hybrid_event', 'b_verbal', 2800000, '2026-03-30', '2026-03-30', 'live', 'zoom', '株主総会2026'],
    ['GLS005', 'GE ドキュメンタリー撮影', 'GE', 'recording', 'a_won', 12000000, '2026-04-05', '2026-04-07', 'recording', 'net_media', ''],
    ['GLS006', 'DA 社内イベント中継', 'DA', 'live_broadcast', 'b_verbal', 1500000, '2026-04-10', '2026-04-10', 'live', 'teams', ''],
    ['GLS007', 'JB 番組パイロット撮影', 'JB', 'recording', 'b_verbal', 4500000, '2026-04-14', '2026-04-15', 'recording', 'terrestrial_tv', ''],
    ['GLS008', '富士見 CM撮影「春キャンペーン」', '富士見', 'offline_event', 's_completed', 3200000, '2026-03-12', '2026-03-12', 'recording', 'terrestrial_tv', ''],
  ];
  for (let i = 0; i < glsData.length; i++) {
    const [gls, name, custKey, projType, stage, amt, es, ee, bType, mPlatform, tags] = glsData[i];
    const id = uuidv4();
    PROJECTS[gls] = id;
    // GLS発番済みなので code = OPP-xxx (元のヨミコード) + gls_number
    const oppCode = `OPP-202603-${String(10 + i).padStart(4, '0')}`;
    ins(projSql, [id, oppCode, gls, name, CUSTOMERS[custKey], stage, projType, amt, es, ee, bType, mPlatform, staffIds[i % 3], tags, USERS.admin]);
  }

  // ============================================================
  // Episodes
  // ============================================================
  const epSql = `INSERT INTO episodes (id, project_id, episode_number, episode_code, recording_date, broadcast_date, delivery_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  // GLS001: 1 episode
  {
    const epId = uuidv4();
    EPISODES['GLS001-001'] = epId;
    ins(epSql, [epId, PROJECTS['GLS001'], 1, 'GLS001-001', '2026-03-19', '2026-03-19', '2026-03-19', USERS.admin]);
  }

  // GLS002: 13 episodes
  for (let i = 1; i <= 13; i++) {
    const epId = uuidv4();
    const code = `GLS002-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const recDate = `2026-${String(3 + Math.floor((i - 1) / 4)).padStart(2, '0')}-${String(((i - 1) % 28) + 1).padStart(2, '0')}`;
    const bcastDate = `2026-${String(3 + Math.floor(i / 4)).padStart(2, '0')}-${String((i % 28) + 7).padStart(2, '0')}`;
    ins(epSql, [epId, PROJECTS['GLS002'], i, code, recDate, bcastDate, bcastDate, USERS.admin]);
  }

  // GLS003: 4 episodes
  for (let i = 1; i <= 4; i++) {
    const epId = uuidv4();
    const code = `GLS003-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const liveDate = `2026-03-${String(24 + i).padStart(2, '0')}`;
    ins(epSql, [epId, PROJECTS['GLS003'], i, code, liveDate, liveDate, liveDate, USERS.admin]);
  }

  // GLS004: 1 episode
  {
    const epId = uuidv4();
    EPISODES['GLS004-001'] = epId;
    ins(epSql, [epId, PROJECTS['GLS004'], 1, 'GLS004-001', '2026-03-30', '2026-03-30', '2026-03-30', USERS.admin]);
  }

  // GLS005: 6 episodes
  for (let i = 1; i <= 6; i++) {
    const epId = uuidv4();
    const code = `GLS005-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const recDate = `2026-04-${String(i * 2 + 1).padStart(2, '0')}`;
    const bcastDate = `2026-05-${String(i * 3).padStart(2, '0')}`;
    ins(epSql, [epId, PROJECTS['GLS005'], i, code, recDate, bcastDate, bcastDate, USERS.admin]);
  }

  // GLS006-008: 1 episode each
  for (const [gls, recDate, bcastDate] of [
    ['GLS006', '2026-04-10', '2026-04-10'],
    ['GLS007', '2026-04-14', '2026-04-15'],
    ['GLS008', '2026-03-12', '2026-03-12'],
  ] as [string, string, string][]) {
    const epId = uuidv4();
    const code = `${gls}-001`;
    EPISODES[code] = epId;
    ins(epSql, [epId, PROJECTS[gls], 1, code, recDate, bcastDate, bcastDate, USERS.admin]);
  }

  // ============================================================
  // Episode Orders
  // ============================================================
  const eoSql = `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  ins(eoSql, [uuidv4(), PROJECTS['GLS001'], '2026-02-01', 1, 1, 1, '単発案件', USERS.admin]);
  ins(eoSql, [uuidv4(), PROJECTS['GLS002'], '2025-12-02', 12, 1, 12, '初回一括発注', USERS.admin]);
  ins(eoSql, [uuidv4(), PROJECTS['GLS002'], '2026-05-01', 1, 13, 13, '追加発注', USERS.admin]);
  ins(eoSql, [uuidv4(), PROJECTS['GLS003'], '2026-02-15', 4, 1, 4, '4話一括発注', USERS.admin]);
  ins(eoSql, [uuidv4(), PROJECTS['GLS004'], '2026-03-01', 1, 1, 1, '単発案件', USERS.admin]);
  ins(eoSql, [uuidv4(), PROJECTS['GLS005'], '2026-03-01', 6, 1, 6, 'シーズン1発注', USERS.admin]);
  ins(eoSql, [uuidv4(), PROJECTS['GLS006'], '2026-03-10', 1, 1, 1, '単発案件', USERS.admin]);
  ins(eoSql, [uuidv4(), PROJECTS['GLS007'], '2026-03-15', 1, 1, 1, '単発案件', USERS.admin]);
  ins(eoSql, [uuidv4(), PROJECTS['GLS008'], '2026-02-20', 1, 1, 1, '単発案件', USERS.admin]);

  // ============================================================
  // Revenues
  // ============================================================
  const revSql = `INSERT INTO revenues (id, billing_key, project_id, episode_id, customer_id, assigned_to, tax_category, amount, recognition_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  ins(revSql, [uuidv4(), 'GLS001-001-1', PROJECTS['GLS001'], EPISODES['GLS001-001'], CUSTOMERS['GH'], USERS.staff1, 'tax10', 4000000, '2026-03-31', null]);

  for (let i = 1; i <= 13; i++) {
    const code = `GLS002-${String(i).padStart(3, '0')}`;
    const amt = i === 1 ? 576923 + (7500000 - 576923 * 13) : 576923;
    ins(revSql, [uuidv4(), `${code}-1`, PROJECTS['GLS002'], EPISODES[code], CUSTOMERS['東都TV'], staffIds[i % 3], 'tax10', amt, '2026-03-31', null]);
  }

  for (let i = 1; i <= 4; i++) {
    const code = `GLS003-${String(i).padStart(3, '0')}`;
    ins(revSql, [uuidv4(), `${code}-1`, PROJECTS['GLS003'], EPISODES[code], CUSTOMERS['SN'], staffIds[i % 3], 'tax10', 1375000, '2026-03-31', null]);
  }

  ins(revSql, [uuidv4(), 'GLS004-001-1', PROJECTS['GLS004'], EPISODES['GLS004-001'], CUSTOMERS['PW'], USERS.staff3, 'tax10', 2800000, '2026-04-30', null]);

  for (let i = 1; i <= 6; i++) {
    const code = `GLS005-${String(i).padStart(3, '0')}`;
    ins(revSql, [uuidv4(), `${code}-1`, PROJECTS['GLS005'], EPISODES[code], CUSTOMERS['GE'], staffIds[i % 3], 'tax10', 2000000, '2026-04-30', null]);
  }

  ins(revSql, [uuidv4(), 'GLS006-001-1', PROJECTS['GLS006'], EPISODES['GLS006-001'], CUSTOMERS['DA'], USERS.staff3, 'tax10', 1500000, '2026-04-30', null]);
  ins(revSql, [uuidv4(), 'GLS007-001-1', PROJECTS['GLS007'], EPISODES['GLS007-001'], CUSTOMERS['JB'], USERS.staff1, 'tax10', 4500000, '2026-04-30', null]);
  ins(revSql, [uuidv4(), 'GLS008-001-1', PROJECTS['GLS008'], EPISODES['GLS008-001'], CUSTOMERS['富士見'], USERS.staff3, 'tax10', 3200000, '2026-03-31', null]);

  // ============================================================
  // Purchases
  // ============================================================
  const purSql = `INSERT INTO purchases (id, billing_key, project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, tax_category, invoice_qualified, amount, description, recognition_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  ins(purSql, [uuidv4(), 'GLS001-001-1', PROJECTS['GLS001'], EPISODES['GLS001-001'], VENDORS['技術'], USERS.staff1, 'rakuraku', '147510', 'tax10', 1, 800000, 'カメラクルー2名', '2026-03-31', null]);
  ins(purSql, [uuidv4(), 'GLS001-001-2', PROJECTS['GLS001'], EPISODES['GLS001-001'], VENDORS['弁当'], USERS.staff1, 'rakuraku', '147511', 'tax8', 0, 50000, 'ケータリング30名分', '2026-03-31', null]);

  ins(purSql, [uuidv4(), 'GLS002-001-1', PROJECTS['GLS002'], EPISODES['GLS002-001'], VENDORS['技術'], USERS.staff2, 'xpoint', '230001', 'tax10', 1, 1200000, '撮影技術チーム', '2026-03-31', null]);
  ins(purSql, [uuidv4(), 'GLS002-001-2', PROJECTS['GLS002'], EPISODES['GLS002-001'], VENDORS['照明'], USERS.staff2, 'xpoint', '230002', 'tax10', 1, 600000, '照明セット+オペレーター', '2026-03-31', null]);
  ins(purSql, [uuidv4(), 'GLS002-002-2', PROJECTS['GLS002'], EPISODES['GLS002-002'], VENDORS['弁当'], USERS.staff3, 'rakuraku', '147512', 'tax8', 0, 80000, 'ケータリング50名分', '2026-03-31', null]);

  ins(purSql, [uuidv4(), 'GLS003-001-1', PROJECTS['GLS003'], EPISODES['GLS003-001'], VENDORS['配信'], USERS.staff1, 'other', '330001', 'tax10', 1, 900000, 'ライブ配信システム', '2026-03-31', null]);
  ins(purSql, [uuidv4(), 'GLS003-002-1', PROJECTS['GLS003'], EPISODES['GLS003-002'], VENDORS['音響'], USERS.staff2, 'other', '330002', 'tax10', 1, 450000, '音響機材+オペレーター', '2026-03-31', null]);

  ins(purSql, [uuidv4(), 'GLS004-001-1', PROJECTS['GLS004'], EPISODES['GLS004-001'], VENDORS['技術'], USERS.staff3, 'rakuraku', '147513', 'tax10', 1, 700000, '技術スタッフ（見積）', '2026-04-30', null]);

  ins(purSql, [uuidv4(), 'GLS005-001-1', PROJECTS['GLS005'], EPISODES['GLS005-001'], VENDORS['技術'], USERS.staff1, 'xpoint', '230003', 'tax10', 1, 2500000, '撮影チーム3日間', '2026-04-30', null]);
  ins(purSql, [uuidv4(), 'GLS005-002-1', PROJECTS['GLS005'], EPISODES['GLS005-002'], VENDORS['機材'], USERS.staff2, 'xpoint', '230004', 'tax10', 1, 1800000, '特殊機材レンタル', '2026-04-30', null]);
  ins(purSql, [uuidv4(), 'GLS005-003-1', PROJECTS['GLS005'], EPISODES['GLS005-003'], VENDORS['美術'], USERS.staff3, 'other', '530001', 'tax10', 1, 600000, 'セットデザイン', '2026-04-30', null]);
  ins(purSql, [uuidv4(), 'GLS005-004-2', PROJECTS['GLS005'], EPISODES['GLS005-004'], VENDORS['弁当'], USERS.staff1, 'rakuraku', '147514', 'tax8', 0, 120000, 'ケータリング3日間', '2026-04-30', null]);

  ins(purSql, [uuidv4(), 'GLS006-001-1', PROJECTS['GLS006'], EPISODES['GLS006-001'], VENDORS['配信'], USERS.staff2, 'rakuraku', '147515', 'tax10', 1, 400000, '中継システム', '2026-04-30', null]);
  ins(purSql, [uuidv4(), 'GLS007-001-1', PROJECTS['GLS007'], EPISODES['GLS007-001'], VENDORS['技術'], USERS.staff3, 'xpoint', '230005', 'tax10', 1, 900000, '撮影チーム', '2026-04-30', null]);
  ins(purSql, [uuidv4(), 'GLS008-001-1', PROJECTS['GLS008'], EPISODES['GLS008-001'], VENDORS['技術'], USERS.staff1, 'rakuraku', '147516', 'tax10', 1, 1000000, 'CM撮影技術チーム', '2026-03-31', null]);

  // ============================================================
  // Invoice Groups (GLS002)
  // ============================================================
  const igSql = `INSERT INTO invoice_groups (id, project_id, title, invoice_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?)`;
  const igEpSql = `INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)`;

  const ig1 = uuidv4();
  ins(igSql, [ig1, PROJECTS['GLS002'], '第1Q請求 (#1-#4)', '2026-03-31', 'paid', USERS.admin]);
  for (let i = 1; i <= 4; i++) ins(igEpSql, [ig1, EPISODES[`GLS002-${String(i).padStart(3, '0')}`]]);

  const ig2 = uuidv4();
  ins(igSql, [ig2, PROJECTS['GLS002'], '第2Q請求 (#5-#8)', '2026-06-30', 'sent', USERS.admin]);
  for (let i = 5; i <= 8; i++) ins(igEpSql, [ig2, EPISODES[`GLS002-${String(i).padStart(3, '0')}`]]);

  const ig3 = uuidv4();
  ins(igSql, [ig3, PROJECTS['GLS002'], '第3Q請求 (#9-#12)', '2026-09-30', 'draft', USERS.admin]);
  for (let i = 9; i <= 12; i++) ins(igEpSql, [ig3, EPISODES[`GLS002-${String(i).padStart(3, '0')}`]]);

  // ============================================================
  // SGA Expenses
  // ============================================================
  const sgaSql = `INSERT INTO sga_expenses (id, billing_key, assigned_to, settlement_method, settlement_number, vendor_name, description, recognition_date, payment_due_date, tax_category, invoice_qualified, amount, expense_type, amortize_start, amortize_end, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  ins(sgaSql, [uuidv4(), '20260101-1', USERS.staff1, 'other', '900001', '株式会社スタジオプロパティ', 'オフィス賃料（月額）', '2026-01-01', '2026-01-31', 'tax10', 1, 800000, 'fixed', '2026-01', '2026-12', 'staff', USERS.admin]);
  ins(sgaSql, [uuidv4(), '20260401-1', USERS.staff2, 'other', '900002', '東京海上日動火災保険', '事業用火災保険', '2026-04-01', '2026-04-30', 'tax10', 1, 300000, 'spot', '2026-04', '2027-03', 'staff', USERS.admin]);
  ins(sgaSql, [uuidv4(), '20260315-1', USERS.staff3, 'rakuraku', '147520', 'ホテルニューオータニ', '顧客打ち合わせ会食費', '2026-03-15', '2026-04-15', 'tax10', 1, 45000, 'spot', null, null, 'staff', USERS.admin]);
  ins(sgaSql, [uuidv4(), '20260301-1', USERS.staff1, 'other', '900003', '株式会社マネーフォワード', '会計ソフト年間利用料', '2026-03-01', '2026-03-31', 'tax10', 1, 120000, 'spot', null, null, 'accounting', USERS.admin]);

  saveDb();
  console.log('Seed data inserted successfully.');
}

if (require.main === module) {
  runMigrations().then(() => seed()).then(() => closeDb());
}
