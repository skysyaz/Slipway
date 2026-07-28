'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Database,
  HardDrive,
  Globe,
  Archive,
  Server,
  GitBranch,
  KeyRound,
  Webhook,
  Box,
  ShieldCheck,
  Plus,
  Loader2,
  Copy,
} from 'lucide-react'
import { useSlipway } from '@/lib/slipway/store'
import { api } from '@/lib/api'
import { databaseVersions, databasePorts, latestDbVersion, dbMeta } from '@/lib/slipway/data'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Environment } from '@/lib/slipway/types'

// Shared field wrapper for compact dialogs
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  )
}

function useSubmit() {
  const { toast } = useToast()
  const [submitting, setSubmitting] = React.useState(false)
  // ponytail: callers used to `run(() => { void api.post(...); toast(success) })`
  // — the promise was discarded, so the dialog closed and toasted success
  // before the request finished (or failed). Always await the callback and
  // surface failures instead of claiming success.
  const run = async <T,>(fn: () => T | Promise<T>): Promise<T | undefined> => {
    setSubmitting(true)
    try {
      await new Promise((r) => setTimeout(r, 400))
      return await fn()
    } catch (e) {
      toast({
        title: 'Request failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
      return undefined
    } finally {
      setSubmitting(false)
    }
  }
  return { submitting, run }
}

// =============================================================================
// New Database dialog
// =============================================================================
// Engine list — order matters (most common first). MSSQL added.
const DB_ENGINES = [
  'postgres',
  'mysql',
  'mariadb',
  'mssql',
  'mongodb',
  'redis',
  'valkey',
  'sqlite',
] as const

export function NewDatabaseDialog() {
  const open = useSlipway((s) => s.newDatabaseOpen)
  const setOpen = useSlipway((s) => s.setNewDatabaseOpen)
  const addDatabase = useSlipway((s) => s.addDatabase)
  const projects = useSlipway((s) => s.projects)
  const globalEnv = useSlipway((s) => s.env)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [kind, setKind] = React.useState<string>('postgres')
  const [name, setName] = React.useState('')
  const [version, setVersion] = React.useState<string>(latestDbVersion('postgres'))
  const [size, setSize] = React.useState('20')
  const [projectId, setProjectId] = React.useState('')
  const [backups, setBackups] = React.useState(true)
  // ponytail: default the env to the global toggle (so "Staging" is preselected
  // when that's the active filter), falling back to production. Tagged onto the
  // DB row so it filters + shows as that env in Deployments (bug 6).
  const [environment, setEnvironment] = React.useState<Environment>('production')
  // one-time credentials reveal after a successful (real) provision
  const [creds, setCreds] = React.useState<{ username?: string; password?: string; dbName?: string; host?: string; port?: number } | null>(null)

  React.useEffect(() => {
    if (!open) {
      setKind('postgres')
      setName('')
      setVersion(latestDbVersion('postgres'))
      setSize('20')
      setProjectId('')
      setBackups(true)
      setEnvironment(globalEnv && globalEnv !== 'all' ? globalEnv : 'production')
      setCreds(null)
    } else {
      setEnvironment(globalEnv && globalEnv !== 'all' ? globalEnv : 'production')
    }
    // deps intentionally limited to `open`: this resets the form when the
    // dialog opens, and must not re-run as the user edits the fields.
  }, [open])

  const versions = databaseVersions[kind] ?? []
  const engineLabel = dbMeta(kind).label

  const pickEngine = (k: string) => {
    setKind(k)
    setVersion(latestDbVersion(k))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Database size={16} className="text-primary" />
            New database
          </DialogTitle>
          <DialogDescription>
            Spin up a managed database in your cluster. Slipway handles provisioning, networking, and (optionally) backups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-[11px] font-medium mb-2 block">Engine</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {DB_ENGINES.map((k) => (
                <button
                  key={k}
                  onClick={() => pickEngine(k)}
                  className={cn(
                    'h-9 rounded-md border text-[11px] font-mono capitalize transition-colors',
                    kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent',
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`helix-${kind}`}
                className="font-mono text-[13px]"
              />
            </Field>
            <Field label="Version" hint={`${engineLabel} · ${versions.length} versions available`}>
              <Select value={version} onValueChange={setVersion}>
                <SelectTrigger className="h-9 text-[13px] font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {versions.map((v) => (
                    <SelectItem key={v} value={v}>
                      <span className="font-mono">{v}</span>
                      {v === versions[0] && (
                        <Badge variant="outline" className="ml-2 text-[9px] h-4 px-1 bg-primary/10 text-primary border-primary/30">
                          latest
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Storage (GB)">
              <Input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="font-mono text-[13px]"
              />
            </Field>
            <Field label="Environment">
              <Select value={environment} onValueChange={(v) => setEnvironment(v as Environment)}>
                <SelectTrigger className="h-9 text-[13px] capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="preview">Preview</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Link to project (optional)">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={15} className="text-emerald-500" />
              <div>
                <div className="text-[12px] font-medium">Automatic backups</div>
                <div className="text-[11px] text-muted-foreground">Every 6 hours · 14-day retention</div>
              </div>
            </div>
            <Switch checked={backups} onCheckedChange={setBackups} />
          </div>
        </div>

        <DialogFooter>
          {creds ? (
            <>
              <div className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                  <ShieldCheck size={12} /> Database provisioned — save these credentials
                </div>
                <CredRow label="Username" value={creds.username} />
                <CredRow label="Password" value={creds.password} mono />
                {creds.dbName && <CredRow label="Database" value={creds.dbName} mono />}
                <CredRow label="Host" value={`${creds.host || 'localhost'}:${creds.port}`} mono />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Bound on 127.0.0.1 — reachable from this host. You can reveal the password again any time from the database&apos;s ⋯ menu → Show credentials.
                </p>
              </div>
              <Button onClick={() => setOpen(false)} className="gap-2">Done</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                disabled={!name || submitting}
                onClick={() =>
                  run(async () => {
                    try {
                      const created = await addDatabase({
                        name,
                        kind: kind as any,
                        version,
                        storageGb: parseInt(size),
                        projectId: projectId || undefined,
                        port: databasePorts[kind] ?? 5432,
                        backupsEnabled: backups,
                        environment,
                      })
                      setCreds({
                        username: (created as { username?: string }).username,
                        password: (created as { password?: string }).password,
                        dbName: (created as { dbName?: string }).dbName,
                        host: (created as { host?: string }).host,
                        port: (created as { port?: number }).port,
                      })
                      toast({ title: 'Database ready', description: `${name} (${engineLabel} ${version}) is running on localhost:${databasePorts[kind] ?? 5432}.` })
                    } catch (e) {
                      toast({ title: 'Could not create database', description: (e as Error).message, variant: 'destructive' })
                    }
                  })
                }
                className="gap-2"
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Create database
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CredRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  const { toast } = useToast()
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <code className={cn('text-[12px] truncate', mono && 'font-mono')}>{value || '—'}</code>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              navigator.clipboard?.writeText(value)
              toast({ title: 'Copied' })
            }}
          >
            <Copy size={11} />
          </Button>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// New Volume dialog
// =============================================================================
export function NewVolumeDialog() {
  const open = useSlipway((s) => s.newVolumeOpen)
  const setOpen = useSlipway((s) => s.setNewVolumeOpen)
  const addVolume = useSlipway((s) => s.addVolume)
  const projects = useSlipway((s) => s.projects)
  const servers = useSlipway((s) => s.servers)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [name, setName] = React.useState('')
  const [mount, setMount] = React.useState('/data')
  const [size, setSize] = React.useState('20')
  const [type, setType] = React.useState<'ssd' | 'hdd' | 'nfs'>('ssd')
  const [server, setServer] = React.useState(servers[0]?.name || '')
  const [projectId, setProjectId] = React.useState('')
  const [encrypted, setEncrypted] = React.useState(true)

  React.useEffect(() => {
    if (!open) {
      setName(''); setMount('/data'); setSize('20'); setType('ssd'); setProjectId(''); setEncrypted(true)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <HardDrive size={16} className="text-primary" />
            New volume
          </DialogTitle>
          <DialogDescription>
            Create a persistent volume mounted into one or more containers. Data survives container restarts and rebuilds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="helix-uploads" className="font-mono text-[13px]" />
            </Field>
            <Field label="Mount path">
              <Input value={mount} onChange={(e) => setMount(e.target.value)} className="font-mono text-[13px]" />
            </Field>
            <Field label="Size (GB)">
              <Input type="number" value={size} onChange={(e) => setSize(e.target.value)} className="font-mono text-[13px]" />
            </Field>
            <Field label="Type">
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="h-9 text-[13px] capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssd">SSD (fast)</SelectItem>
                  <SelectItem value="hdd">HDD (cheap)</SelectItem>
                  <SelectItem value="nfs">NFS (shared)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Server">
              <Select value={server} onValueChange={setServer}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Link to project (optional)">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={15} className="text-emerald-500" />
              <div>
                <div className="text-[12px] font-medium">Mark as encrypted</div>
                <div className="text-[11px] text-muted-foreground">Intent only — Docker local volumes are not encrypted by Slipway</div>
              </div>
            </div>
            <Switch checked={encrypted} onCheckedChange={setEncrypted} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name || submitting}
            onClick={() => void run(async () => {
              await addVolume({ name, mountPath: mount, sizeGb: parseInt(size), type, server, projectId: projectId || undefined, encrypted })
              toast({ title: 'Volume created', description: `${name} created${encrypted ? ' (encryption is recorded as intent — Docker local volumes are not encrypted by Slipway).' : ''}.` })
              setOpen(false)
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create volume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Add Domain dialog
// =============================================================================
const ipDash = (ip: string) => String(ip).trim().replace(/\./g, '-')
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/

export function NewDomainDialog() {
  const open = useSlipway((s) => s.newDomainOpen)
  const setOpen = useSlipway((s) => s.setNewDomainOpen)
  const addDomain = useSlipway((s) => s.addDomain)
  const projects = useSlipway((s) => s.projects)
  const selectedProjectId = useSlipway((s) => s.selectedProjectId)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [mode, setMode] = React.useState<'sslip' | 'custom' | 'ip'>('custom')
  const [hostname, setHostname] = React.useState('')
  const [projectId, setProjectId] = React.useState(selectedProjectId || projects[0]?.id || '')
  const [type, setType] = React.useState<'primary' | 'redirect' | 'api'>('primary')
  const [ssl, setSsl] = React.useState(true)
  const [ipTls, setIpTls] = React.useState<'selfsigned' | 'http'>('selfsigned')
  const [publicIp, setPublicIp] = React.useState<string | null>(null)
  const [hostError, setHostError] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    void api.get<{ publicIp: string | null }>('/api/server-info').then((r) => setPublicIp(r.publicIp)).catch(() => setPublicIp(null))
  }, [open])

  React.useEffect(() => {
    if (!open) { setHostname(''); setType('primary'); setSsl(true); setMode('custom'); setIpTls('selfsigned'); setHostError('') }
    else if (selectedProjectId) setProjectId(selectedProjectId)
  }, [open, selectedProjectId])

  const project = projects.find((p) => p.id === projectId)

  // Resolve the effective hostname per mode.
  const sslipHost = publicIp && project ? `${project.slug}.${ipDash(publicIp)}.sslip.io` : ''
  const effectiveHost =
    mode === 'sslip' ? sslipHost : mode === 'ip' ? publicIp || '' : hostname.trim()

  const validateCustom = (h: string): string => {
    if (!h) return ''
    if (/\s/.test(h)) return 'No spaces allowed.'
    if (/^[a-z]+:\/\//i.test(h)) return 'Remove the scheme (https://).'
    if (h.includes('/')) return 'Remove the path.'
    if (h.includes(':')) return 'Remove the port.'
    if (IP_RE.test(h)) return 'A bare IP is "Server IP (direct)" mode, not a custom domain.'
    if (!HOST_RE.test(h)) return 'Not a valid hostname (e.g. app.example.com).'
    return ''
  }
  const customError = mode === 'custom' ? validateCustom(hostname) : ''

  const canSubmit =
    !!projectId &&
    (mode === 'custom'
      ? hostname.trim().length > 0 && !customError
      : mode === 'sslip'
        ? !!sslipHost
        : !!publicIp)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Globe size={16} className="text-primary" />
            Add domain
          </DialogTitle>
          <DialogDescription>
            Route a hostname to a project. Slipway writes the Traefik route and provisions TLS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Domain source">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'sslip', label: 'Free subdomain', sub: 'sslip.io' },
                  { id: 'custom', label: 'My own domain', sub: 'A record' },
                  { id: 'ip', label: 'Server IP', sub: 'direct' },
                ] as const
              ).map((m) => {
                const disabled = m.id === 'sslip' && !publicIp
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setMode(m.id)}
                    title={disabled ? "Set the server's public IP in Settings" : undefined}
                    className={cn(
                      'rounded-lg border p-2.5 text-left transition-colors',
                      mode === m.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="text-[12px] font-medium">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground">{m.sub}</div>
                  </button>
                )
              })}
            </div>
          </Field>

          {mode === 'sslip' && (
            <Field label="Hostname" hint="No DNS setup needed — points at your server via sslip.io. TLS via Let's Encrypt (HTTP-01); sslip.io is shared so rate-limits may apply.">
              <Input readOnly value={sslipHost || 'Set the server\'s public IP in Settings'} className="font-mono text-[13px] bg-muted/40" />
            </Field>
          )}

          {mode === 'custom' && (
            <Field
              label="Hostname"
              hint={
                publicIp
                  ? `Add an A record pointing at ${publicIp}. On Cloudflare, set DNS-only (grey cloud) for HTTP-01, or use DNS-01.`
                  : 'Add an A record pointing at your server IP. On Cloudflare, set DNS-only (grey cloud) for HTTP-01, or use DNS-01.'
              }
            >
              <Input
                value={hostname}
                onChange={(e) => { setHostname(e.target.value); setHostError('') }}
                placeholder="app.example.com"
                className="font-mono text-[13px]"
              />
              {customError && <p className="text-[11px] text-rose-500 mt-1">{customError}</p>}
            </Field>
          )}

          {mode === 'ip' && (
            <Field label="Hostname" hint="Public CAs (incl. Let's Encrypt) do NOT issue certificates for bare IPs.">
              <Input readOnly value={publicIp || 'Set the server\'s public IP in Settings'} className="font-mono text-[13px] bg-muted/40" />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Project">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Type">
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="h-9 text-[13px] capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="redirect">Redirect</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {mode !== 'ip' ? (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={15} className="text-emerald-500" />
                <div>
                  <div className="text-[12px] font-medium">Provision SSL (Let's Encrypt)</div>
                  <div className="text-[11px] text-muted-foreground">Auto-renewed · HTTP→HTTPS redirect enabled</div>
                </div>
              </div>
              <Switch checked={ssl} onCheckedChange={setSsl} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[12px] font-medium">Encryption</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIpTls('selfsigned')}
                  className={cn('rounded-lg border p-3 text-left transition-colors', ipTls === 'selfsigned' ? 'border-amber-500 bg-amber-500/10' : 'border-border hover:bg-accent')}
                >
                  <div className="text-[12px] font-medium flex items-center gap-1.5"><ShieldCheck size={12} className="text-amber-500" />Self-signed HTTPS</div>
                  <div className="text-[10px] text-amber-600 mt-0.5">Browsers show a security warning; fine for internal/admin.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setIpTls('http')}
                  className={cn('rounded-lg border p-3 text-left transition-colors', ipTls === 'http' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent')}
                >
                  <div className="text-[12px] font-medium">Plain HTTP</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Not encrypted.</div>
                </button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!canSubmit || submitting}
            onClick={() => void run(async () => {
              const useTls = mode === 'ip' ? ipTls === 'selfsigned' : ssl
              await addDomain(projectId, effectiveHost, type, useTls)
              toast({
                title: 'Domain added',
                description:
                  mode === 'ip'
                    ? ipTls === 'selfsigned'
                      ? `${effectiveHost} routed with a self-signed cert.`
                      : `${effectiveHost} routed over plain HTTP.`
                    : ssl
                      ? `${effectiveHost} routed; Let's Encrypt will issue the cert once DNS resolves.`
                      : `${effectiveHost} routed over plain HTTP.`,
              })
              setOpen(false)
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add domain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// New Backup dialog
// =============================================================================
export function NewBackupDialog() {
  const open = useSlipway((s) => s.newBackupOpen)
  const setOpen = useSlipway((s) => s.setNewBackupOpen)
  const runBackup = useSlipway((s) => s.runBackup)
  const databases = useSlipway((s) => s.databases)
  const volumes = useSlipway((s) => s.volumes)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [target, setTarget] = React.useState('')
  const [targetKind, setTargetKind] = React.useState<'database' | 'volume'>('database')

  React.useEffect(() => {
    if (!open) { setTarget(''); setTargetKind('database') }
  }, [open])

  const targets = targetKind === 'database' ? databases.map((d) => d.name) : volumes.map((v) => v.name)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Archive size={16} className="text-primary" />
            Run backup now
          </DialogTitle>
          <DialogDescription>
            Take an immediate snapshot. Stored in the default backup location on the manager node.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Backup type">
            <RadioGroup value={targetKind} onValueChange={(v) => { setTargetKind(v as any); setTarget('') }} className="grid grid-cols-2 gap-2">
              {[
                { id: 'database' as const, label: 'Database' },
                { id: 'volume' as const, label: 'Volume' },
              ].map((o) => (
                <Label key={o.id} htmlFor={`bk-${o.id}`} className={cn('cursor-pointer rounded-md border p-2.5 text-[13px] flex items-center gap-2', targetKind === o.id ? 'border-primary bg-primary/5' : 'border-border')}>
                  <RadioGroupItem value={o.id} id={`bk-${o.id}`} className="sr-only" />
                  {o.label}
                </Label>
              ))}
            </RadioGroup>
          </Field>

          <Field label="Target">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="h-9 text-[13px] font-mono"><SelectValue placeholder="Select target…" /></SelectTrigger>
              <SelectContent>
                {targets.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!target || submitting}
            onClick={() => void run(async () => {
              await runBackup(target, targetKind)
              toast({ title: 'Backup started', description: `${target} backup is running.` })
              setOpen(false)
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
            Run backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// New Backup Schedule dialog
// =============================================================================
export function NewBackupScheduleDialog() {
  const open = useSlipway((s) => s.newBackupScheduleOpen)
  const setOpen = useSlipway((s) => s.setNewBackupScheduleOpen)
  const addBackupSchedule = useSlipway((s) => s.addBackupSchedule)
  const databases = useSlipway((s) => s.databases)
  const volumes = useSlipway((s) => s.volumes)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [target, setTarget] = React.useState('')
  const [schedule, setSchedule] = React.useState('0 */6 * * *')
  const [retention, setRetention] = React.useState('14')

  React.useEffect(() => {
    if (!open) { setTarget(''); setSchedule('0 */6 * * *'); setRetention('14') }
  }, [open])

  const allTargets = [...databases.map((d) => d.name), ...volumes.map((v) => v.name)]

  const presets = [
    { label: 'Every 6 hours', cron: '0 */6 * * *' },
    { label: 'Daily at 02:00', cron: '0 2 * * *' },
    { label: 'Daily at 03:00', cron: '0 3 * * *' },
    { label: 'Weekly (Sun 01:00)', cron: '0 1 * * 0' },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Archive size={16} className="text-primary" />
            New backup schedule
          </DialogTitle>
          <DialogDescription>
            Schedule recurring backups. Slipway runs them automatically and prunes old snapshots per the retention policy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Target">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="h-9 text-[13px] font-mono"><SelectValue placeholder="Select target…" /></SelectTrigger>
              <SelectContent>
                {allTargets.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Schedule preset">
            <div className="grid grid-cols-2 gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.cron}
                  onClick={() => setSchedule(p.cron)}
                  className={cn(
                    'h-8 rounded-md border text-[11px] transition-colors',
                    schedule === p.cron ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Cron expression" hint="Standard 5-field cron (minute hour day month weekday).">
            <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} className="font-mono text-[13px]" />
          </Field>

          <Field label="Retention (days)">
            <Input type="number" value={retention} onChange={(e) => setRetention(e.target.value)} className="font-mono text-[13px]" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!target || submitting}
            onClick={() => void run(async () => {
              await addBackupSchedule(target, schedule, parseInt(retention))
              toast({ title: 'Schedule created', description: `${target} will back up on schedule.` })
              setOpen(false)
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// New Preview dialog
// =============================================================================
export function NewPreviewDialog() {
  const open = useSlipway((s) => s.newPreviewOpen)
  const setOpen = useSlipway((s) => s.setNewPreviewOpen)
  const projects = useSlipway((s) => s.projects)
  const createAndDeploy = useSlipway((s) => s.createAndDeploy)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [projectId, setProjectId] = React.useState('')
  const [branch, setBranch] = React.useState('')

  React.useEffect(() => {
    if (!open) { setProjectId(''); setBranch('') }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitBranch size={16} className="text-primary" />
            New preview environment
          </DialogTitle>
          <DialogDescription>
            Spin up a disposable preview environment for a branch or PR. Includes a unique subdomain and SSL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Project">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Branch or PR" hint="The Git branch to deploy. Slipway builds and exposes it on *.preview.slipway.app.">
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="feature/new-checkout" className="font-mono text-[13px]" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!projectId || !branch || submitting}
            onClick={() => void run(async () => {
              const project = projects.find((p) => p.id === projectId)
              await createAndDeploy({ existingProjectId: projectId, branch, environment: 'preview' })
              toast({ title: 'Preview started', description: `${project?.name} preview for ${branch} is building.` })
              setOpen(false)
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Add Server dialog
// =============================================================================
export function NewServerDialog() {
  const open = useSlipway((s) => s.newServerOpen)
  const setOpen = useSlipway((s) => s.setNewServerOpen)
  const addServer = useSlipway((s) => s.addServer)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [name, setName] = React.useState('')
  const [ip, setIp] = React.useState('')
  const [user, setUser] = React.useState('root')
  const [sshKey, setSshKey] = React.useState('helix-prod-key')
  const [role, setRole] = React.useState<'manager' | 'worker' | 'standalone'>('worker')

  React.useEffect(() => {
    if (!open) { setName(''); setIp(''); setUser('root'); setSshKey('helix-prod-key'); setRole('worker') }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Server size={16} className="text-primary" />
            Add server to cluster
          </DialogTitle>
          <DialogDescription>
            Records the server here. Use <b>Join</b> afterwards to reach it over SSH and read its OS and Docker version — Slipway does not install Docker for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hostname or IP">
              <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="188.42.13.20" className="font-mono text-[13px]" />
            </Field>
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="fra1-worker-03" className="font-mono text-[13px]" />
            </Field>
            <Field label="SSH user">
              <Input value={user} onChange={(e) => setUser(e.target.value)} className="font-mono text-[13px]" />
            </Field>
            <Field label="SSH key">
              <Select value={sshKey} onValueChange={setSshKey}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="helix-prod-key">helix-prod-key</SelectItem>
                  <SelectItem value="helix-staging-key">helix-staging-key</SelectItem>
                  <SelectItem value="github-deploy-key">github-deploy-key</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Role">
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="h-9 text-[13px] capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">Worker (receives workloads)</SelectItem>
                  <SelectItem value="manager">Manager (control plane)</SelectItem>
                  <SelectItem value="standalone">Standalone (single-node)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!ip || !name || submitting}
            onClick={() => void run(async () => {
              // ponytail: record ONLY what the operator actually told us. This
              // used to invent a hostname (`<name>.slipway.run`), an OS
              // ("Ubuntu 24.04 LTS"), 4 cores, 16 GB RAM, a 200 GB disk and a
              // region ("eu-fra1") for a machine nobody had contacted yet —
              // all of which the Servers list then displayed as fact. The real
              // OS and Docker version are discovered by the SSH join probe;
              // until that runs the row stays honestly blank.
              await addServer({ name, hostname: ip, ip, role, sshUser: user, sshKeyId: sshKey })
              toast({
                title: 'Server added',
                description: `${name} is recorded as ${role} but not connected yet — use Join to reach it over SSH.`,
              })
              setOpen(false)
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Connect server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Add SSH Key dialog
// =============================================================================
export function NewSshKeyDialog() {
  const open = useSlipway((s) => s.newSshKeyOpen)
  const setOpen = useSlipway((s) => s.setNewSshKeyOpen)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [name, setName] = React.useState('')
  const [publicKey, setPublicKey] = React.useState('')
  const [scope, setScope] = React.useState('cluster')

  React.useEffect(() => {
    if (!open) { setName(''); setPublicKey(''); setScope('cluster') }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound size={16} className="text-primary" />
            Add SSH key
          </DialogTitle>
          <DialogDescription>
            Add a public SSH key. Slipway uses it to connect to servers and clone private repos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="helix-prod-key" className="font-mono text-[13px]" />
          </Field>
          <Field label="Public key" hint="Paste your id_ed25519.pub or id_rsa.pub contents.">
            <Textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="ssh-ed25519 AAAAC3Nz…"
              className="font-mono text-[11px] min-h-[80px] resize-none"
            />
          </Field>
          <Field label="Scope">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-9 text-[13px] capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cluster">Cluster (all servers)</SelectItem>
                <SelectItem value="repo">Repository (deploy key)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name || !publicKey || submitting}
            onClick={() => void run(async () => {
              await api.post('/api/ssh-keys', { name, publicKey, scope })
              setOpen(false)
              toast({ title: 'SSH key added', description: `${name} can now be used for ${scope} access.` })
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Add Registry dialog
// =============================================================================
export function NewRegistryDialog() {
  const open = useSlipway((s) => s.newRegistryOpen)
  const setOpen = useSlipway((s) => s.setNewRegistryOpen)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [auth, setAuth] = React.useState<'token' | 'basic' | 'anonymous'>('token')
  const [token, setToken] = React.useState('')

  React.useEffect(() => {
    if (!open) { setName(''); setUrl(''); setAuth('token'); setToken('') }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Box size={16} className="text-primary" />
            Add container registry
          </DialogTitle>
          <DialogDescription>
            Connect a private OCI registry. Slipway uses it for image pushes and pulls.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="harbor-prod" className="font-mono text-[13px]" />
          </Field>
          <Field label="Registry URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="harbor.example.com" className="font-mono text-[13px]" />
          </Field>
          <Field label="Auth method">
            <Select value={auth} onValueChange={(v) => setAuth(v as any)}>
              <SelectTrigger className="h-9 text-[13px] capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="token">Token (bearer)</SelectItem>
                <SelectItem value="basic">Basic (username + password)</SelectItem>
                <SelectItem value="anonymous">Anonymous (public)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {auth !== 'anonymous' && (
            <Field label={auth === 'token' ? 'Token' : 'Password'}>
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} className="font-mono text-[13px]" />
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name || !url || submitting}
            onClick={() => void run(async () => {
              await api.post('/api/registries', { name, url, auth, token: auth === 'token' ? token : undefined, password: auth === 'basic' ? token : undefined })
              setOpen(false)
              toast({ title: 'Registry added', description: `${name} connected.` })
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add registry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Add Webhook dialog
// =============================================================================
export function NewWebhookDialog() {
  const open = useSlipway((s) => s.newWebhookOpen)
  const setOpen = useSlipway((s) => s.setNewWebhookOpen)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [url, setUrl] = React.useState('')
  const [events, setEvents] = React.useState<string[]>(['deploy.success'])

  const allEvents = ['deploy.success', 'deploy.failed', 'rollback', 'backup.completed', 'backup.failed', 'ssl.expiring', 'server.degraded']

  React.useEffect(() => {
    if (!open) { setUrl(''); setEvents(['deploy.success']) }
  }, [open])

  const toggleEvent = (e: string) => {
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Webhook size={16} className="text-primary" />
            Add webhook
          </DialogTitle>
          <DialogDescription>
            Slipway POSTs a JSON payload to this URL on each subscribed event.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Webhook URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/hooks/slipway" className="font-mono text-[13px]" />
          </Field>
          <Field label="Events">
            <div className="flex flex-wrap gap-1.5">
              {allEvents.map((e) => (
                <button
                  key={e}
                  onClick={() => toggleEvent(e)}
                  className={cn(
                    'h-6 px-2 rounded-full text-[10px] font-mono border transition-colors',
                    events.includes(e) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!url || events.length === 0 || submitting}
            onClick={() => void run(async () => {
              await api.post('/api/webhooks', { url, events })
              setOpen(false)
              toast({ title: 'Webhook added', description: `Subscribed to ${events.length} event${events.length === 1 ? '' : 's'}.` })
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add webhook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// New API Token dialog
// =============================================================================
export function NewTokenDialog() {
  const open = useSlipway((s) => s.newTokenOpen)
  const setOpen = useSlipway((s) => s.setNewTokenOpen)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [name, setName] = React.useState('')
  const [scope, setScope] = React.useState<'read' | 'deploy' | 'admin'>('deploy')
  const [generated, setGenerated] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) { setName(''); setScope('deploy'); setGenerated(null) }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound size={16} className="text-primary" />
            New API token
          </DialogTitle>
          <DialogDescription>
            Tokens authenticate the Slipway CLI and CI pipelines. Store them securely — they won't be shown again.
          </DialogDescription>
        </DialogHeader>

        {generated ? (
          <div className="py-2 space-y-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider mb-1.5">Your new token</div>
              <code className="block font-mono text-[11px] break-all text-foreground">{generated}</code>
            </div>
            <p className="text-[11px] text-muted-foreground">Copy this token now. It will not be shown again.</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                navigator.clipboard?.writeText(generated)
                toast({ title: 'Copied' })
              }}
            >
              Copy token
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Field label="Token name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ci-runner" className="font-mono text-[13px]" />
            </Field>
            <Field label="Scope">
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger className="h-9 text-[13px] capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read only</SelectItem>
                  <SelectItem value="deploy">Deploy only</SelectItem>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{generated ? 'Done' : 'Cancel'}</Button>
          {!generated && (
            <Button
              disabled={!name || submitting}
              onClick={() => void run(async () => {
                const res = await api.post<{ token: string }>('/api/tokens', { name, scope })
                setGenerated(res.token)
              })}
              className="gap-2"
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Generate token
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Add Service dialog (project detail)
// =============================================================================
export function AddServiceDialog({ projectId }: { projectId: string }) {
  const open = useSlipway((s) => s.addServiceOpen)
  const setOpen = useSlipway((s) => s.setAddServiceOpen)
  const addService = useSlipway((s) => s.addService)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState<'app' | 'worker' | 'cron'>('worker')
  const [image, setImage] = React.useState('')

  React.useEffect(() => {
    if (!open) { setName(''); setKind('worker'); setImage('') }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Box size={16} className="text-primary" />
            Add service
          </DialogTitle>
          <DialogDescription>
            Add a service to this project. Slipway will schedule it on the cluster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="scheduler" className="font-mono text-[13px]" />
          </Field>
          <Field label="Kind">
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger className="h-9 text-[13px] capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="app">App (HTTP)</SelectItem>
                <SelectItem value="worker">Worker (background)</SelectItem>
                <SelectItem value="cron">Cron (scheduled)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Image" hint="Docker image to run.">
            <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="ghcr.io/myorg/scheduler:latest" className="font-mono text-[13px]" />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name || !image || submitting}
            onClick={() => void run(async () => {
              await addService(projectId, { name, kind, image, replicas: 1, memoryMb: 256, cpuMilli: 200 })
              setOpen(false)
              toast({ title: 'Service added', description: `${name} is now scheduled.` })
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Renders all dialogs at once (mounted in page.tsx)
// =============================================================================
export function AllDialogs() {
  return (
    <>
      <NewDatabaseDialog />
      <NewVolumeDialog />
      <NewDomainDialog />
      <NewBackupDialog />
      <NewBackupScheduleDialog />
      <NewPreviewDialog />
      <NewServerDialog />
      <NewSshKeyDialog />
      <NewRegistryDialog />
      <NewWebhookDialog />
      <NewTokenDialog />
    </>
  )
}
