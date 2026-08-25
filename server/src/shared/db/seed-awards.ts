/**
 * seed-awards.ts
 *
 * リアルタイムCG (client-awards) のダミーデータを既存 DB に追加するスクリプト。
 * 「廃止」から「凍結」(URLは生かす) へ戻したのに合わせて追加した — サーバー・API・
 * ビルドは復活したが、DBには表示するデータが1件も無かったため、URLを叩いても
 * 空の画面しか見せられなかった (client-awards/CLAUDE.md 参照)。
 *
 * 開発・検証環境で自動実行される (本番は SKIP_SEED=true のため実行されない、
 * 他の seed-*.ts と同じ)。
 *
 *   npm run db:seed:awards -w server
 *
 * 入れる内容 (「ある程度のボリューム」の内訳):
 *   - イベント3件 (live / closed / draft の3状態を並べて見せる)
 *   - カテゴリ計9本 (direct 型7・vote 型2)、エントリ計37件
 *   - live イベントは cue_state / oneshot_cue_state を「デモ中」の状態まで進めておく
 *     (URLを開いた瞬間に空白ではなく実際の画面が出るように)
 *   - クイズ2問 (quiz モード1・survey モード1)、選択肢に投票数もあらかじめ入れる
 */

import { initDb, closeDb, queryOne, execute } from './connection';
import { runMigrations } from './migrate';

const ins = (sql: string, params: unknown[]) => execute(sql, params);
const insReturningId = async (sql: string, params: unknown[]): Promise<number> => {
  const row = await queryOne(`${sql} RETURNING id`, params);
  return row!.id as number;
};

interface EntryInput {
  name: string;
  nameEn?: string;
  org?: string;
  points?: number;
  ownPoints?: number;
  rank?: number;
  isWinner?: boolean;
  voteCount?: number;
  nominationTitle?: string;
}

async function insertCategory(
  eventId: number,
  order: number,
  name: string,
  nameEn: string,
  opts: { pattern?: 'direct' | 'vote'; pollTitle?: string; pollQuestion?: string; description?: string } = {},
): Promise<number> {
  return insReturningId(
    `INSERT INTO awards_categories
       (event_id, name, name_en, display_order, description, award_pattern, poll_title, poll_question)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      eventId, name, nameEn, order, opts.description ?? null,
      opts.pattern ?? 'direct', opts.pollTitle ?? null, opts.pollQuestion ?? null,
    ],
  );
}

async function insertEntries(eventId: number, categoryId: number, entries: EntryInput[]): Promise<void> {
  for (const e of entries) {
    await ins(
      `INSERT INTO awards_entries
         (event_id, category_id, rank, name, name_en, org, points, own_points,
          is_winner, vote_count, nomination_title)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        eventId, categoryId, e.rank ?? null, e.name, e.nameEn ?? null, e.org ?? null,
        e.points ?? null, e.ownPoints ?? null, e.isWinner ?? false, e.voteCount ?? 0,
        e.nominationTitle ?? null,
      ],
    );
  }
}

