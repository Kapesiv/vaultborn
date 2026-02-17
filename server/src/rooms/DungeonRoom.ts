import { Room, Client } from '@colyseus/core';
import { DungeonState, LootDropState } from '../state/GameState.js';
import { PlayerState, Vec3State, PlayerStatsState } from '../state/PlayerState.js';
import { MonsterState } from '../state/MonsterState.js';
import {
  computeMovement, validatePlayerInput, DUNGEON_MAX_PLAYERS, DUNGEON_SYNC_RATE,
  BASIC_ATTACK_COOLDOWN, BASIC_ATTACK_RANGE, BASIC_ATTACK_DAMAGE,
  MONSTER_DEFS, FOREST_DUNGEON, MONSTER_GOLD_DROP,
  MELEE_SKILL_TREE, SKILL_POINTS_PER_LEVEL, MANA_REGEN_RATE,
  SKILL_RANGE_AOE, CHARGE_DISTANCE,
  type PlayerInput, type Rarity, type DungeonRoomDef,
} from '@saab/shared';
import { distanceXZ } from '@saab/shared';
import { InventoryService } from '../services/InventoryService.js';
import { LOOT_TABLES } from '../data/loot-tables.js';
import { getDB, saveDB } from '../db/index.js';

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function rollRarity(minRarity: Rarity, maxRarity: Rarity): Rarity {
  const minIdx = RARITY_ORDER.indexOf(minRarity);
  const maxIdx = RARITY_ORDER.indexOf(maxRarity);
  const idx = minIdx + Math.floor(Math.random() * (maxIdx - minIdx + 1));
  return RARITY_ORDER[idx];
}

interface MonsterRuntime {
  defId: string;
  spawnPos: { x: number; y: number; z: number };
  attackTimer: number;
  respawnTimer: number;
  respawnTime: number;
  dead: boolean;
}

export class DungeonRoom extends Room<DungeonState> {
  maxClients = DUNGEON_MAX_PLAYERS;

  private monsterRuntimes = new Map<string, MonsterRuntime>();
  private playerAttackTimers = new Map<string, number>();
  private skillCooldowns = new Map<string, Map<string, number>>(); // playerId -> skillId -> expiry timestamp
  private monsterStuns = new Map<string, number>(); // monsterId -> stun expiry
  private tickInterval!: ReturnType<typeof setInterval>;
  private inventory = new InventoryService();
  private floors: DungeonRoomDef[] = [];
  private monsterIdx = 0;

