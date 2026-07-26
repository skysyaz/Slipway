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
  RotateCw,
  Download,
  Upload,
  Lock,
  User,
  Trash2,
  Plus,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Cpu,
  MemoryStick,
  HardDrive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useSlipway } from '@/lib/slipway/store'
import { StatusDot } from '../icons'
import { TimeAgo, BytesShort } from '../format'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function SettingsView() {
  const servers = useSlipway((s) => s.servers)
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

      {tab === 'cluster' && <ClusterSettings servers={servers} />}
      {tab === 'registries' && <RegistriesSettings />}
      {tab === 'integrations' && <IntegrationsSettings />}
      {tab === 'security' && <SecuritySettings />}
      {tab === 'profile' && <ProfileSettings />}
    </div>
  )
}

function ClusterSettings({ servers }: { servers: any[] }) {
  return (
    <div className="space-y-4">
      <SettingsCard
        title="Cluster"
        description="Your Slipway cluster spans one or more Linux servers. Add workers to scale horizontally."
        action={
          <Button size="sm" className="h-8 gap-2">
            <Plus size={12} />
            Add server
          </Button>
        }
      >
        <div className="space-y-2">
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
                    {s.ip} · {s.os} · Docker {s.dockerVersion} · uptime {s.uptimeHours}h
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
                    <span className="font-mono">{s.diskUsedGb}/{s.diskGb} GB</span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-[11px]">
                  <Terminal size={11} className="mr-1" />
                  Shell
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Add a server" description="Slipway provisions new servers via SSH. Provide the host and an SSH key — Slipway installs Docker and joins the node to the cluster.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-[11px]">Hostname or IP</Label>
            <Input placeholder="188.42.13.20" className="mt-1 h-8 text-[13px] font-mono" />
          </div>
          <div>
            <Label className="text-[11px]">SSH user</Label>
            <Input defaultValue="root" className="mt-1 h-8 text-[13px] font-mono" />
          </div>
          <div>
            <Label className="text-[11px]">SSH key</Label>
            <select className="mt-1 w-full h-8 px-2 rounded-md border border-border bg-background text-[13px]">
              <option>helix-prod-key</option>
              <option>helix-staging-key</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button size="sm" className="h-8">Connect server</Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Cluster-wide maintenance" description="Set windows where Slipway will pause auto-deploys and run pending upgrades.">
        <div className="space-y-2.5">
          <ToggleRow label="Auto-upgrade Slipway in maintenance windows" description="Apply patch releases automatically. Major upgrades always require manual confirmation." defaultChecked />
          <ToggleRow label="Sunday 02:00–04:00 UTC maintenance window" description="Pause auto-deploys to production during this window." defaultChecked />
        </div>
      </SettingsCard>
    </div>
  )
}

