'use client';

/**
 * Шаг 2 онбординга — «Где ищем клиентов?». Ниша + город (CityCombobox,
 * тот же, что на главной форме поиска). Под полем ниши — кликабельные
 * примеры: юзер не должен думать, что ввести.
 */

import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

import { CityCombobox } from '@/components/CityCombobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const NICHE_EXAMPLES = [
  'стоматологии',
  'автосервисы',
  'салоны красоты',
  'фитнес-клубы',
  'доставка еды',
  'ремонт квартир',
];

interface Props {
  initialNiche: string;
  initialCity: string;
  onSubmit: (niche: string, city: string) => void;
}

export function NicheCityStep({ initialNiche, initialCity, onSubmit }: Props) {
  const [niche, setNiche] = useState(initialNiche);
  const [city, setCity] = useState(initialCity);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = niche.trim();
    const c = city.trim();
    if (!n || !c) return;
    onSubmit(n, c);
  }

  const valid = niche.trim().length > 0 && city.trim().length > 0;

  return (
    <div>
      <h2 className="text-heading font-extrabold tracking-tight text-ui-text">
        Где ищем клиентов?
      </h2>
      <p className="mt-1 text-sm text-ui-text-muted">
        Соберём компании с Яндекс.Карт, 2GIS и Google Карт, разберём отзывы их клиентов и покажем,
        на что те жалуются.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div>
          <label
            htmlFor="onboarding-niche"
            className="mb-1.5 block text-small font-semibold text-ui-text"
          >
            Ниша — кому вы продаёте
          </label>
          <Input
            id="onboarding-niche"
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="например: стоматологии"
            autoFocus
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ui-text-muted">Примеры:</span>
            {NICHE_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setNiche(ex)}
                className="rounded-pill border border-ui-border bg-ui-surface-2 px-2.5 py-0.5 text-xs font-medium text-ui-text-muted transition-colors duration-fast hover:border-ui-accent/40 hover:text-ui-text"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="onboarding-city"
            className="mb-1.5 block text-small font-semibold text-ui-text"
          >
            Город
          </label>
          <CityCombobox id="onboarding-city" city={city} onCityChange={(c) => setCity(c)} />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!valid}
          iconRight={<ArrowRight className="h-4 w-4" />}
        >
          Дальше
        </Button>
      </form>
    </div>
  );
}
