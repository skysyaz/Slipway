'use client'

import * as React from 'react'
import {
  Search,
  Bell,
  Sun,
  Moon,
  Plus,
  ChevronDown,
  GitBranch,
  Terminal,
  User,
  Check,
  AlertTriangle,
  Info,
  XCircle,
  CircleDot,
  Settings,
  KeyRound,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSlipway, useAnyOverlayOpen } from '@/lib/slipway/store'
import { useTheme } from './theme-provider'
import { useAuth } from './auth-provider'
import { Kbd, TimeAgo } from './format'
import { cn } from '@/lib/utils'
import type { Environment } from '@/lib/slipway/types'
import { useDismiss } from '@/lib/slipway/dismiss'

export function Topbar() {
  const { theme, toggleTheme } = useTheme()
  const env = useSlipway((s) => s.env)
  const setEnv = useSlipway((s) => s.setEnv)
  const setNewDeploymentOpen = useSlipway((s) => s.setNewDeploymentOpen)
  const notifOpen = useSlipway((s) => s.notifOpen)
  const setNotifOpen = useSlipway((s) => s.setNotifOpen)
  const setCommandOpen = useSlipway((s) => s.setCommandOpen)
  const notifications = useSlipway((s) => s.notifications)
  const unread = notifications.filter((n) => !n.read).length
  const notifTriggerRef = React.useRef<HTMLButtonElement>(null)

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="h-full flex items-center gap-3 px-4 sm:px-6">
        {/* Search / command palette */}
        <button
          onClick={() => setCommandOpen(true)}
          className="flex-1 max-w-md flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground hover:bg-muted/70 transition-colors"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search projects, deploys, services…</span>
          <span className="hidden sm:flex items-center gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        {/* Env toggle */}
        <EnvToggle env={env} onChange={setEnv} />

        {/* CLI quick action */}
        <Button
          variant="outline"
          size="sm"
          className="hidden lg:flex h-9 gap-2 font-mono text-xs"
          onClick={() => setCommandOpen(true)}
        >
          <Terminal size={13} />
          slipway deploy
        </Button>

        {/* Notifications */}
        <div className="relative">
          <Button
            ref={notifTriggerRef}
            variant="ghost"
            size="icon"
            className="h-9 w-9 relative"
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label="Notifications"
            aria-haspopup="menu"
            aria-expanded={notifOpen}
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </Button>
          {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} triggerRef={notifTriggerRef} />}
        </div>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </Button>

        {/* New deployment */}
        <Button
          size="sm"
          className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setNewDeploymentOpen(true)}
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New deployment</span>
          <span className="sm:hidden">Deploy</span>
        </Button>

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = React.useState(false)
  const setView = useSlipway((s) => s.setView)
  // initial for the avatar — admin → "AD"
  const initials = (user?.username ?? 'admin').slice(0, 2).toUpperCase()
  const anyOverlay = useAnyOverlayOpen()
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // ponytail: auto-close this local dropdown the moment any store overlay
  // (dialog / command palette / notifications) opens via a NON-pointer path
  // (e.g. the ⌘K keyboard shortcut) — the dismiss layer handles the pointer
  // path, but a keyboard-opened store overlay fires no pointerdown.
  React.useEffect(() => {
    if (anyOverlay) setOpen(false)
  }, [anyOverlay])
  // ponytail: outside-click + Escape + mutual exclusivity via the shared
  // dismiss layer (see dismiss.tsx). Replaces the old full-screen backdrop +
  // per-component keydown listener.
  useDismiss({ open, onClose: () => setOpen(false), contentRef, triggerRef })

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-emerald-950 font-semibold text-xs flex items-center justify-center shrink-0 hover:ring-2 hover:ring-primary/30 transition-all"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initials}
      </button>
      {open && (
        <div ref={contentRef} className="absolute right-0 top-full mt-1.5 w-64 rounded-lg border border-border bg-popover shadow-xl z-40 p-1.5">
            <div className="px-2.5 py-2 border-b border-border mb-1">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-emerald-950 font-semibold text-xs flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{user?.username ?? 'admin'}</div>
                  <div className="text-[11px] text-muted-foreground">admin · cluster: helix-eu</div>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setView('settings')
                setOpen(false)
              }}
              className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] hover:bg-accent transition-colors"
            >
              <Settings size={13} className="text-muted-foreground" />
              Account settings
            </button>
            <button
              onClick={() => {
                setView('settings')
                setOpen(false)
              }}
              className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] hover:bg-accent transition-colors"
            >
              <KeyRound size={13} className="text-muted-foreground" />
              API tokens
            </button>
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={() => {
                  logout()
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] hover:bg-accent transition-colors text-rose-500"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          </div>
      )}
    </div>
  )
}

