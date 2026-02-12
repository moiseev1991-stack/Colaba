'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokenStorage } from '@/client';
import '@/components/landing/landing.css';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { RegisterSection } from '@/components/landing/RegisterSection';
import { ModulesSection } from '@/components/landing/ModulesSection';
import { AudienceSection } from '@/components/landing/AudienceSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ExamplesSection } from '@/components/landing/ExamplesSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { ContactsSection } from '@/components/landing/ContactsSection';
import { LandingFooter } from '@/components/landing/LandingFooter';

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const token = tokenStorage.getAccessToken();
    if (token) router.replace('/app');
  }, [router]);

  const scrollTo = (id: string, focusEmail?: boolean) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    if (focusEmail) {
      setTimeout(() => document.getElementById('register-email')?.focus(), 600);
    }
  };

  return (
    <div className="landing-light min-h-screen">
      <LandingHeader />
      <main>
        <HeroSection onCtaRegister={() => scrollTo('register', true)} onCtaExamples={() => scrollTo('examples')} />
        <RegisterSection />
        <ModulesSection />
        <AudienceSection />
        <HowItWorksSection />
        <ExamplesSection />
        <PricingSection onCta={() => scrollTo('register', true)} />
        <FAQSection />
        <ContactsSection />
        <LandingFooter />
      </main>
    </div>
  );
}
