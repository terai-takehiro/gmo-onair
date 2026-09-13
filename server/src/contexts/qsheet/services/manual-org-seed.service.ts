/**
 * 運営マニュアル — 体制図ブロックの「取り込み」元を読むだけのサービス。
 * 設計: docs/design/v4/production-manual-orgchart.md §5-4（マッピング）・§5-5（API）。
 * 道は `GET /techops/manuals/:id/org-seed`（`manuals.routes.ts` が張る）。
 *
 * ── 差し込み（`kind:'linked'`）ではない ───────────────────────────
 * 体制図は**自由ブロック**で、取り込みは**1回かぎりの流し込み**（§5-4）。取り込んだあとは
 * マニュアル側の独立したデータになり、元を直しても追わない。だから
 * `manual-resolvers/` の下には置かず（あのディレクトリは差し込みブロック専用で
 * `shared/src/production/manualBlocks.ts` のレジストリに載る）、
 * 統一シグネチャ（`{ data, updatedAt }`）にも**似せない** — `updatedAt` を返すと
 * 「元が変わりました」を出せるかのように読めてしまう。
 * そもそも `gpm_members` には `updated_at` 列が無い（migration 161/169/179）。
 *
 * ── 権限 ────────────────────────────────────────────────
 * ⚠️ ここでは権限の判定をしない。**呼び出し元のルートが判定して `scope` で渡す**。
 * 「案件のメンバーから」（`project_members`）は**マニュアル自体が `canAccessManual` を
 * 通っていることだけ**をゲートにする（`manual-resolvers/project.resolver.ts` 冒頭の
 * 「共通ポリシー」と同じ設計判断）。
 *
 * ⚠️ 「プロジェクト管理の体制から」（`gpm_members`）は**別扱い**（レビュー指摘 P1）。
 * この表は担当者のメール・所属を持ち、既存のサーバー側の読み口（`contexts/gpm/index.ts` の
 * `canRead`）は `sales: reader` を要求している。ここだけ qsheet の権限で読めてしまうと、
 * `sales` を1つも持たない人にプロジェクト管理の連絡先が全件渡る。満たさないときは
 * `gpmTiers` を**空で返す**（404 にはしない＝画面は取り込みボタンを畳む・§5-5）。
 *
 * ⚠️ 引数の `projectId` は**マニュアル自身の `qsheet_manuals.project_id`** を渡すこと。
 * クエリ・ボディから受け取った案件 id を渡してはいけない（`POST /manuals` の
 * レビュー指摘（P1）と同型の穴になる）。この関数は案件 id を1つ受け取るだけで、
 * どの案件を読んでよいかを自分では判断しない。
 *
 * ── 列は migration で確認したものだけ ──────────────────────────
 * `project_members`（migration 130）: 論理削除あり → `deleted_at IS NULL` が要る。
 * `gpm_members`（161 + 169 + 179）: **`deleted_at` 列は無い**（体制は「いま誰がやっているか」で
 * 履歴を残す表ではなく物理削除）ので条件に書くと SQL エラーになる。
 * また 179 で `gpm_project_id` は**消えて** `project_id` が `projects(id)` を直接指すので、
 * `gpm_projects` を経由する JOIN は要らない。
 */
import { queryAll, type Row } from '../../../shared/db/connection';

/** 取り込みで流し込む人ひとり。無い項目はキーごと省く（空文字・null のラベルを出さない） */
export interface ManualOrgSeedPerson {
  name: string;
  role?: string;
  org?: string;
  /** 社内ユーザーだけ（§5-4）。`gpm_members` 由来の人には付かない */
  phone?: string;
  email?: string;
  /** 決裁 / 進行 / 議事録 など（`gpm_members.badge`） */
  badge?: string;
}

/** 取り込みで流し込むチーム1つ */
export interface ManualOrgSeedBox {
  label: string;
  /** チームの所属（`gpm_members.side` を日本語の文字に落としたもの）。`label` と同じ文字になるときは省く */
  org?: string;
  people: ManualOrgSeedPerson[];
}

