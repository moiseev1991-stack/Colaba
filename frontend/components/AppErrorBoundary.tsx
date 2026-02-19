'use client';

import { Component, type ReactNode } from 'react';

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
        <div
          role="alert"
          className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-50 p-8"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          <div className="text-center max-w-md">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Что-то пошло не так
            </h1>
            <p className="text-gray-600 text-sm mb-6">
              Приложение столкнулось с ошибкой. Попробуйте обновить страницу.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
