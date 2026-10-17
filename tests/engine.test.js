import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALPHABET, MAX_ATTEMPTS, Round, evaluateGuess, explainCell, keyboardKnowledge, normalizeWord } from '../game/js/engine.js';
import { validateContent } from '../game/js/content.js';
const raw = JSON.parse(await readFile(new URL('../game/data/words.json', import.meta.url)));
const content = validateContent(raw);
const E = 'exact', P = 'present', A = 'absent';
function roundFor(word, guesses = []) { return new Round({ word }, new Set([word, ...guesses])); }
function enter(round, word) { Array.from(word).forEach((letter) => assert.equal(round.insert(letter), true)); }

test('алфавит полный, регистр нормализуется, Ё остаётся отдельной буквой', () => {
  assert.equal(ALPHABET.length, 33);
  assert.equal(new Set(ALPHABET).size, 33);
  assert.equal(normalizeWord('  берёза  '), 'БЕРЁЗА');
  assert.notEqual(normalizeWord('берёза'), normalizeWord('береза'));
});
test('повторные буквы расходуются только в пределах количества в ответе', () => {
  assert.deepEqual(evaluateGuess('ЛАМПА', 'ПАПКА'), [P, E, A, A, E]);
  assert.deepEqual(evaluateGuess('КОШКА', 'КАШКА'), [E, A, E, E, E]);
  assert.deepEqual(evaluateGuess('АНАНАС', 'БАНАНА'), [A, P, P, P, P, P]);
  assert.deepEqual(evaluateGuess('БЕРЁЗА', 'БЕРЕЗА'), [E, E, E, A, E, E]);
  assert.throws(() => evaluateGuess('ЛИСА', 'ЛАМПА'));
});
test('все пары контента сохраняют точные позиции и количество каждой буквы', () => {
  let pairs = 0;
  for (const { word: answer } of content.words) {
    for (const guess of content.accepted) {
      if (guess.length !== answer.length) continue;
      pairs += 1;
      const states = evaluateGuess(answer, guess);
      for (let i = 0; i < answer.length; i += 1) assert.equal(states[i] === E, answer[i] === guess[i]);
      for (const letter of new Set(guess)) {
        const expected = Math.min([...answer].filter((x) => x === letter).length, [...guess].filter((x) => x === letter).length);
        const observed = [...guess].filter((x, i) => x === letter && states[i] !== A).length;
        assert.equal(observed, expected, `${answer}/${guess}/${letter}`);
      }
    }
  }
  assert.ok(pairs > 10000);
});
test('неполное, неизвестное и повторное слово не тратят попытку', () => {
  const round = roundFor('ЛИСА', ['ЛУНА']);
  enter(round, 'ЛИ'); assert.equal(round.submit().reason, 'incomplete'); assert.equal(round.history.length, 0);
  enter(round, 'СС'); assert.equal(round.submit().reason, 'unknown'); assert.equal(round.history.length, 0);
  for (let i = 0; i < 4; i += 1) round.erase();
  enter(round, 'ЛУНА'); assert.equal(round.submit().ok, true);
  enter(round, 'ЛУНА'); assert.equal(round.submit().reason, 'repeated'); assert.equal(round.history.length, 1);
});
test('ввод можно исправить выбором позиции и удалением, латиница не принимается', () => {
  const round = roundFor('ЛИСА');
  assert.equal(round.insert('A'), false);
  enter(round, 'ЛИСС'); assert.equal(round.insert('А'), false);
  round.select(3); assert.equal(round.insert('А'), true); assert.equal(round.input.join(''), 'ЛИСА');
  assert.equal(round.erase(), true); assert.equal(round.input.join(''), 'ЛИС');
  round.insert('А'); assert.equal(round.submit().status, 'won');
  assert.equal(round.insert('Б'), false); assert.equal(round.erase(), false);
});
test('в шестой попытке ещё можно выиграть, седьмой попытки нет', () => {
  const guesses = ['ЛУНА', 'РЕКА', 'СОВА', 'МЫЛО', 'НОГА'];
  const round = roundFor('ЛИСА', guesses);
  for (const word of [...guesses, 'ЛИСА']) { enter(round, word); assert.equal(round.submit().ok, true); }
  assert.equal(round.history.length, MAX_ATTEMPTS); assert.equal(round.status, 'won');
  assert.equal(round.submit().reason, 'finished');
});
test('шесть неудачных догадок ведут к помощи, открытие не становится победой', () => {
  const guesses = ['ЛУНА', 'РЕКА', 'СОВА', 'МЫЛО', 'НОГА', 'РУКА'];
  const round = roundFor('ЛИСА', guesses);
  for (const word of guesses) { enter(round, word); round.submit(); }
  assert.equal(round.status, 'exhausted');
  assert.equal(round.letterHint(), null); assert.equal(round.insert('А'), false);
  assert.equal(round.reveal(), true); assert.equal(round.status, 'revealed');
  assert.equal(round.reveal(), false); assert.equal(round.submit().reason, 'finished');
});
test('одна подсказка открывает неизвестную позицию и не меняет историю', () => {
  const round = roundFor('ЛАМПА', ['ПАПКА']);
  enter(round, 'ПАПКА'); round.submit();
  const history = JSON.stringify(round.history);
  const hint = round.letterHint(() => 0);
  assert.deepEqual(hint, { position: 0, letter: 'Л' });
  assert.equal(round.history.length, 1); assert.equal(JSON.stringify(round.history), history);
  assert.equal(round.input[0], 'Л'); assert.equal(round.letterHint(() => 0.9), null);
  round.select(0); round.insert('М'); assert.equal(round.input[0], 'Л');
  for (let i = 0; i < 8; i += 1) round.erase(); assert.equal(round.input[0], 'Л');
  enter(round, 'АМПА'); assert.equal(round.submit().status, 'won');
  assert.equal(round.hints.has('letter'), true);
});
test('подсказка не выбирает уже зелёные буквы', () => {
  for (const draw of [0, 0.2, 0.99, 1, -1]) {
    const round = roundFor('ЛАМПА', ['ПАПКА']); enter(round, 'ПАПКА'); round.submit();
    assert.ok([0, 2, 3].includes(round.letterHint(() => draw).position));
  }
});
test('клавиатура сохраняет наиболее полезную информацию при лишнем повторе', () => {
  const history = [{ word: 'ПАПКА', states: evaluateGuess('ЛАМПА', 'ПАПКА') }];
  const knowledge = keyboardKnowledge(history);
  assert.equal(knowledge.П, P); assert.equal(knowledge.А, E); assert.equal(knowledge.К, A);
  assert.equal(keyboardKnowledge(history, { 0: 'Л' }).Л, E);
});
test('объяснение различает отсутствующую и лишнюю букву', () => {
  const states = evaluateGuess('ЛАМПА', 'ПАПКА');
  assert.match(explainCell('ЛАМПА', 'ПАПКА', states, 2), /лишняя/);
  assert.match(explainCell('ЛАМПА', 'ПАПКА', states, 2), /одна такая буква/);
  assert.match(explainCell('ЛАМПА', 'ПАПКА', states, 3), /нет в загаданном слове/);
  assert.match(explainCell('ЛАМПА', 'ПАПКА', states, 0), /другом месте/);
});
