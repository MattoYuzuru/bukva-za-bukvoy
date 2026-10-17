# Запуск на iPhone и в симуляторе

Есть два самостоятельных пути проверки iOS: симулятор на Mac и подписанный запуск на настоящем iPhone. Бесплатного Apple Account достаточно для установки своей разработки через Xcode на личное устройство. Публиковать такую сборку всем участникам через TestFlight можно после подключения издателем Apple Developer Program и App Store Connect. Тестировщикам собственная платная подписка не нужна. [Apple: Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account), [Apple: TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

Автономная iOS-оболочка содержит те же игровые материалы и нужна для удобной проверки. Для защиты хакатона остаётся обязательным запуск в неизменённой официальной песочнице организаторов на реальном телефоне.

## Какой сценарий доступен

| Что есть у участника | Способ | Нужна ли платная подписка участнику | Что проверяет |
| --- | --- | --- | --- |
| Mac и iPhone | Исходники, Xcode, своя бесплатная Personal Team | Нет | Настоящее устройство с личной подписью |
| Mac без iPhone | Исходники или готовая совместимая сборка, iOS Simulator | Нет | Симулятор, без подтверждения поведения телефона |
| iPhone без Mac | TestFlight по приглашению, когда издатель подготовит сборку | Нет; издателю нужна Developer Program | Настоящий iPhone, без сборки на компьютере тестировщика |
| Нет Mac и iPhone | Веб-игра в браузере либо Android APK на Android | Нет | Игру, но не iOS-контейнер |

iOS Simulator входит в Xcode и работает на Mac. Он не воспроизводит все особенности физического устройства. Сборка для симулятора и неподписанный архив устройства не устанавливаются на iPhone простым открытием файла. Для установки на устройство необходим подходящий подписанный продукт и разрешённый Apple способ доставки. [Apple: запуск на симуляторе и устройстве](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices), [Apple: распространение на зарегистрированные устройства](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices).

## Подготовка исходников на Mac

Нужен полный Xcode с iOS SDK. Командные проверки репозитория используют Python 3.12 или новее и Node 24. Обычный Run в Xcode сам готовит игровые ресурсы через `ios/prepare_web.py`, используя системный Python 3, без Node и предварительного запуска `build_ios.py`. На первом запуске Xcode завершите его штатную настройку и установите нужный runtime симулятора. Точный проверенный набор SDK и ограничения локальной сборки фиксируются в [Сборка iOS.md](Сборка%20iOS.md).

```sh
mkdir -p "$HOME/Projects"
cd "$HOME/Projects"
git clone https://github.com/MattoYuzuru/bukva-za-bukvoy.git
cd bukva-za-bukvoy
```

Пока iOS находится в отдельной ветке разработки, выполните `git switch feat/ios`. После её слияния iOS будет доступен в основной ветке. Если репозиторий закрыт, клонирование требует доступа к нему через вашу учётную запись GitHub.

Проверить выбранные инструменты можно без смены глобальных настроек:

```sh
xcodebuild -version
python3 --version
node --version
```

Если выбран только Command Line Tools, укажите полный Xcode для одной команды: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. Это не переключает Xcode для других проектов.

## Mac без iPhone: симулятор

Команда сборки не требует Apple Account, сертификата или платного членства:

```sh
python3 scripts/build_ios.py --target simulator --output artifacts/bukva-za-bukvoy-ios-simulator.zip
```

ZIP содержит `.app` и метаинформацию сборки. По умолчанию скрипт запрашивает universal-приложение с архитектурами **arm64 и x86_64** и проверяет их фактическое наличие через `lipo`. Такая симуляторная сборка рассчитана на Mac с Apple Silicon и Intel при совместимых Xcode и runtime. Это не гарантия поддержки любого старого Mac. Если SDK не позволяет universal-сборку, команда завершится ошибкой. Для своей архитектуры можно явно передать `--simulator-archs native`; назначение конкретного ZIP проверяйте по `architectures` в метаинформации. Не следует переименовывать симуляторную сборку в IPA или отправлять её владельцу iPhone как установщик.

Самый понятный запуск из исходников: открыть `ios/BukvaZaBukvoy.xcodeproj`, выбрать схему `BukvaZaBukvoy`, затем доступный симулятор iPhone и Product > Run. Подробности подготовки игровых ресурсов и команды установки готового `.app` приведены в [Сборка iOS.md](Сборка%20iOS.md). [Apple: запуск приложения](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices).

Короткая команда для ИИ-помощника или воспроизведения сборки — именно `python3 scripts/build_ios.py --target simulator --output artifacts/bukva-za-bukvoy-ios-simulator.zip`. Она вызывает репозиторный скрипт, без создания учётных записей и изменения глобального Xcode.

## Mac и iPhone: бесплатная Personal Team

1. Откройте `ios/BukvaZaBukvoy.xcodeproj` и выберите схему `BukvaZaBukvoy`.
2. В Xcode > Settings > Apple Accounts добавьте собственный Apple Account. Пароль вводится в Xcode и не сохраняется в репозитории.
3. В target приложения откройте Signing & Capabilities, включите Automatically manage signing и выберите свою Personal Team. Если Xcode сообщает, что идентификатор приложения занят, задайте собственный уникальный Bundle Identifier для личной сборки. Эти локальные настройки подписи не нужно коммитить другим участникам.
4. Подключите разблокированный iPhone к Mac, подтвердите доверие компьютеру и выберите этот iPhone как Run Destination. На iOS 16 и новее включите Developer Mode, когда Xcode и устройство предложат это сделать.
5. Нажмите Run. Xcode создаст необходимые материалы разработки и установит подписанную сборку. Если устройство требует подтвердить доверие разработчику, выполните показанные им инструкции.

Apple ограничивает бесплатную Personal Team: профиль установки действует **7 дней**, после чего приложение нужно пересобрать и установить заново. Доступны до трёх установленных приложений на устройстве. Это путь личного тестирования, который не превращает неподписанный ZIP из CI в общедоступный установщик. [Apple: ограничения Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account), [Apple: подпись в Xcode](https://help.apple.com/xcode/mac/current/en.lproj/dev60b6fbbc7.html), [Apple: запуск на устройстве](https://help.apple.com/xcode/mac/current/en.lproj/dev5a825a1ca.html), [Apple: Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device/).

## iPhone без Mac: TestFlight

Тестировщик устанавливает бесплатный TestFlight из App Store, принимает приглашение или открывает ссылку издателя и устанавливает бета-версию. Для тестирования не нужны собственный Mac, Xcode или платная Developer Program. На момент подготовки этой инструкции проект не создавал приглашение TestFlight. [Apple: получение тестовой сборки](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

Для этого пути **один издатель** должен подключить подходящую команду Apple Developer Program, создать запись приложения в App Store Connect, подписать и загрузить сборку, затем пригласить тестировщиков. Обычная стоимость программы — 99 USD за год членства либо местная цена, где она доступна; возможные льготы описывает Apple. Для внешних тестировщиков первая сборка проходит Beta App Review, поэтому мгновенную раздачу обещать нельзя. Тестовая сборка доступна до **90 дней**. [Apple: членство](https://developer.apple.com/programs/whats-included/), [Apple: TestFlight и проверка бета-версии](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

Проект не оформляет членство, не создаёт сертификаты, ключи или App Store Connect secrets и не публикует TestFlight автоматически. Это отдельный следующий шаг владельца команды после настройки издательского аккаунта.

## Что создаёт GitHub Actions

Workflow [ios.yml](../.github/workflows/ios.yml) запускается для затрагивающего iOS pull request, при изменениях в основной ветке и вручную. Он использует стандартный `macos-15` arm64 и явно выбирает Xcode 26.3. Эта версия есть в опубликованном составе образа. Ярлык `macos-latest` не используется, чтобы переход GitHub на другую ОС не сменил toolchain незаметно. [GitHub: доступные runner-образы](https://github.com/actions/runner-images), [состав macOS 15 arm64](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md).

Если точного пути Xcode нет, workflow проверяет альтернативные пути **с той же версией**. Если нужной версии больше нет, он завершится с понятной ошибкой и списком установленных Xcode. Другую версию можно выбрать только явно в Actions > Сборки iOS без подписи > Run workflow > xcode_version. В журнале сохраняются фактические Xcode, SDK и архитектура.

| Артефакт | Содержание | Можно установить на iPhone |
| --- | --- | --- |
| `bukva-ios-simulator-<коммит>-<попытка>` | ZIP с `.app` для симулятора Mac и метаинформацией | Нет |
| `bukva-ios-device-unsigned-<коммит>-<попытка>` | `device-unsigned.zip`, **не устанавливаемый архив** с неподписанным продуктом устройства | Нет |

Скачанный артефакт Actions содержит сборочный ZIP: распакуйте его до `.app` и метаинформации. Артефакты хранятся 14 дней. Workflow не запускает симулятор, не проверяет физический iPhone и не подтверждает работу на минимальной iOS 15. Успешная компиляция означает только успешную сборку соответствующей цели.

Для публичного репозитория стандартные runner бесплатны. В закрытом репозитории используются включённые в тариф минуты, а после их исчерпания действуют правила тарифа. Хранилище артефактов также имеет лимиты. [GitHub: runner и стоимость](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [GitHub: расчёт использования Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Подпись и выгрузка в TestFlight сейчас отсутствуют в CI. Поэтому у pull request нет доступа к Apple credentials. Будущий выпуск следует делать отдельным ручным workflow из защищённой ветки и environment после явной настройки команды, подписи и App Store Connect.

## Источники и статус

Официальные материалы Apple и GitHub проверены 17 октября 2026. Ссылки стоят рядом с соответствующими условиями. Фактические локальные сборки и запуски фиксируются отдельно в [Проверки.md](Проверки.md) и [Сборка iOS.md](Сборка%20iOS.md). Успех в браузере, Android или iOS Simulator не заменяет проверку на iPhone.
