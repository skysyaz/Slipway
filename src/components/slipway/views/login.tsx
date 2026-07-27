'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SlipwayMark } from '../icons'
import { useAuth } from '../auth-provider'
import {
  Loader2,
  ShieldCheck,
  Terminal,
  Box,
  Lock,
  ArrowRight,
  Globe,
  Database,
  GitBranch,
  Server,
} from 'lucide-react'

export function LoginView() {
  const { login } = useAuth()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [totp, setTotp] = React.useState('')
  const [error, setError] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await login(username, password, totp.trim() || undefined)
      if (!result.ok) {
        setError(result.error || 'Login failed')
        setSubmitting(false)
      }
      // on success, the session updates and page.tsx flips to the app
    } catch {
      setError('Login failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-grid">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] xl:w-[540px] p-10 xl:p-12 bg-gradient-to-br from-primary/10 via-background to-background border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <SlipwayMark size={36} />
          <div>
            <div className="text-[18px] font-semibold tracking-tight">Slipway</div>
            <div className="text-[11px] text-muted-foreground font-mono">v1.4.2 · self-hosted</div>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="text-[34px] xl:text-[38px] font-semibold tracking-tight leading-[1.1]">
            Self-hosted deploys,
            <br />
            <span className="text-primary">without the yak shaving.</span>
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed max-w-md">
            Connect a repo, point at a folder, or import a Docker Compose app. Slipway detects the
            stack, builds it, and ships it to your own Linux servers — with built-in CI/CD, domains,
            SSL, databases, and one-click rollbacks.
          </p>
          <div className="grid grid-cols-4 gap-2 pt-2">
            <FeatureTile icon={Box} label="Apps" />
            <FeatureTile icon={ShieldCheck} label="SSL" />
            <FeatureTile icon={Database} label="DBs" />
            <FeatureTile icon={Terminal} label="CLI" />
          </div>
        </div>

        <div className="relative space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
            <Globe size={11} />
            apache 2.0 · github.com/slipway/slipway
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
            <Server size={11} />
            runs on any linux server · 1 vCPU · 1 GB ram
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <SlipwayMark size={32} />
            <div className="text-[18px] font-semibold">Slipway</div>
          </div>

          <div className="mb-6">
            <h2 className="text-[22px] font-semibold tracking-tight">Sign in</h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              Welcome back. Sign in to manage your cluster.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[12px]">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoFocus
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[12px]">Password</Label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="totp" className="text-[12px]">2FA code <span className="text-muted-foreground font-normal">(if enabled)</span></Label>
              <Input
                id="totp"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                inputMode="numeric"
                className="h-10 font-mono"
              />
            </div>

            {error && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-500 flex items-center gap-2">
                <Lock size={12} className="shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-10 gap-2" disabled={submitting}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <ArrowRight size={13} className="ml-auto" />}
            </Button>
          </form>

          <div className="mt-6 rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            <div className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-emerald-500" />
              Default credentials
            </div>
            <div className="font-mono text-[12px] text-foreground">
              admin / admin
            </div>
            <div className="mt-2 leading-relaxed">
              Override with{' '}
              <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">SLIPWAY_ADMIN_USER</code>{' '}
              and{' '}
              <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">SLIPWAY_ADMIN_PASSWORD</code>{' '}
              env vars. See <code className="font-mono text-[10px]">.env.example</code>.
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <GitBranch size={10} />
              open source
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <ShieldCheck size={10} />
              apache 2.0
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <Server size={10} />
              self-hosted
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureTile({ icon: Icon, label }: { icon: React.ComponentType<{ size?: number }>; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 flex flex-col items-center gap-1.5">
      <Icon size={14} />
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  )
}
