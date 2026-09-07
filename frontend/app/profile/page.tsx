import { redirect } from 'next/navigation';

// Аудит 03.08+07.09: старый /profile рендерил ProfileCard, читающую юзера
// из localStorage (getUser) — при cookie-логине там всегда null, юзер
// видел «Необходимо войти». Рабочая страница — /app/settings/profile
// (тянет /auth/me). Здесь — постоянный redirect, меню AppHeader
// обновлено туда же.
export default function ProfilePage() {
  redirect('/app/settings/profile');
}