function EnvToggle({ env, onChange }: { env: Environment | 'all'; onChange: (e: Environment | 'all') => void }) {
  const [open, setOpen] = React.useState(false)
  const anyOverlay = useAnyOverlayOpen()
  const options: { id: Environment; label: string; color: string }[] = [
    { id: 'production', label: 'Production', color: 'oklch(0.7 0.17 158)' },
    { id: 'staging', label: 'Staging', color: 'oklch(0.78 0.16 70)' },
    { id: 'preview', label: 'Preview', color: 'oklch(0.65 0.18 250)' },
  ]
  const current = options.find((o) => o.id === env)
  const isAll = env === 'all'
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // ponytail: same auto-close + dismiss layer as UserMenu (bugs 1 & 2).
  React.useEffect(() => {
    if (anyOverlay) setOpen(false)
  }, [anyOverlay])
  useDismiss({ open, onClose: () => setOpen(false), contentRef, triggerRef })

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="h-9 flex items-center gap-2 px-3 rounded-md border border-border bg-muted/40 hover:bg-muted/70 text-sm transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: current.color, boxShadow: `0 0 0 3px oklch(from ${current.color} l c h / 0.18)` }}
          />
        )}
        <span className="font-medium">{isAll ? 'All environments' : current?.label ?? 'Environment'}</span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>
      {open && (
        <div ref={contentRef} className="absolute right-0 top-full mt-1.5 w-52 rounded-lg border border-border bg-popover shadow-xl z-40 p-1.5">
            <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Environment
            </div>
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  onChange(opt.id)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2 h-8 rounded-md text-sm hover:bg-accent transition-colors',
                  env === opt.id && 'bg-accent/60',
                )}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: opt.color }} />
                <span className="flex-1 text-left">{opt.label}</span>
                {env === opt.id && <Check size={14} className="text-primary" />}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1 mt-1">
              <button
                onClick={() => { onChange('all'); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2 h-8 rounded-md text-sm hover:bg-accent transition-colors text-muted-foreground',
                  isAll && 'bg-accent/60',
                )}
              >
                <GitBranch size={14} />
                <span className="flex-1 text-left">All environments</span>
                {isAll && <Check size={14} className="text-primary" />}
              </button>
            </div>
          </div>
      )}
    </div>
  )
}

function NotificationsPanel({ onClose, triggerRef }: { onClose: () => void; triggerRef: React.RefObject<HTMLButtonElement | null> }) {
  const notifications = useSlipway((s) => s.notifications)
  const markAllRead = useSlipway((s) => s.markAllNotifsRead)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // ponytail: outside-click + Escape + mutual exclusivity via the shared
  // dismiss layer. Replaces the old full-screen backdrop + keydown listener.
  useDismiss({ open: true, onClose, contentRef, triggerRef })

  const iconFor = (level: string) => {
    switch (level) {
      case 'success':
        return <Check size={14} className="text-emerald-500" />
      case 'warning':
        return <AlertTriangle size={14} className="text-amber-500" />
      case 'error':
        return <XCircle size={14} className="text-rose-500" />
      default:
        return <Info size={14} className="text-sky-500" />
    }
  }

  return (
    <div ref={contentRef} className="absolute right-0 top-full mt-1.5 w-[380px] max-h-[480px] rounded-lg border border-border bg-popover shadow-xl z-40 flex flex-col">
        <div className="h-10 px-3 flex items-center justify-between border-b border-border">
          <div className="text-sm font-semibold">Notifications</div>
          <button
            onClick={markAllRead}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Mark all read
          </button>
        </div>
        <div className="overflow-y-auto flex-1 max-h-[400px]">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                'px-3 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-accent/50 transition-colors cursor-pointer',
                !n.read && 'bg-accent/30',
              )}
            >
              <div className="flex gap-2.5">
                <div className="mt-0.5 shrink-0">{iconFor(n.level)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div className="text-[13px] font-medium leading-tight">{n.title}</div>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                  </div>
                  <div className="text-[12px] text-muted-foreground leading-snug mt-0.5">{n.body}</div>
                  <div className="mt-1">
                    <TimeAgo ts={n.ts} className="text-[11px]" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <button className="w-full text-center text-[12px] text-muted-foreground hover:text-foreground transition-colors py-1">
            View all activity
          </button>
        </div>
      </div>
  )
}
