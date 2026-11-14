import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error.',
    };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#090d1a] p-6 text-slate-100">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[#0d1428] p-6 text-center shadow-2xl">
            <h1 className="font-display text-xl font-bold text-white">
              Unable to Render CUBE FLIP
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              A startup error occurred in this browser session:
            </p>
            <p className="mt-3 rounded-lg bg-slate-900/90 px-3 py-2 text-xs font-mono-num text-rose-300 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm cursor-pointer"
            >
              Reload Game
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
