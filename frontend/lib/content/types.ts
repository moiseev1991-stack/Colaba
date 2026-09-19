/**
 * Статьи для поиска и нейросетей (19.09, @user): исследования на наших данных,
 * ответы на вопросы, сравнения и инструкции. Контент — данными, разметка — одна
 * (components/content/ArticleShell). Каждая статья начинается с блока «Кратко» —
 * прямого ответа, который удобно цитировать поисковикам и нейросетям.
 */

export type ArticleSection = 'issledovaniya' | 'stati';
export type ArticleKind = 'research' | 'question' | 'comparison' | 'guide';

export type ArticleBlock =
  /** Подзаголовок раздела; id — якорь для оглавления (латиница, через дефис). */
  | { type: 'h2'; id: string; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; head: string[]; rows: string[][]; caption?: string }
  /** Горизонтальные полосы — доли в процентах (value 0–100). */
  | { type: 'bars'; items: { label: string; value: number }[]; caption?: string }
  | { type: 'stats'; items: { value: string; label: string }[] }
  | { type: 'quote'; text: string; note?: string }
  | { type: 'callout'; title?: string; text: string };

export interface ArticleFaq {
  q: string;
  a: string;
}

export interface Article {
  slug: string;
  section: ArticleSection;
  kind: ArticleKind;
  /** <title> — до ~65 символов. */
  title: string;
  /** meta description — 140–170 символов. */
  description: string;
  h1: string;
  lead: string;
  /** «Кратко»: 3–5 пунктов с прямым ответом на вопрос статьи. */
  summary: string[];
  /** Дата публикации / обновления, YYYY-MM-DD. */
  published: string;
  updated: string;
  readMinutes: number;
  blocks: ArticleBlock[];
  faq: ArticleFaq[];
  /** Слаги других статей (любого раздела) и/или пути лендингов для перелинковки. */
  related: string[];
  /** Для исследований — описание набора данных (schema.org Dataset). */
  dataset?: { name: string; description: string; size: string; period: string };
}
