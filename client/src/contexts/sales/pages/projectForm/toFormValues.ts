/**
 * 読み込んだ案件（`GET /projects/:id`）を、直す画面の入力欄の形へ写す (v4)
 *
 * `useProjectForm.ts` から切り出したもの（同ファイルが400行の上限に達したため）。
 * **写し方の決めごとをここ1か所に集める**のが目的で、値の扱いは1つも変えていません。
 * 欄そのものは `projectNew/RequiredFields` / `projectNew/MoreFields` が持ちます。
 */
import type { Audience, ProjectCategory } from '../../classification';
import type { FormValues } from './types';

export function projectToFormValues(project: any): FormValues {
  return {
    name: project.name || '',
    customer_id: project.customer_id || '',
    customer_type: project.customer_type === 'internal' ? 'internal' : 'external',
    project_type: project.project_type || 'other',
    // 2段分類（migration 182）。**旧 `project_type` から埋め直さない** —
    // 旧分類は4種しかないので「有観客の収録」が「有観客の配信」に化ける。
    // 入っていない案件は空で出し、人に選んでもらう（必須にしてある）
    audience: (project.audience || '') as Audience | '',
    project_category: (project.project_category || '') as ProjectCategory | '',
    contact_name: project.contact_name || '',
    recurrence: project.recurrence === 'regular' ? 'regular' : 'single',
    // レギュラー案件が案件全体で1つだけ持つ取り決め（migration 262）。0 は
    // 「決めた0」ではなく「入っていない」ことがほとんどなので、null / 0 は
    // どちらも空欄にする（`attendee_count` と同じ理由。billing_cycle だけは
    // 既定値があるので空欄にしない）。
    // ⚠️ `recording_per_day_count`/`episode_unit_price` はここで読み込まない
    // （仕様変更 #16・migration 269 でこの画面の固定入力欄を廃止したため。
    // 値そのものは `project` に残っているが、`FormValues` に無いので触らない）
    recording_cadence: project.recording_cadence || '',
    fixed_studio_note: project.fixed_studio_note || '',
    billing_cycle: project.billing_cycle || 'monthly_close',
    broadcast_offset_days: project.broadcast_offset_days != null ? String(project.broadcast_offset_days) : '',
    // 数値の 0 は「0 名」ではなく「入っていない」ことが多いので、
    // **null / 0 はどちらも空欄**にする（入れ直せば数として保存される）
    attendee_count: project.attendee_count ? String(project.attendee_count) : '',
    goal: project.goal || '',
    intake_channel: project.intake_channel || '',
    gls_category: (project.gls_category === 'A' || project.gls_category === 'B') ? project.gls_category : '',
    event_start: project.event_start || '',
    event_end: project.event_end || '',
    expected_amount: project.expected_amount || 0,
    assigned_to: project.assigned_to || '',
    broadcast_type: project.broadcast_type || '',
    media_platform: project.media_platform || '',
    box_url_internal: project.box_url_internal || '',
    box_url_external: project.box_url_external || '',
    application_form: !!project.application_form,
  };
}

/**
 * 保存に成功したあと、欄へ入れ直す値を決める
 * （**サーバーが正規化した値を出す**ためのもの・S4）。
 *
 * 保存後も欄が dirty のままだと、`keepDirtyValues` のせいで読み直しても
 * 人が触った欄はサーバー値で置き換わりません。かといって無条件に全欄を
 * サーバー値へ戻すと、**保存を待っている間に人が別の欄へ入れた文字が消えます**。
 *
 * そこで「保存に出した時点の欄の控え（`submitted`）」と「いまの欄（`current`）」を
 * 比べ、**保存中に人が触った欄だけ人の入力を残し、それ以外はサーバー値に戻す**。
 * 残した欄は呼び出し側で dirty に付け直すため、鍵として返す。
 */
export function mergeSavedFormValues(
  server: FormValues, current: FormValues, submitted: FormValues | null,
): { merged: FormValues; keptKeys: (keyof FormValues)[] } {
  const merged = { ...server };
  const keptKeys: (keyof FormValues)[] = [];
  if (!submitted) return { merged, keptKeys };
  for (const key of Object.keys(server) as (keyof FormValues)[]) {
    if (current[key] === submitted[key]) continue;   // 保存中に触られていない＝サーバー値で良い
    (merged as Record<string, unknown>)[key] = current[key];
    keptKeys.push(key);
  }
  return { merged, keptKeys };
}
