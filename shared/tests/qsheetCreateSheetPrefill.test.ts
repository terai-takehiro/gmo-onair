/**
 * 新規台本作成の自動入力（`client-qsheet/src/pages/sheets/useCreateSheetPrefill.tsx`）
 *
 * ── なぜここを試すのか ──────────────────────────────────────
 *
 * この仕組みの壊れ方は「どの欄に入るか」ではなく**状態の移り変わり**で出る。
 * 案件を選び直す・間にエピソードを挟む、という順番でしか現れず、
 * **画面を見ても「案件Bの台本に案件Aの会場と日程が入っている」ことに気づけない**
 * （注記は「GLS案件から入れました」と出ているので、むしろ正しく見える）。
 *
 * 実際に見つかった2件をここで固定する:
 *   ① 案件A（会場・日程あり）→ 案件B（何も無い）で、**Aの値と注記が残った**
 *   ② `?project=` 付きで開くと**番組名（必須）だけ入らず**作成ボタンが押せなかった
 *
 * 判断だけを純関数（`planProjectPrefill` / `planEpisodePrefill` / `planProjectSwitch`）に
 * 出してあるので、DOM もフックも動かさずに順番を並べて確かめられる。
 */
import { describe, it, expect } from 'vitest';
import {
  canPrefill,
  prefillNote,
  planProjectPrefill,
  planEpisodePrefill,
  planProjectSwitch,
  PREFILL_FIELDS,
  type PrefillMarks,
  type PrefillPlan,
  type PrefillValues,
  type PrefilledField,
} from '../../client-qsheet/src/pages/sheets/useCreateSheetPrefill';
import type { EpisodeOption, ProjectContext } from '../../client-qsheet/src/pages/sheets/types';

const ctx = (over: Partial<ProjectContext> & { id: string; name: string }): ProjectContext => ({
  glsNumber: null,
  customerName: null,
  eventStart: null,
  eventEnd: null,
  venue: null,
  performanceDates: [],
  rehearsalDates: [],
  ...over,
});

/** 案件A: スタジオ予約あり・本番 9/1・リハ 8/31 */
const PROJECT_A = ctx({
  id: 'a', name: '案件Aの番組', venue: '用賀 WORLD STUDIO',
  eventStart: '2026-09-01', eventEnd: '2026-09-01',
  performanceDates: ['2026-09-01'], rehearsalDates: ['2026-08-31'],
});
/** 案件B: スタジオ予約なし・日程未登録（**実データで普通にある**） */
const PROJECT_B = ctx({ id: 'b', name: '案件Bの番組' });

/**
 * ダイアログの state を最小限だけ真似た入れ物。
 * フック側（`applyPlan` / `onProjectSelected`）と**同じ順序で**流し込む。
 */
class Form {
  values: PrefillValues = { title: '', location: '', broadcastDate: '', recordingDate: '', rehearsalDate: '' };
  marks: PrefillMarks = {};
  hasRecording = true;   // ダイアログの初期値
  hasRehearsal = false;  // 同上

  /** ユーザーが手で打つ（＝印は付かない・付いていたら落ちる） */
  type(field: PrefilledField, value: string) {
    this.values[field] = value;
    delete this.marks[field];
    return this;
  }
  private apply(plan: PrefillPlan) {
    for (const w of plan.writes) {
      this.values[w.field] = w.value;
      this.marks[w.field] = w.source;
    }
    if (plan.hasRecording !== undefined) this.hasRecording = plan.hasRecording;
    if (plan.hasRehearsal !== undefined) this.hasRehearsal = plan.hasRehearsal;
  }
  /** 案件を選び直す → 前の案件のものを消す → 新しい案件の context を反映する */
  selectProject(next: ProjectContext, episodeSelected = false) {
    const clear = planProjectSwitch(this.marks);
    for (const f of clear.cleared) {
      this.values[f] = '';
      delete this.marks[f];
    }
    if (clear.hasRecording !== undefined) this.hasRecording = clear.hasRecording;
    if (clear.hasRehearsal !== undefined) this.hasRehearsal = clear.hasRehearsal;
    // 案件を選び直すとエピソードの選択は外れる（`handleProjectChange`）
    this.applyContext(next, episodeSelected);
    return this;
  }
  /** `?project=` 付きで開いた経路。**選び直しを通らず** context だけが届く */
  applyContext(next: ProjectContext, episodeSelected = false) {
    this.apply(planProjectPrefill({ ctx: next, values: this.values, marks: this.marks, episodeSelected }));
    return this;
  }
  selectEpisode(ep: EpisodeOption) {
    this.apply(planEpisodePrefill({ ep, values: this.values, marks: this.marks }));
    return this;
  }
}

