// Собственные векторные пиктограммы. Никаких эмодзи и внешних наборов.
const paths = {
  back: '<path d="m14 5-7 7 7 7M7 12h13"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  move: '<path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/>',
  absent: '<circle cx="12" cy="12" r="7.5"/><path d="m7 7 10 10"/>',
  erase: '<path d="M8 5h12v14H8l-6-7 6-7Z"/><path d="m11 9 6 6m0-6-6 6"/>',
  bulb: '<path d="M8 16c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7M8 17h8m-7 3h6"/><path d="M10 10h4m-2 0v6"/>',
  book: '<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>',
  letter: '<rect x="4" y="3" width="16" height="18" rx="4"/><path d="m8 16 4-9 4 9M9.5 13h5"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.2"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4Zm13 1 5 5m0-5-5 5"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/>',
  replay: '<path d="M5 8a8 8 0 1 1-1 7M5 3v6h6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  home: '<path d="m3 11 9-8 9 8M6 9v12h12V9m-8 12v-7h4v7"/>',
};
export function icon(name, className = '') {
  if (!Object.prototype.hasOwnProperty.call(paths, name)) throw new Error('Неизвестная иконка');
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
