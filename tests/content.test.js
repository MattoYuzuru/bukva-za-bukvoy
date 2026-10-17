import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FALLBACK_CONTENT, loadContent, validateContent } from '../game/js/content.js';

const source = JSON.parse(await readFile(new URL('../game/data/words.json', import.meta.url), 'utf8'));
const copy = (value) => JSON.parse(JSON.stringify(value));

test('в основном наборе достаточно ответов каждой длины и более широкий список догадок', () => {
  const content = validateContent(source);
  assert.equal(content.version, '1.0.0');
  assert.ok(content.words.length >= 64);
  for (const length of [4, 5, 6, 7]) {
    assert.ok(content.words.filter((entry) => entry.word.length === length).length >= 16);
  }
  assert.ok(content.accepted.size >= 250);
  assert.equal(source.accepted.length, content.accepted.size, 'в авторском списке нет случайных дублей');
  assert.ok(content.accepted.has('ЁЛКА'));
  assert.ok(!content.accepted.has('ЕЛКА'), 'замена Ё на Е не должна создавать другое допустимое слово');
  assert.ok(content.accepted.has('СТОЛ'), 'можно проверять догадки, которые не загадываются');
  assert.ok(content.accepted.has('ЛАМПА'), 'обычная детская догадка не должна случайно выпадать из списка');
  for (const word of ['МАМА', 'ПАПА', 'НОГА', 'РУКА', 'ОКНО', 'ПЕНАЛ', 'ЛИЦО']) assert.ok(content.accepted.has(word), word);
  assert.ok(!content.words.some((entry) => entry.word === 'СТОЛ'));
});

test('редакционные определения не выдают ответ, карточки короткие и полные', () => {
  for (const entry of source.words) {
    assert.ok(!entry.meaning.toLocaleUpperCase('ru-RU').includes(entry.word), entry.word);
    assert.ok(entry.riddle.length <= 200, entry.word);
    assert.ok(entry.meaning.length <= 240, entry.word);
    assert.ok(entry.fact.length <= 240, entry.word);
    for (const field of ['theme', 'riddle', 'meaning', 'fact']) {
      assert.ok(entry[field].trim().length > 0, `${entry.word}: ${field}`);
      assert.ok(!/[<>]/.test(entry[field]), `${entry.word}: в данных не нужна разметка`);
    }
  }
});

test('нормализация регистра и пробелов сохраняет Ё и не меняет входные данные', () => {
  const input = copy(FALLBACK_CONTENT);
  const entry = input.words.find((word) => word.word === 'БЕРЁЗА');
  entry.word = '  берёза  ';
  entry.riddle = ` ${entry.riddle} `;
  input.accepted = input.accepted.map((word) => ` ${word.toLocaleLowerCase('ru-RU')} `);
  input.accepted.push('БЕРЁЗА');
  const before = JSON.stringify(input);
  const content = validateContent(input);
  assert.equal(content.words.find((word) => word.id === entry.id).word, 'БЕРЁЗА');
  assert.equal(content.accepted.size, FALLBACK_CONTENT.accepted.length);
  assert.ok(content.accepted.has('БЕРЁЗА'));
  assert.ok(!content.accepted.has('БЕРЕЗА'));
  assert.equal(JSON.stringify(input), before);
});

test('запасной набор содержит минимум два ответа каждой длины', () => {
  const content = validateContent(FALLBACK_CONTENT);
  for (const length of [4, 5, 6, 7]) {
    assert.ok(content.words.filter((entry) => entry.word.length === length).length >= 2);
  }
  assert.ok(content.words.every((entry) => content.accepted.has(entry.word)));
});

