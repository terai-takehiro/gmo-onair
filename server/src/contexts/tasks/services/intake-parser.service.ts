/* eslint-disable no-irregular-whitespace --
   日本語の入力には全角スペース (U+3000) が普通に混ざる。正規表現でこれを
   区切り文字として扱わないと「佐藤　実さん」のような表記で宛先を取り落とす。
   よってこのファイルでは全角スペースを意図してリテラルに書いている。 */
// 投入テキストの一次解析 — 「誰に / 何を / いつまでに」を規則で拾う。
//
// 要件: docs/archive/2026/2026-07-25-collaboration-and-personal-agent.md (D4 / D9)
//
// なぜ規則ベースなのか:
//   サーバーに LLM は無い (追加すると API キー・コスト・レイテンシが増える)。
//   一方で「佐藤さんに 7/31 17:00 までに見積書」のような定型は規則で確実に取れる。
//   よって **確実に取れるものだけ取り、取れないものは推測せず印を立てて人に聞く**。
//   議事録のような崩れた文の解析は MCP 経由 (create_task_intake) で Claude が担当する。
//
// GMO イズムに従う点:
//   - 目標達成10カ条 1-1「期限は何日何時何分まで。『今週中』などの曖昧な表現を使うな」
//     → 「今週中」「なるべく早く」は **期限として採用せず** due_unclear を立てて人に聞く。
//     勝手に日付を決めると曖昧なまま確定したことになり、イズムに反する。
//   - 同 1-1「期限はできるだけ短く設定する」→ 遠い期限には注意を添える。
//   - 会議術10カ条 7「議事録には ToDo・期限・次回開催日を記載」→ 議事録は正当な投入源。
//     ただし決定事項はタスクにしない (溢れるため)。

/** 終業時刻。日付だけ書かれていたときに補う (要件 D9) */
const DEFAULT_DUE_HOUR = 18;

/** これより先の期限は「長い」とみなして注意を添える (イズム: 期限は短く) */
const LONG_DUE_DAYS = 14;

/**
 * 下書きの行き先 (v4 の投入口の1本化)。
 *
 * 投入口は1つで、**1件ずつ AI が行き先を決める**。判断が付かないものは
 * `task` に倒す — 一番取り消しやすく、誰の目にも触れる場所だから
 * (ネタ案件や活動記録に落とすと、間違っていても気づかれないまま残る)。
 */
export type IntakeDest = 'task' | 'neta' | 'log' | 'minutes';

export const INTAKE_DESTS: IntakeDest[] = ['task', 'neta', 'log', 'minutes'];

export function normalizeDest(v: unknown): IntakeDest {
  return INTAKE_DESTS.includes(v as IntakeDest) ? (v as IntakeDest) : 'task';
}

export interface ParsedDraft {
  /** 行き先。**規則ベースは常に `task`**（規則で案件やお客様は読み取れない） */
  dest?: IntakeDest;
  title: string;
  assigned_to?: string | null;
  assignee_name_raw?: string | null;
  due_at?: string | null;
  importance?: number;
  urgency?: number;
  due_time_assumed?: boolean;
  due_unclear?: boolean;
  assignee_unclear?: boolean;
  /** 期限が遠い (イズム: できるだけ短く) */
  due_far?: boolean;
  quote: string;

  // ── 行き先ごとの中身 ───────────────────────────────────────
  // どれも「空 = 読み取れなかった」。**推測で埋めない**（要確認に倒す）

  /** 関係する案件の id。候補一覧に無いものは捨てる（存在しない id で作らない） */
  project_id?: string | null;
  /** お客様（会社）の名前。ネタ案件は commit のときに find-or-create する */
  customer_name?: string | null;
  /** 本文。ネタ案件の要望 / 活動記録の詳細 */
  detail?: string | null;
  /** ネタ案件の分類 A=スタジオ / B=ビジネス。空なら要確認 */
  gls_category?: 'A' | 'B' | null;
  /** 活動記録の種別 (meeting / call / email / other) */
  activity_type?: string | null;
  /** 活動記録の次回アクション */
  next_action?: string | null;
  next_action_date?: string | null;
  /** 議事録の要約・決定事項・持ち帰り */
  summary?: string | null;
  decisions?: { text: string; quote: string }[];
  open_items?: { text: string; owner: string; due: string }[];
}

export interface ParseResult {
  drafts: ParsedDraft[];
  /** タスクにしなかった行 (決定事項など)。画面で「拾わなかったもの」として見せる */
  skipped: { line: string; reason: string }[];
}