/** 取り込みで流し込む階層1つ */
export interface ManualOrgSeedTier {
  label: string;
  boxes: ManualOrgSeedBox[];
}

/**
 * 取り込み元2つを1回の応答で両方返す（右パネルのボタン2つは同じ応答を出し分けるだけ・往復を増やさない）。
 * `id` は返さない — 階層・チーム・人の id は画面側が `genId('tier'|'box'|'psn')` で振る。
 * 元の `gpm_members.id` を持ち込むと「元を追う」誤解を生む（取り込んだあとはマニュアル側の独立したデータ）。
 */
export interface ManualOrgSeed {
  /** 「案件のメンバーから」。階層を持たないので平らな配列（いま選んでいる階層に流し込む） */
  projectMembers: ManualOrgSeedPerson[];
  /** 「プロジェクト管理の体制から」。tier → 階層 / group_label → チーム に組み上げ済み */
  gpmTiers: ManualOrgSeedTier[];
}

/**
 * `gpm_members.tier` → 階層の名前（§5-4）。
 * 画面には `'top'` のような区分の値を渡さない（区分そのものを持たない設計・§10-2）ので、
 * ここで日本語の文字に落としきる。`client/src/contexts/gpm/types.ts` の `TIER_LABEL` と同じ言葉。
 */
const TIER_LABEL: Record<string, string> = {
  top: '決裁層',
  lead: '推進層',
  unit: '実務層',
};

/**
 * `gpm_members.side` → チームの所属の文字（§5-4）。
 * `client/src/contexts/gpm/types.ts` の `SIDE_LABEL` と同じ言葉。
 */
const SIDE_LABEL: Record<string, string> = {
  internal: '自社',
  client: '発注者',
  pm: 'PM会社',
  vendor: '業者',
};

