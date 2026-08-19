// 案件管理アプリのExcel入出力
// customers / vendors / partners / projects / episodes
//
// ⚠️ **案件分類は3列そろえて書くこと**（`projects` の insert / update）。
// この取込は長いあいだ旧 `project_type` だけを書いていました。2段
// （`audience` / `project_category`）が空のまま入るので、
// **案件詳細の概要タブには旧種類が「案件分類」として出る**のに
// **案件を直す画面では「選ぶ」＝未登録に見える**、という食い違いになります
// （ご指摘: 「すでに案件分類を登録していても、案件を直すを開くと未登録状態になる」）。
// 導く表は `project-classification.ts` の1か所だけ。ここに書き写さないこと。
import { Router } from 'express';
import {
  createExcelResourceRouter, ResourceConfig, newId, asString, asInt, asDate,
} from '../../../shared/utils/excel-resource';
import { looksLikeGmoGroup } from '../../../shared/services/gmo-group';
import { resolveClassification } from '../services/project-classification';
import {
  createCustomerRecord, createVendorRecord, updateCompanyDirectory, execFromPgClient,
} from '../../../shared/services/company-directory.service';

// ============================================================
// 顧客 (customers)
// ============================================================
const CUSTOMERS_CONFIG: ResourceConfig = {
  name: '顧客',
  filename: 'customers',
  permission: { module: 'sales', level: 'editor' },
  // Phase 3-3-9（`customers` テーブル削除）以降、重複検出も companies を対象にする。
  // 役割（is_customer）を問わず名前で突き合わせる — 同じ会社が既に仕入先だけの
  // 行として companies にあれば、その行に顧客ロールを足す（新しい重複行を
  // 作らない。会社リスト一本化の本来の狙いに合う）。役割を足すのは下の update()。
  duplicate: { table: 'companies', column: 'name' },
  columns: [
    { key: 'name',         header: '会社名',     width: 28 },
    { key: 'short_name',   header: '略称',       width: 14 },
    { key: 'contact_name', header: '担当者',     width: 16 },
    { key: 'email',        header: 'Email',      width: 24 },
    { key: 'phone',        header: '電話',       width: 16 },
    { key: 'address',      header: '住所',       width: 40 },
    { key: 'notes',        header: '備考',       width: 30 },
  ],
  templateRows: [
    { name: '株式会社サンプル', short_name: 'サンプル社', contact_name: '山田太郎',
      email: 'yamada@example.com', phone: '03-1234-5678', address: '東京都港区...', notes: '' },
  ],
  // Phase 3-3-4（2026-08-18）: customers ではなく companies（is_customer = TRUE）
  // から読む（backup.routes.ts の「顧客」シートと同じ理由。取込・重複チェックは
  // 引き続き customers テーブルを対象にする＝書き込み先は変えていない）
  exportQuery: `
    SELECT name, short_name, contact_name, email, phone, address, notes
    FROM companies WHERE is_customer = TRUE AND deleted_at IS NULL ORDER BY name`,
  validateRow: (raw) => {
    const errors: string[] = [];
    const name = asString(raw.name);
    if (!name) errors.push('会社名は必須');
    return {
      data: {
        _displayName: name,
        name,
        short_name: asString(raw.short_name),
        contact_name: asString(raw.contact_name),
        email: asString(raw.email),
        phone: asString(raw.phone),
        address: asString(raw.address),
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: name,
    };
  },
  insert: async (client, d, userId) => {
    // `companies`（取引先マスター）に行を作る（company-directory.service.ts）。
    // グループの印は社名から見立てる（migration 192）。取込は印を持たないので、
    // ここで入れないとその会社の案件だけグループ外のまま残る
    await createCustomerRecord(
      { name: asString(d.name) || '', short_name: asString(d.short_name), contact_name: asString(d.contact_name),
        email: asString(d.email), phone: asString(d.phone), address: asString(d.address),
        notes: asString(d.notes), is_gmo_group: looksLikeGmoGroup(asString(d.name)) },
      userId, execFromPgClient(client),
    );
  },
  update: async (client, id, d, userId) => {
    // id は companies.id（重複検出が companies を対象にするようになったため）。
    // is_gmo_group は Excel が持たない列なので渡さない（今の値を保つ・
    // `updateCompanyDirectory` は渡された列だけ書き換える）。is_customer は
    // 既に仕入先だけの行だった場合に備えて明示的に TRUE にする。
    await updateCompanyDirectory(
      id as string,
      { name: asString(d.name) || '', short_name: asString(d.short_name), contact_name: asString(d.contact_name),
        email: asString(d.email), phone: asString(d.phone), address: asString(d.address),
        notes: asString(d.notes) },
      userId, execFromPgClient(client),
    );
    await client.query(`UPDATE companies SET is_customer = TRUE WHERE id = $1`, [id]);
  },
};

// ============================================================
// 仕入先 (vendors)
// ============================================================
const VENDORS_CONFIG: ResourceConfig = {
  name: '仕入先',
  filename: 'vendors',
  permission: { module: 'budget', level: 'editor' },
  // Phase 3-3-9（`vendors` テーブル削除）以降、重複検出も companies を対象にする
  // （CUSTOMERS_CONFIG と同じ理由）。
  duplicate: { table: 'companies', column: 'name' },
  columns: [
    { key: 'name',                        header: '会社名',           width: 28 },
    { key: 'contact_name',                header: '担当者',           width: 16 },
    { key: 'email',                       header: 'Email',            width: 24 },
    { key: 'phone',                       header: '電話',             width: 16 },
    { key: 'address',                     header: '住所',             width: 40 },
    { key: 'vendor_type',                 header: '区分',             width: 12 },
    { key: 'invoice_registration_number', header: '適格請求書登録番号', width: 24 },
    { key: 'notes',                       header: '備考',             width: 30 },
  ],
  templateRows: [
    { name: '株式会社サンプル仕入', contact_name: '佐藤花子', email: 'sato@example.com',
      phone: '03-9876-5432', address: '東京都新宿区...', vendor_type: '機材',
      invoice_registration_number: 'T1234567890123', notes: '' },
  ],
  // Phase 3-3-9（`vendors` テーブル削除）以降、companies（is_vendor = TRUE）
  // から読む（CUSTOMERS_CONFIG の exportQuery と同じ理由）
  exportQuery: `
    SELECT name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes
    FROM companies WHERE is_vendor = TRUE AND deleted_at IS NULL ORDER BY name`,
  validateRow: (raw) => {
    const errors: string[] = [];
    const name = asString(raw.name);
    if (!name) errors.push('会社名は必須');
    return {
      data: {
        _displayName: name,
        name,
        contact_name: asString(raw.contact_name),
        email: asString(raw.email),
        phone: asString(raw.phone),
        address: asString(raw.address),
        vendor_type: asString(raw.vendor_type),
        invoice_registration_number: asString(raw.invoice_registration_number),
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: name,
    };
  },
  insert: async (client, d, userId) => {
    // `companies`（取引先マスター）に行を作る（company-directory.service.ts）
    await createVendorRecord(
      { name: asString(d.name) || '', contact_name: asString(d.contact_name), email: asString(d.email),
        phone: asString(d.phone), address: asString(d.address), vendor_type: asString(d.vendor_type),
        invoice_registration_number: asString(d.invoice_registration_number), notes: asString(d.notes) },
      userId, execFromPgClient(client),
    );
  },
  update: async (client, id, d, userId) => {
    // id は companies.id（重複検出が companies を対象にするようになったため）。
    // is_vendor は既に顧客だけの行だった場合に備えて明示的に TRUE にする
    // （CUSTOMERS_CONFIG.update と対称）。
    await updateCompanyDirectory(
      id as string,
      { name: asString(d.name) || '', contact_name: asString(d.contact_name), email: asString(d.email),
        phone: asString(d.phone), address: asString(d.address), vendor_type: asString(d.vendor_type),
        invoice_registration_number: asString(d.invoice_registration_number), notes: asString(d.notes) },
      userId, execFromPgClient(client),
    );
    await client.query(`UPDATE companies SET is_vendor = TRUE WHERE id = $1`, [id]);
  },
};

// ============================================================
// パートナー (partners)
// ============================================================
const PARTNERS_CONFIG: ResourceConfig = {
  name: 'パートナー',
  filename: 'partners',
  permission: { module: 'budget', level: 'editor' },
  duplicate: { table: 'partners', column: 'name' },
  columns: [
    { key: 'name',        header: '氏名',     width: 20 },
    { key: 'email',       header: 'Email',    width: 24 },
    { key: 'phone',       header: '電話',     width: 16 },
    { key: 'role_title',  header: '役職',     width: 16 },
    { key: 'specialties', header: '専門分野', width: 30 },
    { key: 'notes',       header: '備考',     width: 30 },
  ],
  templateRows: [
    { name: '田中一郎', email: 'tanaka@example.com', phone: '090-1234-5678',
      role_title: 'カメラマン', specialties: 'カメラ,照明', notes: '' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [
      { key: 'col', header: '項目', width: 20 },
      { key: 'desc', header: '説明', width: 60 },
    ],
    rows: [
      { col: '専門分野', desc: 'カンマ区切りで複数指定可 (例: カメラ,照明,音声)' },
    ],
  },
  exportQuery: `
    SELECT name, email, phone, role_title, specialties, notes
    FROM partners WHERE deleted_at IS NULL ORDER BY name`,
  validateRow: (raw) => {
    const errors: string[] = [];
    const name = asString(raw.name);
    if (!name) errors.push('氏名は必須');
    // specialtiesがカンマ区切り文字列ならJSON配列に
    let specialties = asString(raw.specialties);
    if (specialties && !specialties.startsWith('[')) {
      const arr = specialties.split(',').map((s) => s.trim()).filter(Boolean);
      specialties = JSON.stringify(arr);
    }
    return {
      data: {
        _displayName: name,
        name,
        email: asString(raw.email),
        phone: asString(raw.phone),
        role_title: asString(raw.role_title),
        specialties: specialties || '[]',
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: name,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO partners (id, name, email, phone, role_title, specialties, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [newId(), d.name, d.email, d.phone, d.role_title, d.specialties, d.notes, userId, userId],
    );
  },
  update: async (client, id, d, userId) => {
    await client.query(
      `UPDATE partners SET name=$1, email=$2, phone=$3, role_title=$4, specialties=$5, notes=$6,
       updated_by=$7, updated_at=NOW() WHERE id=$8`,
      [d.name, d.email, d.phone, d.role_title, d.specialties, d.notes, userId, id],
    );
  },
};

// ============================================================
// 案件 (projects) — 顧客lookup + ステージ正規化
// ============================================================
const STAGE_MAP: Record<string, string> = {
  neta: 'neta', 'ネタ': 'neta',
  d_hold: 'd_hold', '保留': 'd_hold',
  c_proposal: 'c_proposal', '提案中': 'c_proposal',
  b_verbal: 'b_verbal', '口頭内示': 'b_verbal',
  a_won: 'a_won', '受注': 'a_won',
  s_completed: 's_completed', '完了': 's_completed',
  e_lost: 'e_lost', '失注': 'e_lost',
};

const PROJECTS_CONFIG: ResourceConfig = {
  name: '案件',
  filename: 'projects',
  permission: { module: 'sales', level: 'editor' },
  duplicate: { table: 'projects', column: 'code' },
  columns: [
    { key: 'code',                 header: 'コード',         width: 16 },
    { key: 'gls_number',           header: 'GLS番号',        width: 14 },
    { key: 'name',                 header: '案件名',         width: 36 },
    { key: 'customer_name',        header: '顧客名',         width: 24 },
    { key: 'stage',                header: 'ステージ',       width: 12 },
    { key: 'project_type',         header: '案件種別',       width: 14 },
    { key: 'expected_amount',      header: '予定金額',       width: 14 },
    { key: 'event_start',          header: '開始日',         width: 12 },
    { key: 'event_end',            header: '終了日',         width: 12 },
    { key: 'broadcast_type',       header: '配信種別',       width: 12 },
    { key: 'media_platform',       header: 'メディア',       width: 14 },
    { key: 'assigned_to_email',    header: '担当者Email',    width: 24 },
    { key: 'tags',                 header: 'タグ',           width: 18 },
    { key: 'notes',                header: '備考',           width: 30 },
  ],
  templateRows: [
    { code: 'PRJ-2026-001', gls_number: '', name: 'サンプル案件（新規ヨミ）',
      customer_name: '株式会社サンプル', stage: 'c_proposal', project_type: 'event',
      expected_amount: 1000000, event_start: '2026-06-01', event_end: '2026-06-02',
      broadcast_type: 'live', media_platform: 'YouTube',
      assigned_to_email: 'admin@example.com', tags: '配信,IR', notes: '' },
    { code: 'PRJ-LEGACY-001', gls_number: 'GLS001', name: '旧案件サンプル（過去データ取り込み例）',
      customer_name: '株式会社サンプル', stage: 's_completed', project_type: 'recording',
      expected_amount: 3000000, event_start: '2024-03-01', event_end: '2024-03-01',
      broadcast_type: '', media_platform: '',
      assigned_to_email: 'admin@example.com', tags: '', notes: '旧システムからの移行データ' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [
      { key: 'col', header: '項目', width: 20 },
      { key: 'desc', header: '説明', width: 70 },
    ],
    rows: [
      { col: 'コード', desc: '【必須】案件固有コード (重複検出キー)。例: PRJ-2026-001' },
      { col: 'GLS番号', desc: '受注後に発番。空欄ならヨミ段階扱い。過去データ取り込み時は旧形式 (GLS001 等) もそのまま入力可' },
      { col: '案件名', desc: '【必須】' },
      { col: '顧客名', desc: '【必須】事前に登録済みの顧客名と完全一致' },
      { col: 'ステージ', desc: 'neta/d_hold/c_proposal/b_verbal/a_won/s_completed/e_lost (日本語OK: ネタ/保留/提案中/口頭内示/受注/完了/失注)' },
      { col: '担当者Email', desc: '【必須】事前に登録済みのユーザーEmailと完全一致' },
      { col: 'タグ', desc: 'カンマ区切り文字列' },
      { col: '備考', desc: '案件の「やり取り」にメモとして1件残ります。取り込み直しても、同じ本文なら増えません。書き出しはいちばん新しいメモ' },
    ],
  },
  exportQuery: `
    SELECT p.code, p.gls_number, p.name, c.name as customer_name,
           p.stage, p.project_type, p.expected_amount, p.event_start, p.event_end,
           p.broadcast_type, p.media_platform, u.email as assigned_to_email, p.tags,
           memo.description AS notes
    FROM projects p
    LEFT JOIN companies c ON c.id = p.customer_id
    LEFT JOIN users u ON u.id = p.assigned_to
    -- 備考 = いちばん新しいメモ。migration 184 で projects.notes を落とし、
    -- メモはやり取り (activity_logs の memo) に畳んだ。
    -- 列を消さずに中身を差し替えているのは、配ってある Excel の様式を変えないため
    -- (列が1つ減ると、手元の古い様式で取り込んだ人の備考が別の列に入る)
    LEFT JOIN LATERAL (
      SELECT a.description FROM activity_logs a
        WHERE a.project_id = p.id AND a.activity_type = 'memo' AND a.deleted_at IS NULL
        ORDER BY a.activity_date DESC, a.created_at DESC LIMIT 1
    ) memo ON TRUE
    WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`,
  preloadLookups: async (client) => {
    // Phase 3-2a: projects.customer_id は companies.id を直接指すので、
    // 名前解決も companies（is_customer=TRUE）から引く。
    // Phase 3-3-4（2026-08-18）: 以前は `customers` 行が生きているかの `EXISTS`
    // チェックも必須だった（`DELETE /customers/:id` が `companies.is_customer` を
    // 更新していなかったため）。`DELETE` が `companies.is_customer` も更新する
    // ようになった（PR #226）ので、`is_customer = TRUE AND deleted_at IS NULL`
    // だけで足りる（`customers.routes.ts`/`search.routes.ts` と同じ判定・同じ理由）。
    const cust = await client.query(
      `SELECT co.id, co.name FROM companies co
       WHERE co.is_customer = TRUE AND co.deleted_at IS NULL`,
    );
    const users = await client.query('SELECT id, email FROM users WHERE deleted_at IS NULL');
    return {
      customers: new Map(cust.rows.map((r) => [r.name as string, r.id as string])),
      users: new Map(users.rows.map((r) => [r.email as string, r.id as string])),
    };
  },
  validateRow: (raw, lookups) => {
    const errors: string[] = [];
    const code = asString(raw.code);
    const name = asString(raw.name);
    if (!code) errors.push('コードは必須');
    if (!name) errors.push('案件名は必須');

    let customer_id: string | null = null;
    const custName = asString(raw.customer_name);
    if (!custName) errors.push('顧客名は必須');
    else {
      const id = lookups.customers?.get(custName);
      if (!id) errors.push(`顧客 "${custName}" がマスタに存在しません`);
      else customer_id = id;
    }

    let assigned_to: string | null = null;
    const email = asString(raw.assigned_to_email);
    if (!email) errors.push('担当者Emailは必須');
    else {
      const id = lookups.users?.get(email);
      if (!id) errors.push(`ユーザー "${email}" がマスタに存在しません`);
      else assigned_to = id;
    }

    const stageRaw = String(raw.stage ?? '').trim().toLowerCase();
    const stage = STAGE_MAP[stageRaw] || 'neta';

    return {
      data: {
        _displayName: name,
        code, name, customer_id, assigned_to, stage,
        gls_number: asString(raw.gls_number),
        project_type: asString(raw.project_type) || 'other',
        expected_amount: asInt(raw.expected_amount) ?? 0,
        event_start: asString(raw.event_start),
        event_end: asString(raw.event_end),
        broadcast_type: asString(raw.broadcast_type),
        media_platform: asString(raw.media_platform),
        tags: asString(raw.tags) || '',
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: code,
    };
  },
  insert: async (client, d, userId) => {
    const id = newId();
    // **旧「案件種別」だけを書かない**（下記 `resolveClassification` の理由）。
    // 取込は GLS 分類の列を持たないので NULL のまま = A 扱いで2段を導く
    const cls = resolveClassification(undefined, undefined, d.project_type, null);
    await client.query(
      `INSERT INTO projects (id, code, gls_number, name, customer_id, stage,
                             project_type, audience, project_category,
                             expected_amount, event_start, event_end, broadcast_type, media_platform,
                             assigned_to, tags, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [id, d.code, d.gls_number, d.name, d.customer_id, d.stage,
       cls.project_type, cls.audience, cls.project_category,
       d.expected_amount, d.event_start, d.event_end, d.broadcast_type, d.media_platform,
       d.assigned_to, d.tags, userId, userId],
    );
    await upsertProjectMemo(client, id, d.customer_id as string | null, d.notes as string, userId);
  },
  update: async (client, id, d, userId) => {
    const cur = (await client.query(
      'SELECT project_type, audience, project_category, gls_category FROM projects WHERE id=$1', [id],
    )).rows[0] as Record<string, unknown> | undefined;
    /**
     * **種類を変えていないなら、人が入れた2段はそのまま残す。**
     *
     * 旧種類は4種しかないので、毎回導き直すと
     * **「有観客の収録（公開収録）」が「有観客の配信」に化けます**
     * （`hybrid_event` に寄せてあるものを逆に引くと配信になる）。
     * Excel の「案件種別」を人が書き換えたときだけ導き直します。
     */
    const typeChanged = String(cur?.project_type ?? '') !== String(d.project_type ?? '');
    const keeps2 = !typeChanged && (!!cur?.audience || !!cur?.project_category);
    const cls = keeps2
      ? { project_type: d.project_type, audience: cur!.audience, project_category: cur!.project_category }
      : resolveClassification(undefined, undefined, d.project_type, (cur?.gls_category as string | null) ?? null);
    await client.query(
      `UPDATE projects SET code=$1, gls_number=$2, name=$3, customer_id=$4, stage=$5,
                           project_type=$6, audience=$7, project_category=$8,
                           expected_amount=$9, event_start=$10, event_end=$11, broadcast_type=$12, media_platform=$13,
                           assigned_to=$14, tags=$15, updated_by=$16, updated_at=NOW()
       WHERE id=$17`,
      [d.code, d.gls_number, d.name, d.customer_id, d.stage,
       cls.project_type, cls.audience, cls.project_category,
       d.expected_amount, d.event_start, d.event_end, d.broadcast_type, d.media_platform,
       d.assigned_to, d.tags, userId, id],
    );
    await upsertProjectMemo(client, id, d.customer_id as string | null, d.notes as string, userId);
  },
};

/**
 * Excel の「備考」を**やり取りのメモ1件**として書く (migration 184)。
 *
 * **同じ本文なら足しません。** Excel の取り込みは同じファイルを直して
 * 何度も流すものなので、毎回足すと1件の案件にメモが何十件も並びます。
 */
async function upsertProjectMemo(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  projectId: string,
  customerId: string | null,
  notes: unknown,
  userId: string | null,
): Promise<void> {
  const body = typeof notes === 'string' ? notes.trim() : '';
  if (!body) return;
  const dup = await client.query(
    `SELECT 1 FROM activity_logs
      WHERE project_id = $1 AND activity_type = 'memo' AND btrim(description) = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [projectId, body],
  );
  if (dup.rows.length > 0) return;
  // user_id は NOT NULL。取り込みを流した人が分からないときは**案件の担当**に寄せる
  // (assigned_to は NOT NULL + users への外部キーなので必ず引ける)。
  // ここで諦めると、Excel に書いた備考が黙って消える
  await client.query(
    `INSERT INTO activity_logs
       (id, project_id, customer_id, user_id, activity_type, subject, description, activity_date, created_by, updated_by)
     SELECT $1, $2, $3, COALESCE($4, p.assigned_to), 'memo', 'メモ', $5,
            to_char(NOW() AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD'),
            COALESCE($4, p.assigned_to), COALESCE($4, p.assigned_to)
       FROM projects p WHERE p.id = $2`,
    [newId(), projectId, customerId, userId, body],
  );
}

// ============================================================
// エピソード (episodes) — project_idは GLS番号 or code でlookup
// ============================================================
const EPISODES_CONFIG: ResourceConfig = {
  name: 'エピソード',
  filename: 'episodes',
  permission: { module: 'sales', level: 'editor' },
  duplicate: { table: 'episodes', column: 'episode_code' },
  columns: [
    { key: 'project_key',    header: '案件コード/GLS', width: 16 },
    { key: 'episode_code',   header: 'エピソードコード', width: 18 },
    { key: 'episode_number', header: '話数',           width: 8 },
    { key: 'recording_date', header: '収録日',         width: 12 },
    { key: 'broadcast_date', header: '放送日',         width: 12 },
    { key: 'delivery_date',  header: '納品日',         width: 12 },
    { key: 'notes',          header: '備考',           width: 30 },
  ],
  templateRows: [
    { project_key: 'PRJ-2026-001', episode_code: 'PRJ-2026-001-001', episode_number: 1,
      recording_date: '2026-06-01', broadcast_date: '2026-06-15', delivery_date: '2026-06-10', notes: '' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [{ key: 'col', header: '項目', width: 20 }, { key: 'desc', header: '説明', width: 60 }],
    rows: [
      { col: '案件コード/GLS', desc: '【必須】projectsテーブルのcodeまたはgls_numberと一致' },
      { col: 'エピソードコード', desc: '【必須】システム全体で一意' },
      { col: '話数', desc: '【必須】整数' },
    ],
  },
  exportQuery: `
    SELECT COALESCE(p.gls_number, p.code) as project_key, e.episode_code, e.episode_number,
           e.recording_date, e.broadcast_date, e.delivery_date, e.notes
    FROM episodes e JOIN projects p ON p.id = e.project_id
    WHERE e.deleted_at IS NULL ORDER BY p.code, e.episode_number`,
  preloadLookups: async (client) => {
    const projects = await client.query(
      'SELECT id, code, gls_number FROM projects WHERE deleted_at IS NULL',
    );
    const map = new Map<string, string>();
    for (const r of projects.rows) {
      if (r.code) map.set(r.code as string, r.id as string);
      if (r.gls_number) map.set(r.gls_number as string, r.id as string);
    }
    return { projects: map };
  },
  validateRow: (raw, lookups) => {
    const errors: string[] = [];
    const projectKey = asString(raw.project_key);
    const episodeCode = asString(raw.episode_code);
    const episodeNumber = asInt(raw.episode_number);

    if (!projectKey) errors.push('案件コード/GLSは必須');
    if (!episodeCode) errors.push('エピソードコードは必須');
    if (episodeNumber == null) errors.push('話数は必須(整数)');

    let project_id: string | null = null;
    if (projectKey) {
      const id = lookups.projects?.get(projectKey);
      if (!id) errors.push(`案件 "${projectKey}" がマスタに存在しません`);
      else project_id = id;
    }

    return {
      data: {
        _displayName: episodeCode,
        project_id,
        episode_code: episodeCode,
        episode_number: episodeNumber,
        recording_date: asDate(raw.recording_date),
        broadcast_date: asDate(raw.broadcast_date),
        delivery_date: asDate(raw.delivery_date),
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: episodeCode,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO episodes (id, project_id, episode_number, episode_code,
                             recording_date, broadcast_date, delivery_date, notes,
                             created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [newId(), d.project_id, d.episode_number, d.episode_code,
       d.recording_date, d.broadcast_date, d.delivery_date, d.notes, userId, userId],
    );
  },
  update: async (client, id, d, userId) => {
    await client.query(
      `UPDATE episodes SET project_id=$1, episode_number=$2, recording_date=$3,
                           broadcast_date=$4, delivery_date=$5, notes=$6,
                           updated_by=$7, updated_at=NOW() WHERE id=$8`,
      [d.project_id, d.episode_number, d.recording_date, d.broadcast_date,
       d.delivery_date, d.notes, userId, id],
    );
  },
};

export function createSalesExcelRouter(): Router {
  const router = Router();
  router.use('/customers/excel', createExcelResourceRouter(CUSTOMERS_CONFIG));
  router.use('/vendors/excel', createExcelResourceRouter(VENDORS_CONFIG));
  router.use('/partners/excel', createExcelResourceRouter(PARTNERS_CONFIG));
  router.use('/projects/excel', createExcelResourceRouter(PROJECTS_CONFIG));
  router.use('/episodes/excel', createExcelResourceRouter(EPISODES_CONFIG));
  return router;
}

