// Презентация защиты: собственные тексты и реальные снимки интерфейса.
// Запуск требует пути к комплекту Codex, без установки пакетов в игру.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.env.BUKVA_PRESENTATION_RUNTIME || '/Users/yuzuru/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const skill = process.env.BUKVA_PRESENTATION_SKILL || '/Users/yuzuru/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations';
process.env.RUNTIME_NODE_MODULES = path.join(runtime, 'node/node_modules');
process.env.RUNTIME_NODE = path.join(runtime, 'node/bin/node');
process.env.RUNTIME_PYTHON = path.join(runtime, 'python/bin/python3');
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(runtime, 'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const { finalizePresentation, resolvePresentationFont } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href);
const temporary = path.join(root, '.work/presentation-build');
const output = path.join(root, 'docs/защита');
const nameIndex = process.argv.indexOf('--name');
const stem = nameIndex < 0 ? 'Буква за буквой' : process.argv[nameIndex + 1];
if (!stem || /[\\/\0]/.test(stem)) throw new Error('После --name нужно простое имя файла без пути');
await fs.mkdir(temporary, { recursive: true });
await fs.mkdir(output, { recursive: true });

const font = resolvePresentationFont({ fontFamily: 'Arial' });
const colors = { paper: '#F5F8F2', white: '#FFFFFF', ink: '#193E31', muted: '#64776B', green: '#187C2D' };
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function text(slide, name, value, x, y, width, height, size = 28, bold = false, color = colors.ink) {
  const shape = slide.shapes.add({
    geometry: 'textbox', name,
    position: { left: x, top: y, width, height },
    fill: 'none', line: { fill: 'none', width: 0, style: 'solid' },
  });
  shape.text = value;
  shape.text.style = { typeface: font, fontSize: size, bold, color, alignment: 'left', verticalAlignment: 'top', autoFit: 'none', wrap: 'square', insets: 0 };
  return shape;
}
function slide(title, notes, background = colors.paper) {
  const item = presentation.slides.add();
  item.background.fill = background;
  if (title) text(item, 'Заголовок', title, 72, 58, 1110, 114, 46, true);
  item.speakerNotes.text = notes;
  return item;
}
async function screenshot(item, name, alt, x = 876, y = 58, width = 278, height = 602) {
  const bytes = await fs.readFile(path.join(root, 'docs/экраны', name));
  item.images.add({ blob: bytes, contentType: 'image/jpeg', alt, fit: 'contain', position: { left: x, top: y, width, height }, geometry: 'roundRect', borderRadius: 18 });
}

const first = slide(null,
  '0:00–0:20. «Буква за буквой» — короткая игра со словами для читающих детей. Ребёнок делает догадку, замечает буквенную улику и пробует ещё раз. Основная аудитория — 8–10 лет. В 6–7 лет мы предполагаем помощь взрослого.\n\nИсточники: docs/Требования.md, docs/Дизайн.md. Снимок настоящего интерфейса: docs/экраны/главный-390.jpg. Требования трека: https://kids.hackathon.aam.run/#tracks');
text(first, 'Событие', 'Хакатон ВШЭ и Сбер', 72, 65, 690, 42, 24, false, colors.muted);
text(first, 'Название игры', 'Буква\nза буквой', 72, 164, 720, 210, 80, true);
text(first, 'Описание', 'Поиск слов\nпо буквенным уликам', 76, 410, 690, 112, 34);
text(first, 'Аудитория', '8–10 лет самостоятельно\n6–7 лет со взрослым', 76, 582, 700, 78, 26, false, colors.muted);
await screenshot(first, 'главный-390.jpg', 'Главный экран: выбор слова от четырёх до семи букв');

const second = slide('Буквенные улики и мышление',
  '0:20–1:05. Мы не изобретаем новую базовую механику Wordle. Наше отличие — объяснение результата на понятном ребёнку языке. Можно нажать проверенную букву и узнать, что делать с ней дальше. Учебная гипотеза: ребёнок использует сведения из прошлой попытки, сохраняет верную позицию и переставляет найденную букву. Словарь и определения дополнительно помогают знакомиться со словами. Учебный эффект пока не измерен. Для проверки мы предложим несколько коротких раундов детям и посмотрим на их следующую догадку.\n\nИсточники: docs/Требования.md, docs/Источники.md. Базовая механика уже встречается в экосистеме Сбера, поэтому абсолютная уникальность не заявляется. Источник аналога: https://apps.sber.ru/salute-apps/eca0f91c-ffa7-44e9-9299-93e156fd4933/');
text(second, 'Действие ребёнка', 'Ребёнок замечает букву\nи использует её\nв следующей догадке', 72, 205, 710, 235, 43, true);
text(second, 'Статус цели', 'Учебная гипотеза', 828, 205, 360, 58, 27, true, colors.green);
text(second, 'Наблюдаемые действия', 'Сохранить верную позицию.\n\nПереставить найденную букву.', 828, 284, 365, 220, 28);
text(second, 'Способ проверки', 'Проверим короткой пробой с детьми\nи наблюдением за следующей попыткой', 76, 562, 1090, 96, 28, false, colors.muted);

const third = slide('Шесть попыток на одно слово',
  '1:05–2:20. Здесь показываем живую игру, если доступен телефон с официальной песочницей. Выбираем пять букв. Вводим ЛАМПА и нажимаем «Проверим!». На сохранённом снимке ответ — ЛОДКА: зелёные Л и последняя А уже на месте. В живом случайном раунде результат может отличаться, поэтому не обещаем тот же ответ. Нажимаем проверенную букву и читаем улику. Затем исправляем одну клетку. Неполный ввод, неизвестное слово и повтор не расходуют попытку. Если живой показ недоступен, объясняем этот путь по снимку.\n\nИсточники: docs/Требования.md, game/js/engine.js, game/js/app.js. Реальный снимок: docs/экраны/раунд-390.jpg. Снимок подтверждает браузерный сценарий и не заменяет запуск на физическом телефоне.');
text(third, 'Размер слова', '4–7 букв', 76, 222, 680, 86, 56, true, colors.green);
text(third, 'Правила попыток', 'Неполное слово и повтор\nне расходуют попытку', 76, 343, 680, 104, 31);
text(third, 'Клавиатура', 'Все русские буквы всегда видны.\nЛюбую свободную клетку можно исправить.', 76, 508, 690, 122, 29, false, colors.muted);
await screenshot(third, 'раунд-390.jpg', 'Проверенная догадка ЛАМПА: две буквы на своих местах');

const fourth = slide('Помощь без штрафа',
  '2:20–3:05. Ребёнок сам выбирает помощь. Одна случайная ещё не найденная буква закрепляется на месте. Повторное нажатие показывает ту же открытую букву. Загадка даёт смысловую улику, а определение точнее объясняет значение. Попытки за помощь не списываются. Пословицу мы не навязываем каждому слову: для младших детей короткая ясная загадка часто понятнее. После шести попыток можно спокойно открыть ответ. Кнопка «Сдаться» не нужна.\n\nИсточники: docs/Требования.md, docs/Контент.md. Настоящий снимок: docs/экраны/подсказка-390.jpg.');
text(fourth, 'Первая подсказка', 'Одна буква', 76, 208, 690, 56, 34, true, colors.green);
text(fourth, 'Смысл первой подсказки', 'Закрепляет новую позицию.', 76, 272, 690, 46, 27);
text(fourth, 'Вторая подсказка', 'Загадка', 76, 367, 690, 56, 34, true);
text(fourth, 'Смысл второй подсказки', 'Даёт смысловую улику.', 76, 431, 690, 46, 27);
text(fourth, 'Третья подсказка', 'Значение', 76, 526, 690, 56, 34, true);
text(fourth, 'Смысл третьей подсказки', 'Объясняет слово без готового ответа.', 76, 590, 720, 46, 27);
await screenshot(fourth, 'подсказка-390.jpg', 'Открытая загадка для слова ЛОДКА, игровые буквы остаются на фоне');

const fifth = slide('Каждый раунд заканчивается\nоткрытием',
  '3:05–3:50. После победы или раскрытия мы показываем слово, простое определение и небольшое задание для обсуждения. Например, после слова АИСТ можно попробовать постоять на одной ноге. Даже незавершённая разгадка становится знакомством со словом. Есть карточка результата для отправки близким. Она скрывает ответ и личные данные, а отправку выполняет системный контейнер. Мы предполагаем, что такой результат захочется показать, но не заявляем доказанную виральность: это ещё нужно проверить.\n\nИсточники: docs/Требования.md, game/js/app.js, game/js/bridge.js. Реальный экран: docs/экраны/результат-390.jpg. Картинка на слайде показывает экран результата, а не отправляемую карточку. Критерии: https://kids.hackathon.aam.run/#score');
text(fifth, 'Итог раунда', 'Слово, простое определение\nи задание для обсуждения', 76, 274, 700, 130, 32);
text(fifth, 'Передача результата', 'Карточка для близких\nскрывает загаданное слово', 76, 462, 700, 110, 31, true, colors.green);
text(fifth, 'Граница вывода', 'Желание пригласить друга\nещё нужно проверить', 76, 606, 700, 74, 24, false, colors.muted);
await screenshot(fifth, 'результат-390.jpg', 'Результат раунда со словом АИСТ и заданием для обсуждения');

const sixth = slide('Статическая игра для WebView',
  '3:50–5:00. Реализация использует только собственные HTML, CSS, JavaScript и SVG. Сейчас в игре 80 ответов с авторскими загадками и определениями, более 680 допустимых догадок. Основной словарь лежит в JSON и проходит проверку перед публикацией. Если загрузка данных не удалась, через 1,9 секунды включается запасной набор. Аккаунта, сервера и постоянного прогресса нет. Результат передаём только через существующий мост контейнера. Автономная Android-оболочка помогает установить игру, но на защите нужен запуск в неизменённой официальной песочнице на реальном телефоне. На момент подготовки презентации физические устройства и iOS не проверены. Следующий шаг — пройти этот сценарий на устройстве и проверить учебную гипотезу с детьми.\n\nИсточники: docs/Архитектура.md, docs/Сборка.md, docs/Контент.md, game/data/words.json, game/js/content.js. Требования поставки: https://kids.hackathon.aam.run/#delivery и https://kids.hackathon.aam.run/#limits. Статус проверок следует уточнить перед выступлением, не подменяя эмулятор физическим телефоном.');
text(sixth, 'Число ответов', '80', 76, 189, 500, 100, 76, true, colors.green);
text(sixth, 'Подпись к ответам', 'слов с авторскими подсказками', 80, 302, 525, 72, 27);
text(sixth, 'Число догадок', '680+', 76, 432, 500, 100, 76, true, colors.green);
text(sixth, 'Подпись к догадкам', 'допустимых догадок', 80, 545, 525, 72, 27);
text(sixth, 'Технология', 'Собственные HTML, CSS и JavaScript.\nДанные в JSON.\n\nБез аккаунта, сервера и сохранений.', 664, 205, 530, 212, 27);
text(sixth, 'Проверка перед защитой', 'Перед защитой', 664, 455, 530, 54, 29, true);
text(sixth, 'Следующий шаг', 'Официальная песочница на телефоне.\n\niOS и физические устройства\nещё не проверены.', 664, 522, 535, 152, 25, false, colors.muted);

// Черновик и служебные отчёты остаются в игнорируемом каталоге.
const candidatePath = path.join(temporary, 'candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
const finalPath = path.join(output, `${stem}.pptx`);
await finalizePresentation({
  workspaceDir: root, candidatePath, finalPath,
  explicitTotalSlideCount: 6,
  requiredNativeTableOwnerSlides: [], requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: 'design', families: [font] },
  pythonExecutable: path.join(runtime, 'python/bin/python3'),
  integrityValidatorPath: path.join(skill, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skill, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-bullet-geometry', '--validate-heading-fit'],
  verifyArtifactToolImport: true,
  receiptPath: path.join(temporary, 'validation.json'),
});
// В этом комплекте прямой PDF-export не находит #standard-fonts/Helvetica.
// Готовый PPTX преобразует уже установленный LibreOffice из того же комплекта.
const pdf = path.join(output, `${stem}.pdf`);
const conversions = [
  [path.join(runtime, 'bin/override/soffice'), ['--headless', '--convert-to', 'pdf', '--outdir', output, finalPath]],
  [path.join(runtime, 'bin/override/pdftoppm'), ['-scale-to', '1280', '-png', pdf, path.join(output, 'слайд')]],
];
for (const [command, args] of conversions) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(`Не удалось преобразовать презентацию: ${result.stderr || result.error}`);
}
console.log(JSON.stringify({ pptx: finalPath, pdf, slides: presentation.slides.items.length, font }));
