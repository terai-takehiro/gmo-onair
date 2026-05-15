/**
 * seed-tasks.ts
 * プロジェクトタスク管理のダミーデータを既存 DB に追加するスクリプト。
 * 開発・検証環境で自動実行されます（本番は SKIP_SEED=true のため実行されない）。
 *
 *   npm run db:seed:tasks -w server
 */

import { v4 as uuidv4 } from 'uuid';
import { initDb, closeDb, queryOne, queryAll, execute } from './connection';
import { runMigrations } from './migrate';

// ---------- helpers ----------
const ins = (sql: string, params: unknown[]) => execute(sql, params);

function d(offset: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().slice(0, 10);
}

async function seedTasks() {
  await initDb();

  // テーブル存在確認
  const tableExists = async (name: string): Promise<boolean> => {
    const r = await queryOne(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [name]
    );
    return !!r;
  };

  const taskTableOk  = await tableExists('project_tasks');
  const colTableOk   = await tableExists('task_columns');

  if (!taskTableOk || !colTableOk) {
    console.warn('[seed-tasks] テーブルが未作成のためスキップ');
    return;
  }

  // 既存データ確認（冪等性）
  const existingCount = await queryOne('SELECT COUNT(*)::int AS c FROM task_columns');
  if ((existingCount?.c as number) > 0) {
    console.log('[seed-tasks] タスクデータが既に存在するためスキップ');
    return;
  }

  // ユーザー取得
  const admin  = await queryOne("SELECT id FROM users WHERE role='system_admin' LIMIT 1");
  const staffs = await queryAll("SELECT id FROM users WHERE role='staff' ORDER BY name LIMIT 5");
  const adminId  = admin?.id as string;
  const u = [
    adminId,
    ...(staffs.map((s) => s.id as string)),
  ];

  // プロジェクト取得（完了・失注を除く）
  const projects = await queryAll(
    `SELECT id, gls_number, gls_category, name
     FROM projects
     WHERE deleted_at IS NULL
       AND stage NOT IN ('s_completed', 'e_lost')
       AND gls_number IS NOT NULL
     ORDER BY gls_number`
  );

  if (projects.length === 0) {
    console.warn('[seed-tasks] アクティブな GLS 案件が見つかりません');
    return;
  }

  console.log(`[seed-tasks] ${projects.length} 案件にタスクデータを投入中...`);

  for (const proj of projects) {
    const pid = proj.id as string;
    const cat = proj.gls_category as string;
    const gls = proj.gls_number as string;

    // ---- カラムを作成 ----
    const colIds: string[] = [];

    if (cat === 'A') {
      const cols = [
        { name: '未着手',   color: '#94a3b8' },
        { name: '台本作成', color: '#a78bfa' },
        { name: '素材準備', color: '#60a5fa' },
        { name: '収録',     color: '#fb923c' },
        { name: '確認中',   color: '#facc15' },
        { name: '完了',     color: '#4ade80' },
      ];
      for (let i = 0; i < cols.length; i++) {
        const colId = uuidv4();
        colIds.push(colId);
        await ins(
          `INSERT INTO task_columns (id, project_id, name, color, sort_order, created_at, updated_at, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),$6,$6)`,
          [colId, pid, cols[i].name, cols[i].color, i, adminId]
        );
      }
    } else {
      const cols = [
        { name: 'バックログ',   color: '#94a3b8' },
        { name: 'アクション中', color: '#60a5fa' },
        { name: 'レビュー待ち', color: '#facc15' },
        { name: '完了',         color: '#4ade80' },
      ];
      for (let i = 0; i < cols.length; i++) {
        const colId = uuidv4();
        colIds.push(colId);
        await ins(
          `INSERT INTO task_columns (id, project_id, name, color, sort_order, created_at, updated_at, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),$6,$6)`,
          [colId, pid, cols[i].name, cols[i].color, i, adminId]
        );
      }
    }

    // ---- タスクを作成 ----
    const addTask = async (opts: {
      title: string;
      colIdx: number;
      sortOrder: number;
      assignedTo?: string;
      startDate?: string | null;
      dueDate?: string | null;
      isCompleted?: boolean;
      description?: string | null;
      taskType?: string;
    }) => {
      const tid = uuidv4();
      const colId = colIds[opts.colIdx] ?? null;
      const completed = opts.isCompleted ?? false;
      await ins(
        `INSERT INTO project_tasks
           (id, project_id, column_id, title, description, task_type,
            start_date, due_date, assigned_to,
            is_completed, completed_at, sort_order,
            created_at, updated_at, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,
                 $7::date,$8::date,$9,
                 $10,$11,$12,
                 NOW(),NOW(),$13,$13)`,
        [
          tid, pid, colId,
          opts.title, opts.description ?? null, opts.taskType ?? 'free',
          opts.startDate ?? null, opts.dueDate ?? null, opts.assignedTo ?? null,
          completed, completed ? new Date().toISOString() : null, opts.sortOrder,
          adminId,
        ]
      );
    };

    if (cat === 'A') {
      // GLS-A: 制作フロー向けタスク
      // 未着手(0) 台本(1) 素材(2) 収録(3) 確認(4) 完了(5)
      await addTask({ title: '企画書作成', colIdx: 5, sortOrder: 0, assignedTo: u[1], startDate: d(-30), dueDate: d(-25), isCompleted: true });
      await addTask({ title: 'クライアント事前打合せ', colIdx: 5, sortOrder: 1, assignedTo: u[2], startDate: d(-20), dueDate: d(-18), isCompleted: true });
      await addTask({ title: '台本第1稿', colIdx: 1, sortOrder: 0, assignedTo: u[1], startDate: d(-10), dueDate: d(-3) });
      await addTask({ title: '台本クライアント確認', colIdx: 1, sortOrder: 1, assignedTo: u[2], startDate: d(-3), dueDate: d(2) });
      await addTask({ title: 'スタジオ機材手配', colIdx: 2, sortOrder: 0, assignedTo: u[3], startDate: d(-5), dueDate: d(5) });
      await addTask({ title: 'テロップ素材制作', colIdx: 2, sortOrder: 1, assignedTo: u[1], startDate: d(0), dueDate: d(7) });
      await addTask({ title: 'VTR素材収集', colIdx: 2, sortOrder: 2, assignedTo: u[4], startDate: d(-2), dueDate: d(3) });
      await addTask({ title: '本番収録', colIdx: 3, sortOrder: 0, assignedTo: u[2], startDate: d(8), dueDate: d(10) });
      await addTask({ title: 'リハーサル', colIdx: 3, sortOrder: 1, assignedTo: u[3], startDate: d(7), dueDate: d(8) });
      await addTask({ title: '編集・MA確認', colIdx: 4, sortOrder: 0, assignedTo: u[1], startDate: d(11), dueDate: d(14) });
      await addTask({ title: 'クライアント最終試写', colIdx: 4, sortOrder: 1, assignedTo: u[2], startDate: d(15), dueDate: d(17) });
      await addTask({ title: 'スタッフ弁当手配', colIdx: 0, sortOrder: 0, assignedTo: u[4], dueDate: d(9) });
      await addTask({ title: '請求書作成', colIdx: 0, sortOrder: 1, assignedTo: u[3], dueDate: d(20) });
    } else {
      // GLS-B: 営業フロー向けタスク
      // バックログ(0) アクション(1) レビュー(2) 完了(3)
      await addTask({ title: '提案資料作成', colIdx: 3, sortOrder: 0, assignedTo: u[1], startDate: d(-25), dueDate: d(-20), isCompleted: true });
      await addTask({ title: '見積書作成・送付', colIdx: 3, sortOrder: 1, assignedTo: u[2], startDate: d(-15), dueDate: d(-12), isCompleted: true });
      await addTask({ title: 'キックオフ MTG', colIdx: 1, sortOrder: 0, assignedTo: u[1], startDate: d(-5), dueDate: d(0) });
      await addTask({ title: '要件定義書レビュー', colIdx: 2, sortOrder: 0, assignedTo: u[2], startDate: d(1), dueDate: d(5) });
      await addTask({ title: '契約書確認・押印', colIdx: 1, sortOrder: 1, assignedTo: u[3], startDate: d(2), dueDate: d(7) });
      await addTask({ title: '中間報告資料作成', colIdx: 0, sortOrder: 0, assignedTo: u[1], dueDate: d(14) });
      await addTask({ title: '請求書発行', colIdx: 0, sortOrder: 1, assignedTo: u[2], dueDate: d(21) });
      await addTask({ title: '成果物納品', colIdx: 2, sortOrder: 1, assignedTo: u[4], startDate: d(10), dueDate: d(15) });
    }
  }

  console.log(`[seed-tasks] タスクデータ投入完了 (${projects.length} 案件)`);
}

// CLI で直接実行した場合
if (process.argv[1]?.endsWith('seed-tasks.ts') || process.argv[1]?.endsWith('seed-tasks.js')) {
  runMigrations().then(() => seedTasks()).then(() => closeDb()).catch(console.error);
}

export { seedTasks };
