'use client';

import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface OAuthButtonProps {
  provider: 'google' | 'yandex' | 'vk' | 'telegram';
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const providerStyles = {
  google: {
    color: 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300',
    icon: 'text-gray-700',
  },
  yandex: {
    color: 'bg-yellow-400 hover:bg-yellow-500 text-white border-yellow-500',
    icon: 'text-white',
  },
  vk: {
    color: 'bg-blue-500 hover:bg-blue-600 text-white border-blue-600',
    icon: 'text-white',
  },
  telegram: {
    color: 'bg-[#24A1DE] hover:bg-[#2B9CD4] text-white border-[#2B9CD4]',
    icon: 'text-white',
  },
};

export function OAuthButton({
  provider,
  label,
  icon,
  onClick,
  disabled = false,
  loading = false,
}: OAuthButtonProps) {
  const styles = providerStyles[provider];

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full gap-2 ${styles.color}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <span className="h-4 w-4">{icon}</span>
      )}
      {label}
    </Button>
  );
}
