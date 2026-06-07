/**
 * Единая иконка-марка SpinLid. Бирюзовый бренд-градиент (teal→cyan),
 * стилизованная спираль. Используется в шапке лендинга, шапке SEO-страниц,
 * AppHeader кабинета, в favicon/apple-icon/OG.
 *
 * Размер задаётся через `size` (квадрат). Background можно отключить
 * (`bg={false}`) — для случаев, когда нужна чисто марка без подложки.
 */

interface BrandMarkProps {
  size?: number;
  /** Подложка-плашка под спираль (rounded-rect с бренд-градиентом). */
  bg?: boolean;
  /** Класс для обёртки (для позиционирования). */
  className?: string;
}

export function BrandMark({ size = 32, bg = true, className }: BrandMarkProps) {
  if (bg) {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.22),
          background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
          boxShadow: '0 0 12px rgba(45, 212, 191, 0.4)',
        }}
        aria-hidden
      >
        <BrandSpiral size={Math.round(size * 0.7)} color="#0b1220" />
      </span>
    );
  }
  return <BrandSpiral size={size} color="#06b6d4" className={className} />;
}

function BrandSpiral({
  size,
  color,
  className,
}: {
  size: number;
  color: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <path
        d="M16,6 C21.5,6 26,10.5 26,16 C26,18.5 25,20.8 23.2,22.3 C21.5,23.8 19.2,24.5 17,24 C14.5,23.4 12.5,21.5 12,19 C11.7,17.5 12,16 13,15.2 C14,15.5 15,16 15,17 C15,18 15.5,19 16.5,19.5 C17.5,20 19,19.8 20,19 C21,18.2 21.5,17 21.5,16 C21.5,13.2 19,11 16,11 C13,11 10.5,13.2 10.5,16 C10.5,17.5 11,19 12,20 C13,21 14.5,21.5 16,21.5"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
