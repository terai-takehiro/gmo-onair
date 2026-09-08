import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
let transpile;
try {
  const ts = require('typescript');
  transpile = (source) => ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
} catch {
  // Node 24 の検証環境では、依存取得不可でも純粋なサービス層を実行できる。
  const { stripTypeScriptTypes } = await import('node:module');
  if (!stripTypeScriptTypes) throw new Error('Install dependencies (TypeScript) before running tests');
  transpile = (source) => stripTypeScriptTypes(source, { mode: 'transform' });
}

let sequence = 0;
const registry = globalThis.__onairReviewMocks ??= new Map();
export async function loadTs(path, dependencies = {}) {
  const key = ++sequence;
  registry.set(key, dependencies);
  let source = transpile(await readFile(new URL('../../../' + path, import.meta.url), 'utf8'));
  for (const [specifier, exports] of Object.entries(dependencies)) {
    const code = Object.keys(exports).map((name) =>
      `const ${name === 'default' ? 'value' : name} = globalThis.__onairReviewMocks.get(${key})[${JSON.stringify(specifier)}][${JSON.stringify(name)}]; export { ${name === 'default' ? 'value as default' : name} };`,
    ).join('\n');
    const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
    source = source.replaceAll(`'${specifier}'`, JSON.stringify(url)).replaceAll(`"${specifier}"`, JSON.stringify(url));
  }
  return import('data:text/javascript;base64,' + Buffer.from(source + `\n// ${key}\n//# sourceURL=${path}`).toString('base64'));
}

export class AppError extends Error {
  constructor(statusCode, code, message) { super(message); this.statusCode = statusCode; this.code = code; }
}

export function fakeSocket(user = null) {
  const handlers = new Map();
  return {
    id: Math.random().toString(), connected: true, data: {}, user,
    handshake: { query: { docId: 'doc', projectId: 'project' }, auth: {}, headers: {} },
    rooms: new Set(), emissions: [], handlers,
    on(event, handler) { handlers.set(event, handler); },
    join(room) { this.rooms.add(room); },
    emit(event, payload) { this.emissions.push({ event, payload }); },
    to(room) { return { emit: (event, payload) => this.emissions.push({ room, event, payload }) }; },
    disconnect() { this.connected = false; handlers.get('disconnect')?.(); },
    async receive(event, payload) { return handlers.get(event)?.(payload); },
  };
}

export function fakeIO() {
  const namespaces = new Map();
  return {
    namespaces,
    of(name) {
      if (!namespaces.has(name)) namespaces.set(name, {
        on(event, handler) { this[event] = handler; },
        to() { return { emit() {} }; },
      });
      return namespaces.get(name);
    },
  };
}
