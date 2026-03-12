# Изменения: реальное отображение SEO результатов

**Дата:** 2025-03-12  
**Задача:** SEO результаты должны появляться сразу по мере обработки сайтов, а не ждать нажатия кнопки аудита

---

## 1. Сортировка по score по умолчанию

**Файл:** `frontend/components/LeadsTable.tsx`

**Изменение:**
- Дефолтная сортировка по полю `score` вместо `null`
- Порядок сортировки: `asc` (по возрастанию)

**Причина:**
- Чем ниже SEO score (0-100), тем лучше сайт
- Лучшие сайты должны быть выше в списке

**Код:**
```typescript
const [sortField, setSortField] = useState<SortField>('score');
const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
```

---

## 2. Умная сортировка с учетом статуса обработки

**Файл:** `frontend/components/LeadsTable.tsx`

**Изменение:**
- Обработанные сайты (`status !== 'processing' && seo`) отображаются вверху списка
- Необработанные сайты (в работе/без SEO данных) - в конце списка
- Среди обработанных - сортировка по score (по возрастанию)
- Среди необработанных - сортировка по domain

**Причина:**
- Избегать ситуацию когда все сайты показываются со score=0 пока в обработке
- Обработанные сайты с хорошим score должны быть наверху
- Пользователь видит прогресс: сначала необработанные, потом по мере обработки они появляются вверху

**Код:**
```typescript
} else if (sortField === 'score') {
  // Обработанные (status !== 'processing' и есть seo) — выше, необработанные — в конце
  const aProcessed = a.status !== 'processing' && a.seo;
  const bProcessed = b.status !== 'processing' && b.seo;
  
  if (aProcessed && !bProcessed) return -1;
  if (!aProcessed && bProcessed) return 1;
  
  // Среди обработанных — по score (asc: меньше = лучше = выше)
  if (aProcessed && bProcessed) {
    return sortOrder === 'asc' ? a.score - b.score : b.score - a.score;
  }
  
  // Среди необработанных — по domain
  return a.domain.localeCompare(b.domain);
}
```

---

## 3. Кнопка аудита для необработанных результатов

**Файл:** `frontend/components/LeadsTable.tsx`

**Изменение:**
- Условие для кнопки аудита: `!row.seo` вместо `!row.score`
- Исправлено во всех местах: compact view, all view, mobile view

**Причина:**
- Кнопка должна показываться только если нет SEO данных
- Score = 0 не должен скрывать кнопку аудита (это валидное значение)
- Когда SEO данные появляются, кнопка скрывается

**Изменения в 3 местах:**
```typescript
// Desktop compact view
{runId && !row.seo && (
  <Button variant="ghost" size="icon" onClick={...} title="SEO-аудит">
    <FileSearch className="h-3.5 w-3.5" />
  </Button>
)}

// Desktop all view  
{runId && !row.seo && (
  <Button variant="ghost" size="icon" onClick={...} title="SEO-аудит">
    <FileSearch className="h-3.5 w-3.5" />
  </Button>
)}

// Mobile view
{runId && !row.seo && (
  <Button variant="outline" size="sm" onClick={...} title="SEO-аудит">
    <FileSearch className="h-3 w-3" />
  </Button>
)}
```

---

## 4. Отображение SEO данных без обязательного details

**Файл:** `frontend/lib/searchResultMapping.ts`

**Изменение:**
- Проверка наличия `audit` объекта вместо `audit.details`
- SEO данные отображаются если есть `audit` объект

**Причина:**
- После сохранения результатов в `extra_data.audit` появляется сразу
- Не нужно ждать пока `audit.details` будет заполнен
- Это позволяет показывать результаты сразу как только домен обработан

**Код:**
```typescript
// Если audit нет совсем — возвращаем undefined
if (!audit) {
  return undefined;
}
```

---

## 5. Постраничное сохранение результатов поиска

**Файл:** `backend/app/queue/tasks.py`

**Изменение:**
- Для провайдеров кроме `yandex_xml` результаты коммитятся после каждого добавления
- `await db.commit()` вызывается для каждого результата

**Причина:**
- Реальное обновление результатов в процессе поиска
- `yandex_xml` уже работал так (постранично)
- Другие провайдеры (`yandex_html`, `google_html`, `duckduckgo`) должны работать так же
- Пользователь видит результаты по мере их появления

**Код:**
```python
# Save results immediately - commit after each for real-time updates
for item in results_data:
    domain = item.get("domain", "")
    if domain and is_blacklisted(domain, all_blacklist):
        continue
    
    result = SearchResult(
        search_id=search.id,
        position=item["position"],
        title=item["title"],
        url=item["url"],
        snippet=item.get("snippet"),
        domain=domain,
    )
    db.add(result)
    saved_count += 1
    # Track unique domains
    if domain and domain not in unique_domains:
        unique_domains[domain] = item["url"]
    # Commit immediately for real-time updates
    await db.commit()
```

---

## 6. Постоянное фетчинг результатов в процессе поиска

**Файл:** `frontend/app/app/seo/page.tsx`

**Изменение:**
- Добавлена проверка `isProcessing`
- Фетчинг результатов постоянно пока `status === 'processing' || 'pending'`

**Причина:**
- Результаты должны обновляться в реальном времени
- Не нужно ждать изменения `result_count` или `status`
- Polling каждые 2 секунды обеспечивает мгновенные обновления

**Код:**
```typescript
const isProcessing = searchStatus === 'processing' || searchStatus === 'pending';

// Always fetch results while processing to see real-time SEO updates
const needsResults = countChanged || statusChanged || auditActive || lastCountRef.current === -1 || isProcessing;
```

---

## Результат

Все изменения обеспечивают:
1. ✅ **Мгновенное появление результатов** - SEO данные появляются сразу после обработки домена
2. ✅ **Правильная сортировка** - лучшие сайты (низкий score) наверху, необработанные внизу
3. ✅ **Реальное обновление** - таблица перестраивается по мере обработки
4. ✅ **Быстрая реакция на кнопку поиска** - результаты через 3-5 секунд