async function seedAwards() {
  await initDb();

  const tableExists = async (name: string): Promise<boolean> => {
    const r = await queryOne(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [name],
    );
    return !!r;
  };

  if (!(await tableExists('awards_events'))) {
    console.warn('[seed-awards] awards_events テーブルが未作成のためスキップ');
    return;
  }

  const existing = await queryOne('SELECT COUNT(*)::int AS c FROM awards_events');
  if ((existing?.c as number) > 0) {
    console.log('[seed-awards] awards_events に既にデータがあるためスキップ');
    return;
  }

  console.log('[seed-awards] リアルタイムCGのダミーデータを投入します...');

  // ============================================================
  // イベント A: 開催中 (live) — メインのデモ対象
  // ============================================================
  const eventA = await insReturningId(
    `INSERT INTO awards_events (name, subtitle, description, scheduled_at, status)
     VALUES (?,?,?,?,?)`,
    [
      'GMO ONAiR AWARDS 2026', '今年もっとも輝いた番組・人・チームを表彰する年次アワード',
      'GMOグローバルスタジオの制作陣・出演者を対象にした社内アワード。番組部門・個人部門・視聴者投票部門の3系統で選出する。',
      '2026-09-20T18:00:00+09:00', 'live',
    ],
  );

  const catBestProgram = await insertCategory(eventA, 1, '最優秀番組賞', 'Best Program of the Year', {
    description: '今年度もっとも高い評価を得た番組に贈られる、アワードの本賞。',
  });
  await insertEntries(eventA, catBestProgram, [
    { name: 'サイエンス・フロンティア', nameEn: 'Science Frontier', org: '制作三課', rank: 5, points: 62, ownPoints: 58 },
    { name: 'GMOスタジオ情報バラエティ', nameEn: 'GMO Studio Variety', org: '制作一課', rank: 4, points: 70, ownPoints: 65 },
    { name: 'ネットLIVE配信', nameEn: 'Net LIVE Stream', org: '配信チーム', rank: 3, points: 78, ownPoints: 74 },
    { name: 'GH春季IR説明会', nameEn: 'GH Spring IR Briefing', org: '制作二課', rank: 2, points: 85, ownPoints: 80 },
    { name: 'サイエンス・フロンティア #001〜#012', nameEn: 'Science Frontier Season 1', org: '制作三課', rank: 1, points: 96, ownPoints: 91, isWinner: true, nominationTitle: '年間視聴継続率No.1、科学教養番組の新境地を開いた1年' },
  ]);

  const catBestMc = await insertCategory(eventA, 2, '最優秀MC賞', 'Best MC Award', {
    description: '進行力・場を作る力でもっとも輝いた出演者に贈られる。',
  });
  await insertEntries(eventA, catBestMc, [
    { name: '佐藤 花子', nameEn: 'Hanako Sato', org: 'ネットLIVE配信', rank: 5, points: 55 },
    { name: 'MC 高橋 美咲', nameEn: 'Misaki Takahashi', org: 'サイエンス・フロンティア', rank: 4, points: 68 },
    { name: 'MC 田中 太郎', nameEn: 'Taro Tanaka', org: 'GH春季IR説明会', rank: 3, points: 74 },
    { name: 'MC 佐藤 太郎', nameEn: 'Taro Sato', org: 'GMOスタジオ情報バラエティ', rank: 2, points: 82 },
    { name: 'MC 鈴木 一郎', nameEn: 'Ichiro Suzuki', org: 'GMOスタジオ情報バラエティ', rank: 1, points: 90, isWinner: true, nominationTitle: '安定した進行と当意即妙なアドリブで番組を牽引' },
  ]);

  const catBestTechStaff = await insertCategory(eventA, 3, 'スタッフ賞（テクニカル部門）', 'Best Technical Staff', {
    description: '中継・スイッチング・音声などテクニカル領域で番組を支えたスタッフを表彰。',
  });
  await insertEntries(eventA, catBestTechStaff, [
    { name: '中継技術チーム', nameEn: 'Remote Broadcast Team', org: '技術部', rank: 4, points: 60 },
    { name: '音響オペレーションチーム', nameEn: 'Audio Ops Team', org: '技術部', rank: 3, points: 72 },
    { name: 'スイッチング班', nameEn: 'Switching Crew', org: '技術部', rank: 2, points: 84 },
    { name: 'サブコントロール運用チーム', nameEn: 'Sub-control Team', org: '技術部', rank: 1, points: 93, isWinner: true, nominationTitle: '大型特番3本を無事故で完遂' },
  ]);

  const catAudienceChoice = await insertCategory(eventA, 4, '視聴者が選ぶベストコーナー賞', "Audience's Choice — Best Segment", {
    pattern: 'vote',
    pollTitle: '今年いちばん好きだったコーナーは？',
    pollQuestion: '視聴者投票で選ぶ、GMO ONAiR AWARDS 2026 ベストコーナー',
    description: '番組内の人気コーナーを対象に、放送中の視聴者投票で決定する。',
  });
  await insertEntries(eventA, catAudienceChoice, [
    { name: '早押しクイズ', nameEn: 'Buzzer Quiz Corner', org: 'GMOスタジオ情報バラエティ', voteCount: 812 },
    { name: '春の簡単レシピ', nameEn: 'Easy Spring Recipes', org: 'GMOスタジオ情報バラエティ', voteCount: 634 },
    { name: '最新ニュース深掘り', nameEn: 'Tech News Deep Dive', org: 'GMOスタジオ情報バラエティ', voteCount: 559 },
    { name: 'チャットQ&A', nameEn: 'Live Chat Q&A', org: 'ネットLIVE配信', voteCount: 447 },
    { name: '取材：量子研究所訪問', nameEn: 'Quantum Lab Visit', org: 'サイエンス・フロンティア', voteCount: 388 },
  ]);

  // live イベントは「URLを開けば実際に何か映る」状態まで進めておく
  await ins(
    `INSERT INTO awards_cue_state (event_id, step, category_id, oneshot_style, vote_display, reveal_phase)
     VALUES (?,?,?,?,?,?)`,
    [eventA, 'nominees', catBestProgram, 'classic', 'count', 1],
  );
  const mcWinnerId = await queryOne(
    `SELECT id FROM awards_entries WHERE category_id = ? AND is_winner = TRUE`, [catBestMc],
  );
  await ins(
    `INSERT INTO awards_oneshot_cue_state (event_id, entry_id, module_key, is_live, lang, show_portrait)
     VALUES (?,?,?,?,?,?)`,
    [eventA, mcWinnerId?.id ?? null, 'title', true, 'ja', true],
  );

  // ── クイズ (QuizStack) ──
  const quiz1 = await insReturningId(
    `INSERT INTO quizzes (event_id, title, question, choice_count, mode, has_answer_check, display, countdown_seconds, display_order)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [eventA, 'GMO ONAiRクイズ①', 'GMO ONAiRが初めて自社スタジオを開設したのはどの棟？', 4, 'quiz', true, 'count', 30, 1],
  );
  const quiz1Choices: { name: string; votes: number; correct: boolean }[] = [
    { name: 'A棟', votes: 341, correct: true },
    { name: 'B棟', votes: 128, correct: false },
    { name: 'C棟', votes: 96, correct: false },
    { name: '本社ビル', votes: 64, correct: false },
  ];
  for (const [i, c] of quiz1Choices.entries()) {
    await ins(
      `INSERT INTO quiz_choices (quiz_id, position, name, vote_count, is_correct) VALUES (?,?,?,?,?)`,
      [quiz1, i + 1, c.name, c.votes, c.correct],
    );
  }
  await ins(`INSERT INTO quiz_cue_state (quiz_id) VALUES (?) ON CONFLICT DO NOTHING`, [quiz1]);

  const quiz2 = await insReturningId(
    `INSERT INTO quizzes (event_id, title, question, choice_count, mode, display, survey_pattern, countdown_seconds, display_order)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [eventA, '今夜のアンケート', '今年のアワード、いちばん印象に残った部門は？', 3, 'survey', 'percent', 'top-reveal', 45, 2],
  );
  const quiz2Choices: { name: string; votes: number }[] = [
    { name: '最優秀番組賞', votes: 502 },
    { name: '最優秀MC賞', votes: 388 },
    { name: '視聴者が選ぶベストコーナー賞', votes: 275 },
  ];
  for (const [i, c] of quiz2Choices.entries()) {
    await ins(
      `INSERT INTO quiz_choices (quiz_id, position, name, vote_count) VALUES (?,?,?,?)`,
      [quiz2, i + 1, c.name, c.votes],
    );
  }
  await ins(`INSERT INTO quiz_cue_state (quiz_id) VALUES (?) ON CONFLICT DO NOTHING`, [quiz2]);

  await ins(
    `INSERT INTO quiz_stack_state (event_id, current_quiz_id, step) VALUES (?,?,?)`,
    [eventA, quiz1, 'idle'],
  );

  // ============================================================
  // イベント B: 終了済み (closed) — 過去回のアーカイブとして並べる
  // ============================================================
  const eventB = await insReturningId(
    `INSERT INTO awards_events (name, subtitle, description, scheduled_at, status)
     VALUES (?,?,?,?,?)`,
    [
      'GMO ONAiR AWARDS 2025', '第1回開催分（終了）',
      '記念すべき第1回。以降のアワードの型を作った回。',
      '2025-09-21T18:00:00+09:00', 'closed',
    ],
  );

  const catB1 = await insertCategory(eventB, 1, '最優秀番組賞', 'Best Program of the Year');
  await insertEntries(eventB, catB1, [
    { name: 'ネットLIVE配信', org: '配信チーム', rank: 4, points: 58 },
    { name: 'GMOスタジオ情報バラエティ', org: '制作一課', rank: 3, points: 71 },
    { name: 'GH秋季IR説明会', org: '制作二課', rank: 2, points: 79 },
    { name: 'サイエンス・フロンティア', org: '制作三課', rank: 1, points: 88, isWinner: true, nominationTitle: '放送開始1年目にして最多視聴を記録' },
  ]);

  const catB2 = await insertCategory(eventB, 2, '最優秀MC賞', 'Best MC Award');
  await insertEntries(eventB, catB2, [
    { name: 'MC 高橋 美咲', org: 'サイエンス・フロンティア', rank: 4, points: 60 },
    { name: 'MC 佐藤 太郎', org: 'GMOスタジオ情報バラエティ', rank: 3, points: 69 },
    { name: '佐藤 花子', org: 'ネットLIVE配信', rank: 2, points: 77 },
    { name: 'MC 田中 太郎', org: 'GH秋季IR説明会', rank: 1, points: 85, isWinner: true, nominationTitle: '落ち着いた進行で株主説明会の信頼感を作った' },
  ]);

  const catB3 = await insertCategory(eventB, 3, 'スタッフ賞（テクニカル部門）', 'Best Technical Staff');
  await insertEntries(eventB, catB3, [
    { name: '音響オペレーションチーム', org: '技術部', rank: 4, points: 55 },
    { name: 'スイッチング班', org: '技術部', rank: 3, points: 66 },
    { name: '中継技術チーム', org: '技術部', rank: 2, points: 80 },
    { name: 'サブコントロール運用チーム', org: '技術部', rank: 1, points: 91, isWinner: true, nominationTitle: '開局初年度のトラブルゼロ運用' },
  ]);

  // ============================================================
  // イベント C: 準備中 (draft) — ノミネート選定がまだ途中の回
  // ============================================================
  const eventC = await insReturningId(
    `INSERT INTO awards_events (name, subtitle, description, scheduled_at, status)
     VALUES (?,?,?,?,?)`,
    [
      '第3回 GMO ONAiR AWARDS', '準備中（ノミネート選定中）',
      '2027年開催予定。カテゴリ・ノミネートともに検討段階。',
      '2027-09-18T18:00:00+09:00', 'draft',
    ],
  );

  const catC1 = await insertCategory(eventC, 1, '最優秀番組賞', 'Best Program of the Year', {
    description: '候補選定中（暫定3本）。',
  });
  await insertEntries(eventC, catC1, [
    { name: 'サイエンス・フロンティア', org: '制作三課' },
    { name: 'GMOスタジオ情報バラエティ', org: '制作一課' },
    { name: 'ネットLIVE配信', org: '配信チーム' },
  ]);

  const catC2 = await insertCategory(eventC, 2, '視聴者が選ぶベストコーナー賞', "Audience's Choice — Best Segment", {
    pattern: 'vote',
    pollTitle: '今年いちばん好きだったコーナーは？（開催前）',
    pollQuestion: '視聴者投票で選ぶ、第3回 GMO ONAiR AWARDS ベストコーナー',
    description: '投票はまだ開始していない（票数0）。',
  });
  await insertEntries(eventC, catC2, [
    { name: '早押しクイズ', org: 'GMOスタジオ情報バラエティ' },
    { name: '春の簡単レシピ', org: 'GMOスタジオ情報バラエティ' },
    { name: 'チャットQ&A', org: 'ネットLIVE配信' },
  ]);

  console.log('[seed-awards] 投入完了:');
  console.log(`  events: 3件 (live=${eventA} / closed=${eventB} / draft=${eventC})`);
  console.log('  categories: 9本 (direct 7 / vote 2) / entries: 37件');
  console.log('  quizzes: 2問 (quiz 1 / survey 1)');
}

if (require.main === module) {
  runMigrations().then(() => seedAwards()).then(() => closeDb()).catch(console.error);
}

export { seedAwards };
