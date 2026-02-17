import type { NetworkManager } from './NetworkManager.js';

let nm: NetworkManager | null = null;

export function setNetworkManager(manager: NetworkManager) {
  nm = manager;
}

export function shopBuy(defId: string) {
  nm?.sendMessage('shop_buy', { defId });
}

export function shopSell(instanceId: string) {
  nm?.sendMessage('shop_sell', { instanceId });
}

export function requestInventory() {
  nm?.sendMessage('request_inventory', {});
}

export function allocateSkill(nodeId: string) {
  nm?.sendMessage('allocate_skill', { nodeId });
}

export function setHotbar(slot: number, skillId: string) {
  nm?.sendMessage('set_hotbar', { slot, skillId });
}

export function requestSkills() {
  nm?.sendMessage('request_skills', {});
}
