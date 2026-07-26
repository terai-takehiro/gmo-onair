/**
 * 編集中の案件に AI が**追記**する経路 (要件 B5)
 *
 * ── なぜ「追記だけ」なのか ─────────────────────────────
 *
 * 全置換 (`putDoc`) は部屋が開いている間 409 で拒否する。いま画面で打っている人の
 * 編集を黙って消すためで、それは「後勝ち上書きをやめる」という目的に反する。
 * かわりに **Y.Text の末尾に足す / チェックリストに行を足す** だけを許す。
 *
 * **既存の文字は 1 文字も消さない**。AI が人の書いた文を書き換えられるようにすると、
 * 「勝手に消された」が起きたときに人は二度とこの欄を信用しない。
 *
 * ── 人が足した行と見分けられるようにする ──────────────────
 *
 * メモは「AIが追記」の見出し行を付け、チェックリストは `by_ai` を立てる。
 * 見分けが付かないと「勝手に増えている」と受け取られ、消すか残すかの判断ができない。
 *
 * ── AI を使い捨てにしない (会社方針) ────────────────────
 *
 * ①出したものは `ai_outputs` に全文記録する。
 * ②③人がその後どうしたか (残した / 消した / 直した / 完了にした) は
 *   **次に AI が読んだとき**に突き合わせて `ai_corrections` / `ai_outcomes` に書く
 *   (バッチを作らない = v2.9.239 と同じ方針)。二重計上しないよう既に記録済みなら飛ばす。
 * ④次の生成に効かせるのは `getFeedbackDigest` の advice を**読むときに返す**形にした。
 *   ここを呼ぶのは外の AI なので、傾向を渡せば次の追記から効く。
 */
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { queryAll } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  NOTES_KEY, CHECKLIST_KEY, type ChecklistItem,
} from '../../../shared/collab/projectCollabDoc';
import { recordAiOutput, recordCorrections, recordAiOutcome } from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { projectCollabRooms, projectCollabService } from './project-collab.service';

export const NOTE_KIND = 'project_note_append';
export const CHECKLIST_KIND = 'project_checklist_append';

