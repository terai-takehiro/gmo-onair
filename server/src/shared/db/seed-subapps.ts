/**
 * seed-subapps.ts
 * 機材管理・Qシートのダミーデータを既存DBに追加するスクリプト。
 * 初回シード後にこれらのテーブルが空の場合に実行してください。
 * サーバー起動時に自動実行されます。
 *
 * 技術資料アプリの削除（migration 211）で `techsheet_documents` のシードは外した。
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

  if (!eqTableOk || !qTableOk) {
    console.warn('[seed-subapps] テーブルが未作成のためスキップ:', {
      equipment_items: eqTableOk, qsheet_documents: qTableOk,
    });
    return;
  }

  // -------- 既存データ確認 --------
  const eqCount = await queryOne('SELECT COUNT(*)::int AS c FROM equipment_items');
  const qCount  = await queryOne('SELECT COUNT(*)::int AS c FROM qsheet_documents');

  const hasEquipment   = (eqCount?.c as number) > 0;
  const hasQsheet      = (qCount?.c  as number) > 0;

  if (hasEquipment && hasQsheet) {
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

    // Equipment manufacturers マスタ
    const mfgSql = `INSERT INTO equipment_manufacturers (id, name, sort_order) VALUES (?,?,?) ON CONFLICT (name) DO NOTHING`;
    const mfgMap: Record<string, string> = {};
    for (const [i, name] of ['Sony', 'Canon', 'Blackmagic', 'SmallHD', 'ARRI', 'Aputure', 'Sennheiser', 'Yamaha', 'Dell', 'VIDEOTRON', 'CANARE'].entries()) {
      const id = uuidv4();
      await ins(mfgSql, [id, name, i + 1]);
      // 既存があった場合は再取得
      const existing = await queryOne('SELECT id FROM equipment_manufacturers WHERE name = ?', [name]) as any;
      mfgMap[name] = existing?.id || id;
    }

    // Equipment items — 新スキーマ (equipment_section = equipment/rental)
    const eqSql = `INSERT INTO equipment_items
      (id, eq_code, name, unit_number,
       manufacturer_id, model_number, serial_number,
       asset_class, status, condition, location_detail,
       branch_code, fixed_asset_code, depreciation_years,
       equipment_section, equipment_type_code, location_code,
       purchased_at, warranty_years,
       created_by, updated_by)
      VALUES (?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?, ?,?,?, ?,?, ?,?)
      ON CONFLICT DO NOTHING`;

    const items = [
      { k:'cam1',   code:'Y-C-000001', name:'Sony PXW-FX9',                     u:1, mfr:'Sony',       mdl:'PXW-FX9',                    sn:'FX9-2024-001', loc:'A棟 3F カメラ庫',     sec:'equipment', tc:'C',  lc:'Y', fac:'052312-001', dep:5, purchased:'2024-04-01', warr:2 },
      { k:'cam1b',  code:'Y-C-000002', name:'Sony PXW-FX9',                     u:2, mfr:'Sony',       mdl:'PXW-FX9',                    sn:'FX9-2024-002', loc:'ワールドスタジオ',   sec:'equipment', tc:'C',  lc:'Y', fac:'052312-002', dep:5, purchased:'2024-04-01', warr:2 },
      { k:'cam2',   code:'Y-C-000003', name:'Sony PXW-FX6',                     u:1, mfr:'Sony',       mdl:'PXW-FX6',                    sn:'FX6-2024-001', loc:'A棟 3F カメラ庫',     sec:'rental',    tc:'C',  lc:'Y', fac:'052312-003', dep:5, purchased:'2024-04-01', warr:2 },
      { k:'cam2b',  code:'Y-C-000004', name:'Sony PXW-FX6',                     u:2, mfr:'Sony',       mdl:'PXW-FX6',                    sn:'FX6-2024-002', loc:'A棟 3F カメラ庫',     sec:'rental',    tc:'C',  lc:'Y', fac:'052312-004', dep:5, purchased:'2024-04-01', warr:2 },
      { k:'sw1',    code:'Y-V-000001', name:'Blackmagic ATEM 4 M/E',            u:1, mfr:'Blackmagic', mdl:'ATEM 4 M/E Constellation 4K',sn:'ATEM4ME-001',  loc:'サブコントロール',   sec:'equipment', tc:'V',  lc:'Y', fac:'052312-101', dep:7, purchased:'2023-10-01', warr:3 },
      { k:'sw2',    code:'Y-V-000002', name:'Blackmagic ATEM Mini Extreme ISO', u:1, mfr:'Blackmagic', mdl:'ATEM Mini Extreme ISO',      sn:'AMEI-001',     loc:'A棟 3F 機材庫',       sec:'rental',    tc:'V',  lc:'Y', fac:'',           dep:0, purchased:'2024-04-01', warr:1 },
      { k:'mon1',   code:'Y-V-000003', name:'Sony BVM-HX3110',                  u:1, mfr:'Sony',       mdl:'BVM-HX3110',                 sn:'HX3110-001',   loc:'ワールドスタジオ サブ', sec:'equipment', tc:'V',  lc:'Y', fac:'052312-102', dep:7, purchased:'2023-10-01', warr:3 },
      { k:'light1', code:'Y-L-000001', name:'ARRI SkyPanel S60-C',              u:1, mfr:'ARRI',       mdl:'SkyPanel S60-C',             sn:'ARRI-S60-001', loc:'ワールドスタジオ',   sec:'equipment', tc:'L',  lc:'Y', fac:'052312-201', dep:7, purchased:'2024-04-01', warr:2 },
      { k:'light2', code:'Y-L-000002', name:'Aputure 600d Pro',                 u:1, mfr:'Aputure',    mdl:'600d Pro',                   sn:'APT-600D-001', loc:'A棟 3F 照明庫',       sec:'rental',    tc:'L',  lc:'Y', fac:'052312-202', dep:5, purchased:'2024-04-01', warr:2 },
      { k:'mic1',   code:'Y-A-000001', name:'Sennheiser MKH416',                u:1, mfr:'Sennheiser', mdl:'MKH416',                     sn:'MKH416-001',   loc:'A棟 3F 音響庫',       sec:'rental',    tc:'A',  lc:'Y', fac:'052312-301', dep:7, purchased:'2024-04-01', warr:2 },
      { k:'mixer1', code:'Y-A-000002', name:'Yamaha DM7',                       u:1, mfr:'Yamaha',     mdl:'DM7',                        sn:'DM7-001',      loc:'ワールドスタジオ サブ', sec:'equipment', tc:'A',  lc:'Y', fac:'052312-302', dep:10,purchased:'2023-10-01', warr:3 },
      { k:'srv1',   code:'Y-NW-000001',name:'Dell PowerEdge R760',              u:1, mfr:'Dell',       mdl:'PowerEdge R760',             sn:'SRV-R760-001', loc:'サーバールーム',     sec:'equipment', tc:'NW', lc:'Y', fac:'052312-401', dep:5, purchased:'2024-04-01', warr:3 },
      { k:'cable1', code:'Y-V-000004', name:'HDMIケーブル 3m',                  u:1, mfr:'CANARE',     mdl:'HDM03',                      sn:'',             loc:'A棟 3F 機材庫',       sec:'rental',    tc:'V',  lc:'Y', fac:'',           dep:0, purchased:'2024-04-01', warr:0 },
    ];

    const eqIds: Record<string, string> = {};
    for (const i of items) {
      eqIds[i.k] = uuidv4();
      await ins(eqSql, [
        eqIds[i.k], i.code, i.name, i.u,
        mfgMap[i.mfr] || null, i.mdl, i.sn,
        'fixed_asset', 'active', 'good', i.loc,
        'GMO-IG', i.fac, i.dep,
        i.sec, i.tc, i.lc,
        i.purchased, i.warr,
        adminId, adminId,
      ]);
    }

    console.log('  equipment_items: OK (新スキーマ対応)');
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

    // ── Doc 4: バラエティ番組（スタンドアロン・リアルなタイムスケジュール） ─
    await ins(qSql, [
      uuidv4(), 'GMOスタジオ情報バラエティ #001', null, null, '2026-05-10', 'draft',
      JSON.stringify({
        _version: 1,
        meta: {
          title: 'GMOスタジオ情報バラエティ #001', draftType: '準備稿', draftNumber: 2,
          broadcastDate: '2026-05-10', broadcastStartTime: '19:00:00',
          recordingDate: '2026-05-08', rehearsalDate: '2026-05-07',
          location: '用賀 WORLD STUDIO', author: '高橋 美咲',
        },
        blocks: stdBlocks,
        masters: {
          persons: ['MC 佐藤', 'アシ 鈴木', 'ゲスト 山田教授', 'ゲスト 田中シェフ', 'NA'],
          video: ['OPタイトルCG', 'VTR', 'スライド', 'テロップ送り', 'CM明けアイキャッチ', 'EDロール'],
          audio: ['BGM-OP', 'BGM-トーク', 'BGM-クイズ', 'BGM-ED', 'SE-正解', 'SE-不正解', 'SE-ジングル'],
          telop: ['番組タイトル', '氏名テロップ', '情報テロップ', 'クイズ出題', '正解発表', '次回予告'],
        },
        sections: [
          {
            label: '【OP】オープニング', duration: '2:30', rows: [
              row('0:30',
                sce([{ name: 'NA', html: '毎週土曜よる7時！知って得する情報満載！GMOスタジオ情報バラエティ！' }]),
                'OPタイトルCG → スタジオ全景', 'BGM-OP フル → フェードダウン', '「GMOスタジオ情報バラエティ #001」'),
              row('1:00',
                sce([
                  { name: 'MC 佐藤', html: '皆さんこんばんは！GMOスタジオ情報バラエティ、MCの佐藤です！' },
                  { name: 'アシ 鈴木', html: 'アシスタントの鈴木です！今日も楽しい1時間にしましょう！' },
                ]),
                'MC 2ショット → ゲスト席パン', 'ピンマイク MC+アシ / BGM-トーク BED', '「MC 佐藤太郎」「鈴木花子」'),
              row('1:00',
                sce([
                  { name: 'MC 佐藤', html: '今日のゲストをご紹介します！まずは東京大学の山田教授！' },
                  { name: 'ゲスト 山田教授', html: 'よろしくお願いします。今日は面白い話をたくさん持ってきました。' },
                  { name: 'MC 佐藤', html: 'そしてイタリアン料理研究家の田中シェフ！' },
                  { name: 'ゲスト 田中シェフ', html: 'こんばんは！今日は春の食材を使った簡単レシピもご紹介しますよ。' },
                ]),
                'ゲスト寄り → MC+ゲスト4ショット', 'ピンマイク ゲスト ON', '「東京大学 山田教授」「料理研究家 田中シェフ」'),
            ],
          },
          {
            label: '【コーナー1】最新ニュース深掘り', duration: '8:00', rows: [
              row('0:30',
                sce([
                  { name: 'MC 佐藤', html: '最初のコーナーは「最新ニュース深掘り」！今週気になったニュースを専門家と一緒に解説します。' },
                ]),
                'MC バスト / コーナータイトルCG', 'SE-ジングル → BGM-トーク BED', '「最新ニュース深掘り」'),
              row('2:30',
                sce([
                  { name: 'NA', html: '（VTRナレーション）今週、注目を集めたのは宇宙開発の新たな一歩。民間企業による月面着陸計画が発表されました。' },
                ]),
                'VTR 再生「宇宙開発最前線」', 'VTR音声 / BGMダウン', '「VTR: 宇宙開発最前線」'),
              row('5:00',
                sce([
                  { name: 'MC 佐藤', html: 'はい、VTRにもありましたが山田教授、この計画の実現性はいかがでしょう？' },
                  { name: 'ゲスト 山田教授', html: '非常に興味深いですね。従来のNASAの計画と比較すると、コストが約1/10に抑えられています。これは再利用型ロケットの技術革新によるもので…' },
                  { name: 'MC 佐藤', html: '私たちの生活にはどんな影響がありそうですか？' },
                  { name: 'ゲスト 山田教授', html: '実は通信技術や素材技術など、宇宙開発の副産物は既に日常生活に溢れています。例えば…' },
                  { name: 'アシ 鈴木', html: 'へえ！全然知りませんでした！' },
                ]),
                'MC+山田教授 2ショット / スライド投影', 'ピンマイク / BGM-トーク BED', '「民間宇宙開発のインパクト」「技術の波及効果」'),
            ],
          },
          cm('CM①', '3:00'),
          {
            label: '【コーナー2】春の簡単レシピ', duration: '10:00', rows: [
              row('0:30',
                sce([
                  { name: 'MC 佐藤', html: 'CM明けまして、続いてのコーナーは「春の簡単レシピ」！田中シェフ、今日は何を作っていただけるんですか？' },
                  { name: 'ゲスト 田中シェフ', html: '今日は旬の新玉ねぎを使った「新玉ねぎの丸ごとグラタン」を作ります！15分でできますよ。' },
                ]),
                'CM明けアイキャッチ → MC+シェフ 2ショット', 'SE-ジングル → BGM-トーク BED', '「春の簡単レシピ」'),
              row('7:00',
                sce([
                  { name: 'ゲスト 田中シェフ', html: 'まず新玉ねぎの上部を切り落として、十字に切り込みを入れます。ここにバターとコンソメを入れて…' },
                  { name: 'アシ 鈴木', html: 'わあ、いい香り！これならお子さんでも食べやすそうですね。' },
                  { name: 'ゲスト 田中シェフ', html: 'そうなんです。チーズをたっぷりかけてオーブンで10分。はい、完成です！' },
                ]),
                '調理台 俯瞰CAM / 手元アップ', 'ピンマイク / SE（調理音）', '「材料」「作り方①②③」「ポイント」'),
              row('2:30',
                sce([
                  { name: 'MC 佐藤', html: 'いただきます！…うーん、これは美味しい！新玉ねぎの甘みがすごいですね。' },
                  { name: 'ゲスト 山田教授', html: '科学的に言うと、加熱によって硫化アリルが分解されて甘み成分に変わるんですよ。' },
                  { name: 'アシ 鈴木', html: 'さすが教授！なんでも科学で説明できるんですね（笑）' },
                ]),
                'MC+ゲスト 試食ショット', 'ピンマイク / BGM-トーク BED', '「新玉ねぎの丸ごとグラタン 完成！」'),
            ],
          },
          cm('CM②', '3:00'),
          {
            label: '【コーナー3】早押しクイズ', duration: '8:00', rows: [
              row('0:30',
                sce([
                  { name: 'MC 佐藤', html: 'ラストコーナーは「早押しクイズ」！ゲストのお二人に挑戦していただきます。鈴木さん、ルール説明お願いします。' },
                  { name: 'アシ 鈴木', html: '全5問、早押し形式です。正解で10ポイント、お手つきはマイナス5ポイント！' },
                ]),
                'MC バスト → ゲスト2人リアクション', 'SE-ジングル → BGM-クイズ', '「早押しクイズ」「ルール説明」'),
              row('1:30',
                sce([
                  { name: 'MC 佐藤', html: '第1問！「日本で一番高い山は富士山ですが、2番目に高い山は？」' },
                  { name: 'ゲスト 山田教授', html: '北岳！' },
                  { name: 'MC 佐藤', html: '正解！さすが教授、速いですね！' },
                ]),
                'クイズ出題テロップ → 正解テロップ', 'SE-正解 / BGM-クイズ BED', '「Q1. 日本で2番目に高い山は？」「A. 北岳（3,193m）」'),
              row('1:30',
                sce([
                  { name: 'MC 佐藤', html: '第2問！「イタリア語で"水"を意味する言葉は？」' },
                  { name: 'ゲスト 田中シェフ', html: 'アクア！' },
                  { name: 'MC 佐藤', html: '正解！シェフの得意分野でしたね！' },
                ]),
                'クイズ出題テロップ → 正解テロップ', 'SE-正解 / BGM-クイズ BED', '「Q2. イタリア語で"水"は？」「A. Acqua（アクア）」'),
              row('4:30',
                sce([
                  { name: 'MC 佐藤', html: '（第3問〜第5問 進行）…最終結果は、山田教授30ポイント、田中シェフ25ポイント！山田教授の勝利です！' },
                  { name: 'ゲスト 山田教授', html: 'やった！研究者の面目躍如ですね（笑）' },
                  { name: 'ゲスト 田中シェフ', html: '悔しいです！次回は料理問題を増やしてください（笑）' },
                ]),
                'スコアボード → ゲストリアクション', 'SE-正解/SE-不正解 / BGM-クイズ', '「最終結果」「Q3-Q5 出題テロップ」'),
            ],
          },
          pb(),
          {
            label: '【ED】エンディング', duration: '2:30', rows: [
              row('1:30',
                sce([
                  { name: 'MC 佐藤', html: '今日はありがとうございました！山田教授、最後に一言お願いします。' },
                  { name: 'ゲスト 山田教授', html: '科学は身近にあります。ぜひ日常の「なぜ？」を大切にしてください。' },
                  { name: 'ゲスト 田中シェフ', html: '新玉ねぎのレシピ、ぜひお家で試してくださいね！' },
                  { name: 'アシ 鈴木', html: '番組へのご感想はハッシュタグ「#GMOバラエティ」でお待ちしています！' },
                ]),
                'MC+ゲスト 4ショット', 'ピンマイク / BGM-ED フェードイン', '「次回予告」「#GMOバラエティ」'),
              row('1:00',
                sce([
                  { name: 'MC 佐藤', html: 'GMOスタジオ情報バラエティ、また来週お会いしましょう！さようなら〜！' },
                  { name: 'NA', html: '（提供読み）この番組はご覧のスポンサーの提供でお送りしました。' },
                ]),
                'EDロール → 暗転', 'BGM-ED フル → フェードアウト', '「EDクレジットロール」「提供テロップ」'),
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

  saveDb();
  console.log('Sub-app seed data inserted successfully.');
}

if (require.main === module) {
  runMigrations().then(() => seedSubApps()).then(() => closeDb()).catch(console.error);
}

export { seedSubApps };
