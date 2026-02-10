'use client';

import { ProfileCard } from '@/components/ProfileCard';

export default function ProfilePage() {
  return (
    <div className="max-w-[1250px] mx-auto px-6 py-8">
      <div className="flex justify-center">
        <ProfileCard />
      </div>
    </div>
  );
}
