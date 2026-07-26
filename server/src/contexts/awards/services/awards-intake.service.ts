/**
 * データを入れる（アワード）— デザイン 20章 20f / テンプレート 20e
 *
 * ── なにが問題だったか ──────────────────────────────────
 *
 * ノミネート一覧は**主催者から表で届く**。届き方は毎回ちがう:
 *  - Excel のファイルで届く（いまのインポートが受けられる）
 *  - **メールの本文に表が貼られて届く**（受け口が無く、手で打ち直していた）
 *  - **列がそろっていない・見出しが無い**（人が並べ替えてから貼っていた）
 *
 * 受け口を1つにする。**貼る / 落とす / AIに整えさせる** の3つを同じ画面に置き、
 * **どれを通っても取り込みの処理は1本**にする。
 *
 * ── 取り込みの処理を増やしていない（重要）────────────────
 *
 * 貼った文字は**その場で xlsx に変換して既存の Excel 取り込みに渡す**。
 * 別の取り込み経路を書くと、列の当て方・重複の判定・警告の出し方が
 * 2か所になり、**どちらを通ったかで結果が変わる**。
 * 実際に困るのは「ファイルなら入るのに貼ると入らない」形の食い違いで、
 * 現場では原因が分からない。だから通り道を1本にする。
 *
 * ── AI がやることは「整える」だけ ────────────────────────
 *
 * AI は**表の形になっていない文字を、列のある表に直す**ところまで。
 * 取り込むかどうかは人が見て決める（AIが直接エントリーを作らない）。
 * 「AIを使い捨てにしない」5条件は下のコメントに対応を書いた。
 */
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { zodTextFormat } from 'openai/helpers/zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  previewAwardsExcel, importAwardsExcel,
  type ImportMapping, type PreviewResult, type ImportResult,
} from './excel-import.service';
import {
  recordAiOutput, recordCorrections, recordAiOutcome, findLatestAiOutput, diffByKey,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';

const AI_KIND = 'awards_intake_tidy';
const PROMPT_VERSION = 'v1';
const TIMEOUT_MS = 60_000;

/** 貼れる文字の上限。これ以上はファイルで渡してもらう (画面にもそう出す) */
export const PASTE_MAX_CHARS = 200_000;

// ───────────────────────────────────────────────────────
// テンプレート (20e)
// ───────────────────────────────────────────────────────

/**
 * 演出のテンプレート。**実装しているのはアワードだけ**。
 *
 * 一覧から隠さない理由: 隠すと「うちの演出は作れないのか」が分からず
 * 毎回聞かれる。**出すが作れない**ことをその場で言う。
 */
export const TEMPLATES = [
  {
    key: 'awards', label: 'アワード', implemented: true,
    what: '部門ごとにノミネートを出し、5位→2位→1位と発表して大賞を全画面で出します',
    uses: ['ランキングCG', '字幕スーパー', 'クイズ・アンケート'],
  },
  {
    key: 'ranking', label: 'ランキングだけ', implemented: false,
    what: '順位のバーだけを出す形', uses: [],
  },
  {
    key: 'quiz', label: 'クイズ大会', implemented: false,
    what: '出題と集計を主にした形', uses: [],
  },
  {
    key: 'ceremony', label: '式典・表彰状', implemented: false,
    what: '氏名と表彰状の読み上げに合わせて出す形', uses: [],
  },
] as const;

export type TemplateKey = (typeof TEMPLATES)[number]['key'];

/**
 * テンプレートを受ける。**作れないものは 400 で止める**。
 *
 * 画面でも選べないようにしているが、画面だけの制限は必ず抜ける
 * (MCP・API から直接来る)。作れないものを受けて `awards` として
 * 作ってしまうと「クイズ大会で作ったのにアワードが出る」ことになる。
 */
export function assertTemplate(raw: unknown): TemplateKey {
  const key = String(raw ?? 'awards');
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      `そのテンプレートはありません（選べるのは ${TEMPLATES.map((x) => x.label).join(' / ')}）`,
    );
  }
  if (!t.implemented) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      `「${t.label}」は準備中です。いま作れるのは「アワード」だけです`,
    );
  }
  return t.key;
}

// ───────────────────────────────────────────────────────
// 貼る (20f)
// ───────────────────────────────────────────────────────

