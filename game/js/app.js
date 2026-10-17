import { ALPHABET, MAX_ATTEMPTS, Round, keyboardKnowledge, normalizeWord, explainCell } from './engine.js';
import { loadContent } from './content.js';
import { icon } from './icons.js';
import { createBridge } from './bridge.js';

const byId = (id) => document.getElementById(id);
const bridge = createBridge();
const screens = ['home', 'round', 'result'];
const keyboardRows = ['АБВГДЕЁЖЗ', 'ИЙКЛМНОПР', 'СТУФХЦЧШЩ', 'ЪЫЬЭЮЯ'];
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
  screen = name;
  screens.forEach((item) => { byId(`${item}-screen`).hidden = item !== name; });
  byId('back-button').setAttribute('aria-label', name === 'home' ? 'Выйти из игры' : 'К выбору длины слова');
  byId('back-button').title = name === 'home' ? 'Выйти из игры' : 'К выбору длины слова';
  if (focus) byId(`${name === 'round' ? 'round' : name === 'result' ? 'result' : 'home'}-title`).focus({ preventScroll: true });
}
function message(text) { byId('round-message').textContent = text; }
function toast(text) {
  clearTimeout(toastTimer);
  byId('toast').textContent = text;
  byId('toast').hidden = false;
  toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 2600);
}
function tone(kind = 'tap') {
  if (!soundEnabled || !audioContext) return;
  const frequencies = kind === 'win' ? [523.25, 659.25, 783.99] : kind === 'hint' ? [659.25] : [440];
  const start = audioContext.currentTime;
  frequencies.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const time = start + index * 0.1;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(kind === 'tap' ? 0.025 : 0.055, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(time); oscillator.stop(time + 0.15);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
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
}
function showRules() {
  tutorialSeen = true;
  openModal(`<div class="modal-accent">${icon('question')}</div><h2 id="modal-title">Как поймать слово</h2>
    <div class="tutorial-card"><span class="tutorial-tile exact">А</span><p><strong>На своём месте</strong>Оставь эту букву здесь.</p></div>
    <div class="tutorial-card"><span class="tutorial-tile present">Б</span><p><strong>Нужно другое место</strong>Буква есть в слове. Переставь её.</p></div>
    <div class="tutorial-card"><span class="tutorial-tile absent">В</span><p><strong>Буквы нет в слове</strong>Попробуй другую. Повторная буква может оказаться лишней.</p></div>
    <p class="tutorial-note">Нажми на проверенную букву — она расскажет, что делать дальше. Подсказки не отнимают попытки.</p>
    <button type="button" class="button primary" id="rules-done">Попробуем!</button>`);
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
  return pool[Math.floor(Math.random() * pool.length)];
}
function startRound() {
  if (!content) return;
  closeModal(false);
  clearTimeout(resultTimer);
  const entry = chooseEntry(chosenLength);
  round = new Round(entry, content.accepted);
  roundId += 1;
  played.add(entry.id);
  byId('round-theme').textContent = entry.theme;
  byId('round-title').textContent = `Слово из ${round.length} букв`;
  byId('board').style.setProperty('--length', String(round.length));
  byId('board-scroll').scrollTop = 0;
  message('Начни с любого знакомого слова.');
  showScreen('round');
  renderRound(true);
  if (!tutorialSeen) showRules();
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
    if (rowIndex === 3) {
      const erase = document.createElement('button');
      erase.type = 'button'; erase.className = 'key erase-key'; erase.dataset.erase = 'true';
      erase.innerHTML = icon('erase'); erase.setAttribute('aria-label', 'Стереть букву'); row.appendChild(erase);
    }
    holder.appendChild(row);
  });
  holder.addEventListener('click', (event) => {
    const key = event.target.closest('button');
    if (!key || key.disabled || !round) return;
    if (key.dataset.erase) { if (round.erase()) { tone(); renderRound(); } }
    else if (round.insert(key.dataset.letter)) { tone(); renderRound(); }
    else message('Слово готово. Нажми «Проверим!» или выбери клетку для исправления.');
  });
}
function renderRound(scroll = false) {
  if (!round) return;
  const board = byId('board');
  board.replaceChildren();
  for (let rowIndex = 0; rowIndex < MAX_ATTEMPTS; rowIndex += 1) {
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
        } else tile.onclick = () => { round.select(column); renderRound(); byId('board').querySelectorAll('[data-current] .tile')[column].focus({ preventScroll: true }); };
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
  byId('attempt-label').textContent = round.status === 'playing' ? `${round.history.length + 1} из ${MAX_ATTEMPTS}` : `${round.history.length} из ${MAX_ATTEMPTS}`;
  byId('verify-button').textContent = round.status === 'exhausted' ? 'Откроем слово вместе' : 'Проверим!';
  byId('verify-button').disabled = round.status !== 'playing' && round.status !== 'exhausted';
  setButton('hint-letter', round.letterHintUsed ? 'lock' : 'letter', round.letterHintUsed ? 'Твоя буква' : 'Буква');
  byId('hint-letter').setAttribute('aria-label', round.letterHintUsed ? 'Посмотреть открытую букву' : 'Подсказка: открыть одну букву');
  ['hint-letter', 'hint-riddle', 'hint-meaning'].forEach((id) => { byId(id).disabled = round.status !== 'playing'; });
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
  if (round.status === 'exhausted') { revealAnswer(); return; }
  const result = round.submit();
  if (!result.ok) {
    const feedback = {
      incomplete: 'Нужно заполнить все клетки. Попробуй добавить буквы.',
      unknown: 'Пока не знаем такое слово. Проверь буквы или попробуй другое.',
      repeated: 'Это слово уже проверяли. Попробуй новую догадку.',
    };
    if (feedback[result.reason]) {
      message(feedback[result.reason]);
      const board = byId('board'); board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
    }
    return;
  }
  renderRound(true);
  if (result.status === 'won') {
    message('Нашли слово! Сейчас посмотрим, что оно значит.'); tone('win');
    bridge.finish(roundId); bridge.complete();
    resultTimer = setTimeout(showResult, 600);
  } else if (result.status === 'exhausted') {
    message('Проверили шесть догадок. Давай узнаем слово вместе.');
  } else {
    const exact = result.states.filter((state) => state === 'exact').length;
    const present = result.states.filter((state) => state === 'present').length;
    if (present) message('Есть буква для другого места. Нажми на неё и посмотри улику.');
    else if (exact) message('Есть буквы на своих местах. Сохрани их в новой догадке.');
    else message('Эти буквы не подошли. Давай попробуем другие.');
    tone('hint');
  }
}
function letterHint() {
  if (!round || round.status !== 'playing') return;
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
  byId('result-summary').textContent = won ? (round.hints.size ? 'Собрали буквы вместе с подсказками.' : 'Твои догадки привели к ответу.') : 'Теперь мы знаем его. Попробуем ещё одно?';
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
  for (let row = 0; row < MAX_ATTEMPTS; row += 1) {
    for (let column = 0; column < round.length; column += 1) {
      const state = round.history[row] ? round.history[row].states[column] : '';
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
  context.fillStyle = '#274e33'; context.font = 'bold 27px Arial'; context.fillText(round.status === 'won' ? 'Слово нашлось!' : 'Ещё одно открытие', 360, 719);
  context.fillStyle = '#687b62'; context.font = '21px Arial'; context.fillText('Попробуй поискать слово по буквам', 360, 760);
  return canvas.toDataURL('image/png');
}
function shareResult() {
  if (!round) return;
  const image = resultImage();
  const text = `Буква за буквой. ${round.status === 'won' ? 'Я разгадал' : 'Я узнал'} слово из ${round.length} букв. Попробуй и ты!`;
  openModal(`<div class="modal-accent">${icon('share')}</div><h2 id="modal-title">Моё открытие</h2>${image ? '<img class="share-preview" id="share-preview" alt="Карточка результата без ответа и личных данных">' : '<p>Слово найдено. Расскажи об игре близким!</p>'}<p class="tutorial-note">Ответ остался секретом. Можно показать эту карточку близким.</p><button type="button" class="button primary" id="share-now">Поделиться</button><button type="button" class="quiet-button" id="share-close">Вернуться к результату</button>`);
  if (image) byId('share-preview').src = image;
  byId('share-now').onclick = () => bridge.share(text, image);
  byId('share-close').onclick = () => closeModal();
}

setButton('back-button', 'back'); setButton('help-button', 'question'); setButton('sound-button', 'mute'); setButton('modal-close', 'close');
byId('modal-close').setAttribute('aria-label', 'Закрыть окно');
byId('art-spark').innerHTML = icon('sparkle'); byId('kind-icon').innerHTML = icon('bulb'); byId('discovery-icon').innerHTML = icon('sparkle');
setButton('hint-riddle', 'bulb', 'Загадка'); setButton('hint-meaning', 'book', 'Значение');
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
byId('start-button').onclick = startRound; byId('again-button').onclick = startRound;
byId('choose-button').onclick = () => showScreen('home');
byId('back-button').onclick = () => screen === 'home' ? (bridge.close(), toast('До новых открытий!')) : requestHome();
byId('brand').onclick = (event) => { event.preventDefault(); if (screen !== 'home') requestHome(); };
byId('help-button').onclick = showRules; byId('sound-button').onclick = toggleSound;
byId('verify-button').onclick = submit; byId('hint-letter').onclick = letterHint;
byId('hint-riddle').onclick = () => wordHint('riddle'); byId('hint-meaning').onclick = () => wordHint('meaning');
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
  if (event.key === 'Backspace') { event.preventDefault(); if (round.erase()) renderRound(); return; }
  if (event.key === 'Escape') { event.preventDefault(); requestHome(); return; }
  const letter = normalizeWord(event.key);
  if (letter.length === 1 && ALPHABET.includes(letter)) {
    event.preventDefault(); if (round.insert(letter)) { tone(); renderRound(); byId('round-title').focus({ preventScroll: true }); }
  }
});
// Оболочка Android вызывает этот обработчик вместо уничтожения незаконченного раунда.
window.addEventListener('bukva-back', () => {
  if (!byId('modal-layer').hidden) closeModal();
  else if (screen === 'home') bridge.close();
  else requestHome();
});
document.addEventListener('visibilitychange', () => {
  if (audioContext && document.hidden) audioContext.suspend().catch(() => {});
  else if (audioContext && soundEnabled) audioContext.resume().catch(() => {});
});
window.addEventListener('resize', fitHeight);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitHeight);
fitHeight(); buildKeyboard();
loadContent().then((loaded) => {
  content = loaded;
  byId('start-button').disabled = false;
  byId('start-button').textContent = 'Начнём!';
}).catch(() => {
  byId('start-button').textContent = 'Обнови страницу, чтобы начать';
  byId('home-title').textContent = 'Не получилось приготовить слова';
});
