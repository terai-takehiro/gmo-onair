/**
 * 標準工程テンプレートを直すときの下書き
 *
 * ── なぜ「全部まとめて送る」形にするのか ────────────────────
 *
 * `PUT /gpm/templates/:id` は `phases` を渡すと**フェーズとタスクを全置換**します
 * （`DELETE` → 入れ直し）。つまり**送らなかったタスクは消えます**。
 * だから画面はいつも全体を持ち、全体を送ります。
 * 「工程だけ直したらタスクが全部消えた」を作らないための形です。
 *
 * 全置換で困らないのは、テンプレートは**写して使う**からです
 * （動いているプロジェクトには影響しません — `docs/design/gpm-model.md` 決め③）。
 */
import type { GpmTemplate } from '../../types';

export interface DraftTask {
  label: string;
  days: number;
  role: string;
  is_required: boolean;
}

export interface DraftPhase {
  label: string;
  days: number;
  role: string;
  tasks: DraftTask[];
}

export interface Draft {
  name: string;
  description: string;
  phases: DraftPhase[];
}

export function toDraft(t: GpmTemplate | null): Draft {
  if (!t) return { name: '', description: '', phases: [] };
  return {
    name: t.name,
    description: t.description ?? '',
    phases: t.phases.map((p) => ({
      label: p.label,
      days: Number(p.days) || 1,
      role: p.role ?? '',
      tasks: p.tasks.map((k) => ({
        label: k.label,
        days: Number(k.days) || 1,
        role: k.role ?? '',
        is_required: !!k.is_required,
      })),
    })),
  };
}

/** サーバーに送る形。空の名前の行は落とす（サーバーも落とすが、画面でも数を合わせる） */
export function toBody(d: Draft): Record<string, unknown> {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    phases: d.phases
      .filter((p) => p.label.trim())
      .map((p) => ({
        label: p.label.trim(),
        days: Math.max(1, Number(p.days) || 1),
        role: p.role.trim() || null,
        tasks: p.tasks
          .filter((k) => k.label.trim())
          .map((k) => ({
            label: k.label.trim(),
            days: Math.max(1, Number(k.days) || 1),
            role: k.role.trim() || null,
            is_required: k.is_required,
          })),
      })),
  };
}

/** 工程の日数の合計＝そのひな形で作ったときの目安の期間 */
export function draftDays(d: Draft): number {
  return d.phases.reduce((n, p) => n + (Number(p.days) || 0), 0);
}

export function draftTasks(d: Draft): number {
  return d.phases.reduce((n, p) => n + p.tasks.length, 0);
}

/** 並べ替え。**番号を入力させない** — 同じ数字を2つ入れると並びが不定になる */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
