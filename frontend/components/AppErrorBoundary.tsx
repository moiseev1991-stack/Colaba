'use client';

import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

/**
 * Catches React rendering errors (including hydration) and shows fallback UI.
 * Prevents white screen; user can refresh the page.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          fullScreen
          description="Приложение столкнулось с ошибкой. Попробуйте обновить страницу."
          action={<Button onClick={() => window.location.reload()}>Обновить страницу</Button>}
        />
      );
    }
    return this.props.children;
  }
}
