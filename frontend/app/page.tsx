'use client';

import { useEffect, useRef } from 'react';
import '@/components/landing/landing.css';
import { PublicHeader } from '@/components/public/PublicHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { SignalsTableSection } from '@/components/landing/SignalsTableSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ProfessionsSection } from '@/components/landing/ProfessionsSection';
import { ModulesSection } from '@/components/landing/ModulesSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { RegisterSection } from '@/components/landing/RegisterSection';
import { ContactsSection } from '@/components/landing/ContactsSection';
import { PublicFooter } from '@/components/public/PublicFooter';
import { initRevealOnScroll } from '@/lib/revealOnScroll';

// Главная из 8 секций (PR 2.2, план фронтенда 15.09): первый экран → пример выдачи →
// как это работает → для кого → что внутри → бесплатная бета → вопросы → регистрация.
// Одна форма на странице — регистрация (решение Р2); все «примеры» ведут на /demo.
export default function LandingPage() {
  // Появление блоков при прокрутке; без JS контент виден (см. lib/revealOnScroll.ts).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => initRevealOnScroll(rootRef.current, { staggerMs: 90 }), []);

  const goToRegister = () => {
    document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => document.getElementById('register-email')?.focus(), 600);
  };

  return (
    <div ref={rootRef} className="landing-light min-h-screen">
      <PublicHeader />
      <main>
        <HeroSection onCtaRegister={goToRegister} />
        <SignalsTableSection />
        <HowItWorksSection />
        <ProfessionsSection />
        <ModulesSection />
        <PricingSection onCta={goToRegister} />
        <FAQSection />
        <RegisterSection />
        <ContactsSection />
      </main>
      <PublicFooter currentHref="/" />
    </div>
  );
}
