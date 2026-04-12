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
  // Qシートドキュメント（常にリセット＆再投入）
  // ============================================================
  console.log('Seeding qsheet_documents (force reset)...');
  await execute('DELETE FROM qsheet_documents', []);
  {
    const qSql = `INSERT INTO qsheet_documents
      (id, title, episode_id, project_id, broadcast_date, status, data, created_by, updated_by)
      VALUES (?,?,?,?,?,?,?,?,?)`;

    // ── 共通ブロック定義 ──────────────────────────────────
    const stdBlocks = [
      { id: 'blk_s1', type: 'scenario',  label: 'シナリオ',   width: 'L', widthPx: 400 },
      { id: 'blk_v1', type: 'video',     label: '映像',       width: 'M', widthPx: 200 },
      { id: 'blk_a1', type: 'audio',     label: '音声',       width: 'S', widthPx: 140 },
      { id: 'blk_t1', type: 'telop',     label: 'テロップ',   width: 'S', widthPx: 140 },
    ];
    const sce = (entries: { name: string; html: string }[]) => ({ entries });
    const row = (dur: string, s1: any, v1: string, a1: string, t1: string) => ({
      duration: dur,
      cells: { blk_s1: s1, blk_v1: v1, blk_a1: a1, blk_t1: t1 },
    });
    const cm = (label: string, dur: string) => ({ _break: true, label, duration: dur, rows: [] });
    const pb = () => ({ _pageBreak: true, label: '', rows: [] });
    // doc3用: 4列目が blk_r1 (remarks)
    const row3 = (dur: string, s1: any, v1: string, a1: string, r1: string) => ({
      duration: dur,
      cells: { blk_s1: s1, blk_v1: v1, blk_a1: a1, blk_r1: r1 },
    });

    // ── Doc 1: GH春季IR説明会 ─────────────────────────────
    if (PA001 && EA001) {
      await ins(qSql, [
        uuidv4(), 'GH春季IR説明会 Qシート', EA001, PA001, '2026-03-28', 'on_air',
        JSON.stringify({
          _version: 1,
          meta: {
            title: 'GH春季IR説明会 Qシート', draftType: '決定稿', draftNumber: 1,
            broadcastDate: '2026-03-28', broadcastStartTime: '13:00:00',
            recordingDate: '2026-03-28', rehearsalDate: '2026-03-27',
            location: '用賀 WORLD STUDIO', author: '田中太郎',
          },
          blocks: stdBlocks,
          masters: {
            persons: ['MC 田中', 'CEO 橋本', 'CFO 村田', '司会 鈴木'],
            video: ['OA映像', '社名ロゴ', 'スライド投影', '収録VTR'],
            audio: ['BGM', 'SE', 'ピンマイク', 'ハンドマイク'],
            telop: ['社名テロップ', '氏名テロップ', 'Q&Aテロップ'],
          },
          sections: [
            {
              label: '【OA】オープニング', duration: '0:05', rows: [
                row('0:05',
                  sce([{ name: 'MC 田中', html: '皆様、本日はGHグループ春季IR説明会にお越しいただきありがとうございます。只今より開会いたします。' }]),
                  'OA映像→社名ロゴ', 'BGM フェードイン', '「GHグループ 春季IR説明会」'),
              ],
            },
            {
              label: '【挨拶】代表取締役ご挨拶', duration: '0:03', rows: [
                row('0:03',
                  sce([
                    { name: 'MC 田中',  html: 'それでは、代表取締役よりご挨拶申し上げます。' },
                    { name: 'CEO 橋本', html: '本日はお集まりいただきありがとうございます。2025年度は皆様のご支援のおかげで…' },
                  ]),
                  '演台フル', 'ピンマイク', '「代表取締役 橋本◯◯」'),
              ],
            },
            cm('転換・SE', '0:01'),
            {
              label: '【説明1】2025年度決算報告', duration: '0:25', rows: [
                row('0:10',
                  sce([{ name: 'CFO 村田', html: '2025年度の決算についてご説明いたします。売上高は前年比110%の◯◯億円、営業利益は◯◯億円となりました。' }]),
                  'スライド（P.1〜P.8）', 'ピンマイク', '「2025年度 決算ハイライト」'),
                row('0:15',
                  sce([{ name: 'CFO 村田', html: 'セグメント別の詳細についてご説明します。主力の◯◯事業においては売上が前期比115%となり…' }]),
                  'スライド（P.9〜P.20）', 'ピンマイク', '「セグメント別業績」'),
              ],
            },
            {
              label: '【説明2】2026年度事業計画', duration: '0:20', rows: [
                row('0:10',
                  sce([{ name: 'CEO 橋本', html: '2026年度の事業計画についてご説明いたします。今期は3つの重点施策を中心に積極的な投資を予定しています。' }]),
                  'スライド（P.21〜P.28）', 'ピンマイク', '「2026年度 事業計画」'),
                row('0:10',
                  sce([{ name: 'CEO 橋本', html: '中期経営計画の進捗と2027年度の目標についてご説明します。VTRをご覧ください。' }]),
                  'スライド+収録VTR', 'ピンマイク', '「中期経営計画」'),
              ],
            },
            cm('休憩', '0:05'),
            {
              label: '【Q&A】質疑応答', duration: '0:20', rows: [
                row('0:20',
                  sce([
                    { name: 'MC 田中',  html: 'それでは質疑応答の時間とさせていただきます。会場のお客様はお手を挙げてください。' },
                    { name: '',         html: '（会場からの質問→登壇者回答）' },
                    { name: 'MC 田中',  html: 'お時間となりましたので質疑応答を終了いたします。' },
                  ]),
                  '会場全景→質問者', 'ハンドマイク巡回', '「Q&A」'),
              ],
            },
            {
              label: '【ED】エンディング・閉会', duration: '0:05', rows: [
                row('0:05',
                  sce([{ name: 'MC 田中', html: '以上をもちまして、GHグループ春季IR説明会を終了いたします。本日はご参加いただきありがとうございました。' }]),
                  '社名ロゴ→暗転', 'BGM フェードイン', '「ありがとうございました」'),
              ],
            },
          ],
          stageTemplates: [],
          sectionTemplates: [],
        }),
        staff1Id, staff1Id,
      ]);
    }

    // ── Doc 2: サイエンス・フロンティア #001 ──────────────
    if (PA002 && EA002) {
      await ins(qSql, [
        uuidv4(), 'サイエンス・フロンティア #001 Qシート', EA002, PA002, '2026-04-07', 'draft',
        JSON.stringify({
          _version: 1,
          meta: {
            title: 'サイエンス・フロンティア #001 Qシート', draftType: '準備稿', draftNumber: 2,
            broadcastDate: '2026-04-07', broadcastStartTime: '10:00:00',
            recordingDate: '2026-04-07', rehearsalDate: '2026-04-06',
            location: '用賀 SKY STUDIO', author: '高橋美咲',
          },
          blocks: stdBlocks,
          masters: {
            persons: ['MC 高橋', 'ゲスト 山田教授', 'ナレーション'],
            video: ['OPタイトルCG', '前回VTR', '取材VTR', '実験映像'],
            audio: ['BGM', 'ラベリアマイク', 'ブームマイク'],
            telop: ['番組タイトル', '氏名テロップ', 'テーマテロップ'],
          },
          sections: [
            {
              label: '【OP】オープニング', duration: '0:03', rows: [
                row('0:03',
                  sce([{ name: 'ナレーション', html: '（ナレーション）驚きの科学の世界へようこそ。サイエンス・フロンティア！' }]),
                  'OPタイトルCG', 'BGM フル', '「サイエンス・フロンティア」'),
              ],
            },
            {
              label: '【VTR1】前回のあらすじ', duration: '0:05', rows: [
                row('0:05',
                  sce([{ name: 'ナレーション', html: '前回は宇宙の起源について学びました。今回は量子コンピュータに迫ります。' }]),
                  '前回VTR 再生', 'BGM ダウン', '「前回のあらすじ」'),
              ],
            },
            {
              label: '【トーク1】テーマ紹介', duration: '0:10', rows: [
                row('0:10',
                  sce([
                    { name: 'MC 高橋',    html: '今回のテーマは「量子コンピュータの現在と未来」。山田教授、よろしくお願いします！' },
                    { name: 'ゲスト 山田教授', html: 'よろしくお願いします。量子コンピュータはこれからの社会を大きく変える技術です…' },
                  ]),
                  'MC・ゲスト2ショット', 'ラベリアマイク', '「量子コンピュータとは」'),
              ],
            },
            cm('CM', '1:00'),
            {
              label: '【VTR2】取材VTR：量子研究所訪問', duration: '0:12', rows: [
                row('0:12',
                  sce([{ name: 'ナレーション', html: '東京大学量子コンピュータ研究所に潜入！研究者の素顔に迫ります。' }]),
                  '取材VTR 再生', 'BGM ダウン', '「取材：量子研究所」'),
              ],
            },
            {
              label: '【トーク2】ゲスト解説・実験', duration: '0:10', rows: [
                row('0:10',
                  sce([
                    { name: 'MC 高橋',    html: 'VTR、いかがでしたか？では実際に実験してみましょう！' },
                    { name: 'ゲスト 山田教授', html: 'こちらが量子ビットを可視化した装置です。見てください…' },
                  ]),
                  '実験映像', 'ラベリアマイク', '「実験：量子ビット」'),
              ],
            },
            {
              label: '【ED】エンディング・次回予告', duration: '0:03', rows: [
                row('0:03',
                  sce([
                    { name: 'MC 高橋',    html: '今日は量子コンピュータの世界を山田教授とともに学びました！' },
                    { name: 'ナレーション', html: '次回は「AIと医療」の最前線に迫ります。お楽しみに！' },
                  ]),
                  'MC締め→次回予告テロップ', 'BGM フェードイン', '「次回予告」'),
              ],
            },
          ],
          stageTemplates: [],
          sectionTemplates: [],
        }),
        staff2Id, staff2Id,
      ]);
    }

    // ── Doc 3: ネットLIVE配信 #001 ────────────────────────
    if (PA003 && EA003) {
      await ins(qSql, [
        uuidv4(), 'ネットLIVE配信 #001 Qシート', EA003, PA003, '2026-04-05', 'on_air',
        JSON.stringify({
          _version: 1,
          meta: {
            title: 'ネットLIVE配信 #001 Qシート', draftType: '決定稿', draftNumber: 1,
            broadcastDate: '2026-04-05', broadcastStartTime: '19:00:00',
            recordingDate: '2026-04-05', rehearsalDate: '2026-04-05',
            location: '用賀 LOUNGE STUDIO', author: '佐藤花子',
          },
          blocks: [
            { id: 'blk_s1', type: 'scenario', label: 'シナリオ', width: 'L', widthPx: 360 },
            { id: 'blk_v1', type: 'video',    label: '映像',     width: 'M', widthPx: 160 },
            { id: 'blk_a1', type: 'audio',    label: '音声',     width: 'S', widthPx: 120 },
            { id: 'blk_r1', type: 'remarks',  label: '備考',     width: 'S', widthPx: 140 },
          ],
          masters: {
            persons: ['MC', 'ゲスト', 'コメンテーター'],
            video: ['YouTube Live', 'OBSスイッチャー', 'ゲスト画面（Zoom）'],
            audio: ['BGM', 'ラベリアマイク'],
            telop: ['配信テロップ', 'チャットテロップ'],
          },
          sections: [
            {
              label: '【OP】オープニング・配信開始', duration: '0:05', rows: [
                row('0:05',
                  sce([
                    { name: 'MC', html: '皆さんこんばんは！ネットLIVE配信 第1回、始まりました！チャットで「こんばんは！」と送ってください。' },
                  ]),
                  'YouTube Live 開始', 'BGM フェードイン', '「配信スタート！」'),
              ],
            },
            {
              label: '【コーナー1】今週のテックニュース', duration: '0:20', rows: [
                row('0:10',
                  sce([
                    { name: 'MC',           html: '今週のテックニュース、第1弾はAI規制法案について！コメンテーターの田村さん、どう見ますか？' },
                    { name: 'コメンテーター', html: 'EU AI規制法の施行により、高リスクAIシステムには事前審査が義務付けられます…' },
                  ]),
                  'OBSスイッチャー', 'ラベリアマイク', '「今週のテックニュース」'),
                row('0:10',
                  sce([
                    { name: 'MC',           html: '第2弾、量子コンピュータの商用化が加速中！IBMが新チップを発表しましたね。' },
                    { name: 'コメンテーター', html: '今回のチップは127量子ビット。実用的な問題解決に近づいてきました…' },
                  ]),
                  'OBSスイッチャー', 'ラベリアマイク', '「量子コンピュータ最新動向」'),
              ],
            },
            {
              label: '【コーナー2】ゲストインタビュー', duration: '0:15', rows: [
                row('0:15',
                  sce([
                    { name: 'MC',    html: '本日のゲストはスタートアップ創業者の山田さんです！リモートでつないでいます。' },
                    { name: 'ゲスト', html: 'よろしくお願いします！私たちはAIを使った農業DXに取り組んでいます…' },
                    { name: 'MC',    html: 'チャットから質問来てますよ、「農業AIの課題は？」' },
                    { name: 'ゲスト', html: 'データ収集が一番の課題です。農家さんとの信頼構築も重要で…' },
                  ]),
                  'ゲスト画面（Zoom）', 'ラベリアマイク', '「ゲスト：山田◯◯氏」'),
              ],
            },
            {
              label: '【コーナー3】チャットQ&A', duration: '0:10', rows: [
                row('0:10',
                  sce([
                    { name: 'MC', html: 'チャットから質問を読み上げます！「プログラミング初心者におすすめの言語は？」…Python一択ですね！' },
                    { name: 'MC', html: '続いて「AIで仕事はなくなりますか？」…なくなるのではなく変わっていくと思います。' },
                  ]),
                  'OBSスイッチャー', 'ラベリアマイク', '「チャットQ&A」'),
              ],
            },
            {
              label: '【ED】次回予告・配信終了', duration: '0:05', rows: [
                row('0:05',
                  sce([
                    { name: 'MC', html: '今日もありがとうございました！次回は来週土曜19時。テーマは「メタバースの最前線」！チャンネル登録よろしく！' },
                  ]),
                  'YouTube Live エンディング', 'BGM フェードイン', '「また来週！」'),
              ],
            },
          ],
          stageTemplates: [],
          sectionTemplates: [],
        }),
        staff3Id, staff3Id,
      ]);
    }

    // ── Doc 4: バラエティ番組テンプレート（スタンドアロン） ─
    await ins(qSql, [
      uuidv4(), 'バラエティ収録 Qシートテンプレート', null, null, '2026-05-10', 'draft',
      JSON.stringify({
        _version: 1,
        meta: {
          title: 'バラエティ収録 Qシートテンプレート', draftType: '準備稿', draftNumber: 1,
          broadcastDate: '2026-05-10', broadcastStartTime: '10:00:00',
          recordingDate: '2026-05-10', rehearsalDate: '2026-05-09',
          location: 'スタジオ', author: '制作部',
        },
        blocks: stdBlocks,
        masters: {
          persons: ['MC', 'ゲストA', 'ゲストB', 'ナレーション'],
          video: ['OPタイトル', 'VTR', 'スライド', 'テロップ送り'],
          audio: ['BGM', 'SE', 'ピンマイク', 'ブームマイク'],
          telop: ['タイトルテロップ', '氏名テロップ', '情報テロップ'],
        },
        sections: [
          {
            label: '【OP】オープニング', duration: '0:05', rows: [
              row('0:05',
                sce([
                  { name: 'ナレーション', html: '（ナレーション）※オープニングナレーション' },
                  { name: 'MC',          html: 'みなさんこんにちは！◯◯へようこそ！今日のゲストはこちら！' },
                ]),
                'OPタイトルCG', 'BGM フル', '「◯◯ #001」'),
            ],
          },
          {
            label: '【コーナー1】トーク', duration: '0:20', rows: [
              row('0:10',
                sce([
                  { name: 'MC',    html: '今日のテーマは「◯◯」ですね。ゲストAさんはいかがですか？' },
                  { name: 'ゲストA', html: '（トーク内容）' },
                ]),
                'MC・ゲスト2ショット', 'ピンマイク', '「コーナー1：トーク」'),
              row('0:10',
                sce([
                  { name: 'MC',    html: 'ゲストBさんはどう思いますか？' },
                  { name: 'ゲストB', html: '（トーク内容）' },
                ]),
                'MC・ゲスト3ショット', 'ピンマイク', ''),
            ],
          },
          cm('CM', '1:00'),
          {
            label: '【VTR】VTR紹介', duration: '0:05', rows: [
              row('0:05',
                sce([{ name: 'ナレーション', html: '（ナレーション）※VTRナレーション' }]),
                'VTR 再生', 'BGM ダウン', '「VTR：◯◯」'),
            ],
          },
          {
            label: '【コーナー2】クイズ・ゲーム', duration: '0:15', rows: [
              row('0:15',
                sce([
                  { name: 'MC',    html: 'それでは問題です！「◯◯はどれでしょう？」正解は…' },
                  { name: 'ゲストA', html: '（回答）' },
                  { name: 'ゲストB', html: '（回答）' },
                ]),
                'テロップ送り', 'SE ブー/ピンポン', '「Q.◯◯はどれ？」'),
            ],
          },
          pb(),
          {
            label: '【ED】エンディング', duration: '0:05', rows: [
              row('0:05',
                sce([
                  { name: 'MC', html: '今日はありがとうございました！また来週もよろしくお願いします！' },
                ]),
                '全員集合ショット→暗転', 'BGM フェードイン', '「またね！」'),
            ],
          },
        ],
        stageTemplates: [],
        sectionTemplates: [],
      }),
      adminId, adminId,
    ]);

    console.log('  qsheet_documents: OK (4件)');
  }

  // ============================================================
  // 技術資料ドキュメント（新DocumentData構造）
  // ============================================================
  if (!hasTechsheet) {
    console.log('Seeding techsheet_documents...');
    const tSql = `INSERT INTO techsheet_documents
      (id, title, project_id, episode_id, production_date, venue, status, data, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`;

    const tsGenId = () => `ts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

    if (PA001 && EA001) {
      await ins(tSql, [
        uuidv4(), 'GH春季IR説明会 技術仕様書', PA001, EA001,
        '2026-03-28', '用賀 WORLD STUDIO', 'confirmed',
        JSON.stringify({
          header: {
            programName: 'GH春季IR説明会 2026',
            broadcastType: 'YouTube Live配信 + 会場スクリーン',
            productionFormat: '4K/59.94p / ステレオ',
            studio: '用賀 WORLD STUDIO',
            circuits: 'YouTube Live (RTMP) / 会場PA出し',
            vtr: 'HyperDeck Studio 4K Pro x2 (収録バックアップ)',
            performers: 'CEO 橋本、CFO 村田、MC 田中',
          },
          staff: {
            td: '佐藤 太郎', sw: '鈴木 一郎', d: ['高橋 美咲'], p: '山田 次郎', ve: '田中 三郎',
            cam: ['鈴木 一郎 (CAM1)', '高橋 美咲 (CAM2)', 'リモート (CAM3)'],
            mix: '渡辺 四郎', aa: ['中村 五郎'], ca: ['小林 六郎'], vtrOp: '加藤 七郎',
            aux: '', ld: '伊藤 八郎', cg: '山本 九郎',
          },
          sheets: [
            {
              id: tsGenId(), type: 'camera', label: 'カメラプラン', enabled: true,
              rows: [
                { id: tsGenId(), number: 'CAM1', model: 'Sony PXW-FX9', lens: 'Sony 24-70mm f/2.8 GM', operator: '鈴木 一郎', position: '演台正面 (センター)', cable: 'SDI 50m → パッチ盤A' },
                { id: tsGenId(), number: 'CAM2', model: 'Sony PXW-FX9', lens: 'Sony 70-200mm f/2.8 GM', operator: '高橋 美咲', position: '客席後方 (全景)', cable: 'SDI 80m → パッチ盤B' },
                { id: tsGenId(), number: 'CAM3', model: 'Sony PXW-FX6', lens: 'Sony 16-35mm f/2.8 GM', operator: 'リモート操作', position: 'ステージ上手 (ロボカメ)', cable: 'SDI 30m → パッチ盤C' },
                { id: tsGenId(), number: 'CAM4', model: 'Sony α7S III', lens: 'Sony 35mm f/1.4 GM', operator: '', position: 'スライド資料キャプチャ (HDMI)', cable: 'HDMI → SDI変換 → SW' },
              ],
            },
            {
              id: tsGenId(), type: 'video', label: '映像系統', enabled: true,
              sections: [{
                id: tsGenId(), label: '映像機器',
                rows: [
                  { id: tsGenId(), item: 'スイッチャー', detail: 'Blackmagic ATEM 4 M/E Constellation 4K', notes: 'M/E1: プログラム / M/E2: 配信用エンコード' },
                  { id: tsGenId(), item: '収録', detail: 'HyperDeck Studio 4K Pro x2 (メイン+バックアップ)', notes: 'ProRes 422 HQ / SSD 2TB' },
                  { id: tsGenId(), item: '配信エンコーダー', detail: 'Blackmagic Web Presenter 4K', notes: 'YouTube Live RTMP (1080p/8Mbps)' },
                  { id: tsGenId(), item: 'モニター', detail: 'Sony BVM-HX3110 x1 / SmallHD Cine 13 x3', notes: 'PGM/PVW/CAM1/CAM2' },
                  { id: tsGenId(), item: 'スクリーン投影', detail: 'Panasonic PT-RZ120J (12000lm)', notes: '会場メインスクリーン 200インチ' },
                ],
              }],
            },
            {
              id: tsGenId(), type: 'audio', label: '音声系統', enabled: true,
              sections: [{
                id: tsGenId(), label: '音声機器',
                rows: [
                  { id: tsGenId(), item: 'ミキサー', detail: 'Yamaha DM7 (48ch)', notes: 'Dante接続' },
                  { id: tsGenId(), item: 'ワイヤレスピンマイク', detail: 'Sennheiser EW-DX x3', notes: 'CEO/CFO/MC用' },
                  { id: tsGenId(), item: '演台マイク', detail: 'Audio-Technica AT4053b グースネック x1', notes: '予備マイク' },
                  { id: tsGenId(), item: '会場ハンドマイク', detail: 'Shure ULXD2/SM58 x2', notes: 'Q&A用巡回' },
                  { id: tsGenId(), item: 'モニタリング', detail: 'Sennheiser IEM G4 x2', notes: 'MC/ディレクター用' },
                  { id: tsGenId(), item: 'PA', detail: '会場常設 JBL VRX932LA x4', notes: '会場PA出し (AES/EBU)' },
                ],
              }],
            },
            {
              id: tsGenId(), type: 'comms', label: '通信系統', enabled: true,
              sections: [{
                id: tsGenId(), label: '通信機器',
                rows: [
                  { id: tsGenId(), item: 'インカムシステム', detail: 'RTS ADAM-M フレーム', notes: '4ワイヤー' },
                  { id: tsGenId(), item: 'CAMチャンネル', detail: 'Ch.1 — 全カメラ + SW', notes: '' },
                  { id: tsGenId(), item: 'Audioチャンネル', detail: 'Ch.2 — 音声 + PA', notes: '' },
                  { id: tsGenId(), item: 'Lightingチャンネル', detail: 'Ch.3 — 照明', notes: '' },
                  { id: tsGenId(), item: 'Directorチャンネル', detail: 'Ch.4 — ディレクター + TD', notes: '最優先' },
                  { id: tsGenId(), item: 'IFB (タレント返し)', detail: 'Sennheiser IEM G4 x2', notes: 'MC/CEO' },
                ],
              }],
            },
          ],
          notes: 'リハーサル: 3/27 13:00-17:00\n本番: 3/28 13:00-15:00\n撤収: 3/28 15:00-18:00\n\n注意事項:\n・YouTube Live配信は12:50からスタンバイ\n・CEOマイクは予備含め2本準備\n・スクリーン投影PCとスイッチャーの切替はSW担当',
        }),
        staff2Id,
      ]);
    }

    if (PA002 && EA002) {
      await ins(tSql, [
        uuidv4(), 'サイエンス・フロンティア 収録 技術仕様書', PA002, EA002,
        '2026-04-07', '用賀 SKY STUDIO', 'draft',
        JSON.stringify({
          header: {
            programName: 'サイエンス・フロンティア #001',
            broadcastType: '東都TV (地上波) / TVer同時配信',
            productionFormat: '4K/29.97p / 5.1ch サラウンド',
            studio: '用賀 SKY STUDIO',
            circuits: '東都TV回線 (SDI) / TVer (HLS)',
            vtr: 'ATEM ISO Recording + 外付SSD',
            performers: 'MC 佐藤、ゲスト: 東京大学 山田教授',
          },
          staff: {
            td: '佐藤 太郎', sw: '鈴木 一郎', d: ['高橋 美咲', '山田 次郎'], p: '田中 三郎', ve: '渡辺 四郎',
            cam: ['鈴木 一郎 (CAM1)', '高橋 美咲 (CAM2)', '固定 (CAM3)'],
            mix: '中村 五郎', aa: ['小林 六郎', '加藤 七郎'], ca: ['伊藤 八郎'], vtrOp: '山本 九郎',
            aux: '松田 十郎', ld: '井上 十一', cg: '木村 十二',
          },
          sheets: [
            {
              id: tsGenId(), type: 'camera', label: 'カメラプラン', enabled: true,
              rows: [
                { id: tsGenId(), number: 'CAM1', model: 'Blackmagic URSA Mini Pro 12K', lens: 'Canon CN-E 50mm T1.3', operator: '鈴木 一郎', position: 'MCバスト (センター)', cable: 'SDI 12G → SW IN1' },
                { id: tsGenId(), number: 'CAM2', model: 'Sony PXW-FX6', lens: 'Sony 24-70mm f/2.8 GM', operator: '高橋 美咲', position: 'ゲスト寄り (下手)', cable: 'SDI 6G → SW IN2' },
                { id: tsGenId(), number: 'CAM3', model: 'Sony PXW-FX6', lens: 'Sony 16-35mm f/2.8 GM', operator: '固定', position: 'セット全景 (上手奥)', cable: 'SDI 6G → SW IN3' },
              ],
            },
            {
              id: tsGenId(), type: 'video', label: '映像系統', enabled: true,
              sections: [{
                id: tsGenId(), label: '映像機器',
                rows: [
                  { id: tsGenId(), item: 'スイッチャー', detail: 'ATEM Mini Extreme ISO', notes: '8入力 / ISO収録対応' },
                  { id: tsGenId(), item: '収録', detail: 'ATEM ISO Recording + Samsung T7 2TB x2', notes: 'ProRes 422 / 全カメラISO + PGM' },
                  { id: tsGenId(), item: 'CG', detail: 'CasparCG Server + カスタムテンプレート', notes: 'テロップ送出: NDI → SW AUX' },
                  { id: tsGenId(), item: 'モニター', detail: 'SmallHD Cine 13 x2 / LILLIPUT 7" x3', notes: 'PGM/PVW + CAM各' },
                ],
              }],
            },
            {
              id: tsGenId(), type: 'audio', label: '音声系統', enabled: true,
              sections: [{
                id: tsGenId(), label: '音声機器',
                rows: [
                  { id: tsGenId(), item: 'ミキサー', detail: 'Yamaha DM7', notes: 'Dante IN/OUT' },
                  { id: tsGenId(), item: 'ラベリアマイク', detail: 'DPA 4060 x2 + Wisycom MCR54', notes: 'MC/ゲスト' },
                  { id: tsGenId(), item: 'ブームマイク', detail: 'Sennheiser MKH416 + ブームポール', notes: '演出効果音拾い' },
                  { id: tsGenId(), item: 'BGM再生', detail: 'QLab 5 (Mac mini)', notes: 'Dante出力' },
                ],
              }],
            },
            {
              id: tsGenId(), type: 'comms', label: '通信系統', enabled: true,
              sections: [{
                id: tsGenId(), label: '通信機器',
                rows: [
                  { id: tsGenId(), item: 'インカム', detail: 'Hollyland Solidcom C1 Pro (4ch, 8台)', notes: 'ワイヤレス' },
                  { id: tsGenId(), item: 'Director ch', detail: 'Ch.1 — D/TD/SW', notes: '' },
                  { id: tsGenId(), item: 'Camera ch', detail: 'Ch.2 — 全カメラ', notes: '' },
                  { id: tsGenId(), item: 'Audio ch', detail: 'Ch.3 — 音声', notes: '' },
                ],
              }],
            },
          ],
          notes: 'リハーサル: 4/6 14:00-18:00\n本番収録: 4/7 10:00-12:00\n\n特記:\n・12K収録はCAM1のみ (後処理でクロップ)\n・CG送出はNDI経由、遅延注意\n・ゲスト到着は9:30予定、メイク室はB棟2F',
        }),
        staff2Id,
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
