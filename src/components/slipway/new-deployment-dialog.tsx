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
  GitBranch,
  Folder,
  Boxes,
  ChevronRight,
  ChevronLeft,
  Rocket,
  Check,
  Loader2,
  Sparkles,
  GitCommit,
  Wrench,
  ShieldCheck,
  Server,
  Eye,
} from 'lucide-react'
import { useSlipway } from '@/lib/slipway/store'
import { StackGlyph } from './icons'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'

type Source = 'git' | 'folder' | 'compose'

type DetectedChoice = {
  kind: string
  label: string
  reason: string
  build: string
  start: string
  port: number
  confidence?: string
}

const MANUAL_STACKS: DetectedChoice[] = [
  { kind: 'nextjs', label: 'Next.js', reason: 'manual', build: 'npm run build', start: 'npm run start', port: 3000 },
  { kind: 'node', label: 'Node.js', reason: 'manual', build: '', start: 'npm start', port: 3000 },
  { kind: 'python', label: 'Python', reason: 'manual', build: '', start: 'uvicorn main:app --host 0.0.0.0 --port 8000', port: 8000 },
  { kind: 'go', label: 'Go', reason: 'manual', build: 'CGO_ENABLED=0 go build -o /out/app .', start: './app', port: 8080 },
  { kind: 'static', label: 'Static', reason: 'manual', build: '', start: '', port: 80 },
  { kind: 'dockerfile', label: 'Dockerfile', reason: 'manual', build: '', start: '', port: 3000 },
  { kind: 'compose', label: 'Docker Compose', reason: 'manual', build: '', start: '', port: 0 },
]

const steps = ['Source', 'Detect', 'Configure', 'Review'] as const

function labelFor(kind: string, framework: string): string {
  if (framework && framework !== kind && framework !== 'unknown') {
    return `${kind} · ${framework}`
  }
  const map: Record<string, string> = {
    nextjs: 'Next.js',
    node: 'Node.js',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    static: 'Static',
    dockerfile: 'Dockerfile',
    compose: 'Docker Compose',
    unknown: 'Unknown',
  }
  return map[kind] || kind
}

