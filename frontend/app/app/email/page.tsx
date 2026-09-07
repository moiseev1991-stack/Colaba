import { redirect } from 'next/navigation';

// Индексного /app/email не существовало — прямой URL давал 404
// (аудит 03.08/07.09). Рабочие вкладки — campaigns/replies/stats/settings.
export default function EmailIndexPage() {
  redirect('/app/email/campaigns');
}
