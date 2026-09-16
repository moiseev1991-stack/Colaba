import { SendingGate } from '@/components/outreach/SendingGate';

// Провайдеры email нужны только для отправки из SpinLid, а она временно недоступна (lib/outreach.ts).
export default function EmailProvidersLayout({ children }: { children: React.ReactNode }) {
  return <SendingGate>{children}</SendingGate>;
}
