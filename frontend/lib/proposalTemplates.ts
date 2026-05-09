/**
 * Frontend-only CRUD for proposal templates.
 *
 * Stored in localStorage so the user can play with the editor before the
 * backend is wired up. Migrating to a real API later only needs to swap the
 * functions in this file — the React components don't care where the data
 * comes from.
 */

export type ProposalChannel = 'email' | 'telegram' | 'whatsapp' | 'max';

export interface ProposalTemplate {
  id: string;
  name: string;
  channel: ProposalChannel;
  /** Email subject line. Empty/ignored for messenger channels. */
  subject: string;
  /** Body with placeholders like {company}, {domain}, {city}, {contact},
   *  {my_name}, {my_company}, {my_offer}, {my_phone}, {my_link}. */
  body: string;
  signature: string;
  createdAt: number;
  updatedAt: number;
}

export interface SenderProfile {
  myName: string;
  myCompany: string;
  myOffer: string;
  myPhone: string;
  myLink: string;
}

/** Группа «О лиде» — данные, которые Colaba сама подставляет из найденной
 *  компании в момент отправки. Группа «О вас» — из профиля отправителя ниже
 *  по странице. Группировка нужна, чтобы пользователь сразу видел, *откуда*
 *  возьмётся значение каждой переменной. */
export type PlaceholderGroup = 'lead' | 'sender';

export const PLACEHOLDERS: Array<{
  key: string;
  label: string;
  example: string;
  group: PlaceholderGroup;
  hint: string;
}> = [
  // --- О лиде ---
  {
    key: 'company',
    label: 'Компания',
    example: 'ООО Стоматология Плюс',
    group: 'lead',
    hint: 'название найденной компании',
  },
  {
    key: 'domain',
    label: 'Сайт компании',
    example: 'stomplus.ru',
    group: 'lead',
    hint: 'домен сайта',
  },
  {
    key: 'city',
    label: 'Город',
    example: 'Москва',
    group: 'lead',
    hint: 'город из поискового запроса',
  },
  {
    key: 'contact',
    label: 'Контакт лида',
    example: 'info@stomplus.ru',
    group: 'lead',
    hint: 'email или телефон — что нашли первым',
  },
  // --- О вас ---
  {
    key: 'my_name',
    label: 'Ваше имя',
    example: 'Дмитрий Моисеев',
    group: 'sender',
    hint: 'из профиля ниже',
  },
  {
    key: 'my_company',
    label: 'Ваша компания',
    example: 'Colaba',
    group: 'sender',
    hint: 'из профиля ниже',
  },
  {
    key: 'my_offer',
    label: 'Ваша услуга',
    example: 'разработка сайта под ключ',
    group: 'sender',
    hint: 'что вы предлагаете',
  },
  {
    key: 'my_phone',
    label: 'Ваш телефон',
    example: '+7 999 123-45-67',
    group: 'sender',
    hint: 'из профиля ниже',
  },
  {
    key: 'my_link',
    label: 'Ваш сайт',
    example: 'colaba.ru',
    group: 'sender',
    hint: 'ссылка на ваш сайт или соцсеть',
  },
];

const TEMPLATES_KEY = 'colaba.proposalTemplates';
const SENDER_KEY = 'colaba.senderProfile';

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded / disabled storage — silently ignore. The UI keeps the
    // current in-memory state so the user doesn't lose what they just typed.
  }
}

