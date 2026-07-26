/**
 * 運営マニュアル (デザイン 22章 29a/29b/29c / 仕様書 §7.8)
 *
 * いただいた PDF (31ページ) を分解すると、どの案件でも使う部品は**12種**だった。
 * **PDFを作る機能ではなく、部品を作って最後に束ねる機能**にする。
 * 3〜4時間 → 15分。
 *
 * ── 部品ごとに「できているか」を持つ ────────────────────
 *
 * 部品はそれぞれ別のタイミングで揃う。1冊まるごとを1レコードにすると
 * 「何が足りないか」が言えない。だから部品ごとに `ready` を持ち、
 * **足りないものは名前で指摘する**。白紙のページは作らない
 * (「これから作ります」と印を付けて出せる)。
 *
 * ── 渡す相手ごとに外すものが決まっている ────────────────
 *
 * 連絡先と原価が入るページは社外版から**自動で外す**。
 * 人が毎回消すと必ず1回は消し忘れる。
 *
 * ── 出した版は変わらない ────────────────────────────────
 *
 * PDF にした瞬間の中身を残す。あとで部品を直しても配った版は変わらない。
 *
 * ── AI は会場図の下書きだけ ──────────────────────────────
 *
 * 会社方針「AIを使い捨てにしない」の5条件を満たす:
 *  1. 出力の記録 … `ai_outputs` (kind=`venue_layout_draft`・図の要素の全文)
 *  2. 修正の差分 … 保存のたびにサーバーが `diffByKey` で突合。**鍵は記号**
 *     (index だと1つ足すだけで以降全部が「変更」になり修正率が実態とかけ離れる)
 *  3. 成果 …… `ai_outcomes` (PDFに出した / 出さなかった・版数)
 *  4. 還流 …… 生成前に `getFeedbackDigest('venue_layout_draft')` を読んでプロンプトに載せる
 *  5. レビュー … MCP `get_ai_feedback_digest` と `/review` (既存の経路にそのまま乗る)
 */
