import { SendingGate } from '@/components/outreach/SendingGate';

// Отправка писем из SpinLid временно недоступна — вместо разделов рассылки заглушка (lib/outreach.ts).
export default function EmailLayout({ children }: { children: React.ReactNode }) {
  return <SendingGate>{children}</SendingGate>;
}
