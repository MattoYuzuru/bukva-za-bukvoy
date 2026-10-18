import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Round } from '../game/js/engine.js';
const source = await readFile(new URL('../game/js/app.js', import.meta.url), 'utf8');
function functionSource(name, next) {
  return source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
}
test('WebView выбирает раскладку по видимой области после закрытия системной клавиатуры', () => {
  for (const [width, height, landscape, compact, short] of [[393,754,false,false,false],[360,560,false,true,true],[844,390,true,true,true]]) {
    const classes = new Map(), properties = new Map();
    const scope = {
      window: { innerWidth: width, innerHeight: height, visualViewport: { width, height, scale: 1 }, __hackathonBridgeInstalled: true, matchMedia: () => { throw new Error('Устаревшая геометрия media query'); } },
      document: { documentElement: { classList: { toggle: (name, value) => classes.set(name, value) }, style: { setProperty: (name, value) => properties.set(name, value) } } },
    };
    vm.runInNewContext(functionSource('fitHeight', 'showScreen') + '\nfitHeight();', scope);
    assert.equal(classes.get('viewport-landscape'), landscape);
    assert.equal(classes.get('viewport-compact'), compact);
    assert.equal(classes.get('viewport-short'), short);
    assert.equal(classes.get('host-controls'), true);
    assert.equal(properties.get('--app-height'), `${height}px`);
  }
});
test('выход сразу после победы отменяет отложенный экран результата', () => {
  const shown = [], sent = [], cleared = [];
  const scope = {
    round: { status: 'won' }, screen: 'round', resultTimer: 42, roundId: 1,
    clearTimeout: (id) => cleared.push(id), closeModal: () => {},
    showScreen: (name) => shown.push(name),
    bridge: { finish: (id) => sent.push(id), close: () => {} },
  };
  vm.createContext(scope);
  vm.runInContext(functionSource('leaveRound', 'chooseEntry') + '\nrequestHome();', scope);
  assert.deepEqual(shown, ['home']); assert.deepEqual(cleared, [42]); assert.equal(scope.resultTimer, null); assert.equal(scope.round, null);
});
test('Enter на кнопке оставляет стандартное действие, вне кнопки проверяет слово', () => {
  const start = source.indexOf("  if (event.key === 'Enter')", source.indexOf("document.addEventListener('keydown'"));
  const stop = source.indexOf("  if (event.key === 'Backspace')", start);
  const code = `(function(event){${source.slice(start, stop)}})(event);`;
  class Element { constructor(interactive) { this.interactive = interactive; } closest() { return this.interactive ? this : null; } }
  for (const interactive of [true, false]) {
    let prevented = false, submits = 0;
    const scope = { Element, event: { key: 'Enter', repeat: false, target: new Element(interactive), preventDefault: () => { prevented = true; } }, submit: () => { submits += 1; } };
    vm.runInNewContext(code, scope);
    assert.equal(prevented, !interactive); assert.equal(submits, interactive ? 0 : 1);
  }
});

function previewHarness({ answer = 'ЛИСА', words = ['ЛИСА', 'СОВА', 'РЕКА'], reduced = false } = {}) {
  const tasks = new Map();
  let nextId = 0, now = 0, created = 0;
  const tiles = Array.from({length:4}, () => ({
    querySelector() { return this.ghost || null; },
    appendChild(letter) { this.ghost = letter; letter.tile = this; },
  }));
  const board = { classList: { remove() {}, add() {} }, querySelectorAll(selector) {
    if (selector === '[data-current] .tile') return tiles;
    return tiles.flatMap(t => t.ghost ? [t.ghost] : []);
  } };
  const modal = { hidden: true };
  const scope = {
    round: new Round({word:answer}, new Set(words)),
    content: {words:words.map(word => ({word}))}, screen:'round', previewTimer:null,
    document:{hidden:false,createElement:()=> {
      created += 1;
      return { setAttribute(name, value) { this[name] = value; }, remove() { delete this.tile.ghost; } };
    }},
    window:{matchMedia:()=>({matches:reduced})},
    Math:Object.assign(Object.create(Math), { random:()=>0 }),
    byId:id=>id==='board'?board:modal,
    message() {}, tone() {}, renderRound() {}, showResult() {},
    bridge: { finish() {}, complete() {} }, roundId:1,
    setTimeout(fn, delay) { tasks.set(++nextId,{fn,at:now+delay}); return nextId; },
    clearTimeout(id) { tasks.delete(id); },
  };
  vm.createContext(scope);
  vm.runInContext(functionSource('stopPreview','buildKeyboard') + functionSource('submit','letterHint'), scope);
  function next() {
    assert.ok(tasks.size, 'Ожидался таймер примера');
    const [id, task] = [...tasks].sort((a,b)=>a[1].at-b[1].at)[0];
    tasks.delete(id); now = task.at; task.fn();
  }
  return { scope, tiles, tasks, next,
    run:code=>vm.runInContext(code,scope),
    text:()=>tiles.map(t=>t.ghost?.textContent||'').join(''),
    created:()=>created,
    advance(ms) {
      const target = now + ms;
      let steps = 0;
      while ([...tasks.values()].some(task=>task.at<=target)) {
        assert.ok(steps++<1000, 'Таймер не должен зациклиться без паузы'); next();
      }
      now = target;
    },
  };
}

