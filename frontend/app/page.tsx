'use client';

import { useEffect, useState, useCallback } from 'react';
import '@/components/landing/landing.css';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { ImpactSection } from '@/components/landing/ImpactSection';
import { ModulesSection } from '@/components/landing/ModulesSection';
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
          onCtaExamples={() => scrollTo('examples')}
        />
        <ImpactSection />
        <ModulesSection />
        <BenefitsSection />
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