function genId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listTemplates(): ProposalTemplate[] {
  const items = safeRead<ProposalTemplate[]>(TEMPLATES_KEY, []);
  // Heal old records that ended up with an empty id — early versions of the
  // editor used `?? genId()` instead of `|| genId()`, so empty strings slipped
  // through and broke deep-links like /proposals/{id}/edit. We assign a real
  // id once and persist, so the migration is one-shot.
  let needsMigration = false;
  const migrated = items.map((t) => {
    if (!t.id) {
      needsMigration = true;
      return { ...t, id: genId() };
    }
    return t;
  });
  if (needsMigration) safeWrite(TEMPLATES_KEY, migrated);
  return [...migrated].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getTemplate(id: string): ProposalTemplate | null {
  return listTemplates().find((t) => t.id === id) ?? null;
}

export function saveTemplate(
  input: Omit<ProposalTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): ProposalTemplate {
  const items = safeRead<ProposalTemplate[]>(TEMPLATES_KEY, []);
  const now = Date.now();
  if (input.id) {
    const existing = items.find((t) => t.id === input.id);
    if (existing) {
      const updated: ProposalTemplate = {
        ...existing,
        ...input,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      const next = items.map((t) => (t.id === existing.id ? updated : t));
      safeWrite(TEMPLATES_KEY, next);
      return updated;
    }
  }
  const created: ProposalTemplate = {
    ...input,
    // `||` not `??` — emptyTemplate() seeds id with "" and `??` would let it
    // slip through. Empty string here breaks deep-links to /edit.
    id: input.id || genId(),
    createdAt: now,
    updatedAt: now,
  };
  safeWrite(TEMPLATES_KEY, [...items, created]);
  return created;
}

export function deleteTemplate(id: string): void {
  const items = safeRead<ProposalTemplate[]>(TEMPLATES_KEY, []);
  safeWrite(
    TEMPLATES_KEY,
    items.filter((t) => t.id !== id),
  );
}

export function loadSenderProfile(): SenderProfile {
  return safeRead<SenderProfile>(SENDER_KEY, {
    myName: '',
    myCompany: '',
    myOffer: '',
    myPhone: '',
    myLink: '',
  });
}

export function saveSenderProfile(profile: SenderProfile): void {
  safeWrite(SENDER_KEY, profile);
}

/**
 * Strip the public suffix from a domain so we can use the bare brand as a
 * fallback "company name" — `stomplus.ru` → `Stomplus`.
 */
function brandFromDomain(domain: string): string {
  const bare = domain.replace(/^www\./, '').split('.')[0] ?? domain;
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : domain;
}

/**
 * Crude city sniff from the original search query like "стоматология Москва" —
 * grabs the last word if it starts with a capital cyrillic letter. Good enough
 * for a placeholder; the backend will fill this properly later.
 */
function cityFromQuery(query?: string | null): string {
  if (!query) return '';
  const tokens = query.trim().split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (!last) return '';
  return /^[А-ЯЁ]/.test(last) ? last : '';
}

export interface LeadValues {
  company?: string | null;
  domain?: string | null;
  city?: string | null;
  contact?: string | null;
  searchQuery?: string | null;
}

export interface RenderedProposal {
  subject: string;
  body: string;
  signature: string;
  fullText: string;
}

/**
 * Substitute placeholders in subject/body/signature for a single lead.
 * Missing values are rendered as a visible "—" so the user notices gaps
 * instead of getting silently broken `{contact}` strings in the wild.
 */
export function renderProposal(
  template: ProposalTemplate,
  lead: LeadValues,
  sender: SenderProfile,
): RenderedProposal {
  const company =
    (lead.company && lead.company.trim()) ||
    (lead.domain ? brandFromDomain(lead.domain) : '') ||
    '—';
  const city = (lead.city && lead.city.trim()) || cityFromQuery(lead.searchQuery) || '—';

  const dict: Record<string, string> = {
    company,
    domain: lead.domain || '—',
    city,
    contact: lead.contact || '—',
    my_name: sender.myName || '—',
    my_company: sender.myCompany || '—',
    my_offer: sender.myOffer || '—',
    my_phone: sender.myPhone || '—',
    my_link: sender.myLink || '—',
  };

  const apply = (s: string): string =>
    s.replace(/\{(\w+)\}/g, (_, key: string) => (key in dict ? dict[key] : `{${key}}`));

  const subject = apply(template.subject || '');
  const body = apply(template.body || '');
  const signature = apply(template.signature || '');

  // Channel-specific assembly. For email we glue subject+body+signature; for
  // messengers we drop the subject (no subject line) and keep body + signature.
  const fullText =
    template.channel === 'email'
      ? `${subject ? `Тема: ${subject}\n\n` : ''}${body}${signature ? `\n\n${signature}` : ''}`
      : `${body}${signature ? `\n\n${signature}` : ''}`;

  return { subject, body, signature, fullText };
}

export function emptyTemplate(channel: ProposalChannel = 'email'): ProposalTemplate {
  const now = Date.now();
  return {
    id: '',
    name: '',
    channel,
    subject: channel === 'email' ? 'Для {company} — {my_offer}' : '',
    body:
      'Здравствуйте, {company}!\n\n' +
      'Меня зовут {my_name}, я из {my_company}. Мы занимаемся: {my_offer}.\n\n' +
      'Зашёл к вам на {domain} — есть пара мыслей, как могли бы помочь. ' +
      'Готов созвониться на 15 минут и рассказать конкретно по {company}.\n\n' +
      'Удобный для вас способ связаться: {my_phone} или ответом на это письмо.',
    signature: '—\n{my_name}, {my_company}\n{my_phone} · {my_link}',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Готовый рабочий пример шаблона — с настоящим текстом письма. Юзер жмёт
 * «Загрузить пример» в редакторе и получает заполненный шаблон, чтобы увидеть,
 * как переменные превращаются в живой текст. Можно править под себя или
 * стереть и начать с нуля. Пример сделан для холодного письма SEO-агентства
 * стоматологии — это наиболее ходовой кейс по плану.
 */
export function sampleTemplate(channel: ProposalChannel = 'email'): ProposalTemplate {
  const now = Date.now();
  const baseBody =
    'Здравствуйте, {company}!\n\n' +
    'Меня зовут {my_name}, я из {my_company}. Зашёл на ваш сайт {domain} — у вас сильное направление, но в выдаче Яндекса по запросам в {city} вас обходят конкуренты помельче.\n\n' +
    'Мы делаем {my_offer}. Для одной клиники в {city} за 4 месяца вырастили органический трафик с 0 до 1200 заявок в месяц.\n\n' +
    'Если интересно — позвоню в удобное время, расскажу за 15 минут на пальцах. Мой телефон: {my_phone}.\n\n' +
    'Если не актуально — никаких писем больше не будет.';
  return {
    id: '',
    name: 'Пример: холодное письмо в стоматологию',
    channel,
    subject:
      channel === 'email' ? 'Для {company} — продвижение в Яндексе с гарантией' : '',
    body: baseBody,
    signature: '—\n{my_name}, {my_company}\n{my_phone} · {my_link}',
    createdAt: now,
    updatedAt: now,
  };
}