  onCreate(options: { dungeonId?: string }) {
    const dungeonId = options.dungeonId || 'forest';
    this.setState(new DungeonState());
    this.state.dungeonId = dungeonId;
    this.setPatchRate(1000 / DUNGEON_SYNC_RATE);

    const dungeon = FOREST_DUNGEON; // TODO: lookup by dungeonId
    this.floors = dungeon.rooms;
    this.state.totalFloors = this.floors.length;

    // Spawn only floor 0
    this.spawnFloor(0);

    // Handle player input
    this.onMessage('input', (client: Client, input: PlayerInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (!validatePlayerInput(input)) return;

      const move = computeMovement(input);
      player.position.x += move.dx;
      player.position.z += move.dz;
      player.position.y = 0;
      player.rotation = input.rotation;
      player.lastProcessedInput = input.seq;

      const isMoving = input.forward || input.backward || input.left || input.right;
      if (input.attack) {
        player.animation = 'attack';
      } else {
        player.animation = isMoving ? 'run' : 'idle';
      }

      if (input.attack === 'basic') {
        this.handleBasicAttack(client.sessionId, player);
      } else if (input.attack && input.attack.startsWith('melee_')) {
        this.handleSkillAttack(client.sessionId, player, input.attack);
      }
    });

    // Handle loot pickup
    this.onMessage('pickup', (client: Client, data: { lootId: string }) => {
      const loot = this.state.lootDrops.get(data.lootId);
      if (!loot) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const dist = distanceXZ(
        { x: player.position.x, y: 0, z: player.position.z },
        { x: loot.x, y: 0, z: loot.z }
      );
      if (dist > 3) return;

      const item = this.inventory.addItem(
        client.sessionId, loot.itemDefId, loot.rarity as Rarity,
      );

      client.send('loot_acquired', { item });
      this.state.lootDrops.delete(data.lootId);
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
          const baseMaxHp = 100 + (saved.level - 1) * 10;
          player.stats.maxHp = Math.floor(baseMaxHp * passive.maxHpMult);
          player.stats.hp = Math.min(player.stats.hp, player.stats.maxHp);
          player.stats.skillPoints = result.skillPoints!;
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

    // Next floor request
    this.onMessage('next_floor', (client: Client) => {
      if (!this.state.floorCleared) return;
      if (this.state.currentFloor >= this.state.totalFloors - 1) return;
      if (this.state.dungeonComplete) return;
      this.spawnFloor(this.state.currentFloor + 1);
    });

    // Exit dungeon request
    this.onMessage('exit_dungeon', (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.saveStats(client.sessionId, player);
      client.send('return_to_hub', {});
    });

    // Game tick for AI
    const tickRate = 1000 / 15;
    this.tickInterval = setInterval(() => this.gameTick(tickRate / 1000), tickRate);

    console.log(`DungeonRoom created: ${dungeonId}`);
  }

  private spawnFloor(floorIndex: number) {
    // Clear existing monsters and loot
    this.state.monsters.forEach((_m, id) => {
      this.state.monsters.delete(id);
    });
    this.monsterRuntimes.clear();

    this.state.lootDrops.forEach((_l, id) => {
      this.state.lootDrops.delete(id);
    });

    const floor = this.floors[floorIndex];
    if (!floor) return;

    this.state.currentFloor = floorIndex;
    this.state.currentRoom = floor.id;
    this.state.floorCleared = false;

    const isBossFloor = floorIndex === this.floors.length - 1;

    // Spawn monsters for this floor
    for (const spawn of floor.spawns) {
      const def = MONSTER_DEFS[spawn.monsterId];
      if (!def) continue;

      const id = `monster_${this.monsterIdx++}`;
      const monster = new MonsterState();
      monster.id = id;
      monster.defId = spawn.monsterId;
      monster.position = new Vec3State();
      monster.position.x = spawn.position.x;
      monster.position.y = spawn.position.y;
      monster.position.z = spawn.position.z;
      monster.hp = def.hp;
      monster.maxHp = def.hp;
      monster.aiState = 'idle';
      this.state.monsters.set(id, monster);

      this.monsterRuntimes.set(id, {
        defId: spawn.monsterId,
        spawnPos: { ...spawn.position },
        attackTimer: 0,
        respawnTimer: 0,
        respawnTime: isBossFloor ? 0 : spawn.respawnTime,
        dead: false,
      });
    }

    // Teleport all players to spawn
    this.state.players.forEach((player) => {
      player.position.x = 0;
      player.position.z = -8;
      player.position.y = 0;
    });

    this.broadcast('floor_started', {
      floor: floorIndex,
      totalFloors: this.state.totalFloors,
      floorName: floor.floorName || floor.id,
      isBossFloor,
    });
  }

  private checkFloorCleared() {
    let allDead = true;
    this.monsterRuntimes.forEach((runtime) => {
      if (!runtime.dead && runtime.respawnTime > 0) {
        // Monster alive and can respawn — floor not yet cleared
      }
      // Check if it's actually dead right now
      if (!runtime.dead) {
        allDead = false;
      }
    });

    if (!allDead) return;

    // Also check that all monster states have hp <= 0
    let anyAlive = false;
    this.state.monsters.forEach((monster) => {
      if (monster.hp > 0) anyAlive = true;
    });
    if (anyAlive) return;

    this.state.floorCleared = true;
    const isBossFloor = this.state.currentFloor === this.state.totalFloors - 1;

    if (isBossFloor) {
      this.state.dungeonComplete = true;

      // Save dungeon progress
      const db = getDB();
      this.state.players.forEach((_player, sessionId) => {
        const existing = db.exec(
          'SELECT id FROM dungeon_progress WHERE player_id = ? AND dungeon_id = ?',
          [sessionId, this.state.dungeonId],
        );
        const firstClear = !existing.length || !existing[0].values.length;
        if (firstClear) {
          db.run(
            'INSERT INTO dungeon_progress (player_id, dungeon_id, completed, completed_at) VALUES (?, ?, 1, ?)',
            [sessionId, this.state.dungeonId, Date.now()],
          );
        } else {
          db.run(
            'UPDATE dungeon_progress SET completed = completed + 1, completed_at = ? WHERE player_id = ? AND dungeon_id = ?',
            [Date.now(), sessionId, this.state.dungeonId],
          );
        }
      });
      saveDB();

      this.broadcast('dungeon_complete', { dungeonId: this.state.dungeonId });
    } else {
      this.broadcast('floor_cleared', {
        floor: this.state.currentFloor,
        totalFloors: this.state.totalFloors,
        isBossFloor: false,
      });
    }
  }

  private handleBasicAttack(playerId: string, player: PlayerState) {
    const now = Date.now();
    const lastAttack = this.playerAttackTimers.get(playerId) || 0;
    if (now - lastAttack < BASIC_ATTACK_COOLDOWN * 1000) return;
    this.playerAttackTimers.set(playerId, now);

    let closestId: string | null = null;
    let closestDist = BASIC_ATTACK_RANGE;

    this.state.monsters.forEach((monster, id) => {
      if (monster.hp <= 0) return;
      const dist = distanceXZ(
        { x: player.position.x, y: 0, z: player.position.z },
        { x: monster.position.x, y: 0, z: monster.position.z }
      );
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    });

    if (!closestId) return;
    const monster = this.state.monsters.get(closestId)!;

    const damage = BASIC_ATTACK_DAMAGE + player.stats.strength;
    const def = MONSTER_DEFS[monster.defId];
    const mitigated = Math.max(1, damage - (def?.armor || 0));

    monster.hp -= mitigated;

    this.broadcast('damage', {
      targetId: closestId,
      amount: mitigated,
      isCrit: false,
    });

    if (monster.hp <= 0) {
      this.onMonsterKilled(closestId, monster, playerId);
    }
  }

  private handleSkillAttack(playerId: string, player: PlayerState, skillId: string) {
    const nodeDef = MELEE_SKILL_TREE.find((n) => n.id === skillId);
    if (!nodeDef) return;

    // Check allocation
    const allocations = this.inventory.loadSkillAllocations(playerId);
    const alloc = allocations.find((a) => a.nodeId === skillId);
    if (!alloc || alloc.points <= 0) return;

    // Check cooldown
    const now = Date.now();
    let playerCDs = this.skillCooldowns.get(playerId);
    if (!playerCDs) {
      playerCDs = new Map();
      this.skillCooldowns.set(playerId, playerCDs);
    }
    const cdExpiry = playerCDs.get(skillId) || 0;
    if (now < cdExpiry) {
      for (const c of this.clients) {
        if (c.sessionId === playerId) {
          c.send('skill_fail', { error: 'Skill on cooldown' });
          break;
        }
      }
      return;
    }

    // Get effect
    const effect = nodeDef.effects[0];
    if (!effect) return;

    // Check mana
    const manaCost = effect.manaCost || 0;
    if (player.stats.mana < manaCost) {
      for (const c of this.clients) {
        if (c.sessionId === playerId) {
          c.send('skill_fail', { error: 'Not enough mana' });
          break;
        }
      }
      return;
    }

    // Deduct mana
    player.stats.mana -= manaCost;

    // Set cooldown
    const cooldown = effect.cooldown || 3;
    playerCDs.set(skillId, now + cooldown * 1000);

    // Execute skill
    const extraPoints = alloc.points - 1;

    if (skillId === 'melee_power_strike') {
      // 150% dmg to closest, +10% per extra point
      const dmgMult = effect.value + extraPoints * 0.1;
      const baseDmg = BASIC_ATTACK_DAMAGE + player.stats.strength;
      const damage = Math.floor(baseDmg * dmgMult);

      let closestId: string | null = null;
      let closestDist = BASIC_ATTACK_RANGE + 1;
      this.state.monsters.forEach((m, id) => {
        if (m.hp <= 0) return;
        const dist = distanceXZ(
          { x: player.position.x, y: 0, z: player.position.z },
          { x: m.position.x, y: 0, z: m.position.z },
        );
        if (dist < closestDist) { closestDist = dist; closestId = id; }
      });

      if (closestId) {
        const monster = this.state.monsters.get(closestId)!;
        const def = MONSTER_DEFS[monster.defId];
        const mitigated = Math.max(1, damage - (def?.armor || 0));
        monster.hp -= mitigated;
        this.broadcast('damage', { targetId: closestId, amount: mitigated, isCrit: false });
        if (monster.hp <= 0) this.onMonsterKilled(closestId, monster, playerId);
      }
    } else if (skillId === 'melee_whirlwind') {
      // AoE: 80% dmg in radius, +10% per extra point
      const dmgMult = effect.value + extraPoints * 0.1;
      const baseDmg = BASIC_ATTACK_DAMAGE + player.stats.strength;
      const damage = Math.floor(baseDmg * dmgMult);

      this.state.monsters.forEach((monster, id) => {
        if (monster.hp <= 0) return;
        const dist = distanceXZ(
          { x: player.position.x, y: 0, z: player.position.z },
          { x: monster.position.x, y: 0, z: monster.position.z },
        );
        if (dist <= SKILL_RANGE_AOE) {
          const def = MONSTER_DEFS[monster.defId];
          const mitigated = Math.max(1, damage - (def?.armor || 0));
          monster.hp -= mitigated;
          this.broadcast('damage', { targetId: id, amount: mitigated, isCrit: false });
          if (monster.hp <= 0) this.onMonsterKilled(id, monster, playerId);
        }
      });
    } else if (skillId === 'melee_charge') {
      // Dash forward + stun closest monster in range
      const facing = player.rotation;
      player.position.x += Math.sin(facing) * CHARGE_DISTANCE;
      player.position.z += Math.cos(facing) * CHARGE_DISTANCE;

      let closestId: string | null = null;
      let closestDist = BASIC_ATTACK_RANGE + 2;
      this.state.monsters.forEach((m, id) => {
        if (m.hp <= 0) return;
        const dist = distanceXZ(
          { x: player.position.x, y: 0, z: player.position.z },
          { x: m.position.x, y: 0, z: m.position.z },
        );
        if (dist < closestDist) { closestDist = dist; closestId = id; }
      });

      if (closestId) {
        const stunDuration = effect.value * 1000; // 1.5s
        this.monsterStuns.set(closestId, now + stunDuration);
        const baseDmg = BASIC_ATTACK_DAMAGE + player.stats.strength;
        const monster = this.state.monsters.get(closestId)!;
        const def = MONSTER_DEFS[monster.defId];
        const mitigated = Math.max(1, Math.floor(baseDmg * 0.5) - (def?.armor || 0));
        monster.hp -= mitigated;
        this.broadcast('damage', { targetId: closestId, amount: mitigated, isCrit: false });
        if (monster.hp <= 0) this.onMonsterKilled(closestId, monster, playerId);
      }
    }

    // Notify client of successful use
    for (const c of this.clients) {
      if (c.sessionId === playerId) {
        c.send('skill_used', { skillId, cooldown });
        break;
      }
    }
  }

  private onMonsterKilled(monsterId: string, monster: MonsterState, killerId: string) {
    monster.aiState = 'dead';
    monster.animation = 'death';

    const def = MONSTER_DEFS[monster.defId];
    if (!def) return;

    // Give XP to killer
    const killer = this.state.players.get(killerId);
    if (killer) {
      killer.stats.xp += def.xpReward;
      if (killer.stats.xp >= killer.stats.xpToNext) {
        killer.stats.level++;
        killer.stats.xp -= killer.stats.xpToNext;
        killer.stats.xpToNext = Math.floor(100 * Math.pow(killer.stats.level, 1.5));
        killer.stats.maxHp += 10;
        killer.stats.hp = killer.stats.maxHp;
        killer.stats.maxMana += 5;
        killer.stats.mana = killer.stats.maxMana;
        killer.stats.strength += 2;
        killer.stats.dexterity += 1;
        killer.stats.intelligence += 1;
        killer.stats.vitality += 1;

        // Grant skill point on level up
        this.inventory.addSkillPoints(killerId, SKILL_POINTS_PER_LEVEL);
        killer.stats.skillPoints += SKILL_POINTS_PER_LEVEL;

        this.broadcast('level_up', { playerId: killerId, level: killer.stats.level });

        // Persist stats on level up
        this.saveStats(killerId, killer);
      }
    }

    // Roll gold drop
    const tier = def.xpReward >= 100 ? 2 : 1;
    const goldRange = MONSTER_GOLD_DROP[tier] || MONSTER_GOLD_DROP[1];
    const goldAmount = goldRange.min + Math.floor(Math.random() * (goldRange.max - goldRange.min + 1));
    const totalGold = this.inventory.addGold(killerId, goldAmount);

    for (const client of this.clients) {
      if (client.sessionId === killerId) {
        client.send('gold_gained', { amount: goldAmount, total: totalGold });
        break;
      }
    }

    // Drop loot from loot table
    const lootTable = LOOT_TABLES[def.lootTableId];
    if (lootTable) {
      const dropCount = lootTable.guaranteedDrops +
        Math.floor(Math.random() * (lootTable.maxDrops - lootTable.guaranteedDrops + 1));

      const totalWeight = lootTable.entries.reduce((sum, e) => sum + e.weight, 0);

      for (let i = 0; i < dropCount; i++) {
        let roll = Math.random() * totalWeight;
        for (const entry of lootTable.entries) {
          roll -= entry.weight;
          if (roll <= 0) {
            const rarity = rollRarity(entry.minRarity as Rarity, entry.maxRarity as Rarity);
            const lootId = `loot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const loot = new LootDropState();
            loot.id = lootId;
            loot.itemDefId = entry.itemDefId;
            loot.rarity = rarity;
            loot.x = monster.position.x + (Math.random() - 0.5) * 2;
            loot.y = monster.position.y;
            loot.z = monster.position.z + (Math.random() - 0.5) * 2;
            loot.despawnAt = Date.now() + 60000;
            this.state.lootDrops.set(lootId, loot);
            break;
          }
        }
      }
    }

    // Mark runtime as dead
    const runtime = this.monsterRuntimes.get(monsterId);
    if (runtime) {
      runtime.dead = true;
      if (runtime.respawnTime > 0) {
        runtime.respawnTimer = runtime.respawnTime;
      }
    }

    // Check if floor is cleared
    this.checkFloorCleared();
  }

  private saveStats(playerId: string, player: PlayerState) {
    this.inventory.savePlayerStats(playerId, {
      level: player.stats.level,
      xp: player.stats.xp,
      strength: player.stats.strength,
      intelligence: player.stats.intelligence,
      dexterity: player.stats.dexterity,
      vitality: player.stats.vitality,
    });
  }

  private gameTick(dt: number) {
    this.state.monsters.forEach((monster, id) => {
      const runtime = this.monsterRuntimes.get(id);
      if (!runtime) return;

      // Handle respawn
      if (runtime.dead) {
        if (runtime.respawnTime <= 0) return; // no respawn (boss floor)
        runtime.respawnTimer -= dt;
        if (runtime.respawnTimer <= 0) {
          runtime.dead = false;
          const def = MONSTER_DEFS[runtime.defId];
          monster.hp = def?.hp || 100;
          monster.maxHp = def?.hp || 100;
          monster.position.x = runtime.spawnPos.x;
          monster.position.y = runtime.spawnPos.y;
          monster.position.z = runtime.spawnPos.z;
          monster.aiState = 'idle';
          monster.animation = 'idle';
          monster.targetId = '';
        }
        return;
      }

      if (monster.hp <= 0) return;

      // Stun check
      const stunExpiry = this.monsterStuns.get(id);
      if (stunExpiry && Date.now() < stunExpiry) {
        monster.aiState = 'idle';
        monster.animation = 'idle';
        return;
      }

      const def = MONSTER_DEFS[runtime.defId];
      if (!def) return;

      runtime.attackTimer = Math.max(0, runtime.attackTimer - dt);

      // Find closest player
      let closestPlayer: PlayerState | null = null as PlayerState | null;
      let closestDist = Infinity;
      this.state.players.forEach((p) => {
        if (p.stats.hp <= 0) return;
        const d = distanceXZ(
          { x: monster.position.x, y: 0, z: monster.position.z },
          { x: p.position.x, y: 0, z: p.position.z }
        );
        if (d < closestDist) {
          closestDist = d;
          closestPlayer = p;
        }
      });

      if (!closestPlayer) {
        monster.aiState = 'idle';
        monster.animation = 'idle';
        return;
      }

      if (closestDist <= def.attackRange) {
        monster.aiState = 'attack';
        monster.animation = 'attack';
        if (runtime.attackTimer <= 0) {
          runtime.attackTimer = def.attackCooldown;
          const damage = Math.max(1, def.damage - closestPlayer.stats.armor);
          closestPlayer.stats.hp -= damage;
          this.broadcast('damage', {
            targetId: closestPlayer.id,
            amount: damage,
            isCrit: false,
          });
          if (closestPlayer.stats.hp <= 0) {
            closestPlayer.stats.hp = 0;
            closestPlayer.animation = 'death';
            this.broadcast('player_died', { playerId: closestPlayer.id });
          }
        }
      } else if (closestDist <= def.aggroRange) {
        monster.aiState = 'chase';
        monster.animation = 'run';
        monster.targetId = closestPlayer.id;
        const dx = closestPlayer.position.x - monster.position.x;
        const dz = closestPlayer.position.z - monster.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.1) {
          monster.position.x += (dx / dist) * def.speed * dt;
          monster.position.z += (dz / dist) * def.speed * dt;
          monster.rotation = Math.atan2(dx, dz);
        }
      } else {
        const toSpawnDist = distanceXZ(
          { x: monster.position.x, y: 0, z: monster.position.z },
          { x: runtime.spawnPos.x, y: 0, z: runtime.spawnPos.z }
        );
        if (toSpawnDist > 1) {
          monster.aiState = 'return';
          monster.animation = 'run';
          const dx = runtime.spawnPos.x - monster.position.x;
          const dz = runtime.spawnPos.z - monster.position.z;
          monster.position.x += (dx / toSpawnDist) * def.speed * dt;
          monster.position.z += (dz / toSpawnDist) * def.speed * dt;
        } else {
          monster.aiState = 'idle';
          monster.animation = 'idle';
        }
        monster.targetId = '';
      }
    });

    // Mana regen
    this.state.players.forEach((player) => {
      if (player.stats.hp <= 0) return;
      if (player.stats.mana < player.stats.maxMana) {
        player.stats.mana = Math.min(
          player.stats.maxMana,
          player.stats.mana + MANA_REGEN_RATE * dt,
        );
      }
    });

    // Clear expired stuns
    const stunNow = Date.now();
    this.monsterStuns.forEach((expiry, id) => {
      if (stunNow >= expiry) this.monsterStuns.delete(id);
    });

    // Despawn old loot
    const now = Date.now();
    this.state.lootDrops.forEach((loot, id) => {
      if (loot.despawnAt > 0 && now >= loot.despawnAt) {
        this.state.lootDrops.delete(id);
      }
    });
  }

  onJoin(client: Client, options: { name?: string; gender?: string }) {
    const playerName = options.name || `Player_${client.sessionId.slice(0, 4)}`;

    this.inventory.ensurePlayer(client.sessionId, playerName);

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = playerName;
    player.gender = options.gender === 'female' ? 'female' : 'male';
    player.position = new Vec3State();
    player.position.x = 0;
    player.position.z = -8;

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
    // Apply passive bonuses
    const passive = this.inventory.computePassiveStats(client.sessionId);
    const baseMaxHp = 100 + (saved.level - 1) * 10;
    stats.maxHp = Math.floor(baseMaxHp * passive.maxHpMult);
    stats.hp = stats.maxHp;
    stats.maxMana = 50 + (saved.level - 1) * 5;
    stats.mana = stats.maxMana;
    stats.skillPoints = this.inventory.getSkillPoints(client.sessionId);
    player.stats = stats;

    this.state.players.set(client.sessionId, player);
    this.playerAttackTimers.set(client.sessionId, 0);

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

    console.log(`${player.name} joined Dungeon (Floor ${this.state.currentFloor + 1}/${this.state.totalFloors})`);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      // Persist stats on leave
      this.saveStats(client.sessionId, player);
      console.log(`${player.name} left Dungeon`);
    }
    this.state.players.delete(client.sessionId);
    this.playerAttackTimers.delete(client.sessionId);
  }

  onDispose() {
    clearInterval(this.tickInterval);
    console.log('DungeonRoom disposed');
  }
}
