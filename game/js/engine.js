// Чистые правила раунда. Платформа и интерфейс не влияют на результат проверки.
export const ALPHABET = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
export const VISIBLE_ROWS = 3;
// Устойчивый непрозрачный идентификатор карточки, не шифрование ответа.
export function challengeCode(id) {
  let hash = 2166136261;
  for (const char of `bukva:challenge:v1:${id}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return `BB1-${(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
}
export function normalizeChallenge(value) {
  if (typeof value !== 'string' || value.length > 128) return null;
  const match = value.trim().match(/^(?:bukvazabukvoy:\/\/challenge\/)?(BB1-[A-F0-9]{8})\/?$/i);
  return match ? match[1].toUpperCase() : null;
}
export function findChallenge(words, value) {
  const code = normalizeChallenge(value);
  return code ? words.find((entry) => challengeCode(entry.id) === code) || null : null;
}
export function formatGuesses(count) {
  const last = count % 10, hundred = count % 100;
  const ending = last === 1 && hundred !== 11 ? 'догадку' : last >= 2 && last <= 4 && (hundred < 12 || hundred > 14) ? 'догадки' : 'догадок';
  return `за ${count} ${ending}`;
}
export const STATUS = Object.freeze({ EXACT: 'exact', PRESENT: 'present', ABSENT: 'absent' });
const priority = { absent: 1, present: 2, exact: 3 };

export function normalizeWord(value) {
  return String(value || '').trim().normalize('NFC').toLocaleUpperCase('ru-RU');
}
export function isRussianWord(word) { return /^[А-ЯЁ]{4,7}$/.test(word); }

export function evaluateGuess(answer, guess) {
  if (answer.length !== guess.length) throw new Error('Длины слов должны совпадать');
  const states = Array(answer.length).fill(STATUS.ABSENT);
  const remaining = new Map();
  for (let i = 0; i < answer.length; i += 1) {
    if (answer[i] === guess[i]) states[i] = STATUS.EXACT;
    else remaining.set(answer[i], (remaining.get(answer[i]) || 0) + 1);
  }
  for (let i = 0; i < guess.length; i += 1) {
    if (states[i] === STATUS.EXACT) continue;
    const count = remaining.get(guess[i]) || 0;
    if (count > 0) {
      states[i] = STATUS.PRESENT;
      remaining.set(guess[i], count - 1);
    }
  }
  return states;
}

export function keyboardKnowledge(history, revealed = {}) {
  const knowledge = {};
  history.forEach(({ word, states }) => {
    Array.from(word).forEach((letter, i) => {
      if (!knowledge[letter] || priority[states[i]] > priority[knowledge[letter]]) knowledge[letter] = states[i];
    });
  });
  Object.values(revealed).forEach((letter) => { knowledge[letter] = STATUS.EXACT; });
  return knowledge;
}

export class Round {
  constructor(entry, accepted) {
    if (!entry || !isRussianWord(entry.word)) throw new Error('Неверное слово раунда');
    this.entry = entry;
    this.answer = entry.word;
    this.length = entry.word.length;
    this.accepted = accepted;
    this.history = [];
    this.revealed = {};
    this.input = Array(this.length).fill('');
    this.cursor = 0;
    this.status = 'playing';
    this.hints = new Set();
    this.letterHintUsed = false;
  }
  select(index) {
    if (this.status === 'playing' && index >= 0 && index < this.length && !this.revealed[index]) this.cursor = index;
  }
  insert(letter) {
    if (this.status !== 'playing' || letter.length !== 1 || !ALPHABET.includes(letter)) return false;
    let index = this.cursor;
    if (index === null || this.revealed[index]) index = this.input.findIndex((value, i) => !value && !this.revealed[i]);
    if (index < 0 || index === null) return false;
    this.input[index] = letter;
    let next = this.input.findIndex((value, i) => i > index && !value && !this.revealed[i]);
    if (next < 0) next = this.input.findIndex((value, i) => !value && !this.revealed[i]);
    this.cursor = next < 0 ? null : next;
    return true;
  }
  erase() {
    if (this.status !== 'playing') return false;
    let index = this.cursor;
    if (index === null) index = this.length - 1;
    else if (!this.input[index]) index -= 1;
    while (index >= 0 && (this.revealed[index] || !this.input[index])) index -= 1;
    if (index < 0) return false;
    this.input[index] = '';
    this.cursor = index;
    return true;
  }
  submit() {
    if (this.status !== 'playing') return { ok: false, reason: 'finished' };
    if (this.input.some((letter) => !letter)) return { ok: false, reason: 'incomplete' };
    const word = this.input.join('');
    if (!this.accepted.has(word)) return { ok: false, reason: 'unknown' };
    if (this.history.some((item) => item.word === word)) return { ok: false, reason: 'repeated' };
    const states = evaluateGuess(this.answer, word);
    this.history.push({ word, states });
    if (word === this.answer) this.status = 'won';
    this.input = Array.from({ length: this.length }, (_, i) => this.revealed[i] || '');
    this.cursor = this.input.findIndex((value) => !value);
    if (this.cursor < 0) this.cursor = null;
    return { ok: true, word, states, status: this.status };
  }
  letterHint(random = Math.random) {
    if (this.status !== 'playing' || this.letterHintUsed) return null;
    const confirmed = new Set(Object.keys(this.revealed).map(Number));
    this.history.forEach(({ states }) => states.forEach((status, i) => { if (status === STATUS.EXACT) confirmed.add(i); }));
    const candidates = Array.from({ length: this.length }, (_, i) => i).filter((i) => !confirmed.has(i));
    if (!candidates.length) return null;
    const draw = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
    const position = candidates[Math.floor(draw * candidates.length)];
    this.revealed[position] = this.answer[position];
    this.input[position] = this.answer[position];
    this.letterHintUsed = true;
    this.hints.add('letter');
    this.cursor = this.input.findIndex((letter, i) => !letter && !this.revealed[i]);
    if (this.cursor < 0) this.cursor = null;
    return { position, letter: this.answer[position] };
  }
  useHint(kind) { this.hints.add(kind); }
  reveal() {
    if (this.status === 'won' || this.status === 'revealed') return false;
    this.status = 'revealed';
    return true;
  }
}

export function explainCell(answer, word, states, index) {
  const letter = word[index];
  if (states[index] === STATUS.EXACT) return `Буква ${letter} стоит на своём месте. Оставь её здесь в следующей догадке.`;
  if (states[index] === STATUS.PRESENT) return `Буква ${letter} есть в слове, но в другом месте. Попробуй её переставить.`;
  const total = Array.from(answer).filter((item) => item === letter).length;
  if (total === 0) return `Буквы ${letter} нет в загаданном слове. Попробуй другие буквы.`;
  const count = total === 1 ? 'одна такая буква' : total === 2 ? 'две такие буквы' : `${total} такие буквы`;
  return `Эта ${letter} лишняя. В ответе ${count}. ${total === 1 ? 'Она уже отмечена цветом' : 'Они уже отмечены цветом'}.`;
}
