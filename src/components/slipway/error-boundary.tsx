'use client'

import * as React from 'react'
import { SlipwayMark } from './icons'

type Props = { children: React.ReactNode }
type State = { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for debugging — in production you'd send this to Sentry/etc.
    console.error('Slipway error boundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center">
            <div className="flex justify-center mb-4">
              <SlipwayMark size={40} />
            </div>
            <h1 className="text-[20px] font-semibold tracking-tight mb-2">
              Something went wrong
            </h1>
            <p className="text-[13px] text-muted-foreground mb-4 leading-relaxed">
              Slipway hit an unexpected error. Try reloading — your session is preserved.
              If the problem persists, check the browser console for details.
            </p>
            {this.state.error && (
              <pre className="text-[11px] font-mono text-left bg-muted p-3 rounded-lg overflow-auto max-h-32 mb-4">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined })
                window.location.reload()
              }}
              className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
            >
              Reload Slipway
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
