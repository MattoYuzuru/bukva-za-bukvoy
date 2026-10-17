import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../game/js/bridge.js';

test('пять типов отправляются каноническим плоским сообщением', () => {
  const messages = [];
  const bridge = createBridge({ postMessage: (...args) => messages.push(args) });
  bridge.close(); bridge.finish('round-1'); bridge.complete(); bridge.vibrate();
  assert.equal(bridge.share('Моё открытие', 'data:image/png;base64,abc'), true);
  assert.deepEqual(messages.map(([data]) => data.type), ['CLOSE_EVENT', 'FINISH_EVENT', 'COMPLETED_EVENT', 'VIBRATION_EVENT', 'SHARING_EVENT']);
  assert.ok(messages.every(([, origin]) => origin === '*'));
  assert.equal(messages[4][0].text, 'Моё открытие');
  assert.equal(messages[4][0].image, 'data:image/png;base64,abc');
});
test('COMPLETED однократен за открытие, FINISH однократен для каждого раунда', () => {
  const messages = [];
  const bridge = createBridge({ postMessage: (message) => messages.push(message) });
  for (let i = 0; i < 8; i += 1) {
    assert.equal(bridge.finish(i), true);
    assert.equal(bridge.finish(i), false);
    assert.equal(bridge.complete(), i === 0);
  }
  assert.equal(messages.filter((message) => message.type === 'COMPLETED_EVENT').length, 1);
  assert.equal(messages.filter((message) => message.type === 'FINISH_EVENT').length, 8);
});
test('новое открытие получает свой учёт завершения; пустой шаринг не отправляется', () => {
  const messages = [];
  const target = { postMessage: (message) => messages.push(message) };
  createBridge(target).complete(); createBridge(target).complete();
  assert.equal(messages.length, 2);
  assert.equal(createBridge(target).share('', ''), false);
  assert.equal(messages.length, 2);
});
