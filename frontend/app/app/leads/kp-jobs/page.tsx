import { redirect } from 'next/navigation';

// Индексной /app/leads/kp-jobs не существовало (функция живёт вкладкой
// «Партии КП» истории) — прямой URL давал 404 (аудит 03.08/07.09).
export default function KpJobsIndexPage() {
  redirect('/app/leads/history');
}
