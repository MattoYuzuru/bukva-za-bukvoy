import { ALPHABET, VISIBLE_ROWS, Round, keyboardKnowledge, normalizeWord, explainCell, challengeCode, normalizeChallenge, findChallenge, formatGuesses } from './engine.js';
import { loadContent } from './content.js';
import { icon } from './icons.js';
import { createBridge } from './bridge.js';

const byId = (id) => document.getElementById(id);
const bridge = createBridge();
const screens = ['home', 'round', 'result'];
const keyboardRows = ['ЙЦУКЕНГШЩЗХЪ', 'ФЫВАПРОЛДЖЭ', 'ЯЧСМИТЬБЮЁ'];
const names = { exact: 'на своём месте', present: 'есть в другом месте', absent: 'буквы нет' };
const markNames = { exact: 'check', present: 'move', absent: 'absent' };
let content = null;
let round = null;
let roundId = 0;
let screen = 'home';
let chosenLength = 4;
let tutorialSeen = false;
let lastFocus = null;
let onModalClose = null;
let toastTimer = null;
let resultTimer = null;
let soundEnabled = false;
let audioContext = null;
let audioStep = 0;
let previewTimer = null;
const played = new Set();

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function setButton(id, symbol, text) {
  byId(id).innerHTML = icon(symbol) + (text ? `<span>${escapeText(text)}</span>` : '');
}
function fitHeight() {
  const viewport = window.visualViewport;
  const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
  const width = viewport && viewport.scale === 1 ? viewport.width : window.innerWidth;
  const layout = document.documentElement.classList;
  // Геометрию берём из видимой области: WebView после системной клавиатуры
  // может сохранять прежний результат геометрических media query.
  layout.toggle('viewport-large', width >= 600 && height >= 650);
  layout.toggle('viewport-compact', height <= 740);
  layout.toggle('viewport-short', height <= 620);
  layout.toggle('viewport-landscape', width > height && height <= 600);
  // Официальная песочница рисует свои кнопки поверх верхнего края WebView.
  // Проверяем только присутствие уже установленного моста, не запрашивая данные приложения.
  document.documentElement.classList.toggle('host-controls', Boolean(window.__hackathonBridgeInstalled));
  document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
}
function showScreen(name, focus = true) {
  stopPreview();
  screen = name;
  byId('app').dataset.screen = name;
  byId('reveal-button').hidden = name !== 'round';
  screens.forEach((item) => { byId(`${item}-screen`).hidden = item !== name; });
  byId('back-button').setAttribute('aria-label', name === 'home' ? 'Выйти из игры' : 'К выбору длины слова');
  byId('back-button').title = name === 'home' ? 'Выйти из игры' : 'К выбору длины слова';
  if (focus) byId(`${name === 'round' ? 'round' : name === 'result' ? 'result' : 'home'}-title`).focus({ preventScroll: true });
}
function message(text) {
  byId('round-message').textContent = text;
  byId('round-theme').hidden = Boolean(text);
}
function toast(text) {
  clearTimeout(toastTimer);
  byId('toast').textContent = text;
  byId('toast').hidden = false;
  toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 2600);
}
function tone(kind = 'tap') {
  if (!soundEnabled || !audioContext) return;
  // Тихий щипок с затухающими обертонами: разные тембры ввода и стирания.
  const frequencies = kind === 'win' ? [523.25, 659.25, 783.99, 1046.5]
    : kind === 'hint' ? [659.25, 880] : kind === 'erase' ? [293.66]
      : [523.25, 587.33, 659.25, 783.99][audioStep++ % 4];
  const start = audioContext.currentTime;
  (Array.isArray(frequencies) ? frequencies : [frequencies]).forEach((frequency, index) => {
    const time = start + index * 0.12;
    const duration = kind === 'tap' || kind === 'erase' ? 0.12 : 0.32;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = kind === 'erase' ? 900 : 2200;
    filter.Q.value = 0.5; filter.connect(audioContext.destination);
    [1, 2.76].forEach((ratio, partial) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = partial ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency * ratio, time);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * ratio * 0.985, time + duration);
      const level = (kind === 'tap' || kind === 'erase' ? 0.035 : 0.055) * (partial ? 0.16 : 1);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(level, time + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(gain); gain.connect(filter);
      oscillator.start(time); oscillator.stop(time + duration + 0.02);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); if (partial) filter.disconnect(); };
    });
  });
}
async function toggleSound() {
  if (!soundEnabled) {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { toast('Звук здесь недоступен. Можно играть без него.'); return; }
      if (!audioContext) audioContext = new Audio();
      await audioContext.resume();
      soundEnabled = true;
      tone('hint');
    } catch { toast('Можно играть без звука.'); return; }
  } else soundEnabled = false;
  setButton('sound-button', soundEnabled ? 'sound' : 'mute');
  const label = soundEnabled ? 'Выключить звук' : 'Включить звук';
  byId('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  byId('sound-button').setAttribute('aria-label', label);
  byId('sound-button').title = label;
}

