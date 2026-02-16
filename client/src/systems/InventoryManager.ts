import type { ItemInstance } from '@saab/shared';

type Listener = () => void;

class InventoryManager {
  private items: ItemInstance[] = [];
  private gold = 0;
  private listeners: Listener[] = [];

  setFull(items: ItemInstance[], gold: number) {
    this.items = items;
    this.gold = gold;
    this.notify();
  }

  addItem(item: ItemInstance) {
    // Stack if existing stackable
    const existing = this.items.find(
      (i) => i.defId === item.defId && i.rarity === item.rarity && i.instanceId === item.instanceId,
    );
    if (existing) {
      existing.quantity = item.quantity;
    } else {
      this.items.push(item);
    }
    this.notify();
  }

  removeItem(instanceId: string) {
    this.items = this.items.filter((i) => i.instanceId !== instanceId);
    this.notify();
  }

  setGold(gold: number) {
    this.gold = gold;
    this.notify();
  }

  getItems(): ItemInstance[] {
    return this.items;
  }

  getGold(): number {
    return this.gold;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }
}

export const inventoryManager = new InventoryManager();
