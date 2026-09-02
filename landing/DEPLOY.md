# Лендинг «Дмитрий» — маршрут `/razbor` на spinlid.ru

Изолированная посадочная страница оффера «автоматизация приёма клиентов» (персона «Дмитрий»).
С 2026-09 живёт **не на отдельном домене**, а как route в основном фронте Next.js:

- `https://spinlid.ru/razbor` — сама страница;
- `https://spinlid.ru/razbor/privacy` — политика конфиденциальности.

Обе страницы **без общего layout сайта**: ни шапки/футера/меню SpinLid, ни одной ссылки на остальной сайт.

## Где что лежит (в репозитории)

```
frontend/app/razbor/layout.tsx        ← свои метатеги/og/favicon (title.absolute — без «| SpinLid»)
frontend/app/razbor/page.tsx          ← сам лендинг + форма (client component)
frontend/app/razbor/privacy/page.tsx  ← политика
frontend/public/razbor/og.png         ← og-превью 1200×630 (уже сгенерирован)
frontend/public/razbor/favicon.svg    ← свой favicon (зелёная галочка, НЕ логотип SpinLid)
frontend/lib/public-paths.ts          ← /razbor и /razbor/privacy добавлены (нет кабинетного layout + грузится Метрика)
frontend/components/CookieBanner.tsx  ← cookie-баннер скрыт на /razbor (он вёл на /policy сайта)
```

Исходники прежней статики (`landing/index.html`, `landing/privacy/index.html`, `landing/og.svg`)
оставлены как эталон текстов — на прод НЕ заливаются.

## Перед сборкой — задать username бота

Ссылки «написать в Telegram» берут username из env фронта `NEXT_PUBLIC_RAZBOR_BOT`
(значение = `PUBLIC_BOT_USERNAME` из `.env` бэкенда, БЕЗ `@`). Если не задать — ссылки ведут в никуда.

- **Prod:** переменная должна быть в окружении сборки фронта (в `frontend/Dockerfile` / build args
  или в `.env`, который читает сборка). Проверить, что при `docker build` она попадает в бандл
  (Next вшивает `NEXT_PUBLIC_*` на этапе сборки, не в рантайме).
- Быстрый вариант без env: заменить дефолт `__PUBLIC_BOT_USERNAME__` в
  [frontend/app/razbor/page.tsx](../frontend/app/razbor/page.tsx) на реальный username и пересобрать.

## CORS — НЕ нужен (было на отдельном домене)

Форма шлёт `POST /api/v1/inbound-leads/public` **относительным** путём. Это same-origin:
браузер → Next (spinlid.ru) → прокси `app/api/v1/[...path]` → backend. Cross-origin-запроса из
браузера нет, CORS не задействуется.

➡️ Если в `.env` бэкенда ранее добавляли `spinlid-team.ru` в `CORS_ORIGINS` под старую схему —
**убрать его**, вернув:

```
CORS_ORIGINS=https://spinlid.ru
```

(домен spinlid-team.ru больше не используется под лендинг).

## Метрика

Счётчик Я.Метрики (ID `110073452`) уже грузится общим `components/YandexMetrika.tsx`
на всех публичных путях — `/razbor` добавлен в этот список. На успешную отправку формы
страница дёргает цель **`lead_form`** (`ym(110073452,'reachGoal','lead_form')`).
Цель `lead_form` должна существовать в интерфейсе Метрики (создать, если ещё нет).

## robots / sitemap

- `/razbor` **не добавлен** в `frontend/app/sitemap.ts` — намеренно (страница не для органики сайта).
- `noindex` НЕ ставим: в `robots.txt` путь разрешён (`Allow: /`), в метатегах `robots: index,follow`.
  Прямой заход и превью в мессенджерах работают.

## Деплой — обычный фронт-пайплайн (НЕ собирать на VPS)

Сборка фронта на VPS выключена (OOM убивает Traefik/Coolify). Схема:
**локальный `docker build` → `docker save` → `scp` → apply на проде.**

1. Локально (git-bash на Windows), Docker Desktop запущен:

   ```bash
   bash /e/cod/Colaba/scripts/deploy-local-frontend.sh
   ```

   Скрипт: `docker build -f frontend/Dockerfile` → `docker save` в tar →
   `scp` на `root@88.210.53.183:/tmp/colaba-frontend.tar`.

2. На проде применить образ:

   ```bash
   ssh -i ~/.ssh/colaba_server root@88.210.53.183
   bash /opt/colaba-src/scripts/deploy-prod-apply.sh
   ```

   (`git pull` в `/opt/colaba-src` подтянет свежий скрипт, если менялся.)

Никакой заливки файлов на сторонний хостинг и никакого отдельного SSL — всё под уже
выпущенным сертификатом spinlid.ru.

## Проверка после деплоя

1. `https://spinlid.ru/razbor` открывается по HTTPS; **нет** шапки/меню/футера SpinLid,
   нет ни одной ссылки на остальной сайт.
2. `https://spinlid.ru/razbor/privacy` открывается; «← На главную» ведёт на `/razbor` (не на сайт).
3. Вкладка браузера и og: заголовок без «| SpinLid»; favicon — зелёная галочка.
4. Мобильный вид (DevTools → 360 и 390 px): ничего не обрезано, кнопки ≥44px.
5. Форма: компания + контакт + согласие → «Получить бесплатный разбор» → зелёное «Готово!».
   Заявка должна прийти: в Telegram-личку владельца + на dmitry@ + в админку «Заявки»
   (сквозной тест на стороне backend).
6. Ссылки «написать в Telegram» ведут на `t.me/<bot>?start=landing`.
7. og-превью: кинуть `https://spinlid.ru/razbor` себе в Telegram — картинка + заголовок.
8. Метрика: визит виден, цель `lead_form` срабатывает после тестовой отправки.

## Плейсхолдеры (заполнить владельцу)

- `[фото]` в блоке «Кто я» ([page.tsx](../frontend/app/razbor/page.tsx)) — вставить реальное фото Дмитрия.
- `NEXT_PUBLIC_RAZBOR_BOT` — username бота на сборке фронта.
- Реквизиты в футере (`Реквизиты: [___]`) и в политике
  (`[___ ФИО / ИП / реквизиты ___]`, «Реквизиты оператора: [___]»).
- `/razbor/privacy` — показать юристу (в тексте стоит пометка-черновик).

## Чего на странице НЕТ (по ТЗ)

Нет: WhatsApp, упоминаний SpinLid, ссылок на остальной сайт, выдуманных кейсов/цифр,
второго CTA, слов «бот / CRM / интеграция / внедрение / автоматизация» в текстах для клиента.