function openModal(html, closeCallback = null) {
  stopPreview();
  if (!byId('modal-layer').hidden) closeModal(false);
  lastFocus = document.activeElement;
  onModalClose = closeCallback;
  byId('modal-content').innerHTML = html;
  byId('modal-layer').hidden = false;
  byId('app').setAttribute('aria-hidden', 'true');
  byId('modal').scrollTop = 0;
  byId('modal').focus({ preventScroll: true });
}
function closeModal(restore = true) {
  if (byId('modal-layer').hidden) return;
  byId('modal-layer').hidden = true;
  byId('app').removeAttribute('aria-hidden');
  const callback = onModalClose;
  onModalClose = null;
  if (restore && lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  if (callback) callback();
  if (restore) startPreview(round && round.history.length ? 12000 : 1100);
}
function showRules() {
  tutorialSeen = true;
  openModal(`<h2 id="modal-title">Угадай слово</h2><p class="rules-intro"><strong>Прочитай загадку.<br>Напиши ответ и нажми «Проверим!»</strong></p>
    <div class="tutorial-card"><span class="tutorial-tile exact">А</span><p><strong>Оставь на месте</strong></p></div>
    <div class="tutorial-card"><span class="tutorial-tile present">Б</span><p><strong>Переставь букву</strong></p></div>
    <div class="tutorial-card"><span class="tutorial-tile absent">В</span><p><strong>Попробуй другую</strong></p></div>
    <button type="button" class="button primary" id="rules-done">Играем!</button>`);
  byId('rules-done').onclick = () => closeModal();
}
function leaveRound(toHome = true) {
  if (resultTimer) { clearTimeout(resultTimer); resultTimer = null; }
  if (round && screen === 'round') bridge.finish(roundId);
  closeModal(false);
  round = null;
  if (toHome) showScreen('home');
  else { bridge.close(); showScreen('home'); }
}
function requestHome(close = false) {
  if (screen !== 'round' || !round || round.status !== 'playing') {
    leaveRound(!close);
    return;
  }
  openModal(`<div class="modal-accent">${icon('home')}</div><h2 id="modal-title">Закончим этот раунд?</h2><p>Можно вернуться к выбору слова. Этот раунд начнётся заново.</p><button type="button" class="button primary" id="stay-button">Ещё подумаю</button><button type="button" class="button secondary" id="leave-button">Закончить раунд</button>`);
  byId('stay-button').onclick = () => closeModal();
  byId('leave-button').onclick = () => leaveRound(!close);
}
function chooseEntry(length) {
  const entries = content.words.filter((entry) => entry.word.length === length);
  let pool = entries.filter((entry) => !played.has(entry.id));
  if (!pool.length) {
    entries.forEach((entry) => played.delete(entry.id));
    pool = entries;
  }
  if (!played.size) {
    const learning = pool.filter((entry) => ['Деньги', 'Безопасность', 'Дружба'].includes(entry.theme));
    if (learning.length) pool = learning;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
function startRound(invited = null) {
  if (!content) return;
  closeModal(false);
  clearTimeout(resultTimer);
  const entry = invited || chooseEntry(chosenLength);
  chosenLength = entry.word.length;
  byId('length-options').querySelector(`input[value="${chosenLength}"]`).checked = true;
  round = new Round(entry, content.accepted);
  roundId += 1;
  played.add(entry.id);
  byId('round-theme').textContent = entry.theme;
  byId('round-title').textContent = entry.riddle;
  byId('board').style.setProperty('--length', String(round.length));
  byId('board-scroll').scrollTop = 0;
  message('');
  showScreen('round');
  renderRound(true);
  if (!tutorialSeen) showRules();
  else startPreview();
}

function openChallenge(value) {
  if (!content) return false;
  const entry = findChallenge(content.words, value);
  if (!entry) {
    const text = content.fallback ? 'Не получилось загрузить слово друга. Открой игру ещё раз.' : 'Код не найден. Проверь его или обнови игру.';
    const error = byId('friend-error');
    if (error && !byId('modal-layer').hidden) error.textContent = text;
    else toast(text);
    return false;
  }
  const begin = () => {
    if (round && screen === 'round') bridge.finish(roundId);
    startRound(entry);
  };
  if (screen === 'round' && round && round.status === 'playing') {
    openModal(`<h2 id="modal-title">Сыграем слово друга?</h2><p>Текущий раунд закончится.</p><button type="button" class="button primary" id="friend-start">Слово друга</button><button type="button" class="button secondary" id="friend-stay">Останусь здесь</button>`);
    byId('friend-start').onclick = begin;
    byId('friend-stay').onclick = () => closeModal();
  } else begin();
  return true;
}
function showFriendEntry() {
  openModal(`<h2 id="modal-title">Слово друга</h2><form id="friend-form"><label class="friend-label" for="friend-code">Код или ссылка друга</label><input id="friend-code" class="friend-input" type="text" maxlength="128" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="BB1-1234ABCD"><p id="friend-error" class="friend-error" role="status"></p><button type="submit" class="button primary">Открыть слово</button></form>`);
  byId('friend-form').onsubmit = (event) => { event.preventDefault(); openChallenge(byId('friend-code').value); };
}
function readChallengeHash() {
  const value = new URLSearchParams(window.location.hash.slice(1)).get('challenge');
  if (value !== null) {
    if (normalizeChallenge(value)) openChallenge(value);
    else toast('Код не найден. Проверь приглашение друга.');
  }
}

function stopPreview() {
  clearTimeout(previewTimer); previewTimer = null;
  byId('board').querySelectorAll('.ghost-letter').forEach((letter) => letter.remove());
}
function canPreview() {
  return !document.hidden && screen === 'round' && round && round.status === 'playing'
    && !round.input.some(Boolean) && byId('modal-layer').hidden;
}
function startPreview(delay = 1100) {
  stopPreview();
  if (!canPreview()) return;
  // Только авторские знакомые слова, никогда не массовый словарь и не ответ.
  const examples = content.words.map((entry) => entry.word).filter((word) => word.length === round.length
    && word.replace(/Ё/g, 'Е') !== round.answer.replace(/Ё/g, 'Е')
    && !round.history.some((guess) => guess.word === word));
  if (!examples.length) return;
  const first = Math.floor(Math.random() * examples.length);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cycle = 0, position = 0, erasing = false;
  const paint = () => {
    const word = examples[(first + cycle) % examples.length];
    byId('board').querySelectorAll('[data-current] .tile').forEach((tile, index) => {
      const existing = tile.querySelector('.ghost-letter');
      if (index >= position) { if (existing) existing.remove(); return; }
      // Уже напечатанные буквы сохраняют DOM-узел и не запускают анимацию заново.
      if (existing) return;
      const ghost = document.createElement('span'); ghost.className = 'ghost-letter';
      ghost.setAttribute('aria-hidden', 'true'); ghost.textContent = word[index]; tile.appendChild(ghost);
    });
  };
  if (reduced) {
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (canPreview()) { position = round.length; paint(); }
    }, delay);
    return;
  }
  const step = () => {
    if (!canPreview()) { stopPreview(); return; }
    position += erasing ? -1 : 1;
    paint();
    let nextDelay = erasing ? 180 : 260;
    if (position === round.length) { erasing = true; nextDelay = 1600; }
    if (position === 0) {
      cycle += 1; erasing = false; nextDelay = 850;
      // Два примера, затем длинная пауза. Повторяем и после проверенной догадки.
      if (cycle === Math.min(2, examples.length)) { startPreview(12000); return; }
    }
    previewTimer = setTimeout(step, nextDelay);
  };
  previewTimer = setTimeout(step, delay);
}

function insertLetter(letter) {
  stopPreview();
  if (round.insert(letter)) { message(''); tone(); renderRound(); return true; }
  message('Нажми «Проверим!»'); return false;
}
function eraseLetter() {
  stopPreview();
  if (round.erase()) { message(''); tone('erase'); renderRound(); }
  startPreview(12000);
}

function buildKeyboard() {
  const holder = byId('keyboard');
  keyboardRows.forEach((letters, rowIndex) => {
    const row = document.createElement('div');
    row.className = 'key-row';
    Array.from(letters).forEach((letter) => {
      const key = document.createElement('button');
      key.type = 'button'; key.className = 'key'; key.dataset.letter = letter;
      key.textContent = letter; key.setAttribute('aria-label', `Буква ${letter}`);
      row.appendChild(key);
    });
    if (rowIndex === keyboardRows.length - 1) {
      const erase = document.createElement('button');
      erase.type = 'button'; erase.className = 'key erase-key'; erase.dataset.erase = 'true';
      erase.innerHTML = icon('erase'); erase.setAttribute('aria-label', 'Стереть букву'); row.appendChild(erase);
    }
    holder.appendChild(row);
  });
  holder.addEventListener('click', (event) => {
    const key = event.target.closest('button');
    if (!key || key.disabled || !round) return;
    if (key.dataset.erase) eraseLetter();
    else insertLetter(key.dataset.letter);
  });
}
function renderRound(scroll = false) {
  if (!round) return;
  const board = byId('board');
  board.replaceChildren();
  const firstRow = Math.max(0, round.history.length - VISIBLE_ROWS + 1);
  for (let rowIndex = firstRow; rowIndex < firstRow + VISIBLE_ROWS; rowIndex += 1) {
    const row = document.createElement('div'); row.className = 'board-row';
    const checked = round.history[rowIndex];
    const current = rowIndex === round.history.length && round.status === 'playing';
    if (current) row.dataset.current = 'true';
    for (let column = 0; column < round.length; column += 1) {
      const tile = document.createElement(checked || current ? 'button' : 'span');
      tile.className = 'tile';
      if (tile.tagName === 'BUTTON') tile.type = 'button';
      if (checked) {
        tile.classList.add(checked.states[column]);
        const explanation = explainCell(round.answer, checked.word, checked.states, column);
        tile.setAttribute('aria-label', `Попытка ${rowIndex + 1}, буква ${checked.word[column]}. ${explanation}`);
        tile.textContent = checked.word[column];
        const mark = document.createElement('span'); mark.className = 'tile-mark'; mark.innerHTML = icon(markNames[checked.states[column]]); tile.appendChild(mark);
        tile.onclick = () => {
          openModal(`<div class="modal-accent">${icon(markNames[checked.states[column]])}</div><h2 id="modal-title">Улика от буквы ${checked.word[column]}</h2><p class="hint-copy">${escapeText(explanation)}</p><button type="button" class="button primary" id="clue-done">Попробую!</button>`);
          byId('clue-done').onclick = () => closeModal();
        };
      } else if (current) {
        tile.classList.add('active-input');
        if (round.cursor === column) tile.classList.add('cursor');
        if (round.revealed[column]) tile.classList.add('hint-fixed');
        tile.textContent = round.input[column];
        tile.setAttribute('aria-label', `${column + 1}-я буква: ${round.input[column] || 'пусто'}${round.revealed[column] ? ', открыта подсказкой' : ', нажми для исправления'}`);
        if (round.revealed[column]) {
          const mark = document.createElement('span'); mark.className = 'tile-mark'; mark.innerHTML = icon('lock'); tile.appendChild(mark);
          tile.onclick = () => toast('Эту букву открыла подсказка. Она уже на своём месте.');
        } else tile.onclick = () => { stopPreview(); round.select(column); renderRound(); startPreview(12000); byId('board').querySelectorAll('[data-current] .tile')[column].focus({ preventScroll: true }); };
      } else tile.setAttribute('aria-hidden', 'true');
      row.appendChild(tile);
    }
    board.appendChild(row);
  }
  const knowledge = keyboardKnowledge(round.history, round.revealed);
  byId('keyboard').querySelectorAll('[data-letter]').forEach((key) => {
    const letter = key.dataset.letter; key.className = `key${knowledge[letter] ? ` ${knowledge[letter]}` : ''}`;
    key.disabled = round.status !== 'playing';
    key.setAttribute('aria-label', `Буква ${letter}${knowledge[letter] ? `, ${names[knowledge[letter]]}` : ''}`);
  });
  byId('keyboard').querySelector('[data-erase]').disabled = round.status !== 'playing';
  byId('verify-button').disabled = round.status !== 'playing';
  setButton('hint-letter', round.letterHintUsed ? 'lock' : 'letter', round.letterHintUsed ? 'Твоя буква' : 'Буква');
  byId('hint-letter').setAttribute('aria-label', round.letterHintUsed ? 'Посмотреть открытую букву' : 'Подсказка: открыть одну букву');
  ['hint-letter', 'hint-meaning'].forEach((id) => { byId(id).disabled = round.status !== 'playing'; });
  byId('reveal-button').hidden = round.status !== 'playing';
  if (scroll) requestAnimationFrame(() => {
    const target = board.querySelector('[data-current]') || board.children[Math.max(0, round.history.length - 1)];
    if (target) {
      const container = byId('board-scroll');
      const top = target.offsetTop - board.offsetTop;
      if (top + target.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = top + target.offsetHeight - container.clientHeight + 5;
      else if (top < container.scrollTop) container.scrollTop = top;
    }
  });
}
function submit() {
  if (!round || screen !== 'round') return;
  stopPreview();
  const result = round.submit();
  if (!result.ok) {
    const feedback = {
      incomplete: 'Добавь буквы в пустые клетки.',
      unknown: 'Словарь не знает это слово. Попробуй другое.',
      repeated: 'Уже пробовали! Напиши другое слово.',
    };
    if (feedback[result.reason]) {
      message(feedback[result.reason]);
      const board = byId('board'); board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
    }
    startPreview(12000);
    return;
  }
  renderRound(true);
  if (result.status === 'won') {
    message('Нашли слово! Сейчас посмотрим, что оно значит.'); tone('win');
    bridge.finish(roundId); bridge.complete();
    resultTimer = setTimeout(showResult, 600);
  } else {
    message('');
    tone('hint');
    startPreview(12000);
  }
}
function letterHint() {
  if (!round || round.status !== 'playing') return;
  stopPreview();
  let hint;
  if (round.letterHintUsed) {
    const position = Number(Object.keys(round.revealed)[0]);
    hint = { position, letter: round.revealed[position] };
  } else hint = round.letterHint();
  if (!hint) { toast('Все позиции уже найдены. Осталось собрать слово!'); return; }
  renderRound(); tone('hint');
  openModal(`<div class="modal-accent">${icon('letter')}</div><h2 id="modal-title">Одна буква уже с нами</h2><div class="reveal-preview"><span class="revealed-letter">${hint.letter}</span><p>Буква <strong>${hint.letter}</strong><br>на <strong>${hint.position + 1}-м месте</strong>.</p></div><p>Мы поставили её в строку. Остальные буквы попробуй найти сам.</p><button type="button" class="button primary" id="letter-done">Продолжим!</button>`);
  byId('letter-done').onclick = () => { closeModal(); message(`Буква ${hint.letter} открыта на ${hint.position + 1}-м месте. Найдём остальные.`); };
}
function wordHint(kind) {
  if (!round || round.status !== 'playing') return;
  round.useHint(kind); tone('hint');
  const entry = round.entry;
  const riddle = kind === 'riddle';
  openModal(`<div class="modal-accent ${riddle ? 'purple' : 'mint'}">${icon(riddle ? 'bulb' : 'book')}</div><h2 id="modal-title">${riddle ? 'Загадка поможет' : 'Что это за слово'}</h2><p class="hint-copy">${escapeText(riddle ? entry.riddle : entry.meaning)}</p>${riddle && entry.proverb ? `<p class="eyebrow">Вспомним пословицу</p><p>${escapeText(entry.proverb)}</p>` : ''}<button type="button" class="button primary" id="hint-done">Вернуться к слову</button>`);
  byId('hint-done').onclick = () => closeModal();
}
function requestReveal() {
  if (!round) return;
  openModal(`<div class="modal-accent">${icon('book')}</div><h2 id="modal-title">Узнаем ответ?</h2><p>Мы откроем слово и его значение. Этот раунд закончится, а потом можно будет загадать новое.</p><button type="button" class="button primary" id="think-more">Ещё подумаю</button><button type="button" class="button secondary" id="reveal-now">Открыть слово</button>`);
  byId('think-more').onclick = () => closeModal();
  byId('reveal-now').onclick = revealAnswer;
}
function revealAnswer() {
  closeModal(false);
  if (!round || !round.reveal()) return;
  bridge.finish(roundId); showResult();
}
function showResult() {
  resultTimer = null;
  if (!round) return;
  const won = round.status === 'won';
  byId('result-badge').innerHTML = icon(won ? 'check' : 'book');
  byId('result-eyebrow').textContent = won ? 'Вот это открытие' : 'Узнаём новое';
  byId('result-title').textContent = won ? 'Слово нашлось!' : 'Вот какое слово';
  byId('result-summary').textContent = won ? `Нашли ${formatGuesses(round.history.length)}${round.hints.size ? ' с подсказками' : ''}!` : 'Теперь мы знаем его. Попробуем ещё одно?';
  const holder = byId('result-word'); holder.replaceChildren();
  Array.from(round.answer).forEach((letter) => {
    const tile = document.createElement('span'); tile.className = 'result-letter'; tile.textContent = letter; holder.appendChild(tile);
  });
  holder.setAttribute('aria-label', `Слово ${round.answer}`);
  byId('result-meaning').textContent = round.entry.meaning;
  byId('result-fact').textContent = round.entry.fact;
  showScreen('result');
  byId('result-screen').scrollTop = 0;
}
function roundedRect(context, x, y, width, height, radius, fill) {
  context.beginPath(); context.moveTo(x + radius, y); context.arcTo(x + width, y, x + width, y + height, radius); context.arcTo(x + width, y + height, x, y + height, radius); context.arcTo(x, y + height, x, y, radius); context.arcTo(x, y, x + width, y, radius); context.closePath(); context.fillStyle = fill; context.fill();
}
function resultImage() {
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 850;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#f1f6ec'; context.fillRect(0, 0, 720, 850);
  roundedRect(context, 38, 38, 644, 774, 42, '#ffffff');
  context.textAlign = 'center'; context.fillStyle = '#193e31'; context.font = 'bold 37px Arial'; context.fillText('Буква за буквой', 360, 112);
  context.fillStyle = '#657960'; context.font = '25px Arial'; context.fillText(`Слово из ${round.length} букв`, 360, 159);
  const cell = round.length > 6 ? 66 : 72; const gap = 10; const start = (720 - (cell + gap) * round.length + gap) / 2;
  const sharedHistory = round.history.slice(-6);
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < round.length; column += 1) {
      const state = sharedHistory[row] ? sharedHistory[row].states[column] : '';
      const fill = state === 'exact' ? '#21a038' : state === 'present' ? '#ffd396' : state === 'absent' ? '#e4e9e1' : '#f4f7f0';
      const x = start + column * (cell + gap); const y = 212 + row * 74;
      roundedRect(context, x, y, cell, 60, 13, fill);
      if (state) {
        context.beginPath(); context.strokeStyle = state === 'exact' ? '#fff' : '#496043'; context.lineWidth = 3; context.lineCap = 'round';
        const cx = x + cell / 2; const cy = y + 30;
        if (state === 'exact') { context.moveTo(cx - 10, cy); context.lineTo(cx - 3, cy + 7); context.lineTo(cx + 11, cy - 8); }
        else if (state === 'present') { context.moveTo(cx - 11, cy); context.lineTo(cx + 11, cy); context.moveTo(cx + 5, cy - 6); context.lineTo(cx + 11, cy); context.lineTo(cx + 5, cy + 6); }
        else { context.moveTo(cx - 7, cy); context.lineTo(cx + 7, cy); }
        context.stroke();
      }
    }
  }
  context.fillStyle = '#274e33'; context.font = 'bold 27px Arial'; context.fillText(round.status === 'won' ? `Нашёл ${formatGuesses(round.history.length)}!` : 'Ещё одно открытие', 360, 710);
  context.fillStyle = '#496443'; context.font = 'bold 24px Arial'; context.fillText(`Код друга: ${challengeCode(round.entry.id)}`, 360, 754);
  context.font = '19px Arial'; context.fillText('Открой «Слово друга» в игре', 360, 787);
  return canvas.toDataURL('image/png');
}
function shareResult() {
  if (!round) return;
  const image = resultImage();
  const code = challengeCode(round.entry.id);
  const ownApp = Boolean(window.BukvaNative || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bukvaBridge));
  const text = `Буква за буквой. ${round.status === 'won' ? `Я нашёл слово ${formatGuesses(round.history.length)}${round.hints.size ? ' с подсказками' : ''}` : 'Я узнал новое слово'}! Угадай то же слово.\nКод: ${code}\nВ игре нажми «Слово друга» и введи код.${ownApp ? `\nВ приложении «Буква за буквой»:\nbukvazabukvoy://challenge/${code}` : ''}`;
  openModal(`<div class="modal-accent">${icon('share')}</div><h2 id="modal-title">Слово для друга</h2>${image ? '<img class="share-preview" id="share-preview" alt="Карточка с числом догадок и кодом слова, без ответа">' : ''}<p class="tutorial-note">Друг получит то же слово. Ответ на карточке не показан.</p><button type="button" class="button primary" id="share-now">Поделиться</button><button type="button" class="quiet-button" id="share-close">К результату</button>`);
  if (image) byId('share-preview').src = image;
  byId('share-now').onclick = () => bridge.share(text, image);
  byId('share-close').onclick = () => closeModal();
}

