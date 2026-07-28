'use client'

import * as React from 'react'
import {
  Settings as SettingsIcon,
  Server,
  KeyRound,
  Webhook,
  Mail,
  Slack,
  ShieldCheck,
  Download,
  Lock,
  Trash2,
  Plus,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Cpu,
  MemoryStick,
  HardDrive,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { api, ApiError } from '@/lib/api'
import { StatusDot } from '../icons'
import { useToast, toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type Registry = { id: string; name: string; url: string; auth: string; hasSecret: boolean; username?: string | null; createdAt: string }
type SshKey = { id: string; name: string; publicKey: string; scope: string; fingerprint?: string | null; createdAt: string }
type Token = { id: string; name: string; scope: string; lastUsedAt?: string | null; createdAt: string }
type Webhook = { id: string; url: string; events: string[]; active: boolean; createdAt: string }
type Integration = { id: string; kind: string; active: boolean; config: Record<string, unknown> }
type AuditEvent = { id: string; ts: string; actor: string; kind: string; message: string }
type SettingsResponse = {
  settings: Record<string, string>
  profile: { username: string; email: string | null; displayName: string | null; role: string; totpEnabled: boolean } | null
  version: string
  providers: { credentials: boolean; github: boolean; gitlab: boolean; oidc: boolean; saml: boolean }
}

export function SettingsView() {
  const setNewServerOpen = useSlipway((s) => s.setNewServerOpen)
  const setNewSshKeyOpen = useSlipway((s) => s.setNewSshKeyOpen)
  const setNewRegistryOpen = useSlipway((s) => s.setNewRegistryOpen)
  const setNewWebhookOpen = useSlipway((s) => s.setNewWebhookOpen)
  const setNewTokenOpen = useSlipway((s) => s.setNewTokenOpen)
  const [tab, setTab] = React.useState<'cluster' | 'registries' | 'integrations' | 'security' | 'profile'>('cluster')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight flex items-center gap-2">
          <SettingsIcon size={18} className="text-primary" />
          Settings
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Manage your Slipway cluster, container registries, integrations, security, and account.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {([
          { id: 'cluster', label: 'Cluster & servers' },
          { id: 'registries', label: 'Registries' },
          { id: 'integrations', label: 'Integrations' },
          { id: 'security', label: 'Security' },
          { id: 'profile', label: 'Profile' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 h-9 text-[13px] border-b-2 transition-colors -mb-px',
              tab === t.id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cluster' && <ClusterSettings onAddServer={() => setNewServerOpen(true)} />}
      {tab === 'registries' && <RegistriesSettings onAddRegistry={() => setNewRegistryOpen(true)} />}
      {tab === 'integrations' && <IntegrationsSettings onAddWebhook={() => setNewWebhookOpen(true)} />}
      {tab === 'security' && <SecuritySettings onAddSshKey={() => setNewSshKeyOpen(true)} />}
      {tab === 'profile' && <ProfileSettings onNewToken={() => setNewTokenOpen(true)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cluster & servers
// ---------------------------------------------------------------------------

function ClusterSettings({ onAddServer }: { onAddServer: () => void }) {
  const servers = useSlipway((s) => s.servers)
  const refetch = useSlipway((s) => s.refetch)
  const { toast } = useToast()
  const [settings, setSettings] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    void api.get<SettingsResponse>('/api/settings').then((s) => setSettings(s.settings)).catch(() => {})
  }, [])

  const joinServer = async (id: string, name: string) => {
    toast({ title: `Joining ${name}…`, description: 'Attempting SSH connection.' })
    try {
      const res = await api.post<{ ok: boolean; status?: string; error?: string }>(`/api/servers/${id}/join`)
      if (res.ok) toast({ title: 'Server joined', description: `${name} is ${res.status}.` })
      else toast({ title: 'Join failed', description: res.error, variant: 'destructive' })
    } catch (e) {
      toast({ title: 'Join failed', description: e instanceof ApiError ? e.message : 'SSH error', variant: 'destructive' })
    }
    await refetch(['servers', 'activity', 'notifications'])
  }

  const saveSetting = async (key: string, value: boolean) => {
    setSettings((s) => ({ ...s, [key]: String(value) }))
    await api.patch('/api/settings', { settings: { [key]: String(value) } }).catch(() => {})
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Cluster"
        description="Your Slipway cluster spans one or more Linux servers. Add workers to scale horizontally."
        action={
          <Button size="sm" className="h-8 gap-2" onClick={onAddServer}>
            <Plus size={12} />
            Add server
          </Button>
        }
      >
        <div className="space-y-2">
          {servers.length === 0 && (
            <div className="text-[13px] text-muted-foreground py-6 text-center">
              No servers yet. This Slipway node runs locally. Add a remote server over SSH.
            </div>
          )}
          {servers.map((s) => (
            <div key={s.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Server size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium font-mono">{s.name}</span>
                    <StatusDot status={s.status} />
                    <Badge variant="outline" className="text-[10px] capitalize">{s.role}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {s.ip} · {s.os} · Docker {s.dockerVersion || '—'} · uptime {s.uptimeHours}h
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
                  <div className="flex items-center gap-1">
                    <Cpu size={11} />
                    <span className="font-mono">{s.cpuCores} cores</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MemoryStick size={11} />
                    <span className="font-mono">{s.memoryGb} GB</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <HardDrive size={11} />
                    <span className="font-mono">{s.diskUsedGb.toFixed(1)}/{s.diskGb.toFixed(1)} GB</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[11px]"
                  title="SSH shell is not available in the web UI — use the CLI"
                  onClick={() => toast({ title: 'No web shell', description: 'SSH shells run via the Slipway CLI: `slipway ssh ' + s.name + '`.' })}
                >
                  <Terminal size={11} className="mr-1" />
                  Shell
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={() => void joinServer(s.id, s.name)}
                >
                  Join
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Cluster-wide maintenance" description="Set windows where Slipway will pause auto-deploys and run pending upgrades.">
        <div className="space-y-2.5">
          <ToggleRow
            label="Auto-upgrade Slipway in maintenance windows"
            description="Apply patch releases automatically. Major upgrades always require manual confirmation."
            checked={settings['maintenance:autoUpgrade'] === 'true'}
            onChange={(v) => void saveSetting('maintenance:autoUpgrade', v)}
          />
          <ToggleRow
            label="Sunday 02:00–04:00 UTC maintenance window"
            description="Pause auto-deploys to production during this window."
            checked={settings['maintenance:sundayWindow'] === 'true'}
            onChange={(v) => void saveSetting('maintenance:sundayWindow', v)}
          />
        </div>
      </SettingsCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

function RegistriesSettings({ onAddRegistry }: { onAddRegistry: () => void }) {
  const { toast } = useToast()
  const [registries, setRegistries] = React.useState<Registry[]>([])

  const load = React.useCallback(() => {
    void api.get<Registry[]>('/api/registries').then(setRegistries).catch(() => {})
  }, [])
  React.useEffect(load, [load])

  const remove = async (r: Registry) => {
    await api.del(`/api/registries?id=${r.id}`)
    toast({ title: 'Registry removed', description: r.name })
    load()
  }

  return (
    <SettingsCard
      title="Container registries"
      description="Where Slipway pulls base images and pushes built images. Supports Docker Hub, GHCR, Gitea, Harbor, and any OCI-compliant registry."
      action={<Button size="sm" className="h-8 gap-2" onClick={onAddRegistry}><Plus size={12} />Add registry</Button>}
    >
      <div className="space-y-2">
        {registries.length === 0 && (
          <div className="text-[13px] text-muted-foreground py-6 text-center">No registries configured.</div>
        )}
        {registries.map((r) => (
          <div key={r.id} className="rounded-lg border border-border p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{r.name}</span>
                {r.hasSecret && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">credentials</Badge>}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                {r.url} · auth: {r.auth}{r.username ? ` · ${r.username}` : ''} · added {r.createdAt.slice(0, 10)}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px] text-rose-500 hover:text-rose-500" onClick={() => void remove(r)}>
              <Trash2 size={11} className="mr-1" />
              Remove
            </Button>
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}

// ---------------------------------------------------------------------------
// Integrations + webhooks + source providers
// ---------------------------------------------------------------------------

const INTEGRATIONS = [
  { kind: 'slack', name: 'Slack', icon: Slack, fields: ['url'] as const, hint: 'Incoming webhook URL' },
  { kind: 'email', name: 'Email (SMTP)', icon: Mail, fields: ['host', 'port', 'user', 'pass', 'from', 'to'] as const, hint: 'SMTP relay + recipients' },
  { kind: 'discord', name: 'Discord', icon: Slack, fields: ['url'] as const, hint: 'Channel webhook URL' },
  { kind: 'pagerduty', name: 'PagerDuty', icon: ShieldCheck, fields: ['routingKey'] as const, hint: 'Events API v2 routing key' },
  { kind: 'telegram', name: 'Telegram', icon: Mail, fields: ['token', 'chatId'] as const, hint: 'Bot token + chat id' },
  { kind: 'teams', name: 'Microsoft Teams', icon: Mail, fields: ['url'] as const, hint: 'Channel webhook URL' },
]

function IntegrationsSettings({ onAddWebhook }: { onAddWebhook: () => void }) {
  const { toast } = useToast()
  const [integrations, setIntegrations] = React.useState<Integration[]>([])
  const [webhooks, setWebhooks] = React.useState<Webhook[]>([])
  const [providers, setProviders] = React.useState<SettingsResponse['providers']>({ credentials: true, github: false, gitlab: false, oidc: false, saml: false })

  const load = React.useCallback(() => {
    void api.get<Integration[]>('/api/integrations').then(setIntegrations).catch(() => {})
    void api.get<Webhook[]>('/api/webhooks').then(setWebhooks).catch(() => {})
    void api.get<SettingsResponse>('/api/settings').then((s) => setProviders(s.providers)).catch(() => {})
  }, [])
  React.useEffect(load, [load])

  const connect = async (kind: string, fields: readonly string[]) => {
    const config: Record<string, string> = {}
    for (const f of fields) {
      const v = window.prompt(`${kind}: ${f}`) || ''
      if (!v) return
      config[f] = v
    }
    await api.post('/api/integrations', { kind, config, active: true })
    toast({ title: 'Integration connected', description: kind })
    load()
  }

  const toggle = async (i: Integration, active: boolean) => {
    await api.patch('/api/integrations', { kind: i.kind, active })
    load()
  }

  const removeIntegration = async (i: Integration) => {
    await api.del(`/api/integrations?kind=${i.kind}`)
    load()
  }

  const removeWebhook = async (w: Webhook) => {
    await api.del(`/api/webhooks?id=${w.id}`)
    load()
  }

  return (
    <div className="space-y-4">
      <SettingsCard title="Notifications" description="Where Slipway sends deploy, backup, and alert events.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {INTEGRATIONS.map((i) => {
            const Icon = i.icon
            const existing = integrations.find((x) => x.kind === i.kind)
            return (
              <div key={i.kind} className="rounded-lg border border-border p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{i.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{existing ? 'configured' : i.hint}</div>
                </div>
                {existing ? (
                  <div className="flex items-center gap-2">
                    <Switch checked={existing.active} onCheckedChange={(v) => void toggle(existing, v)} />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-500 hover:text-rose-500" onClick={() => void removeIntegration(existing)}>
                      <X size={12} />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void connect(i.kind, i.fields)}>Connect</Button>
                )}
              </div>
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="Webhooks" description="Outbound webhooks for arbitrary integrations. Slipway POSTs JSON on each event." action={<Button size="sm" className="h-8 gap-2" onClick={onAddWebhook}><Plus size={12} />Add webhook</Button>}>
        <div className="space-y-2">
          {webhooks.length === 0 && (
            <div className="text-[13px] text-muted-foreground py-6 text-center">No webhooks configured.</div>
          )}
          {webhooks.map((w) => (
            <div key={w.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Webhook size={12} className="text-muted-foreground" />
                <span className="text-[12px] font-mono truncate flex-1">{w.url}</span>
                <Badge variant="outline" className={cn('text-[10px]', w.active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'opacity-60')}>{w.active ? 'active' : 'paused'}</Badge>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-500 hover:text-rose-500" onClick={() => void removeWebhook(w)}>
                  <Trash2 size={11} />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {w.events.map((e) => (
                  <Badge key={e} variant="outline" className="text-[9px] font-mono">{e}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Source providers" description="Connect Git providers so Slipway can clone repos, install deploy keys, and listen for push events. GitHub/GitLab are enabled by setting their env vars.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            { name: 'GitHub', on: providers.github, env: 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET' },
            { name: 'GitLab self-hosted', on: providers.gitlab, env: 'GITLAB_CLIENT_ID / SECRET / ISSUER' },
            { name: 'OIDC (Google, Okta)', on: providers.oidc, env: 'not yet configured' },
            { name: 'SAML 2.0', on: providers.saml, env: 'not yet configured' },
          ]).map((p) => (
            <div key={p.name} className="rounded-lg border border-border p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{p.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{p.env}</div>
              </div>
              {p.on ? (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                  <Check size={9} className="mr-0.5" />
                  Enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] opacity-60">Disabled</Badge>
              )}
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Security — auth toggles, SSH keys, 2FA, audit log
// ---------------------------------------------------------------------------

function SecuritySettings({ onAddSshKey }: { onAddSshKey: () => void }) {
  const { toast } = useToast()
  const [sshKeys, setSshKeys] = React.useState<SshKey[]>([])
  const [audit, setAudit] = React.useState<AuditEvent[]>([])
  const [settings, setSettings] = React.useState<Record<string, string>>({})
  const [providers, setProviders] = React.useState<SettingsResponse['providers']>({ credentials: true, github: false, gitlab: false, oidc: false, saml: false })

  const [twoFA, setTwoFA] = React.useState<{ enabled: boolean; step: 'idle' | 'qr' | 'verify'; qr?: string; secret?: string }>({ enabled: false, step: 'idle' })
  const [totpCode, setTotpCode] = React.useState('')
  const [disablePw, setDisablePw] = React.useState('')
  const [showDisable, setShowDisable] = React.useState(false)

  const load = React.useCallback(() => {
    void api.get<SshKey[]>('/api/ssh-keys').then(setSshKeys).catch(() => {})
    void api.get<AuditEvent[]>('/api/activity').then((a) => setAudit(a.slice(0, 40))).catch(() => {})
    void api.get<SettingsResponse>('/api/settings').then((s) => {
      setSettings(s.settings)
      setProviders(s.providers)
      setTwoFA((prev) => ({ ...prev, enabled: Boolean(s.profile?.totpEnabled) }))
    }).catch(() => {})
  }, [])
  React.useEffect(load, [load])

  const removeKey = async (k: SshKey) => {
    await api.del(`/api/ssh-keys?id=${k.id}`)
    toast({ title: 'SSH key removed', description: k.name })
    load()
  }

  const saveSetting = async (key: string, value: boolean) => {
    setSettings((s) => ({ ...s, [key]: String(value) }))
    await api.patch('/api/settings', { settings: { [key]: String(value) } }).catch(() => {})
  }

  const setup2FA = async () => {
    try {
      const res = await api.post<{ qr: string; secret: string }>('/api/auth/2fa/setup')
      setTwoFA({ enabled: false, step: 'qr', qr: res.qr, secret: res.secret })
    } catch (e) {
      toast({ title: '2FA setup failed', description: e instanceof ApiError ? e.message : 'error', variant: 'destructive' })
    }
  }

  const verify2FA = async () => {
    try {
      await api.post('/api/auth/2fa/verify', { token: totpCode.trim() })
      toast({ title: '2FA enabled', description: 'You will need a code at sign-in.' })
      setTwoFA({ enabled: true, step: 'idle' })
      setTotpCode('')
      load()
    } catch (e) {
      toast({ title: 'Invalid code', description: e instanceof ApiError ? e.message : 'try again', variant: 'destructive' })
    }
  }

  const disable2FA = async () => {
    try {
      await api.post('/api/auth/2fa/disable', { password: disablePw })
      toast({ title: '2FA disabled' })
      setShowDisable(false)
      setDisablePw('')
      load()
    } catch (e) {
      toast({ title: 'Could not disable', description: e instanceof ApiError ? e.message : 'wrong password', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard title="Authentication" description="How users authenticate to Slipway. GitHub/GitLab availability is set by environment variables.">
        <div className="space-y-2.5">
          <ToggleRow label="Email + password" description="Built-in auth with bcrypt-hashed passwords." checked={settings['auth:credentials'] !== 'false'} onChange={(v) => void saveSetting('auth:credentials', v)} />
          <ToggleRow label="GitHub OAuth" description={providers.github ? 'Env vars set — provider active.' : 'Set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET to enable.'} checked={providers.github} onChange={() => toast({ title: 'Env-gated', description: 'Toggle GitHub by setting/removing its env vars.' })} />
          <ToggleRow label="GitLab OAuth" description={providers.gitlab ? 'Env vars set — provider active.' : 'Set GITLAB_CLIENT_ID / SECRET / ISSUER to enable.'} checked={providers.gitlab} onChange={() => toast({ title: 'Env-gated', description: 'Toggle GitLab by setting/removing its env vars.' })} />
          <ToggleRow label="OIDC (Google, Okta, Keycloak)" description="Generic OpenID Connect provider — not yet wired." checked={providers.oidc} onChange={() => toast({ title: 'Not available', description: 'OIDC is configured via env.' })} />
          <ToggleRow label="SAML 2.0 SSO" description="Enterprise SSO. Available on the Team edition." checked={providers.saml} onChange={() => toast({ title: 'Not available', description: 'SAML requires the Team edition.' })} />
          <ToggleRow label="Require two-factor authentication" description="All members must enable 2FA." checked={settings['auth:2faRequired'] === 'true'} onChange={(v) => void saveSetting('auth:2faRequired', v)} />
        </div>
      </SettingsCard>

      <SettingsCard title="Your two-factor authentication" description="Enable TOTP 2FA for your own account. You will enter a code at every sign-in.">
        {twoFA.enabled ? (
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
              <Check size={9} className="mr-0.5" /> 2FA enabled
            </Badge>
            {!showDisable ? (
              <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => setShowDisable(true)}>Disable</Button>
            ) : (
              <div className="flex items-center gap-2">
                <Input type="password" placeholder="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} className="h-8 w-40 text-[12px]" />
                <Button variant="destructive" size="sm" className="h-8 text-[11px]" onClick={() => void disable2FA()}>Confirm</Button>
                <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => { setShowDisable(false); setDisablePw('') }}>Cancel</Button>
              </div>
            )}
          </div>
        ) : twoFA.step === 'qr' && twoFA.qr ? (
          <div className="space-y-3">
            <div className="text-[12px] text-muted-foreground">Scan this with your authenticator app, then enter the 6-digit code.</div>
            <img src={twoFA.qr} alt="2FA QR code" className="w-44 h-44 rounded-lg border border-border" />
            <div className="text-[10px] text-muted-foreground font-mono break-all">Secret: {twoFA.secret}</div>
            <div className="flex items-center gap-2">
              <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" className="h-8 w-32 font-mono text-[12px]" inputMode="numeric" />
              <Button size="sm" className="h-8 text-[11px]" onClick={() => void verify2FA()}>Verify &amp; enable</Button>
              <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => setTwoFA({ enabled: false, step: 'idle' })}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" className="h-8 gap-2" onClick={() => void setup2FA()}>
            <ShieldCheck size={12} />
            Enable 2FA
          </Button>
        )}
      </SettingsCard>

      <SettingsCard title="SSH keys" description="SSH keys Slipway uses to connect to your servers and clone private repositories." action={<Button size="sm" className="h-8 gap-2" onClick={onAddSshKey}><Plus size={12} />Add key</Button>}>
        <div className="space-y-2">
          {sshKeys.length === 0 && (
            <div className="text-[13px] text-muted-foreground py-6 text-center">No SSH keys added.</div>
          )}
          {sshKeys.map((k) => (
            <div key={k.id} className="rounded-lg border border-border p-3 flex items-center gap-3">
              <KeyRound size={14} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{k.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {k.fingerprint ?? 'no fingerprint'} · scope: {k.scope} · added {k.createdAt.slice(0, 10)}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { navigator.clipboard?.writeText(k.publicKey); toast({ title: 'Public key copied' }) }}>
                <Copy size={11} />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-500 hover:text-rose-500" onClick={() => void removeKey(k)}>
                <Trash2 size={11} />
              </Button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Audit log" description="Recent admin actions, drawn from the live activity feed.">
        <div className="rounded-lg border border-border bg-muted/20 p-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1">
          {audit.length === 0 && <div className="text-muted-foreground">No activity yet.</div>}
          {audit.map((e) => (
            <div key={e.id} className="text-muted-foreground">
              <span className="text-foreground">{e.ts.slice(0, 19).replace('T', ' ')}</span> {e.actor} {e.message}
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Secrets management" description="Slipway stores environment variables in the local SQLite database. For production, place the database on encrypted storage or back it with an external KMS.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <Lock size={10} /> Storage
            </div>
            <div className="text-[13px] font-medium mt-1">SQLite (local)</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <ShieldCheck size={10} /> At rest
            </div>
            <div className="text-[13px] font-medium mt-1">Encrypt the DB volume</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <KeyRound size={10} /> External KMS
            </div>
            <div className="text-[13px] font-medium mt-1">Optional · Vault / AWS KMS</div>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile — account, API tokens, server info, export, updates
// ---------------------------------------------------------------------------

function ProfileSettings({ onNewToken }: { onNewToken: () => void }) {
  const { toast } = useToast()
  const [profile, setProfile] = React.useState<{ username: string; email: string | null; displayName: string | null; role: string } | null>(null)
  const [displayName, setDisplayName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [tokens, setTokens] = React.useState<Token[]>([])
  const [version, setVersion] = React.useState('0.0.0')
  const [updateInfo, setUpdateInfo] = React.useState<{ current: string; latest: string | null; upToDate: boolean; known: boolean; note: string } | null>(null)

  const load = React.useCallback(() => {
    void api.get<SettingsResponse>('/api/settings').then((s) => {
      setProfile(s.profile)
      setDisplayName(s.profile?.displayName ?? '')
      setEmail(s.profile?.email ?? '')
      setVersion(s.version)
    }).catch(() => {})
    void api.get<Token[]>('/api/tokens').then(setTokens).catch(() => {})
  }, [])
  React.useEffect(load, [load])

  const saveProfile = async () => {
    await api.patch('/api/settings', { profile: { displayName, email } })
    toast({ title: 'Profile updated' })
    load()
  }

  const revoke = async (t: Token) => {
    await api.del(`/api/tokens/${t.id}`)
    toast({ title: 'Token revoked', description: t.name })
    load()
  }

  const checkUpdates = async () => {
    toast({ title: 'Checking for updates…' })
    try {
      const res = await api.get<{ current: string; latest: string | null; upToDate: boolean; known: boolean; note: string }>('/api/settings/check-for-updates')
      setUpdateInfo(res)
      toast({ title: res.upToDate ? 'Up to date' : 'Update available', description: res.note })
    } catch (e) {
      toast({ title: 'Check failed', description: e instanceof ApiError ? e.message : 'error', variant: 'destructive' })
    }
  }

  const initials = (profile?.displayName || profile?.username || '?').slice(0, 2).toUpperCase()

  return (
    <div className="space-y-4">
      <SettingsCard title="Profile" description="Your personal account settings.">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-emerald-950 font-bold flex items-center justify-center text-xl">
            {initials}
          </div>
          <div>
            <div className="text-[15px] font-semibold">{profile?.displayName || profile?.username || '—'}</div>
            <div className="text-[12px] text-muted-foreground">{profile?.email || 'no email'} · {profile?.role}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div>
            <Label className="text-[11px]">Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 h-8 text-[13px]" />
          </div>
          <div>
            <Label className="text-[11px]">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-8 text-[13px]" />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button size="sm" className="h-8" onClick={() => void saveProfile()}>Save</Button>
        </div>
      </SettingsCard>

      <SettingsCard title="API tokens" description="Use tokens to authenticate the Slipway CLI and automation." action={<Button size="sm" className="h-8 gap-2" onClick={onNewToken}><Plus size={12} />New token</Button>}>
        <div className="space-y-2">
          {tokens.length === 0 && (
            <div className="text-[13px] text-muted-foreground py-6 text-center">No tokens yet.</div>
          )}
          {tokens.map((t) => (
            <div key={t.id} className="rounded-lg border border-border p-3 flex items-center gap-3">
              <KeyRound size={13} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium font-mono">{t.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  scope: {t.scope} · created {t.createdAt.slice(0, 10)} · last used {t.lastUsedAt ? t.lastUsedAt.slice(0, 10) : 'never'}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-[11px] text-rose-500 hover:text-rose-500" onClick={() => void revoke(t)}>
                <Trash2 size={11} className="mr-1" />
                Revoke
              </Button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Slipway server" description="Information about this Slipway installation.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
          {[
            { label: 'Version', value: `v${version}` },
            { label: 'Edition', value: 'Self-hosted' },
            { label: 'Database', value: 'SQLite (local)' },
            { label: 'Install date', value: '—' },
          ].map((i) => (
            <div key={i.label} className="rounded-lg border border-border p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{i.label}</div>
              <div className="font-mono mt-1">{i.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <a href="/api/settings/export" download>
            <Button variant="outline" size="sm" className="h-8 text-[11px] gap-2">
              <Download size={11} />
              Export configuration
            </Button>
          </a>
          <Button variant="outline" size="sm" className="h-8 text-[11px] gap-2" onClick={() => void checkUpdates()}>
            <RefreshCw size={11} />
            Check for updates
          </Button>
          {updateInfo && (
            <span className="text-[11px] text-muted-foreground">{updateInfo.note}</span>
          )}
        </div>
      </SettingsCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------

function SettingsCard({
  title,
  description,
  action,
  children,
}: {
  title: string
  description: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold">{title}</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">{description}</div>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}