test('пример печатает и стирает одну букву за шаг, сохраняя остальные без перезапуска анимации', () => {
  const h = previewHarness();
  h.run('startPreview();');
  const retained = [];
  for (let count=1; count<=4; count+=1) {
    h.next(); assert.equal(h.text(), 'СОВА'.slice(0,count));
    retained.forEach((node,i)=>assert.equal(h.tiles[i].ghost,node));
    retained.push(h.tiles[count-1].ghost);
    assert.equal(retained[count-1]['aria-hidden'],'true');
  }
  h.advance(1599); assert.equal(h.text(),'СОВА');
  h.advance(1); assert.equal(h.text(),'СОВ');
  for (let count=2; count>=0; count-=1) {
    h.advance(180); assert.equal(h.text(),'СОВА'.slice(0,count));
    for (let i=0; i<count; i+=1) assert.equal(h.tiles[i].ghost,retained[i]);
  }
  assert.equal(h.created(),4);
  assert.equal(h.scope.round.input.join(''),'');
  assert.equal(h.scope.round.history.length,0);
});

test('после двух примеров есть полная пауза 12 секунд, затем ввод предлагается снова', () => {
  const h = previewHarness(), snapshots = [];
  h.run('startPreview();');
  for (let step=0; step<16; step+=1) { h.next(); snapshots.push(h.text()); }
  assert.deepEqual(snapshots,['С','СО','СОВ','СОВА','СОВ','СО','С','','Р','РЕ','РЕК','РЕКА','РЕК','РЕ','Р','']);
  h.advance(11999); assert.equal(h.text(),'');
  h.advance(1); assert.equal(h.text(),'С');
  h.run('stopPreview();'); h.advance(60000);
  assert.equal(h.text(),''); assert.equal(h.tasks.size,0);
});

test('настоящий ввод сразу убирает пример, частичный ввод не перекрывается, после стирания есть пауза', () => {
  const h = previewHarness();
  h.run('startPreview();'); h.next(); h.next();
  h.run("insertLetter('К');");
  assert.equal(h.text(),''); assert.equal(h.scope.round.input.join(''),'К');
  h.advance(60000); assert.equal(h.text(),''); assert.equal(h.tasks.size,0);
  h.run('eraseLetter();');
  h.advance(11999); assert.equal(h.text(),'');
  h.advance(1); assert.equal(h.text(),'С');
});

test('на новой строке после догадки пример возвращается и не предлагает ответ или уже проверенное слово', () => {
  const h = previewHarness();
  h.run("for (const letter of 'РЕКА') insertLetter(letter); submit();");
  assert.equal(h.scope.round.history.length,1);
  assert.equal(h.scope.round.input.join(''),'');
  h.advance(11999); assert.equal(h.text(),'');
  h.advance(1); assert.equal(h.text(),'С');
  h.next(); h.next(); h.next(); assert.equal(h.text(),'СОВА');
  h.advance(2140); assert.equal(h.text(),'');
  h.advance(11999); assert.equal(h.text(),'');
  h.advance(1); assert.equal(h.text(),'С');
});

test('пример не запускается поверх диалога, в фоне, после победы или рядом с открытой буквой', () => {
  for (const block of ["document.hidden=true", "byId('modal-layer').hidden=false", "screen='home'", "round.status='won'", 'round.letterHint()']) {
    const h = previewHarness(); h.run(block+'; startPreview();');
    assert.equal(h.tasks.size,0,block); assert.equal(h.text(),'',block);
  }
  const h = previewHarness(); h.run('startPreview();'); h.next();
  h.run('document.hidden=true;'); h.next();
  assert.equal(h.text(),''); assert.equal(h.tasks.size,0);
});

test('reduced motion показывает неподвижный пример после паузы; вариант ответа с Е/Ё исключён', () => {
  const h = previewHarness({ answer:'СЛЁТ', words:['СЛЁТ','СЛЕТ','СОВА'], reduced:true });
  h.run('startPreview(12000);');
  h.advance(11999); assert.equal(h.text(),'');
  h.advance(1); assert.equal(h.text(),'СОВА');
  const nodes = h.tiles.map(tile=>tile.ghost);
  h.advance(60000); assert.equal(h.text(),'СОВА');
  nodes.forEach((node,i)=>assert.equal(h.tiles[i].ghost,node));
  assert.equal(h.tasks.size,0); assert.equal(h.scope.round.input.join(''),'');
});
