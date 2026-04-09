/**
 * seed-subapps.ts
 * 機材管理・Qシート・技術資料・インタラクティブのダミーデータを既存DBに追加するスクリプト。
 * 初回シード後にこれらのテーブルが空の場合に実行してください。
 * サーバー起動時に自動実行されます。
 *
 *   npm run db:seed:subapps -w server
 */

import { v4 as uuidv4 } from 'uuid';
import { initDb, saveDb, closeDb, queryOne, queryAll, execute } from './connection';
import { runMigrations } from './migrate';

async function seedSubApps() {
  await initDb();

  // -------- テーブル存在確認 --------
  const tableExists = async (name: string): Promise<boolean> => {
    const r = await queryOne(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [name]
    );
    return !!r;
  };

  const eqTableOk = await tableExists('equipment_items');
  const qTableOk  = await tableExists('qsheet_documents');
  const tsTableOk = await tableExists('techsheet_documents');
  const evTableOk = await tableExists('interactive_events');

  if (!eqTableOk || !qTableOk || !tsTableOk || !evTableOk) {
    console.warn('[seed-subapps] テーブルが未作成のためスキップ:', {
      equipment_items: eqTableOk, qsheet_documents: qTableOk,
      techsheet_documents: tsTableOk, interactive_events: evTableOk,
    });
    return;
  }

  // -------- 既存データ確認 --------
  const eqCount = await queryOne('SELECT COUNT(*)::int AS c FROM equipment_items');
  const qCount  = await queryOne('SELECT COUNT(*)::int AS c FROM qsheet_documents');
  const tsCount = await queryOne('SELECT COUNT(*)::int AS c FROM techsheet_documents');
  const evCount = await queryOne('SELECT COUNT(*)::int AS c FROM interactive_events');

  const hasEquipment   = (eqCount?.c as number) > 0;
  const hasQsheet      = (qCount?.c  as number) > 0;
  const hasTechsheet   = (tsCount?.c as number) > 0;
  const hasInteractive = (evCount?.c as number) > 0;

  if (hasEquipment && hasQsheet && hasTechsheet && hasInteractive) {
    console.log('Sub-app data already seeded. Skipping.');
    return;
  }

  const ins = (sql: string, params: unknown[]) => execute(sql, params);

  // -------- 既存ユーザー取得 --------
  const admin  = await queryOne("SELECT id FROM users WHERE role='system_admin' LIMIT 1");
  const staffs = await queryAll("SELECT id FROM users WHERE role='staff' ORDER BY name LIMIT 3");
  const adminId  = admin?.id  as string;
  const staff1Id = (staffs[0]?.id ?? adminId) as string;
  const staff2Id = (staffs[1]?.id ?? adminId) as string;
  const staff3Id = (staffs[2]?.id ?? adminId) as string;

  // -------- 既存プロジェクト・エピソード取得 --------
  const getProject = async (gls: string) => {
    const r = await queryOne('SELECT id FROM projects WHERE gls_number=?', [gls]);
    return r?.id as string | undefined;
  };
  const getEpisode = async (code: string) => {
    const r = await queryOne('SELECT id FROM episodes WHERE episode_code=?', [code]);
    return r?.id as string | undefined;
  };

  const PA001 = await getProject('GLS-A001');
  const PA002 = await getProject('GLS-A002');
  const PA003 = await getProject('GLS-A003');
  const EA001 = await getEpisode('GLS-A001-001');
  const EA002 = await getEpisode('GLS-A002-001');
  const EA003 = await getEpisode('GLS-A003-001');

  // ============================================================
  // 機材管理データ
  // ============================================================
  if (!hasEquipment) {
    console.log('Seeding equipment data...');

    // Locations
    const locIds: Record<string, string> = {};
    const locs = [
      { k: 'world',   name: 'ワールドスタジオ',        b: 'A棟', f: '1F', a: 'スタジオ',          o: 1 },
      { k: 'sub',     name: 'ワールドスタジオ サブ',    b: 'A棟', f: '1F', a: 'サブコントロール',    o: 2 },
      { k: 'cam',     name: 'カメラ庫',                b: 'A棟', f: '3F', a: '機材エリア',          o: 3 },
      { k: 'equip',   name: '機材庫',                  b: 'A棟', f: '3F', a: '機材エリア',          o: 4 },
      { k: 'light',   name: '照明庫',                  b: 'A棟', f: '3F', a: '機材エリア',          o: 5 },
      { k: 'audio',   name: '音響庫',                  b: 'A棟', f: '3F', a: '機材エリア',          o: 6 },
      { k: 'server',  name: 'サーバールーム',            b: 'A棟', f: 'B1F', a: 'インフラ',          o: 7 },
      { k: 'edit1',   name: '編集室1',                 b: 'A棟', f: '2F', a: 'ポスプロ',            o: 8 },
    ];
    for (const l of locs) {
      locIds[l.k] = uuidv4();
      await ins(
        'INSERT INTO equipment_locations (id, name, building, floor, area, sort_order) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING',
        [locIds[l.k], l.name, l.b, l.f, l.a, l.o]
      );
    }

    // Categories
    const catIds: Record<string, string> = {};
    const cats = [
      { k: 'camera',   name: 'カメラ',       t: 'both',     o: 1 },
      { k: 'lens',     name: 'レンズ',       t: 'rental',   o: 2 },
      { k: 'lighting', name: '照明',         t: 'both',     o: 3 },
      { k: 'audio',    name: '音響',         t: 'both',     o: 4 },
      { k: 'monitor',  name: 'モニター',     t: 'both',     o: 5 },
      { k: 'switcher', name: 'スイッチャー', t: 'facility', o: 6 },
      { k: 'pc',       name: 'PC・サーバー', t: 'facility', o: 7 },
      { k: 'other',    name: 'その他',       t: 'both',     o: 99 },
    ];
    for (const c of cats) {
      catIds[c.k] = uuidv4();
      await ins(
        'INSERT INTO equipment_categories (id, name, item_type, sort_order) VALUES (?,?,?,?) ON CONFLICT DO NOTHING',
        [catIds[c.k], c.name, c.t, c.o]
      );
    }

    // Equipment items
    const eqSql = `INSERT INTO equipment_items
      (id, eq_code, name, category_id, item_type, unit_number,
       manufacturer, model_number, serial_number,
       acquisition_cost, useful_life, asset_class,
       status, condition, location_detail, is_lendable, created_by, updated_by)
      VALUES (?,?,?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?,?,?)
      ON CONFLICT DO NOTHING`;

    const items = [
      { k:'cam1',    code:'EQ-CAM-001', name:'Sony PXW-FX9',                   cat:'camera',   t:'facility', u:1, mfr:'Sony',        mdl:'PXW-FX9',                    sn:'FX9-2024-001', cost:1980000, life:5, loc:'A棟 3F カメラ庫',     lend:false },
      { k:'cam1b',   code:'EQ-CAM-002', name:'Sony PXW-FX9',                   cat:'camera',   t:'facility', u:2, mfr:'Sony',        mdl:'PXW-FX9',                    sn:'FX9-2024-002', cost:1980000, life:5, loc:'ワールドスタジオ',   lend:false },
      { k:'cam2',    code:'EQ-CAM-003', name:'Sony PXW-FX6',                   cat:'camera',   t:'rental',   u:1, mfr:'Sony',        mdl:'PXW-FX6',                    sn:'FX6-2024-001', cost:650000,  life:5, loc:'A棟 3F カメラ庫',     lend:true  },
      { k:'cam2b',   code:'EQ-CAM-004', name:'Sony PXW-FX6',                   cat:'camera',   t:'rental',   u:2, mfr:'Sony',        mdl:'PXW-FX6',                    sn:'FX6-2024-002', cost:650000,  life:5, loc:'A棟 3F カメラ庫',     lend:true  },
      { k:'cam2c',   code:'EQ-CAM-005', name:'Sony PXW-FX6',                   cat:'camera',   t:'rental',   u:3, mfr:'Sony',        mdl:'PXW-FX6',                    sn:'FX6-2024-003', cost:650000,  life:5, loc:'A棟 3F カメラ庫',     lend:true  },
      { k:'sw1',     code:'EQ-SW-001',  name:'Blackmagic ATEM 4 M/E',          cat:'switcher', t:'facility', u:1, mfr:'Blackmagic',  mdl:'ATEM 4 M/E Constellation 4K',sn:'ATEM4ME-001',  cost:4500000, life:7, loc:'サブコントロール',   lend:false },
      { k:'sw2',     code:'EQ-SW-002',  name:'Blackmagic ATEM Mini Extreme ISO',cat:'switcher', t:'rental',   u:1, mfr:'Blackmagic',  mdl:'ATEM Mini Extreme ISO',      sn:'AMEI-001',     cost:180000,  life:5, loc:'A棟 3F 機材庫',       lend:true  },
      { k:'sw2b',    code:'EQ-SW-003',  name:'Blackmagic ATEM Mini Extreme ISO',cat:'switcher', t:'rental',   u:2, mfr:'Blackmagic',  mdl:'ATEM Mini Extreme ISO',      sn:'AMEI-002',     cost:180000,  life:5, loc:'A棟 3F 機材庫',       lend:true  },
      { k:'mon1',    code:'EQ-MON-001', name:'Sony BVM-HX3110',                cat:'monitor',  t:'facility', u:1, mfr:'Sony',        mdl:'BVM-HX3110',                 sn:'HX3110-001',   cost:3200000, life:7, loc:'ワールドスタジオ サブ',lend:false },
      { k:'mon2',    code:'EQ-MON-002', name:'SmallHD Cine 13',               cat:'monitor',  t:'rental',   u:1, mfr:'SmallHD',     mdl:'Cine 13',                    sn:'SHD-C13-001',  cost:480000,  life:5, loc:'A棟 3F 機材庫',       lend:true  },
      { k:'mon2b',   code:'EQ-MON-003', name:'SmallHD Cine 13',               cat:'monitor',  t:'rental',   u:2, mfr:'SmallHD',     mdl:'Cine 13',                    sn:'SHD-C13-002',  cost:480000,  life:5, loc:'A棟 3F 機材庫',       lend:true  },
      { k:'light1',  code:'EQ-LT-001',  name:'ARRI SkyPanel S60-C',            cat:'lighting', t:'facility', u:1, mfr:'ARRI',        mdl:'SkyPanel S60-C',             sn:'ARRI-S60-001', cost:750000,  life:7, loc:'ワールドスタジオ',   lend:false },
      { k:'light2',  code:'EQ-LT-002',  name:'Aputure 600d Pro',              cat:'lighting', t:'rental',   u:1, mfr:'Aputure',     mdl:'600d Pro',                   sn:'APT-600D-001', cost:280000,  life:5, loc:'A棟 3F 照明庫',       lend:true  },
      { k:'light2b', code:'EQ-LT-003',  name:'Aputure 600d Pro',              cat:'lighting', t:'rental',   u:2, mfr:'Aputure',     mdl:'600d Pro',                   sn:'APT-600D-002', cost:280000,  life:5, loc:'A棟 3F 照明庫',       lend:true  },
      { k:'mic1',    code:'EQ-AU-001',  name:'Sennheiser MKH416',              cat:'audio',    t:'rental',   u:1, mfr:'Sennheiser',  mdl:'MKH416',                     sn:'MKH416-001',   cost:120000,  life:7, loc:'A棟 3F 音響庫',       lend:true  },
      { k:'mic1b',   code:'EQ-AU-002',  name:'Sennheiser MKH416',              cat:'audio',    t:'rental',   u:2, mfr:'Sennheiser',  mdl:'MKH416',                     sn:'MKH416-002',   cost:120000,  life:7, loc:'A棟 3F 音響庫',       lend:true  },
      { k:'mixer1',  code:'EQ-AU-003',  name:'Yamaha DM7',                     cat:'audio',    t:'facility', u:1, mfr:'Yamaha',      mdl:'DM7',                        sn:'DM7-001',      cost:3800000, life:10,loc:'ワールドスタジオ サブ',lend:false },
      { k:'srv1',    code:'EQ-PC-001',  name:'Dell PowerEdge R760',            cat:'pc',       t:'facility', u:1, mfr:'Dell',        mdl:'PowerEdge R760',             sn:'SRV-R760-001', cost:1200000, life:5, loc:'サーバールーム',     lend:false },
      { k:'lens1',   code:'EQ-LN-001',  name:'Canon CN-E 50mm T1.3',           cat:'lens',     t:'rental',   u:1, mfr:'Canon',       mdl:'CN-E 50mm T1.3 L F',        sn:'CNE50-001',    cost:450000,  life:7, loc:'A棟 3F カメラ庫',     lend:true  },
    ];

    const eqIds: Record<string, string> = {};
    for (const i of items) {
      eqIds[i.k] = uuidv4();
      await ins(eqSql, [
        eqIds[i.k], i.code, i.name, catIds[i.cat], i.t, i.u,
        i.mfr, i.mdl, i.sn,
        i.cost, i.life, 'fixed_asset',
        'active', 'good', i.loc, i.lend ? 1 : 0, adminId, adminId,
      ]);
    }

    console.log('  equipment_items: OK');
  }

  // ============================================================
  // Qシートドキュメント
  // ============================================================
  if (!hasQsheet) {
    console.log('Seeding qsheet_documents...');
    const qSql = `INSERT INTO qsheet_documents
      (id, title, episode_id, project_id, broadcast_date, status, data, created_by, updated_by)
      VALUES (?,?,?,?,?,?,?,?,?)`;

    if (PA001 && EA001) {
      await ins(qSql, [
        uuidv4(), 'GH春季IR説明会 Qシート', EA001, PA001, '2026-03-28', 'confirmed',
        JSON.stringify({
          rows: [
            { id: '1', time: '13:00', duration: '5',  item: 'OA',   content: 'オープニングアニメーション', cast: '',        notes: 'CG再生' },
            { id: '2', time: '13:05', duration: '3',  item: '挨拶',  content: '代表取締役ご挨拶',          cast: '代表取締役', notes: '演台マイク' },
            { id: '3', time: '13:08', duration: '25', item: '説明',  content: '2025年度決算報告',           cast: 'CFO 田村氏', notes: 'スライド投影' },
            { id: '4', time: '13:33', duration: '20', item: '説明',  content: '2026年度事業計画',           cast: 'CEO',       notes: 'スライド+動画' },
            { id: '5', time: '13:53', duration: '2',  item: '休憩',  content: '休憩',                      cast: '',          notes: '' },
            { id: '6', time: '13:55', duration: '20', item: 'Q&A',  content: '質疑応答',                   cast: '登壇者全員', notes: '会場マイク巡回' },
            { id: '7', time: '14:15', duration: '5',  item: 'ED',   content: 'エンディング・閉会挨拶',      cast: '司会',      notes: '' },
          ],
        }),
        staff1Id, staff1Id,
      ]);
    }

    if (PA002 && EA002) {
      await ins(qSql, [
        uuidv4(), 'サイエンス・フロンティア #001 Qシート', EA002, PA002, '2026-04-07', 'draft',
        JSON.stringify({
          rows: [
            { id: '1', time: '10:00', duration: '3',  item: 'OP',    content: 'オープニングタイトル',                  cast: '',            notes: 'CG' },
            { id: '2', time: '10:03', duration: '5',  item: 'VTR',   content: '前回のあらすじ',                        cast: 'ナレーション', notes: 'VTR再生' },
            { id: '3', time: '10:08', duration: '15', item: 'トーク', content: '今回のテーマ紹介「量子コンピュータの現在」', cast: 'MC 高橋・ゲスト教授', notes: '' },
            { id: '4', time: '10:23', duration: '12', item: 'VTR',   content: '取材VTR：量子研究所訪問',               cast: '',            notes: 'VTR再生' },
            { id: '5', time: '10:35', duration: '10', item: 'トーク', content: 'ゲスト解説・実験コーナー',               cast: 'MC・教授',    notes: '実験セットあり' },
            { id: '6', time: '10:45', duration: '3',  item: 'ED',    content: 'エンディング・次回予告',                  cast: 'MC',          notes: '' },
          ],
        }),
        staff2Id, staff2Id,
      ]);
    }

    if (PA003 && EA003) {
      await ins(qSql, [
        uuidv4(), 'ネットLIVE配信 #001 Qシート', EA003, PA003, '2026-04-05', 'confirmed',
        JSON.stringify({
          rows: [
            { id: '1', time: '19:00', duration: '5',  item: 'OP',      content: 'オープニング・配信開始', cast: 'MC',            notes: 'YouTube Live開始' },
            { id: '2', time: '19:05', duration: '20', item: 'コーナー1', content: '今週のテックニュース',   cast: 'MC・コメンテーター', notes: '' },
            { id: '3', time: '19:25', duration: '15', item: 'コーナー2', content: 'ゲストインタビュー',     cast: 'ゲスト',        notes: 'リモート出演' },
            { id: '4', time: '19:40', duration: '10', item: 'コーナー3', content: 'チャットQ&A',           cast: 'MC',            notes: 'チャット読み上げ' },
            { id: '5', time: '19:50', duration: '5',  item: 'ED',       content: '次回予告・配信終了',      cast: 'MC',            notes: '' },
          ],
        }),
        staff3Id, staff3Id,
      ]);
    }

    // スタンドアロンQシート（プロジェクト未紐付け）
    await ins(qSql, [
      uuidv4(), 'バラエティ番組 収録Qシート（テンプレ）', null, null, '2026-05-10', 'draft',
      JSON.stringify({
        rows: [
          { id: '1', time: '09:00', duration: '30', item: '仕込み',  content: 'セット設置・カメラ設定',     cast: '技術スタッフ', notes: '' },
          { id: '2', time: '09:30', duration: '30', item: 'リハーサル', content: '進行確認・通し稽古',       cast: '出演者・スタッフ', notes: '' },
          { id: '3', time: '10:00', duration: '5',  item: 'OP',     content: 'オープニング',               cast: 'MC',          notes: '' },
          { id: '4', time: '10:05', duration: '20', item: 'コーナー1', content: 'トーク',                  cast: 'MC・ゲスト',  notes: '' },
          { id: '5', time: '10:25', duration: '5',  item: 'VTR',    content: 'VTR紹介',                   cast: '',            notes: '' },
          { id: '6', time: '10:30', duration: '15', item: 'コーナー2', content: 'クイズ',                  cast: 'MC・ゲスト',  notes: '' },
          { id: '7', time: '10:45', duration: '5',  item: 'ED',     content: 'エンディング',               cast: 'MC',          notes: '' },
          { id: '8', time: '10:50', duration: '10', item: '撤収',   content: '機材撤収・確認',              cast: '技術スタッフ', notes: '' },
        ],
      }),
      adminId, adminId,
    ]);

    console.log('  qsheet_documents: OK');
  }

  // ============================================================
  // 技術資料ドキュメント
  // ============================================================
  if (!hasTechsheet) {
    console.log('Seeding techsheet_documents...');
    const tSql = `INSERT INTO techsheet_documents
      (id, title, project_id, episode_id, production_date, venue, status, data, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`;

    if (PA001 && EA001) {
      await ins(tSql, [
        uuidv4(), 'GH春季IR説明会 技術仕様書', PA001, EA001,
        '2026-03-28', '用賀 WORLD STUDIO', 'confirmed',
        JSON.stringify({
          cameras: [
            { position: 'CAM1', model: 'Sony PXW-FX9',  lens: '24-70mm',   operator: '鈴木一郎', notes: '演台メインカメラ' },
            { position: 'CAM2', model: 'Sony PXW-FX9',  lens: '70-200mm',  operator: '高橋美咲', notes: '会場全景' },
            { position: 'CAM3', model: 'Sony PXW-FX6',  lens: '16-35mm',   operator: '',         notes: 'ロボカメ（リモート操作）' },
          ],
          video: {
            switcher: 'ATEM 4 M/E Constellation 4K',
            format: '4K/59.94p',
            recording: 'HyperDeck Studio 4K Pro',
            streaming: 'YouTube Live (1080p)',
          },
          audio: {
            mixer: 'Yamaha DM7',
            mics: ['ワイヤレスピンマイク x3', '演台グースネック x1', '会場ハンドマイク x2'],
            monitoring: 'IEM x2',
          },
          comms: { system: 'RTS ADAM-M', channels: ['CAM', 'Audio', 'Lighting', 'Director'] },
        }),
        staff2Id,
      ]);
    }

    if (PA002 && EA002) {
      await ins(tSql, [
        uuidv4(), 'サイエンス・フロンティア 収録 技術仕様書', PA002, EA002,
        '2026-04-07', '用賀 SKY STUDIO', 'draft',
        JSON.stringify({
          cameras: [
            { position: 'CAM1', model: 'Blackmagic URSA Mini Pro 12K', lens: 'Canon CN-E 50mm', operator: '鈴木一郎', notes: 'メインカメラ' },
            { position: 'CAM2', model: 'Sony PXW-FX6', lens: '24-70mm',   operator: '高橋美咲', notes: 'ゲスト寄り' },
            { position: 'CAM3', model: 'Sony PXW-FX6', lens: '16-35mm',   operator: '',         notes: 'セット全景（固定）' },
          ],
          video: {
            switcher: 'ATEM Mini Extreme ISO',
            format: '4K/29.97p',
            recording: 'ATEM ISO Recording + SSD',
            streaming: '',
          },
          audio: {
            mixer: 'Yamaha DM7',
            mics: ['ラベリアマイク x2', 'ブームマイク x1', 'ガンマイク MKH416 x1'],
            monitoring: '',
          },
          comms: { system: 'インカム 4ch', channels: ['Director', 'Camera', 'Audio'] },
        }),
        staff2Id,
      ]);
    }

    if (PA003 && EA003) {
      await ins(tSql, [
        uuidv4(), 'ネットLIVE配信 #001 技術仕様書', PA003, EA003,
        '2026-04-05', '用賀 LOUNGE STUDIO', 'confirmed',
        JSON.stringify({
          cameras: [
            { position: 'CAM1', model: 'Sony PXW-FX6', lens: '24-70mm', operator: '佐藤花子', notes: 'MC正面' },
            { position: 'CAM2', model: 'Sony PXW-FX6', lens: '35mm',    operator: '',         notes: 'ゲスト用（固定）' },
          ],
          video: {
            switcher: 'ATEM Mini Pro ISO',
            format: 'FHD/59.94p',
            recording: 'ATEM Disk Recording',
            streaming: 'YouTube Live 1080p / 配信エンコーダー: OBS',
          },
          audio: {
            mixer: 'TASCAM Model 24',
            mics: ['ラベリアマイク x2', 'ブームマイク x1'],
            monitoring: 'モニタースピーカー x2',
          },
          comms: { system: 'インカム 2ch', channels: ['Director', 'Camera'] },
        }),
        staff3Id,
      ]);
    }

    console.log('  techsheet_documents: OK');
  }

  // ============================================================
  // インタラクティブ演出イベント・スタンプ
  // ============================================================
  if (!hasInteractive) {
    console.log('Seeding interactive_events...');
    const evSql = `INSERT INTO interactive_events
      (id, title, description, status, project_id, episode_id, config, max_connections, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`;
    const stSql = `INSERT INTO interactive_stamps
      (id, event_id, label, emoji, color, animation, sort_order, is_active)
      VALUES (?,?,?,?,?,?,?,?)`;

    // イベント1: IR説明会
    if (PA001 && EA001) {
      const ev1 = uuidv4();
      await ins(evSql, [
        ev1, 'GH春季IR説明会 リアクション', 'IR説明会のリアルタイムリアクション収集',
        'draft', PA001, EA001,
        JSON.stringify({ theme: 'corporate', showCount: true }),
        500, staff1Id,
      ]);
      await ins(stSql, [uuidv4(), ev1, 'なるほど', '💡', '#3b82f6', 'bounce', 1, true]);
      await ins(stSql, [uuidv4(), ev1, 'いいね',   '👍', '#22c55e', 'bounce', 2, true]);
      await ins(stSql, [uuidv4(), ev1, '質問',     '❓', '#f59e0b', 'pop',    3, true]);
      await ins(stSql, [uuidv4(), ev1, 'すごい',   '🎉', '#ec4899', 'shake',  4, true]);
    }

    // イベント2: ネット生配信
    if (PA003 && EA003) {
      const ev2 = uuidv4();
      await ins(evSql, [
        ev2, 'ネットLIVE配信 #001 スタンプ', '視聴者参加型リアクションスタンプ',
        'draft', PA003, EA003,
        JSON.stringify({ theme: 'fun', showCount: true, allowAnonymous: true }),
        2000, staff3Id,
      ]);
      await ins(stSql, [uuidv4(), ev2, '笑',   '😂', '#f59e0b', 'shake',  1, true]);
      await ins(stSql, [uuidv4(), ev2, '拍手',  '👏', '#22c55e', 'bounce', 2, true]);
      await ins(stSql, [uuidv4(), ev2, 'ハート', '❤️', '#ef4444', 'pop',    3, true]);
      await ins(stSql, [uuidv4(), ev2, '驚き',  '😮', '#8b5cf6', 'bounce', 4, true]);
      await ins(stSql, [uuidv4(), ev2, '炎',    '🔥', '#f97316', 'shake',  5, true]);
    }

    // イベント3: デモ用（プロジェクト未紐付け）
    const ev3 = uuidv4();
    await ins(evSql, [
      ev3, 'デモ・テストイベント', 'スタンプ演出のデモ用イベント',
      'draft', null, null,
      JSON.stringify({ theme: 'fun', showCount: true }),
      100, adminId,
    ]);
    await ins(stSql, [uuidv4(), ev3, 'ナイス',   '👌', '#3b82f6', 'bounce', 1, true]);
    await ins(stSql, [uuidv4(), ev3, 'ありがとう', '🙏', '#ec4899', 'pop',    2, true]);
    await ins(stSql, [uuidv4(), ev3, '面白い',   '😄', '#f59e0b', 'shake',  3, true]);
    await ins(stSql, [uuidv4(), ev3, '感動',     '😢', '#8b5cf6', 'bounce', 4, true]);

    console.log('  interactive_events + stamps: OK');
  }

  saveDb();
  console.log('Sub-app seed data inserted successfully.');
}

if (require.main === module) {
  runMigrations().then(() => seedSubApps()).then(() => closeDb()).catch(console.error);
}

export { seedSubApps };
