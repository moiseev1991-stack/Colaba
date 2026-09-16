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
