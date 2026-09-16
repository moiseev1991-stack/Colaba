import { SendingGate } from '@/components/outreach/SendingGate';

// Каналы рассылки нужны только для отправки из SpinLid, а она временно недоступна (lib/outreach.ts).
export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
  return <SendingGate>{children}</SendingGate>;
}
