/**
 * **ゴミになった案件を案件台帳から外す（論理削除）**
 *
 * ユーザー依頼（2026-08-31）「失注やネタ見送りなどゴミになった案件は
 * 案件台帳等からも抹消したい (DBから削除したい)」。
 *
 * ⚠️ **ここが緩むと、売上や請求のある案件が台帳から消えます。**
 * ご判断は「見積だけなら消す・売上や請求が付いていれば残す」「論理削除」なので、
 * その3つ（論理削除であること・お金があれば残すこと・BOX を置き去りにしないこと）
 * を実装ではなくここで固定します。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PURGE_TARGET_SQL, PURGE_KEPT_SQL, PURGE_HAS_MONEY_SQL, PURGE_JUNK_STAGE_SQL,
  PURGE_STALE_NETA_DAYS, PURGE_BUDGET_MS,
} from '../../server/src/contexts/sales/services/project-purge.service';
import { summarizeSkipReasons } from '../../server/src/contexts/sales/services/box-lost-cleanup.service';

const ROOT = path.resolve(__dirname, '../..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SERVICE = read('server/src/contexts/sales/services/project-purge.service.ts');

describe('どれをゴミと見なすか', () => {
  it('失注すべてと、放置ネタだけを対象にする', () => {
    expect(PURGE_JUNK_STAGE_SQL).toContain("p.stage = 'e_lost'");
    expect(PURGE_JUNK_STAGE_SQL).toContain("p.stage = 'neta'");
    /*
     * 受注・完了・提案中などは絶対に入れない（現役の案件が台帳から消える）。
     * ⚠️ **ステージ名は引用符ごと見る。** 素の `s_completed` で探すと、
     * 生存証拠の中の `pt.is_completed = false` に当たって嘘の失敗をする。
     */
    for (const alive of ['a_won', 's_completed', 'c_proposal', 'b_verbal', 'd_hold']) {
      expect(PURGE_JUNK_STAGE_SQL).not.toContain(`'${alive}'`);
    }
  });

  it('放置の日数は自動見送りと同じ 90 日を使う', () => {
    // 別の数字にすると「自動整理には出ないのに台帳からは消える」帯ができる
    expect(PURGE_STALE_NETA_DAYS).toBe(90);
    expect(PURGE_JUNK_STAGE_SQL).toContain("INTERVAL '90 days'");
    expect(SERVICE).toContain('TIDY_AUTO_LOST_DAYS');
  });

  it('生きているネタは消さない（自動見送りと同じ除外を掛ける）', () => {
    /*
     * ⚠️ 自動見送り（`autoLoseStaleNeta`）は `ALIVE_EVIDENCE_SQL` で
     * 「未来までスヌーズ／期限が今日以降の次の一手／未完了で期日が今日以降の
     * タスク／本番日が今日以降」を除いている。**ここだけ抜けると、機械が閉じにも
     * 来ない案件を台帳からは消す**という食い違いが起きる。
     * `updated_at` は 100 日前に設定したスヌーズで古いままになり得るので、
     * 日数だけでは弾けない。
     */
    expect(PURGE_JUNK_STAGE_SQL).toContain('snooze_until');
    expect(PURGE_JUNK_STAGE_SQL).toContain('next_action_date');
    expect(PURGE_JUNK_STAGE_SQL).toContain('event_start');
    // 失注側には掛けない（閉じた案件の片づけ忘れは「生きている」ではない）
    const lostBranch = PURGE_JUNK_STAGE_SQL.slice(0, PURGE_JUNK_STAGE_SQL.indexOf("p.stage = 'neta'"));
    expect(lostBranch).not.toContain('snooze_until');
  });

  it('すでに台帳から外したものは二度と数えない', () => {
    expect(PURGE_TARGET_SQL).toContain('p.deleted_at IS NULL');
  });
});

