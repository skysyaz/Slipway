'use client'

import * as React from 'react'
import {
  Database as DatabaseIcon,
  Plus,
  Search,
  HardDrive,
  Activity,
  Archive,
  Server,
  ChevronRight,
  RotateCcw,
  Copy,
  MoreHorizontal,
  Boxes,
  KeyRound,
  Pencil,
  Trash2,
  Loader2,
  Zap,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { useSlipway } from '@/lib/slipway/store'
import { api, ApiError } from '@/lib/api'
import { DbGlyph, StatusDot } from '../icons'
import { TimeAgo, BytesShort } from '../format'
import { useToast, toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { DatabaseInstance } from '@/lib/slipway/types'
import { envKey } from '@/lib/slipway/types'

export function DatabasesView() {
  const databases = useSlipway((s) => s.databases)
  const projects = useSlipway((s) => s.projects)
  const env = useSlipway((s) => s.env)
  const setNewDatabaseOpen = useSlipway((s) => s.setNewDatabaseOpen)
  const restartDatabase = useSlipway((s) => s.restartDatabase)
  const runBackup = useSlipway((s) => s.runBackup)
  const selectProject = useSlipway((s) => s.selectProject)
  const [query, setQuery] = React.useState('')

  // ponytail: honor the global env toggle (bug 6) — a DB tagged Staging only
  // shows under Staging / All. Pre-existing rows (no env) show only under All.
  const filtered = React.useMemo(
    () =>
      databases.filter((d) => {
        if (env !== 'all' && envKey(d.environment) !== envKey(env)) return false
        if (!query) return true
        return d.name.includes(query) || d.kind.includes(query)
      }),
    [databases, env, query],
  )

  const totalStorage = databases.reduce((a, d) => a + d.storageGb, 0)
  const usedStorage = databases.reduce((a, d) => a + d.usedGb, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Databases</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {databases.length} managed databases ·{' '}
            <BytesShort gb={usedStorage} /> of <BytesShort gb={totalStorage} /> used ·{' '}
            {databases.filter((d) => d.backupsEnabled).length} with backups enabled
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setNewDatabaseOpen(true)}>
            <Boxes size={13} />
            Import compose DB
          </Button>
          <Button size="sm" className="h-9 gap-2" onClick={() => setNewDatabaseOpen(true)}>
            <Plus size={13} />
            New database
          </Button>
        </div>
      </div>
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <QuickStat label="Postgres" value={databases.filter((d) => d.kind === 'postgres').length} icon={DatabaseIcon} color="oklch(0.65 0.18 250)" />
        <QuickStat label="MySQL / MariaDB" value={databases.filter((d) => d.kind === 'mysql' || d.kind === 'mariadb').length} icon={DatabaseIcon} color="oklch(0.7 0.15 230)" />
        <QuickStat label="MSSQL" value={databases.filter((d) => d.kind === 'mssql').length} icon={DatabaseIcon} color="oklch(0.6 0.18 250)" />
        <QuickStat label="Redis / Valkey" value={databases.filter((d) => d.kind === 'redis' || d.kind === 'valkey').length} icon={Activity} color="oklch(0.65 0.22 25)" />
        <QuickStat label="MongoDB" value={databases.filter((d) => d.kind === 'mongodb').length} icon={DatabaseIcon} color="oklch(0.7 0.18 140)" />
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search databases…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-9 text-[13px]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.map((db) => {
          const project = projects.find((p) => p.id === db.projectId)
          const usagePct = db.storageGb > 0 ? Math.round((db.usedGb / db.storageGb) * 100) : 0
          // ponytail: a DB without a dockerContainerId is a stale/imported stub
          // (e.g. leftover mock rows). Surface it honestly and disable the
          // container-only actions that would otherwise throw "no container".
          const noContainer = !db.dockerContainerId
          const published = db.port && db.port > 0
          return (
            <div key={db.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <DbGlyph kind={db.kind} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold truncate">{db.name}</span>
                    <StatusDot status={noContainer ? 'offline' : db.status} />
                    {db.environment && (
                      <Badge variant="outline" className="text-[9px] capitalize">{db.environment}</Badge>
                    )}
                    {noContainer && (
                      <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/30 bg-amber-500/10">no container</Badge>
                    )}
                    {db.status === 'external' && !noContainer && (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground">imported</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {db.kind} {db.version} · {published ? `${db.host}:${db.port}` : 'not published on host'}
                  </div>
                </div>
                <DatabaseActions db={db} />
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {project ? (
                  <Badge variant="outline" className="text-[10px]">linked: {project.name}</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">shared</Badge>
                )}
                <Badge variant="outline" className="text-[10px]">{db.region}</Badge>
                {db.backupsEnabled ? (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                    <Archive size={9} className="mr-0.5" />
                    Backups on
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Backups off</Badge>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">Storage</span>
                    <span className="font-mono">{usagePct}%</span>
                  </div>
                  <Progress value={usagePct} className="h-1.5" />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    <BytesShort gb={db.usedGb} /> / <BytesShort gb={db.storageGb} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">Connections</span>
                    <span className="font-mono">{Math.round((db.connections / db.maxConnections) * 100)}%</span>
                  </div>
                  <Progress value={(db.connections / db.maxConnections) * 100} className="h-1.5" />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {db.connections} / {db.maxConnections}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground font-mono">
                  created <TimeAgo ts={db.createdAt} className="text-[10px]" />
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={noContainer}
                    title={noContainer ? 'No real container for this database' : undefined}
                    onClick={() => restartDatabase(db.id)}
                  >
                    <RotateCcw size={10} className="mr-1" />
                    Restart
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => runBackup(db.name, 'database')}>
                    <Archive size={10} className="mr-1" />
                    Backup
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Real per-database actions: show credentials, edit, delete (with data-volume
// option). Replaces the previous stub "⋯" that only fired a toast.
function DatabaseActions({ db }: { db: DatabaseInstance }) {
  const { toast } = useToast()
  const updateDatabase = useSlipway((s) => s.updateDatabase)
  const deleteDatabase = useSlipway((s) => s.deleteDatabase)
  const selectProject = useSlipway((s) => s.selectProject)
  const projects = useSlipway((s) => s.projects)

  const [credsOpen, setCredsOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [delOpen, setDelOpen] = React.useState(false)
  const [rotateOpen, setRotateOpen] = React.useState(false)
  const [removeData, setRemoveData] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const [creds, setCreds] = React.useState<{ username?: string; password?: string; dbName?: string; connectionString?: string; externalConnectionString?: string; note?: string } | null>(null)
  // ponytail: bug 1 — Test Connection runs the engine's ping inside the DB
  // container (server classifies init/permission/disk-full failures from the
  // logs when it's down). Result is shown inline with a friendly hint; the
  // button is just re-clickable for retry. No fake "connected".
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{ ok: boolean; latencyMs?: number; state?: string; error?: string; hint?: string } | null>(null)
  const [editName, setEditName] = React.useState(db.name)
  // ponytail: Radix <SelectItem> forbids value="" (it reserves "" to clear the
  // selection / show the placeholder), so model "no project" as a sentinel and
  // map it back to null on save.
  const NONE = '__none__'
  const [editProject, setEditProject] = React.useState(db.projectId ?? NONE)
  const [editBackups, setEditBackups] = React.useState(db.backupsEnabled)
  // credential rotation: a new password (required) + optional username
  const [newPass, setNewPass] = React.useState('')
  const [newUser, setNewUser] = React.useState('')

  // Rotate works only on a real Slipway-managed container (we know the admin
  // password to exec the ALTER). Imported/external DBs and stub rows are refused.
  const canRotate = !!db.dockerContainerId && db.status !== 'external'

  const showCreds = async () => {
    setCredsOpen(true)
    setCreds(null)
    setTestResult(null)
    try {
      const c = await api.get<{ username?: string; password?: string; dbName?: string; connectionString?: string; externalConnectionString?: string; note?: string }>(`/api/databases/${db.id}/credentials`)
      setCreds(c)
    } catch (e) {
      toast({ title: 'Could not load credentials', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post<{ ok: boolean; latencyMs?: number; state?: string; error?: string; hint?: string }>(`/api/databases/${db.id}/test-connection`)
      setTestResult(r)
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof ApiError ? e.message : 'could not run the connection test' })
    } finally {
      setTesting(false)
    }
  }

  const doRotate = async () => {
    if (!newPass.trim()) {
      toast({ title: 'Enter a new password', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      await api.post(`/api/databases/${db.id}/credentials`, { password: newPass, username: newUser.trim() || undefined })
      toast({ title: 'Credentials updated', description: 'Password rotated. Reveal it via Show credentials.' })
      setRotateOpen(false)
      setNewPass('')
      setNewUser('')
    } catch (e) {
      toast({ title: 'Could not set credentials', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    setBusy(true)
    try {
      await updateDatabase(db.id, {
        name: editName,
        projectId: editProject === NONE ? null : editProject,
        backupsEnabled: editBackups,
      })
      toast({ title: 'Database updated' })
      setEditOpen(false)
    } catch (e) {
      toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    setBusy(true)
    try {
      await deleteDatabase(db.id, removeData)
      toast({ title: 'Database removed', description: removeData ? 'Container and data volume deleted.' : 'Container removed. Data volume kept.' })
      setDelOpen(false)
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <MoreHorizontal size={13} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={showCreds}>
            <KeyRound size={12} className="mr-2" /> Show credentials
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canRotate}
            title={!canRotate ? 'Only Slipway-managed databases (with a real container) can be rotated from here' : undefined}
            onClick={() => { setNewPass(''); setNewUser(db.username ?? ''); setRotateOpen(true) }}
          >
            <RotateCcw size={12} className="mr-2" /> Set / rotate password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setEditName(db.name); setEditProject(db.projectId ?? NONE); setEditBackups(db.backupsEnabled); setEditOpen(true) }}>
            <Pencil size={12} className="mr-2" /> Edit
          </DropdownMenuItem>
          {db.projectId && (
            <DropdownMenuItem onClick={() => selectProject(db.projectId!)}>
              <ChevronRight size={12} className="mr-2" /> Open project
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onClick={() => { setRemoveData(false); setDelOpen(true) }}>
            <Trash2 size={12} className="mr-2" /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Credentials */}
      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound size={16} className="text-primary" /> {db.name} credentials
            </DialogTitle>
            <DialogDescription>Connection details for your {db.kind} database.</DialogDescription>
          </DialogHeader>
          {!creds ? (
            <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2 py-1">
              <CredLine label="Username" value={creds.username} />
              <CredLine label="Password" value={creds.password} mono />
              {creds.dbName && <CredLine label="Database" value={creds.dbName} mono />}
              <CredLine label="Connection string" value={creds.connectionString} mono />
              {creds.externalConnectionString && (
                <CredLine label="External (from outside server)" value={creds.externalConnectionString} mono />
              )}
              {creds.note && <p className="text-[11px] text-amber-600 leading-snug pt-1">{creds.note}</p>}
              <div className="pt-2 border-t border-border mt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">Connection test</div>
                  <Button variant="outline" size="sm" className="h-7 gap-2 text-[11px]" disabled={testing || !db.dockerContainerId} onClick={() => void runTest()}>
                    {testing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                    {testing ? 'Testing…' : 'Test connection'}
                  </Button>
                </div>
                {testResult && (
                  <div className={cn('mt-2 rounded-md border px-2.5 py-2 text-[11px] leading-snug', testResult.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600' : 'border-rose-500/30 bg-rose-500/5 text-rose-600')}>
                    <div className="flex items-center gap-1.5 font-medium">
                      {testResult.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                      {testResult.ok ? `Connected${testResult.latencyMs != null ? ` · ${testResult.latencyMs}ms` : ''}` : testResult.error || 'Connection failed'}
                    </div>
                    {testResult.hint && <p className="mt-1 text-[10.5px] text-muted-foreground">{testResult.hint}</p>}
                  </div>
                )}
                {!db.dockerContainerId && (
                  <p className="mt-1 text-[10.5px] text-muted-foreground">No real container for this database — nothing to test.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rotate credentials */}
      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw size={16} className="text-primary" /> Set credentials for {db.name}
            </DialogTitle>
            <DialogDescription>
              Runs the engine&apos;s credential-change command inside the container ({db.kind}). The new password is stored and revealable via Show credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium">Username {db.username ? `(current: ${db.username})` : ''}</Label>
              <Input value={newUser} onChange={(e) => setNewUser(e.target.value)} placeholder={db.username || 'slipway'} className="font-mono text-[13px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium">New password</Label>
              <Input type="text" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="new password" className="font-mono text-[13px]" />
              {db.kind === 'mssql' && <p className="text-[10px] text-amber-600">MSSQL requires complexity; a fixed <code>Aa1!</code> suffix is appended automatically.</p>}
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              The container is not restarted. For redis/valkey this is not supported (the password is baked into the start command) — recreate the database to change it.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRotateOpen(false)}>Cancel</Button>
            <Button disabled={busy || !newPass.trim()} onClick={doRotate} className="gap-2">
              {busy && <Loader2 size={13} className="animate-spin" />} Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil size={16} className="text-primary" /> Edit {db.name}
            </DialogTitle>
            <DialogDescription>Engine, version, storage, and port can&apos;t change on a running database.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium">Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="font-mono text-[13px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium">Link to project</Label>
              <Select value={editProject} onValueChange={setEditProject}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="— (shared)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— (shared)</SelectItem>
                  {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="text-[12px] font-medium">Automatic backups</div>
              <Switch checked={editBackups} onCheckedChange={setEditBackups} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={busy || !editName} onClick={saveEdit} className="gap-2">
              {busy && <Loader2 size={13} className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {db.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops and removes the {db.kind} container. The database row is deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-[12px] py-2 cursor-pointer">
            <input type="checkbox" checked={removeData} onChange={(e) => setRemoveData(e.target.checked)} className="accent-rose-500" />
            Also delete the data volume (irreversible — all data is lost)
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-rose-600 hover:bg-rose-600/90 text-white"
              disabled={busy}
            >
              {busy ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function CredLine({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  const { toast } = useToast()
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <code className={cn('text-[12px] truncate', mono && 'font-mono')}>{value || '—'}</code>
        {value && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { navigator.clipboard?.writeText(value); toast({ title: 'Copied' }) }}>
            <Copy size={11} />
          </Button>
        )}
      </div>
    </div>
  )
}

function QuickStat({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ size?: number }>; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `oklch(from ${color} l c h / 0.15)`, color }}
      >
        <Icon size={16} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-[18px] font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  )
}
