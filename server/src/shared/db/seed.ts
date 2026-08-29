import { v4 as uuidv4 } from 'uuid';
import { initDb, saveDb, closeDb, queryOne, execute } from './connection';
import { runMigrations } from './migrate';
import { hashPassword } from '../auth/password';
import { looksLikeGmoGroup } from '../services/gmo-group';
import { createCustomerRecord, createVendorRecord } from '../services/company-directory.service';
import { classificationOf } from '../../contexts/sales/services/project-classification';

const USERS = {
  admin: '00000000-0000-0000-0000-000000000001',
  staff1: '00000000-0000-0000-0000-000000000002',
  staff2: '00000000-0000-0000-0000-000000000003',
  staff3: '00000000-0000-0000-0000-000000000004',
  staff4: '00000000-0000-0000-0000-000000000005',
  staff5: '00000000-0000-0000-0000-000000000006',
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
  // Users — v2.5.0: dev でも password 認証で使えるよう password_hash + status='active' を付与
  // 共通 dev パスワード: "dev1234" (ログイン用)
  // 電話番号は付与しない (SMS 2FA 不要)。
  // ============================================================
  const devPasswordHash = await hashPassword('dev1234');
  const userSql = `INSERT INTO users (id, name, email, role, password_hash, status) VALUES (?, ?, ?, ?, ?, 'active')`;
  // 開発用 admin。本番管理者の実メールはソースに直書きしない (ADMIN_EMAIL を使用 — seed-admin.ts 参照)
  await ins(userSql, [USERS.admin, 'システム管理者', 'admin@onair.local', 'system_admin', devPasswordHash]);
  await ins(userSql, [USERS.staff1, '佐藤 花子', 'sato@globalstudio.example.com', 'staff', devPasswordHash]);
  await ins(userSql, [USERS.staff2, '鈴木 一郎', 'suzuki@globalstudio.example.com', 'staff', devPasswordHash]);
  await ins(userSql, [USERS.staff3, '高橋 美咲', 'takahashi@globalstudio.example.com', 'staff', devPasswordHash]);
  await ins(userSql, [USERS.staff4, '田中 健二', 'tanaka@globalstudio.example.com', 'staff', devPasswordHash]);
  await ins(userSql, [USERS.staff5, '山田 太郎', 'yamada@globalstudio.example.com', 'staff', devPasswordHash]);

  // ============================================================
  // User Permissions (system_admin bypasses checks, so only non-admin users)
  // ============================================================
  const permSql = `INSERT INTO user_permissions (id, user_id, module, access_level) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`;
  // 3段階: reader(閲覧) / editor(編集) / manager(管理)
  //
  // 権限モデル単純化（migration 210）で、区画はブロックアプリ単位に統合済み
  // （その後の技術資料アプリ削除・migration 211、計時・視聴者の権限区画統合・
  // migration 232 でいまは5つ）。
  // `sales` が旧 `budget`/`gpm`/`studio`/`partner_schedule` をまとめて持つ
  // （案件管理・財務管理・カレンダー・設定・プロジェクト管理）。
  // `qsheet` が計時・視聴者（旧 `liveops`）の権限も面倒を見る（migration 232）。
  const perms: [string, string, string][] = [
    // staff1 — 佐藤（フルアクセス寄り）
    [USERS.staff1, 'sales',       'manager'],
    [USERS.staff1, 'equipment',   'reader'],
    [USERS.staff1, 'qsheet',      'editor'],
    [USERS.staff1, 'awards',      'editor'],
    [USERS.staff1, 'dailyops',    'editor'],

    // staff2 — 鈴木（フルアクセス寄り・機材と凍結アプリは管理者）
    [USERS.staff2, 'sales',       'manager'],
    [USERS.staff2, 'equipment',   'manager'],
    [USERS.staff2, 'qsheet',      'manager'],
    [USERS.staff2, 'awards',      'manager'],
    [USERS.staff2, 'dailyops',    'manager'],

    // staff3 — 高橋（制作スタッフ・sales は見るだけ）
    [USERS.staff3, 'sales',       'editor'],
    [USERS.staff3, 'equipment',   'editor'],
    [USERS.staff3, 'qsheet',      'editor'],
    [USERS.staff3, 'awards',      'editor'],
    [USERS.staff3, 'dailyops',    'editor'],

    // staff4 — 田中（経営層・主に閲覧）
    [USERS.staff4, 'sales',       'reader'],
    [USERS.staff4, 'equipment',   'reader'],
    [USERS.staff4, 'qsheet',      'reader'],
    [USERS.staff4, 'awards',      'reader'],
    [USERS.staff4, 'dailyops',    'reader'],

    // staff5 — 山田（限定アクセス。equipment/dailyops は持たない例）
    [USERS.staff5, 'sales',       'editor'],
    [USERS.staff5, 'qsheet',      'reader'],
    [USERS.staff5, 'awards',      'reader'],
  ];

  for (const [userId, mod, level] of perms) {
    await ins(permSql, [uuidv4(), userId, mod, level]);
  }

  // ============================================================
  // Customers
  // ============================================================
  // **グループの印は社名から見立てる**（migration 192）。検証環境で
  // 「グループ内 / グループ外」の見え方を確かめられるように、
  // GMO とついたお客様（＝グループ会社）を1件入れてある
  // **`companies`（取引先マスター）にも紐づける**（company-directory.service.ts）。
  // シードが customers/vendors だけに直接 INSERT すると、検証環境の取引先マスターが
  // 顧客一覧より少なく見え、「同じはずのデータが画面によって件数が違う」ことになる
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
    ['GMOデジタルソリューションズ株式会社', 'GMO-DS', '青木 拓真', 'aoki@gmo-ds.example.com', '03-1357-2468', '東京都渋谷区桜丘町26-1'],
  ];
  for (const [name, short, contact, email, phone, address] of customerData) {
    // createCustomerRecord は companies.id を返す（Phase 3-3-9 より前は
    // customers.id を返し、company_id を引き直していた）
    const companyId = await createCustomerRecord(
      { name, short_name: short, contact_name: contact, email, phone, address,
        is_gmo_group: looksLikeGmoGroup(name) },
      null, ins,
    );
    CUSTOMERS[short] = companyId;
  }

  // ============================================================
  // Vendors
  // ============================================================
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
    // createVendorRecord は companies.id を返す（customers と同じ理由・上記参照）
    const companyId = await createVendorRecord(
      { name, contact_name: contact, email, phone, address, vendor_type: vType,
        invoice_registration_number: regNum },
      null, ins,
    );
    VENDORS[vType] = companyId;
  }

  // ============================================================
  // Pricing Categories & Items は migration 065 で投入 (公式料金体系)
  // ============================================================

  // ============================================================
  // Sequences
  // ============================================================
  await ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['gls_a', 'GLS-A', '000000', 8]);
  await ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['gls_b', 'GLS-B', '000000', 2]);
  await ins(`INSERT INTO sequences (seq_name, prefix, year_month, counter) VALUES (?, ?, ?, ?)`, ['opp_code', 'OPP', '202603', 15]);

  // ============================================================
  // Projects (統合: ヨミ段階 + GLS発番済み)
  // ============================================================
  /*
   * ⚠️ **旧「案件種類」だけを入れないこと。** 2段分類（`audience` / `project_category`・
   * migration 182）を空にすると、**案件詳細の概要タブには旧種類が「案件分類」として
   * 出るのに、案件を直す画面では「選ぶ」＝未登録に見えます** — 検証環境の案件が
   * 全部その見え方になり、実際に「登録してあるのに未登録になる」と報告されました。
   * 導く表は `project-classification.ts`（`classificationOf`）の1か所だけ。
   */
  const projSql = `INSERT INTO projects (id, code, gls_number, gls_category, name, customer_id, stage, project_type, audience, project_category, expected_amount, event_start, event_end, broadcast_type, media_platform, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  /** 旧種類から2段を引く。GLS-B の3種は `null`（2段を持たない） */
  const cls2 = (projType: string) => {
    const c = classificationOf(projType);
    return [c?.audience ?? null, c?.project_category ?? null];
  };

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
    // ヨミ段階のデフォルト分類: project_type からの推奨値 (A系項目なら 'A')
    const yomiCat = ['offline_event', 'hybrid_event', 'live_broadcast', 'recording'].includes(projType) ? 'A' : 'B';
    await ins(projSql, [id, code, null, yomiCat, name, CUSTOMERS[custKey], stage, projType, ...cls2(projType), amt, eventStart, eventEnd, null, null, staffIds[i % 3], USERS.admin]);
  }

  // --- 失注 ---
  const lostData: [string, string, string, string, number, string, string, string, string][] = [
    ['OPP-202603-0013', '中央放送 年末特別企画', '中央放送', 'recording', 10000000, '2026-01-15', '予算不足', '先方の年度予算が確定せず見送り', '2026-01-20'],
    ['OPP-202603-0014', 'DT CM撮影', 'DT', 'offline_event', 2500000, '2026-02-20', '競合負け', '他社スタジオの方が安価だったため', '2026-02-25'],
    ['OPP-202603-0015', 'JB ドラマ撮影（延期）', 'JB', 'recording', 9000000, '2026-03-15', '顧客都合（延期・中止）', '企画自体が無期限延期に', '2026-03-18'],
    ['OPP-202603-0016', 'SN 新番組パイロット', 'SN', 'recording', 4500000, '2026-02-01', 'スケジュール不一致', 'スタジオ空き日程が合わなかった', '2026-02-05'],
    ['OPP-202603-0017', 'GE 社員研修配信', 'GE', 'live_broadcast', 1800000, '2026-03-05', '条件不一致', '求められた配信品質の要件が合わなかった', '2026-03-08'],
  ];
  for (let i = 0; i < lostData.length; i++) {
    const [code, name, custKey, projType, amt, date, reason, note, lostAt] = lostData[i];
    const id = uuidv4();
    await execute(
      `INSERT INTO projects (id, code, name, customer_id, stage, project_type, audience, project_category, gls_category, expected_amount, event_start, assigned_to, lost_reason, lost_reason_note, lost_at, created_by) VALUES (?, ?, ?, ?, 'e_lost', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, CUSTOMERS[custKey], projType, ...cls2(projType),
       ['offline_event', 'hybrid_event', 'live_broadcast', 'recording'].includes(projType) ? 'A' : 'B',
       amt, date, staffIds[i % 3], reason, note, lostAt, USERS.admin]
    );
  }

  // --- GLS発番済み（案件進行中）---
  const glsData: [string, string, string, string, string, number, string, string, string, string][] = [
    ['GLS-A001', 'GH IR説明会 2026春', 'GH', 'hybrid_event', 's_completed', 4000000, '2026-03-19', '2026-03-19', 'live', 'youtube'],
    ['GLS-A002', '東都TV 特番収録「サイエンス・フロンティア」', '東都TV', 'recording', 'a_won', 7500000, '2026-03-22', '2026-03-22', 'recording', 'terrestrial_tv'],
    ['GLS-A003', 'SN 生放送「ナイトトーク」', 'SN', 'live_broadcast', 'a_won', 5500000, '2026-03-25', '2026-03-25', 'live', 'net_media'],
    ['GLS-A004', 'PW 新サービス発表会', 'PW', 'hybrid_event', 'b_verbal', 2800000, '2026-03-30', '2026-03-30', 'live', 'zoom'],
    ['GLS-A005', 'GE ドキュメンタリー撮影', 'GE', 'recording', 'a_won', 12000000, '2026-04-05', '2026-04-07', 'recording', 'net_media'],
    ['GLS-A006', 'DA 社内イベント中継', 'DA', 'live_broadcast', 'b_verbal', 1500000, '2026-04-10', '2026-04-10', 'live', 'teams'],
    ['GLS-A007', 'JB 番組パイロット撮影', 'JB', 'recording', 'b_verbal', 4500000, '2026-04-14', '2026-04-15', 'recording', 'terrestrial_tv'],
    ['GLS-A008', '富士見 CM撮影「春キャンペーン」', '富士見', 'offline_event', 's_completed', 3200000, '2026-03-12', '2026-03-12', 'recording', 'terrestrial_tv'],
  ];
  for (let i = 0; i < glsData.length; i++) {
    const [gls, name, custKey, projType, stage, amt, es, ee, bType, mPlatform] = glsData[i];
    // **GLS-A002 だけ id を固定**（`pj-1`）。案件詳細を検査スクリプト
    // (`scripts/verify-ui.mjs` の `/sales/projects/pj-1` 7ページ) から開くのに、
    // 毎回変わる uuid では狙えない（プロジェクト管理の `gpm-1` と同じ理由）。
    // R6-c 事後レビューで、pj-1 が存在せず7ページが「案件が見つからない」の
    // エラーパネルを測っていたことが分かった。子データは PROJECTS[gls] 経由で付く
    const id = gls === 'GLS-A002' ? 'pj-1' : uuidv4();
    PROJECTS[gls] = id;
    // GLS発番済みなので code = OPP-xxx (元のヨミコード) + gls_number
    const oppCode = `OPP-202603-${String(20 + i).padStart(4, '0')}`;
    await ins(projSql, [id, oppCode, gls, 'A', name, CUSTOMERS[custKey], stage, projType, ...cls2(projType), amt, es, ee, bType, mPlatform, staffIds[i % 3], USERS.admin]);
  }

  // --- B系: GLS-B (その他売上) ---
  const glsBData: [string, string, string, string, string, number][] = [
    ['GLS-B001', 'GH 配信コンサルティング契約', 'GH', 'consulting', 'a_won', 3600000],
    ['GLS-B002', 'PW 動画戦略コンサルティング', 'PW', 'consulting', 'a_won', 2400000],
  ];
  // **GLS-B は2段分類を持たない**（`project-classification.ts`）。**空を明示して書く** —
  // 列ごと書かないと「書き忘れ」と見分けが付かず、そのままにしていたのが
  // 上の A 系の壊れ方（詳細では登録済み・直す画面では未登録）の原因でした
  const projBSql = `INSERT INTO projects (id, code, gls_number, gls_category, name, customer_id, stage, project_type, audience, project_category, expected_amount, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`;
  for (let i = 0; i < glsBData.length; i++) {
    const [gls, name, custKey, projType, stage, amt] = glsBData[i];
    const id = uuidv4();
    PROJECTS[gls] = id;
    const oppCode = `OPP-202603-${String(30 + i).padStart(4, '0')}`;
    await ins(projBSql, [id, oppCode, gls, 'B', name, CUSTOMERS[custKey], stage, projType, amt, staffIds[i % 3], USERS.admin]);
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
  await ins(sgaSql, [uuidv4(), '20260401-1', USERS.staff2, 'other', '900002', '東日本セーフティ損害保険株式会社', '事業用火災保険', '2026-04-01', '2026-04-30', 'tax10', 1, 300000, 'spot', '2026-04', '2027-03', 'staff', USERS.admin]);
  await ins(sgaSql, [uuidv4(), '20260315-1', USERS.staff3, 'rakuraku', '147520', '紀尾井グランドホテル', '顧客打ち合わせ会食費', '2026-03-15', '2026-04-15', 'tax10', 1, 45000, 'spot', null, null, 'staff', USERS.admin]);
  await ins(sgaSql, [uuidv4(), '20260301-1', USERS.staff1, 'other', '900003', '株式会社マネージワークス', '会計ソフト年間利用料', '2026-03-01', '2026-03-31', 'tax10', 1, 120000, 'spot', null, null, 'accounting', USERS.admin]);

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
  /*
   * **拠点と部屋は migration が固定 id で入れ終わっている**
   * (030_studio_default_data.sql ＋ 116_rename_samurai_studios.sql)。
   * ここで uuid を振って同名を入れ直すと**同じ拠点・部屋が2つずつ並ぶ**
   * （部屋の空きのタブ・予約ダイアログの部屋チップ・設定・料金表すべてに波及し、
   * 片方は「料金 未設定」の偽警告まで出す）。名前で引いて既定の行を使い、
   * 無い名前のときだけ入れる。
   */
  const locSql = `INSERT INTO studio_locations (id, name, sort_order) VALUES (?, ?, ?)`;
  const locByName = async (name: string, sortOrder: number): Promise<string> => {
    const row = await queryOne('SELECT id FROM studio_locations WHERE name = ?', [name]);
    if (row) return row.id as string;
    const id = uuidv4();
    await ins(locSql, [id, name, sortOrder]);
    return id;
  };
  const LOC_YOGA = await locByName('GMOサムライスタジオ用賀', 1);
  const LOC_SHIBUYA = await locByName('GMOサムライスタジオ渋谷', 2);
  const LOC_AOYAMA = await locByName('GMOサムライスタジオ青山', 3);
  await locByName('外現場', 4);   // 部屋を持たない拠点。id は使わない

  const roomSql = `INSERT INTO studio_rooms (id, location_id, name, room_type, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)`;
  /** 拠点と同じ理由で、既定の部屋があればその id を使う */
  const roomByName = async (
    locationId: string, name: string, roomType: string, color: string, sortOrder: number,
  ): Promise<string> => {
    const row = await queryOne(
      'SELECT id FROM studio_rooms WHERE location_id = ? AND name = ?', [locationId, name],
    );
    if (row) return row.id as string;
    const id = uuidv4();
    await ins(roomSql, [id, locationId, name, roomType, color, sortOrder]);
    return id;
  };
  // 用賀 (GMOサムライスタジオ用賀)
  const ROOMS: Record<string, string> = {};
  const yogaRooms: [string, string, string, number][] = [
    ['WORLD STUDIO', 'studio', '#2563eb', 1],
    ['SKY STUDIO', 'studio', '#7c3aed', 2],
    ['LOUNGE STUDIO', 'studio', '#0891b2', 3],
    ['第1調整室', 'control', '#4f46e5', 4],
    ['第2調整室', 'control', '#0284c7', 5],
    ['MEETING ROOM', 'greenroom', '#6b7280', 6],
    ['ROOM A', 'greenroom', '#059669', 7],
    ['ROOM B', 'greenroom', '#d97706', 8],
    ['ROOM C', 'greenroom', '#dc2626', 9],
    ['VIP LOUNGE', 'greenroom', '#9333ea', 10],
  ];
  for (const [name, roomType, color, order] of yogaRooms) {
    ROOMS[name] = await roomByName(LOC_YOGA, name, roomType, color, order);
  }

  // 渋谷 (GMOサムライスタジオ渋谷)
  const shibuyaRooms: [string, string, string, number][] = [
    ['第1スタジオ', 'studio', '#e11d48', 1],
    ['第2スタジオ', 'studio', '#ea580c', 2],
    ['第3スタジオ', 'studio', '#ca8a04', 3],
  ];
  for (const [name, roomType, color, order] of shibuyaRooms) {
    ROOMS[name] = await roomByName(LOC_SHIBUYA, name, roomType, color, order);
  }

  // 青山 (GMOサムライスタジオ青山) — 1スタジオのみのため部屋「STUDIO」1件
  ROOMS['AOYAMA STUDIO'] = await roomByName(LOC_AOYAMA, 'STUDIO', 'studio', '#16a34a', 1);

  // ============================================================
  // Studio Bookings (サンプル予約)
  //
  // **`booking_type` に `'project'` は使えない。** migration 051 が許可値を
  // performance / rehearsal / hold / tour / consultation / maintenance /
  // internal / setup / other に入れ替えたときに落ちた値で、
  // ここが `'project'` のままだったため **まっさらな DB では seed が
  // 途中で止まっていた**（studio_bookings 以降の投入が丸ごと入らない）。
  // ============================================================
  const bkSql = `INSERT INTO studio_bookings (id, title, booking_type, project_id, episode_id, all_day, start_time, end_time, location_note, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const bkRoomSql = `INSERT INTO studio_booking_rooms (booking_id, room_id, occupant, usage_note) VALUES (?, ?, ?, ?)`;

  // GLS-A001 IR説明会 → WORLD STUDIO + MEETING ROOM + VIP LOUNGE
  const bk1 = uuidv4();
  await ins(bkSql, [bk1, 'GLS-A001 GH春季IR説明会 リハーサル', 'rehearsal', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'], 1, '2026-03-27', '2026-03-27', null, 'リハーサル。前日仕込み含む', USERS.staff1]);
  await ins(bkRoomSql, [bk1, ROOMS['WORLD STUDIO'], null, null]);
  await ins(bkRoomSql, [bk1, ROOMS['MEETING ROOM'], 'スタッフ控室', '技術チーム待機']);

  const bk2 = uuidv4();
  await ins(bkSql, [bk2, 'GLS-A001 GH春季IR説明会 本番', 'performance', PROJECTS['GLS-A001'], EPISODES['GLS-A001-001'], 1, '2026-03-28', '2026-03-28', null, '本番日', USERS.staff1]);
  await ins(bkRoomSql, [bk2, ROOMS['WORLD STUDIO'], null, null]);
  await ins(bkRoomSql, [bk2, ROOMS['MEETING ROOM'], 'GH社 田村様ほか5名', '来賓控室']);
  await ins(bkRoomSql, [bk2, ROOMS['VIP LOUNGE'], 'GH社 代表取締役', 'VIP控室']);

  // GLS-A002 サイエンス・フロンティア 収録 (時間指定)
  const bk3 = uuidv4();
  await ins(bkSql, [bk3, 'GLS-A002 #001 サイエンスF 収録', 'performance', PROJECTS['GLS-A002'], EPISODES['GLS-A002-001'], 0, '2026-04-07T09:00', '2026-04-07T18:00', null, '第1話収録', USERS.staff2]);
  await ins(bkRoomSql, [bk3, ROOMS['SKY STUDIO'], null, null]);
  await ins(bkRoomSql, [bk3, ROOMS['第1調整室'], null, null]);

  const bk4 = uuidv4();
  await ins(bkSql, [bk4, 'GLS-A002 #002 サイエンスF 収録', 'performance', PROJECTS['GLS-A002'], EPISODES['GLS-A002-002'], 0, '2026-04-14T09:00', '2026-04-14T18:00', null, '第2話収録', USERS.staff2]);
  await ins(bkRoomSql, [bk4, ROOMS['SKY STUDIO'], null, null]);
  await ins(bkRoomSql, [bk4, ROOMS['第1調整室'], null, null]);

  // GLS-A003 ネットライブ配信 (LOUNGE STUDIO)
  const bk5 = uuidv4();
  await ins(bkSql, [bk5, 'GLS-A003 #001 ネットライブ配信', 'performance', PROJECTS['GLS-A003'], EPISODES['GLS-A003-001'], 0, '2026-04-05T19:00', '2026-04-05T22:00', null, '生配信', USERS.staff3]);
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

  // 渋谷 (GMOサムライスタジオ渋谷) 予約
  const bk8 = uuidv4();
  await ins(bkSql, [bk8, 'GLS-A008 富士見 CM収録', 'performance', PROJECTS['GLS-A008'], EPISODES['GLS-A008-001'], 0, '2026-03-25T10:00', '2026-03-25T20:00', null, 'CM撮影', USERS.staff3]);
  await ins(bkRoomSql, [bk8, ROOMS['第1スタジオ'], null, null]);

  // 外現場
  const bk9 = uuidv4();
  await ins(bkSql, [bk9, 'GLS-A005 GE ドキュメンタリー ロケ', 'performance', PROJECTS['GLS-A005'], EPISODES['GLS-A005-001'], 1, '2026-04-10', '2026-04-12', '富士山麓ロケーション', '3日間ロケ撮影', USERS.staff2]);

  /*
   * **今日を含む予約。** 上の予約は 2026-03〜04 の固定日付なので、
   * カレンダー（予定・部屋の空き・香盤）を開くと**今日はいつも空**で、
   * 画面を確かめるたびに予約を手で入れ直すことになっていた。
   * 描き分けの要る形（同じ部屋で時間帯が重なる2件・帯が細くなる10分・
   * 表示窓 8:00–22:00 をまたぐ深夜）を今日の日付で置いておく。
   */
  const dayOffset = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const today = dayOffset(0);
  const todayBookings: [string, string, string, string, string | null][] = [
    // 同じ部屋・重なる時間帯（後から入れたほうが完全に内側に入る組）
    ['本番前リハーサル', 'rehearsal', `${today}T10:00`, `${today}T13:00`, 'WORLD STUDIO'],
    ['音声チェック', 'maintenance', `${today}T10:30`, `${today}T12:30`, 'WORLD STUDIO'],
    // 帯が細くなる短い予約
    ['機材の受け渡し', 'other', `${today}T15:00`, `${today}T15:10`, 'SKY STUDIO'],
    // 表示窓の外へ出る日またぎ
    ['深夜生放送', 'performance', `${today}T22:00`, `${dayOffset(1)}T02:00`, '第1スタジオ'],
    // 明日・明後日（週表・香盤で「今日以外」も見えるように）
    ['収録', 'performance', `${dayOffset(1)}T09:00`, `${dayOffset(1)}T18:00`, 'LOUNGE STUDIO'],
    ['仮押さえ（企画検討中）', 'hold', `${dayOffset(2)}T13:00`, `${dayOffset(2)}T17:00`, 'SKY STUDIO'],
  ];
  for (const [title, type, start, end, room] of todayBookings) {
    const id = uuidv4();
    await ins(bkSql, [id, title, type, null, null, 0, start, end, null, null, USERS.staff1]);
    if (room) await ins(bkRoomSql, [id, ROOMS[room], null, null]);
  }

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

  // メーカーマスタ
  const mfrIds: Record<string, string> = {};
  const mfrs = ['Sony', 'Blackmagic', 'SmallHD', 'ARRI', 'Aputure', 'Sennheiser', 'Yamaha', 'Dell', 'Canon', 'Cisco'];
  for (const name of mfrs) {
    const id = uuidv4();
    mfrIds[name] = id;
    await ins("INSERT INTO equipment_manufacturers (id, name) VALUES (?,?) ON CONFLICT (name) DO NOTHING", [id, name]);
  }

  // Equipment items (設備/貸出 セクションで分類、種別コードで機材ブロック管理)
  const eqItemIds: Record<string, string> = {};
  type EqSeed = { key: string; name: string; tc: string; sec: 'equipment'|'rental'; mfr: string; model: string; serial: string; dep: number; loc: string; unit: number };
  const eqItems: EqSeed[] = [
    { key: 'cam1',   name: 'Sony PXW-FX9', tc: 'C', sec: 'equipment', mfr: 'Sony', model: 'PXW-FX9', serial: 'FX9-2024-001', dep: 5, loc: 'A棟 3F カメラ庫', unit: 1 },
    { key: 'cam1b',  name: 'Sony PXW-FX9', tc: 'C', sec: 'equipment', mfr: 'Sony', model: 'PXW-FX9', serial: 'FX9-2024-002', dep: 5, loc: 'ワールドスタジオ', unit: 2 },
    { key: 'cam2',   name: 'Sony PXW-FX6', tc: 'C', sec: 'rental',    mfr: 'Sony', model: 'PXW-FX6', serial: 'FX6-2024-001', dep: 5, loc: 'A棟 3F カメラ庫', unit: 1 },
    { key: 'cam2b',  name: 'Sony PXW-FX6', tc: 'C', sec: 'rental',    mfr: 'Sony', model: 'PXW-FX6', serial: 'FX6-2024-002', dep: 5, loc: 'A棟 3F カメラ庫', unit: 2 },
    { key: 'cam3',   name: 'Blackmagic URSA Mini Pro 12K', tc: 'C', sec: 'equipment', mfr: 'Blackmagic', model: 'URSA Mini Pro 12K', serial: 'BM-12K-001', dep: 5, loc: 'ワールドスタジオ', unit: 1 },
    { key: 'sw1',    name: 'Blackmagic ATEM 4 M/E', tc: 'V', sec: 'equipment', mfr: 'Blackmagic', model: 'ATEM 4 M/E Constellation 4K', serial: 'ATEM4ME-001', dep: 7, loc: 'サブ1', unit: 1 },
    { key: 'sw2',    name: 'Blackmagic ATEM Mini Extreme ISO', tc: 'V', sec: 'rental', mfr: 'Blackmagic', model: 'ATEM Mini Extreme ISO', serial: 'AMEI-001', dep: 5, loc: 'A棟 3F 機材庫', unit: 1 },
    { key: 'mon1',   name: 'Sony BVM-HX3110', tc: 'V', sec: 'equipment', mfr: 'Sony', model: 'BVM-HX3110', serial: 'HX3110-001', dep: 7, loc: 'ワールドスタジオ サブ', unit: 1 },
    { key: 'mon2',   name: 'SmallHD Cine 13', tc: 'V', sec: 'rental', mfr: 'SmallHD', model: 'Cine 13', serial: 'SHD-C13-001', dep: 5, loc: 'A棟 3F 機材庫', unit: 1 },
    { key: 'light1', name: 'ARRI SkyPanel S60-C', tc: 'L', sec: 'equipment', mfr: 'ARRI', model: 'SkyPanel S60-C', serial: 'ARRI-S60-001', dep: 7, loc: 'ワールドスタジオ 照明バトン', unit: 1 },
    { key: 'light2', name: 'Aputure 600d Pro', tc: 'L', sec: 'rental', mfr: 'Aputure', model: '600d Pro', serial: 'APT-600D-001', dep: 5, loc: 'A棟 3F 照明庫', unit: 1 },
    { key: 'mic1',   name: 'Sennheiser MKH416', tc: 'A', sec: 'rental', mfr: 'Sennheiser', model: 'MKH416', serial: 'MKH416-001', dep: 7, loc: 'A棟 3F 音響庫', unit: 1 },
    { key: 'mixer1', name: 'Yamaha DM7', tc: 'A', sec: 'equipment', mfr: 'Yamaha', model: 'DM7', serial: 'DM7-001', dep: 10, loc: 'ワールドスタジオ サブ', unit: 1 },
    { key: 'srv1',   name: 'Dell PowerEdge R760', tc: 'E', sec: 'equipment', mfr: 'Dell', model: 'PowerEdge R760', serial: 'SRV-R760-001', dep: 5, loc: 'サーバールーム ラックA-1', unit: 1 },
    { key: 'lens1',  name: 'Canon CN-E 50mm T1.3', tc: 'C', sec: 'rental', mfr: 'Canon', model: 'CN-E 50mm T1.3 L F', serial: 'CNE50-001', dep: 7, loc: 'A棟 3F カメラ庫', unit: 1 },
    { key: 'net1',   name: 'Cisco Catalyst 9300', tc: 'NW', sec: 'equipment', mfr: 'Cisco', model: 'Catalyst 9300-24T', serial: 'C9300-001', dep: 7, loc: 'サーバールーム ラックB-2', unit: 1 },
  ];

  const eqCodeCounters: Record<string, number> = {};
  function nextEqCode(tc: string): string {
    const prefix = `Y-${tc}`;
    eqCodeCounters[prefix] = (eqCodeCounters[prefix] ?? 0) + 1;
    return `${prefix}-${String(eqCodeCounters[prefix]).padStart(6, '0')}`;
  }

  for (const eq of eqItems) {
    eqItemIds[eq.key] = uuidv4();
    const eqCode = nextEqCode(eq.tc);
    await ins(`INSERT INTO equipment_items (
      id, eq_code, name, unit_number,
      manufacturer_id, model_number, serial_number,
      depreciation_years, asset_class,
      status, condition, location_detail,
      location_code, equipment_type_code, equipment_section,
      purchased_at, created_by
    ) VALUES (?,?,?,?, ?,?,?, ?,?, ?,?,?, ?,?,?, ?,?)`, [
      eqItemIds[eq.key], eqCode, eq.name, eq.unit,
      mfrIds[eq.mfr], eq.model, eq.serial,
      eq.dep, 'fixed_asset',
      'active', 'good', eq.loc,
      'Y', eq.tc, eq.sec,
      '2024-04-01', USERS.admin,
    ]);
  }

  for (const [prefix, count] of Object.entries(eqCodeCounters)) {
    await execute(
      `INSERT INTO equipment_id_sequences (prefix, counter) VALUES (?, ?) ON CONFLICT (prefix) DO UPDATE SET counter = ?`,
      [prefix, count, count],
    );
  }

  // 親子関係: カメラセット A (cam1 + lens1)
  const camSetAId = uuidv4();
  await ins(`INSERT INTO equipment_items (
    id, eq_code, name, unit_number,
    depreciation_years, asset_class,
    status, condition, location_detail,
    location_code, equipment_type_code, equipment_section,
    purchased_at, created_by
  ) VALUES (?,?,?,?, ?,?, ?,?,?, ?,?,?, ?,?)`, [
    camSetAId, 'Y-C-SET01', 'カメラセット A (FX9 + CN-E 50mm)', 1,
    5, 'fixed_asset',
    'active', 'good', 'A棟 3F カメラ庫',
    'Y', 'C', 'equipment',
    '2024-04-01', USERS.admin,
  ]);
  await execute(`UPDATE equipment_items SET parent_id = ? WHERE id = ?`, [camSetAId, eqItemIds['cam1']]);
  await execute(`UPDATE equipment_items SET parent_id = ? WHERE id = ?`, [camSetAId, eqItemIds['lens1']]);

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

  // ============================================================
  // プロジェクト管理 (GPM) — 工程・タスク・未確認事項・体制・見積
  //
  // **無いと検証環境のプロジェクト管理が空っぽで開きます。** 着手時から
  // データが1件も無く、`gpm` の権限も誰にも付いていなかったので、
  // system_admin で開いて「プロジェクトがまだありません」を見るしかありませんでした。
  //
  // **id は固定**（`gpm-1` / `gpm-2`）。詳細画面を検査スクリプト
  // (`scripts/verify-ui.mjs`) から開くのに、毎回変わる uuid では狙えません。
  //
  // 工程は「完了・進行中・待ち・未着手」を**1つずつ入れてあります** —
  // どれか1つの状態しか無いと、色と並びの決めごとが画面で確かめられません。
  // ============================================================
  {
    const GPM1 = 'gpm-1';
    const GPM2 = 'gpm-2';
    await ins(
      `INSERT INTO projects (id, code, gls_number, gls_category, name, customer_id, customer_type,
         stage, gpm_kind, pm_company, started_on, ends_on, expected_amount, assigned_to, created_by)
       VALUES (?, ?, ?, 'B', ?, ?, 'internal', 'a_won', 'self_build', ?, ?, ?, ?, ?, ?)`,
      [GPM1, 'OPP-202605-0101', 'GLS-B101', '用賀スタジオ 第2副調整室 構築',
       CUSTOMERS[Object.keys(CUSTOMERS)[0]], '日建設計', '2026-05-12', '2026-09-30',
       18400000, USERS.staff1, USERS.admin],
    );
    await ins(
      `INSERT INTO projects (id, code, gls_number, gls_category, name, customer_id, customer_type,
         stage, gpm_kind, started_on, ends_on, expected_amount, assigned_to, created_by)
       VALUES (?, ?, ?, 'B', ?, ?, 'internal', 'c_proposal', 'group_order', ?, ?, ?, ?, ?)`,
      [GPM2, 'OPP-202607-0102', null, 'グループ本社 21F 会議室 AV 更新',
       CUSTOMERS[Object.keys(CUSTOMERS)[0]], '2026-07-01', '2026-12-20',
       7200000, USERS.staff2, USERS.admin],
    );

    // 工程（`gpm-1` は 6 段・状態を1つずつ）
    const phaseSql = `INSERT INTO gpm_phases (id, project_id, label, state, started_on, ends_on, role, sort_order) VALUES (?,?,?,?,?,?,?,?)`;
    const phases: [string, string, string, string, string, string, number][] = [
      ['gpm-1-ph1', '発注確定・要件整理', 'done',    '2026-05-12', '2026-05-31', 'PM',   0],
      ['gpm-1-ph2', '個別見積・稟議',     'done',    '2026-06-01', '2026-06-20', 'PM',   1],
      ['gpm-1-ph3', '設計・機材選定',     'doing',   '2026-06-21', '2026-07-31', '技術', 2],
      ['gpm-1-ph4', '調達・工事手配',     'blocked', '2026-08-01', '2026-08-25', 'PM',   3],
      ['gpm-1-ph5', '施工・据付',         'todo',    '2026-08-26', '2026-09-15', '技術', 4],
      ['gpm-1-ph6', '検収・引渡し',       'todo',    '2026-09-16', '2026-09-30', 'PM',   5],
    ];
    for (const [id, label, state, from, to, role, order] of phases) {
      await ins(phaseSql, [id, GPM1, label, state, from, to, role, order]);
    }
    await ins(phaseSql, ['gpm-2-ph1', GPM2, '現地調査・要件整理', 'doing', '2026-07-01', '2026-07-20', 'PM', 0]);
    await ins(phaseSql, ['gpm-2-ph2', GPM2, '基本計画・機器選定', 'todo',  '2026-07-21', '2026-08-10', '技術', 1]);

    /*
      工程の下のタスク。**`project_id` を必ず入れる** (migration 179) —
      NULL のまま入れると「自分のタスク」にも週報にも出ず、
      GPM のタスク一覧 (`JOIN projects`) からも1件も返りません。

      **期限は `due_at` の 18:00**（`gpm_phase_id` を持つタスクの決めごと）。
      1件だけ期限切れにしてあります — 赤く出る行が無いと、期限の色を確かめられません。
    */
    const gTaskSql = `INSERT INTO project_tasks (id, project_id, gpm_phase_id, title, description, is_completed, completed_at, due_at, assigned_to, sort_order, created_by)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
    /** [工程id, 名前, 補足, 完了か, 期限(18:00), 担当, 並び]。**順番を変えるときは型も直す** */
    const gTasks: [string, string, string | null, boolean, string | null, string | null, number][] = [
      ['gpm-1-ph1', '要件のヒアリング（副調の使い方）', null, true,  '2026-05-20T18:00', USERS.staff1, 0],
      ['gpm-1-ph1', '既存設備の棚卸し（型番・年式）',   null, true,  '2026-05-28T18:00', USERS.staff3, 1],
      ['gpm-1-ph2', '個別見積 v2 を出す',              null, true,  '2026-06-18T18:00', USERS.staff1, 0],
      ['gpm-1-ph3', 'カメラ制御盤の型番を確定する',      '代替案を2つ出してから決める', false, '2026-08-05T18:00', USERS.staff1, 0],
      ['gpm-1-ph3', 'モニター壁の割り付け図を引く',      null, false, '2026-08-12T18:00', USERS.staff3, 1],
      ['gpm-1-ph3', '空調の増設範囲をビル側に確認する',  '総務経由。8/5 までに回答をもらう', false, '2026-08-05T18:00', USERS.staff1, 2],
      ['gpm-1-ph4', '中継回線の引込工事を手配する',      null, false, '2026-08-10T18:00', USERS.staff2, 0],
      ['gpm-1-ph4', '主要機材を発注する',               null, false, '2026-08-19T18:00', USERS.staff1, 1],
      ['gpm-1-ph5', '据付の立会日を決める',             null, false, null,                USERS.staff2, 0],
      ['gpm-1-ph6', '検収の項目表を作る',               null, false, null,                null,         0],
      ['gpm-2-ph1', '会議室の現況を撮る',               null, false, '2026-07-15T18:00', USERS.staff2, 0],
      ['gpm-2-ph1', '利用シーンのヒアリング',           null, false, '2026-07-18T18:00', USERS.staff3, 1],
    ];
    let gi = 0;
    for (const [phaseId, title, desc, done, due, who, order] of gTasks) {
      const project = phaseId.startsWith('gpm-1') ? GPM1 : GPM2;
      await ins(gTaskSql, [`gpm-task-${++gi}`, project, phaseId, title, desc, done,
        done ? '2026-06-20T10:00' : null, due, who, order, USERS.admin]);
    }
    // **工程に付いていないタスク**（工程が決まる前のもの）。詳細画面の下の束に出る
    await ins(gTaskSql, ['gpm-task-loose', GPM1, null, '引渡し後の保守契約をどうするか整理する',
      null, false, null, null, USERS.staff1, 0, USERS.admin]);

    // 依存関係（先行→後続・FS）。ガントの矢印と「後続もずらすか」の確認を
    // 画面で確かめるのに最低1本要る。機材の発注は「型番の確定」「割り付け図」の後
    const depSql = `INSERT INTO task_dependencies (id, project_id, predecessor_id, successor_id, created_by) VALUES (?,?,?,?,?)`;
    await ins(depSql, ['gpm-dep-1', GPM1, 'gpm-task-4', 'gpm-task-8', USERS.admin]);
    await ins(depSql, ['gpm-dep-2', GPM1, 'gpm-task-5', 'gpm-task-8', USERS.admin]);

    // ◆ マイルストーン（1日の節目）と、開始日を持つタスクを1つずつ。
    // 無いと ◆ の描画・期間バー（開始〜期限）のガント表示が画面で確かめられない
    await ins(
      `INSERT INTO project_tasks (id, project_id, gpm_phase_id, title, is_completed, due_at, due_date, is_milestone, sort_order, created_by)
       VALUES (?,?,?,?,false,?,?,true,?,?)`,
      ['gpm-task-ms', GPM1, 'gpm-1-ph6', '引渡し', '2026-09-30T18:00', '2026-09-30', 1, USERS.admin],
    );
    await ins(`UPDATE project_tasks SET start_date = ? WHERE id = ?`, ['2026-08-12', 'gpm-task-8']);

    // 未確認事項（返事待ち・確認中・解決を1つずつ）
    const askSql = `INSERT INTO gpm_open_items (id, project_id, phase_id, question, to_kind, to_name, status, blocks, due_date, raised_by, raised_at, resolved_at, resolved_by)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    await ins(askSql, ['gpm-ask-1', GPM1, 'gpm-1-ph3', '副調のモニター壁は据置か可動か（先方判断待ち）',
      'client', 'グループ総務 佐野様', 'waiting', '調達・工事手配', '2026-08-05', USERS.staff1, '2026-08-11T10:00', null, null]);
    await ins(askSql, ['gpm-ask-2', GPM1, 'gpm-1-ph4', '空調の増設はビル側の工事範囲に入るか',
      'pm', 'PM会社 井上様', 'checking', '施工・据付', '2026-08-08', USERS.staff1, '2026-08-12T14:00', null, null]);
    await ins(askSql, ['gpm-ask-3', GPM1, 'gpm-1-ph2', '稟議の決裁者は本部長か部長か',
      'internal', '経営管理部', 'resolved', null, '2026-06-10', USERS.staff1, '2026-06-05T09:00', '2026-06-09T11:00', USERS.staff1]);
    await ins(askSql, ['gpm-ask-4', GPM2, 'gpm-2-ph1', '既存のマイクを流用してよいか',
      'client', 'グループ本社 総務', 'waiting', '基本計画・機器選定', '2026-07-25', USERS.staff2, '2026-07-14T16:00', null, null]);

    // 体制（3段。**同じ `group_label` が1つの箱になる**）
    const memSql = `INSERT INTO gpm_members (id, project_id, user_id, name, org, role, email, side, tier, group_label, badge, sort_order)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
    const members: [string, string | null, string, string, string, string | null, string, string, string, string | null, number][] = [
      ['gpm-mem-1', null,          '佐野様', 'グループ本体 コーポレート', '発注・意思決定', 'sano@example.co.jp', 'client',   'top',  '発注者',        '決裁', 0],
      ['gpm-mem-2', null,          '田中様', 'グループ本体 総務',         '窓口',           null,                 'client',   'top',  '発注者',        null,   1],
      ['gpm-mem-3', null,          '井上様', '日建設計',                   '全体統括',       null,                 'pm',       'lead', 'PM会社',        '進行', 0],
      ['gpm-mem-4', USERS.staff1,  '佐藤 花子', '自社 ／ 技術',            'PM',             'sato@globalstudio.example.com', 'internal', 'lead', '自社',   '議事録', 1],
      ['gpm-mem-5', USERS.staff3,  '高橋 美咲', '自社 ／ 技術',            '設計',           null,                 'internal', 'unit', '設計ユニット',  null,   0],
      ['gpm-mem-6', null,          '山本様',  '音響設備工業',               '施工',           null,                 'vendor',   'unit', '施工ユニット',  null,   1],
    ];
    for (const [id, userId, name, org, role, email, side, tier, group, badge, order] of members) {
      await ins(memSql, [id, GPM1, userId, name, org, role, email, side, tier, group, badge, order]);
    }

    /*
      見積（提出先ごとに1本・migration 173）。**一覧の「見積」の列と
      ダッシュボードの KPI 2枚がここを読みます** — 1本も無いと
      「見積なし」と「0円」の見分けが画面で確かめられません。
      合計 (`subtotal`) は明細から出るので、`recalc` と同じ値を入れてあります。
    */
    const estSql = `INSERT INTO estimates (id, project_id, submit_to, group_id, version, title, status, tax_category, subtotal, discount, sent_at, valid_until, created_by, updated_by)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    await ins(estSql, ['gpm-est-1', GPM1, 'self', 'gpm-est-1', 2,
      '第2副調整室 構築一式（設計・機材・工事）', 'sent', 'tax10', 18400000, 0,
      // `sent_at` は時間帯を持たない列に `NOW()` を入れる運用（＝DB の設定の壁時計。
      // コンテナは UTC）。**JST の日付で書かないこと** — 紙の発行日は UTC → JST に
      // 直して出すので、JST の 17:00 を入れると翌日として出ます（02:00Z = 11:00 JST）
      '2026-06-18T02:00', '2026-07-29', USERS.staff1, USERS.staff1]);
    await ins(estSql, ['gpm-est-2', GPM2, 'client', 'gpm-est-2', 1,
      '21F 会議室 AV 更新一式', 'draft', 'tax10', 7200000, 200000,
      null, null, USERS.staff2, USERS.staff2]);
    /*
      議事録（打合せの録音 → 文字起こし → AI の下書き）。
      **案件と同じ表**（`project_minutes` は `projects` にぶら下がる）。

      **下書きと確定を1件ずつ**入れてあります — 下書きだけだと「AI が書いた印」の
      出方しか確かめられず、確定だけだと直す前の姿が見られません。
      持ち帰りは**印が付いたものと付いていないものを混ぜて**います
      （`ask_id` があると「未確認事項にしました」に変わる）。
    */
    const minSql = `INSERT INTO project_minutes
      (id, project_id, status, title, met_on, attendees, transcript, duration_sec, summary,
       decisions, open_items, next_meeting, model, prompt_version, created_by, confirmed_at, confirmed_by)
      VALUES (?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?,?,?,?,?,?)`;
    await ins(minSql, [
      'gpm-min-1', GPM1, 'confirmed', '第7回 定例（中継回線と引込口）', '2026-07-18',
      '寺井 ・ 井上様（日建） ・ 佐野様',
      '（文字起こし）引込口をどちらにするか… 27F 側で実測してから決めましょう…',
      3120,
      '中継回線の引込口は27F側で進める。実測は7/25までに行い、立会は井上様と寺井で。',
      JSON.stringify([
        { text: '中継回線の引込口は27F側にする', quote: '27F 側で実測してから決めましょう' },
        { text: '実測の立会は井上様と寺井の2名', quote: '立会はお二人でお願いします' },
      ]),
      JSON.stringify([
        { text: '27F の分電盤の空き容量を確認する', owner: '井上様', due: '2026-07-25' },
      ]),
      '2026-08-01', 'gpt-5.6-terra', 'minutes-v3', USERS.staff1, '2026-07-19T10:00', USERS.staff1,
    ]);
    await ins(minSql, [
      'gpm-min-2', GPM1, 'draft', '第8回 定例（副調・空調の扱い）', '2026-08-01',
      '寺井 ・ 中西 ・ 井上様（日建） ・ 佐野様',
      '（文字起こし）副調の空調増設をどちらが手配するか… ビル側の範囲を総務に確認します…',
      3900,
      '副調の空調増設をどちらが手配するかが未決。ビル側の工事範囲を総務が確認し、8/5 までに回答をもらう。',
      JSON.stringify([
        { text: '機材選定は代替案を2つ出したうえで8/8に確定させる', quote: '代替を2案いただいて8/8に決めます' },
      ]),
      JSON.stringify([
        { text: '副調のモニター壁は据置か可動か（先方判断待ち）', owner: '佐野様', due: '2026-08-05' },
        { text: '空調の増設はビル側の工事範囲に入るか', owner: 'グループ総務' },
      ]),
      '2026-08-08', 'gpt-5.6-terra', 'minutes-v3', USERS.staff1, null, null,
    ]);

    const estItemSql = `INSERT INTO estimate_items (id, estimate_id, description, quantity, unit, unit_price, amount, cost, category, sort_order)
                        VALUES (?,?,?,?,?,?,?,?,?,?)`;
    // ⚠️ **分類は画面が持つ3つの鍵だけ**（`EstimateItems.tsx` の `CATEGORIES` =
    // `studio` / `tech` / `other`）。着手時は `production` / `technical` と書いていて、
    // 画面は鍵で3つの帯に振り分けるので**明細が1行も出ていなかった**
    // （合計は `estimates.subtotal` から出るので、金額だけ合っていて中身が空に見える）
    const estItems: [string, string, string, number, string, number, number, number, string, number][] = [
      ['gpm-esti-1', 'gpm-est-1', '設計・監理費',           1, '式',  2400000, 2400000, 1200000, 'other', 0],
      ['gpm-esti-2', 'gpm-est-1', '映像機材（カメラ・スイッチャー）', 1, '式', 9800000, 9800000, 7600000, 'tech', 1],
      ['gpm-esti-3', 'gpm-est-1', '電気・造作工事',         1, '式',  6200000, 6200000, 5100000, 'other', 2],
      ['gpm-esti-4', 'gpm-est-2', '音響設備一式',           1, '式',  4200000, 4200000, 3300000, 'tech', 0],
      ['gpm-esti-5', 'gpm-est-2', '設置・調整',             1, '式',  3000000, 3000000, 2100000, 'other', 1],
    ];
    for (const [id, est, desc, qty, unit, price, amount, cost, cat, order] of estItems) {
      await ins(estItemSql, [id, est, desc, qty, unit, price, amount, cost, cat, order]);
    }
  }

  // サブアプリデータ (Qシート/技術資料/インタラクティブ) は
  // seedSubApps() で投入する（重複防止）

  saveDb();
  console.log('Seed data inserted successfully.');
}

if (require.main === module) {
  runMigrations().then(() => seed()).then(() => closeDb());
}
