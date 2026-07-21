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

У Налаштуваннях (іконка шестерні) потрібно вказати OpenAI API-ключ.
Опційно - актуальний credit balance зі свого `platform.openai.com/settings/organization/billing`,
щоб бачити орієнтовний залишок (OpenAI не дає цю цифру через звичайний API-ключ,
тому це не автоматично, а вручну).

## Звідки беруться лістинги

Джерело даних - окрема абстракція (`models/listing_source.py`,
`ListingSource`), тож спосіб отримання лістингів можна замінити, не
чіпаючи решту коду (контролери, чергу генерації, історію).

### Сьогодні: ручний імпорт збережених сторінок

`HtmlPageListingSource` парсить `.html`-файли з `pages/`, які ти сам
зберігаєш через браузер (Chrome: `Cmd+S` → «Веб-сторінка повністю») -
сторінка пошуку Etsy, магазину чи обраного. **Жодних автоматичних запитів
до Etsy застосунок не робить** - тільки парсинг файлів, які вже лежать
у тебе на диску після звичайного перегляду в браузері.

Свідомо не використовується live-скрапінг: пряме звернення до
`etsy.com/search` (без справжнього браузера) миттєво впирається в
DataDome-захист Etsy. Автоматизований браузер (Playwright) теж
випробовувався, але виявився надто нестабільним (капчі, рейт-ліміти) і
був прибраний з кодової бази.

### Плановане: офіційний Etsy Open API v3

`models/etsy_api_listing_source.py` - заготовка під `EtsyApiListingSource`,
реалізує той самий інтерфейс `ListingSource`, але через документований
`https://openapi.etsy.com/v3/application` замість парсингу HTML. **Ще не
підключено в `container.py`** і не перевірено проти реального ключа -
заявку на API щойно подано. Коли прийде ключ:

1. Прогнати smoke-тест (`list_pages()`/`get_page()` на пару запитів),
   поправити мапінг полів, якщо формат відповіді відрізняється.
2. У `container.py` замінити рядок композиції:

   ```python
   listing_source = HtmlPageListingSource(engine.PAGES_DIR, parser=engine.parse_page)
   ```

   на:

   ```python
   listing_source = EtsyApiListingSource(api_key=..., keywords="...")
   ```

Офіційний API не дає оцінок продажів/виручки конкурента (Etsy принципово
не ділиться цим навіть через API) - тільки те, що й так публічно видно на
сторінці лістингу (назва, ціна, теги, картинки, магазин).

## Архітектура: MVC

```
app.py               entry point - creates the Flask app, registers controllers
container.py          composition root - wires concrete Model implementations together
models/               domain logic and data
  listing_source.py          ListingSource, HtmlPageListingSource, Listing/ListingPage
  etsy_api_listing_source.py EtsyApiListingSource (draft, see above)
  design_generator.py        DesignGenerator, OpenAIDesignGenerator
  generation_queue.py        GenerationQueue - queueing, retries, per-lid dedup
  history_store.py           HistoryStore - history.json persistence
  generate_designs.py        low-level utilities (HTML parsing, reference
                             images, shirt background) + a standalone CLI
controllers/          Flask blueprints - HTTP requests in, calls into models,
                       a view (JSON or a template) out
  pages_controller.py         "/" and static file directories (refs/, output/)
  listings_controller.py      browsing imported listing pages
  generation_controller.py    the generation queue and prompt drafts
  history_controller.py       the generation history list
  settings_controller.py      settings, balance tracking, misc actions
views/                templates and static assets
  templates/index.html
  static/app.js, static/style.css
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