/** 'YYYY-MM-DD HH:mm' で今 (JST naive。既存の due_at と同じ形) */
function nowLabel(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function assertProject(projectId: string): Promise<void> {
  if (!(await projectCollabService.projectExists(projectId))) {
    throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  }
}

/**
 * メモの末尾に追記する。**既存の文字は消さない**。
 * 見出し行を付けて、人が書いた分と混ざらないようにする。
 */
export async function appendNotes(
  projectId: string,
  text: string,
  actor: { userId?: string; requestedBy?: string | null },
): Promise<{ appended: string; ai_output_id: string | null }> {
  await assertProject(projectId);
  const body = (text ?? '').trim();
  if (!body) throw new AppError(400, 'VALIDATION_ERROR', '追記する本文が空です');

  const header = `── AIが追記（${nowLabel()}）${actor.requestedBy ? ` 指示: ${actor.requestedBy}` : ''} ──`;
  const block = `${header}\n${body}`;

  await projectCollabRooms.mutate(projectId, (ydoc) => {
    const t = ydoc.getText(NOTES_KEY);
    // 末尾に足すだけ。既に何か書かれていれば空行で区切る
    const prefix = t.length > 0 ? '\n\n' : '';
    t.insert(t.length, `${prefix}${block}`);
  });

  const outputId = await recordAiOutput({
    kind: NOTE_KIND,
    targetTable: 'project_collab',
    targetId: projectId,
    payload: { text: body, header },
    model: 'external-agent',
    promptVersion: 'project-note-v1',
    actorId: actor.userId ?? null,
  });
  return { appended: block, ai_output_id: outputId };
}

/**
 * チェックリストに行を足す。**既存の行は触らない** (並び替え・書き換え・削除をしない)。
 * 足した行には AI の印を付ける。
 */
export async function appendChecklist(
  projectId: string,
  items: { text: string; due_at?: string | null }[],
  actor: { userId?: string; requestedBy?: string | null },
): Promise<{ added: ChecklistItem[]; ai_output_id: string | null }> {
  await assertProject(projectId);
  const rows = (items ?? [])
    .map((it) => ({ text: String(it?.text ?? '').trim(), due_at: it?.due_at ?? null }))
    .filter((it) => it.text);
  if (rows.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '足す項目がありません');

  const added: ChecklistItem[] = rows.map((it) => ({
    id: `chk_ai_${uuidv4().slice(0, 8)}`,
    text: it.text,
    done: false,
    assigned_to: null,
    due_at: it.due_at,
    by_ai: true,
  }));

  await projectCollabRooms.mutate(projectId, (ydoc) => {
    const arr = ydoc.getArray<Y.Map<unknown>>(CHECKLIST_KEY);
    arr.push(added.map((it) => {
      const m = new Y.Map<unknown>();
      m.set('id', it.id);
      m.set('text', it.text);
      m.set('done', false);
      m.set('assigned_to', null);
      m.set('due_at', it.due_at ?? null);
      m.set('by_ai', true);
      return m;
    }));
  });

  const outputId = await recordAiOutput({
    kind: CHECKLIST_KIND,
    targetTable: 'project_collab',
    targetId: projectId,
    payload: { items: added },
    model: 'external-agent',
    promptVersion: 'project-checklist-v1',
    actorId: actor.userId ?? null,
  });
  return { added, ai_output_id: outputId };
}

/**
 * 前に AI が足したチェックリストが**その後どうなったか**を突き合わせて記録する。
 *
 * バッチを作らず、**読まれたときに**やる (v2.9.239 と同じ方針)。
 *   消された     → `reject`  (要らなかった)
 *   文言が直された → `fix`
 *   そのまま     → `none`   (正解ラベル。無いと無修正採用率の分母が壊れる)
 *   完了になった  → outcome `done` (実際に使われた)
 *
 * **二重計上しない**: すでに差分を書いた出力は飛ばす (何度読まれても数字が動かない)。
 */
export async function reconcileChecklistOutcomes(projectId: string): Promise<number> {
  let reconciled = 0;
  try {
    const doc = await projectCollabService.getDoc(projectId);
    const byId = new Map((doc.checklist ?? []).map((it) => [it.id, it]));

    const outputs = (await queryAll(
      `SELECT o.id, o.payload_snapshot
       FROM ai_outputs o
       WHERE o.kind = $1 AND o.target_id = $2
         AND NOT EXISTS (SELECT 1 FROM ai_corrections c WHERE c.output_id = o.id)
       ORDER BY o.created_at ASC LIMIT 50`,
      [CHECKLIST_KIND, projectId],
    )) as { id: string; payload_snapshot: unknown }[];

    for (const out of outputs) {
      const snap = (typeof out.payload_snapshot === 'string'
        ? JSON.parse(out.payload_snapshot)
        : out.payload_snapshot) as { items?: ChecklistItem[] } | null;
      const proposed = Array.isArray(snap?.items) ? snap!.items : [];
      if (proposed.length === 0) continue;

      const diffs = proposed.map((p) => {
        const now = byId.get(p.id);
        if (!now) {
          return { fieldPath: `checklist[${p.id}].text`, before: p.text, after: null, type: 'reject' as const };
        }
        if ((now.text ?? '').trim() !== (p.text ?? '').trim()) {
          return { fieldPath: `checklist[${p.id}].text`, before: p.text, after: now.text, type: 'fix' as const };
        }
        return { fieldPath: `checklist[${p.id}].text`, before: p.text, after: p.text, type: 'none' as const };
      });
      await recordCorrections(out.id, diffs, null);

      const kept = proposed.filter((p) => byId.has(p.id));
      const doneCount = kept.filter((p) => byId.get(p.id)?.done).length;
      await recordAiOutcome(
        out.id,
        doneCount > 0 ? 'done' : kept.length > 0 ? 'kept' : 'unused',
        { key: 'kept_ratio', value: Math.round((kept.length / proposed.length) * 100) / 100 },
      );
      reconciled++;
    }
  } catch (e) {
    // 記録のために読み取りを落とさない
    console.error('[project-collab-append] 突合に失敗 (読み取りは成立):', (e as Error).message);
  }
  return reconciled;
}

/**
 * AI 向けの読み取り。中身 + **前回までの傾向 (advice)** を返す。
 *
 * 傾向を返すのは「使うほど賢くなる」ための還流経路。ここを呼ぶのは外の AI なので、
 * 読んだときに渡せば次の追記から効く (こちらのプロンプトを直さなくてよい)。
 */
export async function getCollabForAgent(projectId: string): Promise<{
  notes: string;
  checklist: ChecklistItem[];
  live: boolean;
  advice: string | null;
  kept_rate: number | null;
}> {
  await assertProject(projectId);
  await reconcileChecklistOutcomes(projectId);
  const doc = await projectCollabService.getDoc(projectId);

  let advice: string | null = null;
  let keptRate: number | null = null;
  try {
    const digest = await getFeedbackDigest(CHECKLIST_KIND, 90);
    const rawAdvice = Array.isArray(digest.advice) ? digest.advice.join('\n') : digest.advice;
    advice = rawAdvice && String(rawAdvice).trim() ? String(rawAdvice) : null;
    const rate = (digest as { as_is_rate?: number }).as_is_rate;
    keptRate = typeof rate === 'number' ? rate : null;
  } catch (e) {
    console.warn('[project-collab-append] digest 取得に失敗 (読み取りは続行):', (e as Error).message);
  }
  return { notes: doc.notes, checklist: doc.checklist, live: doc.live, advice, kept_rate: keptRate };
}