import * as z from 'zod/v4';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import {
  recordAiOutput, recordCorrections, recordAiOutcome, findLatestAiOutput, diffByKey,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';

export const AI_KIND = 'venue_layout_draft';
const PROMPT_VERSION = 'v1';
const TIMEOUT_MS = 60_000;

/** 誰が埋めるか */
export type PartFill = 'auto' | 'semi' | 'manual' | 'template';

export interface ManualPartDef {
  kind: string;
  label: string;
  /** いただいた PDF のどのページにあたるか (対応が分かるように残す) */
  src: string;
  fill: PartFill;
  from: string;
  /** 社外に出す版で外すか (連絡先・原価が入るページ) */
  internal_only: boolean;
}

/**
 * 部品12種。**この構成は変えない** (最大公約数として決めたもの)。
 * 増やすときは「どの案件でも使うか」を確かめてから。
 */
export const MANUAL_PARTS: ManualPartDef[] = [
  { kind: 'cover',      label: '表紙・改訂履歴',       src: 'P1',      fill: 'auto',     from: '案件名・日付・版数', internal_only: false },
  { kind: 'contacts',   label: '当日の連絡先',         src: 'P29-30',  fill: 'auto',     from: 'スタッフ表から', internal_only: true },
  { kind: 'staff',      label: 'スタッフ表',           src: 'P8',      fill: 'auto',     from: '案件メンバーとパートナー', internal_only: false },
  { kind: 'call_sheet', label: '香盤表',               src: 'P9-10',   fill: 'auto',     from: '21章でつくったもの', internal_only: false },
  { kind: 'rundown',    label: '進行表',               src: 'P12-13',  fill: 'auto',     from: 'Qシートから', internal_only: false },
  { kind: 'venue_map',  label: '会場図・動線',         src: 'P11',     fill: 'semi',     from: 'AIが下書き（平面図はBoxから）', internal_only: false },
  { kind: 'layout',     label: '配置図',               src: 'P14-22',  fill: 'semi',     from: '記号と凡例はスタッフ表から', internal_only: false },
  { kind: 'set',        label: 'セット・美術',         src: 'P5-7',    fill: 'manual',   from: '手で入れる（画像）', internal_only: false },
  { kind: 'awardees',   label: '受賞者・登壇者一覧',   src: 'P28',     fill: 'auto',     from: 'リアルタイムCGのノミネートから', internal_only: false },
  { kind: 'technical',  label: 'テクニカル',           src: '—',       fill: 'auto',     from: '技術資料から', internal_only: true },
  { kind: 'catering',   label: 'ケータリング・備品',   src: 'P25',     fill: 'manual',   from: '手で入れる', internal_only: false },
  { kind: 'emergency',  label: '緊急時の動き',         src: '—',       fill: 'template', from: '定型から入れる', internal_only: false },
];

/** 渡す相手。社外版から外すものが決まっている */
export const AUDIENCES = [
  { key: 'internal', label: '社内・パートナー', detail: '全部入り。連絡先と原価も出ます' },
  { key: 'client',   label: 'お客様（主催）',   detail: '進行と会場図まで。社内レーンと原価を外します' },
  { key: 'staff',    label: '当日のアルバイト', detail: '自分の担当と動線だけ。3ページに収めます' },
] as const;
export type Audience = (typeof AUDIENCES)[number]['key'];

/** アルバイト版に入れる部品 (自分の担当と動線だけ・3ページに収める) */
const STAFF_PARTS = ['cover', 'call_sheet', 'layout'];

/** 出すときの決まり。画面にそのまま出す */
export const OUT_RULES = [
  '版数と更新日は表紙に必ず入れます（現場で古い紙が混ざるのを防ぐため）。',
  '各ページの右下に「第○版 月/日」を刷ります。',
  'PDFにした瞬間の中身を残します（あとで部品を直しても、配った版は変わりません）。',
  'できていない部品は、白紙にせず「これから作ります」と印を付けて出せます。',
] as const;

/** 配置図の場面。場面ごとに1枚 */
export const SCENES = ['setup', 'rehearsal', 'performance', 'teardown'] as const;
export const SCENE_LABELS: Record<string, string> = {
  setup: '設営', rehearsal: 'リハーサル', performance: '本番', teardown: '撤収',
};

/** 記号。凡例は置いた記号を数えて勝手にできる */
export const SYMBOLS = [
  { mark: '進', label: '進行' },
  { mark: 'AD', label: '運営AD' },
  { mark: 'C',  label: 'カメラ' },
  { mark: 'S',  label: '受賞者' },
  { mark: 'D',  label: 'ホスト・役員' },
  { mark: 'T',  label: 'トロフィー台' },
] as const;

async function assertProject(projectId: string) {
  const p = (await queryOne(
    `SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL`, [projectId])) as any;
  if (!p) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  return p;
}

// ───────────────────────────────────────────────────────
// 1冊を用意する
// ───────────────────────────────────────────────────────

/** その案件の1冊を用意する。**二度作らない** (冪等)。部品12種の枠も同時に作る */
export async function ensureManual(projectId: string, userId: string) {
  const project = await assertProject(projectId);

  const existing = (await queryOne(
    `SELECT * FROM manuals WHERE project_id = ? AND deleted_at IS NULL`, [projectId])) as any;
  const id = existing?.id ?? uuidv4();
  if (!existing) {
    await execute(
      `INSERT INTO manuals (id, project_id, title, created_by, updated_by) VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, `${project.name} 運営マニュアル`, userId, userId]
    );
  }
  // 部品の枠を12種そろえる (足りないものだけ作る)
  for (const def of MANUAL_PARTS) {
    await execute(
      `INSERT INTO manual_parts (id, manual_id, kind) VALUES (?, ?, ?)
       ON CONFLICT (manual_id, kind) DO NOTHING`,
      [uuidv4(), id, def.kind]
    );
  }
  return (await queryOne(`SELECT * FROM manuals WHERE id = ?`, [id])) as any;
}

/**
 * 1冊を組み立てて返す。
 * **できていない部品を名前で指摘する** — 何が足りないか分からないと動けない。
 */
export async function getManual(manualId: string, audience: Audience = 'internal') {
  const manual = (await queryOne(
    `SELECT m.*, p.name AS project_name, p.event_start, p.gls_number
       FROM manuals m JOIN projects p ON p.id = m.project_id
      WHERE m.id = ? AND m.deleted_at IS NULL`, [manualId])) as any;
  if (!manual) throw new AppError(404, 'NOT_FOUND', '運営マニュアルが見つかりません');

  const rows = (await queryAll(
    `SELECT * FROM manual_parts WHERE manual_id = ?`, [manualId])) as any[];
  const byKind = new Map(rows.map((r) => [String(r.kind), r]));

  // 自動で入る部品は「元データがあるか」で ready を出す (人が押さなくてよい)
  const auto = await autoReadiness(String(manual.project_id));

  const parts = MANUAL_PARTS.map((def) => {
    const row = byKind.get(def.kind);
    const readyByData = def.fill === 'auto' ? auto[def.kind] === true : Boolean(row?.ready);
    return {
      ...def,
      id: row?.id ?? null,
      content: row?.content ?? {},
      ready: readyByData,
      ai_drafted: Boolean(row?.ai_drafted),
      // その版に入るか (渡す相手で変わる)
      included: includedIn(def, audience),
    };
  });

  const included = parts.filter((p) => p.included);
  const notReady = included.filter((p) => !p.ready);

  const layouts = (await queryAll(
    `SELECT l.*, (SELECT COUNT(*) FROM manual_layout_items i WHERE i.layout_id = l.id) AS item_count
       FROM manual_layouts l WHERE l.manual_id = ? ORDER BY l.scene`, [manualId])) as any[];

  const issues = (await queryAll(
    `SELECT id, version, audience, page_count, issued_at FROM manual_issues
      WHERE manual_id = ? ORDER BY version DESC, issued_at DESC LIMIT 10`, [manualId])) as any[];

  return {
    ...manual,
    audience,
    audiences: AUDIENCES,
    out_rules: OUT_RULES,
    scenes: SCENES.map((s) => ({ key: s, label: SCENE_LABELS[s] })),
    symbols: SYMBOLS,
    parts,
    // 目次。included だけ並べ、できていないものに印を付ける
    toc: included.map((p, i) => ({
      no: i + 1, kind: p.kind, label: p.label, warn: !p.ready,
    })),
    not_ready: notReady.map((p) => p.label),
    not_ready_count: notReady.length,
    layouts: layouts.map((l) => ({
      ...l,
      scene_label: SCENE_LABELS[String(l.scene)] ?? String(l.scene),
      item_count: Number(l.item_count),
    })),
    issues,
  };
}

/** その部品がこの版に入るか */
function includedIn(def: ManualPartDef, audience: Audience): boolean {
  if (audience === 'internal') return true;
  // お客様に渡す版では、連絡先と原価が入るページを自動で外す
  if (audience === 'client') return !def.internal_only;
  // アルバイト版は自分の担当と動線だけ
  return STAFF_PARTS.includes(def.kind);
}

/**
 * 自動で入る部品が「揃っているか」を元データから見る。
 * 人に「できました」を押させない — 押し忘れると足りないことになる。
 */
async function autoReadiness(projectId: string): Promise<Record<string, boolean>> {
  const one = async (sql: string, params: unknown[]) => {
    try { return Number(((await queryOne(sql, params)) as any)?.c ?? 0) > 0; } catch { return false; }
  };
  return {
    cover: true, // 案件名と日付は必ずある
    contacts: await one(
      `SELECT COUNT(*) AS c FROM project_members WHERE project_id = ? AND deleted_at IS NULL`, [projectId]),
    staff: await one(
      `SELECT COUNT(*) AS c FROM project_members WHERE project_id = ? AND deleted_at IS NULL`, [projectId]),
    call_sheet: await one(
      `SELECT COUNT(*) AS c FROM call_sheets WHERE project_id = ? AND deleted_at IS NULL`, [projectId]),
    rundown: await one(
      `SELECT COUNT(*) AS c FROM qsheet_documents WHERE project_id = ? AND deleted_at IS NULL`, [projectId]),
    awardees: await one(
      `SELECT COUNT(*) AS c FROM qsheet_documents WHERE project_id = ? AND deleted_at IS NULL`, [projectId]),
    technical: await one(
      `SELECT COUNT(*) AS c FROM techsheet_documents WHERE project_id = ? AND deleted_at IS NULL`, [projectId]),
  };
}

/** 部品の中身を入れる (手で入れる部品と、AI下書きを直したもの) */
export async function savePart(
  manualId: string, kind: string,
  body: { content?: unknown; ready?: boolean }, userId: string
) {
  if (!MANUAL_PARTS.some((p) => p.kind === kind)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'その部品はありません（12種は決まっています）');
  }
  const row = (await queryOne(
    `SELECT * FROM manual_parts WHERE manual_id = ? AND kind = ?`, [manualId, kind])) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'その部品が見つかりません');

  await execute(
    `UPDATE manual_parts SET content = COALESCE(?::jsonb, content), ready = COALESCE(?, ready),
            updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [body.content === undefined ? null : JSON.stringify(body.content),
     body.ready === undefined ? null : body.ready, userId, row.id]
  );
  return getManual(manualId);
}

// ───────────────────────────────────────────────────────
// 配置図
// ───────────────────────────────────────────────────────

export async function getLayout(manualId: string, scene: string) {
  if (!(SCENES as readonly string[]).includes(scene)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'その場面はありません（設営・リハーサル・本番・撤収）');
  }
  const manual = await queryOne(
    `SELECT id, project_id FROM manuals WHERE id = ? AND deleted_at IS NULL`, [manualId]) as any;
  if (!manual) throw new AppError(404, 'NOT_FOUND', '運営マニュアルが見つかりません');

  let layout = (await queryOne(
    `SELECT * FROM manual_layouts WHERE manual_id = ? AND scene = ?`, [manualId, scene])) as any;
  if (!layout) {
    const id = uuidv4();
    await execute(
      `INSERT INTO manual_layouts (id, manual_id, scene) VALUES (?, ?, ?)`, [id, manualId, scene]);
    layout = (await queryOne(`SELECT * FROM manual_layouts WHERE id = ?`, [id])) as any;
  }

  const items = (await queryAll(
    `SELECT i.*, m.member_name FROM manual_layout_items i
       LEFT JOIN project_members m ON m.id = i.member_id AND m.deleted_at IS NULL
      WHERE i.layout_id = ? ORDER BY i.created_at`, [layout.id])) as any[];

  // 凡例は置いた記号を数えて勝手にできる (人が作らない)
  const legend = SYMBOLS.map((s) => ({
    ...s, count: items.filter((i) => String(i.mark) === s.mark).length,
  })).filter((s) => s.count > 0);

  return {
    ...layout,
    scene_label: SCENE_LABELS[scene],
    items: items.map((i) => ({
      ...i,
      // 名前はメンバー側から引く (図に写さない)
      label: i.member_name ? String(i.member_name) : String(i.label),
    })),
    legend,
    symbols: SYMBOLS,
  };
}

/** 図に記号を置く / 動かす */
export async function putLayoutItem(
  layoutId: string, body: {
    id?: string; mark?: string; label?: string; x?: number; y?: number;
    member_id?: string | null; note?: string | null;
  }
) {
  const layout = (await queryOne(`SELECT * FROM manual_layouts WHERE id = ?`, [layoutId])) as any;
  if (!layout) throw new AppError(404, 'NOT_FOUND', 'その配置図が見つかりません');

  const clamp = (v: unknown) => Math.max(0, Math.min(1000, Math.round(Number(v ?? 0))));

  if (body.id) {
    const row = await queryOne(
      `SELECT id FROM manual_layout_items WHERE id = ? AND layout_id = ?`, [body.id, layoutId]);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'その記号は見つかりません');
    await execute(
      `UPDATE manual_layout_items SET mark = COALESCE(?, mark), label = COALESCE(?, label),
              x = ?, y = ?, member_id = ?, note = ? WHERE id = ?`,
      [body.mark ?? null, body.label ?? null, clamp(body.x), clamp(body.y),
       body.member_id ?? null, body.note ?? null, body.id]
    );
    return getLayout(String(layout.manual_id), String(layout.scene));
  }

  if (!body.mark) throw new AppError(400, 'VALIDATION_ERROR', 'どの記号を置くか選んでください');
  if (!SYMBOLS.some((s) => s.mark === body.mark)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'その記号はありません');
  }
  const def = SYMBOLS.find((s) => s.mark === body.mark)!;
  await execute(
    `INSERT INTO manual_layout_items (id, layout_id, mark, label, x, y, member_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), layoutId, body.mark, body.label?.trim() || def.label,
     clamp(body.x), clamp(body.y), body.member_id ?? null, body.note ?? null]
  );
  return getLayout(String(layout.manual_id), String(layout.scene));
}

export async function deleteLayoutItem(layoutId: string, itemId: string) {
  const layout = (await queryOne(`SELECT * FROM manual_layouts WHERE id = ?`, [layoutId])) as any;
  if (!layout) throw new AppError(404, 'NOT_FOUND', 'その配置図が見つかりません');
  const row = await queryOne(
    `SELECT id FROM manual_layout_items WHERE id = ? AND layout_id = ?`, [itemId, layoutId]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'その記号は見つかりません');
  await execute(`DELETE FROM manual_layout_items WHERE id = ?`, [itemId]);
  return getLayout(String(layout.manual_id), String(layout.scene));
}

// ───────────────────────────────────────────────────────
// AI が会場図を下書きする (5条件つき)
// ───────────────────────────────────────────────────────

const DraftSchema = z.object({
  items: z.array(z.object({
    mark: z.string().describe('記号。進 / AD / C / S / D / T のいずれか'),
    label: z.string().describe('その記号が何を指すか（短く）'),
    x: z.number().describe('横の位置。0（左端）〜1000（右端）'),
    y: z.number().describe('縦の位置。0（奥・ステージ側）〜1000（手前・客席側）'),
    why: z.string().describe('なぜそこに置いたか（人が直す判断に使う）'),
  })).describe('図に置く記号'),
});

const SYSTEM_PROMPT = [
  'あなたはイベント運営の配置図を下書きします。',
  '部屋の標準的な形・カメラ台数・出演者数から、記号のおおよその位置を置いてください。',
  '**実測はしていません。** 人が実測と動線を直す前提の下書きです。',
  '置ける記号は指定されたものだけです。勝手に増やさないでください。',
  '位置は 0〜1000 の相対で、0,0 が左奥（ステージ側）です。',
].join('\n');

function resolveProvider(): { provider: 'openai' | 'anthropic'; model: string } | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', model: process.env.AI_MODEL_ANTHROPIC || 'claude-sonnet-5' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', model: process.env.AI_MODEL_OPENAI || 'gpt-5' };
  }
  return null;
}

/**
 * AI に配置図を下書きさせる。
 *
 * **確定はしない。** 人が実測と動線を直す前提。
 * 条件4: 生成前に前回までの傾向 (人がどこを直したか) を読んでプロンプトに載せる。
 */
export async function draftLayoutWithAi(
  manualId: string, scene: string, actor: { userId: string }
) {
  const layout = await getLayout(manualId, scene);
  const manual = (await queryOne(
    `SELECT m.*, p.name AS project_name FROM manuals m JOIN projects p ON p.id = m.project_id
      WHERE m.id = ?`, [manualId])) as any;

  const resolved = resolveProvider();
  if (!resolved) {
    throw new AppError(
      503, 'AI_NOT_CONFIGURED',
      'AIの下書きはいま使えません。記号を選んで自分で置くこともできます'
    );
  }

  // 条件4: 貯めたデータを改善に戻す — 傾向をプロンプトに載せる
  let advice = '';
  try {
    const digest = await getFeedbackDigest(AI_KIND, 90);
    // advice は配列 (「items[].x は3件修正」のような1行が並ぶ)
    advice = (digest.advice ?? []).join('\n');
  } catch { advice = ''; }

  const members = (await queryAll(
    `SELECT member_name, role FROM project_members WHERE project_id = ? AND deleted_at IS NULL`,
    [manual.project_id])) as any[];
  const rooms = (await queryAll(
    `SELECT DISTINCT r.name FROM studio_bookings b
       JOIN studio_booking_rooms br ON br.booking_id = b.id
       JOIN studio_rooms r ON r.id = br.room_id
      WHERE b.project_id = ? AND b.deleted_at IS NULL`, [manual.project_id])) as any[];

  const lines = [
    '# この案件',
    `案件名: ${manual.project_name}`,
    `場面: ${SCENE_LABELS[scene]}`,
    rooms.length ? `使う部屋: ${rooms.map((r) => r.name).join(' / ')}` : '使う部屋: （未定）',
    '',
    '# 置ける記号',
    ...SYMBOLS.map((s) => `- ${s.mark} … ${s.label}`),
    '',
    '# 案件のメンバー（人の記号はこの人たちを指します）',
    ...(members.length ? members.map((m) => `- ${m.member_name}${m.role ? `（${m.role}）` : ''}`) : ['- （未登録）']),
  ];
  if (advice) {
    lines.push('', '# 前回までの傾向（人がどこを直したか）', advice, '',
      '**傾向は置き方の重み付けにだけ使ってください。書かれていないものを増やしてはいけません。**');
  }
  const prompt = lines.join('\n');

  let parsed: z.infer<typeof DraftSchema>;
  try {
    parsed = await callDraftAi(resolved.model, resolved.provider, prompt);
  } catch (e) {
    throw new AppError(502, 'AI_FAILED', `下書きを作れませんでした: ${(e as Error).message}`);
  }

  // 置ける記号だけに絞る (AI が増やしても通さない)
  const items = parsed.items
    .filter((i) => SYMBOLS.some((s) => s.mark === i.mark))
    .slice(0, 40);

  // 条件1: AI 出力の全文を記録する (切り詰めない)
  const outputId = await recordAiOutput({
    kind: AI_KIND,
    targetTable: 'manual_layouts',
    targetId: String(layout.id),
    payload: { scene, items, prompt_version: PROMPT_VERSION, advice_used: Boolean(advice) },
    toolName: 'draftLayoutWithAi',
    model: resolved.model,
    // 傾向を載せた回は版を分ける (改善が効いたか言えるようにする)
    promptVersion: advice ? `${PROMPT_VERSION}+digest` : PROMPT_VERSION,
    actorId: actor.userId,
    requestedBy: actor.userId,
  });

  // 図を差し替える (下書きなので前の下書きは残さない)
  await execute(`DELETE FROM manual_layout_items WHERE layout_id = ?`, [layout.id]);
  for (const i of items) {
    await execute(
      `INSERT INTO manual_layout_items (id, layout_id, mark, label, x, y, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), layout.id, i.mark, i.label,
       Math.max(0, Math.min(1000, Math.round(i.x))),
       Math.max(0, Math.min(1000, Math.round(i.y))), i.why]
    );
  }
  await execute(
    `UPDATE manual_layouts SET ai_output_id = ?, updated_at = NOW() WHERE id = ?`,
    [outputId, layout.id]);
  await execute(
    `UPDATE manual_parts SET ai_drafted = TRUE, updated_at = NOW()
      WHERE manual_id = ? AND kind IN ('venue_map', 'layout')`, [manualId]);

  return {
    ...(await getLayout(manualId, scene)),
    ai: { output_id: outputId, model: resolved.model, count: items.length, used_digest: Boolean(advice) },
  };
}

