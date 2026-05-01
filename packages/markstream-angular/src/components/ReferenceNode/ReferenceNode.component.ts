import type { AngularRenderableNode } from '../shared/node-helpers'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-reference-node',
  standalone: true,
  template: '<span class="markstream-nested-reference">{{ id }}</span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferenceNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get id() {
    return getString((this.node as any)?.id)
  }
}
