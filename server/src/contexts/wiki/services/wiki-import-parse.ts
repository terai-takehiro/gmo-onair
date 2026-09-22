/**
 * Wiki — 取り込み（zip）の読み解き（`docs/design/v4/wiki.md` §5-2 の約束3・段D）。
 *
 * ここは**純関数だけ**です（DB も zip も触りません）。受け取るのはファイルの道の一覧で、
 * 返すのは「どのページがどのページの子か」の組み立て図です。
 * 実際に作るのは `wiki-import.service.ts` です。
 *
 * 受けるのは2つの書き出しです:
 *
 * | 元 | 形 | ここでの扱い |
 * | --- | --- | --- |
 * | Obsidian | `フォルダ/ページ.md` | フォルダ＝親ページ。同じ名前の `.md` があればそれが親の本文 |
 * | Notion | `ページ 32桁の英数字.md` ＋ 同名フォルダ ＋ `表 32桁.csv` | 32桁の id を名前から落とす。CSV はデータベースとして取り込む |
 * | ONAiR の書き出し | `ページ.md` ＋ `ページ/` ＋ `データベース/_database.md` | `_database.md` の JSON から項目とビューを戻す |
 */

/** Notion が名前の末尾に付ける id（32桁の英数字・UUID）を落とす */
export function stripNotionId(name: string): string {
  return name
    .replace(/\s+[0-9a-f]{32}$/i, '')
    .replace(/\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
    .trim();
}

/** 道の最後の部分（`a/b/c.md` → `c.md`） */
export function baseName(p: string): string {
  const at = p.lastIndexOf('/');
  return at === -1 ? p : p.slice(at + 1);
}

/** 拡張子を落とした名前（`c.md` → `c`） */
export function fileStem(name: string): string {
  const at = name.lastIndexOf('.');
  return at <= 0 ? name : name.slice(0, at);
}

/** 画面に出す名前（Notion の id と拡張子を落とす） */
export function displayName(p: string): string {
  return stripNotionId(fileStem(baseName(p)));
}

/** 取り込むページ1枚。`children` は子ページ */
export interface ImportNode {
  /** 題（Notion の id を落とした形） */
  name: string;
  /** そのページの本文になる `.md`（無ければフォルダだけ＝本文の無い親ページ） */
  mdPath: string | null;
  /** Notion のデータベースの CSV */
  csvPath: string | null;
  /** ONAiR の書き出しの `_database.md`（項目とビューの JSON を持つ） */
  dbPath: string | null;
  children: ImportNode[];
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

/** 画像か（本文から指されているものだけを後で取り込む） */
export function isImagePath(p: string): boolean {
  return IMAGE_EXT.test(p);
}

/**
 * ファイルの道の一覧から組み立て図を作る。
 *
 * ⚠️ **根の `README.md` は飛ばします。** ONAiR の書き出しが必ず置くもので、
 * そのまま取り込むと「README」というページが毎回1枚増えます。
 */
export function buildImportPlan(paths: string[], depth = 0): ImportNode[] {
  return childrenOf('', paths.filter((p) => p !== 'README.md'), depth);
}

/** 1階層ぶんを組み立てる（`dir` は `''` か `a/` の形） */
function childrenOf(dir: string, paths: string[], depth: number): ImportNode[] {
  if (depth > 20) return []; // 取り違えで無限に回らないよう、道の深さで止める
  const here = paths.filter((p) => p.startsWith(dir));
  const direct = here.filter((p) => !p.slice(dir.length).includes('/'));
  const subDirs = new Set<string>();
  for (const p of here) {
    const rest = p.slice(dir.length);
    const at = rest.indexOf('/');
    if (at > 0) subDirs.add(rest.slice(0, at));
  }

  const used = new Set<string>();
  const nodes: ImportNode[] = [];

  for (const sub of subDirs) {
    const name = stripNotionId(sub);
    /*
     * ⚠️ **フォルダと `.md` は「id を落とす前の名前」で組ませます。**
     * Notion は同じ題のページを `カメラ aaa…/` と `カメラ bbb….md` のように
     * **32桁の id で区別**します。id を落とした題（`name`）で探していたころは、
     * 2つのフォルダが**どちらも1つめの `.md` を掴み**、余った `.md` が
     * 別のページとして増えていました（2つの元から3ページ。Codex の指摘・P1）。
     * まず全体の名前で探し、見つからないときだけ題で探します（手で作った zip や
     * 書き出した zip は id を持たないので、そちらは題で当たります）。
     * 掴んだ `.md` は `used` に入るので、**同じものを2つのフォルダが使うことはありません**。
     */
    const pick = (ext: string) => (
      direct.find((p) => p.endsWith(ext) && !used.has(p) && fileStem(baseName(p)) === sub)
      ?? direct.find((p) => p.endsWith(ext) && !used.has(p) && displayName(p) === name)
      ?? null
    );
    const md = pick('.md');
    const csv = pick('.csv');
    const dbPath = here.find((p) => p === `${dir}${sub}/_database.md`) ?? null;
    if (md) used.add(md);
    if (csv) used.add(csv);
    const node: ImportNode = {
      name,
      mdPath: md,
      csvPath: csv,
      dbPath,
      // データベースのフォルダの中は「行」なので、行の .md をそのまま子にする
      children: childrenOf(`${dir}${sub}/`, paths, depth + 1),
    };
    /*
     * ⚠️ **中身の無いフォルダはページにしません。** 画像だけを入れた `files/`
     * （ONAiR の書き出しが必ず作る）がそのまま「files」という空のページになり、
     * 取り込むたびに1枚ずつ増えていました（検証で見つけて直した）。
     */
    if (!md && !csv && !dbPath && node.children.length === 0) continue;
    nodes.push(node);
  }

  for (const p of direct) {
    if (used.has(p)) continue;
    if (p.endsWith('.md')) {
      const name = baseName(p);
      if (name === '_database.md') continue; // 親のフォルダ側で見ている
      nodes.push({ name: displayName(p), mdPath: p, csvPath: null, dbPath: null, children: [] });
      continue;
    }
    if (p.endsWith('.csv')) {
      if (baseName(p) === '_index.csv') continue; // `_database.md` と行の .md が正
      nodes.push({ name: displayName(p), mdPath: null, csvPath: p, dbPath: null, children: [] });
    }
  }
  return nodes;
}

/**
 * CSV を行の配列にする（引用符・改行・二重引用符に対応）。
 * **先頭の BOM は落とします**（Excel が付ける・落とさないと1列目の名前がずれる）。
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; continue; }
        quoted = false;
        continue;
      }
      cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

export interface CsvDatabase {
  items: Array<{ id: string; name: string; type: 'text' }>;
  rows: Array<{ title: string; props: Record<string, string> }>;
}

/**
 * Notion の CSV をデータベースにする。**1列目が題**（Notion の `Name`）で、
 * 残りが項目です。
 *
 * ⚠️ **項目の型はすべて「テキスト」にします。** CSV には型が書かれていないので、
 * 日付や数値に見えるものを当てに行くと、1件でも外れた行の値が**黙って消えます**
 * （型の合わない値は保存されない・§5-3-6）。型は取り込んだあとに画面で直せます。
 */
export function csvToDatabase(rows: string[][]): CsvDatabase {
  if (rows.length === 0) return { items: [], rows: [] };
  const head = rows[0];
  const items = head.slice(1).map((name, i) => ({
    id: `it_${i + 1}`,
    name: String(name ?? '').trim() || `項目${i + 1}`,
    type: 'text' as const,
  }));
  const out = rows.slice(1).map((line) => {
    const props: Record<string, string> = {};
    items.forEach((item, i) => {
      const v = String(line[i + 1] ?? '').trim();
      if (v) props[item.id] = v;
    });
    return { title: String(line[0] ?? '').trim(), props };
  });
  return { items, rows: out };
}
