import type { OnDestroy, OnInit } from '@angular/core'
import type { TestLabFrameworkId, TestLabSampleId } from '../../playground-shared/testLabFixtures'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, EventEmitter, Output, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'
import { resolveMarkdownTextareaPaste } from '../../playground-shared/markdownPaste'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES } from '../../playground-shared/testLabFixtures'
import { decodeMarkdownHash, resolveFrameworkTestHref } from '../../playground-shared/testPageState'
import { ThinkingNodeComponent } from './thinking-node.component'

function clampInt(value: number, min: number, max: number, fallback: number) {
  const normalized = Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, normalized))
}

function readTextInput(event: Event, fallback = '') {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? fallback
}

@Component({
  selector: 'app-angular-test-lab',
  standalone: true,
  imports: [CommonModule, MarkstreamAngularComponent],
  template: `
    <div class="test-lab">
      <div class="test-lab__shell">
        <section class="hero-panel">
          <div class="hero-copy">
            <span class="eyebrow">Angular Regression Lab</span>
            <h1>markstream-angular /test</h1>
            <p>
              现在已经把 parser、增强型 code block、KaTeX、Mermaid、Infographic 和 D2 拉进同一套回归驾驶舱。
            </p>
          </div>

          <div class="hero-metrics">
            <div class="metric-card">
              <span>字符数</span>
              <strong>{{ charCount() }}</strong>
            </div>
            <div class="metric-card">
              <span>行数</span>
              <strong>{{ lineCount() }}</strong>
            </div>
            <div class="metric-card">
              <span>预览进度</span>
              <strong>{{ progress() }}%</strong>
            </div>
          </div>

          <div class="framework-switcher">
            <a
              *ngFor="let framework of frameworkCards"
              class="framework-chip"
              [class.framework-chip--current]="framework.id === currentFramework"
              [href]="frameworkHref(framework.id)"
            >
              <span class="framework-chip__label">{{ framework.label }}</span>
              <span class="framework-chip__note">{{ framework.note }}</span>
            </a>
          </div>
        </section>

        <div class="lab-layout">
          <aside class="panel-card sidebar-card">
            <div class="panel-head">
              <div>
                <h2>样例切换</h2>
                <p>选一段输入，直接开始回归。</p>
              </div>
              <span class="mini-pill">{{ activeSample().title }}</span>
            </div>

            <div class="sample-list">
              <button
                *ngFor="let sample of sampleCards"
                type="button"
                class="sample-card"
                [class.sample-card--active]="sample.id === selectedSampleId()"
                (click)="applySample(sample.id)"
              >
                <strong>{{ sample.title }}</strong>
                <span>{{ sample.summary }}</span>
              </button>
            </div>

            <div class="panel-head panel-head--spaced">
              <div>
                <h2>流式控制</h2>
                <p>看 Angular baseline 在 streaming 下是否稳定。</p>
              </div>
            </div>

            <div class="control-grid">
              <label class="input-card">
                <span>每次追加字符</span>
                <input
                  type="number"
                  min="1"
                  max="80"
                  [value]="streamSpeed()"
                  (input)="updateStreamSpeed($event)"
                >
              </label>

              <label class="input-card">
                <span>更新时间间隔 (ms)</span>
                <input
                  type="number"
                  min="8"
                  max="300"
                  [value]="streamInterval()"
                  (input)="updateStreamInterval($event)"
                >
              </label>
            </div>

            <div class="button-grid">
              <button type="button" class="btn btn--primary" (click)="toggleStreamRender()">
                {{ isStreaming() ? '停止流式渲染' : '开始流式渲染' }}
              </button>
              <button type="button" class="btn" (click)="resetEditor()">
                重置样例
              </button>
              <button type="button" class="btn" (click)="clearEditor()">
                清空输入
              </button>
              <button type="button" class="btn" (click)="navigateHome.emit()">
                返回主 demo
              </button>
            </div>
          </aside>

          <section class="workspace-grid">
            <article class="workspace-card">
              <header class="workspace-card__head">
                <div>
                  <h2>Markdown 输入</h2>
                  <p>把复现内容直接贴进来。</p>
                </div>
              </header>

              <textarea
                class="editor-textarea"
                spellcheck="false"
                placeholder="在这里粘贴 markdown..."
                [value]="input()"
                (input)="updateInput($event)"
                (paste)="handleEditorPaste($event)"
              ></textarea>

              <footer class="workspace-card__foot">
                <span>{{ charCount() }} chars</span>
                <span>{{ lineCount() }} lines</span>
              </footer>
            </article>

            <article class="workspace-card">
              <header class="workspace-card__head">
                <div>
                  <h2>实时预览</h2>
                  <p>{{ isStreaming() ? 'Streaming 中' : '已显示完整输入' }}</p>
                </div>
                <span class="mini-pill">{{ progress() }}%</span>
              </header>

              <div class="preview-surface">
                <markstream-angular
                  [content]="previewContent()"
                  [final]="!isStreaming()"
                  [codeBlockStream]="true"
                  [customHtmlTags]="thinkingTags"
                  [customComponents]="customComponents"
                />
              </div>

              <footer class="workspace-card__foot">
                <span>{{ previewContent().length }} / {{ input().length || 0 }}</span>
                <span>Angular renderer</span>
              </footer>
            </article>
          </section>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestLabComponent implements OnInit, OnDestroy {
  @Output() readonly navigateHome = new EventEmitter<void>()

  readonly currentFramework: TestLabFrameworkId = 'angular'
  readonly thinkingTags = ['thinking'] as const
  readonly customComponents = {
    thinking: ThinkingNodeComponent,
  }

  readonly frameworkCards = TEST_LAB_FRAMEWORKS
  readonly sampleCards = TEST_LAB_SAMPLES
  readonly selectedSampleId = signal<TestLabSampleId>('baseline')
  readonly input = signal(TEST_LAB_SAMPLES[0].content)
  readonly streamContent = signal('')
  readonly isStreaming = signal(false)
  readonly streamSpeed = signal(4)
  readonly streamInterval = signal(24)
  readonly activeSample = computed(() => this.sampleCards.find(sample => sample.id === this.selectedSampleId()) ?? this.sampleCards[0])
  readonly previewContent = computed(() => this.isStreaming() ? this.streamContent() : this.input())
  readonly progress = computed(() => {
    if (!this.input().length)
      return 0
    return Math.min(100, Math.round((this.previewContent().length / this.input().length) * 100))
  })

  readonly charCount = computed(() => this.input().length)
  readonly lineCount = computed(() => this.input() ? this.input().split('\n').length : 0)

  private timer: number | null = null

  ngOnInit() {
    if (typeof window === 'undefined')
      return
    const restored = decodeMarkdownHash(window.location.hash || '')
    if (restored)
      this.input.set(restored)
  }

  ngOnDestroy() {
    this.stopStreamRender()
  }

  applySample(id: TestLabSampleId) {
    const sample = this.sampleCards.find(item => item.id === id)
    if (!sample)
      return
    this.stopStreamRender()
    this.selectedSampleId.set(sample.id)
    this.input.set(sample.content)
  }

  updateInput(event: Event) {
    this.stopStreamRender()
    this.input.set(readTextInput(event, this.input()))
  }

  handleEditorPaste(event: ClipboardEvent) {
    const textarea = event.currentTarget
    if (!(textarea instanceof HTMLTextAreaElement))
      return

    const pasted = event.clipboardData?.getData('text/plain') ?? ''
    const next = resolveMarkdownTextareaPaste(textarea, pasted)
    if (!next)
      return

    event.preventDefault()
    textarea.value = next.nextValue
    textarea.selectionStart = next.selectionStart
    textarea.selectionEnd = next.selectionEnd
    this.stopStreamRender()
    this.input.set(next.nextValue)
  }

  updateStreamSpeed(event: Event) {
    this.streamSpeed.set(clampInt(Number(readTextInput(event, String(this.streamSpeed()))), 1, 80, 4))
  }

  updateStreamInterval(event: Event) {
    this.streamInterval.set(clampInt(Number(readTextInput(event, String(this.streamInterval()))), 8, 300, 24))
  }

  toggleStreamRender() {
    if (this.isStreaming()) {
      this.stopStreamRender()
      return
    }
    this.startStreamRender()
  }

  resetEditor() {
    this.applySample(this.selectedSampleId())
  }

  clearEditor() {
    this.stopStreamRender()
    this.input.set('')
  }

  frameworkHref(id: TestLabFrameworkId) {
    const framework = this.frameworkCards.find(item => item.id === id)
    if (!framework)
      return '/test'
    return resolveFrameworkTestHref(
      framework,
      this.currentFramework,
      this.input(),
      typeof window !== 'undefined'
        ? { hostname: window.location.hostname, protocol: window.location.protocol }
        : undefined,
    )
  }

  private startStreamRender() {
    this.streamSpeed.set(clampInt(this.streamSpeed(), 1, 80, 4))
    this.streamInterval.set(clampInt(this.streamInterval(), 8, 300, 24))
    this.streamContent.set('')
    this.isStreaming.set(true)
    this.scheduleNextChunk()
  }

  private scheduleNextChunk() {
    if (!this.isStreaming() || typeof window === 'undefined')
      return

    const nextLength = Math.min(this.streamContent().length + this.streamSpeed(), this.input().length)
    this.streamContent.set(this.input().slice(0, nextLength))

    if (nextLength >= this.input().length) {
      this.stopStreamRender()
      return
    }

    this.timer = window.setTimeout(() => this.scheduleNextChunk(), this.streamInterval())
  }

  private stopStreamRender() {
    if (this.timer != null && typeof window !== 'undefined') {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    this.isStreaming.set(false)
  }
}
