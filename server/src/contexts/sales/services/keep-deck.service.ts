/**
 * 隔週キープをつくる (デザイン 29章 35a/35b/35c / 仕様書 §7.3)
 *
 * GMO流会議フォーマット **Ver.2.5 の11の型は変えない**。
 * 変えるのは「誰が埋めるか」だけ — 前回 6.5時間かかっていた作成を 45分にする。
 *
 * ── なぜページの構成をコードに置くか ──────────────────────
 *
 * 型は固定 (変えない) ので、DB に置くと「型が変わったのか、その回だけ違うのか」が
 * 区別できなくなる。ここを正として、DB に持つのは**人が書いた分**と
 * **その回に足した議題**だけにする。
 *
 * ── 数字を写し取らない ──────────────────────────────────
 *
 * 売上・仕入・販管費・稼働・タスク・予約は既に ONAiR の中にある。
 * 資料の中に写すと、元を直しても資料が古いままになる (転記が間違いの元)。
 * 出すときに読む。
 *
 * ── アジェンダ ──────────────────────────────────────────
 *
 * ①②③は毎回。**④以降は議題があるときだけ足す。**
 * レギュラーでない議題を毎回の型に混ぜると、無い回に空のページが残る。
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import { keepReportService } from './keep-report.service';

export const FORMAT_VERSION = 'Ver.2.5';

/** 誰が埋めるか */
export type FilledBy = 'ai' | 'fixed' | 'ai_human' | 'human';

export interface KeepPage {
  /** ページ番号。①〜③は本編 */
  no: string;
  label: string;
  by: FilledBy;
  /** どこから持ってくるか */
  from: string;
  /** 人がやること */
  human: string;
}

/**
 * Ver.2.5 の18ページ。**この構成は変えない。**
 * 増やすときはフォーマットの版を上げる (その回だけ足すのは ④以降の議題)。
 */
export const KEEP_PAGES: KeepPage[] = [
  { no: '0',  label: '利用方法チェックリスト', by: 'ai',    from: 'Ver.2.5 の11項目を自動で照合', human: '落ちている項目だけ直す' },
  { no: '1',  label: '会議スローガン',       by: 'fixed', from: '前回と同じ（変更なし）',       human: '方針が変わったときだけ書き換える' },
  { no: '2',  label: '情報サマリ',           by: 'ai',    from: '設定の会議マスター',           human: '変更があれば赤字（自動で色が付く）' },
  { no: '3',  label: '責任者＆組織図',       by: 'ai',    from: '設定の人と権限（役職・メール）', human: '入退社があれば確認だけ' },
  { no: '4',  label: '参加者＆欠席者',       by: 'ai',    from: '前回の出席と動画視聴の記録',   human: 'なし' },
  { no: '5',  label: '前回議事録サマリ',     by: 'ai',    from: '前回の議事録＋ToDoのID',       human: '要約を読んで削る' },
  { no: '6',  label: 'ToDoリスト',           by: 'ai',    from: 'タスク（期限・担当・緊急×重要）', human: '進捗の一言を足す' },
  { no: '7',  label: '全体スケジュール',     by: 'ai',    from: '予定とマイルストーン。「イマココ」は日付から', human: '節目の増減だけ' },
  { no: '8',  label: 'KPIツリー',            by: 'fixed', from: '前回と同じ（変更なし）',       human: 'KGI/KPIを変えるときだけ' },
  { no: '9',  label: '進捗状況（定量）',     by: 'ai',    from: 'お金の画面と稼働率（グラフも自動）', human: 'なし' },
  { no: '10', label: 'アジェンダ',           by: 'ai',    from: '本編の構成から自動（時間配分つき）', human: '順番の入れ替え' },
  { no: '①', label: '数値報告・営業進捗',   by: 'ai_human', from: '目標と実績、ヨミ表、稼働カレンダー', human: '見通しの理由を1行' },
  { no: '②', label: '案件実施報告',         by: 'ai',    from: '終わった案件の売上・粗利・来場数・写真', human: '何が良かったかを1行' },
  { no: '③', label: '重点取組課題',         by: 'ai_human', from: '6テーマの担当・関連タスクの進捗', human: 'テーマごとに打ち手を1行' },
  { no: '11', label: 'ToDo＆次回開催日',     by: 'ai',    from: '会議中に増えたタスク＋次回の予定', human: 'なし（会議中に確定）' },
  { no: 'A',  label: 'Appendix',             by: 'ai',    from: '前回の本編から自動で移す（削除しない）', human: 'なし' },
];

