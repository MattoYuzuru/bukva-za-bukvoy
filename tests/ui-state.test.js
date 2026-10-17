import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
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