export interface ParserUser {
  id: string;
  name: string;
}

// ── 決定事項のマーカー。これらはタスクにしない (会議術 7 / 要件 D4) ──
const DECISION_MARKERS = [
  'に決定', 'と決定', '決まりました', '決まった', 'で合意', '承認された', '承認済',
  '方針は', '方針として', '共有のみ', '報告のみ', 'でOK', 'で了承',
];

// ── 依頼・タスクを示す語。1 つも無ければタスク候補にしない ──
const TASK_MARKERS = [
  'お願い', '依頼', '頼んだ', '頼みました', '対応', '確認', '作成', '準備', '送付', '送る',
  '提出', '手配', '調整', '修正', '共有', '連絡', '発注', '見積', '検討', 'まとめ', '整理',
  'チェック', 'レビュー', '作る', 'やる', '実施', '登録', '発行', '返信', '回答',
];

// ── 宛先が特定できない表現 ──
const VAGUE_ASSIGNEE = [
  '隣の席', 'だれか', '誰か', 'みんな', '皆', '各自', 'チーム', '全員', '担当者',
];

// ── 期限が曖昧な表現。**日付を推測せず人に聞く** (イズム 1-1) ──
const VAGUE_DUE = [
  '今週中', '来週中', '今月中', '来月中', 'なるべく早く', 'なるはや', 'できるだけ早く',
  '早めに', '至急', 'ASAP', 'asap', 'そのうち', '近いうち', '適宜', '随時',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** JST naive の 'YYYY-MM-DD HH:mm' 文字列にする (既存の studio_bookings 等と同じ流儀) */
function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function atHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const WEEKDAYS: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
};

/**
 * 1 行から期限を取り出す。
 * 返り値の timeAssumed は「日付は取れたが時刻が書かれていなかった」= 18:00 を補完した印。
 * unclear は「曖昧な表現なので期限として採用しなかった」= 人に聞く必要がある印。
 */
