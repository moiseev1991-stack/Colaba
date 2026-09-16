'use client';

/**
 * Wordstat-style filter builder for the search-launch form.
 *
 * Each row is one condition (field → operator → value). Rows are joined with
 * a single top-level AND/OR (no nested groups for now — flat is enough for
 * the cases users actually have in mind, and matches how the backend executes
 * the filter).
 *
 * The whole spec ends up in `config.filters` and is read back on the run page
 * so the same filter applies on every refresh.
 */

import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type FilterField = string;

export type FilterOp =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'is_true'
  | 'is_false';

export interface FilterCondition {
  field: FilterField;
  op: FilterOp;
  value: string;
}

export interface FilterSpec {
  logic: 'and' | 'or';
  conditions: FilterCondition[];
}

// Field metadata: which operators apply, what kind of value editor to render.
export type FieldKind = 'text' | 'select' | 'bool';

export interface FieldDef {
  id: FilterField;
  label: string;
  kind: FieldKind;
  disabled?: boolean;
  placeholder?: string;
}

// Дефолтный набор полей — для «По сайтам» (LegacyLeadsPanel).
// Другие места (например MapsSearchForm) передают свой набор через props.
// `disabled: true` — опция отображается в выпадашке, но браузер не даст её
// выбрать.
export const DEFAULT_SITE_FIELDS: FieldDef[] = [
  { id: 'text', label: 'Текст страниц сайта', kind: 'text' },
  { id: 'title', label: 'Заголовок (title)', kind: 'text' },
  { id: 'meta', label: 'Описание (meta)', kind: 'text' },
  { id: 'domain', label: 'Домен', kind: 'text', placeholder: 'Например: example.ru' },
  { id: 'has_phone', label: 'Есть телефон', kind: 'bool' },
  { id: 'has_email', label: 'Есть email', kind: 'bool' },
];

const OPS_BY_KIND: Record<FieldKind, Array<{ id: FilterOp; label: string }>> = {
  text: [
    { id: 'contains', label: 'содержит' },
    { id: 'not_contains', label: 'не содержит' },
    { id: 'equals', label: 'точно равно' },
    { id: 'not_equals', label: 'не равно' },
    { id: 'starts_with', label: 'начинается с' },
  ],
  select: [
    { id: 'equals', label: 'равен' },
    { id: 'not_equals', label: 'не равен' },
  ],
  bool: [
    { id: 'is_true', label: 'да' },
    { id: 'is_false', label: 'нет' },
  ],
};

function fieldKind(fields: FieldDef[], field: FilterField): FieldKind {
  return fields.find((f) => f.id === field)?.kind ?? 'text';
}

function defaultOpFor(fields: FieldDef[], field: FilterField): FilterOp {
  const kind = fieldKind(fields, field);
  return OPS_BY_KIND[kind][0]?.id ?? 'contains';
}

export function emptyFilterSpec(): FilterSpec {
  return { logic: 'and', conditions: [] };
}

interface FilterBuilderProps {
  value: FilterSpec;
  onChange: (next: FilterSpec) => void;
  disabled?: boolean;
  /** Набор доступных полей. По умолчанию — поля «По сайтам». */
  fields?: FieldDef[];
  /** Заглушка, когда условий нет. По умолчанию — пример для сайтов. */
  emptyHint?: string;
  /** Дефолтное значение в Input для каждого field.kind=text (если не задан placeholder в FieldDef). */
  defaultTextPlaceholder?: string;
}

export function FilterBuilder({
  value,
  onChange,
  disabled,
  fields = DEFAULT_SITE_FIELDS,
  emptyHint = 'Добавьте условие, чтобы фильтровать сайты — например, «На сайте есть слово содержит протезирование».',
  defaultTextPlaceholder = 'Например: протезирование',
}: FilterBuilderProps) {
  const { logic, conditions } = value;

  const updateLogic = (next: 'and' | 'or') => onChange({ ...value, logic: next });

  const firstField = fields[0]?.id ?? 'text';

  const addCondition = () =>
    onChange({
      ...value,
      conditions: [
        ...conditions,
        { field: firstField, op: defaultOpFor(fields, firstField), value: '' },
      ],
    });

  const removeCondition = (idx: number) =>
    onChange({ ...value, conditions: conditions.filter((_, i) => i !== idx) });

  const updateCondition = (idx: number, patch: Partial<FilterCondition>) =>
    onChange({
      ...value,
      conditions: conditions.map((c, i) => {
        if (i !== idx) return c;
        const next = { ...c, ...patch };
        // If the field changed, snap operator/value to defaults that fit the
        // new field kind — otherwise we'd leave nonsense like "Тип сайта :
        // не содержит : протезирование".
        if (patch.field && patch.field !== c.field) {
          next.op = defaultOpFor(fields, patch.field);
          next.value = '';
        }
        return next;
      }),
    });

  return (
    <div className="flex flex-col gap-2.5">
      {conditions.length >= 2 && (
        <div className="flex items-center gap-2 text-xs text-ui-text-muted">
          Условия выполняются
          <div role="group" aria-label="Как объединять условия" className="inline-flex gap-0.5 rounded-full bg-ui-surface-2 p-0.5">
            {(['and', 'or'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={logic === m}
                disabled={disabled}
                onClick={() => updateLogic(m)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  logic === m ? 'bg-ui-surface text-ui-text shadow-[0_1px_4px_rgba(0,0,0,0.12)]' : 'text-ui-text-muted hover:text-ui-text',
                )}
              >
                {m === 'and' ? 'все сразу (И)' : 'любое (ИЛИ)'}
              </button>
            ))}
          </div>
        </div>
      )}

      {conditions.length === 0 && <p className="text-xs text-ui-text-muted">{emptyHint}</p>}

      {conditions.map((cond, idx) => {
        const kind = fieldKind(fields, cond.field);
        const ops = OPS_BY_KIND[kind];
        const fieldDef = fields.find((f) => f.id === cond.field);
        return (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Где искать"
              value={cond.field}
              onChange={(e) => updateCondition(idx, { field: e.target.value as FilterField })}
              disabled={disabled}
              wrapperClassName="min-w-[200px] flex-none"
              className="h-10 w-full bg-ui-surface text-small"
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id} disabled={f.disabled}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Условие"
              value={cond.op}
              onChange={(e) => updateCondition(idx, { op: e.target.value as FilterOp })}
              disabled={disabled}
              wrapperClassName="min-w-[150px] flex-none"
              className="h-10 w-full bg-ui-surface text-small"
            >
              {ops.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            {kind === 'text' && (
              <Input
                aria-label="Слово"
                type="text"
                placeholder={fieldDef?.placeholder ?? defaultTextPlaceholder}
                value={cond.value}
                onChange={(e) => updateCondition(idx, { value: e.target.value })}
                disabled={disabled}
                className="h-10 min-w-[180px] flex-1 bg-ui-surface text-small"
              />
            )}
            {kind === 'bool' && <span className="min-w-[180px] flex-1" />}
            <button
              type="button"
              onClick={() => removeCondition(idx)}
              disabled={disabled}
              aria-label="Удалить условие"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ui-text-muted transition-colors hover:bg-ui-danger/10 hover:text-ui-danger disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        disabled={disabled}
        onClick={addCondition}
        className="inline-flex w-fit items-center gap-1.5 rounded-full px-1 py-1 text-small font-semibold text-ui-accent hover:underline disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> {conditions.length === 0 ? 'Добавить условие' : 'Ещё условие'}
      </button>
    </div>
  );
}
