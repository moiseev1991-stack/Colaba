/**
 * 4 пресет-чипа для вкладки «Сайты» (Эпик F фокус-релиза «КП-конвейер»).
 *
 * Каждый пресет:
 *  - query — что юзер увидит в форме поиска (то же что entry в SiteLead)
 *  - hint  — какой смысл вкладываем в эту находку
 *  - kpTemplateKey — какой шаблон КП подходит лучше всего
 *
 * Если юзер вводит свободный запрос — entry_meaning на бэке = None,
 * и в промпт идёт только сам URL без трактовки.
 */

export interface SiteEntryPreset {
  query: string;
  label: string;
  hint: string;
  /** Подходящий шаблон КП — KpModal подхватит как defaultTemplateKey. */
  kpTemplateKey: string;
}

export const SITE_ENTRY_PRESETS: SiteEntryPreset[] = [
  {
    query: '© 2021',
    label: 'Старый копирайт «© 2021»',
    hint: 'Заброшенные сайты — кандидаты на редизайн',
    kpTemplateKey: 'webstudio',
  },
  {
    query: 'Joomla',
    label: 'Старая CMS «Joomla»',
    hint: 'Сайты на устаревшем движке — миграция',
    kpTemplateKey: 'webstudio',
  },
  {
    query: 'доставка по телефону',
    label: '«доставка по телефону»',
    hint: 'Нет интернет-магазина — продаём eCommerce',
    kpTemplateKey: 'webstudio',
  },
  {
    query: 'страница в разработке',
    label: '«страница в разработке»',
    hint: 'Недоделанные сайты — продаём готовый',
    kpTemplateKey: 'webstudio',
  },
];
