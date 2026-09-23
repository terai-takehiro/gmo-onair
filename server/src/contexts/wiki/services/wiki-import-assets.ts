/**
 * Wiki — 取り込み（zip）の画像の差し替え（`docs/design/v4/wiki.md` §5-5・段D）。
 *
 * Obsidian と Notion の本文は、画像を**zip の中の相対の道**で指しています
 * （`![図](画像/a.png)`・Obsidian の `![[a.png]]`）。そのまま取り込むと
 * **本文だけが入って画像が全部壊れます**（しかも本文は合っているので気づかれない）。
 * ここで道を ONAiR の画像の URL に差し替えます。
 *
 * ⚠️ **`http://` `https://` と `/` で始まる道は、原則として触りません。** 外のサイトの画像は
 * そのままが正しい形です。
 *
 * ⚠️ **例外は ONAiR の画像の URL（`…/wiki/files/:id`）で、zip の中に同じ id の
 * `files/<id>.<拡張子>` があるときです。** ONAiR の書き出し（`wiki-export.service.ts`）は本文を
 * 書き換えず、画像の中身を `files/` に同梱します。ここで同梱の画像に当てないと、
 * 別の環境に戻したときは画像が全部壊れ、同じ環境でも**元のページの画像（元の閲覧範囲）**を
 * 指したままになります（#730 の Codex 指摘・P1）。同梱が無ければ今までどおりそのまま残します。
 *
 * ここは**純関数だけ**です（zip も DB も触りません）。
 */

/** `![説明](道)` と `![[道]]`（Obsidian）の両方 */
const MD_IMAGE = /!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;
const WIKI_IMAGE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
/** ONAiR の画像の URL（`/api/v1/internal/wiki/files/:id`。前置きは変わりうるので末尾で拾う） */
const ONAIR_FILE_URL = /^\/(?:[^\s?#]*\/)?wiki\/files\/([A-Za-z0-9_-]+)(?:[?#].*)?$/;

/** ONAiR の画像の URL なら、同梱の `<id>.<拡張子>` を名前で探す（無ければ null） */
function resolveOnairFile(target: string, byBase?: Map<string, string>): string | null {
  const m = ONAIR_FILE_URL.exec(target.trim());
  if (!m || !byBase) return null;
  const prefix = `${m[1]}.`;
  for (const [base, p] of byBase) {
    if (base.startsWith(prefix) && !base.slice(prefix.length).includes('.')) return p;
  }
  return null;
}

/** zip の中の道に直す。外の URL と絶対の道は `''`（触らない印） */
export function normalizeAssetPath(dir: string, target: string): string {
  let t = target.trim();
  if (!t) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('/') || t.startsWith('#')) return '';
  try {
    t = decodeURIComponent(t);
  } catch {
    // 壊れた %エンコードはそのままの文字で照合する
  }
  const parts = `${dir}${t}`.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return out.join('/');
}

/**
 * 本文が指している画像の道（zip の中）。
 * `dir` はその `.md` が入っているフォルダ（`''` か `a/b/` の形）。
 */
export function collectAssetRefs(
  body: string,
  dir: string,
  has: (p: string) => boolean,
  byBase: Map<string, string>,
): string[] {
  const out = new Set<string>();
  const add = (target: string) => {
    const p = resolveAssetPath(dir, target, has, byBase);
    if (p) out.add(p);
  };
  for (const m of body.matchAll(MD_IMAGE)) add(m[2]);
  for (const m of body.matchAll(WIKI_IMAGE)) add(m[1]);
  return [...out];
}

/**
 * 道を zip の中の実物に当てる。**見つからなければ名前だけで探します** —
 * Obsidian の `![[a.png]]` はフォルダを書かないためです。
 */
export function resolveAssetPath(
  dir: string,
  target: string,
  has: (p: string) => boolean,
  byBase?: Map<string, string>,
): string | null {
  const bundled = resolveOnairFile(target, byBase);
  if (bundled) return bundled;
  const direct = normalizeAssetPath(dir, target);
  if (direct && has(direct)) return direct;
  const fromRoot = normalizeAssetPath('', target);
  if (fromRoot && has(fromRoot)) return fromRoot;
  if (byBase) {
    let name = target.trim();
    try {
      name = decodeURIComponent(name);
    } catch {
      // そのままの文字で照合する
    }
    const base = name.slice(name.lastIndexOf('/') + 1);
    return byBase.get(base) ?? null;
  }
  return null;
}

/**
 * 本文の画像の道を ONAiR の URL に差し替える。
 * `urlOf` が `null` を返した道（取り込めなかった画像）は**そのまま残します** —
 * 消すと「写真があったはず」が本文から消えて、後から探せなくなります。
 */
export function rewriteAssetLinks(
  body: string,
  dir: string,
  has: (p: string) => boolean,
  byBase: Map<string, string>,
  urlOf: (zipPath: string) => string | null,
): string {
  const replaced = body.replace(MD_IMAGE, (whole, alt: string, target: string) => {
    const p = resolveAssetPath(dir, target, has, byBase);
    const url = p ? urlOf(p) : null;
    return url ? `![${alt}](${url})` : whole;
  });
  return replaced.replace(WIKI_IMAGE, (whole, target: string) => {
    const p = resolveAssetPath(dir, target, has, byBase);
    const url = p ? urlOf(p) : null;
    const base = String(target).slice(String(target).lastIndexOf('/') + 1);
    return url ? `![${base}](${url})` : whole;
  });
}