describe('お金が付いている案件は残す（ご判断「見積だけなら消す」）', () => {
  it('売上・仕入のどちらかがあれば対象から外す', () => {
    expect(PURGE_TARGET_SQL).toContain(`NOT ${PURGE_HAS_MONEY_SQL}`);
    expect(PURGE_HAS_MONEY_SQL).toContain('FROM revenues');
    expect(PURGE_HAS_MONEY_SQL).toContain('FROM purchases');
  });

  it('按分（グループ案件）も見る', () => {
    /*
     * ⚠️ グループ案件では `revenues.project_id` が親を指し、子は
     * `revenue_allocations` にしかいない。直接の行だけ見ると
     * **売上を持っている案件を台帳から外せてしまう**。
     */
    expect(PURGE_HAS_MONEY_SQL).toContain('revenue_allocations');
    expect(PURGE_HAS_MONEY_SQL).toContain('purchase_allocations');
  });

  it('消えた売上（論理削除済み）は「お金がある」に数えない', () => {
    expect(PURGE_HAS_MONEY_SQL).toContain('r.deleted_at  IS NULL');
    expect(PURGE_HAS_MONEY_SQL).toContain('pu.deleted_at IS NULL');
  });

  it('残したぶんを数える口があり、対象と同じゴミの定義を使う', () => {
    // 「消えていないこと」に人は気づけないので、必ず画面に出す
    expect(PURGE_KEPT_SQL).toContain(PURGE_JUNK_STAGE_SQL);
    expect(PURGE_KEPT_SQL).toContain(PURGE_HAS_MONEY_SQL);
    expect(PURGE_KEPT_SQL).not.toContain(`NOT ${PURGE_HAS_MONEY_SQL}`);
  });
});

describe('論理削除であること（物理削除にしない）', () => {
  it('deleted_at を入れるだけで、行は消さない', () => {
    expect(SERVICE).toContain('UPDATE projects SET deleted_at = NOW()');
    /*
     * ⚠️ **DELETE を書かない。** 請求書・検収書は電子帳簿保存法の保存対象で、
     * 失注案件の見積は失注分析の唯一の材料。しかも失注は 90 日放置の自動見送りで
     * 機械も付ける取り消せる状態なので、取り消せない削除の根拠にしてはいけない。
     */
    expect(SERVICE).not.toMatch(/DELETE\s+FROM\s+projects/i);
  });

  it('二重に消さない（すでに外れている行は対象外）', () => {
    expect(SERVICE).toContain('WHERE id = ? AND deleted_at IS NULL');
  });
});

describe('BOX のフォルダを置き去りにしない', () => {
  it('台帳から外す前に片づけを試す', () => {
    /*
     * ⚠️ 片づけの対象は `deleted_at IS NULL` で絞っている。**先に外すと、その
     * 案件のフォルダは二度と片づけの対象に選ばれない**（現役の場所に残ったまま、
     * 指すものが誰にも見えなくなる）。
     */
    const call = SERVICE.indexOf('syncBoxFoldersForStageSafe(r.id');
    const del = SERVICE.indexOf('UPDATE projects SET deleted_at = NOW()');
    expect(call).toBeGreaterThan(0);
    expect(del).toBeGreaterThan(0);
    expect(call).toBeLessThan(del);
  });

  it('片づかなくても外すが、片づかなかった件数を返す', () => {
    // 片づくのを待つと台帳がいつまでも片づかない。黙って置き去りにもしない
    expect(SERVICE).toContain('boxLeft += 1');
    expect(SERVICE).toContain('boxLeft,');
  });
});

describe('1リクエストを時間で区切る（504 の再発を止める）', () => {
  it('件数ではなく時間で切り、30 秒以下にする', () => {
    // 外す直前に BOX を触るので、片づけと同じ理由で時間で切る（PR #492）
    expect(PURGE_BUDGET_MS).toBeLessThanOrEqual(30_000);
    expect(SERVICE).toContain('PURGE_BUDGET_MS');
    expect(SERVICE).toContain('timedOut = true');
  });

  it('画面は「1件も進まなかったら止める」が、時間切れなら続ける', () => {
    const band = read('client/src/contexts/sales/pages/projectList/JunkPurgeBand.tsx');
    expect(band).toContain('if (r.processed === 0 && !r.timedOut) break;');
  });
});