function RegistriesSettings() {
  const { toast } = useToast()
  const registries = [
    { name: 'ghcr.io', url: 'ghcr.io', auth: 'token', scopes: 'helixco/*, slipway/*', default: true },
    { name: 'Docker Hub', url: 'docker.io', auth: 'anonymous', scopes: 'public', default: false },
    { name: 'Private registry', url: 'registry.slipway.run', auth: 'basic', scopes: 'legacy-crm/*', default: false },
  ]
  return (
    <SettingsCard
      title="Container registries"
      description="Where Slipway pulls base images and pushes built images. Supports Docker Hub, GHCR, Gitea, Harbor, and any OCI-compliant registry."
      action={<Button size="sm" className="h-8 gap-2"><Plus size={12} />Add registry</Button>}
    >
      <div className="space-y-2">
        {registries.map((r) => (
          <div key={r.name} className="rounded-lg border border-border p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{r.name}</span>
                {r.default && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">default push target</Badge>}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                {r.url} · auth: {r.auth} · scopes: {r.scopes}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => toast({ title: 'Registry token rotated' })}>
              <RotateCw size={11} className="mr-1" />
              Rotate
            </Button>
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}

function IntegrationsSettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Notifications" description="Where Slipway sends deploy, backup, and alert events.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { name: 'Slack', icon: Slack, desc: '#deploys channel', connected: true },
            { name: 'Email (SMTP)', icon: Mail, desc: 'alerts@helix.co', connected: true },
            { name: 'Discord', icon: Slack, desc: 'webhook', connected: false },
            { name: 'PagerDuty', icon: ShieldCheck, desc: 'on-call rotation', connected: false },
            { name: 'Telegram', icon: Mail, desc: 'bot', connected: false },
            { name: 'Microsoft Teams', icon: Mail, desc: 'channel webhook', connected: false },
          ].map((i) => {
            const Icon = i.icon
            return (
              <div key={i.name} className="rounded-lg border border-border p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{i.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{i.desc}</div>
                </div>
                {i.connected ? (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                    Connected
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]">Connect</Button>
                )}
              </div>
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="Webhooks" description="Outbound webhooks for arbitrary integrations. Slipway POSTs JSON on each event." action={<Button size="sm" className="h-8 gap-2"><Plus size={12} />Add webhook</Button>}>
        <div className="space-y-2">
          {[
            { url: 'https://api.helix.co/hooks/slipway', events: ['deploy.success', 'deploy.failed', 'rollback'], status: 'active' },
            { url: 'https://hooks.slack.com/services/T0/B0/...', events: ['deploy.success'], status: 'active' },
          ].map((w) => (
            <div key={w.url} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Webhook size={12} className="text-muted-foreground" />
                <span className="text-[12px] font-mono truncate flex-1">{w.url}</span>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">{w.status}</Badge>
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

      <SettingsCard title="Source providers" description="Connect Git providers so Slipway can clone repos, install deploy keys, and listen for push events.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { name: 'GitHub', connected: true, detail: 'helixco org · 23 repos' },
            { name: 'GitLab self-hosted', connected: true, detail: 'git.helix.co · 6 repos' },
            { name: 'Gitea', connected: false, detail: 'not connected' },
            { name: 'Bitbucket', connected: false, detail: 'not connected' },
          ].map((p) => (
            <div key={p.name} className="rounded-lg border border-border p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{p.name}</div>
                <div className="text-[10px] text-muted-foreground">{p.detail}</div>
              </div>
              {p.connected ? (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                  <Check size={9} className="mr-0.5" />
                  Connected
                </Badge>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-[11px]">Connect</Button>
              )}
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  )
}

function SecuritySettings() {
  return (
    <div className="space-y-4">
      <SettingsCard title="Authentication" description="How users authenticate to Slipway.">
        <div className="space-y-2.5">
          <ToggleRow label="Email + password" description="Built-in auth with bcrypt-hashed passwords." defaultChecked />
          <ToggleRow label="GitHub OAuth" description="Sign in with GitHub. Maps org membership to roles." defaultChecked />
          <ToggleRow label="GitLab OAuth" description="Sign in with self-hosted GitLab." defaultChecked />
          <ToggleRow label="OIDC (Google, Okta, Keycloak)" description="Generic OpenID Connect provider." />
          <ToggleRow label="SAML 2.0 SSO" description="Enterprise SSO. Available on the Team edition." />
          <ToggleRow label="Two-factor authentication required" description="All members must enable 2FA." defaultChecked />
        </div>
      </SettingsCard>

      <SettingsCard title="SSH keys" description="SSH keys Slipway uses to connect to your servers and clone private repositories." action={<Button size="sm" className="h-8 gap-2"><Plus size={12} />Add key</Button>}>
        <div className="space-y-2">
          {[
            { name: 'helix-prod-key', fp: 'SHA256:abC9...xY2k', created: '2024-08-12', scope: 'cluster' },
            { name: 'helix-staging-key', fp: 'SHA256:deF3...zW4m', created: '2024-11-02', scope: 'staging cluster' },
            { name: 'github-deploy-key', fp: 'SHA256:ghI7...kL8n', created: '2025-01-19', scope: 'repo: helixco/*' },
          ].map((k) => (
            <div key={k.name} className="rounded-lg border border-border p-3 flex items-center gap-3">
              <KeyRound size={14} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{k.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {k.fp} · scope: {k.scope} · added {k.created}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <Copy size={11} />
              </Button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Audit log" description="Immutable log of admin actions. Retained for 1 year.">
        <div className="rounded-lg border border-border bg-muted/20 p-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1">
          {[
            '2026-07-26 09:42 mira.k added domain api.helix-api.com',
            '2026-07-26 09:38 mira.k rotated registry token for ghcr.io',
            '2026-07-26 08:14 tomas enabled auto-rollback for project helix-api',
            '2026-07-26 06:00 system scheduled backup helix-postgres',
            '2026-07-25 22:31 jules created preview env for PR #248',
            '2026-07-25 18:02 sven added server fra1-worker-02 to cluster',
            '2026-07-25 14:45 mira.k disabled 2FA requirement temporarily (reverted 18m later)',
          ].map((line, i) => (
            <div key={i} className="text-muted-foreground">
              <span className="text-foreground">{line.slice(0, 21)}</span>
              {line.slice(21)}
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Secrets management" description="Slipway encrypts all environment variables and secrets at rest with AES-256-GCM.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <Lock size={10} />
              Encryption
            </div>
            <div className="text-[13px] font-medium mt-1">AES-256-GCM</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <KeyRound size={10} />
              Key rotation
            </div>
            <div className="text-[13px] font-medium mt-1">Every 90 days</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <ShieldCheck size={10} />
              External KMS
            </div>
            <div className="text-[13px] font-medium mt-1">Optional · Vault / AWS KMS</div>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}

function ProfileSettings() {
  const { toast } = useToast()
  return (
    <div className="space-y-4">
      <SettingsCard title="Profile" description="Your personal account settings.">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-emerald-950 font-bold flex items-center justify-center text-xl">
            MK
          </div>
          <div>
            <div className="text-[15px] font-semibold">Mira Kowalski</div>
            <div className="text-[12px] text-muted-foreground">mira@helix.co · admin</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-[10px]">admin</Badge>
              <Badge variant="outline" className="text-[10px]">2FA on</Badge>
              <Badge variant="outline" className="text-[10px]">last login 4h ago</Badge>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div>
            <Label className="text-[11px]">Display name</Label>
            <Input defaultValue="Mira Kowalski" className="mt-1 h-8 text-[13px]" />
          </div>
          <div>
            <Label className="text-[11px]">Email</Label>
            <Input defaultValue="mira@helix.co" className="mt-1 h-8 text-[13px]" />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button size="sm" className="h-8" onClick={() => toast({ title: 'Profile updated' })}>
            Save
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="API tokens" description="Use tokens to authenticate the Slipway CLI and automation." action={<Button size="sm" className="h-8 gap-2"><Plus size={12} />New token</Button>}>
        <div className="space-y-2">
          {[
            { name: 'laptop-cli', scope: 'read, deploy', created: '2026-05-12', lastUsed: '4h ago' },
            { name: 'ci-runner', scope: 'deploy only', created: '2026-02-03', lastUsed: '12m ago' },
            { name: 'migration-script', scope: 'read only', created: '2025-11-19', lastUsed: '3d ago' },
          ].map((t) => (
            <div key={t.name} className="rounded-lg border border-border p-3 flex items-center gap-3">
              <KeyRound size={13} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium font-mono">{t.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  scope: {t.scope} · created {t.created} · last used {t.lastUsed}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => toast({ title: 'Token revoked' })}>
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
            { label: 'Version', value: 'v1.4.2' },
            { label: 'Edition', value: 'Self-hosted (open source)' },
            { label: 'Database', value: 'SQLite · 142 MB' },
            { label: 'Install date', value: '2024-08-12' },
          ].map((i) => (
            <div key={i.label} className="rounded-lg border border-border p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{i.label}</div>
              <div className="font-mono mt-1">{i.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-8 text-[11px] gap-2">
            <Download size={11} />
            Export configuration
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px] gap-2">
            <RefreshCw size={11} />
            Check for updates
          </Button>
          <span className="text-[11px] text-muted-foreground">Slipway 1.4.3 available · upgrade in maintenance window</span>
        </div>
      </SettingsCard>
    </div>
  )
}

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

function ToggleRow({ label, description, defaultChecked }: { label: string; description: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  )
}
