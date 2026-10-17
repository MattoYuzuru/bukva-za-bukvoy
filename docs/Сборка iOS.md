# Сборка iOS

Основной исходник игры находится в `game/` и не меняется при создании приложения. Самостоятельная iOS-версия — UIKit-контейнер с `WKWebView`, который открывает локальный каталог `WWW` через публичный `loadFileURL(_:allowingReadAccessTo:)`. Для запуска не нужны сервер, интернет, npm или сторонние библиотеки.

Установка на личный iPhone через Xcode, ограничения Personal Team и путь через TestFlight описаны в [инструкции установки](Установка%20iOS.md). В этом документе описаны устройство сборки и границы проверки.

## Xcode и исходники

Откройте `ios/BukvaZaBukvoy.xcodeproj`, выберите общую схему `BukvaZaBukvoy` и нужный Simulator или подключённый iPhone. Обычный Run запускает build phase «Подготовить автономную игру». Предварительно вызывать CLI-скрипт не нужно. Python берётся из `/usr/bin/python3`, поставляемого с инструментами Apple; упаковщик использует только стандартную библиотеку Python 3.9+.

Проект использует Swift 5, UIKit, WebKit и системное меню отправки. Минимальная версия приложения — iOS 15.0. Идентификатор — `ru.bukvazabukvoy.game`, версия — 1.1.0, номер сборки — 1. Team не задана; её выбирает владелец Apple Account в Xcode. Аккаунты, сертификаты, provisioning profiles и App Store Connect скрипты проекта не запрашивают.

Сценарий сборки не вызывает `xcode-select`: путь Xcode выбирается только через переменную `DEVELOPER_DIR` или параметр `--developer-dir`. Локальное окружение — `/Applications/Xcode.app/Contents/Developer`. CI фиксирует свою версию отдельно; наличие нового локального SDK не доказывает проверку тем же инструментарием в CI.

## Команды

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  python3 scripts/build_ios.py --target simulator \
  --output artifacts/bukva-za-bukvoy-ios-simulator.zip

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  python3 scripts/build_ios.py --target device-unsigned \
  --output artifacts/bukva-za-bukvoy-ios-device-unsigned.zip
```

По умолчанию Simulator собирается для `arm64` и `x86_64`. Фактически полученные срезы проверяются через `lipo` и записываются в metadata. Для узкой локальной проверки предусмотрен `--simulator-archs native`. Сборка для устройства всегда `arm64`.

Внутри каждого ZIP находятся `BukvaZaBukvoy.app` и `metadata.json`. Рядом с ZIP записывается JSON с SHA-256 архива, хешами исходников, версией Xcode и архитектурами. Simulator ZIP предназначен только для симулятора на Mac. Device-unsigned ZIP проверяет компиляцию, но **не устанавливается на iPhone**: подпись требует отдельного сценария владельца устройства.

Промежуточные продукты:

- `.work/ios-build/simulator/Build/Products/Debug-iphonesimulator/BukvaZaBukvoy.app`;
- `.work/ios-build/device/Build/Products/Release-iphoneos/BukvaZaBukvoy.app`.

SDK, Simulator runtimes и DerivedData не добавляются в Git. Личные Xcode-настройки игнорируются, `project.pbxproj` и общая схема сохраняются в репозитории.

## Автономный WWW

`ios/prepare_web.py` поддерживает только текущую явную структуру пяти именованных модулей. Он замыкает каждый модуль в отдельную функцию, связывает именованные импорты и встраивает полный `game/data/words.json` в единственную транспортную точку загрузки словаря. `validateContent` остаётся тем же. Классический JS не требует CORS-загрузки ES modules или `fetch` из локального файла.

Неподдерживаемые импорты, экспорты, изменение контракта загрузки JSON или HTML приводят к явной ошибке сборки. Упаковщик не пытается угадать новую структуру и не подменяет полный словарь запасным. Он проверяет хеши канонической игры до и после подготовки. Выход можно заменять только в каталоге `WWW` с маркером собственного генератора.

В сгенерированном HTML `connect-src` установлен в `none`. Дополнительный системный content blocker запрещает HTTP(S) и WebSocket. WebView получает доступ только к `WWW`, использует `WKWebsiteDataStore.nonPersistent`, блокирует внешние переходы и новые окна. Приватные KVC-настройки WebKit не используются.

## Мост и жизненный цикл

Обрабатываются только пять событий контракта хакатона. Сообщение принимается только от текущей WebView, главного фрейма и ожидаемого локального `index.html`. Типы и размеры полей проверяются. `COMPLETED_EVENT` учитывается один раз за открытие.

Картинка отправляется системным `UIActivityViewController`: PNG data URL, до 2 МБ, сторона до 4096 пикселей и площадь до 4 194 304 пикселей. До декодирования проверяются сигнатура PNG и IHDR. Произвольные файлы и URL не принимаются; для iPad задан якорь popover. Если картинки нет, отправляется текст до 500 знаков. Приложение не читает контакты и не сохраняет результат в Фото.

`CLOSE_EVENT` уничтожает прежнюю WebView и её состояние и показывает спокойный экран с кнопкой «Начать снова». Повторное открытие создаёт новую непостоянную WebView и новый gate завершения. Программный выход через `exit` не используется. Поворот меняет размер той же WebView и сохраняет текущий раунд.

## Проверки

Быстрая проверка упаковщика:

```sh
python3 -m unittest discover -s tests -p 'test_ios_*.py'
```

Она проверяет полный контент без сети, синтаксис сгенерированного JS, неизменность `game/`, отказ при неподдерживаемом модульном синтаксисе и защиту существующего выходного каталога. Для тестов используется Node из инструментов репозитория; для обычного Run в Xcode Node не нужен.

Финальные сборки на рабочем Mac выполняются через общий helper владельца с `--resource heavy`, затем receipt проверяется на том же HEAD. Сборка и установка в Simulator не заменяют UI-проверку. Названия реально проверенных runtime, сценарии, SHA-256 и оставшиеся пробелы фиксируются в отдельном evidence; работа на физическом iPhone и TestFlight не заявляется без фактической проверки.

## Источники

- [Apple: локальные файлы в WKWebView](https://developer.apple.com/documentation/webkit/wkwebview/loadfileurl(_:allowingreadaccessto:)).
- [Apple: WKURLSchemeHandler для схем, которые WebKit не обслуживает сам](https://developer.apple.com/documentation/webkit/wkurlschemehandler).
- [Apple: загрузка компонентов Xcode и Simulator runtimes](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components).
