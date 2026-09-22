/**
 * Wiki — 取り込み（zip）の画像の差し替え（`docs/design/v4/wiki.md` §5-5・段D）。
 *
 * Obsidian と Notion の本文は、画像を**zip の中の相対の道**で指しています
 * （`![図](画像/a.png)`・Obsidian の `![[a.png]]`）。そのまま取り込むと
 * **本文だけが入って画像が全部壊れます**（しかも本文は合っているので気づかれない）。
 * ここで道を ONAiR の画像の URL に差し替えます。
 *
 * ⚠️ **`http://` `https://` と `/` で始まる道は触りません。** 外のサイトの画像と、
 * ONAiR が既に配っている画像（`/api/v1/internal/wiki/files/:id`）はそのままが正しい形です。
 *
 * ここは**純関数だけ**です（zip も DB も触りません）。
 */

/** `![説明](道)` と `![[道]]`（Obsidian）の両方 */
const MD_IMAGE = /!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;
const WIKI_IMAGE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

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
