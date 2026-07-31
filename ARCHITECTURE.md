# ARCHITECTURE.md — ADR-001: шари та правило напрямку залежностей

> **СТАТУС: ЦІЛЬОВА СТРУКТУРА, НЕ РЕАЛІЗОВАНА.**
>
> Тек `domain/`, `application/`, `infrastructure/`, `interfaces/`,
> `composition/` у репозиторії **немає**. Наявна структура — `models/`,
> `controllers/`, `container.py`, `app.py` — лишається чинною, і мапа
> «Where to look, by topic» у `CLAUDE.md` веде саме по ній.
>
> Кожен рядок таблиці нижче має колонку «поточний шлях» — шукай файл за нею.
> Переїзд змінює також **імена файлів** (див. §5): жодне з цільових імен у
> репозиторії сьогодні не існує, тому шукати за ними марно.
>
> Ухвалено: 2026-07-31 (#118). Переїзд: #119, #124, #125. Цей документ стає
> описом наявного стану лише після закриття #125 — доти цей блок не знімати.

---

## 1. Контекст

`container.py` розрісся до 437 рядків і виконує щонайменше чотири різні
роботи: проводку синглтонів, сховище конфігу, доменні обчислення й
серіалізацію payload-ів. `models/` тримає в одній теці чисті сутності,
HTTP-клієнти, обгортки над PIL і CLI. Наслідок не косметичний: щоб
зрозуміти, що станеться при зміні одного модуля, доводиться читати всі —
а бюджет читання в цьому проєкті жорсткий (6 файлів на тікет).

Цей ADR фіксує **цільові межі й правило напрямку**. Коду він не переносить.

## 2. Рішення: п'ять шарів

```
domain/          сутності + порти (ABC). Не імпортує НІЧОГО:
                 ні з проєкту, ні flask/json/urllib/PIL/openai.
                 Дозволено лише stdlib без I/O: dataclasses, typing,
                 abc, enum, decimal, re, statistics.

application/     use-cases: оркестрація. Знає domain. Не знає, що
                 по той бік порту — HTTP, файл чи OpenAI.

infrastructure/  адаптери, що реалізують порти domain:
                 etsy/  openai/  storage/  fx/  imaging/  shared/

interfaces/      входи в систему: http/ (Flask-блупринти +
                 серіалізатори payload) і cli/.

composition/     проводка. Ліниві фабрики, ~60 рядків. Єдине місце,
                 що знає конкретні класи.
```

Більше шарів не додавати. П'яти достатньо; шар «про запас» — це тека,
яка роками стоїть з одним файлом і збиває пошук.

## 3. Правило напрямку залежностей

```
   interfaces ──────▶ application ──────▶ domain ◀────── infrastructure
        │                                   ▲                  │
        └───────────────────────────────────┘                  │
                  (дозволено: читати сутності)                  │
                                                                │
   composition ──▶ усе (це його робота)                         │
        └───────────────────────────────────────────────────────┘
```

Формально, як пари «хто → кого дозволено імпортувати»:

| Шар | Дозволено імпортувати |
|---|---|
| `domain/` | **нічого з проєкту** + stdlib без I/O |
| `application/` | `domain/` |
| `infrastructure/` | `domain/` |
| `interfaces/` | `application/`, `domain/` |
| `composition/` | усі шари |

Усе, чого немає в цій таблиці, — порушення. Зокрема заборонено:
`domain/` → будь-що; `application/` → `infrastructure/` (тільки через порт);
`infrastructure/` → `application/` або `interfaces/`;
`interfaces/` → `infrastructure/` (конкретний адаптер приходить із
`composition/` через конструктор або параметр за замовчуванням).

**`interfaces/` → `composition/` теж заборонено**, і це найважливіший
пункт для переїзду: сьогодні всі сім контролерів роблять `import container`
і беруть інстанси з модульного рівня. У цільовій структурі напрямок
обертається — `composition/` тримає фабрику Flask-застосунку, яка створює
блупринти й передає їм готові інстанси (`create_listings_bp(listing_source,
serializer)`). Контролер більше нічого не імпортує, і саме це робить його
тестованим без запуску всієї проводки.

`app.py` для цілей цього правила належить до `composition/`: він точка
входу і йому дозволено все. `views/` — не Python-шар, під правило не
підпадає. `tests/` виняток, див. таблицю §6.

Одне уточнення, без якого правило читається строгіше, ніж є: залежність,
що приходить **параметром** (`Callable`, інстанс порту), імпортом не є і
правила не порушує. Заборонений саме `import`. Див. §4.

### Що вважається порушенням

Рівно одне: **statement `import` або `from ... import` у файлі шару X, що
вказує на модуль шару Y, якого немає в рядку X таблиці вище.** Не «дух
архітектури», не назви змінних, не «схоже на витік абстракції» — тільки
імпорт. Це навмисно вузьке визначення: правило, про яке можна сперечатися,
не є правилом.

Локальний імпорт усередині функції (`def f(): from PIL import Image`)
рахується так само, як імпорт на рівні модуля. Ховати залежність у тіло
функції — не спосіб її позбутися.

### Чим ловиться

`tests/test_layer_boundaries.py` — pytest, що обходить AST кожного `.py`
у шарових теках і перевіряє таблицю. З'являється в **#125**.

Тест, а не `import-linter`: інструмент дав би те саме, але ціною нової
залежності в `requirements.txt` + `requirements.lock` (а лок звіряє CI —
`scripts/check_requirements_lock.py`), тоді як обхід AST тут — це
~40 рядків stdlib. У цьому проєкті `tests/` уже виконує роль
виконуваної специфікації («Trust the tests as the spec» у `CLAUDE.md`) —
межі шарів лягають туди природно.

### Що робити до #125

Правило діє з моменту ухвалення цього ADR, автоматичної перевірки немає.
Тому кожен тікет, що додає файл у шарову теку, перевіряє його імпорти
вручну — і `/preflight` про це нагадує. Це слабше за тест і саме тому
#125 не варто відкладати надовго.

### Винятки

**Джерело істини — список винятків усередині `tests/test_layer_boundaries.py`,
а не цей документ.** Дублювати його тут означало б завести два списки, які
розійдуться на третьому тікеті.

Процедура: виняток додається в тест разом із коментарем, що містить
(а) причину і (б) номер тікета, який його знімає. Виняток без тікета не
приймається — це вже не виняток, а тиха зміна правила. До #125, поки тесту
немає, виняток фіксується коментарем `# LAYER-EXCEPTION: <причина> (#NNN)`
у місці порушення, і #125 збирає їх у список.

## 4. Порт — не завжди ABC

Перед таблицями одне уточнення, без якого вони читаються неправильно і
дають удвічі більше файлів, ніж треба.

**Порт — це форма залежності в сигнатурі, а не обов'язково клас.** Дві
форми, обидві законні:

| Форма | Коли | Приклад, що вже працює |
|---|---|---|
| **ABC у `domain/ports/`** | кілька методів + реально можлива друга реалізація | `ListingSource`, `ShopSource` |
| **`Callable` у параметрі** | одна операція, друга реалізація не планується | `FxRates(fetcher=…)`, `EtsyApiListingSource(api_key_provider=…)` |

Друга форма так само задовольняє правило §3: якщо `application/` приймає
`to_usd: Callable[[float, str], float | None]` параметром, то **імпорту
`infrastructure/` немає — отже, немає й порушення**. Конкретну функцію
підставляє `composition/`.

Тому портів-класів тут рівно три: `ListingSource`, `ShopSource`,
`DesignGenerator`. Для `HistoryStore`, `TrackedStore`, `FxRates` і
`imaging/` ABC **не заводимо** — у кожного ніколи не буде другої
реалізації, а `tests/` уже підставляє справжній клас із тимчасовим
шляхом і цього достатньо. ABC там був би файлом, індирекцією і зайвим
кроком у кожному читанні коду.

## 5. Перейменування файлів

Переїзд змінює не лише теки. Принцип: **тека вже несе префікс, тому з
імені файлу він знімається** — `infrastructure/etsy/etsy_api_client.py`
читалося б як заїкання.

| Було | Стало | Причина |
|---|---|---|
| `models/etsy_api_client.py` | `infrastructure/etsy/api_client.py` | префікс у теці |
| `models/etsy_api_listing_source.py` | `infrastructure/etsy/listing_source.py` | те саме |
| `models/etsy_api_shop_source.py` | `infrastructure/etsy/shop_source.py` | те саме |
| `models/etsy_taxonomy.py` | `infrastructure/etsy/taxonomy.py` | те саме |
| `controllers/listings_controller.py` | `interfaces/http/listings.py` | суфікс `_controller` дублює `http/` |
| `controllers/shops_controller.py` | `interfaces/http/shops.py` | те саме |
| `controllers/generation_controller.py` | `interfaces/http/generation.py` | те саме |
| `controllers/editing_controller.py` | `interfaces/http/editing.py` | те саме |
| `controllers/history_controller.py` | `interfaces/http/history.py` | те саме |
| `controllers/settings_controller.py` | `interfaces/http/settings.py` | те саме |
| `controllers/pages_controller.py` | `interfaces/http/pages.py` | те саме |
| `models/generate_designs.py` | розпадається на 7 адрес | див. §7 |
| `container.py` | розпадається на 9 адрес | див. §8 |

**Колізія імен, яку треба помітити заздалегідь:** після перейменування
з'являються три пари однойменних модулів у різних теках —
`domain/ports/listing_source.py` / `infrastructure/etsy/listing_source.py`,
те саме для `shop_source.py`, і `domain/ports/design_generator.py` /
`infrastructure/openai/design_generator.py`. Це навмисно: порт і його
реалізація мають зватися однаково. Але **імпортувати їх треба повним
шляхом** (`from domain.ports.listing_source import ListingSource`), ніколи
не `from listing_source import …`.

## 6. Розкладка: наявні модулі → цільові файли

### `models/`

| Поточний шлях | Цільовий файл | Нотатка |
|---|---|---|
| `models/listing_source.py` | `domain/entities/listing.py` + `domain/ports/listing_source.py` | Розділити: dataclass `Listing` → entities; ABC `ListingSource` **і новий `ListingSourceError`** → ports (див. §9.3) |
| `models/shop_source.py` | `domain/entities/shop.py` + `domain/ports/shop_source.py` | `Shop`, `SalesHistory`, місячні записи → entities; ABC → ports |
| `models/conversion_rate.py` | `domain/services/conversion_rate.py` | Чисті функції над ціною. Переїжджає як є |
| `models/etsy_api_client.py` | `infrastructure/etsy/api_client.py` | HTTP-транспорт, ретраї, rate limit |
| `models/etsy_api_listing_source.py` | `infrastructure/etsy/listing_source.py` | Реалізація порту |
| `models/etsy_api_shop_source.py` | `infrastructure/etsy/shop_source.py` | Реалізація порту |
| `models/etsy_taxonomy.py` | `infrastructure/etsy/taxonomy.py` | Довідник Etsy, не порт |
| `models/fx_rates.py` | `infrastructure/fx/fx_rates.py` | **Без ABC-порту** (§4). Споживачі беруть `to_usd` як `Callable` |
| `models/design_generator.py` | `infrastructure/openai/design_generator.py` | Реалізація; ABC → `domain/ports/design_generator.py` |
| `models/json_store.py` | `infrastructure/storage/json_store.py` | Атомарний запис. Примітив, не домен |
| `models/history_store.py` | `infrastructure/storage/history_store.py` | **Без ABC-порту** (§4) |
| `models/tracked_store.py` | `infrastructure/storage/tracked_store.py` | **Без ABC-порту**; два інстанси лишаються двома |
| `models/halftone.py` | `infrastructure/imaging/halftone.py` | Обгортка над PIL |
| `models/background_removal.py` | `infrastructure/imaging/background_removal.py` | Обгортка над PIL |
| `models/upscale.py` | `infrastructure/imaging/upscale.py` | Запуск зовнішнього бінарника |
| `models/lru.py` | `infrastructure/shared/lru.py` | **Не домен.** LRU нічого не знає про Etsy чи POD — це generic-структура, яку вживають лише Etsy-джерела |
| `models/generation_queue.py` | `application/generation/queue.py` | Оркестрація: черга, ретраї, дедуп, session token. `ReferenceResolver` лишається `Callable`-портом |
| `models/generate_designs.py` | **7 адрес** | Див. §7 — це не один модуль |

### `controllers/` і корінь

| Поточний шлях | Цільовий файл | Нотатка |
|---|---|---|
| `controllers/listings_controller.py` | `interfaces/http/listings.py` | Ловить `ListingSourceError`, не `EtsyApiError` (§9.3) |
| `controllers/shops_controller.py` | `interfaces/http/shops.py` | те саме |
| `controllers/generation_controller.py` | `interfaces/http/generation.py` | |
| `controllers/editing_controller.py` | `interfaces/http/editing.py` | PIL і `imaging/` більше не імпортує — див. §9.2 |
| `controllers/history_controller.py` | `interfaces/http/history.py` | |
| `controllers/settings_controller.py` | `interfaces/http/settings.py` | |
| `controllers/pages_controller.py` | `interfaces/http/pages.py` | Віддає `design/dist` і `/old` — суто транспорт |
| `views/` | `views/` — не змінюється | Шаблони й статика `/old`. Не Python, під правило §3 не підпадає |
| `app.py` | `app.py` (≈5 рядків) + `composition/app_factory.py` | Лишається точкою входу, але тільки викликає `create_app()`. Реєстрація блупринтів переїжджає у фабрику |
| `container.py` | **9 адрес** | Див. §8 |
| `tests/` | `tests/` — поза шарами | Тестам дозволено імпортувати будь-що — інакше їх неможливо писати |

## 7. `models/generate_designs.py` (394 рядки) → 7 адрес

Прочитано в межах #118. Файл виглядає як «CLI-скрипт», але живий
застосунок імпортує з нього константи й три функції, тому просто винести
його в `interfaces/cli/` не можна.

| Частина | Рядки | Цільовий файл | Нотатка |
|---|---|---|---|
| Константи: `MODEL`, `QUALITY`, `SIZE`, `WORKERS`, `MAX_RETRIES`, `DARK_THRESHOLD`, шляхи, `API_KEY` | 40–55 | `composition/settings.py` | **Це імпортує `container.py`.** Найважливіший шматок: сьогодні налаштування всього застосунку живуть у «скрипті» |
| `PROMPT_TEMPLATE` | 56–67 | `domain/services/prompt.py` | Разом із `build_prompt`/`base_template` із `container.py` |
| `parse_page`, `collect_listings`, `largest_from_srcset` | 91–176 | `infrastructure/etsy/saved_page.py` | Парсинг збережених `.html`. Живий застосунок цим не користується — тільки CLI |
| `candidate_urls`, `get_reference`, `HEADERS`, `SSL_CTX`, `MIN_REF_WIDTH` | 70–85, 179–190, 202–230 | `infrastructure/etsy/reference_images.py` | Знання формату CDN-URL Etsy (`il_fullxfull`) + завантаження |
| `shirt_background`, `image_width` | 193–199, 233–241 | `infrastructure/imaging/shirt_background.py` | PIL |
| `title_to_filename` | 262–265 | `domain/services/filenames.py` | Чиста функція над рядком |
| `load_history`, `save_history_entry`, `history_lock` | 86, 246–259 | **видалити** | Друга, дублююча реалізація історії. Пише `history.json` через `write_text` без атомарності — рівно той патерн, який забороняє «Concurrency» у `CLAUDE.md`, і який `history_store.py` уже вирішив. CLI переходить на `HistoryStore` |
| `generate_one` | 270–288 | **видалити** | Дублює `design_generator.py`, зі своїми ретраями й `time.sleep` |
| `ask_count`, `main`, `argparse` | 291–394 | `interfaces/cli/generate_designs.py` | Власне CLI |

Два рядки «видалити» — не рефакторинг заради краси: поки вони існують,
у репозиторії два різні способи витратити гроші в OpenAI і два різні
способи записати історію, і тільки один із кожної пари має тести.

## 8. Розкладка `container.py` (437 рядків) → 9 адрес

| Блок | Рядки | ≈ рядків | Цільовий файл |
|---|---|---|---|
| Проводка синглтонів + `_on_spend` | 122–179 | 58 | `composition/wiring.py` |
| `BASE`, `os.chdir`, `mkdir`, `CONFIG_FILE` | 29–34 | 6 | `composition/settings.py` |
| `config_lock`, `load_config`, `save_config`, `update_config` | 43–72 | 30 | `infrastructure/storage/config_store.py` |
| `get_api_key`, `get_etsy_api_key`, `get_etsy_shared_secret` | 75–86 | 12 | `infrastructure/storage/config_store.py` |
| `COST` | 36–40 | 5 | `infrastructure/openai/pricing.py` — прайс вендора з ключами `gpt-image-2`; домен назв моделей не знає |
| `base_template`, `build_prompt` | 89–95 | 7 | `domain/services/prompt.py` |
| `age_months` | 192–201 | 10 | `domain/services/listing_age.py` |
| `SIMILAR_QUERY_*`, `similar_query`, `similar_query_ladder` | 204–260 | 57 | `domain/services/similar.py` |
| `ui_thumb` | 182–189 | 8 | `infrastructure/etsy/image_urls.py` — усередині `re.sub` по формату CDN-URL Etsy, це знання адаптера |
| `balance_status` | 111–119 | 9 | `application/billing/balance.py` |
| `set_balance`, `record_spend` | 98–108 | 11 | `application/billing/balance.py` |
| `effective_bg` | 263–270 | 8 | `application/listings/build_listing_view.py` |
| `listing_price_usd` | 273–284 | 12 | `application/listings/build_listing_view.py` |
| `listings_payload`, `listing_detail_payload` | 287–381 | 95 | **розділяється навпіл** — `application/listings/` + `interfaces/http/serializers/listing.py`, див. §9.1 |
| `shops_payload`, `sales_history_payload` | 384–437 | 54 | **розділяється навпіл** — `application/shops/` + `interfaces/http/serializers/shop.py`, див. §9.1 |
| Докстрінг + імпорти | 1–27 | 27 | розчиняються |

Підсумок: **проводки — близько 60 рядків із 437.** Решта — чотири різні
модулі, що опинилися поруч, і найбільший із них (149 рядків) — це не
серіалізатори, як здається з назв, а use-case-и з мережевими викликами
всередині. Див. наступну секцію.

Порядок рядків у таблиці — за блоками файлу, суми — за діапазонами;
±2 рядки на порожні межі не звірялися.

## 9. Що не проходить правило §3 сьогодні

Три місця, де живий код у цільовій структурі опиняється поза законом.
Це не причина міняти правило — це список того, що переїзд мусить
полагодити. Кожен пункт перевірено по коду, не припущено.

### 9.1. `*_payload()` роблять I/O — отже, це не серіалізатори

Найбільший блок `container.py` (149 рядків) за назвою схожий на
серіалізацію, а насправді ходить у чотири різні інфраструктури:

```
listings_payload()
  ├─ history_store.load()          ──▶ infrastructure/storage   (диск)
  ├─ tracked_store.load()          ──▶ infrastructure/storage   (диск)
  ├─ (REFS_DIR / f"{lid}.jpg").exists()  ──▶ файлова система
  └─ effective_bg(lid)             ──▶ infrastructure/imaging   (PIL + диск)

listing_detail_payload()
  ├─ усе вище
  ├─ taxonomy.path_name(…)         ──▶ infrastructure/etsy      (МЕРЕЖА)
  └─ listing_price_usd(…)          ──▶ infrastructure/fx        (МЕРЕЖА)

shops_payload()
  └─ tracked_shops_store.load()    ──▶ infrastructure/storage   (диск)
```

Правило §3 забороняє `interfaces/` → `infrastructure/`, тому покласти їх
в `interfaces/http/serializers/` неможливо.

**Рішення — розділити на два:**

```
application/listings/build_listing_view.py
    збирає дані (сховища, таксономія, FX, диск — усе через
    Callable-порти від composition/)
              │
              ▼  ListingView — dataclass у application/listings/view_models.py
              │
interfaces/http/serializers/listing.py
    ListingView ──▶ snake_case dict.  Чиста функція. Нуль I/O.
```

Виграш більший за формальну чистоту: **контракт із `design/` стає чистою
функцією, яку можна протестувати без Etsy, без диска й без мережі.**
Сьогодні перевірити форму payload-у неможливо, не піднявши пів
застосунку — саме тому звірку Python↔TS доводиться робити читанням очима
(субагент `payload-contract-checker`).

### 9.2. `editing_controller.py` не має легального шляху взагалі

```
controllers/editing_controller.py:13  from PIL import Image
controllers/editing_controller.py:18  from models.halftone import apply_sketch_halftone
controllers/editing_controller.py:19  from models.upscale import MODELS as UPSCALE_MODELS
controllers/editing_controller.py:20  from models.upscale import upscale_image
```

Три імпорти `infrastructure/imaging/` + прямий PIL у шарі `interfaces/`.
Портів над «зроби halftone з файлу» ADR навмисно не заводить (§4), тож
без правки цей контролер у цілі викликати свій код **ніяк не може**.

**Рішення:** тонкий `application/editing/edit_image.py`, який приймає
операції як `Callable` (`halftone=`, `upscale=`, `remove_background=`), а
`composition/` підставляє функції з `infrastructure/imaging/`. Контролер
викликає use-case і не імпортує ні PIL, ні imaging. ABC не потрібен —
це рівно випадок «одна операція» з таблиці §4.

### 9.3. Виняток адаптера тече в контролери

```
controllers/listings_controller.py:8  from models.etsy_api_client import EtsyApiError
controllers/shops_controller.py:12    from models.etsy_api_client import EtsyApiError
```

Контролер ловить виняток **HTTP-транспорту Etsy**. Це порушує не лише
таблицю §3, а й сенс порту: замінити джерело стає неможливо, бо роути
ловлять помилку конкретної реалізації.

**Рішення:** `ListingSourceError` у `domain/ports/listing_source.py`;
`infrastructure/etsy/api_client.py` обгортає в нього свій `EtsyApiError`.
Один клас — і `interfaces/` перестає знати, що джерело саме Etsy і саме
по HTTP.

## 10. Ціна цього рішення

Треба назвати вголос, щоб через два тікети це не стало сюрпризом.

- **Файлів стає приблизно вдвічі більше: 26 → ~50.** Кожен менший і з
  однією відповідальністю, але бюджет цього проєкту — 6 файлів на тікет,
  і мапу «Where to look, by topic» у `CLAUDE.md` доведеться переписати
  повністю (це робота #125, не наступного тікета).
- **Три пари однойменних модулів** (порт і реалізація) — див. §5.
- **Перейменування ламає всі наявні імпорти разом.** Проміжного стану, де
  працює і старе, і нове, не передбачено — переїзд робиться модуль за
  модулем із зеленим `pytest` на кожному кроці.

## 11. Чому DI-фреймворк відхилено

Розглядався `dependency-injector` (дочірні контейнери, `override()`,
`from_modules()`). Відхилено:

- **Масштаб не той.** Тут близько десяти синглтонів. Такі фреймворки
  починають окупатися ближче до 50+, коли ручна проводка перестає
  вміщатися в голову.
- **Головна перевага наявної проводки — вона читається згори вниз як
  звичайний Python.** Немає магії, немає рядкових ключів, немає окремої
  мови конфігурації. Це рівно те, що фреймворк забирає першим.
- **Ін'єкція через конструктор уже працює** там, де вона потрібна:
  `EtsyApiListingSource(api_key_provider=...)`, `FxRates(fetcher=...)`,
  `GenerationQueue(generator=..., listing_source=..., history=...)`.
  Патерн правильний — його треба **поширити на решту, а не замінити**.
- **Той самий вибір уже зроблено на фронті** й записано в `CLAUDE.md`
  для `design/`: «No DI container — unnecessary at this scale». Два
  протилежні рішення в одному репозиторії коштували б дорожче за обидва.

Тестованість, заради якої фреймворки зазвичай і беруть, тут дає
конструктор: `tests/` уже підмінює всіх колабораторів вручну, і саме тому
набір швидкий і офлайновий.

**Питання закрите.** Повертатися до нього варто, тільки якщо кількість
синглтонів у `composition/` перевалить за кілька десятків або з'явиться
потреба в кількох незалежних конфігураціях процесу.

## 12. Відношення до Clean Architecture — чесно

Попередня редакція цього ADR стверджувала, що «підручникову Clean
Architecture не беремо». Це неточність, і краще її зняти:
`domain / application / infrastructure / interfaces` — **це і є** чотири
шари Clean Architecture під тими самими іменами, з `entities/`, `ports/`,
`services/` усередині.

Відкинуто рівно дві речі, і саме їх варто називати:

1. **DTO на кожній межі.** Сутності `domain/` їздять до `application/`
   і `interfaces/` як є. Окремий тип з'являється лише там, де він щось
   вирішує — `ListingView` між `application/` і серіалізатором (§9.1),
   бо саме там формується контракт із `design/`.
2. **ABC на кожен порт.** Замість цього — `Callable` у параметрі там, де
   реалізація одна (§4).

Обидві поступки зроблені з тієї самої причини: тут ~4.5 тис. рядків
Python, один Flask і нуль баз даних (усе — JSON-файли). Повний варіант
дав би втричі більше файлів без жодної виграної властивості.

## 13. Порядок робіт: що не залежить від шарів

Три найцінніші пункти цього ADR **окупаються, навіть якщо переїзд по
теках ніколи не станеться**, і не потребують жодної нової теки:

```
     цінність
        ▲
 висока │  ① видалити дубль OpenAI + історії (§7)
        │  ② витягти налаштування з generate_designs.py (§7)
        │  ③ доменний ListingSourceError (§9.3)
        │      ───────────────────────────────────────
 середня│  ④ розділити payload → use-case + чистий серіалізатор (§9.1)
        │      ───────────────────────────────────────
 нижча  │  ⑤ решта переїзду по теках і перейменування (§5, §6)
        └──────────────────────────────────────────────▶ вартість/ризик
```

Рекомендація для #119: брати ①–③ першими. Вони прибирають два реальні
дефекти (неатомарний запис історії, дубльований платний виклик OpenAI) і
одну справжню течу абстракції, не чіпаючи структуру тек.

## 14. Відкриті питання

- **`views/` і `/old`.** Шаблони працюють проти `container` через
  Flask-роути. Під правило §3 не підпадають (не Python-шар), але при
  розборі `container.py` їх треба перевірити окремо.
- **Доля CLI.** `interfaces/cli/` у §7 передбачає, що CLI лишається
  живим. Якщо ні — половина §7 перетворюється на «видалити». Рішення не
  входить у #118.
- **Гранульованість `application/`.** Таблиці §6/§8 припускають теки
  `listings/`, `shops/`, `generation/`, `editing/`, `billing/`. Якщо
  якась із них виявиться на один файл — злити. Вирішується по факту в
  #124, не наперед.