const episode = (over: Partial<EpisodeOption> = {}): EpisodeOption => ({
  id: 'e1', episode_code: 'GLS002-003', episode_number: 3,
  broadcast_date: null, recording_date: null, ...over,
});

describe('canPrefill — 手で打った値は絶対に上書きしない', () => {
  const values: PrefillValues = { title: '手打ち', location: '', broadcastDate: '', recordingDate: '', rehearsalDate: '' };
  it('空欄には入れてよい', () => {
    expect(canPrefill(values, {}, 'location')).toBe(true);
  });
  it('**手で打った欄（印なし・値あり）には入れない**', () => {
    expect(canPrefill(values, {}, 'title')).toBe(false);
  });
  it('自分で入れた欄（印あり）は選び直しに追随してよい', () => {
    expect(canPrefill(values, { title: 'project' }, 'title')).toBe(true);
  });
});

describe('planProjectPrefill — 案件の事実から入れる', () => {
  it('番組名は `ctx.name` から入る（**案件一覧を待たない**）', () => {
    const plan = planProjectPrefill({ ctx: PROJECT_A, values: new Form().values, marks: {}, episodeSelected: false });
    expect(plan.writes.find((w) => w.field === 'title'))
      .toEqual({ field: 'title', value: '案件Aの番組', source: 'project' });
  });

  it('会場・放送日・リハ日が入り、トグルも揃う', () => {
    const form = new Form().applyContext(PROJECT_A);
    expect(form.values.location).toBe('用賀 WORLD STUDIO');
    expect(form.values.broadcastDate).toBe('2026-09-01');
    expect(form.values.rehearsalDate).toBe('2026-08-31');
    expect(form.hasRehearsal).toBe(true);
    expect(form.marks).toEqual({
      title: 'project', location: 'project', broadcastDate: 'project', rehearsalDate: 'project',
    });
  });

  /*
   * 案件から分かるのは本番日だけなので、素直に入れると放送日と収録日が同じ値になる。
   * 生放送の案件では「収録日を設定」を消して回る手間が増えるだけなので入れない。
   */
  it('**収録日は放送日と同じ日になるなら入れない**', () => {
    const form = new Form().applyContext(PROJECT_A);
    expect(form.values.recordingDate).toBe('');
    expect(form.marks.recordingDate).toBeUndefined();
  });

  it('放送日を手で先に決めてあれば、本番日は収録日に入る', () => {
    const form = new Form().type('broadcastDate', '2026-09-15').applyContext(PROJECT_A);
    expect(form.values.broadcastDate).toBe('2026-09-15');   // 手打ちはそのまま
    expect(form.values.recordingDate).toBe('2026-09-01');
    expect(form.hasRecording).toBe(true);
  });

  it('日程が無ければ `eventStart` に落とす', () => {
    const form = new Form().applyContext(ctx({ id: 'c', name: 'C', eventStart: '2026-10-10' }));
    expect(form.values.broadcastDate).toBe('2026-10-10');
  });

  it('エピソードを先に選んでいたら放送日・収録日には触らない（リハ日は入れる）', () => {
    const form = new Form().applyContext(PROJECT_A, true);
    expect(form.values.broadcastDate).toBe('');
    expect(form.values.recordingDate).toBe('');
    expect(form.values.rehearsalDate).toBe('2026-08-31');
  });

  it('壊れた応答（配列でない）でも落ちない', () => {
    const broken = { id: 'x', name: 'X' } as unknown as ProjectContext;
    expect(() => new Form().applyContext(broken)).not.toThrow();
  });
});

describe('planProjectSwitch — 案件を選び直したら前の案件のものを消す', () => {
  it('印が付いた欄だけを消す（手打ちの欄は残す）', () => {
    const marks: PrefillMarks = { title: 'project', location: 'project', recordingDate: 'episode' };
    expect(planProjectSwitch(marks).cleared).toEqual(['title', 'location', 'recordingDate']);
  });
  it('印が無ければ何も消さない（トグルも触らない）', () => {
    expect(planProjectSwitch({})).toEqual({ cleared: [] });
  });
  it('**日付を消したらトグルも戻す**（トグルだけ ON で日付が空を作らない）', () => {
    const plan = planProjectSwitch({ recordingDate: 'project', rehearsalDate: 'project' });
    expect(plan.hasRecording).toBe(false);
    expect(plan.hasRehearsal).toBe(false);
  });
  it('消す順は欄の並びどおり', () => {
    const all: PrefillMarks = Object.fromEntries(PREFILL_FIELDS.map((f) => [f, 'project']));
    expect(planProjectSwitch(all).cleared).toEqual(PREFILL_FIELDS);
  });
});

