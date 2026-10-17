import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateContent, FALLBACK_CONTENT } from '../game/js/content.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const game = resolve(root, 'game');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    assert(!entry.isSymbolicLink(), `Символическая ссылка запрещена: ${entry.name}`);
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }))).flat();
}
const files = await walk(game);
assert(files.includes(resolve(game, 'index.html')), 'Отсутствует точка входа game/index.html');
let bytes = 0;
const references = [];
for (const path of files) {
  bytes += (await stat(path)).size;
  assert(['.html', '.css', '.js', '.json', '.svg'].includes(extname(path)), `Неожиданный ресурс ${path}`);
  const source = await readFile(path, 'utf8');
  assert(!/\p{Extended_Pictographic}/u.test(source), `Эмодзи в ${path}`);
  if (path.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert(!/\b(?:localStorage|sessionStorage|indexedDB|XMLHttpRequest|WebSocket|EventSource)\b/.test(source), `Запрещённое хранилище или сеть: ${path}`);
    assert(!/\b(?:eval|importScripts)\s*\(|\bnew\s+Function\s*\(/.test(source), `Динамический код: ${path}`);
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]|new URL\(['"]([^'"]+)['"]/g)) references.push([path, match[1] || match[2]]);
    assert(!/https?:\/\//.test(source), `Внешний URL в коде: ${path}`);
  }
  if (path.endsWith('.html')) {
    assert(/lang="ru"/.test(source), 'Не указан русский язык');
    assert(/Content-Security-Policy/.test(source), 'Нет CSP');
    if (path === resolve(game, 'index.html')) assert(/<script\s+type="module"\s+src="\.\/js\/app\.js"\s*>/.test(source), 'Не подключён игровой модуль');
    assert(!/<(?:iframe|object|embed)\b|\btarget\s*=/i.test(source), 'Вложенное окно или новая вкладка');
    for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) references.push([path, match[1]]);
    assert(!/<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(source), 'Встроенный скрипт');
  }
  if (path.endsWith('.css')) for (const match of source.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) references.push([path, match[1]]);
  if (path.endsWith('.svg')) assert(!/<script|<foreignObject|(?:href|src)=["'](?:https?:|\/\/)/i.test(source), `Активный SVG: ${path}`);
}
for (const [from, reference] of references) {
  if (reference.startsWith('#')) continue;
  assert(reference.startsWith('./') || reference.startsWith('../'), `Путь не относительный: ${reference}`);
  const path = resolve(dirname(from), reference);
  assert(!relative(game, path).startsWith('..'), `Выход из game: ${reference}`);
  assert((await stat(path)).isFile(), `Ресурс не найден: ${reference}`);
}
assert(bytes < 5 * 1024 * 1024, `Размер игры ${bytes} превышает 5 МБ`);
const source = JSON.parse(await readFile(resolve(game, 'data/words.json'), 'utf8'));
const content = validateContent(source);
assert(content, 'Основной словарь не прошёл проверку');
assert(validateContent(FALLBACK_CONTENT), 'Запасной словарь не прошёл проверку');
const counts = Object.fromEntries([4, 5, 6, 7].map((length) => [length, content.words.filter((word) => word.word.length === length).length]));
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert(!Object.keys(manifest.dependencies || {}).length && !Object.keys(manifest.devDependencies || {}).length, 'Внешние зависимости');
console.log(JSON.stringify({ status: 'Проверено', files: files.length, bytes, answers: content.words.length, accepted: content.accepted.size, lengths: counts, references: references.length }, null, 2));
