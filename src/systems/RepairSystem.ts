import type { Player } from '../entities/Player';
import type { FenceSection } from '../entities/FenceSection';
import type { Input } from '../core/Input';
import { distanceXZ } from '../utils/MathUtils';

const REPAIR_RANGE = 3.5;
const REPAIR_DURATION = 2.0; // seconds
const REPAIR_AMOUNT_RATIO = 0.3; // repairs 30% of maxHp

export class RepairSystem {
  casting = false;
  castProgress = 0; // 0..1
  targetFence: FenceSection | null = null;

  update(
    player: Player,
    fences: FenceSection[],
    input: Input,
    dt: number,
  ): void {
    if (input.isDown('r') && !player.isCasting && !this.casting) {
      // Try to start casting
      const target = this.findRepairTarget(player, fences);
      if (target) {
        this.casting = true;
        this.castProgress = 0;
        this.targetFence = target;
        player.isCasting = true;
      }
    }

    if (this.casting) {
      // Cancel conditions
      if (
        !input.isDown('r') ||
        !this.targetFence ||
        distanceXZ(player.position, this.targetFence.worldPos) > REPAIR_RANGE + 1
      ) {
        this.cancelCast(player);
        return;
      }

      this.castProgress += dt / REPAIR_DURATION;

      if (this.castProgress >= 1) {
        // Repair complete
        const amount = this.targetFence.maxHp * REPAIR_AMOUNT_RATIO;
        this.targetFence.repair(amount);
        this.cancelCast(player);
      }
    }
  }

  private findRepairTarget(player: Player, fences: FenceSection[]): FenceSection | null {
    let best: FenceSection | null = null;
    let bestDist = REPAIR_RANGE;

    for (const f of fences) {
      if (f.hp >= f.maxHp) continue; // no repair needed
      const d = distanceXZ(player.position, f.worldPos);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best;
  }

  private cancelCast(player: Player): void {
    this.casting = false;
    this.castProgress = 0;
    this.targetFence = null;
    player.isCasting = false;
  }
}
