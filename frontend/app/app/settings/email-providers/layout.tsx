import { SuperuserGate } from '@/components/SuperuserGate';
import { SendingGate } from '@/components/outreach/SendingGate';

// Провайдеры email — конфигурация инстанса (17.09): только суперюзеру.
// SendingGate дополнительно прячет, если отправка выключена флагом.
export default function EmailProvidersLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperuserGate>
      <SendingGate>{children}</SendingGate>
    </SuperuserGate>
  );
}