/** 値は捨てない（§5-4）。表に無い値（CHECK が将来増えたとき）は元の文字列をそのまま出す */
function labelOf(map: Record<string, string>, value: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return map[raw] ?? raw;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 「案件のメンバーから」: `project_members` を読む。
 * 電話は社内ユーザーだけ（`is_external = false` の行の `users.phone`）——
 * `project.resolver.ts` の `project.team` と同じ規律。
 * `is_external` 自体は体制図に持ち込まない（外部の方の会社名を持つ列が無く、所属は手で打つ・§5-4）。
 */
async function readProjectMembers(projectId: string): Promise<ManualOrgSeedPerson[]> {
  const rows = (await queryAll(
    `SELECT
       m.role,
       COALESCE(u.name, m.member_name) AS name,
       m.is_external,
       u.phone
     FROM project_members m
     LEFT JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
     WHERE m.project_id = $1 AND m.deleted_at IS NULL
     ORDER BY m.sort_order, m.created_at`,
    [projectId],
  )) as Row[];

  const people: ManualOrgSeedPerson[] = [];
  for (const r of rows) {
    const name = text(r.name);
    if (!name) continue; // 名前の無い行は流し込まない（出す前の検査に引っかかるだけ）
    const person: ManualOrgSeedPerson = { name };
    const role = text(r.role);
    if (role) person.role = role;
    // 電話は社内ユーザーだけ。外部の方の行に社内ユーザーの番号が付かないようにする
    const phone = r.is_external ? '' : text(r.phone);
    if (phone) person.phone = phone;
    people.push(person);
  }
  return people;
}

/**
 * 「プロジェクト管理の体制から」: `gpm_members` を読んで 階層 → チーム → 人 に組み上げる。
 *
 * 並び順は `gpm.service.ts` の体制の読み口をそのまま踏襲（決裁層 → 推進層 → 実務層 → 並び順 → 名前）。
 * 階層は**行に出てきた順**に作る（CHECK に無い `tier` が将来増えても捨てず、末尾に並ぶ）。
 *
 * チームの束ね方は `MembersTab.tsx` の `boxesOf()` と同じ:
 * `group_label` が空なら**立場（side）の名前のチーム**に入れる（migration 169 のコメントどおり）。
 * そのときチームの名前がすでに所属の文字なので `org` は省く（同じ文字を2回出さない）。
 */
async function readGpmTiers(projectId: string): Promise<ManualOrgSeedTier[]> {
  const rows = (await queryAll(
    `SELECT name, org, role, email, side, tier, group_label, badge
     FROM gpm_members
     WHERE project_id = $1
     ORDER BY CASE tier WHEN 'top' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END, sort_order, name`,
    [projectId],
  )) as Row[];

  const tiers: ManualOrgSeedTier[] = [];
  const tierByKey = new Map<string, ManualOrgSeedTier>();
  const boxByKey = new Map<string, ManualOrgSeedBox>();

  for (const r of rows) {
    const name = text(r.name);
    if (!name) continue;

    const tierKey = text(r.tier) || 'unit';
    let tier = tierByKey.get(tierKey);
    if (!tier) {
      tier = { label: labelOf(TIER_LABEL, tierKey), boxes: [] };
      tierByKey.set(tierKey, tier);
      tiers.push(tier);
    }

    const sideLabel = labelOf(SIDE_LABEL, text(r.side));
    const groupLabel = text(r.group_label);
    const boxLabel = groupLabel || sideLabel;
    const boxKey = `${tierKey} ${boxLabel}`;
    let box = boxByKey.get(boxKey);
    if (!box) {
      box = { label: boxLabel, people: [] };
      // チームの名前がそのまま所属の文字のときは二重に出さない
      if (sideLabel && sideLabel !== boxLabel) box.org = sideLabel;
      boxByKey.set(boxKey, box);
      tier.boxes.push(box);
    }

    const person: ManualOrgSeedPerson = { name };
    const role = text(r.role);
    const org = text(r.org);
    const email = text(r.email);
    const badge = text(r.badge);
    if (role) person.role = role;
    if (org) person.org = org;
    if (email) person.email = email;
    if (badge) person.badge = badge;
    // 電話は足さない。`gpm_members` に電話の列が無く、`users` を JOIN すると
    // 社外の行に社内ユーザーの番号が付きうる（§5-4 のマッピング表にも phone は無い）
    box.people.push(person);
  }

  return tiers;
}

/**
 * 取り込み元ごとの「読んでよいか」。判定はルートが行い、ここは受け取るだけ（上の「権限」）。
 * **省略できる形にしない** — 既定値を持たせると、渡し忘れたときに緩いほうへ倒れる。
 */
export interface ManualOrgSeedScope {
  /**
   * 「プロジェクト管理の体制から」（`gpm_members`）を読んでよいか
   * ＝ 呼び出し本人が `sales: reader` を満たすか。
   * false のときは `gpmTiers` を空で返し、SQL も投げない。
   */
  canReadGpm: boolean;
}

/**
 * 体制図の取り込み元を読む。
 *
 * `projectId` が null（`program_id` 紐づけのマニュアル）のときは**両方とも空**で返す
 * ＝ 画面は取り込みボタンを出さない（§5-5）。`qsheet_manuals` は
 * `CHECK (num_nonnulls(project_id, program_id) = 1)` なので、null なら必ず番組由来。
 * 404 にはしない（マニュアル自体は存在する）。
 *
 * `scope.canReadGpm` が false のときも同じ作法で `gpmTiers` だけ空にする
 * （403 にはしない＝「案件のメンバーから」は今までどおり使える）。
 */
export async function getManualOrgSeed(
  projectId: string | null,
  scope: ManualOrgSeedScope,
): Promise<ManualOrgSeed> {
  if (!projectId) return { projectMembers: [], gpmTiers: [] };

  const [projectMembers, gpmTiers] = await Promise.all([
    readProjectMembers(projectId),
    scope.canReadGpm ? readGpmTiers(projectId) : Promise.resolve<ManualOrgSeedTier[]>([]),
  ]);
  return { projectMembers, gpmTiers };
}
