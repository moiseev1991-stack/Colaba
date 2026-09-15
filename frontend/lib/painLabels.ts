/**
 * Безымянные кластеры болей. Когда LLM не смог назвать кластер, бэкенд
 * сохраняет метку вида «Кластер 3» — пользователю такой чип ничего не говорит,
 * поэтому в интерфейсе их не показываем. Корень — именование кластеров на бэкенде.
 */
const UNNAMED_PAIN_RE = /^\s*кластер\s*№?\s*\d+\s*$/i;

export function isUnnamedPainLabel(label: string | null | undefined): boolean {
  return !label || UNNAMED_PAIN_RE.test(label);
}
