'use client';

import { useEffect, useState, useCallback } from 'react';
import '@/components/landing/landing.css';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { SignalsTableSection } from '@/components/landing/SignalsTableSection';
import { DiagnosisSection } from '@/components/landing/DiagnosisSection';
import { ImpactSection } from '@/components/landing/ImpactSection';
import { ModulesSection } from '@/components/landing/ModulesSection';
import { ProfessionsSection } from '@/components/landing/ProfessionsSection';
import { SolutionsSection } from '@/components/landing/SolutionsSection';
import { BenefitsSection } from '@/components/landing/BenefitsSection';
import { RegisterSection } from '@/components/landing/RegisterSection';
import { AudienceSection } from '@/components/landing/AudienceSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ExamplesSection } from '@/components/landing/ExamplesSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { ContactsSection } from '@/components/landing/ContactsSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Lightbox } from '@/components/landing/Lightbox';
import { LeadCaptureForm } from '@/components/LeadCaptureForm';

export default function LandingPage() {
  const [lightbox, setLightbox] = useState({ isOpen: false, src: '', alt: '' });

  const openLightbox = useCallback((src: string, alt: string = '') => {
    setLightbox({ isOpen: true, src, alt });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Reveal on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const siblings = [
            ...(entry.target.parentElement?.querySelectorAll('.reveal:not(.visible)') ?? []),
          ] as Element[];
          const idx = siblings.indexOf(entry.target);
          setTimeout(
            () => entry.target.classList.add('visible'),
            Math.min(idx, 5) * 90
          );
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -50px 0px' }
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Screenshot click handler for lightbox
  useEffect(() => {
    const handleScreenshotClick = (e: Event) => {
      const target = e.target as HTMLImageElement;
      if (target.classList.contains('l-screenshot')) {
        openLightbox(target.src, target.alt);
      }
    };
    document.addEventListener('click', handleScreenshotClick);
    return () => document.removeEventListener('click', handleScreenshotClick);
  }, [openLightbox]);

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
        <HeroSection
          onCtaRegister={() => scrollTo('register', true)}
          onCtaExamples={() => scrollTo('diagnosis')}
        />
        {/* Форма захвата лида (бесплатный тест + скидка 50% первым 50)
            сразу под hero — посетитель из поиска видит конверсию,
            не пролистывая всю простыню лендинга. RegisterSection ниже
            остаётся как полноценный onboarding для тех, кто долистал. */}
        <LeadCaptureForm />
        {/* Идеологическая фишка — сначала «вот выдача с диагнозами» (breadth),
            потом DiagnosisSection раскроет одну компанию подробно (depth). */}
        <SignalsTableSection />
        {/* §4 ТЗ лендинг-рефакта 2026-06-03: главная фишка — сразу после hero */}
        <DiagnosisSection />
        <ImpactSection />
        <BenefitsSection />
        <ModulesSection />
        <ProfessionsSection />
        <SolutionsSection />
        <RegisterSection />
        <AudienceSection />
        <HowItWorksSection />
        <ExamplesSection />
        <PricingSection onCta={() => scrollTo('register', true)} />
        <FAQSection />
        <ContactsSection />
        <LandingFooter />
      </main>
      <Lightbox
        src={lightbox.src}
        alt={lightbox.alt}
        isOpen={lightbox.isOpen}
        onClose={closeLightbox}
      />
    </div>
  );
}
