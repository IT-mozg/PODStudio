# POD Studio

Локальний веб-інструмент для дослідження референсних дизайнів футболок і
генерації нових, оригінальних дизайнів на їх основі за допомогою AI
(OpenAI `images.edit`).

## Що це робить

1. Ти переглядаєш лістинги (назва, картинка) з обраного джерела даних.
2. Вибираєш ті, що подобаються за темою/стилем, і редагуєш заготовлений
   промпт для кожного.
3. Застосунок генерує новий, оригінальний дизайн, натхненний темою і
   стилем референсу, але не копію 1:1.
4. Результати, історія генерацій і орієнтовні витрати ведуться локально.

## Запуск

```bash
pip3 install flask openai beautifulsoup4 pillow
python3 app.py
```

Відкриється `http://127.0.0.1:8765`.

У Налаштуваннях (іконка шестерні) потрібно вказати:
- OpenAI API-ключ (для генерації);
- Etsy API Keystring і Shared Secret (developers.etsy.com → твій застосунок
  → Dashboard) - для живого пошуку лістингів.
- Опційно - актуальний credit balance зі свого
  `platform.openai.com/settings/organization/billing`, щоб бачити
  орієнтовний залишок (OpenAI не дає цю цифру через звичайний API-ключ,
  тому це не автоматично, а вручну).

## Звідки беруться лістинги

Джерело даних - окрема абстракція (`models/listing_source.py`,
`ListingSource`), тож спосіб отримання лістингів можна замінити чи додати,
не чіпаючи решту коду (контролери, чергу генерації, історію). Застосунок
підтримує **два джерела одночасно** і перемикається між ними прямо в UI
(вкладки "Пошук на Etsy" / "Збережені сторінки" над стрічкою пошуку) -
дивись `models/listing_source_registry.py` (`CompositeListingSource`)
нижче.

### Пошук на Etsy: офіційний Etsy Open API v3

`models/etsy_api_listing_source.py` (`EtsyApiListingSource`) - живий пошук
через документований `https://openapi.etsy.com/v3/application`, без
жодного парсингу HTML чи автоматизації браузера. Вводиш запит у полі
пошуку на вкладці "Лістинги" - і сторінки по 78 товарів підвантажуються
напряму з Etsy. Перевірено проти реального "Personal Access" ключа; кілька
речей, яких нема в документації, задокументовано в докстрінзі файлу
(формат заголовка авторизації, звідки брати картинки, HTML-entities в
заголовках).

Ліміт особистого доступу - 5 запитів/сек, 5000/день. Один "показ сторінки"
= 2 виклики API (пошук ids + один batch-виклик за картинками для всіх 78
одразу), тож цього більш ніж достатньо для особистого використання.
Глибина гортання сторінок навмисно обмежена 40 сторінками
(`EtsyApiListingSource.MAX_PAGES`) - без цього для популярних запитів
довелось би малювати десятки тисяч кнопок пагінації.

Офіційний API не дає оцінок продажів/виручки конкурента (Etsy принципово
не ділиться цим навіть через API) - тільки те, що й так публічно видно на
сторінці лістингу (назва, ціна, теги, картинки, магазин).

### Збережені сторінки: ручний імпорт

`HtmlPageListingSource` (у `models/listing_source.py`) парсить
`.html`-файли з `pages/`, які користувач сам зберігає через браузер
(Chrome: `Cmd+S` → «Веб-сторінка повністю») і перетягує у drop-зону на
вкладці "Збережені сторінки". Корисно, якщо треба переглянути щось, чого
живий пошук не покаже (наприклад чужий магазин цілком, або "обране"), або
якщо API тимчасово недоступний.

Цей варіант свідомо існував до отримання API-ключа: пряме звернення до
`etsy.com/search` (без справжнього браузера) миттєво впирається в
DataDome-захист Etsy, а живий автоматизований браузер (Playwright) виявився
надто нестабільним (капчі, рейт-ліміти) і був прибраний з кодової бази.

### CompositeListingSource - перемикач джерел

`models/listing_source_registry.py` тримає обидва джерела і делегує кожен
виклик активному - контролери й черга генерації працюють з одним
`container.listing_source` і не знають, яке джерело зараз активне.
`GET/POST /api/sources` перемикає активне джерело; `search()` (тільки в
Etsy-джерела) повертає зрозумілу помилку, якщо викликати його поки активне
"Збережені сторінки". Додати третє джерело (інший маркетплейс, CSV-імпорт,
...) - написати ще один клас `ListingSource` і зареєструвати його в
`container.py`, без змін контролерів.

## Архітектура: MVC

```
app.py               entry point - creates the Flask app, registers controllers
container.py          composition root - wires concrete Model implementations together
models/               domain logic and data
  listing_source.py          ListingSource, HtmlPageListingSource, Listing/ListingPage
  etsy_api_listing_source.py EtsyApiListingSource - live Etsy search, see above
  listing_source_registry.py CompositeListingSource - switches between the two
  design_generator.py        DesignGenerator, OpenAIDesignGenerator
  generation_queue.py        GenerationQueue - queueing, retries, per-lid dedup
  history_store.py           HistoryStore - history.json persistence
  generate_designs.py        low-level utilities (HTML parsing, reference
                             images, shirt background) + a standalone CLI
controllers/          Flask blueprints - HTTP requests in, calls into models,
                       a view (JSON or a template) out
  pages_controller.py         "/" and static file directories (refs/, output/)
  listings_controller.py      source switching, searching, browsing listing pages
  generation_controller.py    the generation queue and prompt drafts
  history_controller.py       the generation history list
  settings_controller.py      settings, balance tracking, misc actions
views/                templates and static assets
  templates/index.html
  static/style.css
  static/js/                 ES modules (native <script type="module">, no
                             build step) - one concern per file, imported by
                             main.js:
    core.js                    $, state, toast(), api(), esc() - shared by all
    imageModal.js               fullscreen image preview (results/history/regen)
    listings.js                 pagination, card rendering, selection
    sourceControl.js            source-switch tabs, search bar, drop-zone/upload
    regen.js                     regeneration modal
    generate.js                  cost calc, generate modal, job polling, results
    history.js                   history tab
    settings.js                  settings modal
    main.js                      tabs, modal-close wiring, bootstrap
```

Кожен `Model` — окрема абстракція (інтерфейс + конкретна реалізація), тож
підміна (наприклад `HtmlPageListingSource` → `EtsyApiListingSource`)
робиться зміною одного рядка в `container.py`, без змін у `controllers/`
чи `views/`.

## Що не потрапляє в git

Дивись `.gitignore` - коротко: API-ключ і баланс (`ui_config.json`),
особиста історія генерацій (`history.json`), збережені сторінки Etsy і
завантажені референс-картинки конкурентів (`pages/`, `refs/`),
згенеровані результати (`output/`).
