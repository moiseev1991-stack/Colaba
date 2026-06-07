# Changelog

All notable changes to this project will be documented in this file.

## [1.57.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.57.0...v1.57.1) (2026-06-07)


### Bug Fixes

* sidebar на правовых/SEO, hero на «По картам», подвалы, переименование «Письмо под боль» ([98093d4](https://github.com/moiseev1991-stack/Colaba/commit/98093d453720a616a820788bc55ef6abe2966692))

# [1.57.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.56.0...v1.57.0) (2026-06-07)


### Features

* **maps:** Multi-preset AND — несколько пресетов фильтров одновременно ([7e1e55b](https://github.com/moiseev1991-stack/Colaba/commit/7e1e55b740767c00ae2f5bede454069d79710e1d))

# [1.56.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.55.1...v1.56.0) (2026-06-07)


### Features

* SEO-лендинги auth-aware, компактный hero в /app/leads, стартовые пресеты ([e5cfe94](https://github.com/moiseev1991-stack/Colaba/commit/e5cfe9464ee24bfa7516466d9844f36990f68eac))

## [1.55.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.55.0...v1.55.1) (2026-06-07)


### Bug Fixes

* **frontend:** открыть правовые и SEO-страницы для незалогиненных в middleware ([0c43ba3](https://github.com/moiseev1991-stack/Colaba/commit/0c43ba36e931f36b32bf2a9c0a737f6ab4fafdfe))

# [1.55.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.54.0...v1.55.0) (2026-06-07)


### Features

* **frontend:** правовые страницы + 6 SEO-лендингов + sitemap/robots + cookie-баннер ([9db7396](https://github.com/moiseev1991-stack/Colaba/commit/9db73967938adb689ef9007b7c6e9309a62255ed))

# [1.54.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.53.0...v1.54.0) (2026-06-07)


### Features

* **maps:** ЛПР в Excel-экспорте + bulk-enrich-team endpoint (after PR [#14](https://github.com/moiseev1991-stack/Colaba/issues/14)+[#15](https://github.com/moiseev1991-stack/Colaba/issues/15)) ([fad067d](https://github.com/moiseev1991-stack/Colaba/commit/fad067dc2cc9cfef9e2cb4cbf310fbc2a679c987))

# [1.53.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.52.1...v1.53.0) (2026-06-07)


### Features

* **health:** расширяем /maps/health/providers — DaData, LLM, Sentry, счётчики ([dcb6445](https://github.com/moiseev1991-stack/Colaba/commit/dcb6445d910e8031a81df4d9a4a8012a5d6b5857)), closes [#11](https://github.com/moiseev1991-stack/Colaba/issues/11)

## [1.52.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.52.0...v1.52.1) (2026-06-07)


### Bug Fixes

* **mobile:** убираем горизонтальный overflow на 360-414px ([c1fa6d9](https://github.com/moiseev1991-stack/Colaba/commit/c1fa6d92cd9f369cf56896822600c1bbc2584140))

# [1.52.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.51.0...v1.52.0) (2026-06-07)


### Features

* **maps:** heatmap по нишам — 5 переключаемых слоёв (блок 5 ТЗ 2026-06-02) ([21788da](https://github.com/moiseev1991-stack/Colaba/commit/21788da93dcdfba642008340cd342c2627a31192))

# [1.51.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.50.0...v1.51.0) (2026-06-07)


### Bug Fixes

* **tests:** CompanyDecisionMaker импорт в models/__init__ — без него Base.metadata не знал о таблице ([87c07a7](https://github.com/moiseev1991-stack/Colaba/commit/87c07a74feea29ee8f2e9bfe3b3fe16667381b38))


### Features

* **maps:** LLM-извлечение ЛПР со страниц сайта (/team /о-нас /контакты) ([129c6e0](https://github.com/moiseev1991-stack/Colaba/commit/129c6e0b49b4fcd6129e40a4dbc4dc19eda7e187))

# [1.50.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.49.2...v1.50.0) (2026-06-07)


### Features

* **maps:** ЛПР из DaData — ФИО директора + подстановка в outreach + бейдж в drawer ([10eb623](https://github.com/moiseev1991-stack/Colaba/commit/10eb62374f3d81588f4499745e3fa1b1e604b522))

## [1.49.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.49.1...v1.49.2) (2026-06-06)


### Bug Fixes

* **maps:** /companies/{id}/digest падал с TypeError на func.case(else_=…) ([19ed733](https://github.com/moiseev1991-stack/Colaba/commit/19ed733e6adab53e99f4a707b6991438e3a2c98c))

## [1.49.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.49.0...v1.49.1) (2026-06-06)


### Bug Fixes

* **maps:** drawer-счётчики по источнику, Reset/auto-apply фильтров, AI-422 диагноз ([40c44f0](https://github.com/moiseev1991-stack/Colaba/commit/40c44f0d7651ac51002f19ba70a61299fb7acac6))

# [1.49.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.48.2...v1.49.0) (2026-06-05)


### Features

* **maps:** bulk-toolbar — CSV выбранных карточек ([c177659](https://github.com/moiseev1991-stack/Colaba/commit/c177659fa535a8b02b5aa1d941aa6d4cb3e744a2))
* **maps:** чистка пресетов под 4 MVP-кейса + дропдаун экспорта + чек-лист для Chrome-агента ([4a933e1](https://github.com/moiseev1991-stack/Colaba/commit/4a933e1c8f5d7c41181c4cdede97f3628100ba24))

## [1.48.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.48.1...v1.48.2) (2026-06-05)


### Bug Fixes

* **maps:** Yandex — реальный город компании из строки адреса ([ee3210f](https://github.com/moiseev1991-stack/Colaba/commit/ee3210f3e6b54fa65a1f51395ec564da23617707))

## [1.48.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.48.0...v1.48.1) (2026-06-05)


### Bug Fixes

* **maps:** фильтр placeholder-email 2GIS (help@2gis.ru и др.) ([d61a297](https://github.com/moiseev1991-stack/Colaba/commit/d61a2972d460e9a69788b0f62498e13b585349d1))

# [1.48.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.47.0...v1.48.0) (2026-06-04)


### Bug Fixes

* **deploy:** git reset через FETCH_HEAD (на проде нет remote-tracking ref для feature-веток) ([5862ae8](https://github.com/moiseev1991-stack/Colaba/commit/5862ae8d2607c64708e14f2769f3890845be1af8))
* **deploy:** добавить --no-build к compose up frontend ([54ad5b7](https://github.com/moiseev1991-stack/Colaba/commit/54ad5b7dbd2e16f67785fc4b5765a63481ad2ef3))
* **deploy:** добавить --no-deps к compose up frontend ([8e94594](https://github.com/moiseev1991-stack/Colaba/commit/8e94594ae8a3cc5be5c5cd93e52fde9434ba4f5d))
* **export:** UTF-8 BOM + ; разделитель в CSV для корректного открытия в Excel ([54f6dee](https://github.com/moiseev1991-stack/Colaba/commit/54f6dee4a9ec887fee43d98aa671869c24f8aeb4))
* **maps:** Yandex reviews через HTML-парсинг (API теперь требует CSRF) ([d189323](https://github.com/moiseev1991-stack/Colaba/commit/d1893236b237577706feddb394b9f77227c48147))


### Features

* **maps:** URL-persistence ?src= + фокус карточки на выбранном источнике ([64d4aef](https://github.com/moiseev1991-stack/Colaba/commit/64d4aef95d1a4626340c12359601eb74f2b1d813))
* **maps:** фильтр источника в боковой панели + чистка лендинга ([c3e9e81](https://github.com/moiseev1991-stack/Colaba/commit/c3e9e81ebe8dc75e1f865e2bed1aa54f61b52dfd))
* **maps:** фильтр-переключатель источника + усиленная дедуп-склейка (ТЗ 2026-06-04) ([af42e7b](https://github.com/moiseev1991-stack/Colaba/commit/af42e7bee18cf941ddbb406428f9d180c0e1ba65))

# [1.47.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.46.0...v1.47.0) (2026-06-03)


### Bug Fixes

* **maps:** переименовать ORM relationship чтобы не конфликтовал с Pydantic-полем ([8181ae6](https://github.com/moiseev1991-stack/Colaba/commit/8181ae63a20d8a3f55232baa1cb5bc516da5e18f))


### Features

* **maps-ui:** Phase 5 multi-source — мульти-бейдж + drawer-секции + табы по источнику ([01dddb2](https://github.com/moiseev1991-stack/Colaba/commit/01dddb2e3224d57144e50c3cde74ca70f0fe2eee))
* **maps:** Phase 1 multi-source — структура company_sources + company_contacts ([a1cc105](https://github.com/moiseev1991-stack/Colaba/commit/a1cc1055eb87ca320d7f6c8e66cdd06a478dab37))
* **maps:** Phase 2 multi-source — дедуп существующих 2gis+yandex пар ([e4e4173](https://github.com/moiseev1991-stack/Colaba/commit/e4e417318bdff5d02cf646e2205d401264747c7d))
* **maps:** Phase 3 multi-source — авто-sync новых компаний в company_sources/contacts ([241ea6b](https://github.com/moiseev1991-stack/Colaba/commit/241ea6bbd5edc538aeea35a6a8d3eb5ce3955d21))
* **maps:** Phase 4 multi-source — API отдаёт sources_profiles + фильтр /reviews?source= ([f9c9866](https://github.com/moiseev1991-stack/Colaba/commit/f9c98663a7c1046bc9f42dcf33d5865b165e1ff7))

# [1.46.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.45.0...v1.46.0) (2026-06-03)


### Features

* **maps:** enrich контактов Я.Карт через Playwright (phone/website/мессенджеры) ([2865994](https://github.com/moiseev1991-stack/Colaba/commit/28659949885567a10af242d8b34df991366964dc))

# [1.45.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.44.1...v1.45.0) (2026-06-03)


### Features

* **maps:** YandexMapsProvider.search_companies через Playwright ([29a1a5d](https://github.com/moiseev1991-stack/Colaba/commit/29a1a5d9543f20098a90a1212a16ee73ae694c3b))

## [1.44.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.44.0...v1.44.1) (2026-06-03)


### Bug Fixes

* **maps:** httpx 0.28 proxy=  + убрать false-positive captcha-keyword ([c82aa9c](https://github.com/moiseev1991-stack/Colaba/commit/c82aa9c331c7dbe713dacae4c84297950191c683))

# [1.44.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.43.0...v1.44.0) (2026-06-03)


### Features

* **landing:** рефакт под «компании с диагнозом» (smell + fake-numbers fix) ([669e051](https://github.com/moiseev1991-stack/Colaba/commit/669e051eb3c67e68341579baa8b5fcf27276ef33)), closes [#stats](https://github.com/moiseev1991-stack/Colaba/issues/stats) [#diagnosis](https://github.com/moiseev1991-stack/Colaba/issues/diagnosis) [#diagnosis](https://github.com/moiseev1991-stack/Colaba/issues/diagnosis)

# [1.43.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.42.0...v1.43.0) (2026-06-03)


### Features

* **ui:** redesign v2 phase B-3 follow-up — таблица истории рассылок и drill-down ([0b8dacf](https://github.com/moiseev1991-stack/Colaba/commit/0b8dacff7fd00032c10062853f42e16049b6454e))
* **ui:** redesign v2 phase C batch 1 — email stats/settings + leads presets/settings на v2 ([5a19b49](https://github.com/moiseev1991-stack/Colaba/commit/5a19b495f0cfd6de15ad9c2258c4ff0f26df5f51))
* **ui:** redesign v2 phase C batch 2 — SEO раздел (главная + шаблоны) на v2 ([87f3c83](https://github.com/moiseev1991-stack/Colaba/commit/87f3c83a3c853cd2ab9e3855d2516a3599c196a2))
* **ui:** redesign v2 phase C batch 3 — LeadsTable + ModuleCards + auth/register на v2 ([b5ec5aa](https://github.com/moiseev1991-stack/Colaba/commit/b5ec5aa9a2723e08d1929aaa61754170bf9414ed))
* **ui:** redesign v2 phase C batch 4 — Dialog primitive, лоадеры, SearchCard, ProfileCard ([7183517](https://github.com/moiseev1991-stack/Colaba/commit/71835174d2d5a60f14b40d48e8d3b52043aff2ce))
* **ui:** redesign v2 phase C batch 5 — settings/organizations/payment/error/policy на v2 ([e82f2fd](https://github.com/moiseev1991-stack/Colaba/commit/e82f2fd90f5deb1ea30dc591b3916d7a0f40a83c))
* **ui:** redesign v2 phase C batches 6-9 — maps/auth/demo/captcha + остальные мелкие ([8f7d716](https://github.com/moiseev1991-stack/Colaba/commit/8f7d7162567af46e90a90aff8b55c35bce52a175))

# [1.42.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.41.0...v1.42.0) (2026-06-03)


### Features

* **ui:** redesign v2 phase B-3 — сайдбар и mobile-tabs на бренд-градиент ([12b4239](https://github.com/moiseev1991-stack/Colaba/commit/12b42396a66a1f063c6e1c3a5f3034cb21c18bd7))

# [1.41.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.40.0...v1.41.0) (2026-06-03)


### Features

* **ui:** redesign v2 phase B-3 light — навбар на новые токены ([60a3c16](https://github.com/moiseev1991-stack/Colaba/commit/60a3c16877b90db195ed750b1a9892d2e01d8779))

# [1.40.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.39.0...v1.40.0) (2026-06-03)


### Features

* **ui:** redesign v2 phase B-2 — шаблоны КП, кампании, модалка пресета ([b26c881](https://github.com/moiseev1991-stack/Colaba/commit/b26c881018f1226b12827d4a0c968879d8e42870))

# [1.39.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.38.0...v1.39.0) (2026-06-02)


### Features

* **ui:** redesign v2 phase B-1 — дашборд + история на новый язык ([759f888](https://github.com/moiseev1991-stack/Colaba/commit/759f888ff0593233811e0d717953adcd72b77160))

# [1.38.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.37.0...v1.38.0) (2026-06-02)


### Features

* **ui:** redesign v2 — токены, шрифты, базовые компоненты, карточка лида ([f26328f](https://github.com/moiseev1991-stack/Colaba/commit/f26328f837f7bc81f60f336d32f0c1aa395fc609))

# [1.37.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.36.0...v1.37.0) (2026-06-02)


### Features

* **maps-ui:** цитаты негативных отзывов в карточке + легенда бейджей/теплокарты ([218786d](https://github.com/moiseev1991-stack/Colaba/commit/218786d18ddea1077d9762c576156319f2b4f823))

# [1.36.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.35.4...v1.36.0) (2026-06-02)


### Features

* **maps:** блок «Юр.данные (DaData)» в drawer карточки ([d09daf4](https://github.com/moiseev1991-stack/Colaba/commit/d09daf403661236dfcb711ae5708af40d5f3a3df))

## [1.35.4](https://github.com/moiseev1991-stack/Colaba/compare/v1.35.3...v1.35.4) (2026-06-02)


### Bug Fixes

* **maps:** тепловая карта — leaflet.heat теперь self-hosted в /public ([843bea9](https://github.com/moiseev1991-stack/Colaba/commit/843bea96ba8f60d7212865fdde36fb1aceae8049))

## [1.35.3](https://github.com/moiseev1991-stack/Colaba/compare/v1.35.2...v1.35.3) (2026-06-02)


### Bug Fixes

* **maps:** тепловая карта — window.L=L + jsdelivr CDN fallback ([9bc9bc6](https://github.com/moiseev1991-stack/Colaba/commit/9bc9bc6fa59963c8cfd94c3e577f5ffe912b5f71))

## [1.35.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.35.1...v1.35.2) (2026-06-02)


### Bug Fixes

* **maps:** утечка городов — Чайка в Кунцево не попадает в Балашиху ([3cd4ece](https://github.com/moiseev1991-stack/Colaba/commit/3cd4ece93b191a59bd32a8f5a1a7d4d69325059b))

## [1.35.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.35.0...v1.35.1) (2026-06-02)


### Bug Fixes

* **maps:** website discovery — поддержка handle с _ (домены DNS не имеют _) ([ee617c3](https://github.com/moiseev1991-stack/Colaba/commit/ee617c393dfdadf214dd22ce00e9de989e64b0ad))

# [1.35.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.34.1...v1.35.0) (2026-06-02)


### Features

* **maps:** website discovery — угадывание сайта по telegram/email handle ([8f426c8](https://github.com/moiseev1991-stack/Colaba/commit/8f426c82e1e50d5a0eaaf40885a8ea354f3de1ee))

## [1.34.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.34.0...v1.34.1) (2026-06-02)


### Bug Fixes

* **maps:** фильтр help@2gis.ru и других плейсхолдеров 2GIS из email ([daa2794](https://github.com/moiseev1991-stack/Colaba/commit/daa27948ab9886936a7e04b74efb26e194e4af88))

# [1.34.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.33.0...v1.34.0) (2026-06-02)


### Features

* **maps:** toggle пресетов — клик по активному снимает фильтры ([4bc11a4](https://github.com/moiseev1991-stack/Colaba/commit/4bc11a47b8053d6a05def32669a3c7643db297f3))

# [1.33.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.32.0...v1.33.0) (2026-06-02)


### Bug Fixes

* **frontend:** leaflet.heat через CDN, не npm — чиню CI ([2aabc53](https://github.com/moiseev1991-stack/Colaba/commit/2aabc532ead89c47eda5cc27292993f9e64f9745)), closes [#256](https://github.com/moiseev1991-stack/Colaba/issues/256)
* **maps:** улучшаю DaData-матчинг — режу имя по запятой/тире, 2-я попытка без города ([60c3586](https://github.com/moiseev1991-stack/Colaba/commit/60c358673123e1d2c320668d9c7e8c6691f93634))


### Features

* **maps:** блок 2 — юр.данные через DaData (ИНН/оборот/возраст) ([bdf1041](https://github.com/moiseev1991-stack/Colaba/commit/bdf1041f59d8395d7e2044c024abe2105fb4e3a6))
* **maps:** блок 5 — тепловые карты по нишам (5 слоёв) ([ee7bd29](https://github.com/moiseev1991-stack/Colaba/commit/ee7bd294439a300020205b41141f6f33673c005b))
* **prod:** пробрасываем DADATA_API_KEY/SECRET_KEY + OPENAI на celery-worker-search ([3c9e33f](https://github.com/moiseev1991-stack/Colaba/commit/3c9e33f56c7debd2d91dd45d72f90d326b773660))

# [1.32.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.31.0...v1.32.0) (2026-06-02)


### Features

* **maps:** блок 4C — AI-описание компании для блока «Производство сайта» ([1734d3d](https://github.com/moiseev1991-stack/Colaba/commit/1734d3dde7b26f0030bc4ae5e83111e20caad12a))

# [1.31.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.30.0...v1.31.0) (2026-06-02)


### Features

* **maps:** блок 4 A+B — website-lead score + Excel-экспорт ([d28fffd](https://github.com/moiseev1991-stack/Colaba/commit/d28fffdb1a60cda09a07828868e58ccea6625ddd))

# [1.30.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.29.0...v1.30.0) (2026-06-02)


### Features

* **maps:** блок 3 — lead temperature scoring + бейдж + сортировка ([956cbdd](https://github.com/moiseev1991-stack/Colaba/commit/956cbdd12b8a3d745e623ebd8e0e38333d2b963b))

# [1.29.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.28.0...v1.29.0) (2026-06-02)


### Features

* **maps:** bulk-чекбоксы — массовый выбор компаний и отгрузка в список ([dc84591](https://github.com/moiseev1991-stack/Colaba/commit/dc8459156c1588715c7c9101b672d2d2a9a19d37))

# [1.28.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.27.4...v1.28.0) (2026-06-02)


### Features

* **maps:** блок 1 — драфт письма с углами + кэш (aha-moment) ([d5b0fd7](https://github.com/moiseev1991-stack/Colaba/commit/d5b0fd7bd86a60f678151a8bb6fe18c797c2b769))

## [1.27.4](https://github.com/moiseev1991-stack/Colaba/compare/v1.27.3...v1.27.4) (2026-06-02)


### Bug Fixes

* **maps:** отключаю слой 5 — на проде ловит рекламный баннер 2GIS ([9df20e8](https://github.com/moiseev1991-stack/Colaba/commit/9df20e8f48da0dd7ef375781036587b615406c66))

## [1.27.3](https://github.com/moiseev1991-stack/Colaba/compare/v1.27.2...v1.27.3) (2026-06-02)


### Bug Fixes

* **maps:** website как первая прямая http-ссылка в HTML (слой 5) ([24c0a92](https://github.com/moiseev1991-stack/Colaba/commit/24c0a92f3eab59ca9286a3a0d6b0c136fe190000))

## [1.27.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.27.1...v1.27.2) (2026-06-02)


### Bug Fixes

* **maps:** достаём website из HTML через link.2gis.ru-трекер (слой 4) ([9bfeed1](https://github.com/moiseev1991-stack/Colaba/commit/9bfeed10d538c6f009c5e220883776e4b84eb9bd))

## [1.27.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.27.0...v1.27.1) (2026-06-01)


### Bug Fixes

* **maps:** Playwright тащит website из 2GIS, пресет «Есть сайт» не отдаёт 0 ([5cd1c62](https://github.com/moiseev1991-stack/Colaba/commit/5cd1c6252fe9a9b2eec846f2020cedbffbceb25f))

# [1.27.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.26.3...v1.27.0) (2026-06-01)


### Features

* **maps-ui:** пресет «Есть сайт» + подсветка активного пресета в фильтр-панели ([546b823](https://github.com/moiseev1991-stack/Colaba/commit/546b82370d68dd9eb7764ca0cf17d2f2b8aaa072))

## [1.26.3](https://github.com/moiseev1991-stack/Colaba/compare/v1.26.2...v1.26.3) (2026-06-01)


### Bug Fixes

* **maps:** фильтр сателлитов — Балашиха ловила всю Москву ([887ea6b](https://github.com/moiseev1991-stack/Colaba/commit/887ea6bfb5f57c7f2d6be77d376dbf259d5ab34f))

## [1.26.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.26.1...v1.26.2) (2026-06-01)


### Bug Fixes

* **maps:** UA Chrome 148 + Sec-Ch-Ua headers против /museum-редиректа ([32da407](https://github.com/moiseev1991-stack/Colaba/commit/32da40765c53be1609a13e8c32669621e5b6b72f))

## [1.26.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.26.0...v1.26.1) (2026-06-01)


### Bug Fixes

* **maps:** ставим chromium-headless-shell для Playwright 1.60+ ([6bcc1b5](https://github.com/moiseev1991-stack/Colaba/commit/6bcc1b53aa1ae7d77f6ab117ae329cfd5dd942a8))

# [1.26.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.25.0...v1.26.0) (2026-06-01)


### Bug Fixes

* **maps:** догонять enrichment при cache hit + убрать «not phone» для 2GIS HTML ([e2bda77](https://github.com/moiseev1991-stack/Colaba/commit/e2bda775a7e58203a73ef700bad15cc29531566e))


### Features

* **maps:** 2GIS HTML-парсер через headless Chromium (Playwright) ([bfc5d05](https://github.com/moiseev1991-stack/Colaba/commit/bfc5d0565d90c97fde74201b9a417d895f5dc057))

# [1.25.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.24.2...v1.25.0) (2026-05-31)


### Features

* **maps:** HTML-парсер 2gis.ru/firm/{id} + краулер /contacts + соцсети, всё бесплатно ([7ac56fc](https://github.com/moiseev1991-stack/Colaba/commit/7ac56fc4c737c0a0bc1d1f80a4558c913409cad0))

## [1.24.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.24.1...v1.24.2) (2026-05-31)


### Bug Fixes

* **maps-ui:** тёмная тема + контакты с кнопкой «2GIS» в превью карточки ([14eddb1](https://github.com/moiseev1991-stack/Colaba/commit/14eddb187b0eaa37c4d0db126b586206bc1c2cdf))

## [1.24.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.24.0...v1.24.1) (2026-05-31)


### Bug Fixes

* **ui:** drawer ниже навбара, Escape закрывает модалки, расширенный hit-area крестика, hint про авто-AI ([bb3522d](https://github.com/moiseev1991-stack/Colaba/commit/bb3522d329b35e01cfd4449a016886f65d98160e))

# [1.24.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.23.0...v1.24.0) (2026-05-31)


### Features

* **maps:** тащим из 2GIS contact_groups email/telegram/vk/whatsapp + пресет «Готовы к автоматизации» ([08d218c](https://github.com/moiseev1991-stack/Colaba/commit/08d218c9fdeb223a5b9cb13d19e8f85b906caaa4))

# [1.23.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.22.0...v1.23.0) (2026-05-31)


### Features

* **maps:** больше ниш, AI-промпты во встроенных пресетах, side-drawer карточки, fallback контактов на 2GIS ([7922482](https://github.com/moiseev1991-stack/Colaba/commit/7922482e1d67020d5a3ff615d3275297a2a34ac3))

# [1.22.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.21.0...v1.22.0) (2026-05-31)


### Bug Fixes

* **maps-ui:** фиксы из аудита Claude in Chrome — mobile тач-таргеты + UX-полировка ([33b5a72](https://github.com/moiseev1991-stack/Colaba/commit/33b5a72a0cd6d6c20d3f46a098e19749ddf530b4))
* **reviews-ai:** не привязывать positive-отзывы к pain-тегам — top_quote перестанет «врать» ([46fbdee](https://github.com/moiseev1991-stack/Colaba/commit/46fbdee210116b25b2beb67427c16b4b2180c0df))


### Features

* **maps:** «Мои пресеты», контакты в карточке, карта Leaflet, авто-AI ([305e51b](https://github.com/moiseev1991-stack/Colaba/commit/305e51bc79ae7dd1fe0e57b24060c902d1548379))

# [1.21.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.20.2...v1.21.0) (2026-05-30)


### Features

* **maps,reviews-ai:** AI-промпт в пресетах — кастомная оценка компаний через LLM ([e42e485](https://github.com/moiseev1991-stack/Colaba/commit/e42e4859a604fd89e6a186fb789dd148eee2ad67))

## [1.20.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.20.1...v1.20.2) (2026-05-30)


### Bug Fixes

* **maps:** AI-анализ не запускался для существующих компаний ([7ab0e05](https://github.com/moiseev1991-stack/Colaba/commit/7ab0e051e489bf8a7dd7132a3c896ec45a562402))

## [1.20.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.20.0...v1.20.1) (2026-05-30)


### Bug Fixes

* **maps-ui:** чищу 6 UX-багов из отчёта Claude in Chrome ([ba1d7d5](https://github.com/moiseev1991-stack/Colaba/commit/ba1d7d58870b10c7c0acb8f4ad673f4b59a940b3))

# [1.20.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.19.0...v1.20.0) (2026-05-30)


### Features

* **maps-ui:** кнопка «сохранить пресет» на форме создания поиска ([649f829](https://github.com/moiseev1991-stack/Colaba/commit/649f8290e6437ea33649cb72e7376f3bd0c04a2f))

# [1.19.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.18.0...v1.19.0) (2026-05-30)


### Features

* **maps:** пресеты на форме поиска + вкладка «Скрытые» в моих пресетах ([e421637](https://github.com/moiseev1991-stack/Colaba/commit/e421637fed2ae9c2ef9edff6f6641d654fc59eb8))

# [1.18.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.17.0...v1.18.0) (2026-05-30)


### Features

* **maps-ui:** редактируемое поле «Слова в отзывах» в панели фильтров ([66e393e](https://github.com/moiseev1991-stack/Colaba/commit/66e393e069499275378f1987036f280649e4d890))

# [1.17.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.16.0...v1.17.0) (2026-05-30)


### Features

* **maps:** пользовательские пресеты фильтров — сохранение/удаление per-user ([c1c256e](https://github.com/moiseev1991-stack/Colaba/commit/c1c256ea11d17a136b21a5d24e50b4d683eb775c))

# [1.16.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.15.2...v1.16.0) (2026-05-30)


### Features

* **maps-ui:** подписи под кнопками пресетов — видно ICP без наведения ([e75982b](https://github.com/moiseev1991-stack/Colaba/commit/e75982b0efde31809a5878441f576415d4b26656))

## [1.15.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.15.1...v1.15.2) (2026-05-30)


### Bug Fixes

* **maps-ui:** пресет «Хаос в работе» — массив специфичных слов + индикатор ([753f6cf](https://github.com/moiseev1991-stack/Colaba/commit/753f6cf2ae5be5865a15b03192a8177d8a21b821))

## [1.15.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.15.0...v1.15.1) (2026-05-30)


### Bug Fixes

* **maps-ui:** фильтры пресетов не применялись + drawer без города + счётчик отзывов ([d9c2a5a](https://github.com/moiseev1991-stack/Colaba/commit/d9c2a5a06922a3a29cd34c60a11a9757e929ef9a))

# [1.15.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.14.0...v1.15.0) (2026-05-30)


### Features

* **maps:** город в карточке, мультислова через запятую, фикс индикатора сайта ([bfcf7e0](https://github.com/moiseev1991-stack/Colaba/commit/bfcf7e0266006d2662f6dc0e074f129a7d858520))

# [1.14.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.13.0...v1.14.0) (2026-05-30)


### Features

* **maps-ui:** пресеты «Нужен сайт» и «Хаос в работе» под ICP ([a3bd840](https://github.com/moiseev1991-stack/Colaba/commit/a3bd8401906f0ad80a20a7d47e5f46da04501cab))

# [1.13.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.12.2...v1.13.0) (2026-05-30)


### Features

* **maps:** фильтр и индикатор «есть/нет сайта» у компании ([dea3f4a](https://github.com/moiseev1991-stack/Colaba/commit/dea3f4adaab5b8d844241d4607ea5b3f75848867))

## [1.12.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.12.1...v1.12.2) (2026-05-30)


### Bug Fixes

* **maps:** radius-режим не должен делить кэш с city-поиском ([f4a68b7](https://github.com/moiseev1991-stack/Colaba/commit/f4a68b74f1961d339485ea07ae172781f93293f7))

## [1.12.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.12.0...v1.12.1) (2026-05-30)


### Bug Fixes

* **maps:** UnboundLocalError в radius-режиме 2GIS — поиск возвращал 0 компаний ([c0235c1](https://github.com/moiseev1991-stack/Colaba/commit/c0235c17126cafa987173831a0f6cdd62609479b))

# [1.12.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.11.0...v1.12.0) (2026-05-29)


### Features

* **maps:** конкурентный режим — поиск компаний в радиусе от адреса ([4eed74f](https://github.com/moiseev1991-stack/Colaba/commit/4eed74f9cef809366d30a5bb9e9905202ab207ef))

# [1.11.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.10.0...v1.11.0) (2026-05-29)


### Features

* **maps,lead-lists:** дайджест отзывов в drawer + bulk-генерация драфтов ([1092fcb](https://github.com/moiseev1991-stack/Colaba/commit/1092fcbe3e5eb6f949507a7245fa5916c37cd379))

# [1.10.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.9.4...v1.10.0) (2026-05-29)


### Features

* **maps-ui:** live-прогресс через polling — карточки появляются по мере парсинга ([e76a5ba](https://github.com/moiseev1991-stack/Colaba/commit/e76a5ba00beefdbc3589a01bcd794c115631cf84))

## [1.9.4](https://github.com/moiseev1991-stack/Colaba/compare/v1.9.3...v1.9.4) (2026-05-29)


### Performance Improvements

* **maps:** первые карточки появляются за 5-15с (batch=5, parallel queries, rate=0.4) ([617010f](https://github.com/moiseev1991-stack/Colaba/commit/617010ff2f11396e13b1e635f2094921ce219a26))

## [1.9.3](https://github.com/moiseev1991-stack/Colaba/compare/v1.9.2...v1.9.3) (2026-05-29)


### Bug Fixes

* **lead-lists:** _to_detail использовал CompanyOut до его импорта ([ba4d5ff](https://github.com/moiseev1991-stack/Colaba/commit/ba4d5ff36df7b9732c7863370f90ae6968696c98))

## [1.9.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.9.1...v1.9.2) (2026-05-29)


### Bug Fixes

* **maps-ui,maps:** мягкий вывод старых «Results not found» + регионы топ-10 городов ([2db4b4e](https://github.com/moiseev1991-stack/Colaba/commit/2db4b4e71e24bb5df218f17e2a61a56ed4a84258))

## [1.9.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.9.0...v1.9.1) (2026-05-29)


### Bug Fixes

* **maps:** третий слой защиты от RuntimeError + СПб в hardcoded + лог region/search ([53ef6af](https://github.com/moiseev1991-stack/Colaba/commit/53ef6af4f73dd11906978fb4402b477b55fac284))

# [1.9.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.8.2...v1.9.0) (2026-05-29)


### Features

* **maps:** multi-query expansion, lazy region_id, фильтр-по-слову в форме ([5e09b85](https://github.com/moiseev1991-stack/Colaba/commit/5e09b85748e8a104fe05bcbb9ca9ed85d6f0a5a0))

## [1.8.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.8.1...v1.8.2) (2026-05-29)


### Bug Fixes

* **maps:** 2GIS meta.code=400 больше не валит весь поиск ([ae21313](https://github.com/moiseev1991-stack/Colaba/commit/ae213137759cf81643e5c851b7dbd1a70420b867))

## [1.8.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.8.0...v1.8.1) (2026-05-29)


### Bug Fixes

* **lead-lists,maps-ui:** 400 на /lead-lists/{id} + кнопка [Письмо] всегда активна ([5d888c5](https://github.com/moiseev1991-stack/Colaba/commit/5d888c585c2b17b899847dbd14320f037b5d185b))

# [1.8.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.7.3...v1.8.0) (2026-05-29)


### Features

* **db:** миграция 018 + ORM для контактов компании, top_quote, lead_lists ([b6e0952](https://github.com/moiseev1991-stack/Colaba/commit/b6e0952d49dc388eca736c6b6e9151a9b77ee6d3))
* **lead-lists:** новый модуль — списки лидов + конвертация в EmailCampaign ([42bb7bc](https://github.com/moiseev1991-stack/Colaba/commit/42bb7bccf269cce614cde1733e6473ba404f1b2d))
* **maps-ui,lead-lists-ui:** кнопки [список][письмо], цитаты, /lists, /demo, быстрый старт ([c502de7](https://github.com/moiseev1991-stack/Colaba/commit/c502de730b2b4a61e5b2a7ad3894a35d78ad6c52))
* **maps,reviews-ai:** обогащение контактов, цитата под болью, LLM-драфт письма, progress в SSE ([5d61596](https://github.com/moiseev1991-stack/Colaba/commit/5d6159634c9ab80a45c3504b31aa937836ef54d1))

## [1.7.3](https://github.com/moiseev1991-stack/Colaba/compare/v1.7.2...v1.7.3) (2026-05-28)


### Bug Fixes

* **maps:** авто-перепарс отзывов при from_cache для компаний с reviews_count=0 ([2f84645](https://github.com/moiseev1991-stack/Colaba/commit/2f8464589cf8b0b3517fb65f5d2bce25c1db535e))

## [1.7.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.7.1...v1.7.2) (2026-05-28)


### Bug Fixes

* **maps:** самоисцеление битого кэша + переиспользование результатов прошлого поиска ([ce562b8](https://github.com/moiseev1991-stack/Colaba/commit/ce562b83038549a1e67f2d1d3a047aa8c18b5af1))

## [1.7.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.7.0...v1.7.1) (2026-05-28)


### Bug Fixes

* **tests:** убрать ассерты на нереализованные region_id (Питер, Казань) ([574046e](https://github.com/moiseev1991-stack/Colaba/commit/574046e6cd383a241e5cafcf4c6592a1f2a82549))

# [1.7.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.6.2...v1.7.0) (2026-05-27)


### Features

* **maps-ui:** фильтр отзывов по тексту + переезд формы на стиль «По сайтам» + drawer 2.0 ([b474d0c](https://github.com/moiseev1991-stack/Colaba/commit/b474d0ca92ec9150a6f2982a287f2676b953c132))

## [1.6.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.6.1...v1.6.2) (2026-05-27)


### Bug Fixes

* **reviews-ai:** батчим sentiment по 20 + динамический max_tokens + лог сырого ответа ([f0a69f5](https://github.com/moiseev1991-stack/Colaba/commit/f0a69f5b727f117253b9fbba89be18709da0e240))

## [1.6.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.6.0...v1.6.1) (2026-05-27)


### Bug Fixes

* **deps:** openai 1.55+ для совместимости с httpx>=0.28 ([c52742e](https://github.com/moiseev1991-stack/Colaba/commit/c52742e3186d4c2281476469a042e4982eb7f732))

# [1.6.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.5.0...v1.6.0) (2026-05-27)


### Bug Fixes

* **maps:** drawer «Все отзывы» — лимит 50 вместо 10 ([a7cbde7](https://github.com/moiseev1991-stack/Colaba/commit/a7cbde7df5af7f925ec296af617445fd11924a39))


### Features

* **reviews-ai:** подключение ProxyAPI для LLM-пайплайна из РФ ([1a8cd1e](https://github.com/moiseev1991-stack/Colaba/commit/1a8cd1e1023add7bb80c5fc30817f5f7ca3ffb52))


### Reverts

* **maps-ui:** убрать «горячий/тёплый лид» индикаторы — не нужны сейчас ([0f14c4a](https://github.com/moiseev1991-stack/Colaba/commit/0f14c4a0a111323f627ad1cc9d7f1977a6f9a5dc))

# [1.5.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.4.2...v1.5.0) (2026-05-27)


### Features

* **maps-ui:** scannable карточки компаний — pill-метрики и индикатор горячего лида ([f1fae9e](https://github.com/moiseev1991-stack/Colaba/commit/f1fae9e14378dbb84468aaf464c2ab142caa78fb))

## [1.4.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.4.1...v1.4.2) (2026-05-27)


### Bug Fixes

* **ui:** scrollable Dialog с фиксированной высотой 85vh ([82b52ea](https://github.com/moiseev1991-stack/Colaba/commit/82b52ea9f305c88e731b7a880b1e20d06695f199))

## [1.4.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.4.0...v1.4.1) (2026-05-27)


### Bug Fixes

* **deploy:** пробрасываем TWOGIS_REVIEWS_PUBLIC_API_KEY в backend и celery воркеры ([dd7405e](https://github.com/moiseev1991-stack/Colaba/commit/dd7405ecc74eb4e82337b64d01f5ce8be3edf642))

# [1.4.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.8...v1.4.0) (2026-05-27)


### Bug Fixes

* **maps-2gis:** cap pages at 5 — free plan hard limit on page parameter ([5f9fb06](https://github.com/moiseev1991-stack/Colaba/commit/5f9fb0685aaf186fcc841167834c73ff48acbe98))
* **maps-2gis:** минимальные параметры public widget API (был 400 на всех) ([c146915](https://github.com/moiseev1991-stack/Colaba/commit/c14691546bf54d670de7b45e96e667584e091865))


### Features

* **maps-2gis:** public widget API как бесплатный fallback для отзывов ([433d829](https://github.com/moiseev1991-stack/Colaba/commit/433d829e99f825bdafb2f279019286adb0a206ec))

## [1.3.8](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.7...v1.3.8) (2026-05-23)


### Bug Fixes

* **maps-2gis:** page_size 10 + проверка meta.code (тихо глотали 400) ([545a8c5](https://github.com/moiseev1991-stack/Colaba/commit/545a8c569a6b3057ec2bd21f211d98feb2b5fdc9))
* **maps-2gis:** региoн_id Москвы 32 (был 1 = Новосибирск) ([da1ce27](https://github.com/moiseev1991-stack/Colaba/commit/da1ce272d3d708b3e17b531d6e6fe7e48b8091b9))
* **maps:** graceful обработка 2GIS reviews 404 (Method not found) ([a041d1d](https://github.com/moiseev1991-stack/Colaba/commit/a041d1dd1bfd388c772a5b18689b31c88283236b))

## [1.3.7](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.6...v1.3.7) (2026-05-23)


### Bug Fixes

* **maps:** NullPool в Celery воркере — лечим "another operation in progress" ([055e2cf](https://github.com/moiseev1991-stack/Colaba/commit/055e2cf1ec61d6188933c60ce0f4ea97b7a32061))

## [1.3.6](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.5...v1.3.6) (2026-05-23)


### Bug Fixes

* **deploy:** пробрасываем TWOGIS_API_KEY в backend и celery воркеры ([f4d033f](https://github.com/moiseev1991-stack/Colaba/commit/f4d033f49a878328ad25a8c547aa02f59561f0ab))

## [1.3.5](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.4...v1.3.5) (2026-05-23)


### Performance Improvements

* **frontend:** ускоряем npm ci при сборке (важно для Coolify) ([3374af9](https://github.com/moiseev1991-stack/Colaba/commit/3374af97bd26742ddb1b92ff32d5d5746b8f0848))

## [1.3.4](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.3...v1.3.4) (2026-05-23)


### Bug Fixes

* **deploy:** pgvector image + maps очереди в celery worker-ах ([2ef596e](https://github.com/moiseev1991-stack/Colaba/commit/2ef596ea1981843d6657dea32a5a5d73263db9e4))

## [1.3.3](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.2...v1.3.3) (2026-05-23)


### Bug Fixes

* **ci:** add redis service for backend tests ([3315278](https://github.com/moiseev1991-stack/Colaba/commit/33152782d9e808375b4967136b4af1b70e6898af))

## [1.3.2](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.1...v1.3.2) (2026-05-23)


### Bug Fixes

* **tests:** идемпотентные имена в create/update тестах organizations и blacklist ([401b7f9](https://github.com/moiseev1991-stack/Colaba/commit/401b7f9dceccd7a535f36a8256106a0a21dce570))

## [1.3.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.3.0...v1.3.1) (2026-05-23)


### Bug Fixes

* **ci:** use pgvector image + CREATE EXTENSION vector for backend tests ([642e34e](https://github.com/moiseev1991-stack/Colaba/commit/642e34edc023fa700ab8e9f253ceb6887914a514))

# [1.3.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.2.0...v1.3.0) (2026-05-23)


### Bug Fixes

* **maps-ui:** отступы + заметная кнопка «Найти» + заголовок формы ([812422d](https://github.com/moiseev1991-stack/Colaba/commit/812422deae2bb392e7b32fd82891f221a5d41022))
* **maps:** polling статуса + понятная плашка failed + расширение городов ([4fea76b](https://github.com/moiseev1991-stack/Colaba/commit/4fea76b670594327be04deb7165e6567356e2f45))


### Features

* **maps-admin:** SQLAdmin view для PainTag ([06cd6c5](https://github.com/moiseev1991-stack/Colaba/commit/06cd6c5bcce648616d4731ffc24d01588c064b4a))
* **maps-admin:** SQLAdmin views — Companies, Reviews, Map Searches, Cache ([b6340d3](https://github.com/moiseev1991-stack/Colaba/commit/b6340d3f74b308deb3ea5682f4ca1542e4596da7))
* **maps-ai:** Celery-задачи AI-пайплайна + cron recluster ([cb84bd9](https://github.com/moiseev1991-stack/Colaba/commit/cb84bd9e729bc7f62a2b4e2d292d5e99d0bd5d11))
* **maps-ai:** clustering, промпты, LLM-обёртка + embeddings ([41fa2b0](https://github.com/moiseev1991-stack/Colaba/commit/41fa2b002afbbafea444f7637815ec2bfbc3312e))
* **maps-ai:** pain-tags API + фильтр компаний по pain_tag_ids ([af8701f](https://github.com/moiseev1991-stack/Colaba/commit/af8701f4ed3324bac94d522c425e41c2e6141b03))
* **maps-ai:** миграция 016 — pain_tags, review_pain_tags, company_pain_scores ([3602a79](https://github.com/moiseev1991-stack/Colaba/commit/3602a79a3b6a22ded25050fd953bf9ca071ae7e2))
* **maps-ai:** сервис — sentiment, embeddings, match, recluster ([71f0ffd](https://github.com/moiseev1991-stack/Colaba/commit/71f0ffd9cf97c41aea6cd5c08b59e16d22b57ae1))
* **maps-sse:** Redis pub/sub + SSE endpoint для прогрессивной выдачи ([68b3384](https://github.com/moiseev1991-stack/Colaba/commit/68b3384b00c152d9d75e746071c0b3d2de8515d9))
* **maps-ui:** API клиент + переключатель режимов на /app/leads (ШАГ 13) ([f9dcc81](https://github.com/moiseev1991-stack/Colaba/commit/f9dcc8146851023bbd5844edee4d3da0e85d8277))
* **maps-ui:** MapsCompanyCard + MapsCompanyDetailDrawer (ШАГ 16) ([7b371ee](https://github.com/moiseev1991-stack/Colaba/commit/7b371eecb5f35f7664309fbdcaaa074e51fb227f))
* **maps-ui:** useSearchStream SSE-хук + live прогресс в MapsSearchResults (ШАГ 14) ([d18a49d](https://github.com/moiseev1991-stack/Colaba/commit/d18a49d612a93a838b11e9d82f8fcd491b3bca4d))
* **maps-ui:** фильтры + облако тегов болей + 3 пресета (ШАГ 15) ([8890669](https://github.com/moiseev1991-stack/Colaba/commit/88906695ccf1167123792fffd5f15453b774108f))
* **maps:** API endpoints — search, companies, reviews, metadata, health ([476d227](https://github.com/moiseev1991-stack/Colaba/commit/476d22765c2bc07c643e3efa9700016243e9704b))
* **maps:** Celery-задачи парсинга + cron purge ([f609ae1](https://github.com/moiseev1991-stack/Colaba/commit/f609ae1ea741caadf7e1f6d918eec2de3069b42c))
* **maps:** базовый интерфейс MapProvider и общие схемы ([181a53d](https://github.com/moiseev1991-stack/Colaba/commit/181a53d6c5f893172a0a36193270f02192b727a1))
* **maps:** добавлен сервис celery-beat для cron-задач ([6e29d69](https://github.com/moiseev1991-stack/Colaba/commit/6e29d6920417220fa61db0b3a9fe40cbe2b6e02c))
* **maps:** миграция 015 — companies, reviews, map_searches, кэш ([9beaa26](https://github.com/moiseev1991-stack/Colaba/commit/9beaa26a14cf728c3f461eab306e8c42ab1d2913))
* **maps:** провайдер 2GIS — Catalog API ([8f065cf](https://github.com/moiseev1991-stack/Colaba/commit/8f065cfac9e3658ee21f0453427255753936236f))
* **maps:** провайдер Яндекс.Карт — JSON-LD + AJAX + bypass SmartCaptcha ([39b3a53](https://github.com/moiseev1991-stack/Colaba/commit/39b3a5341a2c85c663232511133e390811e94360))
* **maps:** сервис (кэш, save_*_batch, агрегаты) и фильтры ([5d21d12](https://github.com/moiseev1991-stack/Colaba/commit/5d21d12a5d3b93de6cf69b6b9fd12542f31bee24))
* **maps:** экспорт компаний поиска в CSV (готов к фронту) ([dee1c30](https://github.com/moiseev1991-stack/Colaba/commit/dee1c30cc569df2196ed97ab6bf75be7d037e374))

# [1.2.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.1.0...v1.2.0) (2026-05-09)


### Features

* **frontend:** seed default proposal template "Вафлинтин" for first-time visitors ([008dc08](https://github.com/moiseev1991-stack/Colaba/commit/008dc08ae05320b3a1a223093fef9145826c2e4e))

# [1.1.0](https://github.com/moiseev1991-stack/Colaba/compare/v1.0.1...v1.1.0) (2026-05-09)


### Features

* sync remaining WIP changes — backend filters/keyword/proposals, frontend results table, header theme, dashboard ([34ba96d](https://github.com/moiseev1991-stack/Colaba/commit/34ba96d44cef196deda3ecfcf35b4201b14068a4))

## [1.0.1](https://github.com/moiseev1991-stack/Colaba/compare/v1.0.0...v1.0.1) (2026-05-09)


### Bug Fixes

* **frontend:** add missing proposal templates pages and components ([ecc8b69](https://github.com/moiseev1991-stack/Colaba/commit/ecc8b69ecd38a42d867472c7cc1f3f525d503b57))

# 1.0.0 (2026-05-09)


### Bug Fixes

* add 10s timeout to proxy fetch, add hint about INTERNAL_BACKEND_ORIGIN ([562ef91](https://github.com/moiseev1991-stack/Colaba/commit/562ef91862b65d378d985c4f9306b671200aaa88))
* add child_process.execSync fallback to read backend IP, bypass webpack fs/env stubbing ([778e91f](https://github.com/moiseev1991-stack/Colaba/commit/778e91f4ed889aeae7b4cc1c4698b6247b578a2f))
* add coolify 404 fix - connect proxy to app network, script and doc ([c702d1b](https://github.com/moiseev1991-stack/Colaba/commit/c702d1b07a8acde66c3c22f36e92aa3f0f646c86))
* add coolify network to backend for Traefik routing; restore INTERNAL_BACKEND_ORIGIN fallback in entrypoint; add diag to 502 response ([a51f35d](https://github.com/moiseev1991-stack/Colaba/commit/a51f35d7afeae40039d4e5f17bfdfd4256d794ea))
* add dns.lookup fallback when resolve4 gets ESERVFAIL, 5 retries with longer delays ([cc092c6](https://github.com/moiseev1991-stack/Colaba/commit/cc092c679e692b304bf3c5b6d0014056223bffd8))
* add entrypoint.sh to resolve backend IP at startup, bypass DNS in Next.js process ([71f62e9](https://github.com/moiseev1991-stack/Colaba/commit/71f62e981c2a58458f94250c0f675afbe30d5961))
* add theme script beforeInteractive, fix TopBar portal hydration ([10c8711](https://github.com/moiseev1991-stack/Colaba/commit/10c8711c600c4a041217f79e78a1e4dfb43a0f51))
* **alembic:** create searches, search_results, filters, blacklist_domains in 002 ([550fa2d](https://github.com/moiseev1991-stack/Colaba/commit/550fa2de2d95feda1d55c3756aef3452e7f99798))
* **alembic:** use sync engine, fix migration 001 FK handling ([1f9b1db](https://github.com/moiseev1991-stack/Colaba/commit/1f9b1db2ce6082e1648e17f95098a1ebaa71485d))
* **backend:** add conftest to override auth deps in tests (fix 403); SEO page fixes ([f144b10](https://github.com/moiseev1991-stack/Colaba/commit/f144b1095963a126550fa07ded6bf8eee08989b8))
* **backend:** explicit /email/replies routes for proxy compatibility ([3b4ef8a](https://github.com/moiseev1991-stack/Colaba/commit/3b4ef8ab51d4a2f8d026985b0fad0773b0cf25e2))
* **backend:** root redirect to /health when DEBUG=False ([25d65f9](https://github.com/moiseev1991-stack/Colaba/commit/25d65f98ba13ec24f59f24c712cd500ad7edf3b7))
* bypass hairpin NAT via coolify-proxy internal relay (confirmed by DNS diag) ([a044f31](https://github.com/moiseev1991-stack/Colaba/commit/a044f3124c86c54430668c7a211e1331e8e35e6f))
* bypass webpack inlining via __non_webpack_require__ to read backend IP from file ([070bd41](https://github.com/moiseev1991-stack/Colaba/commit/070bd41ab9347ce4228224376edeea627375a1d7))
* cast env object to NodeJS.ProcessEnv to satisfy TypeScript overload ([87e9b5f](https://github.com/moiseev1991-stack/Colaba/commit/87e9b5f44de16e2b0be60554c906eea807162766))
* **ci:** add deploy timeout, workflow_dispatch, runner docs ([16e8f57](https://github.com/moiseev1991-stack/Colaba/commit/16e8f57fa87c81cef50057fd3a8f58477cde5b9b))
* **ci:** create test user id=1 in init_test_db for searches FK ([66f047b](https://github.com/moiseev1991-stack/Colaba/commit/66f047b0fbc4a6fbe218becb8fe169bf700e9a52))
* **ci:** disable submodules checkout to fix spinlid-clean error ([3524e8c](https://github.com/moiseev1991-stack/Colaba/commit/3524e8cb5588f3e2a5e6b06dbbdc45efc456cf8e))
* **ci:** Fix sequence collision in test DB init and missing npm test script ([4635b78](https://github.com/moiseev1991-stack/Colaba/commit/4635b78eed717f4ec066c60e099899ad945c14a1))
* **ci:** install missing semantic-release plugins in Release workflow ([d9ab9db](https://github.com/moiseev1991-stack/Colaba/commit/d9ab9db954e2eb05f68efac658e68d36c92442dc))
* **ci:** remove orphan spinlid-clean gitlink to unblock Release workflow ([e8e822b](https://github.com/moiseev1991-stack/Colaba/commit/e8e822b9c92a078afc5d8730a07b497bec572740))
* **ci:** use lowercase repo name for Docker image tags ([acd8cc8](https://github.com/moiseev1991-stack/Colaba/commit/acd8cc8e31a29850b4c2f8b31251fb8d09eefc7d))
* **ci:** use sync init_test_db.py script for reliable schema creation ([5a98b42](https://github.com/moiseev1991-stack/Colaba/commit/5a98b42dac08708f79479ff6945768b657027870))
* ClientRoot - РѕС‚Р»РѕР¶РµРЅРЅС‹Р№ СЂРµРЅРґРµСЂ РґРѕ mount РґР»СЏ СѓСЃС‚СЂР°РЅРµРЅРёСЏ hydration errors ([73a9178](https://github.com/moiseev1991-stack/Colaba/commit/73a9178ea63c4cc614ffbdcc36e68070b3efb96d))
* ClientRoot skip loading in dev, deploy rm containers for port fix ([0398496](https://github.com/moiseev1991-stack/Colaba/commit/0398496c267090c0daf8c98ca8b3b775874e402e))
* **compose:** add defaults for image names so Coolify can build from source ([1a1d69c](https://github.com/moiseev1991-stack/Colaba/commit/1a1d69c939d725cc421c15328f538f70b8f55d08))
* deploy port 8001 cleanup, ClientRoot immediate render, server quick fixes doc ([619728d](https://github.com/moiseev1991-stack/Colaba/commit/619728d2ced82fa74d44c95a4b78932d2880e9e2))
* **deploy:** remove host port mapping to fix Coolify port conflict ([d925d6a](https://github.com/moiseev1991-stack/Colaba/commit/d925d6aa5b5e5507c1843ead40def2966ce637fa))
* **deploy:** require .env and add .env.prod.example ([03c226d](https://github.com/moiseev1991-stack/Colaba/commit/03c226dcc98701a380e76df3c6e2b8daaf87a7fc))
* **deploy:** stop app containers before start to free port 8001/3000 ([8ef6e7e](https://github.com/moiseev1991-stack/Colaba/commit/8ef6e7e3656b63ac4c9ddb5c80aa74a87b7015fd))
* **deploy:** use GHCR images in docker-compose.prod.yml for GitHub Actions deploy ([5dbb469](https://github.com/moiseev1991-stack/Colaba/commit/5dbb4696d47d5105ffe665787fb7236a964409d0))
* **deploy:** USE_PROXY empty string + git submodules ([1d4e8d8](https://github.com/moiseev1991-stack/Colaba/commit/1d4e8d8ebaff143ce00871f7b49200582155b65d))
* **docker:** add start_period 90s for backend healthcheck ([7ecf70a](https://github.com/moiseev1991-stack/Colaba/commit/7ecf70ad97e434b06797910fc9be55b2368de76c))
* **docker:** add start_period 90s for frontend healthcheck ([e35643c](https://github.com/moiseev1991-stack/Colaba/commit/e35643c957fa602b5a8156749c4ca840558a021e))
* **docker:** Coolify-compatible docker-compose.prod.yml - remove nested variable substitution ([44fb7b5](https://github.com/moiseev1991-stack/Colaba/commit/44fb7b5769dc87dc6560a27e82dc541b7645ba9a))
* **docker:** postgres healthcheck use -d POSTGRES_DB to fix leadgen_user FATAL ([4ca5d4f](https://github.com/moiseev1991-stack/Colaba/commit/4ca5d4fb6aa1a98118bea7c88cd4bfa33442e9eb))
* **docker:** remove backend healthcheck, use service_started for deps ([f01bd53](https://github.com/moiseev1991-stack/Colaba/commit/f01bd537ec986fcef36ff02b1fdabd22171adcda))
* **docker:** remove container_name for Coolify compatibility ([cbcd7c5](https://github.com/moiseev1991-stack/Colaba/commit/cbcd7c55b93d2d5f80abcede560c0b6b94fcd14d))
* **docker:** run migrations in backend startup, remove migrate service ([b5b57ea](https://github.com/moiseev1991-stack/Colaba/commit/b5b57ea8145c26f9a27b344cba4dd8c9e372d34a))
* **docker:** use port 8001 for backend (8000 used by Coolify) ([1204ff9](https://github.com/moiseev1991-stack/Colaba/commit/1204ff921da72a14b9da77e20bc3623ed70cb28f))
* entrypoint always resolves backend via internal DNS, ignores external INTERNAL_BACKEND_ORIGIN ([344bd5b](https://github.com/moiseev1991-stack/Colaba/commit/344bd5b2c89911ac5fc819d2eb1423041ba69dcf))
* FAQ accordion animation and subscription button redirect ([ab525d9](https://github.com/moiseev1991-stack/Colaba/commit/ab525d95d8e3743bd737d90f39ceb39473c52b36))
* **frontend:** add explicit metadata and charset to layout ([be48381](https://github.com/moiseev1991-stack/Colaba/commit/be483810136726048def07f1673b6370ed2465e8))
* **frontend:** add missing FilterBuilder.tsx imported by leads page ([75e9c7c](https://github.com/moiseev1991-stack/Colaba/commit/75e9c7cf6aade8470e096d39596f6c144b038432))
* **frontend:** client-only rendering to prevent hydration errors ([2d87eed](https://github.com/moiseev1991-stack/Colaba/commit/2d87eed02c1212e6e7ac6d1b9dba8cf7b9c78315))
* **frontend:** ClientOnly wrapper to prevent hydration errors ([19e63fb](https://github.com/moiseev1991-stack/Colaba/commit/19e63fbda81e515bcf90113d1e8e285914149dca))
* **frontend:** correct comment - hydration not commit ([4194ec4](https://github.com/moiseev1991-stack/Colaba/commit/4194ec45a537cb1e3b2465a08426a5f8e415d02d))
* **frontend:** disable SSR at layout level to prevent hydration errors ([35b0192](https://github.com/moiseev1991-stack/Colaba/commit/35b0192535974388cfebc09aa8c71667bea1731f))
* **frontend:** disable SSR for AppShell to fix React [#418](https://github.com/moiseev1991-stack/Colaba/issues/418)/[#423](https://github.com/moiseev1991-stack/Colaba/issues/423) hydration ([aa3f7d0](https://github.com/moiseev1991-stack/Colaba/commit/aa3f7d0acf99a6366540e647afb63b7931a5f02d))
* **frontend:** displayUrl type - exclude undefined for DetailHeader ([e4c076a](https://github.com/moiseev1991-stack/Colaba/commit/e4c076a40daa59c9f3db9de832607fc405ace3c5))
* **frontend:** downgrade Next.js to 14.1.0 to fix HTML generation bug ([e18e904](https://github.com/moiseev1991-stack/Colaba/commit/e18e904d183297b8b0f807a791733a71f51cdc61))
* **frontend:** Error Boundary Рё suppressHydrationWarning РїСЂРѕС‚РёРІ Р±РµР»РѕРіРѕ СЌРєСЂР°РЅР° ([954d361](https://github.com/moiseev1991-stack/Colaba/commit/954d3618d169c98215d078e481aad9bb22e76c93))
* **frontend:** force-dynamic API proxy; docs: admin URL on prod and 404 checklist ([e7b6455](https://github.com/moiseev1991-stack/Colaba/commit/e7b6455aeb38a9e3bba0cc11216bb4f3269c4b22))
* **frontend:** reduce hydration errors, add favicon ([6e53eb3](https://github.com/moiseev1991-stack/Colaba/commit/6e53eb371f6a7635ed8614b5af93ee3e443ff994))
* **frontend:** remove ClientOnly to fix React [#423](https://github.com/moiseev1991-stack/Colaba/issues/423) hydration errors ([840a791](https://github.com/moiseev1991-stack/Colaba/commit/840a791384e4a0352435ea19ff475eed1b71b597))
* **frontend:** remove Inter font to reduce hydration [#418](https://github.com/moiseev1991-stack/Colaba/issues/418) ([4f1a902](https://github.com/moiseev1991-stack/Colaba/commit/4f1a90252ab17d25b0189e5d90a082fe78aa0f36))
* **frontend:** remove theme Script, use useEffect only; disable StrictMode ([7c0ead4](https://github.com/moiseev1991-stack/Colaba/commit/7c0ead46e329ce653e95a119bc205a9f84f9e2be))
* **frontend:** remove unused getResultsPageSize import (TS6133) ([80b5a4a](https://github.com/moiseev1991-stack/Colaba/commit/80b5a4a5f32e07dc7bc1b23c771e0bd0dfaa4e64))
* **frontend:** resolve React [#418](https://github.com/moiseev1991-stack/Colaba/issues/418)/[#423](https://github.com/moiseev1991-stack/Colaba/issues/423) and HierarchyRequestError ([71de5a3](https://github.com/moiseev1991-stack/Colaba/commit/71de5a3ccaa790cb0ad4cec7015f94e1b373e00c)), closes [div#__next](https://github.com/div/issues/__next) [div#portal-root](https://github.com/div/issues/portal-root)
* **frontend:** Script beforeInteractive->afterInteractive to fix hydration ([#418](https://github.com/moiseev1991-stack/Colaba/issues/418),[#423](https://github.com/moiseev1991-stack/Colaba/issues/423)) ([ba1ef24](https://github.com/moiseev1991-stack/Colaba/commit/ba1ef24cbd51232c1ffda0dfda6ccfe4e9a6d624))
* **frontend:** simplify layout to minimum to debug HTML generation issue ([33c8338](https://github.com/moiseev1991-stack/Colaba/commit/33c8338fe9a2217b3f94aaff726848d0d026536e))
* **frontend:** simplify layout, remove dynamic import causing HTML issues ([0af8a85](https://github.com/moiseev1991-stack/Colaba/commit/0af8a8572eb0ec333855c88c6996e4ceba425d0f))
* **frontend:** update package-lock.json for Next.js 14.1.0 ([06080dc](https://github.com/moiseev1991-stack/Colaba/commit/06080dc50e85ca0068d41c5cc8f1a60a4050a8c6))
* **frontend:** use ClientHydrationFix to avoid React [#418](https://github.com/moiseev1991-stack/Colaba/issues/418)/[#423](https://github.com/moiseev1991-stack/Colaba/issues/423) ([891cae7](https://github.com/moiseev1991-stack/Colaba/commit/891cae72c70b3473b3508f48fec72c32226d2839))
* **frontend:** wrap useSearchParams in Suspense for /auth/register prerender ([407d472](https://github.com/moiseev1991-stack/Colaba/commit/407d472896ef22533ed319e8f3537c032e93f486))
* hardcode /api/v1 base URL in client - remove NEXT_PUBLIC_API_URL dependency ([b0710b5](https://github.com/moiseev1991-stack/Colaba/commit/b0710b5312af93420bb076c1aae9c3e7014ace18))
* **init_test_db:** use engine.begin() and WHERE NOT EXISTS for test user insert ([3d55f6b](https://github.com/moiseev1991-stack/Colaba/commit/3d55f6befd9b4db624ee607d06ddb5e02381bc68))
* landing FAQ accordion and Benefits section improvements ([a96f86d](https://github.com/moiseev1991-stack/Colaba/commit/a96f86d2b1688cf77ac7b93cae6871fa02fd3c99))
* layout - dev direct ClientRoot, prod dynamic ssr:false to fix hydration ([d133998](https://github.com/moiseev1991-stack/Colaba/commit/d133998eaca40c0c381e37c9453759c4bb717523))
* mobile UX fixes and desktop nav redesign ([93c33bd](https://github.com/moiseev1991-stack/Colaba/commit/93c33bd2eb88aa6ab77331e43c9382277316b74c))
* navigate to run details using window.location.href to bypass router issue ([4a150f4](https://github.com/moiseev1991-stack/Colaba/commit/4a150f47f725157769ac64cb70e2b87d1e8f371f))
* proxy not resolving backend on Coolify - add entrypoint early-exit, rewrite proxy to use fetch ([8d9ed96](https://github.com/moiseev1991-stack/Colaba/commit/8d9ed9654d91cb0c07d8c839a650405ea4df23ad))
* **proxy:** lazy-resolve BACKEND_ORIGIN at request time to bypass webpack inlining ([bcada60](https://github.com/moiseev1991-stack/Colaba/commit/bcada60123ad8ff38ed4030ae27f262730e52545))
* **proxy:** write backend IP to /etc/hosts at startup for reliable getaddrinfo resolution ([4b0a635](https://github.com/moiseev1991-stack/Colaba/commit/4b0a63577d7b6413c89349c33cec71e172a5c33d))
* React hydration errors - remove inline theme script, fix LeadsTable init ([1907eef](https://github.com/moiseev1991-stack/Colaba/commit/1907eef51b8e43b165e99411dda269ca2a6c3f18))
* remove eslint-disable comment for non-existent no-require-imports rule ([40983e5](https://github.com/moiseev1991-stack/Colaba/commit/40983e5bd6eaee61b245bebd5436a0da97afd47e))
* remove eslint-disable for undefined rule no-explicit-any ([8450b6a](https://github.com/moiseev1991-stack/Colaba/commit/8450b6aff57d39008b779a6377d79aea4ed28108))
* remove unused focusClass variable in DesktopModuleTabs (TS6133) ([7ce2f0c](https://github.com/moiseev1991-stack/Colaba/commit/7ce2f0c53e32295fe2064e7e7c849c509ba2c154))
* remove unused search variable in leads page (TS6133) ([38be405](https://github.com/moiseev1991-stack/Colaba/commit/38be4053b334fb2b0d7d44cdd2e1f5c06648e923))
* replace datetime.utcnow() with datetime.now(timezone.utc) to fix 500 on searches and dashboard ([5151df3](https://github.com/moiseev1991-stack/Colaba/commit/5151df38ea41fe2b00648fcc1dd27f9323ed5710))
* replace fetch with http.request+lookup:ipv4 in proxy to fix EAI_AGAIN Docker DNS ([7a0c1fe](https://github.com/moiseev1991-stack/Colaba/commit/7a0c1fea454036ee9f72f81da40024556c225ffe))
* resolve backend IP via child subprocess at request time, bypass broken DNS in long-running process ([4fdf9e6](https://github.com/moiseev1991-stack/Colaba/commit/4fdf9e66d95d09442d60a85ca04fdd526bcd0345))
* resolve EAI_AGAIN DNS error in proxy - use resolve4 to force IPv4-only DNS lookup for backend hostname ([876333d](https://github.com/moiseev1991-stack/Colaba/commit/876333d143fdb7b335b0bb83b3d1927cbf1533f4))
* resolve login timeout - correct NEXT_PUBLIC_API_URL default and INTERNAL_BACKEND_ORIGIN ([004f587](https://github.com/moiseev1991-stack/Colaba/commit/004f587c8c6187c96efc3acb17c7d26733ad3f5b))
* resolve Next.js root layout missing html tags - change Docker WORKDIR from /app to /frontend to fix webpack module ID collision in Next.js 14 App Router; restore layout.tsx, middleware.ts, next.config.js to clean state ([bfa9d93](https://github.com/moiseev1991-stack/Colaba/commit/bfa9d9316a305237492b16dbddfc3c48bac6e74c))
* restore Inter font, ClientOnly only in prod, add deployment docs ([1fcd79a](https://github.com/moiseev1991-stack/Colaba/commit/1fcd79aae64d6b6b217fc68a5c6a85cfd1d7ed33))
* restore navigation after token expiry in Dashboard and History ([9bd5252](https://github.com/moiseev1991-stack/Colaba/commit/9bd525298d847d3caf4287d16a311642d174145e))
* retry resolve4 up to 3x + pre-warm DNS cache at startup to fix transient EAI_AGAIN ([04c65e8](https://github.com/moiseev1991-stack/Colaba/commit/04c65e8c34bd1420452f2897bd10daacf1765faa))
* revert to global resolve4 (uses iptables DNAT), remove setServers that bypasses Docker DNS redirect ([5b06e00](https://github.com/moiseev1991-stack/Colaba/commit/5b06e00dd1d34887eb59de492aa8349747e5558b))
* set INTERNAL_BACKEND_ORIGIN to backend sslip.io URL for frontend service in prod compose ([67acbda](https://github.com/moiseev1991-stack/Colaba/commit/67acbdaa04f47201b7849a6f094fea550905f97a))
* simplify layout - ClientRoot only, restore local dev ([d404cc5](https://github.com/moiseev1991-stack/Colaba/commit/d404cc5861850cb71f57bbc7078929984839b564))
* skip redirect on 401 from auth endpoints so login error stays visible ([b054ace](https://github.com/moiseev1991-stack/Colaba/commit/b054ace552d5805c7ded5857bd156d8586724a78))
* switch frontend from next dev to next build+start to fix Edge Runtime EvalError in middleware ([7cbd2c1](https://github.com/moiseev1991-stack/Colaba/commit/7cbd2c1cd528c3d8d06321651628a229c80be2f3))
* **tests:** Fix 9 failing CI backend tests ([11c74db](https://github.com/moiseev1991-stack/Colaba/commit/11c74db14f46b9e7fedcadeb7d44b197c6d753c1))
* **tests:** use NullPool in test env + session-scoped asyncio loop to fix InterfaceError ([8bf7562](https://github.com/moiseev1991-stack/Colaba/commit/8bf75623731ccad4d207e557f07080866ae78362))
* use 'as unknown as NodeJS.ProcessEnv' for env cast ([cd9b223](https://github.com/moiseev1991-stack/Colaba/commit/cd9b22370a61d1fbf7561a2537848913f5bf9774))
* use bracket notation for env var + async dns.resolve4 fallback ([d3f581c](https://github.com/moiseev1991-stack/Colaba/commit/d3f581ca53aff0c870ec2088518e7a32db250187))
* use datetime.utcnow() for TIMESTAMP WITHOUT TIME ZONE columns - asyncpg 0.29 rejects aware datetimes ([21f33f2](https://github.com/moiseev1991-stack/Colaba/commit/21f33f2eb05a4dc217a082b86e2e85d06c7a5154))
* use dns.lookup (getaddrinfo) instead of resolve4 (c-ares) in entrypoint and route handler subprocess ([f459651](https://github.com/moiseev1991-stack/Colaba/commit/f45965144994b48d4a03ac47c5f1ea8806713ca8))
* use dns.resolve4 (c-ares) to resolve backend IP before http.request, bypassing libc EAI_AGAIN ([c24a16a](https://github.com/moiseev1991-stack/Colaba/commit/c24a16a73ec819bd2792118c2132dc2e2b2d4120))
* use dns.resolve4 in subprocess instead of dns.lookup (getaddrinfo EAI_AGAIN) ([dd04668](https://github.com/moiseev1991-stack/Colaba/commit/dd04668fcbe7d8436478d318513c00a7ed591152))
* use process.execPath instead of 'node' to spawn subprocess (PATH not set in Next.js process) ([7c64216](https://github.com/moiseev1991-stack/Colaba/commit/7c64216a8003be9302811f675c7ff3c32f2d0af6))
* use require('fs') without node: prefix and wrap env access to bypass webpack inlining ([cf01736](https://github.com/moiseev1991-stack/Colaba/commit/cf01736cf6548678878b9b9cd02d9d478cf70aa2))
* write resolved IP to /tmp/backend-origin file, read at runtime to bypass webpack env inlining ([a1c0f8b](https://github.com/moiseev1991-stack/Colaba/commit/a1c0f8b51a13b6403695e66f548b983a1c209ea4))
* описание изменений ([fb6196c](https://github.com/moiseev1991-stack/Colaba/commit/fb6196cce6bca5cf6c5f2cd4ec95737e46ea47af))
* СЂР°Р·СЂРµС€РёС‚СЊ Р·Р°Р»РѕРіРёРЅРµРЅРЅС‹Рј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРј РІРёРґРµС‚СЊ РіР»Р°РІРЅСѓСЋ СЃС‚СЂР°РЅРёС†Сѓ (Р»РµРЅРґРёРЅРі) ([f99d4c1](https://github.com/moiseev1991-stack/Colaba/commit/f99d4c1aaeb411407de02f4c39bfb1563a6c7cb3))


### Features

* add city selector, search controls refactor, and test scripts ([b89c6d4](https://github.com/moiseev1991-stack/Colaba/commit/b89c6d4ba9f01e23453b57348f8307cc456832fa))
* **admin:** админка SQLAdmin, человекочитаемые данные, i18n RU/EN, документация ([01f032d](https://github.com/moiseev1991-stack/Colaba/commit/01f032d04daf08e4b4252dfb36c403a1efcd3170))
* **deploy:** Traefik labels РґР»СЏ РґРµРїР»РѕСЏ РёР· /opt/colaba (РІР°СЂРёР°РЅС‚ Р‘) ([50567a5](https://github.com/moiseev1991-stack/Colaba/commit/50567a5dd25aea56fb72a8cd70600282134ef57a))
* **email:** DB-backed mail config, UI, outreach, tests, and docs ([5dcaf87](https://github.com/moiseev1991-stack/Colaba/commit/5dcaf87693846dac3b2399c8acd5a58c5e4a94db))
* **frontend:** Add outreach templates (KP) and bulk email send ([073b012](https://github.com/moiseev1991-stack/Colaba/commit/073b0125c781ce4d506cfd8ad7b53c5dd04b9c98))
* **frontend:** mobile layout, sticky CTA bar, SEO runs list ([fee5050](https://github.com/moiseev1991-stack/Colaba/commit/fee5050d88077762dc86ba8dfe31a9f8902e8205))
* **frontend:** unify empty states, add campaign drill-down, disable WIP modules ([a6b2216](https://github.com/moiseev1991-stack/Colaba/commit/a6b221698420826be5f802569c2a744a20464717))
* **landing:** registration block 2-col grid + LeadDemoPanel, GitHub fixes ([ec43959](https://github.com/moiseev1991-stack/Colaba/commit/ec439597e2f151e61cd97c248c0cfdd295d39f56))
* mobile responsive redesign - sidebar slim, header tabs, mobile module tabs ([49dbb1e](https://github.com/moiseev1991-stack/Colaba/commit/49dbb1e770463051c0a2046b031b123da247d014))
* performance, production build, auth fix, new backend modules ([2c611fa](https://github.com/moiseev1991-stack/Colaba/commit/2c611faaad76d17c1b2f63bc9278c99648df6218))
* show SEO run results inline, improve input border visibility ([59c2caa](https://github.com/moiseev1991-stack/Colaba/commit/59c2caa414d2b4fc16c84ffc0d599b5d9a678c4c))
* реальное отображение SEO результатов в реальном времени - Сортировка по score, умная сортировка с учетом статуса, кнопка аудита только для необработанных, SEO данные сразу, пост-аничное сохранение, постоянный polling ([0092bab](https://github.com/moiseev1991-stack/Colaba/commit/0092babc68dfb09acdaf11ba442d748c8483f535))
* РЅРѕРІС‹Р№ Р»РѕРіРѕС‚РёРї SpinLid, РєРЅРѕРїРєР° РљСѓРїРёС‚СЊ РїРѕРґРїРёСЃРєСѓ, UI СѓР»СѓС‡С€РµРЅРёСЏ ([f3313c5](https://github.com/moiseev1991-stack/Colaba/commit/f3313c5c576868e6d8bad08d8380cf3da117ef6e))

## [Unreleased]

### Added

- Глобальная конфигурация email (`email_config`): Hyvor Relay или SMTP/IMAP из UI и SQLAdmin, API `/email/settings`, зависимость `aiosmtplib`.
- Страница «Настройка email» (`/app/email/settings`), клиент `emailSettings.ts`, пункт в сайдбаре.
- Миграции Alembic для email-модуля и `email_config` (ревизия 013).
- Тесты `tests/test_email_outreach_config.py`; настройка pytest (asyncio session scope, `ENVIRONMENT=test` в conftest).

### Fixed

- Прокси Next.js в dev: по умолчанию upstream `http://127.0.0.1:8001` вместо недоступного hostname `backend` на хосте.
- Outreach и `GET /outreach/config` используют `EmailService` и настройки из БД.

### Documentation

- Обновлены `docs/STATUS.md`, `docs/guides/LOCAL_SETUP.md`, `docs/deployment/WORKLOG.md`, `docs/changes/email-config-local-dev-pytest-2026-04-21.md`.

### Deployment

- После обновления `backend/requirements.txt` необходима **пересборка** Docker-образа backend.

## [0.1.0] - 2026-03-16

### Added
- Initial project setup with FastAPI backend and Next.js frontend
- User authentication with JWT tokens (access + refresh)
- Organization management with roles (OWNER, ADMIN, MEMBER)
- SEO audit module
- Lead generation module
- Government tenders module
- Dashboard with statistics