describe('押せる人と、押す前の確認', () => {
  it('API も画面も manager で揃える（押せるのに 403 を作らない）', () => {
    const routes = read('server/src/contexts/sales/routes/projects.routes.ts');
    expect(routes).toContain(`router.post('/purge/junk', requirePermission('sales', 'manager')`);
    expect(routes).toContain(`router.get('/purge/junk', requirePermission('sales', 'manager')`);
    const band = read('client/src/contexts/sales/pages/projectList/JunkPurgeBand.tsx');
    expect(band).toContain(`hasPermission('sales', 'manager')`);
  });

  it('押す前に確認を出す', () => {
    const band = read('client/src/contexts/sales/pages/projectList/JunkPurgeBand.tsx');
    expect(band).toContain('confirmAction');
    expect(band).toContain("tone: 'danger'");
  });
});

describe('BOX を触らなかった理由を数える', () => {
  /*
   * ⚠️ ユーザー報告（2026-08-31）「このように出て結局処理されない」。
   * 504 は直り名寄せも動いた（120 件中 94 件を結び付けた）のに片づけは 0 件で、
   * 画面は「置き場所や名前が想定と違うか中身を数え切れなかった」としか言わなかった。
   * **理由は最初から `box_cleanup_note` にあり、出していなかっただけ。**
   */
  it('名前が違うものは、実物のフォルダ名まで出す', () => {
    const r = summarizeSkipReasons([
      'internal: 触らず (この案件のフォルダではない (【社内】GLS-A001_旧い名前))',
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.code).toBe('nameMismatch');
    expect(r[0]!.sample).toBe('【社内】GLS-A001_旧い名前');
  });

  it('置き場所が違うものは、実際の親フォルダの ID を出す', () => {
    const r = summarizeSkipReasons(['external: 触らず (別の場所にある (親=987654))']);
    expect(r[0]!.code).toBe('elsewhere');
    expect(r[0]!.sample).toBe('987654');
  });

  it('1案件は1つだけ数える（社内・社外の2つで二重に数えない）', () => {
    // 二重に数えると「15 件のはずが 23 件」になり、押した人が数を信じられなくなる
    const r = summarizeSkipReasons([
      'internal: 触らず (この案件のフォルダではない (A)) / external: 触らず (別の場所にある (親=1))',
    ]);
    expect(r.reduce((n, x) => n + x.count, 0)).toBe(1);
  });

  it('多い順に返す', () => {
    const r = summarizeSkipReasons([
      'internal: 触らず (別の場所にある (親=1))',
      'internal: 触らず (別の場所にある (親=2))',
      'internal: 触らず (BOXからフォルダを読めなかった)',
    ]);
    expect(r[0]!.code).toBe('elsewhere');
    expect(r[0]!.count).toBe(2);
  });

  it('空の note は数えない', () => {
    expect(summarizeSkipReasons([null, undefined, '', '   '])).toEqual([]);
  });

  it('知らない理由も落とさずに数える', () => {
    const r = summarizeSkipReasons(['internal: 何か知らないこと']);
    expect(r[0]!.code).toBe('other');
    expect(r[0]!.count).toBe(1);
  });

  it('理由は画面まで届いている（数えたのに出さない、を作らない）', () => {
    const svc = read('server/src/contexts/sales/services/project.service.ts');
    expect(svc).toContain('summarizeSkipReasons');
    expect(svc).toContain('skipped: await this.lostBoxSkipReasons()');
    const band = read('client/src/contexts/sales/pages/projectList/BoxCleanupBand.tsx');
    expect(band).toContain('触らなかった');
    expect(band).toContain('reasons.map');
  });
});
