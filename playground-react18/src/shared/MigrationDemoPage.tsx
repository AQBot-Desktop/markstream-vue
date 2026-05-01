import { Icon } from '@iconify/react'
import { NodeRenderer } from 'markstream-react'
import afterAdvancedSource from '../../../test/fixtures/react-markdown-migration-demo/after-advanced.tsx?raw'
import afterBasicSource from '../../../test/fixtures/react-markdown-migration-demo/after-basic.tsx?raw'
import beforeAdvancedSource from '../../../test/fixtures/react-markdown-migration-demo/before-advanced.tsx?raw'
import beforeBasicSource from '../../../test/fixtures/react-markdown-migration-demo/before-basic.tsx?raw'
import skillOutputSource from '../../../test/fixtures/react-markdown-migration-demo/skill-output.md?raw'
import { PLAYGROUND_CUSTOM_HTML_TAGS, PLAYGROUND_CUSTOM_ID } from './markstreamPlayground'

interface MigrationDemoPageProps {
  isDark: boolean
  onGoHome: () => void
  onGoTest: () => void
}

interface CodePanelProps {
  badge: string
  title: string
  description: string
  code: string
}

function CodePanel({ badge, title, description, code }: CodePanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20 overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {badge}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
          </div>
          <div className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            TSX
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {description}
        </p>
      </div>

      <pre className="overflow-x-auto bg-slate-950 px-5 py-4 text-[13px] leading-6 text-slate-100">
        <code>{code}</code>
      </pre>
    </section>
  )
}

export function MigrationDemoPage({ isDark, onGoHome, onGoTest }: MigrationDemoPageProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_48%,_#ffffff_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_32%),linear-gradient(180deg,_#0f172a_0%,_#111827_48%,_#020617_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-2xl shadow-slate-300/40 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/88 dark:shadow-black/30">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-700/80">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                <Icon icon="carbon:skill-level-basic" className="h-4 w-4" />
                Skill Demo
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                react-markdown to markstream-react
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                This demo is intentionally isolated from the main repository implementation. The repo itself is not a
                real
                {' '}
                <code>react-markdown</code>
                {' '}
                consumer, so this page shows how the migration skill audits a synthetic before/after example without
                polluting the main playground.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                onClick={onGoHome}
              >
                <Icon icon="carbon:home" className="h-4 w-4" />
                Home
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                onClick={onGoTest}
              >
                <Icon icon="carbon:rocket" className="h-4 w-4" />
                Test Lab
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
            <section className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <CodePanel
                  badge="Before"
                  title="Basic Call Site"
                  description="A plain react-markdown render with no plugin chain. The skill should classify this as a direct migration."
                  code={beforeBasicSource}
                />
                <CodePanel
                  badge="After"
                  title="Basic Migration"
                  description="This is the low-risk replacement path: swap in markstream-react, import CSS, and pass the markdown through content."
                  code={afterBasicSource}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <CodePanel
                  badge="Before"
                  title="Advanced Call Site"
                  description="This example intentionally mixes custom components, remark-gfm, rehype-raw, allowlisting, and URL rewriting so the skill has real migration decisions to make."
                  code={beforeAdvancedSource}
                />
                <CodePanel
                  badge="After"
                  title="Advanced Migration"
                  description="The safe 80 percent moves to setCustomComponents and custom link handling. The element allowlist remains a manual review item."
                  code={afterAdvancedSource}
                />
              </div>
            </section>

            <aside className="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20 overflow-hidden">
              <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-cyan-50 px-5 py-4 dark:border-slate-700 dark:from-amber-500/10 dark:to-cyan-500/10">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Audit Output
                </div>
                <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Suggested Skill Report
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  The panel below renders the markdown audit report that the migration skill would produce for this
                  fixture.
                </p>
              </div>

              <div className="max-h-[1120px] overflow-y-auto px-5 py-5">
                <NodeRenderer
                  content={skillOutputSource}
                  isDark={isDark}
                  customId={PLAYGROUND_CUSTOM_ID}
                  customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}
                  renderCodeBlocksAsPre
                  viewportPriority={false}
                  deferNodesUntilVisible={false}
                  maxLiveNodes={0}
                />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
