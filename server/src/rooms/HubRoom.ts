import { Room, Client } from '@colyseus/core';
import { HubState } from '../state/GameState.js';
import { PlayerState, Vec3State } from '../state/PlayerState.js';
import { computeMovement, validatePlayerInput, HUB_MAX_PLAYERS, HUB_SYNC_RATE, type PlayerInput } from '@saab/shared';
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

    console.log('HubRoom created');
  }

  onJoin(client: Client, options: { name?: string }) {
    const playerName = options.name || `Player_${client.sessionId.slice(0, 4)}`;

    // Ensure player exists in DB
    this.inventory.ensurePlayer(client.sessionId, playerName);

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = playerName;
    player.position = new Vec3State();
    player.position.x = Math.random() * 10 - 5;
    player.position.z = Math.random() * 10 - 5;
    this.state.players.set(client.sessionId, player);

    // Send full inventory
    const items = this.inventory.getItems(client.sessionId);
    const gold = this.inventory.getGold(client.sessionId);
    client.send('inventory_full', { items, gold });

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