export interface PasteParse {
  /** 何で区切ったか。画面にそのまま出す (思ったとおりに読めたかを人が確かめる) */
  delimiter: 'tab' | 'comma';
  delimiter_label: string;
  rows: string[][];
  /** 読めなかった・気をつけてほしいこと。日本語で返す */
  warnings: string[];
}

/**
 * 貼られた文字を表として読む。
 *
 * タブ区切り (Excel / Google スプレッドシートからのコピー) を先に見る。
 * カンマは**住所や会社名の中にも出る**ので、タブがあるときはタブを採る。
 */
export function parsePastedTable(text: string): PasteParse {
  if (!text || !text.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', '貼りつける表がありません');
  }
  if (text.length > PASTE_MAX_CHARS) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      `貼れるのは ${PASTE_MAX_CHARS.toLocaleString()} 文字までです。Excel のファイルを落としてください`,
    );
  }
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      '1行しかありません。1行目に見出し（部門・ノミネート名 など）、2行目から中身を貼ってください',
    );
  }

  const hasTab = lines.some((l) => l.includes('\t'));
  const delimiter: 'tab' | 'comma' = hasTab ? 'tab' : 'comma';
  const split = (l: string) => (delimiter === 'tab' ? l.split('\t') : splitCsvLine(l));

  const rows = lines.map((l) => split(l).map((c) => c.trim()));
  const width = rows[0].length;
  const warnings: string[] = [];
  if (width < 2) {
    warnings.push('列が1つしかありません。Excel から選んでコピーすると列が分かれます');
  }
  const ragged = rows.filter((r) => r.length !== width).length;
  if (ragged > 0) {
    warnings.push(`列の数がそろっていない行が ${ragged} 行あります（1行目に合わせて読みます）`);
  }
  // 幅をそろえる (足りない列は空、多い列は捨てずに残す = 見出しが増える)
  const maxWidth = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const c = [...r];
    while (c.length < maxWidth) c.push('');
    return c;
  });
  // 見出しが空の列には名前を付ける (xlsx にすると空見出しは列ごと落ちる)
  padded[0] = padded[0].map((h, i) => (h ? h : `列${i + 1}`));

  return {
    delimiter,
    delimiter_label: delimiter === 'tab' ? 'タブ区切り（Excelからのコピー）' : 'カンマ区切り',
    rows: padded,
    warnings,
  };
}

/** ダブルクォートの中のカンマを割らない最小の CSV 分割 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * 表を xlsx のバイト列にする。
 * **これで貼るとファイルが同じ処理に入る** (取り込みを2本書かない)。
 */
