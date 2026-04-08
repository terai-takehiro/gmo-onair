/**
 * seed-subapps.ts
 * Qシート・技術資料・インタラクティブのダミーデータを既存DBに追加するスクリプト。
 * 初回シード後にこれらのテーブルが空の場合に実行してください。
 *
 *   npm run db:seed:subapps -w server
 */

import { v4 as uuidv4 } from 'uuid';
import { initDb, saveDb, closeDb, queryOne, queryAll, execute } from './connection';
import { runMigrations } from './migrate';

async function seedSubApps() {
  await initDb();

  // -------- 既存データ確認 --------
  const qCount  = await queryOne('SELECT COUNT(*)::int AS c FROM qsheet_documents');
  const tsCount = await queryOne('SELECT COUNT(*)::int AS c FROM techsheet_documents');
  const evCount = await queryOne('SELECT COUNT(*)::int AS c FROM interactive_events');

  const hasQsheet      = (qCount?.c  as number) > 0;
  const hasTechsheet   = (tsCount?.c as number) > 0;
  const hasInteractive = (evCount?.c as number) > 0;

  if (hasQsheet && hasTechsheet && hasInteractive) {
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