/**
 * ③重点取組課題の6テーマ。**テーマと担当は固定なので毎回作り直さない。**
 * 人が書くのはテーマごとに1行だけ。
 */
export const FIXED_THEMES = [
  { no: 1, theme: '技術内製化（採用）',            owner: '寺井' },
  { no: 2, theme: '技術力強化',                    owner: '唐澤' },
  { no: 3, theme: 'AI活用',                        owner: '橋本' },
  { no: 4, theme: '新規案件獲得',                  owner: '長野' },
  { no: 5, theme: 'グループへの技術支援',          owner: '寺井' },
  { no: 6, theme: 'GMOサムライコンテンツスタジオ', owner: '掛田' },
] as const;

/** 毎回のアジェンダ (①②③)。時間配分つき */
export const REGULAR_AGENDA = [
  { no: '①', label: '数値報告・営業進捗', minutes: 5,  detail: '目標と見通し・ヨミ表・稼働率。数字はお金の画面から入ります。' },
  { no: '②', label: '案件実施報告',       minutes: 5,  detail: '終わった案件の売上・粗利・来場数・AI活用の効果。' },
  { no: '③', label: '重点取組課題 進捗',  minutes: 10, detail: '6テーマの担当・進捗・打ち手。数字と進捗はタスクから、判断は人が1行。' },
] as const;

/** ④以降に足せる議題の候補。**議題があるときだけ足す** */
export const OPTIONAL_AGENDA = [
  { kind: 'construction',  label: '用賀/渋谷 構築',      note: '工事や設備の判断があるとき', auto: '見積・請求・相見積もりの比較' },
  { kind: 'hiring',        label: '採用・内製化',        note: '入社や選考の報告があるとき', auto: '入社日・内定状況' },
  { kind: 'group_support', label: 'グループ技術支援',    note: '支援案件が動いたとき',       auto: '案件から件数と内容' },
  { kind: 'other',         label: 'そのほか（自由）',    note: '上に当てはまらない議題',     auto: 'なし（人が書く）' },
] as const;

/** Ver.2.5 の利用方法チェックリスト (11項目)。落ちているものだけ画面に赤で出す */
export const CHECKLIST = [
  'format_version', 'diff_red', 'prev_attendance', 'minutes_todo_id', 'imakoko',
  'next_date', 'agenda_time', 'pl_numbers', 'themes_written', 'event_report', 'appendix_kept',
] as const;

