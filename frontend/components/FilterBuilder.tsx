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
  { id: 'text', label: 'На сайте есть слово', kind: 'text' },
  { id: 'title', label: 'В заголовке (title)', kind: 'text' },
  { id: 'meta', label: 'В описании (meta)', kind: 'text' },
  { id: 'has_phone', label: 'Есть телефон', kind: 'bool' },
  { id: 'has_email', label: 'Есть email', kind: 'bool' },
  { id: 'has_telegram', label: 'Есть Telegram (скоро)', kind: 'bool', disabled: true },
  { id: 'domain', label: 'Домен', kind: 'text', placeholder: 'Например: example.ru' },
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
    <div
      className="grid gap-3 p-4"
      style={{
        background: 'hsl(var(--surface-2) / 0.5)',
        border: '1px solid hsl(var(--border))',
        borderRadius: 6,
      }}
    >
      {/* Header: title + top-level AND/OR + add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
            условия фильтра
          </span>
          {conditions.length >= 2 && (
            <div
              className="inline-flex items-center text-[11px] overflow-hidden"
              style={{ border: '1px solid hsl(var(--border))', borderRadius: 4 }}
            >
              {(['and', 'or'] as const).map((m) => {
                const active = logic === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={disabled}
                    onClick={() => updateLogic(m)}
                    className="px-2.5 h-7 transition-colors"
                    style={{
                      background: active ? 'hsl(var(--accent-weak))' : 'transparent',
                      color: active ? 'hsl(var(--accent))' : 'hsl(var(--muted))',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {m === 'and' ? 'И' : 'ИЛИ'}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={addCondition}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold transition-colors hover:bg-[hsl(var(--accent-weak))] disabled:opacity-50"
          style={{
            color: 'hsl(var(--accent))',
            border: '1px solid hsl(var(--accent) / 0.4)',
            borderRadius: 4,
          }}
        >
          <Plus className="h-3.5 w-3.5" /> добавить условие
        </button>
      </div>

      {conditions.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
          {emptyHint}
        </p>
      ) : (
        <div className="grid gap-2">
          {conditions.map((cond, idx) => {
            const kind = fieldKind(fields, cond.field);
            const ops = OPS_BY_KIND[kind];
            const isFirst = idx === 0;
            const fieldDef = fields.find((f) => f.id === cond.field);

            return (
              <div key={idx} className="grid gap-2">
                {!isFirst && (
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider px-1"
                    style={{ color: 'hsl(var(--muted))' }}
                  >
                    {logic === 'and' ? 'И' : 'ИЛИ'}
                  </div>
                )}
                {/* Flex over grid: select widths shrink only down to a min so
                    "На сайте есть слово" / "содержит" never get truncated to
                    "На с..." like in the previous grid-12 layout. The value
                    field takes the rest. */}
                <div className="flex flex-wrap gap-2 items-center">
                  <Select
                    value={cond.field}
                    onChange={(e) =>
                      updateCondition(idx, { field: e.target.value as FilterField })
                    }
                    disabled={disabled}
                    className="h-9 text-[13px]"
                    style={{ minWidth: 220, flex: '0 0 auto' }}
                  >
                    {fields.map((f) => (
                      <option key={f.id} value={f.id} disabled={f.disabled}>
                        {f.label}
                      </option>
                    ))}
                  </Select>

                  <Select
                    value={cond.op}
                    onChange={(e) =>
                      updateCondition(idx, { op: e.target.value as FilterOp })
                    }
                    disabled={disabled}
                    className="h-9 text-[13px]"
                    style={{ minWidth: 160, flex: '0 0 auto' }}
                  >
                    {ops.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>

                  <div style={{ flex: '1 1 200px', minWidth: 200 }}>
                    {kind === 'text' && (
                      <Input
                        type="text"
                        placeholder={fieldDef?.placeholder ?? defaultTextPlaceholder}
                        value={cond.value}
                        onChange={(e) => updateCondition(idx, { value: e.target.value })}
                        disabled={disabled}
                        className="w-full h-9 text-[13px]"
                      />
                    )}
                    {kind === 'bool' && (
                      <div
                        className="h-9 flex items-center text-[12px] px-3"
                        style={{
                          color: 'hsl(var(--muted))',
                          background: 'hsl(var(--surface) / 0.6)',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 4,
                        }}
                      >
                        {/* Bool operators don't need a value field — the op itself
                            ("да" / "нет") is the value. */}
                        —
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeCondition(idx)}
                    disabled={disabled}
                    aria-label="Удалить условие"
                    className="h-9 w-9 inline-flex items-center justify-center transition-colors hover:bg-[hsl(var(--danger) / 0.15)] disabled:opacity-50 shrink-0"
                    style={{
                      color: 'hsl(var(--muted))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 4,
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
