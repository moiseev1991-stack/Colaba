# DESIGN.md — дизайн-стандарт SpinLid (машиночитаемый)

> Правила для ИИ-агентов и разработчиков. Источники: адаптация
> [emilkowalski/skills](https://github.com/emilkowalski/skills) (design engineering,
> Linear), [Vercel Design Engineering](https://vercel.com/blog/design-engineering-at-vercel),
> [Linear vs Vercel motion](https://www.designmd.co/blog/linear-vs-vercel-motion),
> [Linear DESIGN.md breakdown](https://www.designmd.supply/guides/linear.app),
> [NN/g + web.dev CLS](https://web.dev/articles/cls).
> Нарушение правила = баг. Исключение — только с комментарием в коде почему.

## 1. Токены — единственный источник цветов

- Цвет: только классы `ui-*` (`text-ui-text`, `bg-ui-surface-2`, `border-ui-border`,
  `text-ui-accent`, `text-ui-danger/warning/success/info`) и сигнальная шкала
  `signal-*` (через `[var(--signal-*)]`-идиому). **Запрещено**: сырой Tailwind
  (`slate-*`, `gray-*`, `emerald-*`…), инлайн `style={{ color: 'hsl(var(--…))' }}`,
  hex-литералы. Новые цвета → сначала токен в `globals.css` + маппинг в `tailwind.config.js`.
- Размер текста: 6-ступенчатая шкала (`text-xs/small/sm/base/xl/heading/hero`).
  **Запрещено** `text-[13px]`-арбитраж: 11–12px→`text-xs`, 13→`text-small`, 14–15→`text-sm`.
- Радиус: `rounded-control/card/panel/pill`. Тени: `shadow-raised/floating/overlay`.
- `text-hero` — только лендинги. Заголовок страницы кабинета — всегда
  `PageHeader` (`text-heading`).

## 2. Структура страницы — сетка не прыгает

- Каждый экран кабинета: `PageContainer` (1232px = шапка). Узкие формы —
  `PageColumn` (760px) внутри. Full-bleed только чат и онбординг.
- Заголовок: `PageHeader` из `@/components/ui/page` (крошки → `breadcrumbs`).
- Не задавать странице собственный `max-w-*`. Скроллбар уже стабилен
  (`scrollbar-gutter: stable`) — не отключать.
- Loading-ветка рендерится в контейнере той же ширины, что контент.

## 3. Компоненты — используем существующие

- Кнопка: `Button` / `buttonClass()` (`@/components/ui/button`). Сырой `<button>` —
  только для нестандартных контролов (тогл-чипы, кастомные чекбоксы) и с
  `buttonClass`-стилем.
- Бейдж/статус: `Badge` (`tone/size/icon`). `SignalPill` — легаси-обёртка, новые
  использования — `Badge`.
- Поля: `Input/Select/Textarea` (`fieldClass`). Пустые состояния: `EmptyState`;
  ошибка — `ErrorState`. Загрузка списков/таблиц: `Skeleton`.
- Диалоги/шторки: `Dialog`/`Drawer`. Тосты: `toast.*`. Подтверждения: `confirmDialog()`.
- Карточки: `CardV2` (`interactive` → hover-подъём).

## 4. Моушен — сдержанность Linear/Vercel

Токены (в `globals.css` + Tailwind `duration-*/ease-*`):

- `--duration-fast: 120ms` (нажатия, hover-цвета), `--duration-base: 200ms`
  (дропдауны, панели), `--duration-slow: 280ms` (диалоги, шторки). **Всё ≤ 300мс.**
- Изинги: вход — `--ease-enter` = `cubic-bezier(0.23, 1, 0.32, 1)` (ease-out);
  движение по экрану — `--ease-move` = `cubic-bezier(0.77, 0, 0.175, 1)`;
  hover-цвета — обычный `ease`.
- Вход: с `opacity: 0` + `scale(0.95)` (никогда с `scale(0)`). Нажатие:
  `scale(0.97)` (`:active`). Анимировать только `transform` и `opacity`.
- Частые действия (100+/день: табы, чекбоксы) — без анимации или ≤ 100мс.
- `prefers-reduced-motion`: убрать движение, оставить цвет/прозрачность.
- Hover-эффекты — только под `@media (hover: hover) and (pointer: fine)`.

## 5. Типографика

- Заголовки: `tracking-tight` (−0.01…−0.02em) уже в шкале — не добавлять произвольный letter-spacing.
- Таблицы и числа: `tabular-nums` (уже глобально на `table`).
- Основной шрифт — Manrope; `font-display` (Unbounded) — только лендинги
  (в кабинете переменная схлопнута в Manrope — не используйте `font-display` в `/app/**`).

## 6. Фокус и доступность

- Базовый фокус — глобальный `outline: 2px accent/50, offset 2px` на
  `:focus-visible` (кнопки/ссылки/поля). Не отключать (`outline: none` без замены — баг).
- Размер цели ≥ 24×24px (WCAG 2.5.8); иконочные кнопки — `size="icon"`.
- Активное состояние меню/вкладок — визуально явное (подсветка/aria-selected).

## 7. Anti-slop — признаки, которые не возвращаются

- ❌ Эмодзи в продуктовом UI (иконки — lucide). ❌ Градиентный текст и mesh-фоны
  в кабинете (единственный градиент — логотип). ❌ Пилюли «NEW»/«ФИШКА».
  ❌ «в один клик», «магия», первые лица в статусах («Загружаю…» → «Загрузка…»).
  ❌ Маркетинговые восклицания в продукте. ✅ Пустые состояния с пользой
  (что сделать дальше), ✅ честные ошибки с причиной и действием.

## 8. Мобайл

- `100vh` не использовать — `dvh` (iOS-прыжок адресной строки).
- Поля ввода ≥ 16px на мобиле (нет авто-зума iOS) — уже глобально.
- Тап-хайлайт отключён (`-webkit-tap-highlight-color: transparent`).

## Проверка перед PR

`npm run lint && npm run type-check` чисто; греппинг новых violations:
`grep -rn "text-\[1[0-9]px\]" frontend/app/app frontend/components` (0 ожидается),
`grep -rn "slate-\|gray-" <изменённые файлы>` (0 ожидается).
Скриншот ключевого экрана до/после — в PR.
