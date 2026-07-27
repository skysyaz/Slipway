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
} from 'lucide-react'
import { useSlipway } from '@/lib/slipway/store'
import { databaseVersions, databasePorts, latestDbVersion, dbMeta } from '@/lib/slipway/data'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

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
  const [submitting, setSubmitting] = React.useState(false)
  const run = async (fn: () => void) => {
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 400))
    fn()
    setSubmitting(false)
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
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [kind, setKind] = React.useState<string>('postgres')
  const [name, setName] = React.useState('')
  const [version, setVersion] = React.useState<string>(latestDbVersion('postgres'))
  const [size, setSize] = React.useState('20')
  const [projectId, setProjectId] = React.useState('')
  const [backups, setBackups] = React.useState(true)

  React.useEffect(() => {
    if (!open) {
      setKind('postgres')
      setName('')
      setVersion(latestDbVersion('postgres'))
      setSize('20')
      setProjectId('')
      setBackups(true)
    }
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
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name || submitting}
            onClick={() => run(() => {
              addDatabase({
                name,
                kind: kind as any,
                version,
                storageGb: parseInt(size),
                projectId: projectId || undefined,
                port: databasePorts[kind] ?? 5432,
                backupsEnabled: backups,
              })
              toast({ title: 'Database created', description: `${name} (${engineLabel} ${version}) is running and ready.` })
            })}
            className="gap-2"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create database
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
                <div className="text-[12px] font-medium">Encrypt at rest</div>
                <div className="text-[11px] text-muted-foreground">AES-256-GCM</div>
              </div>
            </div>
            <Switch checked={encrypted} onCheckedChange={setEncrypted} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name || submitting}
            onClick={() => run(() => {
              addVolume({ name, mountPath: mount, sizeGb: parseInt(size), type, server, projectId: projectId || undefined, encrypted })
              toast({ title: 'Volume created', description: `${name} mounted at ${mount}.` })
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
export function NewDomainDialog() {
  const open = useSlipway((s) => s.newDomainOpen)
  const setOpen = useSlipway((s) => s.setNewDomainOpen)
  const addDomain = useSlipway((s) => s.addDomain)
  const projects = useSlipway((s) => s.projects)
  const selectedProjectId = useSlipway((s) => s.selectedProjectId)
  const { toast } = useToast()
  const { submitting, run } = useSubmit()

  const [hostname, setHostname] = React.useState('')
  const [projectId, setProjectId] = React.useState(selectedProjectId || projects[0]?.id || '')
  const [type, setType] = React.useState<'primary' | 'redirect' | 'api'>('primary')
  const [ssl, setSsl] = React.useState(true)

  React.useEffect(() => {
    if (!open) { setHostname(''); setType('primary'); setSsl(true) }
    else if (selectedProjectId) setProjectId(selectedProjectId)
  }, [open, selectedProjectId])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Globe size={16} className="text-primary" />
            Add domain
          </DialogTitle>
          <DialogDescription>
            Route a hostname to a project. Slipway provisions and renews TLS certificates via Let's Encrypt automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Hostname" hint="The full domain or subdomain. DNS A record must point at your Slipway server.">
            <Input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="api.helix-api.com"
              className="font-mono text-[13px]"
            />
          </Field>

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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!hostname || !projectId || submitting}
            onClick={() => run(() => {
              addDomain(projectId, hostname, type, ssl)
              toast({ title: 'Domain added', description: `${hostname} routed to project. SSL provisioning started.` })
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
            onClick={() => run(() => {
              runBackup(target, targetKind)
              toast({ title: 'Backup started', description: `${target} backup is running.` })
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
            onClick={() => run(() => {
              addBackupSchedule(target, schedule, parseInt(retention))
              toast({ title: 'Schedule created', description: `${target} will back up on schedule.` })
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
  const triggerDeployment = useSlipway((s) => s.triggerDeployment)
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
            onClick={() => run(() => {
              const project = projects.find((p) => p.id === projectId)
              triggerDeployment(projectId)
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
            Slipway connects to the server over SSH, installs Docker, and joins it to your cluster as a worker.
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
            onClick={() => run(() => {
              addServer({ name, hostname: name + '.slipway.run', ip, role, os: 'Ubuntu 24.04 LTS', cpuCores: 4, memoryGb: 16, diskGb: 200, region: 'eu-fra1' })
              toast({ title: 'Server connected', description: `${name} joined the cluster as ${role}.` })
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
            onClick={() => run(() => {
              useSlipway.getState().addActivity('server', `added SSH key "${name}" (${scope} scope)`)
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
            onClick={() => run(() => {
              useSlipway.getState().addActivity('server', `added registry "${name}" (${url})`)
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
            onClick={() => run(() => {
              useSlipway.getState().addActivity('server', `added webhook ${url} (${events.length} events)`)
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
              onClick={() => run(() => {
                const tok = 'sk_' + Array.from({ length: 40 }, () => Math.random().toString(36)[2]).join('')
                setGenerated(tok)
                useSlipway.getState().addActivity('server', `created API token "${name}" (${scope} scope)`)
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
            onClick={() => run(() => {
              // Add service to project in store
              const state = useSlipway.getState()
              const project = state.projects.find((p) => p.id === projectId)
              if (project) {
                const newSvc = {
                  id: 'svc-' + Math.random().toString(36).slice(2, 9),
                  name,
                  kind,
                  status: 'running' as const,
                  image,
                  replicas: 1,
                  memoryMb: 256,
                  cpuMilli: 200,
                  uptimeSeconds: 0,
                  restarts: 0,
                }
                useSlipway.setState((s) => ({
                  projects: s.projects.map((p) =>
                    p.id === projectId ? { ...p, services: [...p.services, newSvc] } : p,
                  ),
                }))
                state.addActivity('scale', `added service "${name}" to ${project.name}`, projectId)
              }
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
