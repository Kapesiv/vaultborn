import { Room, Client } from '@colyseus/core';
import { DungeonState, LootDropState } from '../state/GameState.js';
import { PlayerState, Vec3State, PlayerStatsState } from '../state/PlayerState.js';
import { MonsterState } from '../state/MonsterState.js';
import {
  computeMovement, validatePlayerInput, DUNGEON_MAX_PLAYERS, DUNGEON_SYNC_RATE,
  BASIC_ATTACK_COOLDOWN, BASIC_ATTACK_RANGE, BASIC_ATTACK_DAMAGE,
  MONSTER_DEFS, FOREST_DUNGEON, MONSTER_GOLD_DROP,
  type PlayerInput, type Rarity,
} from '@saab/shared';
import { distanceXZ } from '@saab/shared';
import { InventoryService } from '../services/InventoryService.js';
import { LOOT_TABLES } from '../data/loot-tables.js';

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
  private tickInterval!: ReturnType<typeof setInterval>;
  private inventory = new InventoryService();

  onCreate(options: { dungeonId?: string }) {
    const dungeonId = options.dungeonId || 'forest';
    this.setState(new DungeonState());
    this.state.dungeonId = dungeonId;
    this.state.currentRoom = 'forest_entrance';
    this.setPatchRate(1000 / DUNGEON_SYNC_RATE);

    // Spawn monsters for all rooms
    const dungeon = FOREST_DUNGEON; // TODO: lookup by dungeonId
    let monsterIdx = 0;
    for (const room of dungeon.rooms) {
      for (const spawn of room.spawns) {
        const def = MONSTER_DEFS[spawn.monsterId];
        if (!def) continue;

        const id = `monster_${monsterIdx++}`;
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
          respawnTime: spawn.respawnTime,
          dead: false,
        });
      }
    }

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

      // Handle attack
      if (input.attack === 'basic') {
        this.handleBasicAttack(client.sessionId, player);
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
      if (dist > 3) return; // too far

      // Persist item to DB
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

    // Game tick for AI
    const tickRate = 1000 / 15; // 15 Hz AI tick
    this.tickInterval = setInterval(() => this.gameTick(tickRate / 1000), tickRate);

    console.log(`DungeonRoom created: ${dungeonId}`);
  }

  private handleBasicAttack(playerId: string, player: PlayerState) {
    const now = Date.now();
    const lastAttack = this.playerAttackTimers.get(playerId) || 0;
    if (now - lastAttack < BASIC_ATTACK_COOLDOWN * 1000) return;
    this.playerAttackTimers.set(playerId, now);

    // Find closest monster in range
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

    // Calculate damage (server-authoritative)
    const damage = BASIC_ATTACK_DAMAGE + player.stats.strength;
    const def = MONSTER_DEFS[monster.defId];
    const mitigated = Math.max(1, damage - (def?.armor || 0));

    monster.hp -= mitigated;

    // Broadcast damage number
    this.broadcast('damage', {
      targetId: closestId,
      amount: mitigated,
      isCrit: false,
    });

    if (monster.hp <= 0) {
      this.onMonsterKilled(closestId, monster, playerId);
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
        killer.stats.strength += 2;
        this.broadcast('level_up', { playerId: killerId, level: killer.stats.level });
      }
    }

    // Roll gold drop
    const tier = def.xpReward >= 100 ? 2 : 1;
    const goldRange = MONSTER_GOLD_DROP[tier] || MONSTER_GOLD_DROP[1];
    const goldAmount = goldRange.min + Math.floor(Math.random() * (goldRange.max - goldRange.min + 1));
    const totalGold = this.inventory.addGold(killerId, goldAmount);

    // Find killer client to send gold_gained
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
            loot.despawnAt = Date.now() + 60000; // 60s despawn
            this.state.lootDrops.set(lootId, loot);
            break;
          }
        }
      }
    }

    // Schedule respawn
    const runtime = this.monsterRuntimes.get(monsterId);
    if (runtime && runtime.respawnTime > 0) {
      runtime.dead = true;
      runtime.respawnTimer = runtime.respawnTime;
    }
  }

  private gameTick(dt: number) {
    // AI tick for each monster
    this.state.monsters.forEach((monster, id) => {
      const runtime = this.monsterRuntimes.get(id);
      if (!runtime) return;

      // Handle respawn
      if (runtime.dead) {
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
        // Attack
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
        // Chase
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
        // Return to spawn or idle
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

    // Ensure player exists in DB
    this.inventory.ensurePlayer(client.sessionId, playerName);

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = playerName;
    player.gender = options.gender === 'female' ? 'female' : 'male';
    player.position = new Vec3State();
    player.position.x = 0;
    player.position.z = -8;
    player.stats = new PlayerStatsState();
    this.state.players.set(client.sessionId, player);
    this.playerAttackTimers.set(client.sessionId, 0);

    // Send full inventory
    const items = this.inventory.getItems(client.sessionId);
    const gold = this.inventory.getGold(client.sessionId);
    client.send('inventory_full', { items, gold });

    console.log(`${player.name} joined Dungeon`);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
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
