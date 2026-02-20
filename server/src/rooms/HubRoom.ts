import { Room, Client } from '@colyseus/core';
import { HubState } from '../state/GameState.js';
import { PlayerState, Vec3State, PlayerStatsState } from '../state/PlayerState.js';
import { computeMovement, validatePlayerInput, HUB_MAX_PLAYERS, HUB_SYNC_RATE, CLASS_DEFS, VALID_CLASS_IDS, type PlayerInput, type CharacterClassId } from '@saab/shared';
import { InventoryService } from '../services/InventoryService.js';

export class HubRoom extends Room<HubState> {
  maxClients = HUB_MAX_PLAYERS;
  private inventory = new InventoryService();

  onCreate() {
    this.setState(new HubState());
    this.setPatchRate(1000 / HUB_SYNC_RATE);

    this.onMessage('input', (client: Client, input: PlayerInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (!validatePlayerInput(input)) return;

      const move = computeMovement(input);
      player.position.x += move.dx;
      player.position.z += move.dz;
      player.position.y = 0; // flat ground in hub
      player.rotation = input.rotation;
      player.lastProcessedInput = input.seq;

      // Update animation
      const isMoving = input.forward || input.backward || input.left || input.right;
      player.animation = isMoving ? 'run' : 'idle';
    });

    this.onMessage('chat', (client: Client, message: string) => {
      if (typeof message !== 'string' || message.length > 200) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.broadcast('chat', { name: player.name, message }, { except: client });
    });

    this.onMessage('shop_buy', (client: Client, data: { defId: string }) => {
      if (!data || typeof data.defId !== 'string') return;
      const result = this.inventory.buyItem(client.sessionId, data.defId);
      if (result.error) {
        client.send('shop_buy_fail', { error: result.error });
      } else {
        client.send('shop_buy_ok', { item: result.item, gold: result.gold });
      }
    });

    this.onMessage('shop_sell', (client: Client, data: { instanceId: string }) => {
      if (!data || typeof data.instanceId !== 'string') return;
      const result = this.inventory.sellItem(client.sessionId, data.instanceId);
      if (result.error) {
        client.send('shop_sell_fail', { error: result.error });
      } else {
        client.send('shop_sell_ok', {
          instanceId: data.instanceId,
          goldEarned: result.goldEarned,
          gold: result.gold,
        });
      }
    });

    this.onMessage('request_inventory', (client: Client) => {
      const items = this.inventory.getItems(client.sessionId);
      const gold = this.inventory.getGold(client.sessionId);
      client.send('inventory_full', { items, gold });
    });

    this.onMessage('allocate_skill', (client: Client, data: { nodeId: string }) => {
      if (!data || typeof data.nodeId !== 'string') return;
      const result = this.inventory.allocateSkillPoint(client.sessionId, data.nodeId);
      if (result.error) {
        client.send('skill_fail', { error: result.error });
      } else {
        client.send('skills_updated', {
          allocations: result.allocations,
          skillPoints: result.skillPoints,
        });
        // Re-apply passive stats
        const player = this.state.players.get(client.sessionId);
        if (player) {
          const passive = this.inventory.computePassiveStats(client.sessionId);
          const saved = this.inventory.loadPlayerStats(client.sessionId);
          const classId = this.inventory.loadPlayerClass(client.sessionId);
          const classDef = CLASS_DEFS[classId];
          const baseMaxHp = classDef.maxHpBase + (saved.level - 1) * 10;
          player.stats.maxHp = Math.floor(baseMaxHp * passive.maxHpMult);
          player.stats.hp = Math.min(player.stats.hp, player.stats.maxHp);
        }
      }
    });

    this.onMessage('set_hotbar', (client: Client, data: { slot: number; skillId: string }) => {
      if (!data || typeof data.slot !== 'number' || typeof data.skillId !== 'string') return;
      const result = this.inventory.setHotbarSlot(client.sessionId, data.slot, data.skillId);
      if (result.error) {
        client.send('skill_fail', { error: result.error });
      } else {
        client.send('hotbar_updated', { hotbar: result.hotbar });
      }
    });

    this.onMessage('request_skills', (client: Client) => {
      const allocations = this.inventory.loadSkillAllocations(client.sessionId);
      const hotbar = this.inventory.loadHotbar(client.sessionId);
      const skillPoints = this.inventory.getSkillPoints(client.sessionId);
      client.send('skills_full', { allocations, hotbar, skillPoints });
    });

    console.log('HubRoom created');
  }

  onJoin(client: Client, options: { name?: string; gender?: string; classId?: string }) {
    const playerName = options.name || `Player_${client.sessionId.slice(0, 4)}`;

    // Validate classId
    const classId: CharacterClassId = VALID_CLASS_IDS.includes(options.classId as CharacterClassId)
      ? (options.classId as CharacterClassId)
      : 'warrior';

    // Ensure player exists in DB (uses classId for new players only)
    this.inventory.ensurePlayer(client.sessionId, playerName, classId);

    // Load the persisted class (returning players keep their original class)
    const resolvedClassId = this.inventory.loadPlayerClass(client.sessionId);
    const classDef = CLASS_DEFS[resolvedClassId];

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = playerName;
    player.gender = options.gender === 'female' ? 'female' : 'male';
    player.classId = resolvedClassId;
    player.position = new Vec3State();

    // Spawn outside the fountain (radius ~3.6)
    const angle = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * 4;
    player.position.x = Math.cos(angle) * dist;
    player.position.z = Math.sin(angle) * dist;

    // Load persisted stats from DB
    const stats = new PlayerStatsState();
    const saved = this.inventory.loadPlayerStats(client.sessionId);
    stats.level = saved.level;
    stats.xp = saved.xp;
    stats.xpToNext = Math.floor(100 * Math.pow(saved.level, 1.5));
    stats.strength = saved.strength;
    stats.intelligence = saved.intelligence;
    stats.dexterity = saved.dexterity;
    stats.vitality = saved.vitality;
    // Apply passive bonuses with class-specific base HP/mana
    const passive = this.inventory.computePassiveStats(client.sessionId);
    const baseMaxHp = classDef.maxHpBase + (saved.level - 1) * 10;
    stats.maxHp = Math.floor(baseMaxHp * passive.maxHpMult);
    stats.hp = stats.maxHp;
    stats.maxMana = classDef.maxManaBase + (saved.level - 1) * 5;
    stats.mana = stats.maxMana;
    stats.skillPoints = this.inventory.getSkillPoints(client.sessionId);
    player.stats = stats;

    this.state.players.set(client.sessionId, player);

    // Send full inventory
    const items = this.inventory.getItems(client.sessionId);
    const gold = this.inventory.getGold(client.sessionId);
    client.send('inventory_full', { items, gold });

    // Send full skill data
    const allocations = this.inventory.loadSkillAllocations(client.sessionId);
    const hotbar = this.inventory.loadHotbar(client.sessionId);
    client.send('skills_full', {
      allocations,
      hotbar,
      skillPoints: stats.skillPoints,
    });

    console.log(`${player.name} joined Hub`);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      console.log(`${player.name} left Hub`);
    }
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log('HubRoom disposed');
  }
}