export function rowsToXlsxBuffer(rows: string[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'pasted');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** 貼られた文字の下見。ファイルを落としたときと同じ形を返す */
export function previewPasted(text: string): PreviewResult & { paste: PasteParse } {
  const paste = parsePastedTable(text);
  const preview = previewAwardsExcel(rowsToXlsxBuffer(paste.rows));
  return { ...preview, paste };
}

/** 貼られた文字を取り込む。ファイルと同じ `importAwardsExcel` を通す */
export async function importPasted(
  eventId: number, text: string,
  mapping?: ImportMapping, extraColumns?: string[], dryRun = false,
): Promise<ImportResult & { paste: Omit<PasteParse, 'rows'> }> {
  const paste = parsePastedTable(text);
  const result = await importAwardsExcel(
    rowsToXlsxBuffer(paste.rows), eventId, mapping, extraColumns, dryRun,
  );
  const { rows: _rows, ...rest } = paste;
  return { ...result, paste: rest };
}

// ───────────────────────────────────────────────────────
// AIに整えさせる (20f) — 5条件つき
// ───────────────────────────────────────────────────────

const TidySchema = z.object({
  headers: z.array(z.string()).describe('列の見出し。日本語で、届いた表の言葉をなるべく残す'),
  rows: z.array(z.array(z.string())).describe('中身。headers と同じ列数にそろえる'),
  notes: z.array(z.string()).describe('人に確かめてほしいこと。読み取れなかった行や、推測で埋めた列'),
  guessed_columns: z.array(z.string()).describe('見出しが無く、中身から推測して名前を付けた列'),
});

const SYSTEM_PROMPT = [
  'あなたは表彰イベントのノミネート一覧を、取り込める表の形に整えます。',
  '**中身を作ってはいけません。** 書かれていない人・部門・会社を足さないでください。',
  '列の見出しが無いときは、中身から推測して日本語の見出しを付け、guessed_columns に入れてください。',
  '1人（1エントリー）が1行になるようにしてください。1つのセルに複数人が入っている場合は行を分けます。',
  '部門（賞の名前）の列は必ず作ってください。見出し行や小見出しで部門が示されている場合は、',
  'その下の行すべてにその部門を入れてください。',
  '空の列は作らないでください。読み取れなかった行は捨てず、notes に理由を書いてください。',
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
 * 形になっていない文字を表に整える。**取り込みはしない**。
 *
 * 条件1: 出した表の**全文**を `ai_outputs` に残す (行を切り詰めない)
 * 条件4: 生成前に前回までの傾向を読んでプロンプトに載せる
 */
export async function tidyWithAi(eventId: number, text: string, actor: { userId: string }) {
  const event = await queryOne(`SELECT id, name FROM awards_events WHERE id = ?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  if (!text?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '整える文字がありません');
  if (text.length > PASTE_MAX_CHARS) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      `整えられるのは ${PASTE_MAX_CHARS.toLocaleString()} 文字までです`,
    );
  }

  const resolved = resolveProvider();
  if (!resolved) {
    throw new AppError(
      503, 'AI_NOT_CONFIGURED',
      'AIで整えるのはいま使えません。列を自分で当てて取り込むこともできます',
    );
  }

  // 条件4: 傾向をプロンプトに載せる
  let advice = '';
  try {
    const digest = await getFeedbackDigest(AI_KIND, 90);
    advice = (digest.advice ?? []).join('\n');
  } catch { advice = ''; }

  const lines = [
    '# 整えてほしい文字（届いたそのまま）',
    '```',
    text.slice(0, PASTE_MAX_CHARS),
    '```',
    '',
    '# 取り込む先が使う列（この名前に寄せると当てやすくなります）',
    '- 種別（部門・賞の名前）',
    '- ノミネート名（氏名、または代表者名）',
    '- プロジェクト名',
    '- ノミネート者会社（所属）',
    '- ノミネート者部署 / ノミネート者役職',
    '- ノミネート名（英語）/ ノミネート者会社（英語）',
    '- 画像ID',
  ];
  if (advice) {
    lines.push('', '# 前回までの傾向（人がどこを直したか）', advice, '',
      '**傾向は見出しの付け方の重み付けにだけ使ってください。書かれていない中身を増やしてはいけません。**');
  }

  let parsed: z.infer<typeof TidySchema>;
  try {
    parsed = await callTidyAi(resolved.model, resolved.provider, lines.join('\n'));
  } catch (e) {
    throw new AppError(502, 'AI_FAILED', `整えられませんでした: ${(e as Error).message}`);
  }

  // 列数をそろえる (AI が凸凹を返しても取り込みが壊れないようにする)
  const headers = parsed.headers.map((h, i) => (h?.trim() ? h.trim() : `列${i + 1}`));
  const rows = parsed.rows
    .map((r) => {
      const c = r.map((v) => String(v ?? '').trim());
      while (c.length < headers.length) c.push('');
      return c.slice(0, headers.length);
    })
    .filter((r) => r.some((v) => v !== ''));

  // 条件1: 全文を記録する
  const outputId = await recordAiOutput({
    kind: AI_KIND,
    targetTable: 'awards_events',
    targetId: String(eventId),
    payload: { headers, rows, notes: parsed.notes, guessed_columns: parsed.guessed_columns,
               prompt_version: PROMPT_VERSION, advice_used: Boolean(advice) },
    toolName: 'tidyWithAi',
    model: resolved.model,
    promptVersion: advice ? `${PROMPT_VERSION}+digest` : PROMPT_VERSION,
    actorId: actor.userId,
    requestedBy: actor.userId,
  });

  // 整えた表をそのまま下見にかける (人はこの列の当て方を直す)
  const preview = previewAwardsExcel(rowsToXlsxBuffer([headers, ...rows]));

  return {
    headers, rows,
    // 「ここは確かめて」の印。**下書き全体がAI製**なのは画面のカードで示し、
    // 列の印は推測で名前を付けたものだけに絞る (全部に印を出すと印の意味が消える)
    guessed_columns: parsed.guessed_columns.filter((g) => headers.includes(g)),
    notes: parsed.notes,
    preview,
    ai: {
      output_id: outputId, model: resolved.model,
      row_count: rows.length, used_digest: Boolean(advice),
    },
  };
}

async function callTidyAi(model: string, provider: 'openai' | 'anthropic', prompt: string) {
  if (provider === 'openai') {
    const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
    const res = await client.responses.parse({
      model, instructions: SYSTEM_PROMPT, input: prompt,
      text: { format: zodTextFormat(TidySchema, 'awards_intake_tidy') },
    });
    const parsed = res.output_parsed;
    if (!parsed) throw new Error('整えた表を読み取れませんでした');
    return parsed as z.infer<typeof TidySchema>;
  }
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const res = await client.messages.parse({
    model, max_tokens: 8000,
    output_config: { format: zodOutputFormat(TidySchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const parsed = res.parsed_output;
  if (!parsed) throw new Error('整えた表を読み取れませんでした');
  return parsed as z.infer<typeof TidySchema>;
}

/**
 * AI が整えた表と、人が実際に取り込んだ表の差分を記録する (条件2)。
 *
 * **鍵は行の中身から作る** (`部門::名前`)。index にすると1行足すだけで
 * 以降すべてが「変更された」ことになり、修正率が実態とかけ離れる。
 *
 * **二重計上しない** — 一度差分を書いた出力は次から飛ばす
 * (同じ表を2回取り込んでも数字が動かない)。
 */
export async function recordIntakeCorrections(
  eventId: number,
  finalRows: Array<Record<string, string>>,
  userId: string,
): Promise<{ recorded: number; already: boolean }> {
  const latest = await findLatestAiOutput('awards_events', String(eventId), AI_KIND);
  if (!latest) return { recorded: 0, already: false };

  const already = await queryOne(
    `SELECT 1 AS x FROM ai_corrections WHERE output_id = ? LIMIT 1`, [latest.id]);
  if (already) return { recorded: 0, already: true };

  const before = aiRowsToObjects(latest.payload?.headers ?? [], latest.payload?.rows ?? []);
  const corrections = diffByKey(before, finalRows, 'row_key', ['category', 'name', 'org'], 'rows');
  await recordCorrections(latest.id, corrections, userId);
  return { recorded: corrections.length, already: false };
}

/** AI が返した headers/rows を突き合わせ用の形に直す */
function aiRowsToObjects(headers: string[], rows: string[][]): Array<Record<string, string>> {
  const find = (cands: string[]) =>
    headers.findIndex((h) => cands.some((c) => h.replace(/\s/g, '').includes(c)));
  const iCat = find(['種別', '部門', '賞']);
  const iName = find(['ノミネート名', '氏名', '名前']);
  const iOrg = find(['会社', '所属', '企業']);
  return rows.map((r) => {
    const category = iCat >= 0 ? (r[iCat] ?? '') : '';
    const name = iName >= 0 ? (r[iName] ?? '') : (r[0] ?? '');
    const org = iOrg >= 0 ? (r[iOrg] ?? '') : '';
    return { row_key: `${category}::${name}`, category, name, org };
  });
}

/** 条件3: 取り込めたかどうかを AI 出力に紐づける */
export async function recordIntakeOutcome(
  eventId: number, result: { created: number; updated: number; skipped: number },
) {
  const latest = await findLatestAiOutput('awards_events', String(eventId), AI_KIND);
  if (!latest) return;
  await recordAiOutcome(
    latest.id, 'imported',
    { key: 'entries_created', value: result.created + result.updated },
    `新規 ${result.created} / 更新 ${result.updated} / 取り込めず ${result.skipped}`,
  );
}

/** 整えた結果を使わなかった (条件3の裏側。使われなかったことも成果) */
export async function recordIntakeDropped(eventId: number, note?: string) {
  const latest = await findLatestAiOutput('awards_events', String(eventId), AI_KIND);
  if (!latest) return;
  await recordAiOutcome(latest.id, 'dropped', undefined, note ?? '整えた表を使わなかった');
}
