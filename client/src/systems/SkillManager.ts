import type { SkillAllocation, HotbarSlot } from '@saab/shared';

type Listener = () => void;

class SkillManager {
  private allocations: SkillAllocation[] = [];
  private hotbar: HotbarSlot[] = [];
  private _skillPoints = 0;
  private cooldowns = new Map<string, number>(); // skillId -> expiry timestamp
  private listeners: Listener[] = [];

  setFull(allocations: SkillAllocation[], hotbar: HotbarSlot[], skillPoints: number) {
    this.allocations = allocations;
    this.hotbar = hotbar;
    this._skillPoints = skillPoints;
    this.notify();
  }

  setAllocations(allocations: SkillAllocation[], skillPoints: number) {
    this.allocations = allocations;
    this._skillPoints = skillPoints;
    this.notify();
  }

  setHotbar(hotbar: HotbarSlot[]) {
    this.hotbar = hotbar;
    this.notify();
  }

  startCooldown(skillId: string, duration: number) {
    this.cooldowns.set(skillId, Date.now() + duration * 1000);
    this.notify();
  }

  getCooldownRemaining(skillId: string): number {
    const expiry = this.cooldowns.get(skillId);
    if (!expiry) return 0;
    return Math.max(0, (expiry - Date.now()) / 1000);
  }

  isOnCooldown(skillId: string): boolean {
    return this.getCooldownRemaining(skillId) > 0;
  }

  getAllocations(): SkillAllocation[] { return this.allocations; }
  getHotbar(): HotbarSlot[] { return this.hotbar; }
  getSkillPoints(): number { return this._skillPoints; }

  getPointsInSkill(nodeId: string): number {
    return this.allocations.find(a => a.nodeId === nodeId)?.points ?? 0;
  }

  getHotbarSkillId(slot: number): string | null {
    const entry = this.hotbar.find(h => h.slot === slot);
    return entry?.skillId || null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify() { for (const fn of this.listeners) fn(); }
}

export const skillManager = new SkillManager();
