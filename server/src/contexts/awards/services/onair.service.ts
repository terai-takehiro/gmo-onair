/**
 * 送出（本番中に見る唯一の画面）— デザイン 20章 24a / 仕様書 §7.7
 *
 * 送出画面が4つ (ランキング / 字幕スーパー / クイズ / 統合コックピット) に分かれ、
 * 準備の設定と本番の操作が同じ画面に混ざっていた。
 * **本番は1画面・準備は別画面**に分ける。
 *
 * ── なぜ「次のTAKEで何が出るか」をサーバーが決めるか ──────
 *
 * 送出の順番 (IDLE → TITLE → NOMINEES → … → CELEB) は
 * これまで**画面の中の定数**だった。本番中に見る画面が1つになると、
 * 「いま出ているもの」と「次に出るもの」を同じ根拠で出す必要がある。
 * 2か所に順番を書くと、**画面には「次はWINNER BAR」と出ているのに
 * 実際は別のものが出る**ことが起きる。ここを正にする。
 *
 * ── 出したままを見張る ──────────────────────────────────
 *
 * 字幕スーパーが出たままになっているのは、本番中に気づけない事故の型。
 * 何分出ているかを数えて、その場で消せるようにする。
 *
 * ── 送出そのものの経路は変えていない ────────────────────
 *
 * TAKE / CLEAR は既存の `POST /events/:id/cue` と `/oneshot/cue` をそのまま使う。
 * ここが返すのは**見せ方の情報だけ**で、出る絵は1バイトも変わらない。
 */
import { queryOne, queryAll } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export type CgStep =
  | 'idle' | 'title' | 'nominees' | 'ranks52' | 'top3' | 'final-pitch'
  | 'winner-bar' | 'oneshot' | 'celebration' | 'survey-oneshot';

export interface StepDef {
  step: CgStep;
  label: string;
  /** 何が出るか。画面にそのまま出す */
  desc: string;
  tone: 'neutral' | 'live' | 'award';
}

/** 直接発表のパターン (順番はここが正) */
export const STEPS_DIRECT: StepDef[] = [
  { step: 'idle',        label: 'IDLE',       desc: '透過（何も出ていません）',       tone: 'neutral' },
  { step: 'title',       label: 'TITLE',      desc: 'タイトルカード',                 tone: 'neutral' },
  { step: 'nominees',    label: 'NOMINEES',   desc: 'ノミネート一覧',                 tone: 'live' },
  { step: 'ranks52',     label: 'RANKS 5→2',  desc: '5位→2位の発表（ランキングバー）', tone: 'live' },
  { step: 'winner-bar',  label: 'WINNER BAR', desc: '1位バー（大賞引き）',            tone: 'award' },
  { step: 'oneshot',     label: 'ONE SHOT',   desc: '大賞フルスクリーン',             tone: 'award' },
  { step: 'celebration', label: 'CELEB',      desc: '全部門 No.1 と紙吹雪',           tone: 'award' },
];

/** 投票のパターン */
export const STEPS_VOTE: StepDef[] = [
  { step: 'idle',        label: 'IDLE',       desc: '透過（何も出ていません）', tone: 'neutral' },
  { step: 'title',       label: 'TITLE',      desc: 'タイトルカード',           tone: 'neutral' },
  { step: 'nominees',    label: 'NOMINEES',   desc: 'ノミネート一覧',           tone: 'live' },
  { step: 'top3',        label: 'BEST 3',     desc: 'TOP3 の発表',              tone: 'live' },
  { step: 'final-pitch', label: 'PITCH',      desc: 'ファイナルピッチ（3名→1名）', tone: 'live' },
  { step: 'celebration', label: 'CELEB',      desc: '全部門 No.1 と紙吹雪',     tone: 'award' },
];

/** 連動アンケートを持つ部門だけ末尾に足す */
export const SURVEY_STEP: StepDef = {
  step: 'survey-oneshot', label: 'SURVEY No.1', desc: 'アンケート No.1 の発表', tone: 'award',
};

/** 何かが出ている状態のステップ */
const LIVE_STEPS: CgStep[] = [
  'nominees', 'ranks52', 'top3', 'final-pitch', 'winner-bar', 'oneshot', 'celebration', 'survey-oneshot',
];

/** 出したままが何分続いたら知らせるか (字幕スーパーは特に事故になりやすい) */
export const LEFTOVER_MINUTES = 5;

/**
 * キー操作。**画面に一覧を出す** (覚えていないと本番で使えない)。
 * 既定では効かない — v2.9.96 でショートカットを全廃したのは
 * **誤って触ると本番に出てしまう**ためで、その判断は変えない。
 * 画面で「キー操作を使う」を入れたときだけ効く形にする。
 */
export const KEY_OPS = [
  { key: 'Space', what: '次のTAKE（いま「次に出るもの」に書かれているものを出す）' },
  { key: 'Backspace', what: '1つ戻す' },
  { key: 'Esc', what: 'CLEAR（出ているものを消す）' },
] as const;