test('повреждённая схема не попадает в игровой движок', async (t) => {
  const cases = [
    ['вместо объекта', () => null],
    ['вместо объекта массив', () => []],
    ['нет версии', (raw) => { delete raw.version; return raw; }],
    ['пустая версия', (raw) => { raw.version = ' '; return raw; }],
    ['нет ответов', (raw) => { raw.words = []; return raw; }],
    ['карточка не объект', (raw) => { raw.words[0] = null; return raw; }],
    ['нет допустимых догадок', (raw) => { raw.accepted = []; return raw; }],
    ['догадки не массив', (raw) => { raw.accepted = {}; return raw; }],
    ['догадка не строка', (raw) => { raw.accepted.push(42); return raw; }],
    ['не хватает длины', (raw) => { raw.words = raw.words.filter((entry) => entry.word.length !== 7); return raw; }],
    ['одинаковые идентификаторы', (raw) => { raw.words[1].id = ` ${raw.words[0].id} `; return raw; }],
    ['одинаковые ответы', (raw) => { raw.words[1].word = raw.words[0].word.toLocaleLowerCase('ru-RU'); return raw; }],
    ['ответ не разрешён', (raw) => { raw.accepted = raw.accepted.filter((word) => word !== raw.words[0].word); return raw; }],
    ['латинская буква', (raw) => { raw.words[0].word = 'AИСТ'; return raw; }],
    ['слишком короткое слово', (raw) => { raw.accepted.push('ЛЕС'); return raw; }],
    ['слишком длинное слово', (raw) => { raw.accepted.push('ПОДОКОННИК'); return raw; }],
    ['дефис', (raw) => { raw.accepted.push('ЖАР-ПТИЦА'); return raw; }],
    ['нестроковый ответ', (raw) => { raw.words[0].word = 1234; return raw; }],
    ['пустой идентификатор', (raw) => { raw.words[0].id = ''; return raw; }],
    ['пустая тема', (raw) => { raw.words[0].theme = ' '; return raw; }],
    ['пустая загадка', (raw) => { raw.words[0].riddle = ' '; return raw; }],
    ['слишком длинная загадка', (raw) => { raw.words[0].riddle = 'а'.repeat(201); return raw; }],
    ['пустое определение', (raw) => { raw.words[0].meaning = ''; return raw; }],
    ['слишком длинное определение', (raw) => { raw.words[0].meaning = 'а'.repeat(241); return raw; }],
    ['нет заключительной подсказки', (raw) => { delete raw.words[0].fact; return raw; }],
    ['нестроковая пословица', (raw) => { raw.words[0].proverb = 12; return raw; }],
  ];
  for (const [name, change] of cases) {
    await t.test(name, () => {
      assert.throws(() => validateContent(change(copy(FALLBACK_CONTENT))), /Словарь:/);
    });
  }
});

test('загрузка читает только собственный относительный словарь', async (t) => {
  let requested;
  let signal;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requested = url;
    signal = options.signal;
    return { ok: true, json: async () => source };
  });
  const content = await loadContent();
  assert.equal(requested.href, new URL('../game/data/words.json', import.meta.url).href);
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
  assert.equal(content.fallback, false);
  assert.equal(content.words.length, source.words.length);
  assert.ok(content.accepted instanceof Set);
});

test('ошибка сети, HTTP, JSON или схемы оставляет все длины играбельными', async (t) => {
  const responses = [
    ['сеть', async () => { throw new Error('Нет связи'); }],
    ['HTTP', async () => ({ ok: false })],
    ['JSON', async () => ({ ok: true, json: async () => { throw new SyntaxError('Не JSON'); } })],
    ['схема', async () => ({ ok: true, json: async () => ({ version: '1.0.0' }) })],
  ];
  for (const [name, response] of responses) {
    await t.test(name, async (child) => {
      child.mock.method(globalThis, 'fetch', response);
      const content = await loadContent();
      assert.equal(content.fallback, true);
      assert.ok(content.accepted instanceof Set);
      assert.deepEqual([...new Set(content.words.map((entry) => entry.word.length))].sort(), [4, 5, 6, 7]);
    });
  }
});

test('через 1900 мс зависшая загрузка отменяется и открывается запасной набор', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  t.mock.method(globalThis, 'fetch', (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const pending = loadContent();
  t.mock.timers.tick(1900);
  const content = await pending;
  assert.equal(signal.aborted, true);
  assert.equal(content.fallback, true);
});

test('срок ограничивает и чтение тела JSON после успешного ответа сервера', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reading = false;
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: () => {
      reading = true;
      return new Promise(() => {});
    },
  }));
  const pending = loadContent();
  await Promise.resolve();
  assert.equal(reading, true);
  t.mock.timers.tick(1900);
  assert.equal((await pending).fallback, true);
});

test('изменение выданного запасного результата не портит последующие раунды', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Нет связи'); });
  const first = await loadContent();
  first.words[0].word = 'ТЕСТ';
  first.accepted.clear();
  const second = await loadContent();
  assert.equal(second.words[0].word, FALLBACK_CONTENT.words[0].word);
  assert.equal(second.accepted.size, FALLBACK_CONTENT.accepted.length);
});
