import { v4 as uuidv4 } from 'uuid';
import { initDb, saveDb, closeDb, queryOne, execute } from './connection';
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

  const row = await queryOne('SELECT COUNT(*) as c FROM users');
  if (row && (row.c as number) > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  const ins = async (sql: string, params: unknown[]) => { await execute(sql, params); };
  const staffIds = [USERS.staff1, USERS.staff2, USERS.staff3];

  // ============================================================
  // Users
  // ============================================================
  const userSql = `INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)`;
  await ins(userSql, [USERS.admin, '山田 太郎', 'yamada@globalstudio.example.com', 'system_admin']);
  await ins(userSql, [USERS.staff1, '佐藤 花子', 'sato@globalstudio.example.com', 'staff']);
  await ins(userSql, [USERS.staff2, '鈴木 一郎', 'suzuki@globalstudio.example.com', 'staff']);
  await ins(userSql, [USERS.staff3, '高橋 美咲', 'takahashi@globalstudio.example.com', 'staff']);
  await ins(userSql, [USERS.viewer, '田中 健二', 'tanaka@globalstudio.example.com', 'viewer']);
  await ins(userSql, [USERS.external, '外部 クライアント', 'client@example.com', 'external_client']);

  // ============================================================
  // User Permissions (system_admin bypasses checks, so only non-admin users)
  // ============================================================
  const permSql = `INSERT INTO user_permissions (id, user_id, module, access_level) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`;
  // ブロックアプリごとに個別設定
  const perms: [string, string, string][] = [
    // staff1 — 佐藤（営業マネージャー寄り）
    //        営業管理    予算管理      スタジオ     機材管理     Qシート
    [USERS.staff1, 'sales',     'owner'],      // 営業の責任者
    [USERS.staff1, 'budget',    'manager'],    // 予算も削除可
    [USERS.staff1, 'studio',    'editor'],     // スタジオ予約は編集まで
    [USERS.staff1, 'equipment', 'exporter'],   // 機材は閲覧+出力のみ
    [USERS.staff1, 'qsheet',    'editor'],     // Qシート編集可
    [USERS.staff1, 'interactive', 'editor'],  // インタラクティブ編集可

    // staff2 — 鈴木（制作マネージャー寄り）
    [USERS.staff2, 'sales',     'editor'],     // 営業は編集まで
    [USERS.staff2, 'budget',    'exporter'],   // 予算は出力まで
    [USERS.staff2, 'studio',    'owner'],      // スタジオの責任者
    [USERS.staff2, 'equipment', 'manager'],    // 機材は削除可
    [USERS.staff2, 'qsheet',    'owner'],      // Qシートの責任者
    [USERS.staff2, 'interactive', 'owner'],   // インタラクティブ責任者

    // staff3 — 高橋（制作スタッフ）
    [USERS.staff3, 'sales',     'reader'],     // 営業は閲覧のみ
    [USERS.staff3, 'studio',    'editor'],     // スタジオ予約は編集可
    [USERS.staff3, 'equipment', 'editor'],     // 機材も編集可
    [USERS.staff3, 'qsheet',    'editor'],     // Qシート編集可
    [USERS.staff3, 'interactive', 'editor'],  // インタラクティブ編集可
    // budget: アクセスなし

    // viewer — 田中（経営層・閲覧用）
    [USERS.viewer, 'sales',     'exporter'],   // 営業レポート出力
    [USERS.viewer, 'budget',    'exporter'],   // 予算レポート出力
    [USERS.viewer, 'studio',    'reader'],     // スタジオは閲覧のみ
    [USERS.viewer, 'qsheet',    'reader'],     // Qシート閲覧のみ
    [USERS.viewer, 'interactive', 'reader'],  // インタラクティブ閲覧
    // equipment: アクセスなし

    // external — 山田（外部クライアント）
    [USERS.external, 'studio',  'reader'],     // カレンダー閲覧のみ
    [USERS.external, 'qsheet',  'reader'],     // Qシート閲覧のみ
  ];

  for (const [userId, mod, level] of perms) {
    await ins(permSql, [uuidv4(), userId, mod, level]);
  }

  // ============================================================
  // Customers
  // ============================================================
  const custSql = `INSERT INTO customers (id, name, short_name, contact_name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const customerData: [string, string, string, string, string, string][] = [
    ['株式会社グローバルホールディングス', 'GH', '中村 洋介', 'nakamura@global-hd.example.com', '03-1234-5678', '東京都渋谷区桜丘町26-1'],
    ['株式会社ペイメントワークス', 'PW', '小林 真理', 'kobayashi@paymentworks.example.com', '03-2345-6789', '東京都渋谷区道玄坂1-14-6'],
    ['株式会社デジタルトレード', 'DT', '伊藤 直樹', 'ito@digitaltrade.example.com', '03-3456-7890', '東京都港区六本木3-2-1'],
    ['東都テレビ株式会社', '東都TV', '松本 健太', 'matsumoto@toto-tv.example.com', '03-4567-8901', '東京都港区台場2-4-8'],
    ['サンネットワーク株式会社', 'SN', '渡辺 美穂', 'watanabe@sunnetwork.example.com', '03-5678-9012', '東京都新宿区西新宿2-8-1'],
    ['グローバルエンターテインメント株式会社', 'GE', '加藤 隆志', 'kato@global-ent.example.com', '03-6789-0123', '東京都目黒区下目黒1-8-1'],
    ['JBCテレビ株式会社', 'JB', '吉田 恵子', 'yoshida@jbc-tv.example.com', '03-7890-1234', '東京都港区赤坂5-3-6'],
    ['富士見放送株式会社', '富士見', '木村 大輔', 'kimura@fujimi-bc.example.com', '03-8901-2345', '東京都新宿区河田町1-1'],
    ['株式会社デジタルアドバンス', 'DA', '山口 芳恵', 'yamaguchi@digital-adv.example.com', '03-9012-3456', '東京都千代田区神田錦町3-1'],
    ['中央放送株式会社', '中央放送', '藤田 修一', 'fujita@chuo-bc.example.com', '03-0123-4567', '東京都港区虎ノ門4-3-12'],
  ];
  for (const [name, short, contact, email, phone, address] of customerData) {
    const id = uuidv4();
    CUSTOMERS[short] = id;
    await ins(custSql, [id, name, short, contact, email, phone, address]);
  }

  // ============================================================
  // Vendors
  // ============================================================
  const vendorSql = `INSERT INTO vendors (id, name, contact_name, email, phone, address, vendor_type, invoice_registration_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const vendorData: [string, string, string, string, string, string, string | null][] = [
    ['株式会社テクニカルプロ', '技術', '岡田 誠', 'okada@techpro.example.com', '03-1111-2222', '東京都品川区大崎1-6-4', 'T1234567890123'],
    ['ライティングサービス株式会社', '照明', '森 光太郎', 'mori@lighting-sv.example.com', '03-2222-3333', '東京都世田谷区三軒茶屋2-11-7', 'T2345678901234'],
    ['株式会社サウンドクリエイト', '音響', '石川 雅人', 'ishikawa@soundcreate.example.com', '03-3333-4444', '東京都杉並区高円寺北3-22-5', 'T3456789012345'],
    ['ストリームテック株式会社', '配信', '前田 亮', 'maeda@streamtech.example.com', '03-4444-5555', '東京都中央区日本橋2-7-1', 'T4567890123456'],
    ['株式会社アートワークス', '美術', '坂本 裕子', 'sakamoto@artworks.example.com', '03-5555-6666', '東京都目黒区中目黒1-1-17', 'T5678901234567'],
    ['プロレンタル株式会社', '機材', '田村 健一', 'tamura@prorental.example.com', '03-6666-7777', '東京都大田区蒲田5-13-14', 'T6789012345678'],
    ['ケータリングデリシャス株式会社', '弁当', '原田 美和', 'harada@delicious-c.example.com', '03-7777-8888', '東京都江東区豊洲3-2-20', null],
    ['株式会社トランスポートサービス', '運送', '中島 剛', 'nakajima@transport-sv.example.com', '03-8888-9999', '東京都板橋区成増2-17-10', 'T8901234567890'],
  ];
  for (const [name, vType, contact, email, phone, address, regNum] of vendorData) {
    const id = uuidv4();
    VENDORS[vType] = id;
    await ins(vendorSql, [id, name, contact, email, phone, address, vType, regNum]);
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
    await ins(catSql, [id, name, order]);
  }

  await ins(itemSql, [uuidv4(), CATS['基本料金'], '基本利用料金', '平日', 1500000, 'days', 1]);
  await ins(itemSql, [uuidv4(), CATS['基本料金'], '基本利用料金', '土日祝／繁忙期', 2000000, 'days', 2]);
  await ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外利用料金', '平日', 100000, 'days', 3]);
  await ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外利用料金', '土日祝／繁忙期', 150000, 'days', 4]);
  await ins(itemSql, [uuidv4(), CATS['基本料金'], '時間外対応料金', null, 40000, 'hours', 5]);
  await ins(itemSql, [uuidv4(), CATS['基本料金'], '施設管理費・清掃対応費', null, 50000, 'fixed', 6]);
  await ins(itemSql, [uuidv4(), CATS['基本料金'], 'パントリー利用', null, 100000, 'days', 7]);
  await ins(itemSql, [uuidv4(), CATS['控室利用料金'], '全室利用', null, 100000, 'days', 1]);
  await ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM A', null, 20000, 'days', 2]);
  await ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM B', null, 20000, 'days', 3]);
  await ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'ROOM C', null, 20000, 'days', 4]);
  await ins(itemSql, [uuidv4(), CATS['控室利用料金'], 'VIP LOUNGE', null, 50000, 'days', 5]);
  await ins(itemSql, [uuidv4(), CATS['機材費'], 'クレーンカメラ', null, 150000, 'days_qty', 1]);
  await ins(itemSql, [uuidv4(), CATS['機材費'], 'スタジオカメラ', null, 100000, 'days_qty', 2]);
  await ins(itemSql, [uuidv4(), CATS['機材費'], 'ワイヤレスジンバルカメラ', null, 50000, 'days_qty', 3]);
  await ins(itemSql, [uuidv4(), CATS['機材費'], '汎用PC', null, 15000, 'days_qty', 4]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'テクニカルサポート（TD）', null, 50000, 'days_people', 1]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'LEDエンジニア', null, 60000, 'days_people', 2]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'スイッチャー', null, 60000, 'days_people', 3]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'ビデオエンジニア', null, 55000, 'days_people', 4]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'スタジオカメラ', null, 55000, 'days_people', 5]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'オーディオミキサー', null, 55000, 'days_people', 6]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'PAミキサー', null, 55000, 'days_people', 7]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'テクニカルアシスタント', null, 45000, 'days_people', 8]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], '配信管理・収録', null, 55000, 'days_people', 9]);
  await ins(itemSql, [uuidv4(), CATS['技術人件費'], 'ライティングディレクター／オペレーター', null, 55000, 'days_people', 10]);
  await ins(itemSql, [uuidv4(), CATS['技術運用費'], 'LED／XR調整費', null, 10000, 'hours', 1]);
  await ins(itemSql, [uuidv4(), CATS['技術運用費'], '照明事前調整費', null, 10000, 'hours', 2]);
  await ins(itemSql, [uuidv4(), CATS['追加演出'], 'XR/AR演出制作費用', null, 150000, 'toggle', 1]);
  await ins(itemSql, [uuidv4(), CATS['追加演出'], '多言語演出', null, 200000, 'toggle', 2]);
  await ins(itemSql, [uuidv4(), CATS['追加演出'], 'ZOOM中継', null, 100000, 'toggle', 3]);
  await ins(itemSql, [uuidv4(), CATS['追加演出'], 'IP中継', null, 200000, 'toggle', 4]);
  await ins(itemSql, [uuidv4(), CATS['その他'], 'ロケハン対応', null, 0, 'toggle', 1]);

  // ============================================================
  // Sequences
  // ============================================================
  await ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['gls_a', 'GLS-A', '000000', 8]);
  await ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['gls_b', 'GLS-B', '000000', 2]);
  await ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['opp_code', 'OPP', '202603', 15]);

  // ============================================================
  // Projects (統合: ヨミ段階 + GLS発番済み)
  // ============================================================
  const projSql = `INSERT INTO projects (id, code, gls_number, name, customer_id, stage, project_type, expected_amount, event_start, event_end, broadcast_type, media_platform, assigned_to, tags, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  // --- ヨミ段階（GLS番号なし）---
  const yomiData: [string, string, string, string, string, number, string, string][] = [
    ['OPP-202603-0001', '中央放送 春の特別企画', '中央放送', 'recording', 'neta', 3000000, '2026-05-01', '2026-05-01'],
    ['OPP-202603-0002', 'GH サマーカンファレンス', 'GH', 'hybrid_event', 'neta', 5000000, '2026-06-15', '2026-06-16'],
    ['OPP-202603-0003', 'DA 動画配信スタジオ定期利用', 'DA', 'live_broadcast', 'd_hold', 1200000, '2026-04-20', '2026-04-20'],
    ['OPP-202603-0004', '東都TV ドラマ撮影', '東都TV', 'recording', 'c_proposal', 8000000, '2026-05-10', '2026-05-12'],
    ['OPP-202603-0005', 'SN スポーツ中継', 'SN', 'live_broadcast', 'c_proposal', 6000000, '2026-04-25', '2026-04-25'],
    ['OPP-202603-0006', 'GE リアリティ番組制作', 'GE', 'recording', 'c_proposal', 12000000, '2026-06-01', '2026-06-03'],
    ['OPP-202603-0007', 'JB 音楽番組収録', 'JB', 'recording', 'd_hold', 4500000, '2026-04-18', '2026-04-18'],
    ['OPP-202603-0008', '富士見 バラエティ撮影', '富士見', 'offline_event', 'd_hold', 3500000, '2026-04-22', '2026-04-22'],
    ['OPP-202603-0009', 'PW IR動画制作', 'PW', 'gmo_project', 'c_proposal', 2000000, '2026-04-08', '2026-04-08'],
  ];
  for (let i = 0; i < yomiData.length; i++) {
    const [code, name, custKey, projType, stage, amt, eventStart, eventEnd] = yomiData[i];
    const id = uuidv4();
    PROJECTS[code] = id;
    await ins(projSql, [id, code, null, name, CUSTOMERS[custKey], stage, projType, amt, eventStart, eventEnd, null, null, staffIds[i % 3], '', USERS.admin]);
  }

  // --- 失注 ---
  const lostData: [string, string, string, string, number, string, string, string, string, string][] = [
    ['OPP-202603-0013', '中央放送 年末特別企画', '中央放送', 'recording', 10000000, '2026-01-15', '予算不足', '先方の年度予算が確定せず見送り', '早期段階で予算規模を確認すべき。ヒアリング段階で予算枠の有無を必ず確認する。', '2026-01-20'],
    ['OPP-202603-0014', 'DT CM撮影', 'DT', 'offline_event', 2500000, '2026-02-20', '競合負け', '他社スタジオの方が安価だったため', '価格だけの勝負にならないよう、付加価値（設備・サポート体制）を提案書に明記する。', '2026-02-25'],
    ['OPP-202603-0015', 'JB ドラマ撮影（延期）', 'JB', 'recording', 9000000, '2026-03-15', '顧客都合（延期・中止）', '企画自体が無期限延期に', '延期リスクがある案件は仮押さえ段階でキャンセルポリシーを合意しておく。', '2026-03-18'],
    ['OPP-202603-0016', 'SN 新番組パイロット', 'SN', 'recording', 4500000, '2026-02-01', 'スケジュール不一致', 'スタジオ空き日程が合わなかった', 'スケジュール提案を2パターン以上用意し、代替案を早めに提示すべき。', '2026-02-05'],
    ['OPP-202603-0017', 'GE 社員研修配信', 'GE', 'live_broadcast', 1800000, '2026-03-05', '条件不一致', '求められた配信品質の要件が合わなかった', '技術要件のすり合わせを営業段階で行い、テスト配信の提案も検討する。', '2026-03-08'],
  ];
  for (let i = 0; i < lostData.length; i++) {
    const [code, name, custKey, projType, amt, date, reason, note, lessons, lostAt] = lostData[i];
    const id = uuidv4();
    await execute(
      `INSERT INTO projects (id, code, name, customer_id, stage, project_type, expected_amount, event_start, assigned_to, lost_reason, lost_reason_note, lessons_learned, lost_at, created_by) VALUES (?, ?, ?, ?, 'e_lost', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, CUSTOMERS[custKey], projType, amt, date, staffIds[i % 3], reason, note, lessons, lostAt, USERS.admin]
    );
  }

  // --- GLS発番済み（案件進行中）---
  const glsData: [string, string, string, string, string, number, string, string, string, string, string][] = [
    ['GLS-A001', 'GH IR説明会 2026春', 'GH', 'hybrid_event', 's_completed', 4000000, '2026-03-19', '2026-03-19', 'live', 'youtube', '株主総会2026'],
    ['GLS-A002', '東都TV 特番収録「サイエンス・フロンティア」', '東都TV', 'recording', 'a_won', 7500000, '2026-03-22', '2026-03-22', 'recording', 'terrestrial_tv', ''],
    ['GLS-A003', 'SN 生放送「ナイトトーク」', 'SN', 'live_broadcast', 'a_won', 5500000, '2026-03-25', '2026-03-25', 'live', 'net_media', ''],
    ['GLS-A004', 'PW 新サービス発表会', 'PW', 'hybrid_event', 'b_verbal', 2800000, '2026-03-30', '2026-03-30', 'live', 'zoom', '株主総会2026'],
    ['GLS-A005', 'GE ドキュメンタリー撮影', 'GE', 'recording', 'a_won', 12000000, '2026-04-05', '2026-04-07', 'recording', 'net_media', ''],
    ['GLS-A006', 'DA 社内イベント中継', 'DA', 'live_broadcast', 'b_verbal', 1500000, '2026-04-10', '2026-04-10', 'live', 'teams', ''],
    ['GLS-A007', 'JB 番組パイロット撮影', 'JB', 'recording', 'b_verbal', 4500000, '2026-04-14', '2026-04-15', 'recording', 'terrestrial_tv', ''],
    ['GLS-A008', '富士見 CM撮影「春キャンペーン」', '富士見', 'offline_event', 's_completed', 3200000, '2026-03-12', '2026-03-12', 'recording', 'terrestrial_tv', ''],
  ];
  for (let i = 0; i < glsData.length; i++) {
    const [gls, name, custKey, projType, stage, amt, es, ee, bType, mPlatform, tags] = glsData[i];
    const id = uuidv4();
    PROJECTS[gls] = id;
    // GLS発番済みなので code = OPP-xxx (元のヨミコード) + gls_number
    const oppCode = `OPP-202603-${String(20 + i).padStart(4, '0')}`;
    await ins(projSql, [id, oppCode, gls, name, CUSTOMERS[custKey], stage, projType, amt, es, ee, bType, mPlatform, staffIds[i % 3], tags, USERS.admin]);
  }

  // --- B系: GLS-B (その他売上) ---
  const glsBData: [string, string, string, string, string, number][] = [
    ['GLS-B001', 'GH 配信コンサルティング契約', 'GH', 'consulting', 'a_won', 3600000],
    ['GLS-B002', 'PW 動画戦略コンサルティング', 'PW', 'consulting', 'a_won', 2400000],
  ];
  const projBSql = `INSERT INTO projects (id, code, gls_number, name, customer_id, stage, project_type, expected_amount, assigned_to, tags, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  for (let i = 0; i < glsBData.length; i++) {
    const [gls, name, custKey, projType, stage, amt] = glsBData[i];
    const id = uuidv4();
    PROJECTS[gls] = id;
    const oppCode = `OPP-202603-${String(30 + i).padStart(4, '0')}`;
    await ins(projBSql, [id, oppCode, gls, name, CUSTOMERS[custKey], stage, projType, amt, staffIds[i % 3], '', USERS.admin]);
  }

  // ============================================================
  // Episodes
  // ============================================================
  const epSql = `INSERT INTO episodes (id, project_id, episode_number, episode_code, recording_date, broadcast_date, delivery_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  // GLS-A001: 1 episode
  {
    const epId = uuidv4();
    EPISODES['GLS-A001-001'] = epId;
    await ins(epSql, [epId, PROJECTS['GLS-A001'], 1, 'GLS-A001-001', '2026-03-19', '2026-03-19', '2026-03-19', USERS.admin]);
  }

  // GLS-A002: 13 episodes
  for (let i = 1; i <= 13; i++) {
    const epId = uuidv4();
    const code = `GLS-A002-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const recDate = `2026-${String(3 + Math.floor((i - 1) / 4)).padStart(2, '0')}-${String(((i - 1) % 28) + 1).padStart(2, '0')}`;
    const bcastDate = `2026-${String(3 + Math.floor(i / 4)).padStart(2, '0')}-${String((i % 28) + 7).padStart(2, '0')}`;
    await ins(epSql, [epId, PROJECTS['GLS-A002'], i, code, recDate, bcastDate, bcastDate, USERS.admin]);
  }

  // GLS-A003: 4 episodes
  for (let i = 1; i <= 4; i++) {
    const epId = uuidv4();
    const code = `GLS-A003-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const liveDate = `2026-03-${String(24 + i).padStart(2, '0')}`;
    await ins(epSql, [epId, PROJECTS['GLS-A003'], i, code, liveDate, liveDate, liveDate, USERS.admin]);
  }

  // GLS-A004: 1 episode
  {
    const epId = uuidv4();
    EPISODES['GLS-A004-001'] = epId;
    await ins(epSql, [epId, PROJECTS['GLS-A004'], 1, 'GLS-A004-001', '2026-03-30', '2026-03-30', '2026-03-30', USERS.admin]);
  }

  // GLS-A005: 6 episodes
  for (let i = 1; i <= 6; i++) {
    const epId = uuidv4();
    const code = `GLS-A005-${String(i).padStart(3, '0')}`;
    EPISODES[code] = epId;
    const recDate = `2026-04-${String(i * 2 + 1).padStart(2, '0')}`;
    const bcastDate = `2026-05-${String(i * 3).padStart(2, '0')}`;
    await ins(epSql, [epId, PROJECTS['GLS-A005'], i, code, recDate, bcastDate, bcastDate, USERS.admin]);
  }

  // GLS-A006-008: 1 episode each
  for (const [gls, recDate, bcastDate] of [
    ['GLS-A006', '2026-04-10', '2026-04-10'],
    ['GLS-A007', '2026-04-14', '2026-04-15'],
    ['GLS-A008', '2026-03-12', '2026-03-12'],
  ] as [string, string, string][]) {
    const epId = uuidv4();
    const code = `${gls}-001`;
    EPISODES[code] = epId;
    await ins(epSql, [epId, PROJECTS[gls], 1, code, recDate, bcastDate, bcastDate, USERS.admin]);
  }

  // ============================================================
  // Episode Orders
  // ============================================================
  const eoSql = `INSERT INTO episode_orders (id, project_id, order_date, episode_count, start_episode, end_episode, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A001'], '2026-02-01', 1, 1, 1, '単発案件', USERS.admin]);
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A002'], '2025-12-02', 12, 1, 12, '初回一括発注', USERS.admin]);
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A002'], '2026-05-01', 1, 13, 13, '追加発注', USERS.admin]);
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A003'], '2026-02-15', 4, 1, 4, '4話一括発注', USERS.admin]);
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A004'], '2026-03-01', 1, 1, 1, '単発案件', USERS.admin]);
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A005'], '2026-03-01', 6, 1, 6, 'シーズン1発注', USERS.admin]);
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A006'], '2026-03-10', 1, 1, 1, '単発案件', USERS.admin]);
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A007'], '2026-03-15', 1, 1, 1, '単発案件', USERS.admin]);
  await ins(eoSql, [uuidv4(), PROJECTS['GLS-A008'], '2026-02-20', 1, 1, 1, '単発案件', USERS.admin]);

  // ============================================================
  // Revenues
  // ============================================================
  const revSql = `INSERT INTO revenues (id, billing_key, project_id, episode_id, customer_id, assigned_to, tax_category, amount, recognition_date, notes, subtitle, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const riSql = `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`;

  // GLS-A001: IR説明会（明細項目付き）
  {
    const revId = uuidv4();
    await ins(revSql, [revId, 'GLS-A001-001-1', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'], CUSTOMERS['GH'], USERS.staff1, 'tax10', 4000000, '2026-03-31', null, '2026年春季IR説明会', 'confirmed']);
    await ins(riSql, [uuidv4(), revId, 'スタジオ基本利用料（WORLD STUDIO）', 2, 1500000, 3000000, 1]);
    await ins(riSql, [uuidv4(), revId, 'YouTube Live配信設備', 1, 500000, 500000, 2]);
    await ins(riSql, [uuidv4(), revId, '技術スタッフ（TD・SW・VE）', 1, 300000, 300000, 3]);
    await ins(riSql, [uuidv4(), revId, '控室利用（VIP LOUNGE + MEETING ROOM）', 2, 100000, 200000, 4]);
  }

  // GLS-A002: 13話の番組収録（各話に明細）
  for (let i = 1; i <= 13; i++) {
    const code = `GLS-A002-${String(i).padStart(3, '0')}`;
    const amt = i === 1 ? 576923 + (7500000 - 576923 * 13) : 576923;
    const revId = uuidv4();
    await ins(revSql, [revId, `${code}-1`, PROJECTS['GLS-A002'], EPISODES[code], CUSTOMERS['東都TV'], staffIds[i % 3], 'tax10', amt, '2026-03-31', null, `第${i}話`, 'confirmed']);
    await ins(riSql, [uuidv4(), revId, 'スタジオ収録費', 1, Math.round(amt * 0.6), Math.round(amt * 0.6), 1]);
    await ins(riSql, [uuidv4(), revId, '技術費', 1, Math.round(amt * 0.3), Math.round(amt * 0.3), 2]);
    await ins(riSql, [uuidv4(), revId, '諸経費', 1, amt - Math.round(amt * 0.6) - Math.round(amt * 0.3), amt - Math.round(amt * 0.6) - Math.round(amt * 0.3), 3]);
  }

  // GLS-A003: 生放送4回
  for (let i = 1; i <= 4; i++) {
    const code = `GLS-A003-${String(i).padStart(3, '0')}`;
    const revId = uuidv4();
    await ins(revSql, [revId, `${code}-1`, PROJECTS['GLS-A003'], EPISODES[code], CUSTOMERS['SN'], staffIds[i % 3], 'tax10', 1375000, '2026-03-31', null, `第${i}回放送`, 'confirmed']);
    await ins(riSql, [uuidv4(), revId, 'スタジオ利用＋生放送設備', 1, 800000, 800000, 1]);
    await ins(riSql, [uuidv4(), revId, '配信技術費', 1, 375000, 375000, 2]);
    await ins(riSql, [uuidv4(), revId, '音響・照明', 1, 200000, 200000, 3]);
  }

  // GLS-A004: 新サービス発表会
  {
    const revId = uuidv4();
    await ins(revSql, [revId, 'GLS-A004-001-1', PROJECTS['GLS-A004'], EPISODES['GLS-A004-001'], CUSTOMERS['PW'], USERS.staff3, 'tax10', 2800000, '2026-04-30', null, '2026年株主総会', 'confirmed']);
    await ins(riSql, [uuidv4(), revId, 'スタジオ基本利用料', 1, 1500000, 1500000, 1]);
    await ins(riSql, [uuidv4(), revId, 'Zoom配信設備＋オペレーション', 1, 600000, 600000, 2]);
    await ins(riSql, [uuidv4(), revId, '技術スタッフ', 1, 400000, 400000, 3]);
    await ins(riSql, [uuidv4(), revId, '控室・ケータリング', 1, 300000, 300000, 4]);
  }

  // GLS-A005: ドキュメンタリー6回撮影
  for (let i = 1; i <= 6; i++) {
    const code = `GLS-A005-${String(i).padStart(3, '0')}`;
    const revId = uuidv4();
    await ins(revSql, [revId, `${code}-1`, PROJECTS['GLS-A005'], EPISODES[code], CUSTOMERS['GE'], staffIds[i % 3], 'tax10', 2000000, '2026-04-30', null, `撮影${i}日目`, 'confirmed']);
    await ins(riSql, [uuidv4(), revId, 'スタジオ収録費', 1, 1200000, 1200000, 1]);
    await ins(riSql, [uuidv4(), revId, '撮影技術費', 1, 600000, 600000, 2]);
    await ins(riSql, [uuidv4(), revId, '諸経費', 1, 200000, 200000, 3]);
  }

  // GLS-A006〜008: 単発案件
  {
    const revId6 = uuidv4();
    await ins(revSql, [revId6, 'GLS-A006-001-1', PROJECTS['GLS-A006'], EPISODES['GLS-A006-001'], CUSTOMERS['DA'], USERS.staff3, 'tax10', 1500000, '2026-04-30', null, '社内イベント中継', 'confirmed']);
    await ins(riSql, [uuidv4(), revId6, '配信設備＋オペレーション', 1, 900000, 900000, 1]);
    await ins(riSql, [uuidv4(), revId6, '技術スタッフ', 1, 400000, 400000, 2]);
    await ins(riSql, [uuidv4(), revId6, '通信回線費', 1, 200000, 200000, 3]);
  }
  {
    const revId7 = uuidv4();
    await ins(revSql, [revId7, 'GLS-A007-001-1', PROJECTS['GLS-A007'], EPISODES['GLS-A007-001'], CUSTOMERS['JB'], USERS.staff1, 'tax10', 4500000, '2026-04-30', null, 'パイロット版', 'estimate']);
    await ins(riSql, [uuidv4(), revId7, 'スタジオ利用料（2日間）', 2, 1500000, 3000000, 1]);
    await ins(riSql, [uuidv4(), revId7, '技術スタッフ', 1, 900000, 900000, 2]);
    await ins(riSql, [uuidv4(), revId7, '照明・音響', 1, 600000, 600000, 3]);
  }
  {
    const revId8 = uuidv4();
    await ins(revSql, [revId8, 'GLS-A008-001-1', PROJECTS['GLS-A008'], EPISODES['GLS-A008-001'], CUSTOMERS['富士見'], USERS.staff3, 'tax10', 3200000, '2026-03-31', null, '春キャンペーンCM', 'confirmed']);
    await ins(riSql, [uuidv4(), revId8, 'スタジオ利用料', 1, 1500000, 1500000, 1]);
    await ins(riSql, [uuidv4(), revId8, 'CM撮影技術費', 1, 1200000, 1200000, 2]);
    await ins(riSql, [uuidv4(), revId8, '美術・セット費', 1, 500000, 500000, 3]);
  }

  // --- B系売上（エピソードなし）---
  // GLS-B001: コンサルティング契約（月額×12）
  const revB001Id = uuidv4();
  await ins(revSql, [revB001Id, 'GLS-B001-001-1', PROJECTS['GLS-B001'], null, CUSTOMERS['GH'], USERS.staff1, 'tax10', 3600000, '2026-03-31', '年間コンサルティング契約', null, 'confirmed']);
  await ins(riSql, [uuidv4(), revB001Id, '配信コンサルティング（月額）', 12, 250000, 3000000, 1]);
  await ins(riSql, [uuidv4(), revB001Id, '配信環境構築サポート', 1, 400000, 400000, 2]);
  await ins(riSql, [uuidv4(), revB001Id, 'レポート作成費', 4, 50000, 200000, 3]);

  // GLS-B002: 動画戦略コンサルティング
  const revB002Id = uuidv4();
  await ins(revSql, [revB002Id, 'GLS-B002-001-1', PROJECTS['GLS-B002'], null, CUSTOMERS['PW'], USERS.staff2, 'tax10', 2400000, '2026-04-30', '動画戦略コンサルティング', null, 'confirmed']);
  await ins(riSql, [uuidv4(), revB002Id, '動画戦略策定', 1, 800000, 800000, 1]);
  await ins(riSql, [uuidv4(), revB002Id, '競合分析レポート', 1, 600000, 600000, 2]);
  await ins(riSql, [uuidv4(), revB002Id, '運用マニュアル作成', 1, 500000, 500000, 3]);
  await ins(riSql, [uuidv4(), revB002Id, 'トレーニング（3回）', 3, 166667, 500000, 4]);

  // --- ヨミ段階の概算見積もり ---
  // OPP-202603-0001: 中央放送 春の特別企画
  {
    const revId = uuidv4();
    await ins(revSql, [revId, 'EST-001-1', PROJECTS['OPP-202603-0001'], null, CUSTOMERS['中央放送'], USERS.staff1, 'tax10', 3000000, null, '概算見積り', '春の特別企画', 'estimate']);
    await ins(riSql, [uuidv4(), revId, 'スタジオ基本利用料（1日）', 1, 1500000, 1500000, 1]);
    await ins(riSql, [uuidv4(), revId, '収録技術スタッフ', 1, 800000, 800000, 2]);
    await ins(riSql, [uuidv4(), revId, '照明・音響', 1, 500000, 500000, 3]);
    await ins(riSql, [uuidv4(), revId, '諸経費', 1, 200000, 200000, 4]);
  }

  // OPP-202603-0002: GH サマーカンファレンス
  {
    const revId = uuidv4();
    await ins(revSql, [revId, 'EST-001-1', PROJECTS['OPP-202603-0002'], null, CUSTOMERS['GH'], USERS.staff2, 'tax10', 5000000, null, '概算見積り', 'サマーカンファレンス', 'estimate']);
    await ins(riSql, [uuidv4(), revId, 'WORLD STUDIO利用料（2日間）', 2, 1500000, 3000000, 1]);
    await ins(riSql, [uuidv4(), revId, 'ハイブリッド配信設備', 1, 800000, 800000, 2]);
    await ins(riSql, [uuidv4(), revId, '技術スタッフ（TD・SW・VE・カメラ）', 1, 700000, 700000, 3]);
    await ins(riSql, [uuidv4(), revId, '控室利用（VIP LOUNGE＋ROOM A/B）', 2, 150000, 300000, 4]);
    await ins(riSql, [uuidv4(), revId, '施設管理費', 1, 200000, 200000, 5]);
  }

  // OPP-202603-0004: 東都TV ドラマ撮影
  {
    const revId = uuidv4();
    await ins(revSql, [revId, 'EST-001-1', PROJECTS['OPP-202603-0004'], null, CUSTOMERS['東都TV'], USERS.staff1, 'tax10', 8000000, null, '概算見積り', 'ドラマ撮影（3日間）', 'estimate']);
    await ins(riSql, [uuidv4(), revId, 'SKY STUDIO利用料（3日間）', 3, 1500000, 4500000, 1]);
    await ins(riSql, [uuidv4(), revId, '撮影技術チーム', 3, 600000, 1800000, 2]);
    await ins(riSql, [uuidv4(), revId, '照明セット＋オペレーター', 3, 300000, 900000, 3]);
    await ins(riSql, [uuidv4(), revId, '美術・セット費', 1, 500000, 500000, 4]);
    await ins(riSql, [uuidv4(), revId, '諸経費（ケータリング等）', 1, 300000, 300000, 5]);
  }

  // OPP-202603-0005: SN スポーツ中継
  {
    const revId = uuidv4();
    await ins(revSql, [revId, 'EST-001-1', PROJECTS['OPP-202603-0005'], null, CUSTOMERS['SN'], USERS.staff3, 'tax10', 6000000, null, '概算見積り', 'スポーツ中継', 'estimate']);
    await ins(riSql, [uuidv4(), revId, 'WORLD STUDIO利用料', 1, 2000000, 2000000, 1]);
    await ins(riSql, [uuidv4(), revId, '生中継技術（カメラ6台＋SW）', 1, 2000000, 2000000, 2]);
    await ins(riSql, [uuidv4(), revId, '配信設備＋回線費', 1, 1200000, 1200000, 3]);
    await ins(riSql, [uuidv4(), revId, 'スタッフ・諸経費', 1, 800000, 800000, 4]);
  }

  // OPP-202603-0006: GE リアリティ番組制作
  {
    const revId = uuidv4();
    await ins(revSql, [revId, 'EST-001-1', PROJECTS['OPP-202603-0006'], null, CUSTOMERS['GE'], USERS.staff3, 'tax10', 12000000, null, '概算見積り', 'リアリティ番組（3日間撮影）', 'estimate']);
    await ins(riSql, [uuidv4(), revId, 'WORLD STUDIO利用料（3日間）', 3, 2000000, 6000000, 1]);
    await ins(riSql, [uuidv4(), revId, '撮影技術チーム（カメラ8台）', 3, 1000000, 3000000, 2]);
    await ins(riSql, [uuidv4(), revId, '照明・音響・美術', 3, 600000, 1800000, 3]);
    await ins(riSql, [uuidv4(), revId, '控室・ケータリング', 3, 200000, 600000, 4]);
    await ins(riSql, [uuidv4(), revId, '諸経費', 1, 600000, 600000, 5]);
  }

  // OPP-202603-0009: PW IR動画制作
  {
    const revId = uuidv4();
    await ins(revSql, [revId, 'EST-001-1', PROJECTS['OPP-202603-0009'], null, CUSTOMERS['PW'], USERS.staff1, 'tax10', 2000000, null, '概算見積り', 'IR動画制作', 'estimate']);
    await ins(riSql, [uuidv4(), revId, '動画撮影（半日）', 1, 800000, 800000, 1]);
    await ins(riSql, [uuidv4(), revId, '編集・MA', 1, 700000, 700000, 2]);
    await ins(riSql, [uuidv4(), revId, 'ナレーション・テロップ', 1, 300000, 300000, 3]);
    await ins(riSql, [uuidv4(), revId, 'ディレクション費', 1, 200000, 200000, 4]);
  }

  // ============================================================
  // Purchases
  // ============================================================
  const purSql = `INSERT INTO purchases (id, billing_key, project_id, episode_id, vendor_id, assigned_to, settlement_method, settlement_number, tax_category, invoice_qualified, amount, description, recognition_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  await ins(purSql, [uuidv4(), 'GLS-A001-001-1', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'], VENDORS['技術'], USERS.staff1, 'rakuraku', '147510', 'tax10', 1, 800000, 'カメラクルー2名', '2026-03-31', null]);
  await ins(purSql, [uuidv4(), 'GLS-A001-001-2', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'], VENDORS['弁当'], USERS.staff1, 'rakuraku', '147511', 'tax8', 0, 50000, 'ケータリング30名分', '2026-03-31', null]);

  await ins(purSql, [uuidv4(), 'GLS-A002-001-1', PROJECTS['GLS-A002'], EPISODES['GLS-A002-001'], VENDORS['技術'], USERS.staff2, 'xpoint', '230001', 'tax10', 1, 1200000, '撮影技術チーム', '2026-03-31', null]);
  await ins(purSql, [uuidv4(), 'GLS-A002-001-2', PROJECTS['GLS-A002'], EPISODES['GLS-A002-001'], VENDORS['照明'], USERS.staff2, 'xpoint', '230002', 'tax10', 1, 600000, '照明セット+オペレーター', '2026-03-31', null]);
  await ins(purSql, [uuidv4(), 'GLS-A002-002-2', PROJECTS['GLS-A002'], EPISODES['GLS-A002-002'], VENDORS['弁当'], USERS.staff3, 'rakuraku', '147512', 'tax8', 0, 80000, 'ケータリング50名分', '2026-03-31', null]);

  await ins(purSql, [uuidv4(), 'GLS-A003-001-1', PROJECTS['GLS-A003'], EPISODES['GLS-A003-001'], VENDORS['配信'], USERS.staff1, 'other', '330001', 'tax10', 1, 900000, 'ライブ配信システム', '2026-03-31', null]);
  await ins(purSql, [uuidv4(), 'GLS-A003-002-1', PROJECTS['GLS-A003'], EPISODES['GLS-A003-002'], VENDORS['音響'], USERS.staff2, 'other', '330002', 'tax10', 1, 450000, '音響機材+オペレーター', '2026-03-31', null]);

  await ins(purSql, [uuidv4(), 'GLS-A004-001-1', PROJECTS['GLS-A004'], EPISODES['GLS-A004-001'], VENDORS['技術'], USERS.staff3, 'rakuraku', '147513', 'tax10', 1, 700000, '技術スタッフ（見積）', '2026-04-30', null]);

  await ins(purSql, [uuidv4(), 'GLS-A005-001-1', PROJECTS['GLS-A005'], EPISODES['GLS-A005-001'], VENDORS['技術'], USERS.staff1, 'xpoint', '230003', 'tax10', 1, 2500000, '撮影チーム3日間', '2026-04-30', null]);
  await ins(purSql, [uuidv4(), 'GLS-A005-002-1', PROJECTS['GLS-A005'], EPISODES['GLS-A005-002'], VENDORS['機材'], USERS.staff2, 'xpoint', '230004', 'tax10', 1, 1800000, '特殊機材レンタル', '2026-04-30', null]);
  await ins(purSql, [uuidv4(), 'GLS-A005-003-1', PROJECTS['GLS-A005'], EPISODES['GLS-A005-003'], VENDORS['美術'], USERS.staff3, 'other', '530001', 'tax10', 1, 600000, 'セットデザイン', '2026-04-30', null]);
  await ins(purSql, [uuidv4(), 'GLS-A005-004-2', PROJECTS['GLS-A005'], EPISODES['GLS-A005-004'], VENDORS['弁当'], USERS.staff1, 'rakuraku', '147514', 'tax8', 0, 120000, 'ケータリング3日間', '2026-04-30', null]);

  await ins(purSql, [uuidv4(), 'GLS-A006-001-1', PROJECTS['GLS-A006'], EPISODES['GLS-A006-001'], VENDORS['配信'], USERS.staff2, 'rakuraku', '147515', 'tax10', 1, 400000, '中継システム', '2026-04-30', null]);
  await ins(purSql, [uuidv4(), 'GLS-A007-001-1', PROJECTS['GLS-A007'], EPISODES['GLS-A007-001'], VENDORS['技術'], USERS.staff3, 'xpoint', '230005', 'tax10', 1, 900000, '撮影チーム', '2026-04-30', null]);
  await ins(purSql, [uuidv4(), 'GLS-A008-001-1', PROJECTS['GLS-A008'], EPISODES['GLS-A008-001'], VENDORS['技術'], USERS.staff1, 'rakuraku', '147516', 'tax10', 1, 1000000, 'CM撮影技術チーム', '2026-03-31', null]);

  // ============================================================
  // Project Groups (按分グループ)
  // ============================================================
  const pgSql = `INSERT INTO project_groups (id, name, description, created_by) VALUES (?, ?, ?, ?)`;
  const pgmSql = `INSERT INTO project_group_members (group_id, project_id) VALUES (?, ?)`;
  const paSql = `INSERT INTO purchase_allocations (id, purchase_id, project_id, allocated_amount) VALUES (?, ?, ?, ?)`;
  const raSql = `INSERT INTO revenue_allocations (id, revenue_id, project_id, allocated_amount) VALUES (?, ?, ?, ?)`;

  // グループ1: GH IR関連（GLS-A001 + GLS-B001）
  const GROUP1 = uuidv4();
  await ins(pgSql, [GROUP1, 'GH IR関連 2026', 'GH社のIR説明会とコンサルティング契約を横断する共通費用', USERS.admin]);
  await ins(pgmSql, [GROUP1, PROJECTS['GLS-A001']]);
  await ins(pgmSql, [GROUP1, PROJECTS['GLS-B001']]);

  // グループ仕入: 通訳スタッフ（GLS-A001:60%, GLS-B001:40%）
  const gpPur1 = uuidv4();
  await ins(purSql, [gpPur1, null, PROJECTS['GLS-A001'], null, VENDORS['技術'], USERS.staff1, 'other', '440001', 'tax10', 1, 500000, '通訳スタッフ（IR関連共通）', '2026-03-31', null]);
  await execute(`UPDATE purchases SET group_id = ? WHERE id = ?`, [GROUP1, gpPur1]);
  await ins(paSql, [uuidv4(), gpPur1, PROJECTS['GLS-A001'], 300000]);
  await ins(paSql, [uuidv4(), gpPur1, PROJECTS['GLS-B001'], 200000]);

  // グループ売上: IR関連共通プロデュース費（GLS-A001:70%, GLS-B001:30%）
  const gpRev1 = uuidv4();
  await ins(revSql, [gpRev1, 'GLS-A001-002-1', PROJECTS['GLS-A001'], null, CUSTOMERS['GH'], USERS.staff1, 'tax10', 1000000, '2026-03-31', null, 'IR関連共通プロデュース費', 'confirmed']);
  await execute(`UPDATE revenues SET group_id = ? WHERE id = ?`, [GROUP1, gpRev1]);
  await ins(riSql, [uuidv4(), gpRev1, 'IR関連プロデュース費', 1, 700000, 700000, 1]);
  await ins(riSql, [uuidv4(), gpRev1, '配信環境コーディネート費', 1, 300000, 300000, 2]);
  await ins(raSql, [uuidv4(), gpRev1, PROJECTS['GLS-A001'], 700000]);
  await ins(raSql, [uuidv4(), gpRev1, PROJECTS['GLS-B001'], 300000]);

  // グループ2: PW 案件横断（GLS-A004 + GLS-B002）
  const GROUP2 = uuidv4();
  await ins(pgSql, [GROUP2, 'PW 2026年度案件', 'PW社の発表会とコンサルティング横断費用', USERS.admin]);
  await ins(pgmSql, [GROUP2, PROJECTS['GLS-A004']]);
  await ins(pgmSql, [GROUP2, PROJECTS['GLS-B002']]);

  // グループ仕入: 資料制作費（均等按分）
  const gpPur2 = uuidv4();
  await ins(purSql, [gpPur2, null, PROJECTS['GLS-A004'], null, VENDORS['美術'], USERS.staff2, 'rakuraku', '147530', 'tax10', 1, 400000, '企業紹介資料デザイン制作', '2026-04-15', null]);
  await execute(`UPDATE purchases SET group_id = ? WHERE id = ?`, [GROUP2, gpPur2]);
  await ins(paSql, [uuidv4(), gpPur2, PROJECTS['GLS-A004'], 200000]);
  await ins(paSql, [uuidv4(), gpPur2, PROJECTS['GLS-B002'], 200000]);

  // グループ売上: PW横断企画費（均等按分）
  const gpRev2 = uuidv4();
  await ins(revSql, [gpRev2, 'GLS-A004-002-1', PROJECTS['GLS-A004'], null, CUSTOMERS['PW'], USERS.staff2, 'tax10', 600000, '2026-04-30', null, 'PW 2026年度横断企画費', 'estimate']);
  await execute(`UPDATE revenues SET group_id = ? WHERE id = ?`, [GROUP2, gpRev2]);
  await ins(riSql, [uuidv4(), gpRev2, '年間企画コーディネート費', 1, 400000, 400000, 1]);
  await ins(riSql, [uuidv4(), gpRev2, '共通資料制作ディレクション', 1, 200000, 200000, 2]);
  await ins(raSql, [uuidv4(), gpRev2, PROJECTS['GLS-A004'], 300000]);
  await ins(raSql, [uuidv4(), gpRev2, PROJECTS['GLS-B002'], 300000]);

  // ============================================================
  // Invoice Groups (GLS-A002)
  // ============================================================
  const igSql = `INSERT INTO invoice_groups (id, project_id, title, invoice_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?)`;
  const igEpSql = `INSERT INTO invoice_group_episodes (invoice_group_id, episode_id) VALUES (?, ?)`;

  const ig1 = uuidv4();
  await ins(igSql, [ig1, PROJECTS['GLS-A002'], '第1Q請求 (#1-#4)', '2026-03-31', 'paid', USERS.admin]);
  for (let i = 1; i <= 4; i++) await ins(igEpSql, [ig1, EPISODES[`GLS-A002-${String(i).padStart(3, '0')}`]]);

  const ig2 = uuidv4();
  await ins(igSql, [ig2, PROJECTS['GLS-A002'], '第2Q請求 (#5-#8)', '2026-06-30', 'sent', USERS.admin]);
  for (let i = 5; i <= 8; i++) await ins(igEpSql, [ig2, EPISODES[`GLS-A002-${String(i).padStart(3, '0')}`]]);

  const ig3 = uuidv4();
  await ins(igSql, [ig3, PROJECTS['GLS-A002'], '第3Q請求 (#9-#12)', '2026-09-30', 'draft', USERS.admin]);
  for (let i = 9; i <= 12; i++) await ins(igEpSql, [ig3, EPISODES[`GLS-A002-${String(i).padStart(3, '0')}`]]);

  // ============================================================
  // SGA Expenses
  // ============================================================
  const sgaSql = `INSERT INTO sga_expenses (id, billing_key, assigned_to, settlement_method, settlement_number, vendor_name, description, recognition_date, payment_due_date, tax_category, invoice_qualified, amount, expense_type, amortize_start, amortize_end, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  await ins(sgaSql, [uuidv4(), '20260101-1', USERS.staff1, 'other', '900001', '株式会社スタジオプロパティ', 'オフィス賃料（月額）', '2026-01-01', '2026-01-31', 'tax10', 1, 800000, 'fixed', '2026-01', '2026-12', 'staff', USERS.admin]);
  await ins(sgaSql, [uuidv4(), '20260401-1', USERS.staff2, 'other', '900002', '東京海上日動火災保険', '事業用火災保険', '2026-04-01', '2026-04-30', 'tax10', 1, 300000, 'spot', '2026-04', '2027-03', 'staff', USERS.admin]);
  await ins(sgaSql, [uuidv4(), '20260315-1', USERS.staff3, 'rakuraku', '147520', 'ホテルニューオータニ', '顧客打ち合わせ会食費', '2026-03-15', '2026-04-15', 'tax10', 1, 45000, 'spot', null, null, 'staff', USERS.admin]);
  await ins(sgaSql, [uuidv4(), '20260301-1', USERS.staff1, 'other', '900003', '株式会社マネーフォワード', '会計ソフト年間利用料', '2026-03-01', '2026-03-31', 'tax10', 1, 120000, 'spot', null, null, 'accounting', USERS.admin]);

  // ============================================================
  // Partners
  // ============================================================
  const partnerSql = `INSERT INTO partners (id, name, email, phone, role_title, specialties, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  await ins(partnerSql, [uuidv4(), '渡辺 剛', 'watanabe@freelance.example.com', '090-1234-5678', 'フリーランスTD', '["TD","スイッチャー"]', '10年以上の経験あり。大型案件向き', USERS.admin]);
  await ins(partnerSql, [uuidv4(), '小林 由美', 'kobayashi@freelance.example.com', '090-2345-6789', 'フリーランス照明', '["照明","LD"]', '柔軟なスケジュール対応可', USERS.admin]);
  await ins(partnerSql, [uuidv4(), '中村 拓也', 'nakamura@freelance.example.com', '090-3456-7890', 'フリーランスカメラ', '["カメラ","VE"]', '映画系出身。ドキュメンタリーに強い', USERS.admin]);
  await ins(partnerSql, [uuidv4(), '伊藤 真理', 'ito@freelance.example.com', '090-4567-8901', 'フリーランス音声', '["音声","MA"]', 'PA兼務可。音楽番組の経験豊富', USERS.admin]);
  await ins(partnerSql, [uuidv4(), '木村 健太', 'kimura@freelance.example.com', '090-5678-9012', 'フリーランスCG', '["CG","XR","AR"]', 'XR/AR演出の専門家', USERS.admin]);

  // ============================================================
  // Activity Logs
  // ============================================================
  const actSql = `INSERT INTO activity_logs (id, project_id, customer_id, user_id, activity_type, subject, description, activity_date, next_action, next_action_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  // GH関連の営業活動
  await ins(actSql, [uuidv4(), null, CUSTOMERS['GH'], USERS.staff1, 'call', 'GH 春季IR説明会の打診', '先方IR担当の田村氏と電話。昨年同様の春季IR説明会を検討中とのこと。', '2026-02-01', '企画書送付', '2026-02-05', USERS.staff1]);
  await ins(actSql, [uuidv4(), null, CUSTOMERS['GH'], USERS.staff1, 'email', '企画書送付', 'IR説明会の企画書（ハイブリッド配信プラン）をメール送付。', '2026-02-05', '打ち合わせ設定', '2026-02-12', USERS.staff1]);
  await ins(actSql, [uuidv4(), null, CUSTOMERS['GH'], USERS.staff1, 'meeting', 'GH IR担当と打ち合わせ', '田村氏・佐々木部長と弊社にて打ち合わせ。YouTube Live配信を希望。予算4M前後。3月実施で調整中。', '2026-02-12', '見積書作成', '2026-02-15', USERS.staff1]);
  await ins(actSql, [uuidv4(), null, CUSTOMERS['GH'], USERS.staff1, 'proposal', '見積書提出', '見積書（¥4,000,000 税別）を提出。先方2週間以内に回答予定。', '2026-02-15', '回答フォロー', '2026-03-01', USERS.staff1]);

  // 東都TV関連
  await ins(actSql, [uuidv4(), null, CUSTOMERS['東都TV'], USERS.staff2, 'meeting', '東都TV 新番組企画の相談', '東都TVの制作部長より新番組「サイエンス・フロンティア」のスタジオ利用について相談。13話構成の科学番組。', '2026-01-20', '技術要件ヒアリング', '2026-01-25', USERS.staff2]);
  await ins(actSql, [uuidv4(), null, CUSTOMERS['東都TV'], USERS.staff2, 'visit', '東都TV 技術要件ヒアリング', '先方オフィスで技術担当と打ち合わせ。LED壁を使ったバーチャルセットを希望。', '2026-01-25', '技術見積作成', '2026-02-01', USERS.staff2]);
  await ins(actSql, [uuidv4(), null, CUSTOMERS['東都TV'], USERS.staff2, 'proposal', '技術見積提出', '13話分のスタジオ利用＋技術スタッフ見積を提出。¥7,500,000。', '2026-02-01', '社内稟議結果待ち', '2026-02-20', USERS.staff2]);

  // SN関連
  await ins(actSql, [uuidv4(), null, CUSTOMERS['SN'], USERS.staff3, 'call', 'SN 生放送番組の問い合わせ', 'SNの番組プロデューサーから電話。週1回の生放送トーク番組のスタジオを探しているとのこと。', '2026-02-10', 'スタジオ見学の設定', '2026-02-15', USERS.staff3]);
  await ins(actSql, [uuidv4(), null, CUSTOMERS['SN'], USERS.staff3, 'meeting', 'SN スタジオ見学＋打ち合わせ', 'スタジオ見学後、配信要件と予算について打ち合わせ。4話トライアル→レギュラー化の方向。', '2026-02-18', '見積提出', '2026-02-25', USERS.staff3]);

  // PW関連
  await ins(actSql, [uuidv4(), null, CUSTOMERS['PW'], USERS.staff1, 'email', 'PW 新サービス発表会の打診', 'PW広報担当からメール。4月の新サービスローンチイベントについて相談。', '2026-02-20', '電話で詳細ヒアリング', '2026-02-22', USERS.staff1]);
  await ins(actSql, [uuidv4(), null, CUSTOMERS['PW'], USERS.staff1, 'call', 'PW 発表会の詳細ヒアリング', 'Zoom配信メインのハイブリッド型。来場者50名＋オンライン500名規模。3/30実施予定。', '2026-02-22', '企画書・見積作成', '2026-02-28', USERS.staff1]);

  // フォローアップ
  await ins(actSql, [uuidv4(), null, CUSTOMERS['GE'], USERS.staff2, 'followup', 'GE ドキュメンタリー進捗確認', '先方の企画会議が来週。結果を踏まえてスケジュール確定予定。', '2026-03-10', '企画会議結果の確認', '2026-03-17', USERS.staff2]);
  await ins(actSql, [uuidv4(), null, CUSTOMERS['DA'], USERS.staff3, 'followup', 'DA 定期利用契約フォロー', '定期利用プランの見積書フォロー。先方検討中だが前向き。', '2026-03-05', '契約条件の最終確認', '2026-03-12', USERS.staff3]);

  // ============================================================
  // Sales Targets (2026年度)
  // ============================================================
  const stSql = `INSERT INTO sales_targets (id, user_id, target_year, target_month, target_amount) VALUES (?, ?, ?, ?, ?)`;
  const monthlyTargets: Record<string, number[]> = {
    [USERS.staff1]: [8000000, 9000000, 10000000, 12000000, 10000000, 8000000, 7000000, 6000000, 9000000, 11000000, 12000000, 10000000],
    [USERS.staff2]: [10000000, 11000000, 12000000, 14000000, 12000000, 10000000, 9000000, 8000000, 11000000, 13000000, 14000000, 12000000],
    [USERS.staff3]: [6000000, 7000000, 8000000, 9000000, 8000000, 7000000, 6000000, 5000000, 7000000, 8000000, 9000000, 8000000],
  };
  for (const [userId, targets] of Object.entries(monthlyTargets)) {
    for (let m = 0; m < 12; m++) {
      await ins(stSql, [uuidv4(), userId, 2026, m + 1, targets[m]]);
    }
  }

  // ============================================================
  // Studio Locations & Rooms
  // ============================================================
  const locSql = `INSERT INTO studio_locations (id, name, sort_order) VALUES (?, ?, ?)`;
  const LOC_YOGA = uuidv4();
  const LOC_SHIBUYA = uuidv4();
  const LOC_EXTERNAL = uuidv4();
  await ins(locSql, [LOC_YOGA, 'GMOグローバルスタジオ', 1]);
  await ins(locSql, [LOC_SHIBUYA, 'GMOサムライコンテンツスタジオ渋谷', 2]);
  await ins(locSql, [LOC_EXTERNAL, '外現場', 3]);

  const roomSql = `INSERT INTO studio_rooms (id, location_id, name, room_type, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)`;
  // 用賀スタジオ
  const ROOMS: Record<string, string> = {};
  const yogaRooms: [string, string, string, number][] = [
    ['WORLD STUDIO', 'studio', '#2563eb', 1],
    ['SKY STUDIO', 'studio', '#7c3aed', 2],
    ['LOUNGE STUDIO', 'studio', '#0891b2', 3],
    ['MEETING ROOM', 'greenroom', '#6b7280', 4],
    ['ROOM A', 'greenroom', '#059669', 5],
    ['ROOM B', 'greenroom', '#d97706', 6],
    ['ROOM C', 'greenroom', '#dc2626', 7],
    ['VIP LOUNGE', 'greenroom', '#9333ea', 8],
    ['第1調整室', 'control', '#4f46e5', 9],
    ['第2調整室', 'control', '#0284c7', 10],
  ];
  for (const [name, roomType, color, order] of yogaRooms) {
    const id = uuidv4();
    ROOMS[name] = id;
    await ins(roomSql, [id, LOC_YOGA, name, roomType, color, order]);
  }

  // 渋谷スタジオ
  const shibuyaRooms: [string, string, string, number][] = [
    ['第1スタジオ', 'studio', '#e11d48', 1],
    ['第2スタジオ', 'studio', '#ea580c', 2],
    ['第3スタジオ', 'studio', '#ca8a04', 3],
  ];
  for (const [name, roomType, color, order] of shibuyaRooms) {
    const id = uuidv4();
    ROOMS[name] = id;
    await ins(roomSql, [id, LOC_SHIBUYA, name, roomType, color, order]);
  }

  // ============================================================
  // Studio Bookings (サンプル予約)
  // ============================================================
  const bkSql = `INSERT INTO studio_bookings (id, title, booking_type, project_id, episode_id, all_day, start_time, end_time, location_note, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const bkRoomSql = `INSERT INTO studio_booking_rooms (booking_id, room_id, occupant, usage_note) VALUES (?, ?, ?, ?)`;

  // GLS-A001 IR説明会 → WORLD STUDIO + MEETING ROOM + VIP LOUNGE
  const bk1 = uuidv4();
  await ins(bkSql, [bk1, 'GLS-A001 GH春季IR説明会 リハーサル', 'project', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'], 1, '2026-03-27', '2026-03-27', null, 'リハーサル。前日仕込み含む', USERS.staff1]);
  await ins(bkRoomSql, [bk1, ROOMS['WORLD STUDIO'], null, null]);
  await ins(bkRoomSql, [bk1, ROOMS['MEETING ROOM'], 'スタッフ控室', '技術チーム待機']);

  const bk2 = uuidv4();
  await ins(bkSql, [bk2, 'GLS-A001 GH春季IR説明会 本番', 'project', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'], 1, '2026-03-28', '2026-03-28', null, '本番日', USERS.staff1]);
  await ins(bkRoomSql, [bk2, ROOMS['WORLD STUDIO'], null, null]);
  await ins(bkRoomSql, [bk2, ROOMS['MEETING ROOM'], 'GH社 田村様ほか5名', '来賓控室']);
  await ins(bkRoomSql, [bk2, ROOMS['VIP LOUNGE'], 'GH社 代表取締役', 'VIP控室']);

  // GLS-A002 サイエンス・フロンティア 収録 (時間指定)
  const bk3 = uuidv4();
  await ins(bkSql, [bk3, 'GLS-A002 #001 サイエンスF 収録', 'project', PROJECTS['GLS-A002'], EPISODES['GLS-A002-001'], 0, '2026-04-07T09:00', '2026-04-07T18:00', null, '第1話収録', USERS.staff2]);
  await ins(bkRoomSql, [bk3, ROOMS['SKY STUDIO'], null, null]);
  await ins(bkRoomSql, [bk3, ROOMS['第1調整室'], null, null]);

  const bk4 = uuidv4();
  await ins(bkSql, [bk4, 'GLS-A002 #002 サイエンスF 収録', 'project', PROJECTS['GLS-A002'], EPISODES['GLS-A002-002'], 0, '2026-04-14T09:00', '2026-04-14T18:00', null, '第2話収録', USERS.staff2]);
  await ins(bkRoomSql, [bk4, ROOMS['SKY STUDIO'], null, null]);
  await ins(bkRoomSql, [bk4, ROOMS['第1調整室'], null, null]);

  // GLS-A003 ネットライブ配信 (LOUNGE STUDIO)
  const bk5 = uuidv4();
  await ins(bkSql, [bk5, 'GLS-A003 #001 ネットライブ配信', 'project', PROJECTS['GLS-A003'], EPISODES['GLS-A003-001'], 0, '2026-04-05T19:00', '2026-04-05T22:00', null, '生配信', USERS.staff3]);
  await ins(bkRoomSql, [bk5, ROOMS['LOUNGE STUDIO'], null, null]);
  await ins(bkRoomSql, [bk5, ROOMS['第2調整室'], null, null]);

  // メンテナンス予約
  const bk6 = uuidv4();
  await ins(bkSql, [bk6, 'WORLD STUDIO 定期メンテナンス', 'maintenance', null, null, 1, '2026-04-01', '2026-04-01', null, '照明・音響設備の定期点検', USERS.admin]);
  await ins(bkRoomSql, [bk6, ROOMS['WORLD STUDIO'], null, null]);

  // 内覧予約
  const bk7 = uuidv4();
  await ins(bkSql, [bk7, 'クライアント内覧（○○テレビ様）', 'tour', null, null, 0, '2026-04-03T14:00', '2026-04-03T16:00', null, '新規顧客。WORLD/SKYを見学希望', USERS.staff1]);
  await ins(bkRoomSql, [bk7, ROOMS['WORLD STUDIO'], null, null]);
  await ins(bkRoomSql, [bk7, ROOMS['SKY STUDIO'], null, null]);

  // 渋谷スタジオ予約
  const bk8 = uuidv4();
  await ins(bkSql, [bk8, 'GLS-A008 富士見 CM収録', 'project', PROJECTS['GLS-A008'], EPISODES['GLS-A008-001'], 0, '2026-03-25T10:00', '2026-03-25T20:00', null, 'CM撮影', USERS.staff3]);
  await ins(bkRoomSql, [bk8, ROOMS['第1スタジオ'], null, null]);

  // 外現場
  const bk9 = uuidv4();
  await ins(bkSql, [bk9, 'GLS-A005 GE ドキュメンタリー ロケ', 'project', PROJECTS['GLS-A005'], EPISODES['GLS-A005-001'], 1, '2026-04-10', '2026-04-12', '富士山麓ロケーション', '3日間ロケ撮影', USERS.staff2]);

  // ==========================================================
  // Equipment (機材管理)
  // ==========================================================

  // Locations (保管場所)
  const eqLocIds: Record<string, string> = {};
  const eqLocs = [
    { key: 'world_studio', name: 'ワールドスタジオ', building: 'A棟', floor: '1F', area: 'スタジオ', order: 1 },
    { key: 'world_sub', name: 'ワールドスタジオ サブ', building: 'A棟', floor: '1F', area: 'サブコントロール', order: 2 },
    { key: 'camera_storage', name: 'カメラ庫', building: 'A棟', floor: '3F', area: '機材エリア', order: 3 },
    { key: 'equipment_storage', name: '機材庫', building: 'A棟', floor: '3F', area: '機材エリア', order: 4 },
    { key: 'lighting_storage', name: '照明庫', building: 'A棟', floor: '3F', area: '機材エリア', order: 5 },
    { key: 'audio_storage', name: '音響庫', building: 'A棟', floor: '3F', area: '機材エリア', order: 6 },
    { key: 'server_room', name: 'サーバールーム', building: 'A棟', floor: 'B1F', area: 'インフラ', order: 7 },
    { key: 'edit_room1', name: '編集室1', building: 'A棟', floor: '2F', area: 'ポスプロ', order: 8 },
    { key: 'edit_room2', name: '編集室2', building: 'A棟', floor: '2F', area: 'ポスプロ', order: 9 },
    { key: 'office', name: 'オフィスフロア', building: 'A棟', floor: '4F', area: 'オフィス', order: 10 },
  ];
  for (const loc of eqLocs) {
    eqLocIds[loc.key] = uuidv4();
    await ins("INSERT INTO equipment_locations (id, name, building, floor, area, sort_order) VALUES (?,?,?,?,?,?)",
      [eqLocIds[loc.key], loc.name, loc.building, loc.floor, loc.area, loc.order]);
  }

  // Categories
  const eqCatIds: Record<string, string> = {};
  const eqCats = [
    { key: 'camera', name: 'カメラ', type: 'both', order: 1 },
    { key: 'lens', name: 'レンズ', type: 'rental', order: 2 },
    { key: 'lighting', name: '照明', type: 'both', order: 3 },
    { key: 'audio', name: '音響', type: 'both', order: 4 },
    { key: 'monitor', name: 'モニター', type: 'both', order: 5 },
    { key: 'switcher', name: 'スイッチャー', type: 'facility', order: 6 },
    { key: 'pc', name: 'PC・サーバー', type: 'facility', order: 7 },
    { key: 'network', name: 'ネットワーク', type: 'facility', order: 8 },
    { key: 'other', name: 'その他', type: 'both', order: 99 },
  ];
  for (const c of eqCats) {
    eqCatIds[c.key] = uuidv4();
    await ins("INSERT INTO equipment_categories (id, name, item_type, sort_order) VALUES (?,?,?,?)",
      [eqCatIds[c.key], c.name, c.type, c.order]);
  }

  // Equipment items
  const eqItemIds: Record<string, string> = {};
  const eqItems = [
    // カメラ (複数台あり)
    { key: 'cam1',   name: 'Sony PXW-FX9', cat: 'camera', type: 'facility', mfr: 'Sony', model: 'PXW-FX9', serial: 'FX9-2024-001', cost: 1980000, life: 5, loc: 'A棟 3F カメラ庫', lendable: false, unit: 1 },
    { key: 'cam1b',  name: 'Sony PXW-FX9', cat: 'camera', type: 'facility', mfr: 'Sony', model: 'PXW-FX9', serial: 'FX9-2024-002', cost: 1980000, life: 5, loc: 'ワールドスタジオ', lendable: false, unit: 2 },
    { key: 'cam2',   name: 'Sony PXW-FX6', cat: 'camera', type: 'rental', mfr: 'Sony', model: 'PXW-FX6', serial: 'FX6-2024-001', cost: 650000, life: 5, loc: 'A棟 3F カメラ庫', lendable: true, unit: 1 },
    { key: 'cam2b',  name: 'Sony PXW-FX6', cat: 'camera', type: 'rental', mfr: 'Sony', model: 'PXW-FX6', serial: 'FX6-2024-002', cost: 650000, life: 5, loc: 'A棟 3F カメラ庫', lendable: true, unit: 2 },
    { key: 'cam2c',  name: 'Sony PXW-FX6', cat: 'camera', type: 'rental', mfr: 'Sony', model: 'PXW-FX6', serial: 'FX6-2024-003', cost: 650000, life: 5, loc: 'A棟 3F カメラ庫', lendable: true, unit: 3 },
    { key: 'cam3',   name: 'Blackmagic URSA Mini Pro 12K', cat: 'camera', type: 'facility', mfr: 'Blackmagic', model: 'URSA Mini Pro 12K', serial: 'BM-12K-001', cost: 980000, life: 5, loc: 'ワールドスタジオ', lendable: false, unit: 1 },
    // スイッチャー
    { key: 'sw1',    name: 'Blackmagic ATEM 4 M/E', cat: 'switcher', type: 'facility', mfr: 'Blackmagic', model: 'ATEM 4 M/E Constellation 4K', serial: 'ATEM4ME-001', cost: 4500000, life: 7, loc: 'サブ1', lendable: false, unit: 1 },
    { key: 'sw2',    name: 'Blackmagic ATEM Mini Extreme ISO', cat: 'switcher', type: 'rental', mfr: 'Blackmagic', model: 'ATEM Mini Extreme ISO', serial: 'AMEI-001', cost: 180000, life: 5, loc: 'A棟 3F 機材庫', lendable: true, unit: 1 },
    { key: 'sw2b',   name: 'Blackmagic ATEM Mini Extreme ISO', cat: 'switcher', type: 'rental', mfr: 'Blackmagic', model: 'ATEM Mini Extreme ISO', serial: 'AMEI-002', cost: 180000, life: 5, loc: 'A棟 3F 機材庫', lendable: true, unit: 2 },
    // モニター
    { key: 'mon1',   name: 'Sony BVM-HX3110', cat: 'monitor', type: 'facility', mfr: 'Sony', model: 'BVM-HX3110', serial: 'HX3110-001', cost: 3200000, life: 7, loc: 'ワールドスタジオ サブ', lendable: false, unit: 1 },
    { key: 'mon2',   name: 'SmallHD Cine 13', cat: 'monitor', type: 'rental', mfr: 'SmallHD', model: 'Cine 13', serial: 'SHD-C13-001', cost: 480000, life: 5, loc: 'A棟 3F 機材庫', lendable: true, unit: 1 },
    { key: 'mon2b',  name: 'SmallHD Cine 13', cat: 'monitor', type: 'rental', mfr: 'SmallHD', model: 'Cine 13', serial: 'SHD-C13-002', cost: 480000, life: 5, loc: 'A棟 3F 機材庫', lendable: true, unit: 2 },
    // 照明
    { key: 'light1', name: 'ARRI SkyPanel S60-C', cat: 'lighting', type: 'facility', mfr: 'ARRI', model: 'SkyPanel S60-C', serial: 'ARRI-S60-001', cost: 750000, life: 7, loc: 'ワールドスタジオ 照明バトン', lendable: false, unit: 1 },
    { key: 'light2', name: 'Aputure 600d Pro', cat: 'lighting', type: 'rental', mfr: 'Aputure', model: '600d Pro', serial: 'APT-600D-001', cost: 280000, life: 5, loc: 'A棟 3F 照明庫', lendable: true, unit: 1 },
    { key: 'light2b',name: 'Aputure 600d Pro', cat: 'lighting', type: 'rental', mfr: 'Aputure', model: '600d Pro', serial: 'APT-600D-002', cost: 280000, life: 5, loc: 'A棟 3F 照明庫', lendable: true, unit: 2 },
    // 音響
    { key: 'mic1',   name: 'Sennheiser MKH416', cat: 'audio', type: 'rental', mfr: 'Sennheiser', model: 'MKH416', serial: 'MKH416-001', cost: 120000, life: 7, loc: 'A棟 3F 音響庫', lendable: true, unit: 1 },
    { key: 'mic1b',  name: 'Sennheiser MKH416', cat: 'audio', type: 'rental', mfr: 'Sennheiser', model: 'MKH416', serial: 'MKH416-002', cost: 120000, life: 7, loc: 'A棟 3F 音響庫', lendable: true, unit: 2 },
    { key: 'mixer1', name: 'Yamaha DM7', cat: 'audio', type: 'facility', mfr: 'Yamaha', model: 'DM7', serial: 'DM7-001', cost: 3800000, life: 10, loc: 'ワールドスタジオ サブ', lendable: false, unit: 1 },
    // PC・サーバー
    { key: 'srv1',   name: 'Dell PowerEdge R760', cat: 'pc', type: 'facility', mfr: 'Dell', model: 'PowerEdge R760', serial: 'SRV-R760-001', cost: 1200000, life: 5, loc: 'サーバールーム ラックA-1', lendable: false, unit: 1 },
    // レンズ
    { key: 'lens1',  name: 'Canon CN-E 50mm T1.3', cat: 'lens', type: 'rental', mfr: 'Canon', model: 'CN-E 50mm T1.3 L F', serial: 'CNE50-001', cost: 450000, life: 7, loc: 'A棟 3F カメラ庫', lendable: true, unit: 1 },
    // ネットワーク
    { key: 'net1',   name: 'Cisco Catalyst 9300', cat: 'network', type: 'facility', mfr: 'Cisco', model: 'Catalyst 9300-24T', serial: 'C9300-001', cost: 650000, life: 7, loc: 'サーバールーム ラックB-2', lendable: false, unit: 1 },
  ];

  // Update EQ code sequence
  await execute("UPDATE sequences SET counter = 0 WHERE seq_name = 'eq_code'", []);

  const eqChars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let eqCounter = 0;
  function nextEqCode(): string {
    eqCounter++;
    let code = '';
    let seed = eqCounter;
    for (let i = 0; i < 10; i++) {
      const idx = (seed * 31 + i * 7 + eqCounter) % eqChars.length;
      code += eqChars[Math.abs(idx) % eqChars.length];
      seed = Math.floor(seed / eqChars.length) + eqCounter + i;
    }
    return `EQ-${code}`;
  }

  for (const eq of eqItems) {
    eqItemIds[eq.key] = uuidv4();
    const eqCode = nextEqCode();
    await ins(`INSERT INTO equipment_items (
      id, eq_code, name, category_id, item_type, unit_number,
      manufacturer, model_number, serial_number,
      acquisition_cost, useful_life, asset_class, depreciation_method,
      status, condition, location_detail,
      is_lendable, acquisition_date, created_by
    ) VALUES (?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?, ?,?,?)`, [
      eqItemIds[eq.key], eqCode, eq.name, eqCatIds[eq.cat], eq.type, eq.unit,
      eq.mfr, eq.model, eq.serial,
      eq.cost, eq.life, 'fixed_asset', 'straight_line',
      'active', 'good', eq.loc,
      eq.lendable ? 1 : 0, '2024-04-01', USERS.admin,
    ]);
  }

  // Update sequence counter
  await execute(`UPDATE sequences SET counter = ? WHERE seq_name = 'eq_code'`, [eqCounter]);

  // Parent-child relationships (equipment sets)
  // Create a "カメラセット A" parent item, then assign camera + lens children
  const camSetAId = uuidv4();
  eqCounter++;
  const camSetACode = `EQ-CAMSET-A`;
  await ins(`INSERT INTO equipment_items (
    id, eq_code, name, category_id, item_type, unit_number,
    manufacturer, model_number, serial_number,
    acquisition_cost, useful_life, asset_class, depreciation_method,
    status, condition, location_detail,
    is_lendable, acquisition_date, created_by
  ) VALUES (?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?, ?,?,?)`, [
    camSetAId, camSetACode, 'カメラセット A (FX9 + CN-E 50mm)', eqCatIds['camera'], 'facility', 1,
    null, null, null,
    0, 5, 'fixed_asset', 'straight_line',
    'active', 'good', 'A棟 3F カメラ庫',
    0, '2024-04-01', USERS.admin,
  ]);

  // Set cam1 (Sony PXW-FX9 #1) and lens1 (Canon CN-E 50mm) as children of カメラセット A
  await execute(`UPDATE equipment_items SET parent_id = ? WHERE id = ?`, [camSetAId, eqItemIds['cam1']]);
  await execute(`UPDATE equipment_items SET parent_id = ? WHERE id = ?`, [camSetAId, eqItemIds['lens1']]);

  // Create a "照明セット A" parent item for lighting equipment
  const lightSetAId = uuidv4();
  eqCounter++;
  const lightSetACode = `EQ-LTSET-A`;
  await ins(`INSERT INTO equipment_items (
    id, eq_code, name, category_id, item_type, unit_number,
    manufacturer, model_number, serial_number,
    acquisition_cost, useful_life, asset_class, depreciation_method,
    status, condition, location_detail,
    is_lendable, acquisition_date, created_by
  ) VALUES (?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?, ?,?,?)`, [
    lightSetAId, lightSetACode, '照明セット A (Aputure 600d Pro x2)', eqCatIds['lighting'], 'rental', 1,
    null, null, null,
    0, 5, 'fixed_asset', 'straight_line',
    'active', 'good', 'A棟 3F 照明庫',
    1, '2024-04-01', USERS.admin,
  ]);

  // Set light2 and light2b (Aputure 600d Pro #1 & #2) as children of 照明セット A
  await execute(`UPDATE equipment_items SET parent_id = ? WHERE id = ?`, [lightSetAId, eqItemIds['light2']]);
  await execute(`UPDATE equipment_items SET parent_id = ? WHERE id = ?`, [lightSetAId, eqItemIds['light2b']]);

  // Sample lendings
  const lend1 = uuidv4();
  await ins(`INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, status, condition_out, lent_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [lend1, eqItemIds['cam2'], PROJECTS['GLS-A005'], '鈴木一郎', 'ドキュメンタリーロケ撮影', '2026-03-20', '2026-04-15', 'lent', 'good', USERS.staff2]);

  const lend2 = uuidv4();
  await ins(`INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, returned_at, status, condition_out, condition_in, lent_by, returned_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [lend2, eqItemIds['sw2'], PROJECTS['GLS-A003'], '佐藤花子', 'イベント配信', '2026-03-10', '2026-03-15', '2026-03-15T18:00', 'returned', 'good', 'good', USERS.staff1, USERS.staff1]);

  // Sample maintenance record
  const maint1 = uuidv4();
  await ins(`INSERT INTO maintenance_records (id, equipment_id, record_type, title, description, reported_by, status, vendor_name, repair_cost) VALUES (?,?,?,?,?,?,?,?,?)`,
    [maint1, eqItemIds['light2'], 'maintenance', '定期点検 2026年3月', 'ファンの異音確認 → 清掃で改善', USERS.staff3, 'completed', null, null]);

  // Accessories
  const acc1 = uuidv4();
  await ins("INSERT INTO equipment_accessories (id, parent_id, child_id, note) VALUES (?,?,?,?)",
    [acc1, eqItemIds['cam1'], eqItemIds['lens1'], '標準レンズキット']);

  // ============================================================
  // Qsheet Documents (Qシート)
  // ============================================================
  const qsheetSql = `INSERT INTO qsheet_documents (id, title, episode_id, project_id, broadcast_date, status, data, created_by, updated_by) VALUES (?,?,?,?,?,?,?,?,?)`;

  await ins(qsheetSql, [
    uuidv4(), 'GH春季IR説明会 Qシート', EPISODES['GLS-A001-001'], PROJECTS['GLS-A001'], '2026-03-28', 'confirmed',
    JSON.stringify({
      rows: [
        { id: '1', time: '13:00', duration: '5', item: 'OA', content: 'オープニングアニメーション', cast: '', notes: 'CG再生' },
        { id: '2', time: '13:05', duration: '3', item: '挨拶', content: '代表取締役ご挨拶', cast: '代表取締役', notes: '演台マイク' },
        { id: '3', time: '13:08', duration: '25', item: '説明', content: '2025年度決算報告', cast: 'CFO 田村氏', notes: 'スライド投影' },
        { id: '4', time: '13:33', duration: '20', item: '説明', content: '2026年度事業計画', cast: 'CEO', notes: 'スライド+動画' },
        { id: '5', time: '13:53', duration: '2', item: '休憩', content: '休憩', cast: '', notes: '' },
        { id: '6', time: '13:55', duration: '20', item: 'Q&A', content: '質疑応答', cast: '登壇者全員', notes: '会場マイク巡回' },
        { id: '7', time: '14:15', duration: '5', item: 'ED', content: 'エンディング・閉会挨拶', cast: '司会', notes: '' },
      ],
    }),
    USERS.staff1, USERS.staff1,
  ]);

  await ins(qsheetSql, [
    uuidv4(), 'サイエンス・フロンティア #001 Qシート', EPISODES['GLS-A002-001'], PROJECTS['GLS-A002'], '2026-04-07', 'draft',
    JSON.stringify({
      rows: [
        { id: '1', time: '10:00', duration: '3', item: 'OP', content: 'オープニングタイトル', cast: '', notes: 'CG' },
        { id: '2', time: '10:03', duration: '5', item: 'VTR', content: '前回のあらすじ', cast: 'ナレーション', notes: 'VTR再生' },
        { id: '3', time: '10:08', duration: '15', item: 'トーク', content: '今回のテーマ紹介「量子コンピュータの現在」', cast: 'MC 高橋・ゲスト教授', notes: '' },
        { id: '4', time: '10:23', duration: '12', item: 'VTR', content: '取材VTR：量子研究所訪問', cast: '', notes: 'VTR再生' },
        { id: '5', time: '10:35', duration: '10', item: 'トーク', content: 'ゲスト解説・実験コーナー', cast: 'MC・教授', notes: '実験セットあり' },
        { id: '6', time: '10:45', duration: '3', item: 'ED', content: 'エンディング・次回予告', cast: 'MC', notes: '' },
      ],
    }),
    USERS.staff2, USERS.staff2,
  ]);

  await ins(qsheetSql, [
    uuidv4(), 'ネットLIVE配信 #001 Qシート', EPISODES['GLS-A003-001'], PROJECTS['GLS-A003'], '2026-04-05', 'confirmed',
    JSON.stringify({
      rows: [
        { id: '1', time: '19:00', duration: '5', item: 'OP', content: 'オープニング・配信開始', cast: 'MC', notes: 'YouTube Live開始' },
        { id: '2', time: '19:05', duration: '20', item: 'コーナー1', content: '今週のテックニュース', cast: 'MC・コメンテーター', notes: '' },
        { id: '3', time: '19:25', duration: '15', item: 'コーナー2', content: 'ゲストインタビュー', cast: 'ゲスト', notes: 'リモート出演' },
        { id: '4', time: '19:40', duration: '10', item: 'コーナー3', content: 'チャットQ&A', cast: 'MC', notes: 'チャット読み上げ' },
        { id: '5', time: '19:50', duration: '5', item: 'ED', content: '次回予告・配信終了', cast: 'MC', notes: '' },
      ],
    }),
    USERS.staff3, USERS.staff3,
  ]);

  // ============================================================
  // TechSheet Documents (技術資料)
  // ============================================================
  const techsheetSql = `INSERT INTO techsheet_documents (id, title, project_id, episode_id, production_date, venue, status, data, created_by) VALUES (?,?,?,?,?,?,?,?,?)`;

  await ins(techsheetSql, [
    uuidv4(), 'GH春季IR説明会 技術仕様書', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'],
    '2026-03-28', '用賀 WORLD STUDIO', 'confirmed',
    JSON.stringify({
      cameras: [
        { position: 'CAM1', model: 'Sony PXW-FX9', lens: '24-70mm', operator: '鈴木一郎', notes: '演台メインカメラ' },
        { position: 'CAM2', model: 'Sony PXW-FX9', lens: '70-200mm', operator: '高橋美咲', notes: '会場全景' },
        { position: 'CAM3', model: 'Sony PXW-FX6', lens: '16-35mm', operator: '', notes: 'ロボカメ（リモート操作）' },
      ],
      video: { switcher: 'ATEM 4 M/E Constellation 4K', format: '4K/59.94p', recording: 'HyperDeck Studio 4K Pro', streaming: 'YouTube Live (1080p)' },
      audio: { mixer: 'Yamaha DM7', mics: ['ワイヤレスピンマイク x3', '演台グースネック x1', '会場ハンドマイク x2'], monitoring: 'IEM x2' },
      comms: { system: 'RTS ADAM-M', channels: ['CAM', 'Audio', 'Lighting', 'Director'] },
    }),
    USERS.staff2,
  ]);

  await ins(techsheetSql, [
    uuidv4(), 'サイエンス・フロンティア 収録 技術仕様書', PROJECTS['GLS-A002'], EPISODES['GLS-A002-001'],
    '2026-04-07', '用賀 SKY STUDIO', 'draft',
    JSON.stringify({
      cameras: [
        { position: 'CAM1', model: 'Blackmagic URSA Mini Pro 12K', lens: 'Canon CN-E 50mm', operator: '鈴木一郎', notes: 'メインカメラ' },
        { position: 'CAM2', model: 'Sony PXW-FX6', lens: '24-70mm', operator: '高橋美咲', notes: 'ゲスト寄り' },
        { position: 'CAM3', model: 'Sony PXW-FX6', lens: '16-35mm', operator: '', notes: 'セット全景（固定）' },
      ],
      video: { switcher: 'ATEM Mini Extreme ISO', format: '4K/29.97p', recording: 'ATEM ISO Recording + SSD', streaming: '' },
      audio: { mixer: 'Yamaha DM7', mics: ['ラベリアマイク x2', 'ブームマイク x1', 'ガンマイク MKH416 x1'], monitoring: '' },
      comms: { system: 'インカム 4ch', channels: ['Director', 'Camera', 'Audio'] },
    }),
    USERS.staff2,
  ]);

  // ============================================================
  // Interactive Events & Stamps (インタラクティブ演出)
  // ============================================================
  const eventSql = `INSERT INTO interactive_events (id, title, description, status, project_id, episode_id, config, max_connections, created_by) VALUES (?,?,?,?,?,?,?,?,?)`;
  const stampSql = `INSERT INTO interactive_stamps (id, event_id, label, emoji, color, animation, sort_order, is_active) VALUES (?,?,?,?,?,?,?,?)`;

  const ev1Id = uuidv4();
  await ins(eventSql, [
    ev1Id, 'GH春季IR説明会 リアクション', 'IR説明会のリアルタイムリアクション収集',
    'draft', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'],
    JSON.stringify({ theme: 'corporate', showCount: true }),
    500, USERS.staff1,
  ]);
  await ins(stampSql, [uuidv4(), ev1Id, 'なるほど', '💡', '#3b82f6', 'bounce', 1, true]);
  await ins(stampSql, [uuidv4(), ev1Id, 'いいね', '👍', '#22c55e', 'bounce', 2, true]);
  await ins(stampSql, [uuidv4(), ev1Id, '質問', '❓', '#f59e0b', 'pop', 3, true]);
  await ins(stampSql, [uuidv4(), ev1Id, 'すごい', '🎉', '#ec4899', 'shake', 4, true]);

  const ev2Id = uuidv4();
  await ins(eventSql, [
    ev2Id, 'ネットLIVE配信 #001 スタンプ', '視聴者参加型リアクションスタンプ',
    'draft', PROJECTS['GLS-A003'], EPISODES['GLS-A003-001'],
    JSON.stringify({ theme: 'fun', showCount: true, allowAnonymous: true }),
    2000, USERS.staff3,
  ]);
  await ins(stampSql, [uuidv4(), ev2Id, '笑', '😂', '#f59e0b', 'shake', 1, true]);
  await ins(stampSql, [uuidv4(), ev2Id, '拍手', '👏', '#22c55e', 'bounce', 2, true]);
  await ins(stampSql, [uuidv4(), ev2Id, 'ハート', '❤️', '#ef4444', 'pop', 3, true]);
  await ins(stampSql, [uuidv4(), ev2Id, '驚き', '😮', '#8b5cf6', 'bounce', 4, true]);
  await ins(stampSql, [uuidv4(), ev2Id, '炎', '🔥', '#f97316', 'shake', 5, true]);

  saveDb();
  console.log('Seed data inserted successfully.');
}

if (require.main === module) {
  runMigrations().then(() => seed()).then(() => closeDb());
}