export const LAYERS = [
  { key: 'oneshot', label: '字幕スーパー' },
  { key: 'ranking', label: 'ランキングCG' },
  { key: 'quiz',    label: 'クイズ・アンケート' },
] as const;

/** 出力の用途。?bg=1 / ?audio=1 / ?lang=en を人に組み立てさせない (24b) */
export const OUTPUT_USES = [
  { key: 'ranking', label: 'ランキングCG', path: '/awards/output/{ev}' },
  { key: 'oneshot', label: '字幕スーパー', path: '/awards/output/{ev}/oneshot' },
  { key: 'quiz',    label: 'クイズ・アンケート', path: '/awards/output/quiz-stack/{ev}' },
] as const;

/**
 * その部門のステップの並びを返す。
 * 画面の定数ではなくここが正 — 2か所に書くと「次はこれ」と出したものと
 * 実際に出るものがずれる。
 */
export function stepsFor(opts: {
  pattern: 'direct' | 'vote';
  isLastDivision: boolean;
  hasSurvey: boolean;
}): StepDef[] {
  let steps = opts.pattern === 'vote' ? [...STEPS_VOTE] : [...STEPS_DIRECT];
  // 紙吹雪 (CELEB) は最後の部門だけ
  if (!opts.isLastDivision) steps = steps.filter((s) => s.step !== 'celebration');
  // 連動アンケートを持つ部門は末尾に足す (CELEB とは同時に出さない)
  if (opts.hasSurvey) {
    steps = steps.filter((s) => s.step !== 'celebration');
    steps = [...steps, SURVEY_STEP];
  }
  return steps;
}

/** いま出ているステップの次に出るもの。最後まで来ていれば null */
export function nextOf(steps: StepDef[], current: CgStep): StepDef | null {
  const i = steps.findIndex((s) => s.step === current);
  if (i < 0) return steps[1] ?? null;      // 知らないステップなら先頭の次
  return steps[i + 1] ?? null;
}

/** 1つ戻す先。先頭なら null */
export function prevOf(steps: StepDef[], current: CgStep): StepDef | null {
  const i = steps.findIndex((s) => s.step === current);
  if (i <= 0) return null;
  return steps[i - 1] ?? null;
}

const elapsedSec = (t: unknown): number | null => {
  if (!t) return null;
  const d = new Date(String(t));
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
};

/**
 * 送出画面が要るものを1本で返す。
 *
 * **次のTAKEで何が出るかを必ず返す** — 本番中に「次に何が出るか分からないまま
 * TAKE を押す」のがいちばん危ない。
 */
