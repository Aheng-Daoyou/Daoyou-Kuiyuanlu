import type { EventBus } from '../core/EventBus';
import { CombatFactSinkV3 } from './CombatFactSinkV3';

export class CombatRecordBuilderV3 extends CombatFactSinkV3 {
  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  runInSequence: CombatFactSinkV3['runInFrame'] = (scope, callback) =>
    this.runInFrame(scope, callback);
}