/*
 * ここから下が**実データで起きた2件**の再現。
 */
describe('不具合① 案件を選び直すと前の案件の値と注記が残った', () => {
  it('案件A（会場・日程あり）→ 案件B（何も無い）で、Aの値も注記も消える', () => {
    const form = new Form().applyContext(PROJECT_A);
    expect(form.values.location).toBe('用賀 WORLD STUDIO');   // 前提

    form.selectProject(PROJECT_B);

    expect(form.values.title).toBe('案件Bの番組');
    expect(form.values.location).toBe('');
    expect(form.values.broadcastDate).toBe('');
    expect(form.values.rehearsalDate).toBe('');
    // 「GLS案件から入れました」と主張する欄が残らない
    expect(form.marks).toEqual({ title: 'project' });
    expect(form.hasRehearsal).toBe(false);
  });

  it('案件A → エピソード → 案件B で、エピソードの収録日と注記も消える', () => {
    const form = new Form()
      .applyContext(PROJECT_A)
      .selectEpisode(episode({ recording_date: '2026-09-01' }));
    expect(form.values.recordingDate).toBe('2026-09-01');     // 前提
    expect(form.marks.recordingDate).toBe('episode');

    form.selectProject(PROJECT_B);

    expect(form.values.recordingDate).toBe('');
    expect(form.marks.recordingDate).toBeUndefined();
    expect(form.hasRecording).toBe(false);   // 日付が無いのにトグルだけ ON にしない
  });

  it('**手で打った値は選び直しても消えない**', () => {
    const form = new Form()
      .applyContext(PROJECT_A)
      .type('location', '幕張メッセ')
      .type('broadcastDate', '2026-12-24');

    form.selectProject(PROJECT_B);

    expect(form.values.location).toBe('幕張メッセ');
    expect(form.values.broadcastDate).toBe('2026-12-24');
    expect(form.marks.location).toBeUndefined();
  });

  it('新しい案件が値を持っていれば入れ替わる（A → A と同じ形の別案件）', () => {
    const projectC = ctx({
      id: 'c', name: '案件Cの番組', venue: '渋谷 第1スタジオ',
      performanceDates: ['2026-11-03'], rehearsalDates: ['2026-11-02'],
    });
    const form = new Form().applyContext(PROJECT_A).selectProject(projectC);
    expect(form.values.location).toBe('渋谷 第1スタジオ');
    expect(form.values.broadcastDate).toBe('2026-11-03');
    expect(form.values.rehearsalDate).toBe('2026-11-02');
    expect(form.hasRehearsal).toBe(true);
  });
});

describe('不具合② `?project=` 付きで開くと番組名だけ入らなかった', () => {
  /*
   * この経路は `setSelectedProjectId(defaultProjectId)` を直に呼ぶので
   * `handleProjectChange` を通らない。番組名だけそこで入れていたため、
   * 会場・放送日は入るのに**必須の番組名が空**＝作成ボタンが押せなかった。
   */
  it('選び直しを通らず context だけ届いても、必須3項目がそろう', () => {
    const form = new Form().applyContext(PROJECT_A);
    expect(form.values.title).toBe('案件Aの番組');
    expect(form.values.location).toBe('用賀 WORLD STUDIO');
    expect(form.values.broadcastDate).toBe('2026-09-01');
    const missing = [!form.values.title.trim(), !form.values.location.trim(), !form.values.broadcastDate];
    expect(missing).toEqual([false, false, false]);
  });

  it('番組名の注記は「GLS案件の名前から入れました」のまま（出どころも `project`）', () => {
    const form = new Form().applyContext(PROJECT_A);
    expect(form.marks.title).toBe('project');
    expect(prefillNote('title', form.marks.title))
      .toBe('GLS案件の名前から入れました。違うときは直してください');
  });

  it('番組名を手で打ってあれば案件名で上書きしない', () => {
    const form = new Form().type('title', '手で決めた番組名').applyContext(PROJECT_A);
    expect(form.values.title).toBe('手で決めた番組名');
  });
});
