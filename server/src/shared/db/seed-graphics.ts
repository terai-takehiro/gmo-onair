/**
 * seed-graphics.ts
 *
 * テロップCG（techops ミニアプリ `graphics`）のダミーデータを既存 DB に追加する
 * スクリプト。docs/design/v4/graphics.md のモック
 * （mockups/v4-mockup-graphics.dc.html）に出てくるデモ番組「60周年 記念式典」を
 * そのまま再現する — URL を開いた瞬間に空白ではなく実際の画面が出るように
 * （seed-awards.ts と同じ趣旨）。
 *
 * 開発・検証環境で自動実行される（本番は SKIP_SEED=true のため実行されない）。
 *
 *   npm run db:seed:graphics -w server
 *
 * 入れる内容:
 *   - CGプロジェクト1件（owner_type='program' / owner_id='demo-ceremony'）
 *   - ページ8枚（モックの一覧どおり: 101〜103 下部・110 サイド・201/202 フル・
 *     301 ティッカー・401 カウントダウン。校正状態も 201=未確認・202=未完成 を再現）
 *   - cue 2本（下部=101・サイド=110 をオンエア中の状態にしておく）
 */

import { initDb, closeDb, queryOne, execute } from './connection';
import { runMigrations } from './migrate';

interface PageInput {
  callNo: number;
  slot: string;
  partKey: string;
  name: string;
  fields: Record<string, unknown>;
  proofState: 'draft' | 'unproofed' | 'proofed';
}

const PAGES: PageInput[] = [
  {
    callNo: 101, slot: 'lower', partKey: 'name',
    name: '氏名：田島 常務（主催者あいさつ）',
    fields: {
      label: '主催者挨拶',
      mainText: '田島 慎一',
      subText: 'GMOグローバルスタジオ 常務取締役',
      mainTextEn: 'Shinichi Tajima',
    },
    proofState: 'proofed',
  },
  {
    callNo: 102, slot: 'lower', partKey: 'name',
    name: '氏名：西村／橋本（歴代社長 対談）',
    fields: {
      mainText: '西村 大輔 ／ 橋本 恵子',
      subText: '歴代社長 対談',
      persons: [
        { name: '西村 大輔', title: '第3代 代表取締役社長' },
        { name: '橋本 恵子', title: '第4代 代表取締役社長' },
      ],
    },
    proofState: 'proofed',
  },
  {
    callNo: 103, slot: 'lower', partKey: 'name',
    name: '中継先：大阪拠点',
    fields: { mainText: '中継', subText: '大阪拠点' },
    proofState: 'proofed',
  },
  {
    callNo: 110, slot: 'side', partKey: 'side',
    name: '「60周年記念式典」常駐サイド',
    fields: { text: '60周年記念式典' },
    proofState: 'proofed',
  },
  {
    callNo: 201, slot: 'fullscreen', partKey: 'list',
    name: '永年勤続 表彰者一覧（20名）',
    fields: {
      title: '永年勤続 表彰者',
      columns: 4,
      items: [
        '青木 一郎', '石田 花子', '上野 健太', '遠藤 美咲',
        '岡本 大地', '加藤 さくら', '木村 拓海', '黒田 由美',
        '小林 直樹', '斎藤 真理', '佐々木 光', '島田 亮',
        '鈴木 千夏', '高橋 誠', '田中 未来', '中村 陽平',
        '野口 綾', '藤井 空', '松本 蓮', '山本 結衣',
      ],
    },
    proofState: 'unproofed',
  },
  {
    callNo: 202, slot: 'fullscreen', partKey: 'title',
    name: '記念講演 演題・講師紹介',
    // 未完成（講師名が未確定のまま発注から上がってきた、という状態を再現）
    fields: { title: '60年のあゆみと、これからの放送', speaker: '', speakerTitle: '' },
    proofState: 'draft',
  },
  {
    callNo: 301, slot: 'ticker', partKey: 'ticker',
    name: 'ご来場の注意・懇親会の案内',
    fields: {
      text: 'ご来場の皆さまへ：会場内は撮影禁止です ／ 懇親会は 17:30 より 2F ホワイエにて開催します',
      speed: 'normal',
    },
    proofState: 'proofed',
  },
  {
    callNo: 401, slot: 'clock', partKey: 'countdown',
    name: '開演カウントダウン（13:00 まで）',
    fields: { targetTime: '13:00', prefix: '開演まであと' },
    proofState: 'proofed',
  },
];

async function seedGraphics() {
  await initDb();

  const tableExists = await queryOne(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='graphics_projects'`
  );
  if (!tableExists) {
    console.warn('[seed-graphics] graphics_projects テーブルが未作成のためスキップ');
    return;
  }

  const existing = await queryOne('SELECT COUNT(*)::int AS c FROM graphics_projects');
  if ((existing?.c as number) > 0) {
    console.log('[seed-graphics] graphics_projects に既にデータがあるためスキップ');
    return;
  }

  const project = await queryOne(
    `INSERT INTO graphics_projects (owner_type, owner_id, name, theme)
     VALUES ('program', 'demo-ceremony', '60周年 記念式典', 'ceremony-gold')
     RETURNING id`
  );
  const projectId = project!.id as number;

  const pageIdByCallNo = new Map<number, number>();
  for (let i = 0; i < PAGES.length; i++) {
    const p = PAGES[i];
    const row = await queryOne(
      `INSERT INTO graphics_pages (project_id, call_no, slot, part_key, name, fields, proof_state, sort_order)
       VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?)
       RETURNING id`,
      [projectId, p.callNo, p.slot, p.partKey, p.name, JSON.stringify(p.fields), p.proofState, i + 1]
    );
    pageIdByCallNo.set(p.callNo, row!.id as number);
  }

  // モックの操作画面と同じ「下部=101・サイド=110 がオンエア中」の状態にしておく
  for (const [slot, callNo] of [['lower', 101], ['side', 110]] as const) {
    await execute(
      `INSERT INTO graphics_cue_state (project_id, slot, page_id, is_live, taken_at, updated_at)
       VALUES (?, ?, ?, TRUE, NOW(), NOW())
       ON CONFLICT (project_id, slot) DO NOTHING`,
      [projectId, slot, pageIdByCallNo.get(callNo)]
    );
  }

  console.log('[seed-graphics] 投入完了:');
  console.log(`  project: 1件 (id=${projectId} / 60周年 記念式典)`);
  console.log(`  pages: ${PAGES.length}枚 / cues: 2本 (lower=101, side=110)`);
}

if (require.main === module) {
  runMigrations().then(() => seedGraphics()).then(() => closeDb()).catch(console.error);
}

export { seedGraphics };