setButton('back-button', 'back'); setButton('help-button', 'question'); setButton('sound-button', 'mute'); setButton('modal-close', 'close');
byId('modal-close').setAttribute('aria-label', 'Закрыть окно');
byId('art-spark').innerHTML = icon('sparkle'); byId('kind-icon').innerHTML = icon('bulb'); byId('discovery-icon').innerHTML = icon('sparkle');
setButton('reveal-button', 'answer'); setButton('hint-meaning', 'book', 'Значение');
setButton('again-button', 'replay', 'Ещё слово'); setButton('share-button', 'share', 'Показать результат');
byId('legend').querySelectorAll('[data-legend]').forEach((button) => { button.querySelector('.legend-mark').innerHTML = icon(markNames[button.dataset.legend]); });
byId('legend').onclick = (event) => {
  const button = event.target.closest('button'); if (!button) return;
  const type = button.dataset.legend;
  const texts = { exact: 'Зелёная буква на своём месте. Сохрани её здесь в следующем слове.', present: 'Янтарная буква есть в слове, но ей нужно другое место.', absent: 'Серой буквы нет в слове. Если ты написал одну букву несколько раз, серая может быть лишней. Нажми на неё — мы объясним точнее.' };
  openModal(`<div class="modal-accent">${icon(markNames[type])}</div><h2 id="modal-title">${type === 'exact' ? 'Буква на месте' : type === 'present' ? 'Переставим букву' : 'Проверим другие буквы'}</h2><p>${texts[type]}</p><button type="button" class="button primary" id="legend-done">Понятно!</button>`);
  byId('legend-done').onclick = () => closeModal();
};
byId('length-options').onchange = (event) => { chosenLength = Number(event.target.value); };
byId('start-button').onclick = () => startRound(); byId('again-button').onclick = () => startRound();
byId('friend-button').onclick = showFriendEntry;
byId('choose-button').onclick = () => showScreen('home');
byId('back-button').onclick = () => screen === 'home' ? (bridge.close(), toast('До новых открытий!')) : requestHome();
byId('brand').onclick = (event) => { event.preventDefault(); if (screen !== 'home') requestHome(); };
byId('help-button').onclick = showRules; byId('sound-button').onclick = toggleSound;
byId('verify-button').onclick = submit; byId('hint-letter').onclick = letterHint;
byId('hint-meaning').onclick = () => wordHint('meaning');
byId('reveal-button').onclick = requestReveal; byId('share-button').onclick = shareResult;
byId('exit-button').onclick = () => { bridge.close(); showScreen('home'); };
byId('modal-close').onclick = () => closeModal(); byId('modal-backdrop').onclick = () => closeModal();