async function callDraftAi(model: string, provider: 'openai' | 'anthropic', prompt: string) {
  if (provider === 'openai') {
    const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
    const res = await client.responses.parse({
      model, instructions: SYSTEM_PROMPT, input: prompt,
      text: { format: zodTextFormat(DraftSchema, 'venue_layout_draft') },
    });
    const parsed = res.output_parsed;
    if (!parsed) throw new Error('下書きを読み取れませんでした');
    return parsed as z.infer<typeof DraftSchema>;
  }
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const res = await client.messages.parse({
    model, max_tokens: 4000,
    output_config: { format: zodOutputFormat(DraftSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const parsed = res.parsed_output;
  if (!parsed) throw new Error('下書きを読み取れませんでした');
  return parsed as z.infer<typeof DraftSchema>;
}

/**
 * 人が直した配置図を保存し、**AI の下書きとの差分を記録する** (条件2)。
 *
 * 鍵は**記号 + 名前** (`mark_label`)。index にすると1つ足すだけで
 * 以降全部が「変更された」ことになり、修正率が実態とかけ離れる。
 * **二重計上しない** — 一度差分を書いた出力は次から飛ばす。
 */
export async function saveLayoutCorrections(manualId: string, scene: string, userId: string) {
  const layout = (await queryOne(
    `SELECT * FROM manual_layouts WHERE manual_id = ? AND scene = ?`, [manualId, scene])) as any;
  if (!layout?.ai_output_id) return { recorded: 0, already: false };

  const already = await queryOne(
    `SELECT 1 AS x FROM ai_corrections WHERE output_id = ? LIMIT 1`, [layout.ai_output_id]);
  if (already) return { recorded: 0, already: true };

  const output = (await queryOne(
    `SELECT payload_snapshot FROM ai_outputs WHERE id = ?`, [layout.ai_output_id])) as any;
  const before = ((output?.payload_snapshot?.items ?? []) as any[]).map((i) => ({
    mark_label: `${i.mark}:${i.label}`, mark: i.mark, label: i.label,
    x: Math.round(Number(i.x)), y: Math.round(Number(i.y)),
  }));

  const now = (await queryAll(
    `SELECT mark, label, x, y FROM manual_layout_items WHERE layout_id = ?`, [layout.id])) as any[];
  const after = now.map((i) => ({
    mark_label: `${i.mark}:${i.label}`, mark: i.mark, label: i.label,
    x: Number(i.x), y: Number(i.y),
  }));

  const diffs = diffByKey(before, after, 'mark_label', ['x', 'y'], 'items');
  await recordCorrections(layout.ai_output_id, diffs, userId);
  return { recorded: diffs.length, already: false };
}

// ───────────────────────────────────────────────────────
// 出す
// ───────────────────────────────────────────────────────

/**
 * PDF にする。**出した瞬間の中身を残す** (あとで部品を直しても配った版は変わらない)。
 * 条件3: AI の下書きが最後まで残ったかを成果として記録する。
 */
export async function issueManual(manualId: string, audience: Audience, userId: string) {
  const view = await getManual(manualId, audience);
  const version = Number(view.version);

  // 人が直した分の差分を先に記録する (出す前が最後の形)
  for (const s of SCENES) {
    try { await saveLayoutCorrections(manualId, s, userId); } catch { /* 記録の失敗で出せなくしない */ }
  }

  const snapshot = {
    version, audience,
    project_name: view.project_name,
    parts: view.parts.filter((p: any) => p.included).map((p: any) => ({
      kind: p.kind, label: p.label, ready: p.ready, content: p.content,
    })),
    toc: view.toc,
    not_ready: view.not_ready,
    issued_at: new Date().toISOString(),
  };

  const id = uuidv4();
  await execute(
    `INSERT INTO manual_issues (id, manual_id, version, audience, snapshot, page_count, issued_by)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)`,
    [id, manualId, version, audience, JSON.stringify(snapshot), view.toc.length, userId]
  );
  // 版数を上げる (次に出すのは次の版)
  await execute(
    `UPDATE manuals SET version = version + 1, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [userId, manualId]);

  // 条件3: 成果 — AI の下書きが最後まで残ったか
  for (const s of SCENES) {
    const layout = (await queryOne(
      `SELECT ai_output_id FROM manual_layouts WHERE manual_id = ? AND scene = ?`,
      [manualId, s])) as any;
    if (layout?.ai_output_id) {
      await recordAiOutcome(
        String(layout.ai_output_id), 'issued',
        { key: 'version', value: version },
        `${AUDIENCES.find((a) => a.key === audience)?.label ?? audience} 版で出した`
      );
    }
  }

  return { issue_id: id, version, audience, page_count: view.toc.length, not_ready: view.not_ready };
}

/** 出した版を読む (配った紙と同じ中身) */
export async function getIssue(issueId: string) {
  const row = (await queryOne(
    `SELECT i.*, m.project_id FROM manual_issues i JOIN manuals m ON m.id = i.manual_id
      WHERE i.id = ?`, [issueId])) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'その版は見つかりません');
  return row;
}

/** AI の下書きが使われなかったことを記録する (条件3の裏側) */
export async function markLayoutDropped(manualId: string, scene: string, note?: string) {
  const layout = (await queryOne(
    `SELECT ai_output_id FROM manual_layouts WHERE manual_id = ? AND scene = ?`,
    [manualId, scene])) as any;
  if (!layout?.ai_output_id) return { recorded: false };
  await recordAiOutcome(String(layout.ai_output_id), 'dropped', undefined, note ?? '下書きを使わなかった');
  return { recorded: true };
}

/** この案件の直近の AI 下書き (画面が「AIが下書きしました」を出すのに使う) */
export async function findLatestLayoutDraft(layoutId: string) {
  return findLatestAiOutput(AI_KIND, 'manual_layouts', layoutId);
}