export function NewDeploymentDialog() {
  const open = useSlipway((s) => s.newDeploymentOpen)
  const setOpen = useSlipway((s) => s.setNewDeploymentOpen)
  const createAndDeploy = useSlipway((s) => s.createAndDeploy)

  const [step, setStep] = React.useState(0)
  const [source, setSource] = React.useState<Source>('git')
  // ponytail: start these EMPTY. They were prefilled with plausible-looking
  // fakes — 'github.com/helixco/web', '/srv/projects/web' — which are not
  // placeholder text but real initial values, so clicking through the wizard
  // saved a repository that doesn't exist and the project could never build.
  // The `placeholder` attribute is what shows an example without submitting it.
  const [repoUrl, setRepoUrl] = React.useState('')
  const [branch, setBranch] = React.useState('')
  const [folderPath, setFolderPath] = React.useState('')
  const [composePath, setComposePath] = React.useState('')
  const [env, setEnv] = React.useState<'production' | 'staging' | 'preview'>('production')
  const [autoDetect, setAutoDetect] = React.useState(true)
  const [choices, setChoices] = React.useState<DetectedChoice[]>(MANUAL_STACKS)
  const [detectedIdx, setDetectedIdx] = React.useState(0)
  const [detecting, setDetecting] = React.useState(false)
  const [detectError, setDetectError] = React.useState('')
  const [domain, setDomain] = React.useState('')
  const [ssl, setSsl] = React.useState(true)
  const [buildCmd, setBuildCmd] = React.useState('')
  const [startCmd, setStartCmd] = React.useState('')
  const [monorepo, setMonorepo] = React.useState(false)
  const [monorepoPath, setMonorepoPath] = React.useState('')
  const [deploying, setDeploying] = React.useState(false)
  const [deployedProjectId, setDeployedProjectId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      // reset after close
      const id = setTimeout(() => {
        setStep(0)
        setSource('git')
        setDeploying(false)
        setDeployedProjectId(null)
        setDetectedIdx(0)
        setDetecting(false)
        setDetectError('')
        setChoices(MANUAL_STACKS)
        setDomain('')
        setSsl(true)
        setAutoDetect(true)
        setBuildCmd('')
        setStartCmd('')
        setMonorepo(false)
        setMonorepoPath('')
        setRepoUrl('')
        setBranch('')
        setFolderPath('')
        setComposePath('')
      }, 200)
      return () => clearTimeout(id)
    }
  }, [open])

  // Real stack detect via POST /api/projects/detect (OpenShip P2).
  React.useEffect(() => {
    if (step !== 1 || !autoDetect) return
    let cancelled = false
    setDetecting(true)
    setDetectError('')
    ;(async () => {
      try {
        if (source === 'compose') {
          const r = await api.post<{
            stack: string
            framework: string
            buildCmd: string
            startCmd: string
            port: number
            confidence: string
          }>('/api/projects/detect', { source: 'compose', files: ['docker-compose.yml'] })
          if (cancelled) return
          const best: DetectedChoice = {
            kind: r.stack || 'compose',
            label: labelFor(r.stack, r.framework),
            reason: `confidence ${r.confidence}`,
            build: r.buildCmd || '',
            start: r.startCmd || '',
            port: r.port || 0,
            confidence: r.confidence,
          }
          setChoices([best, ...MANUAL_STACKS.filter((m) => m.kind !== best.kind)])
          setDetectedIdx(0)
          setBuildCmd(best.build)
          setStartCmd(best.start)
        } else if (source === 'git') {
          if (!repoUrl.trim()) {
            setDetectError('Enter a public github.com repository URL on the Source step to auto-detect.')
            setChoices(MANUAL_STACKS)
            setDetectedIdx(0)
            return
          }
          const r = await api.post<{
            stack: string
            framework: string
            buildCmd: string
            startCmd: string
            port: number
            confidence: string
            fileCount?: number
          }>('/api/projects/detect', {
            repoUrl: repoUrl.trim(),
            branch: branch.trim() || 'main',
          })
          if (cancelled) return
          const best: DetectedChoice = {
            kind: r.stack || 'node',
            label: labelFor(r.stack, r.framework),
            reason: `detected from ${r.fileCount ?? '?'} files · confidence ${r.confidence}`,
            build: r.buildCmd || '',
            start: r.startCmd || '',
            port: r.port || 3000,
            confidence: r.confidence,
          }
          setChoices([best, ...MANUAL_STACKS.filter((m) => m.kind !== best.kind)])
          setDetectedIdx(0)
          setBuildCmd(best.build)
          setStartCmd(best.start)
          if (!domain) {
            const slug = repoUrl.split('/').pop()?.replace(/\.git$/i, '') || 'app'
            setDomain(`${slug}.example.com`)
          }
        } else {
          // Folder: honest — no remote tree; operator picks manually or deploys to detect on checkout.
          setDetectError(
            'Local folder detect runs at deploy time (on the server path). Pick a stack below, or leave defaults and continue.',
          )
          setChoices(MANUAL_STACKS)
          setDetectedIdx(0)
        }
      } catch (e) {
        if (cancelled) return
        setDetectError(e instanceof ApiError ? e.message : 'Detection failed — pick a stack manually.')
        setChoices(MANUAL_STACKS)
        setDetectedIdx(0)
      } finally {
        if (!cancelled) setDetecting(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when entering detect step / toggling auto
  }, [step, autoDetect, source, repoUrl, branch])

  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const deploy = async () => {
    setDeploying(true)
    const stack = choices[detectedIdx] || MANUAL_STACKS[0]
    const nameBase =
      domain?.split('.')[0] ||
      (source === 'git' ? repoUrl.split('/').pop()?.replace(/\.git$/i, '') : source === 'folder' ? folderPath.split('/').pop() : composePath.split('/').slice(-2, -1)[0]) ||
      'new-project'
    try {
      const created = await createAndDeploy({
        name: nameBase,
        source,
        repoUrl: source === 'git' ? repoUrl : undefined,
        branch: source === 'git' ? branch || 'main' : undefined,
        folderPath: source === 'folder' ? folderPath : undefined,
        composePath: source === 'compose' ? composePath : undefined,
        stack: stack.kind,
        stackLabel: stack.label,
        framework: stack.label,
        environment: env,
        domain: domain || undefined,
        ssl,
        buildCmd: buildCmd || undefined,
        startCmd: startCmd || undefined,
        monorepo: monorepo || undefined,
        monorepoPath: monorepo && monorepoPath ? monorepoPath : undefined,
      })
      setDeployedProjectId(created ?? 'done')
    } catch (e) {
      console.error('deploy failed', e)
    } finally {
      setDeploying(false)
    }
  }

  const activeStack = choices[detectedIdx] || MANUAL_STACKS[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl w-[min(960px,95vw)] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Rocket size={18} className="text-primary" />
            New deployment
          </DialogTitle>
          <DialogDescription>
            Connect a repository, point at a local folder, or import an existing Docker Compose app. Slipway detects the stack and ships it.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => {
              const active = i === step
              const done = i < step
              return (
                <React.Fragment key={s}>
                  <div
                    className={cn(
                      'flex items-center gap-2 h-7 px-3 rounded-full text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : done
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {done ? <Check size={12} /> : <span className="font-mono text-[10px]">{i + 1}</span>}
                    {s}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={cn('h-px flex-1', done ? 'bg-primary/40' : 'bg-border')} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 220px)' }}>
          {step === 0 && (
            <SourceStep
              source={source}
              setSource={setSource}
              repoUrl={repoUrl}
              setRepoUrl={setRepoUrl}
              branch={branch}
              setBranch={setBranch}
              folderPath={folderPath}
              setFolderPath={setFolderPath}
              composePath={composePath}
              setComposePath={setComposePath}
              env={env}
              setEnv={setEnv}
            />
          )}
          {step === 1 && (
            <DetectStep
              detecting={detecting}
              detectError={detectError}
              choices={choices}
              detectedIdx={detectedIdx}
              setDetectedIdx={(i: number) => {
                setDetectedIdx(i)
                const c = choices[i]
                if (c) {
                  setBuildCmd(c.build)
                  setStartCmd(c.start)
                }
              }}
              autoDetect={autoDetect}
              setAutoDetect={setAutoDetect}
            />
          )}
          {step === 2 && (
            <ConfigureStep
              stack={activeStack}
              env={env}
              setEnv={setEnv}
              domain={domain}
              setDomain={setDomain}
              ssl={ssl}
              setSsl={setSsl}
              buildCmd={buildCmd}
              setBuildCmd={setBuildCmd}
              startCmd={startCmd}
              setStartCmd={setStartCmd}
              monorepo={monorepo}
              setMonorepo={setMonorepo}
              monorepoPath={monorepoPath}
              setMonorepoPath={setMonorepoPath}
            />
          )}
          {step === 3 && (
            <ReviewStep
              source={source}
              repoUrl={repoUrl}
              branch={branch}
              folderPath={folderPath}
              composePath={composePath}
              stack={activeStack}
              env={env}
              domain={domain}
              ssl={ssl}
              buildCmd={buildCmd}
              startCmd={startCmd}
              deploying={deploying}
              monorepo={monorepo}
              monorepoPath={monorepoPath}
            />
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          {deployedProjectId ? (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button onClick={() => setOpen(false)} className="gap-2">
                <Eye size={14} />
                View deployment
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={deploying}>
                Cancel
              </Button>
              {step > 0 && (
                <Button variant="outline" onClick={back} disabled={deploying} className="gap-1.5">
                  <ChevronLeft size={14} />
                  Back
                </Button>
              )}
              {step < steps.length - 1 ? (
                <Button onClick={next} disabled={step === 1 && detecting} className="gap-1.5">
                  Continue
                  <ChevronRight size={14} />
                </Button>
              ) : (
                <Button onClick={deploy} disabled={deploying} className="gap-2">
                  {deploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                  {deploying ? 'Deploying…' : 'Deploy now'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SourceStep(props: any) {
  const sources: { id: Source; label: string; desc: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'git', label: 'Git repository', desc: 'GitHub, GitLab, Gitea, or any reachable Git URL', icon: GitBranch },
    { id: 'folder', label: 'Local folder', desc: 'Point Slipway at a directory on this server', icon: Folder },
    { id: 'compose', label: 'Docker Compose app', desc: 'Import an existing compose stack as-is', icon: Boxes },
  ]
  return (
    <div className="space-y-5">
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Source</Label>
        <RadioGroup
          value={props.source}
          onValueChange={(v) => props.setSource(v as Source)}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
        >
          {sources.map((s) => {
            const Icon = s.icon
            const active = props.source === s.id
            return (
              <Label
                key={s.id}
                htmlFor={`src-${s.id}`}
                className={cn(
                  'cursor-pointer rounded-lg border p-3 flex flex-col gap-1.5 transition-all',
                  active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-muted-foreground/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={s.id} id={`src-${s.id}`} className="sr-only" />
                  <Icon size={16} />
                  <span className="font-medium text-[13px]">{s.label}</span>
                  {active && <Check size={14} className="ml-auto text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{s.desc}</p>
              </Label>
            )
          })}
        </RadioGroup>
      </div>

      {props.source === 'git' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="repo-url">Repository URL</Label>
            <Input
              id="repo-url"
              value={props.repoUrl}
              onChange={(e) => props.setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              className="font-mono text-[13px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Public repositories only — Slipway holds no credentials, so a private repo can&apos;t be cloned. Paste the
              address bar, the clone URL, or <span className="font-mono">owner/repo</span>; a{' '}
              <span className="font-mono">/tree/branch</span> link sets the branch too.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch">Branch</Label>
            <Input
              id="branch"
              value={props.branch}
              onChange={(e) => props.setBranch(e.target.value)}
              placeholder="default"
              className="font-mono text-[13px]"
            />
            {/* ponytail: blank means "whatever the repo's default branch is".
                This used to default to "main", which fails outright on every
                repository still using master. */}
            <p className="text-[11px] text-muted-foreground">Leave blank to use the repository default.</p>
          </div>
        </div>
      )}

      {props.source === 'folder' && (
        <div className="space-y-1.5">
          <Label htmlFor="folder-path">Folder path on server</Label>
          <Input
            id="folder-path"
            value={props.folderPath}
            onChange={(e) => props.setFolderPath(e.target.value)}
            placeholder="/srv/projects/my-app"
            className="font-mono text-[13px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Slipway will read the files from <code className="font-mono text-[11px]">{props.folderPath}</code> on the manager node.
          </p>
        </div>
      )}

      {props.source === 'compose' && (
        <div className="space-y-1.5">
          <Label htmlFor="compose-path">Path to docker-compose.yml</Label>
          <Input
            id="compose-path"
            value={props.composePath}
            onChange={(e) => props.setComposePath(e.target.value)}
            placeholder="/srv/projects/legacy/docker-compose.yml"
            className="font-mono text-[13px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Slipway imports the compose file as-is — services, volumes, networks, and env are preserved.
          </p>
        </div>
      )}

      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Target environment</Label>
        <RadioGroup
          value={props.env}
          onValueChange={(v) => props.setEnv(v as any)}
          className="grid grid-cols-3 gap-2.5"
        >
          {[
            { id: 'production', label: 'Production', desc: 'Promote on push to main', color: 'oklch(0.7 0.17 158)' },
            { id: 'staging', label: 'Staging', desc: 'Promote on push to staging', color: 'oklch(0.78 0.16 70)' },
            { id: 'preview', label: 'Preview', desc: 'Per-PR environments', color: 'oklch(0.65 0.18 250)' },
          ].map((e) => (
            <Label
              key={e.id}
              htmlFor={`env-${e.id}`}
              className={cn(
                'cursor-pointer rounded-lg border p-2.5 transition-all',
                props.env === e.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value={e.id} id={`env-${e.id}`} className="sr-only" />
                <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                <span className="text-[13px] font-medium">{e.label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{e.desc}</p>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}

function DetectStep(props: {
  detecting: boolean
  detectError?: string
  choices: DetectedChoice[]
  detectedIdx: number
  setDetectedIdx: (i: number) => void
  autoDetect: boolean
  setAutoDetect: (v: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
        <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="text-[13px] font-medium">Automatic stack detection</div>
          <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
            For public <code className="font-mono text-[11px]">github.com</code> repos Slipway lists the tree and
            reads manifests via <code className="font-mono text-[11px]">POST /api/projects/detect</code>. Private
            repos and local folders detect at deploy/checkout time.
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <Switch id="auto-detect" checked={props.autoDetect} onCheckedChange={props.setAutoDetect} />
            <Label htmlFor="auto-detect" className="text-[12px] cursor-pointer">
              Use auto-detection
            </Label>
          </div>
        </div>
      </div>

      {props.detectError && !props.detecting && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-foreground/90">
          {props.detectError}
        </div>
      )}

      {props.detecting ? (
        <div className="space-y-2 py-6 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <div className="text-[13px] font-medium mt-2">Detecting stack…</div>
          <div className="text-[11px] text-muted-foreground font-mono">Calling /api/projects/detect…</div>
        </div>
      ) : (
        <>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {props.autoDetect ? 'Detected stacks (pick one to override)' : 'Choose a stack manually'}
          </div>
          <div className="space-y-2">
            {props.choices.map((s, i) => {
              const active = i === props.detectedIdx
              return (
                <button
                  key={`${s.kind}-${s.label}-${i}`}
                  type="button"
                  onClick={() => props.setDetectedIdx(i)}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 transition-all flex items-start gap-3',
                    active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-muted-foreground/40',
                  )}
                >
                  <StackGlyph stack={s.kind} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{s.label}</span>
                      {props.autoDetect && i === 0 && s.confidence && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/15 text-primary">
                          <Sparkles size={9} className="mr-0.5" />
                          Best match
                        </Badge>
                      )}
                      {active && <Check size={14} className="ml-auto text-primary" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{s.reason}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {s.build ? (
                        <Badge variant="outline" className="text-[10px] font-mono h-5 max-w-full truncate">
                          build: {s.build}
                        </Badge>
                      ) : null}
                      {s.port > 0 && (
                        <Badge variant="outline" className="text-[10px] font-mono h-5">
                          port: {s.port}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ConfigureStep(props: any) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
        <StackGlyph stack={props.stack.kind} size={28} />
        <div className="flex-1">
          <div className="text-[13px] font-medium">{props.stack.label}</div>
          <p className="text-[11px] text-muted-foreground font-mono">{props.stack.reason}</p>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          <Sparkles size={9} className="mr-0.5" />
          Auto-detected
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="build-cmd">Build command</Label>
          <Input
            id="build-cmd"
            value={props.buildCmd}
            onChange={(e) => props.setBuildCmd(e.target.value)}
            className="font-mono text-[13px]"
          />
          <p className="text-[11px] text-muted-foreground">Run inside the build container to produce artifacts.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start-cmd">Start command</Label>
          <Input
            id="start-cmd"
            value={props.startCmd}
            onChange={(e) => props.setStartCmd(e.target.value)}
            className="font-mono text-[13px]"
          />
          <p className="text-[11px] text-muted-foreground">Process the runtime container will execute.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="domain">Primary domain</Label>
        <div className="flex items-center gap-2">
          <Input
            id="domain"
            value={props.domain}
            onChange={(e) => props.setDomain(e.target.value)}
            placeholder="my-app.slipway.app"
            className="font-mono text-[13px]"
          />
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => props.setDomain(`${props.source === 'compose' ? 'crm' : props.source === 'folder' ? 'status' : 'helix-web'}.slipway.app`)}>
            <GitBranch size={13} className="mr-1.5" />
            Use default
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Slipway automatically provisions a <code className="font-mono text-[11px]">*.slipway.app</code> subdomain. Custom domains can be added later.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={16} className="text-emerald-500" />
          <div>
            <div className="text-[13px] font-medium">Managed SSL via Let’s Encrypt</div>
            <p className="text-[11px] text-muted-foreground">Auto-provisioned and auto-renewed. HTTP→HTTPS redirect enabled.</p>
          </div>
        </div>
        <Switch checked={props.ssl} onCheckedChange={props.setSsl} />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <div className="text-[13px] font-medium">Monorepo sub-app</div>
          <p className="text-[11px] text-muted-foreground">
            Only rebuild when files under this path change (push webhook / smart monorepo).
          </p>
        </div>
        <Switch checked={props.monorepo} onCheckedChange={props.setMonorepo} />
      </div>
      {props.monorepo && (
        <div className="space-y-1.5">
          <Label htmlFor="mono-path">Monorepo path</Label>
          <Input
            id="mono-path"
            value={props.monorepoPath}
            onChange={(e) => props.setMonorepoPath(e.target.value)}
            placeholder="apps/web"
            className="font-mono text-[13px]"
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: GitCommit, label: 'CI on push', value: 'Webhook' },
          { icon: Wrench, label: 'Health check', value: 'Container' },
          { icon: Server, label: 'Replicas', value: '1' },
          { icon: Eye, label: 'Preview envs', value: props.env === 'preview' ? 'Per-PR' : 'Off' },
        ].map((opt) => {
          const Icon = opt.icon
          return (
            <div key={opt.label} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon size={11} />
                {opt.label}
              </div>
              <div className="text-[13px] font-medium font-mono mt-1">{opt.value}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReviewStep(props: any) {
  if (props.deploying) {
    return (
      <div className="py-8 space-y-4 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <div>
          <div className="text-[14px] font-semibold">Shipping your app…</div>
          <p className="text-[12px] text-muted-foreground mt-1">
            Slipway is checking out the source, building the image, and releasing it to your cluster.
          </p>
        </div>
        <div className="w-full max-w-md mt-2 space-y-1.5">
          {[
            { label: 'Checkout', done: true },
            { label: 'Detect stack', done: true },
            { label: 'Install dependencies', done: true },
            { label: 'Build', done: false, active: true },
            { label: 'Push image', done: false },
            { label: 'Release to cluster', done: false },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2.5 text-[12px]">
              {s.done ? (
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-emerald-950 flex items-center justify-center shrink-0">
                  <Check size={10} />
                </span>
              ) : s.active ? (
                <Loader2 size={16} className="animate-spin text-primary shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full border border-border shrink-0" />
              )}
              <span className={s.done || s.active ? 'text-foreground' : 'text-muted-foreground'}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-[13px] text-muted-foreground">
        Review your deployment configuration. You can change any of this later from the project page.
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-3">
          <Cell label="Source">
            <div className="flex items-center gap-2">
              {props.source === 'git' && <GitBranch size={13} />}
              {props.source === 'folder' && <Folder size={13} />}
              {props.source === 'compose' && <Boxes size={13} />}
              <span className="font-mono text-[12px]">
                {props.source === 'git'
                  ? props.repoUrl
                  : props.source === 'folder'
                  ? props.folderPath
                  : props.composePath}
              </span>
            </div>
          </Cell>
          <Cell label="Stack">
            <div className="flex items-center gap-2">
              <StackGlyph stack={props.stack.kind} size={20} />
              <span className="text-[12px]">{props.stack.label}</span>
            </div>
          </Cell>
          <Cell label="Environment">
            <Badge variant="outline" className="capitalize text-[11px]">
              {props.env}
            </Badge>
          </Cell>
          <Cell label="Domain">
            <span className="font-mono text-[12px]">{props.domain || '—'}</span>
          </Cell>
          <Cell label="SSL">
            {props.ssl ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-emerald-500">
                <ShieldCheck size={12} />
                Let’s Encrypt (auto-renew)
              </span>
            ) : (
              <span className="text-[12px] text-muted-foreground">Disabled</span>
            )}
          </Cell>
          <Cell label="Monorepo">
            <span className="font-mono text-[12px]">
              {props.monorepo ? props.monorepoPath || 'on' : 'off'}
            </span>
          </Cell>
          <Cell label="Build" className="col-span-3">
            <code className="font-mono text-[12px] text-foreground">{props.buildCmd}</code>
          </Cell>
          <Cell label="Start" className="col-span-3">
            <code className="font-mono text-[12px] text-foreground">{props.startCmd}</code>
          </Cell>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          What Slipway will set up for you
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {[
            'CI pipeline with build, test, image, push',
            'CD release with rolling update',
            'Health checks + automatic rollback on failure',
            'TLS certificate provisioning',
            'DNS + HTTP→HTTPS redirect',
            'Live logs and metrics aggregation',
            'Backup schedule for any attached volumes',
            'Preview environment (if PR-based)',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[12px]">
              <Check size={12} className="text-emerald-500 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('p-3 border-b border-r border-border last:border-r-0', className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</div>
      <div className="text-[12px]">{children}</div>
    </div>
  )
}