document.addEventListener('keydown', (event) => {
  if (!byId('modal-layer').hidden) {
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') {
      const focusable = Array.from(byId('modal').querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]'));
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === byId('modal'))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || screen !== 'round' || !round) return;
  if (event.key === 'Enter') {
    // Enter на кнопке сохраняет её обычное действие; вне кнопок проверяет слово.
    if (event.target instanceof Element && event.target.closest('button,a,input,select,textarea')) return;
    event.preventDefault(); if (!event.repeat) submit(); return;
  }
  if (event.key === 'Backspace') { event.preventDefault(); eraseLetter(); return; }
  if (event.key === 'Escape') { event.preventDefault(); requestHome(); return; }
  const letter = normalizeWord(event.key);
  if (letter.length === 1 && ALPHABET.includes(letter)) {
    event.preventDefault(); if (insertLetter(letter)) byId('round-title').focus({ preventScroll: true });
  }
});
// Оболочка Android вызывает этот обработчик вместо уничтожения незаконченного раунда.
window.addEventListener('bukva-back', () => {
  if (!byId('modal-layer').hidden) closeModal();
  else if (screen === 'home') bridge.close();
  else requestHome();
});
document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('document-hidden', document.hidden);
  if (document.hidden) stopPreview(); else startPreview(12000);
  if (audioContext && document.hidden) audioContext.suspend().catch(() => {});
  else if (audioContext && soundEnabled) audioContext.resume().catch(() => {});
});
window.addEventListener('resize', fitHeight);
window.addEventListener('hashchange', readChallengeHash);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitHeight);
fitHeight(); buildKeyboard();
loadContent().then((loaded) => {
  content = loaded;
  byId('start-button').disabled = false;
  byId('start-button').textContent = 'Начнём!';
  byId('friend-button').disabled = false;
  readChallengeHash();
}).catch(() => {
  byId('start-button').textContent = 'Обнови страницу, чтобы начать';
  byId('home-title').textContent = 'Не получилось приготовить слова';
});