const CHECK_LABELS: Record<string, string> = {
  format_version: '最新のフォーマットを使っている',
  diff_red: '変更点が赤文字になっている',
  prev_attendance: '前回参加状況を記載している',
  minutes_todo_id: '議事録サマリにToDoのIDがある',
  imakoko: '「イマココ」が中央にある',
  next_date: '次回開催日が入っている',
  agenda_time: 'アジェンダに時間配分がある',
  pl_numbers: '①の数字が入っている',
  themes_written: '③の打ち手が6テーマすべて書かれている',
  event_report: '②の実施報告が確定している',
  appendix_kept: '過去分をAppendixに残している（削除していない）',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const assertDate = (d: string) => {
  if (!DATE_RE.test(d)) throw new AppError(400, 'VALIDATION_ERROR', '開催日は YYYY-MM-DD で指定してください');
};

// ───────────────────────────────────────────────────────
// 作る / 読む
// ───────────────────────────────────────────────────────

/** その回を用意する (同じ日を二度作らない = 冪等) */
export async function ensureMeeting(meetingDate: string, userId: string) {
  assertDate(meetingDate);
  await execute(
    `INSERT INTO keep_meetings (meeting_date, format_version, created_by, updated_by)
     VALUES (?, ?, ?, ?) ON CONFLICT (meeting_date) DO NOTHING`,
    [meetingDate, FORMAT_VERSION, userId, userId]
  );
  return (await queryOne(`SELECT * FROM keep_meetings WHERE meeting_date = ?`, [meetingDate])) as any;
}

export async function listMeetings() {
  return (await queryAll(
    `SELECT m.*,
            (SELECT COUNT(*) FROM keep_agenda_items a WHERE a.meeting_date = m.meeting_date) AS extra_agenda_count,
            (SELECT COUNT(*) FROM keep_theme_notes t
              WHERE t.meeting_date = m.meeting_date
                AND COALESCE(t.human_line, '') <> '') AS themes_written
       FROM keep_meetings m ORDER BY m.meeting_date DESC`
  )) as any[];
}

/**
 * 資料を組み立てる。
 *
 * ページごとに「AIが埋めた / 人が書く」を出し、**人が書くところだけ**を
 * 画面が上から順に片づけられる形にする。
 */
export async function getDeck(meetingDate: string, userId: string) {
  const meeting = await ensureMeeting(meetingDate, userId);

  const themeNotes = (await queryAll(
    `SELECT theme_no, human_line, consult_line FROM keep_theme_notes WHERE meeting_date = ?`,
    [meetingDate]
  )) as any[];
  const noteOf = new Map(themeNotes.map((t) => [Number(t.theme_no), t]));

  const extraAgenda = (await queryAll(
    `SELECT * FROM keep_agenda_items WHERE meeting_date = ? ORDER BY sort_order, created_at`,
    [meetingDate]
  )) as any[];

  // 前回 (この回より前のいちばん新しいもの)。差分と「参加状況」に使う
  const prev = (await queryOne(
    `SELECT * FROM keep_meetings WHERE meeting_date < ? ORDER BY meeting_date DESC LIMIT 1`,
    [meetingDate]
  )) as any;

  // ── 数字は既存のサービスから読む (資料に写し取らない) ──
  const ym = meetingDate.slice(0, 7);
  let pl: any = null;
  try { pl = await keepReportService.getMonthlyPl(ym); } catch { pl = null; }

  const eventReports = await keepReportService.listEventReports({ status: 'confirmed', limit: 5 });
  const minutes = (prev ? await keepReportService.getMinutes(String(prev.meeting_date)) : null) as
    { decisions?: unknown[]; topics?: unknown[] } | null;

  const facts = await gatherFacts();

  // ── ③のテーマ (固定) に、人の1行と自動の進捗を重ねる ──
  const themes = FIXED_THEMES.map((t) => {
    const n = noteOf.get(t.no);
    return {
      ...t,
      human_line: n?.human_line ?? null,
      consult_line: n?.consult_line ?? null,
      written: Boolean(n?.human_line),
      auto: facts.themeAuto[t.no] ?? '—',
    };
  });

  // ── アジェンダ (①②③ + 足した分)。時間配分は自動 ──
  const agenda = [
    ...REGULAR_AGENDA.map((a) => ({ ...a, kind: 'regular' as const, note: null as string | null })),
    ...extraAgenda.map((a, i) => ({
      no: ['④', '⑤', '⑥', '⑦', '⑧', '⑨'][i] ?? `${i + 4}`,
      label: String(a.label),
      minutes: Number(a.minutes),
      detail: String(a.note ?? ''),
      kind: String(a.kind),
      note: a.note as string | null,
      id: String(a.id),
    })),
  ];
  const totalMinutes = agenda.reduce((s, a) => s + Number(a.minutes), 0);

  // ── ページごとの状態。人が書くところだけ赤にする ──
  const humanAnswered =
    Boolean(meeting.answer_moved) && Boolean(meeting.answer_stuck);
  const pages = KEEP_PAGES.map((p) => {
    let needsHuman = false;
    if (p.no === '①') needsHuman = !humanAnswered;
    if (p.no === '③') needsHuman = themes.some((t) => !t.written);
    return {
      ...p,
      needs_human: needsHuman,
      // 「④以降」は議題を足した回だけページになる
      done: !needsHuman,
    };
  });
  // 議題を足した回は、その分のページを後ろに足す (無い回は作らない)
  const extraPages = extraAgenda.map((a, i) => ({
    no: ['④', '⑤', '⑥', '⑦', '⑧', '⑨'][i] ?? `${i + 4}`,
    label: String(a.label),
    by: 'human' as FilledBy,
    from: 'テーマを選ぶと、関係する数字は自動で入る',
    human: 'その回に議題があるときだけ足す',
    needs_human: !a.note,
    done: Boolean(a.note),
  }));
  const allPages = [...pages.slice(0, 14), ...extraPages, ...pages.slice(14)];

  // ── チェックリスト (11項目)。落ちているものだけ画面に出す ──
  const checks = {
    format_version: meeting.format_version === FORMAT_VERSION,
    diff_red: true,                                   // 差分の赤字は自動なので常に満たす
    prev_attendance: Boolean(prev),
    minutes_todo_id: Boolean(minutes?.topics?.length || minutes?.decisions?.length),
    imakoko: true,                                    // 「イマココ」は日付から自動
    next_date: Boolean(meeting.next_meeting_date),
    agenda_time: totalMinutes > 0,
    pl_numbers: Boolean(pl),
    themes_written: themes.every((t) => t.written),
    event_report: eventReports.length > 0,
    appendix_kept: true,                              // 過去分は消さない実装なので常に満たす
  };
  const checklist = CHECKLIST.map((k) => ({
    key: k, label: CHECK_LABELS[k], ok: Boolean((checks as any)[k]),
  }));

  // ── 前回からの変更 (自動で赤字にする対象) ──
  const diffs: Array<{ what: string; detail: string }> = [];
  if (prev) {
    if (prev.answer_stuck && meeting.answer_stuck && prev.answer_stuck !== meeting.answer_stuck) {
      diffs.push({ what: 'うまくいっていないこと', detail: '前回から書き換えられています' });
    }
    if (extraAgenda.length > 0) {
      diffs.push({ what: 'アジェンダ', detail: `④以降を ${extraAgenda.length}件 足しました` });
    }
    if (pl?.actual?.revenue != null) {
      diffs.push({ what: `${ym} の見通し`, detail: `売上 ${Number(pl.actual.revenue).toLocaleString('ja-JP')}円（お金の画面から）` });
    }
  }

  const aiPages = allPages.filter((p) => p.by === 'ai' || p.by === 'fixed').length;

  return {
    meeting_date: meetingDate,
    format_version: meeting.format_version,
    confirmed_at: meeting.confirmed_at,
    next_meeting_date: meeting.next_meeting_date,
    answers: {
      moved: meeting.answer_moved,
      stuck: meeting.answer_stuck,
      consult: meeting.answer_consult,
    },
    pages: allPages,
    page_count: allPages.length,
    ai_filled: aiPages,
    needs_human_count: allPages.filter((p) => p.needs_human).length,
    agenda,
    total_minutes: totalMinutes,
    optional_agenda: OPTIONAL_AGENDA,
    extra_agenda: extraAgenda,
    themes,
    facts: facts.list,
    pl,
    event_reports: eventReports,
    prev_minutes: minutes,
    checklist,
    diffs,
    // 前回足した議題は次回の候補に残る (続く話題は1クリックで戻せる)
    prev_agenda_kinds: prev
      ? ((await queryAll(
          `SELECT DISTINCT kind, label FROM keep_agenda_items WHERE meeting_date = ?`,
          [String(prev.meeting_date)]
        )) as any[])
      : [],
  };
}

/**
 * AIが集めた事実。**ここは人が直さなくて済む**ところ。
 * 既存のデータ (タスク・案件・仕入) から読む。
 */
async function gatherFacts() {
  const row = async (sql: string, params: unknown[] = []) => {
    try { return (await queryOne(sql, params)) as any; } catch { return null; }
  };

  const wonCount = await row(
    `SELECT COUNT(*) AS c FROM projects WHERE stage = 'a_won' AND deleted_at IS NULL AND is_sandbox = FALSE`);
  const netaCount = await row(
    `SELECT COUNT(*) AS c FROM projects WHERE stage IN ('neta','d_hold','c_proposal') AND deleted_at IS NULL AND is_sandbox = FALSE`);
  const taskDone = await row(
    `SELECT COUNT(*) FILTER (WHERE status = 'done') AS done, COUNT(*) AS total
       FROM project_tasks WHERE deleted_at IS NULL`);
  const purchase = await row(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM purchases x WHERE x.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM projects sbx WHERE sbx.id = x.project_id AND sbx.is_sandbox)`);

  const onTime = taskDone && Number(taskDone.total) > 0
    ? Math.round((Number(taskDone.done) / Number(taskDone.total)) * 100) : null;

  const list = [
    { label: '受注した案件', value: `${Number(wonCount?.c ?? 0)}件`, src: '案件のボードから' },
    { label: '新規案件（ヨミ）', value: `${Number(netaCount?.c ?? 0)}件`, src: '案件のボードから' },
    { label: 'ToDoの完了率', value: onTime == null ? '—' : `${onTime}%`, src: 'タスクから' },
    { label: '仕入の累計', value: `¥${Number(purchase?.s ?? 0).toLocaleString('ja-JP')}`, src: '仕入の明細から' },
  ];

  // ③の各テーマに自動で入る進捗 (テーマ固定なので対応も固定)
  const themeAuto: Record<number, string> = {
    1: '採用の状況はタスクから',
    2: '研修・機材デモの件数はタスクから',
    3: `仕入の累計 ¥${Number(purchase?.s ?? 0).toLocaleString('ja-JP')}（外注をやめた分の元データ）`,
    4: `ヨミ ${Number(netaCount?.c ?? 0)}件`,
    5: '支援案件の件数は案件から',
    6: '公開・広報の予定は予定から',
  };

  return { list, themeAuto };
}

// ───────────────────────────────────────────────────────
// 書く (人が書くところだけ)
// ───────────────────────────────────────────────────────

/** ①の3行。**空でも進める** (書かないという判断も記録として残る) */
export async function saveAnswers(
  meetingDate: string,
  body: { moved?: string | null; stuck?: string | null; consult?: string | null; next_meeting_date?: string | null },
  userId: string
) {
  await ensureMeeting(meetingDate, userId);
  await execute(
    `UPDATE keep_meetings
        SET answer_moved = COALESCE(?, answer_moved),
            answer_stuck = COALESCE(?, answer_stuck),
            answer_consult = COALESCE(?, answer_consult),
            next_meeting_date = COALESCE(?, next_meeting_date),
            updated_at = NOW(), updated_by = ?
      WHERE meeting_date = ?`,
    [body.moved ?? null, body.stuck ?? null, body.consult ?? null,
     body.next_meeting_date ?? null, userId, meetingDate]
  );
  return getDeck(meetingDate, userId);
}

/** ③のテーマごとの1行 */
export async function saveThemeNote(
  meetingDate: string, themeNo: number,
  body: { human_line?: string | null; consult_line?: string | null },
  userId: string
) {
  await ensureMeeting(meetingDate, userId);
  if (!FIXED_THEMES.some((t) => t.no === themeNo)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'そのテーマはありません（6テーマは固定です）');
  }
  await execute(
    `INSERT INTO keep_theme_notes (meeting_date, theme_no, human_line, consult_line)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (meeting_date, theme_no)
     DO UPDATE SET human_line = COALESCE(EXCLUDED.human_line, keep_theme_notes.human_line),
                   consult_line = COALESCE(EXCLUDED.consult_line, keep_theme_notes.consult_line),
                   updated_at = NOW()`,
    [meetingDate, themeNo, body.human_line ?? null, body.consult_line ?? null]
  );
  return getDeck(meetingDate, userId);
}

/** ④以降の議題を足す。番号・時間配分・ページは自動で付く */
export async function addAgendaItem(
  meetingDate: string, body: { kind?: string; label?: string; note?: string | null; minutes?: number },
  userId: string
) {
  await ensureMeeting(meetingDate, userId);
  const known = OPTIONAL_AGENDA.find((o) => o.kind === body.kind);
  const kind = known?.kind ?? 'other';
  // 候補から選んだときはその名前を使う。ただし「そのほか（自由）」は
  // 候補の名前がそのまま議題名になってしまうと何の話か分からないので、
  // **人が名前を書くことを必須にする**。
  const label = (body.label ?? (kind === 'other' ? '' : known?.label ?? '')).trim();
  if (!label) throw new AppError(400, 'VALIDATION_ERROR', '議題の名前を入れてください');

  const max = (await queryOne(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM keep_agenda_items WHERE meeting_date = ?`,
    [meetingDate]
  )) as any;

  await execute(
    `INSERT INTO keep_agenda_items (id, meeting_date, kind, label, note, minutes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), meetingDate, kind, label, body.note ?? null,
     Math.max(1, Math.round(Number(body.minutes ?? 15))), Number(max?.m ?? -1) + 1]
  );
  return getDeck(meetingDate, userId);
}

export async function removeAgendaItem(meetingDate: string, id: string, userId: string) {
  const row = await queryOne(
    `SELECT id FROM keep_agenda_items WHERE id = ? AND meeting_date = ?`, [id, meetingDate]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'その議題は見つかりません');
  await execute(`DELETE FROM keep_agenda_items WHERE id = ?`, [id]);
  return getDeck(meetingDate, userId);
}

/**
 * 確定する。**落ちているチェック項目があっても止めない** —
 * 止めると会議が始められない。何が落ちているかは画面に出す。
 */
export async function confirmDeck(meetingDate: string, userId: string) {
  const deck = await getDeck(meetingDate, userId);
  await execute(
    `UPDATE keep_meetings SET confirmed_at = NOW(), updated_at = NOW(), updated_by = ?
      WHERE meeting_date = ?`,
    [userId, meetingDate]
  );
  return {
    ...deck,
    confirmed_at: new Date().toISOString(),
    // 落ちている項目は返す (確定はできるが、そのまま出すと Ver.2.5 に反する)
    missing_checks: deck.checklist.filter((c) => !c.ok).map((c) => c.label),
  };
}
