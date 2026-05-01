import type { ElementRef, OnDestroy } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, forwardRef, inject, Input, ViewChild } from '@angular/core'
import { NestedRendererComponent } from '../NestedRenderer/NestedRenderer.component'
import { getNodeList, getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-table-node',
  standalone: true,
  imports: [CommonModule, forwardRef(() => NestedRendererComponent)],
  template: `
    <table #tableElement>
      <colgroup *ngIf="columnWidths.length > 0">
        <col
          *ngFor="let cell of headerCells; let cellIndex = index; trackBy: trackCell"
          [style.width.px]="columnWidths[cellIndex] || null"
        >
      </colgroup>
      <thead *ngIf="headerRow">
        <tr>
          <ng-container *ngFor="let cell of headerCells; let cellIndex = index; trackBy: trackCell">
            <th [style.text-align]="alignment(cell) || null">
              <markstream-angular-nested-renderer
                [nodes]="childrenFor(cell)"
                [context]="context"
                [indexPrefix]="cellPrefix('head', cellIndex)"
              />
              <button
                *ngIf="cellIndex < headerCells.length - 1"
                type="button"
                class="table-node__resize-handle"
                [attr.aria-label]="'Resize columns ' + (cellIndex + 1) + ' and ' + (cellIndex + 2)"
                (pointerdown)="startColumnResize(cellIndex, $event)"
              ></button>
            </th>
          </ng-container>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let row of rows; let rowIndex = index; trackBy: trackRow">
          <ng-container *ngFor="let cell of cellsFor(row); let cellIndex = index; trackBy: trackCell">
            <td [style.text-align]="alignment(cell) || null">
              <markstream-angular-nested-renderer
                [nodes]="childrenFor(cell)"
                [context]="context"
                [indexPrefix]="cellPrefix(rowIndex, cellIndex)"
              />
            </td>
          </ng-container>
        </tr>
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableNodeComponent implements OnDestroy {
  @ViewChild('tableElement') tableElement?: ElementRef<HTMLTableElement>

  private readonly cdr = inject(ChangeDetectorRef)
  private currentHeaderCellCount = 0
  private readonly minColumnWidth = 48
  private resizeState: {
    index: number
    startX: number
    startWidth: number
    nextStartWidth: number
    widths: number[]
  } | null = null

  columnWidths: number[] = []

  private _node!: AngularRenderableNode

  @Input({ required: true })
  set node(value: AngularRenderableNode) {
    this._node = value
    const count = this.headerCells.length
    if (count !== this.currentHeaderCellCount) {
      this.stopColumnResize()
      this.columnWidths = []
      this.currentHeaderCellCount = count
    }
  }

  get node() {
    return this._node
  }

  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  get headerRow() {
    const row = (this.node as any)?.header
    return row && typeof row === 'object' ? row as AngularRenderableNode : null
  }

  get headerCells() {
    return this.headerRow ? this.cellsFor(this.headerRow) : []
  }

  get rows() {
    return getNodeList((this.node as any)?.rows)
  }

  cellsFor(row: AngularRenderableNode) {
    return getNodeList((row as any)?.cells)
  }

  childrenFor(cell: AngularRenderableNode) {
    return getNodeList((cell as any)?.children)
  }

  alignment(cell: AngularRenderableNode) {
    return getString((cell as any)?.align)
  }

  trackRow = (index: number) => {
    return `${this.indexKey || 'table'}-row-${index}`
  }

  trackCell = (index: number) => {
    return index
  }

  cellPrefix(rowIndex: string | number, cellIndex: number) {
    return `${this.indexKey || 'table'}-${rowIndex}-${cellIndex}`
  }

  startColumnResize(index: number, event: PointerEvent) {
    if (event.button !== 0)
      return

    const widths = this.measureHeaderWidths()
    const startWidth = widths[index]
    const nextStartWidth = widths[index + 1]
    if (!startWidth || !nextStartWidth)
      return

    event.preventDefault()
    this.stopColumnResize()

    this.resizeState = {
      index,
      startX: event.clientX,
      startWidth,
      nextStartWidth,
      widths,
    }
    this.columnWidths = widths
    this.cdr.markForCheck()

    window.addEventListener('pointermove', this.onColumnResizeMove)
    window.addEventListener('pointerup', this.stopColumnResize)
    window.addEventListener('pointercancel', this.stopColumnResize)
  }

  ngOnDestroy() {
    this.stopColumnResize()
  }

  private measureHeaderWidths() {
    const cells = this.tableElement?.nativeElement.querySelectorAll('thead th')
    return Array.from(cells ?? [], cell => Math.round(cell.getBoundingClientRect().width))
  }

  private onColumnResizeMove = (event: PointerEvent) => {
    if (!this.resizeState)
      return

    event.preventDefault()

    const pairWidth = this.resizeState.startWidth + this.resizeState.nextStartWidth
    const minWidth = Math.min(this.minColumnWidth, Math.floor(pairWidth / 2))
    const width = Math.max(
      minWidth,
      Math.min(pairWidth - minWidth, Math.round(this.resizeState.startWidth + event.clientX - this.resizeState.startX)),
    )
    const nextWidths = [...this.resizeState.widths]
    nextWidths[this.resizeState.index] = width
    nextWidths[this.resizeState.index + 1] = pairWidth - width
    this.columnWidths = nextWidths
    this.cdr.markForCheck()
  }

  private stopColumnResize = () => {
    if (!this.resizeState)
      return

    window.removeEventListener('pointermove', this.onColumnResizeMove)
    window.removeEventListener('pointerup', this.stopColumnResize)
    window.removeEventListener('pointercancel', this.stopColumnResize)
    this.resizeState = null
  }
}
