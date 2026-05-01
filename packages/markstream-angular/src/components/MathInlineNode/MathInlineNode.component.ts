import type { AfterViewInit, ElementRef, OnChanges, OnDestroy } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  ViewChild,
} from '@angular/core'
import { getKatex } from '../../optional/katex'
import { normalizeKaTeXRenderInput } from '../../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-math-inline-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="math-inline-wrapper markstream-nested-math" data-display="inline" data-markstream-katex-managed="1">
      <span #mathRef class="math-inline" [class.math-inline--hidden]="loading"></span>
      <span *ngIf="loading" class="math-inline__loading" role="status" aria-live="polite">
        <span class="math-inline__spinner" aria-hidden="true"></span>
        <span class="sr-only">Loading</span>
      </span>
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MathInlineNodeComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef)

  @ViewChild('mathRef') private mathRef?: ElementRef<HTMLSpanElement>

  @Input({ required: true }) node!: AngularRenderableNode

  loading = true

  private destroyed = false
  private renderVersion = 0
  private hasRenderedOnce = false

  get content() {
    return getString((this.node as any)?.content || (this.node as any)?.markup || (this.node as any)?.raw)
  }

  get displayMode() {
    return String((this.node as any)?.markup || '') === '$$'
  }

  ngAfterViewInit() {
    void this.renderMath()
  }

  ngOnChanges() {
    if (!this.mathRef)
      return
    void this.renderMath()
  }

  ngOnDestroy() {
    this.destroyed = true
    this.renderVersion += 1
  }

  private async renderMath() {
    const target = this.mathRef?.nativeElement
    if (!target)
      return

    const content = normalizeKaTeXRenderInput(this.content)
    const version = ++this.renderVersion
    if (!content) {
      target.textContent = ''
      this.loading = false
      this.cdr.markForCheck()
      return
    }

    if (!this.hasRenderedOnce)
      this.loading = true

    const html = await this.resolveKatexMarkup(content, this.displayMode)
    if (this.destroyed || version !== this.renderVersion)
      return

    if (html) {
      target.innerHTML = html
      this.hasRenderedOnce = true
      this.loading = false
    }
    else if (!(this.node as any)?.loading) {
      target.textContent = getString((this.node as any)?.raw || content)
      this.loading = false
    }

    this.cdr.markForCheck()
  }

  private async resolveKatexMarkup(content: string, displayMode: boolean) {
    try {
      return await renderKaTeXWithBackpressure(content, displayMode, {
        timeout: 1500,
        waitTimeout: 0,
        maxRetries: 0,
      })
    }
    catch (error: any) {
      const code = error?.code || error?.name
      const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || error?.fallbackToRenderer
      const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
      if (!isWorkerInitFailure && !isBusyOrTimeout)
        return null
    }

    const katex = await getKatex()
    if (!katex)
      return null

    try {
      const html = katex.renderToString(content, {
        throwOnError: (this.node as any)?.loading === true,
        displayMode,
      })
      setKaTeXCache(content, displayMode, html)
      return html
    }
    catch {
      return null
    }
  }
}
