const allowed = new Set(['CLOSE_EVENT', 'FINISH_EVENT', 'COMPLETED_EVENT', 'VIBRATION_EVENT', 'SHARING_EVENT']);
export function createBridge(target = window) {
  let completed = false;
  const finished = new Set();
  function send(type, fields = {}) {
    if (!allowed.has(type)) throw new Error('Событие не входит в контракт');
    target.postMessage({ ...fields, type }, '*');
  }
  return {
    close: () => send('CLOSE_EVENT'),
    finish(roundId) { if (finished.has(roundId)) return false; finished.add(roundId); send('FINISH_EVENT'); return true; },
    complete() { if (completed) return false; completed = true; send('COMPLETED_EVENT'); return true; },
    vibrate: () => send('VIBRATION_EVENT'),
    share(text, image) {
      if (!text && !image) return false;
      send('SHARING_EVENT', { text, image });
      return true;
    },
  };
}
