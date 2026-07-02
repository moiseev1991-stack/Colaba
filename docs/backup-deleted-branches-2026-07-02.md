# Backup: удалённые merged-ветки (2026-07-02)

Все ветки ниже были **влиты в `origin/main`** и удалены из GitHub 2026-07-02.
Сами коммиты остались в истории main (git их не удалит — это merged history).
При необходимости восстановить ветку по имени:

```powershell
git push origin <SHA>:refs/heads/<branch-name>
```

Альтернатива: локально созданы теги `archive/2026-07-02/<branch>` — можно
восстановить из тега: `git push origin archive/2026-07-02/<branch>:refs/heads/<branch>`

| Ветка | SHA | Последний commit |
|-------|-----|------------------|
| `chore/gitignore-multi-preset` | `b7242758b78e` | chore: .gitignore — IDE-метаданные, локальные пробники, prod-clone |
| `chore/security-hygiene` | `e169197da9c5` | chore(security): SQLAdmin authentication + Sentry integration |
| `feat/bulk-csv-export` | `4a933e1c8f5d` | feat(maps): чистка пресетов под 4 MVP-кейса + дропдаун экспорта + чек-лист для Chrome-агента |
| `feat/bulk-kp-review-page` | `65ab1e639df9` | refactor(kp-bulk): убрана модалка прогресса — partition page в новой вкладке |
| `feat/decision-maker-from-dadata` | `10eb62374f3d` | feat(maps): ЛПР из DaData — ФИО директора + подстановка в outreach + бейдж в drawer |
| `feat/drawer-digest-range-and-top-negatives` | `856f67c1ee45` | fix(maps): читаемые tabs sentiment, source-toggle в топ-негативе, синк selectedIds, has_website safety |
| `feat/email-config-and-docs` | `e7b6455aeb38` | fix(frontend): force-dynamic API proxy; docs: admin URL on prod and 404 checklist |
| `feat/google-maps-provider` | `982c04e69342` | feat(maps): третий источник — Google Maps через SerpAPI |
| `feat/health-providers-extended` | `dcb6445d910e` | feat(health): расширяем /maps/health/providers — DaData, LLM, Sentry, счётчики |
| `feat/hero-bg-mesh-redesign` | `dbb4a3da5526` | feat(hero): радикально новый фон hero — mesh-blobs + SVG-граф + dot-matrix |
| `feat/kp-bulk-generation` | `e93f3ed516bb` | feat(kp): bulk-генерация КП по выделению с прогрессом и отменой |
| `feat/kp-edit-and-save` | `1f669fbeb23f` | fix(kp,maps): диагностический 422 + понятный текст «парсер=0» |
| `feat/kp-job-send-bar` | `c4a5dc3deea9` | feat(kp-jobs): sticky send-bar с мультиселектом каналов + per-row кнопка |
| `feat/kp-job-table-polish-and-send-cta` | `6720337c1dfa` | feat(kp-jobs): полировка таблицы партии + disabled CTA «Отправить всем» |
| `feat/kp-per-row-send` | `07279cbb8699` | feat(kp-jobs): per-row кнопка «отправить эту КП» в таблице и drawer |
| `feat/kp-persist-sent-state` | `0c49cdbaa92d` | feat(kp-jobs): persist «✓ Отправлено» state на per-row кнопке после reload |
| `feat/kp-pipeline-backend` | `b6d1abdb7092` | fix(kp): close-to-integer проверка на исходном ratio, не на round(ratio,1) |
| `feat/kp-pipeline-frontend` | `5c02166f207e` | feat(kp): Эпик A frontend — кнопка КП в выдаче + KpModal + KpQuickBlock в drawer |
| `feat/kp-pipeline-migration-033` | `49b3c74ce537` | feat(kp): миграция 033 — kp_templates с сидом + kp_drafts + is_system на пресетах |
| `feat/kp-send-email-and-history` | `d5f604cc416b` | fix(kp-jobs): email из company_contacts + edit-кнопка в шапке drawer'а |
| `feat/kp-site-leads-backend` | `c1ea482aa6ef` | fix(kp): DELETE /site-leads/{id} — response_class=Response, не дефолтный |
| `feat/lpr-in-production-sheet-and-misc` | `1f2b67765085` | feat: ЛПР в «Производство сайта», пресеты/списки в sidebar, trust-strip на SEO |
| `feat/multi-preset-and-filters` | `7e1e55b74076` | feat(maps): Multi-preset AND — несколько пресетов фильтров одновременно |
| `feat/multi-source-companies` | `8181ae63a20d` | fix(maps): переименовать ORM relationship чтобы не конфликтовал с Pydantic-полем |
| `feat/mvp-demo-cases` | `88a162f5fc6b` | feat: MVP demo cases — 4 пресета под кейсы ТЗ + Excel-колонки + парсер скрипт |
| `feat/onboarding-3-steps` | `265b04ce6a73` | feat(onboarding): Эпик B — 3 шага до КП + demo-режим + автоактивация профессии |
| `feat/opf-filter-and-positive-recluster-fix` | `339674714057` | feat(kp-bulk): кнопка «Просмотреть →» рядом с каждой КП в модалке прогресса |
| `feat/pain-benchmark` | `f06e3cedd728` | fix(maps): шапка топ-болей выглядит более кликабельно |
| `feat/pain-summary-source-period` | `2a78099193c5` | feat(ux+docs): компактнее chart, скролл к отзывам, PROJECT_OVERVIEW |
| `feat/pain-tags-sentiment-positive` | `98d1f08df0e5` | fix(reviews_ai): обновить on_conflict в recluster под новый UNIQUE с sentiment |
| `feat/positive-empty-state` | `2d4be0abcfca` | feat(insights): empty-state для «Сильных сторон» до запуска позитивного recluster |
| `feat/profession-chips` | `2e61431d7c4b` | feat(maps): Эпик C — chips «Под профессию» над выдачей (Для веб-студий / SEO / маркетологов) |
| `feat/promo-signals-table` | `06f31ca773fc` | docs: брифы и аудит-протоколы (21.05 → 02.06) |
| `feat/seo-landings-auth-aware-and-polish` | `e5cfe9464ee2` | feat: SEO-лендинги auth-aware, компактный hero в /app/leads, стартовые пресеты |
| `feat/seo-light-icons-and-pricing` | `34ce7ee0d354` | feat(seo+pricing): принудительная светлая тема SEO, lucide-иконки, новые тарифы |
| `feat/seo-navigation-and-visuals` | `c7a7a8b5853c` | feat: SEO-страницы в навигации, перелинковка, демо-блок + секция «Решения» на главной |
| `feat/seo-pages-redesign-density-and-brand` | `e0440930bd12` | feat(seo): полная переработка SEO-лендингов — плотность, доказательство в hero, брендмарка |
| `feat/seo-webmaster-verification` | `96cd33c76263` | feat(seo): верификация Google/Yandex/Bing webmasters + защита админки от индексации |
| `feat/site-leads-migration-034` | `3ca03066cfdc` | feat(kp): миграция 034 — site_leads + kp_drafts.company_id nullable + site_lead_id |
| `feat/sites-tab-frontend` | `4cfcf62c4d73` | feat(sites): Эпик F шард 3 — вкладка «Сайты» с КП по найденным сайтам |
| `feat/stream-progress-and-positive-recluster` | `146b39e08f53` | fix(reviews_ai): _is_abstract_strength_label считает whitespace-only пустым |
| `feat/unify-source-filter-google` | `ebe0af199bbb` | feat(maps): объединить переключатель источника + поддержка Google в фильтре выдачи |
| `feat/wa-greenapi-connector` | `1dca0edfd294` | feat(kp-jobs): два пресета SendBar — «один лучший канал» и «во все каналы» |
| `feat/website-leads-and-metrika` | `0cb6ff1ed010` | feat(website-leads): антиспам ужесточён — origin/referer + UA + time-trap |
| `feature/maps-full` | `cdfa05fbba71` | chore(maps-ui): убираем неиспользуемую eslint-disable директиву в MapsSearchPanel |
| `fix/backfill-email-blocklist` | `08a66a8e0051` | chore(maps): backfill — чистим placeholder-email из БД |
| `fix/dialog-scroll-lock-and-backdrop` | `b2543e2017fb` | fix(dialog): блокируем скролл body и затемняем backdrop у right-drawer |
| `fix/digest-pain-clickable` | `bcfb5950896b` | fix(maps): кликабельный pain-tag — в правильном блоке |
| `fix/httpx-pin-kp-generate` | `fd5e0f704792` | fix(kp): пиним httpx<0.28 — KP /generate отдавал 422 на openai/anthropic |
| `fix/kp-allow-without-pains` | `e04cfe5a1c2f` | fix(kp): КП работает и для компаний без проанализированных болей |
| `fix/kp-job-send-bar-sticky` | `31646e7e4801` | fix(kp-jobs): send-bar sticky внутри потока + явные чекбоксы каналов |
| `fix/kp-jobs-id-next14-params` | `41e3a83c866e` | fix(kp-jobs): params как объект (Next.js 14), не Promise — ломало рантайм |
| `fix/kp-jobs-new-suspense` | `7cd3a5d6c763` | fix(kp-jobs-new): обернуть useSearchParams в Suspense — ломал next build |
| `fix/kp-skip-unconfigured-assistants` | `658371bc976c` | fix(tests): добавить fake api_key в _new_assistant_kwargs |
| `fix/maps-digest-sqlalchemy-case` | `19ed733e6ada` | fix(maps): /companies/{id}/digest падал с TypeError на func.case(else_=…) |
| `fix/maps-misc-bugs` | `40c44f0d7651` | fix(maps): drawer-счётчики по источнику, Reset/auto-apply фильтров, AI-422 диагноз |
| `fix/niche-block-runtime-guard` | `d81171a431ef` | fix(maps): NicheBenchmarkOverviewBlock — защита от undefined полей |
| `fix/no-website-preset-and-pain-cloud-layout` | `569f1b9617b8` | fix(maps): пресет «Нет сайта» меняет только has_website + компактнее блок болей |
| `fix/pain-tags-sentiment-filter` | `d97d3e266c30` | fix(maps): pain-теги на карточке только sentiment='negative' + приоритет выбранной плитки |
| `fix/presets-thresholds-and-dadata-placeholders` | `36521b4c424e` | fix(promo): таймер перенесён внутрь hero — 4 квадратные glassy-плитки |
| `fix/serpapi-env-compose` | `7eacb775858d` | fix(compose): пробрасываем SERPAPI_KEY в backend/celery-worker(-search) |
| `fix/sidebar-on-public-and-maps-hero-and-clone` | `98093d453720` | fix: sidebar на правовых/SEO, hero на «По картам», подвалы, переименование «Письмо под боль» |
| `fix/source-toggle-stuck-when-empty` | `6c45ff22c881` | fix(maps): переключатели «Источник/Период» не пропадают при пустых pain-тегах |
| `fix/ui-pipedrive-style` | `20da36ddfea7` | feat(maps): pain-tag → отзывы темы + chart динамики + ТОП-боли региона |
