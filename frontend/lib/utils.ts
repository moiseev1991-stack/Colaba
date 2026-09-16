import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge не знает наших ступеней из tailwind.config.js и принимает text-small /
// text-heading за цвет текста — тогда cn() выкидывает настоящий цвет (например, белый текст
// на кнопке). Регистрируем ступени шрифта, радиусов и теней в их группах.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['small', 'heading', 'hero'] }],
      rounded: [{ rounded: ['control', 'card', 'panel', 'pill'] }],
      shadow: [{ shadow: ['raised', 'floating', 'overlay'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Русское склонение: pluralRu(71, ['компания','компании','компаний']) → 'компания'. */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (d > 1 && d < 5) return forms[1];
  if (d === 1) return forms[0];
  return forms[2];
}