export async function getOnAir(eventId: number) {
  const event = (await queryOne(
    `SELECT id, name, subtitle, status FROM awards_events WHERE id = ?`, [eventId])) as any;
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const cue = (await queryOne(
    `SELECT step, category_id, oneshot_style, scrim_opacity, updated_at
       FROM awards_cue_state WHERE event_id = ?`, [eventId])) as any;
  const oneshot = (await queryOne(
    `SELECT is_live, module_key, lang, updated_at FROM awards_oneshot_cue_state WHERE event_id = ?`,
    [eventId])) as any;
  const quiz = (await queryOne(
    `SELECT step, updated_at FROM quiz_stack_state WHERE event_id = ?`, [eventId])) as any;

  const step = (cue?.step ?? 'idle') as CgStep;

  const categories = (await queryAll(
    `SELECT id, name, display_order, award_pattern,
            (SELECT COUNT(*) FROM awards_entries e WHERE e.category_id = c.id) AS entry_count
       FROM awards_categories c
      WHERE c.event_id = ? ORDER BY c.display_order, c.id`, [eventId])) as any[];

  const currentIdx = categories.findIndex((c) => Number(c.id) === Number(cue?.category_id));
  const current = currentIdx >= 0 ? categories[currentIdx] : null;
  const isLastDivision = currentIdx >= 0 && currentIdx === categories.length - 1;

  let hasSurvey = false;
  if (current) {
    // 連動アンケートは quizzes 側にある (mode='survey' + link_category_id)。
    // ControlPage が見ているものと同じ条件にする — 条件がずれると
    // 画面に出す「次」と実際に出るものが食い違う。
    const s = await queryOne(
      `SELECT 1 AS x FROM quizzes
        WHERE event_id = ? AND link_category_id = ?
          AND mode = 'survey' AND survey_pattern = 'top-reveal' LIMIT 1`,
      [eventId, current.id]).catch(() => null);
    hasSurvey = Boolean(s);
  }

  const steps = stepsFor({
    pattern: current?.award_pattern === 'vote' ? 'vote' : 'direct',
    isLastDivision, hasSurvey,
  });
  const currentDef = steps.find((s) => s.step === step) ?? steps[0];
  const next = nextOf(steps, step);
  const prev = prevOf(steps, step);
  // そのあと何が起きるか (次の次から先)。本番中に流れを追えるようにする
  const afterIdx = next ? steps.findIndex((s) => s.step === next.step) : -1;
  const after = afterIdx >= 0 ? steps.slice(afterIdx + 1) : [];

  // 出したままの見張り
  const leftover: Array<{ layer: string; label: string; minutes: number }> = [];
  const oneshotSec = elapsedSec(oneshot?.updated_at);
  if (oneshot?.is_live && oneshotSec != null && oneshotSec >= LEFTOVER_MINUTES * 60) {
    leftover.push({ layer: 'oneshot', label: '字幕スーパー', minutes: Math.floor(oneshotSec / 60) });
  }
  const rankSec = elapsedSec(cue?.updated_at);
  if (LIVE_STEPS.includes(step) && rankSec != null && rankSec >= LEFTOVER_MINUTES * 60) {
    leftover.push({ layer: 'ranking', label: 'ランキングCG', minutes: Math.floor(rankSec / 60) });
  }
  const quizStep = String(quiz?.step ?? 'idle');
  const quizSec = elapsedSec(quiz?.updated_at);
  if (quizStep !== 'idle' && quizSec != null && quizSec >= LEFTOVER_MINUTES * 60) {
    leftover.push({ layer: 'quiz', label: 'クイズ・アンケート', minutes: Math.floor(quizSec / 60) });
  }

  return {
    event: { id: Number(event.id), name: String(event.name), subtitle: event.subtitle ?? null },
    layers: [
      { key: 'oneshot', label: '字幕スーパー', live: Boolean(oneshot?.is_live),
        step: oneshot?.module_key ?? null, elapsed_sec: oneshot?.is_live ? oneshotSec : null },
      { key: 'ranking', label: 'ランキングCG', live: LIVE_STEPS.includes(step),
        step, step_label: currentDef?.label ?? step,
        elapsed_sec: LIVE_STEPS.includes(step) ? rankSec : null },
      { key: 'quiz', label: 'クイズ・アンケート', live: quizStep !== 'idle',
        step: quizStep, elapsed_sec: quizStep !== 'idle' ? quizSec : null },
    ],
    // PROGRAM: いま出ているもの
    program: {
      step, label: currentDef?.label ?? step, desc: currentDef?.desc ?? '',
      tone: currentDef?.tone ?? 'neutral',
      category_name: current?.name ?? null,
      category_position: currentIdx >= 0 ? `部門 ${currentIdx + 1}/${categories.length}` : null,
      entry_count: current ? Number(current.entry_count) : null,
      since_sec: rankSec,
      also_live: oneshot?.is_live ? '字幕スーパーも出ています' : null,
    },
    // NEXT: 次のTAKEで出るもの。**これが無いままTAKEを押させない**
    next: next ? { step: next.step, label: next.label, desc: next.desc, tone: next.tone } : null,
    prev: prev ? { step: prev.step, label: prev.label } : null,
    after: after.map((s) => ({ step: s.step, label: s.label })),
    steps: steps.map((s) => ({ step: s.step, label: s.label, desc: s.desc, tone: s.tone })),
    // 出したまま
    leftover,
    leftover_minutes: LEFTOVER_MINUTES,
    // 出したまま変えられるもの (TAKEし直す必要がない)
    live_adjust: {
      oneshot_style: cue?.oneshot_style ?? 'classic',
      scrim_opacity: cue?.scrim_opacity == null ? 0.72 : Number(cue.scrim_opacity),
    },
    keys: KEY_OPS,
    categories: categories.map((c, i) => ({
      id: Number(c.id), name: String(c.name), entry_count: Number(c.entry_count),
      current: i === currentIdx,
    })),
  };
}

/**
 * 出力URLを組み立てる (24b)。
 * `?bg=1` / `?audio=1` / `?lang=en` を**人に組み立てさせない** —
 * 手で作ると本番で1文字違いの URL を貼ることになる。
 */
export function buildOutputUrl(opts: {
  eventId: number; use: string; audio?: boolean; lang?: string; opaque?: boolean;
}) {
  const def = OUTPUT_USES.find((u) => u.key === opts.use);
  if (!def) {
    throw new AppError(400, 'VALIDATION_ERROR', 'その用途はありません（ランキングCG / 字幕スーパー / クイズ・アンケート）');
  }
  const q = new URLSearchParams();
  q.set('lang', opts.lang === 'en' ? 'en' : 'ja');
  if (opts.audio) q.set('audio', '1');
  // 既定は透過。背景を付けたいときだけ bg=1 (OBS で透明度を許可しない場合)
  if (opts.opaque) q.set('bg', '1');

  const url = `${def.path.replace('{ev}', String(opts.eventId))}?${q.toString()}`;
  return {
    url,
    label: def.label,
    // 何が付いたかを日本語で返す (画面がそのまま出せる)
    parts: [
      def.label,
      opts.audio ? '音を鳴らす' : '音を鳴らさない',
      opts.lang === 'en' ? '英語' : '日本語',
      opts.opaque ? '背景あり' : '透過',
    ],
    hint: 'ブラウザソースは 1920×1080 で作り、「透明度を許可」をONにしてください。',
  };
}