export function parseDue(
  line: string,
  now: Date
): { dueAt: string | null; timeAssumed: boolean; unclear: boolean } {
  // 曖昧な表現は先に判定して弾く (推測で埋めない)
  if (VAGUE_DUE.some((v) => line.includes(v))) {
    return { dueAt: null, timeAssumed: false, unclear: true };
  }

  // 時刻 (17:00 / 17時 / 17時30分)
  let hour: number | null = null;
  let minute = 0;
  const hm = line.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  const hOnly = line.match(/(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/);
  if (hm) {
    hour = Number(hm[1]); minute = Number(hm[2]);
  } else if (hOnly) {
    hour = Number(hOnly[1]); minute = hOnly[2] ? Number(hOnly[2]) : 0;
  }
  if (hour != null && (hour > 23 || minute > 59)) { hour = null; minute = 0; }

  // 日付: M/D または M月D日
  const md = line.match(/(\d{1,2})\s*[/月]\s*(\d{1,2})\s*日?/);
  if (md) {
    const m = Number(md[1]), d = Number(md[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      // 年をまたぐ指定 (12月に 1/5 と書かれた等) は翌年として解釈する
      let year = now.getFullYear();
      const cand = new Date(year, m - 1, d);
      if (cand.getTime() < atHour(now, 0).getTime() - 180 * 86400000) year += 1;
      const base = new Date(year, m - 1, d);
      if (base.getMonth() !== m - 1) return { dueAt: null, timeAssumed: false, unclear: true };
      return {
        dueAt: fmt(atHour(base, hour ?? DEFAULT_DUE_HOUR, hour != null ? minute : 0)),
        timeAssumed: hour == null,
        unclear: false,
      };
    }
  }

  // 相対日 (今日 / 明日 / 明後日)
  const rel: Record<string, number> = { 今日: 0, 本日: 0, 明日: 1, あした: 1, 明後日: 2, あさって: 2 };
  for (const [word, offset] of Object.entries(rel)) {
    if (line.includes(word)) {
      const base = new Date(now);
      base.setDate(base.getDate() + offset);
      return {
        dueAt: fmt(atHour(base, hour ?? DEFAULT_DUE_HOUR, hour != null ? minute : 0)),
        timeAssumed: hour == null,
        unclear: false,
      };
    }
  }

  // 曜日 (金曜 / 来週月曜)。「〜曜」は直近の未来のその曜日
  const wd = line.match(/(来週|今週)?\s*([日月火水木金土])\s*曜/);
  if (wd) {
    const target = WEEKDAYS[wd[2]];
    const base = new Date(now);
    let delta = (target - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7;               // 同じ曜日は次週として解釈
    if (wd[1] === '来週') delta += 7;
    base.setDate(base.getDate() + delta);
    return {
      dueAt: fmt(atHour(base, hour ?? DEFAULT_DUE_HOUR, hour != null ? minute : 0)),
      timeAssumed: hour == null,
      unclear: false,
    };
  }

  // 時刻だけ書かれている場合は「今日のその時刻」(過ぎていれば明日)
  if (hour != null) {
    let base = atHour(now, hour, minute);
    if (base.getTime() <= now.getTime()) {
      base = new Date(base); base.setDate(base.getDate() + 1);
    }
    return { dueAt: fmt(base), timeAssumed: false, unclear: false };
  }

  return { dueAt: null, timeAssumed: false, unclear: false };
}

/** 行から宛先を取り出す。users と照合して users.id を返す */
export function parseAssignee(
  line: string,
  users: ParserUser[]
): { userId: string | null; nameRaw: string | null; unclear: boolean } {
  if (VAGUE_ASSIGNEE.some((v) => line.includes(v))) {
    return { userId: null, nameRaw: null, unclear: true };
  }

  // 「〇〇さん」「〇〇くん」「〇〇氏」の直前を名前候補として拾う。
  // 姓名の間の空白を許す (「佐藤 実さん」を 1 つの名前として扱う)
  const honorific = line.match(
    /([一-龠ぁ-んァ-ヶa-zA-Z]{1,10}(?:[\s　][一-龠ぁ-んァ-ヶa-zA-Z]{1,10})?)\s*(?:さん|くん|君|氏)/
  );
  const raw = honorific?.[1] ?? null;

  // users と照合。姓のみ / フルネーム / 空白違いを許容する
  const norm = (s: string) => s.replace(/[\s　]/g, '');
  if (raw) {
    const cands = users.filter((u) => {
      const n = norm(u.name);
      return n === norm(raw) || n.startsWith(norm(raw)) || norm(raw).startsWith(n);
    });
    if (cands.length === 1) return { userId: cands[0].id, nameRaw: raw, unclear: false };
    // 同姓が複数いる場合は特定できないので人に選ばせる
    if (cands.length > 1) return { userId: null, nameRaw: raw, unclear: true };
    return { userId: null, nameRaw: raw, unclear: true };
  }

  // 敬称なしでも users 名が本文に出ていれば拾う
  for (const u of users) {
    if (norm(u.name).length >= 2 && norm(line).includes(norm(u.name))) {
      return { userId: u.id, nameRaw: u.name, unclear: false };
    }
  }
  return { userId: null, nameRaw: null, unclear: true };
}

/**
 * 期限の近さから緊急度を提案する。
 * 期限が無ければ 1 (期限が無いのに緊急とは言えない。要件 D9)。
 * これは**提案**で、人が直せる。直した差分が AI の教師データになる。
 *
 * 時間差ではなく**暦日の差**で数える。「明日 18:00」は 32 時間先だが
 * 人の感覚では明日 = 急ぎなので、時間差で判定すると 2 に落ちてしまう。
 */
export function suggestUrgency(dueAt: string | null, now: Date): number {
  if (!dueAt) return 1;
  const due = new Date(dueAt.replace(' ', 'T'));
  if (Number.isNaN(due.getTime())) return 1;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  if (days <= 1) return 3;   // 今日 または 明日
  if (days <= 3) return 2;
  return 1;
}

/** 「重要」「必ず」等が書かれていれば重要度を上げる。既定は中 (2) */
function suggestImportance(line: string): number {
  if (/重要|必ず|マスト|must|優先|クリティカル|最優先/i.test(line)) return 3;
  if (/余裕|急がな|いつでも|参考程度/.test(line)) return 1;
  return 2;
}

/** 氏名 + 敬称。姓名の間の空白を許す (「佐藤 実さん」を 1 つの名前として扱う) */
const HONORIFIC_RE =
  /[一-龠ぁ-んァ-ヶa-zA-Z]{1,10}(?:[\s　][一-龠ぁ-んァ-ヶa-zA-Z]{1,10})?\s*(?:さん|くん|君|氏)/g;

/** 正規表現の特殊文字を無効化する */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 本文から宛先・期限・箇条書き記号を削って「やること」を作る */
function toTitle(line: string): string {
  let s = line
    .replace(/^[\s　]*[-・*●○◆▪>＞]+[\s　]*/, '')      // 箇条書き記号
    .replace(/^[\s　]*\d+[.)．、][\s　]*/, '');           // 番号

  // 宛先 (敬称つき)。助詞まで一緒に落とす
  s = s.replace(new RegExp(HONORIFIC_RE.source + '\\s*(?:に|へ|は|、|,)?', 'g'), '');
  // 宛先が曖昧な表現 (「隣の席の人に」等) も落とす
  for (const v of VAGUE_ASSIGNEE) {
    s = s.replace(new RegExp(escapeRe(v) + '(?:の人)?\\s*(?:に|へ|は|、|,)?', 'g'), '');
  }
  // 曖昧な期限表現 (「今週中に」等) も落とす。期限としては採用していないが本文には残るため
  for (const v of VAGUE_DUE) {
    s = s.replace(new RegExp(escapeRe(v) + '\\s*(?:に|には|で|まで|までに)?', 'gi'), '');
  }

  s = s
    .replace(/(\d{1,2})\s*[/月]\s*(\d{1,2})\s*日?/g, '')
    .replace(/(\d{1,2})\s*[:：]\s*\d{2}/g, '')
    .replace(/(\d{1,2})\s*時(\s*\d{1,2}\s*分)?/g, '')
    .replace(/(来週|今週)?\s*[日月火水木金土]\s*曜(日)?/g, '')
    .replace(/今日|本日|明日|あした|明後日|あさって/g, '')
    .replace(/までに|まで|までで/g, '')
    .replace(/^[\s　]*(に|へ|は|を|、|,)+/, '')
    .replace(/[\s　]{2,}/g, ' ')
    .trim();

  // 依頼の言い回しを落として「やること」だけにする。
  // 「お願いした」「依頼しました」「頼んだ」など活用が多いので語幹 + 任意の続きで拾う
  s = s.replace(/(?:を)?(?:お願い|依頼|頼み|頼ん|お頼み)[^\s　]*[。.]?$/, '').trim();
  s = s.replace(/^[\s　]*(に|へ|は|を|、|,)+/, '').trim();
  s = s.replace(/[。.]$/, '').trim();
  return s;
}

/**
 * 投入テキストを行ごとに解析してタスク案を作る。
 *
 * 保守的に振る舞う: タスクを示す語が無い行、決定事項の行は拾わない。
 * 拾った行でも宛先・期限が確定できなければ印を立てて人に聞く。
 */
export function parseIntakeText(
  text: string,
  users: ParserUser[],
  opts: { now?: Date; defaultAssignee?: string | null } = {}
): ParseResult {
  const now = opts.now ?? new Date();
  const drafts: ParsedDraft[] = [];
  const skipped: { line: string; reason: string }[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    // 見出しらしい行 (「朝会メモ」等) は本文が無いので飛ばす
    if (line.length <= 6 && !TASK_MARKERS.some((m) => line.includes(m))) {
      skipped.push({ line, reason: '見出しとみなしました' });
      continue;
    }
    if (DECISION_MARKERS.some((m) => line.includes(m))) {
      skipped.push({ line, reason: '決定事項なのでタスクにしませんでした' });
      continue;
    }
    if (!TASK_MARKERS.some((m) => line.includes(m))) {
      skipped.push({ line, reason: 'やることが読み取れませんでした' });
      continue;
    }

    const due = parseDue(line, now);
    const who = parseAssignee(line, users);
    const title = toTitle(line);
    if (!title) {
      skipped.push({ line, reason: 'やることの内容が抽出できませんでした' });
      continue;
    }

    const dueFar = due.dueAt
      ? (new Date(due.dueAt.replace(' ', 'T')).getTime() - now.getTime()) / 86400000 > LONG_DUE_DAYS
      : false;

    drafts.push({
      // **規則ベースは行き先を判断しない。** 正規表現でお客様や案件は読めないので、
      // 全部タスクに倒す（AI が落ちた日に、勝手に案件が作られるほうが困る）
      dest: 'task',
      title,
      assigned_to: who.userId ?? opts.defaultAssignee ?? null,
      assignee_name_raw: who.nameRaw,
      // 宛先が読めなくても投入者を既定にはしない (誤って自分のタスクになるため)。
      // ただし defaultAssignee が明示的に渡された場合のみ使う。
      assignee_unclear: who.unclear && !opts.defaultAssignee,
      due_at: due.dueAt,
      due_time_assumed: due.timeAssumed,
      due_unclear: due.unclear || !due.dueAt,
      due_far: dueFar,
      importance: suggestImportance(line),
      urgency: suggestUrgency(due.dueAt, now),
      quote: line,
    });
  }

  return { drafts, skipped };
}
