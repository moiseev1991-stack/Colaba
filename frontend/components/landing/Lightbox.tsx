'use client';

import { useState, useEffect, useCallback } from 'react';

interface LightboxProps {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

export function Lightbox({ src, alt, isOpen, onClose }: LightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!src) return null;

  return (
    <div
      className={`l-lightbox${isOpen ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button className="l-lightbox__close" onClick={onClose} aria-label="Закрыть">
        ✕
      </button>
      {isOpen && src && (
        <img className="l-lightbox__img" src={src} alt={alt} />
      )}
    </div>
  );
}

export function useLightbox() {
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    src: string;
    alt: string;
  }>({
    isOpen: false,
    src: '',
    alt: '',
  });

  const openLightbox = (src: string, alt: string = '') => {
    setLightboxState({ isOpen: true, src, alt });
  };

  const closeLightbox = () => {
    setLightboxState((prev) => ({ ...prev, isOpen: false }));
  };

  return { lightboxState, openLightbox, closeLightbox };
}
