import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { SceneManager } from './core/SceneManager.js';
import { CameraController } from './core/CameraController.js';
import { InputManager } from './core/InputManager.js';
import { NetworkManager, type RoomType } from './network/NetworkManager.js';
import { LocalPlayer, type Gender } from './entities/LocalPlayer.js';
import { RemotePlayer } from './entities/RemotePlayer.js';
import { MonsterEntity } from './entities/Monster.js';
import { LootDropEntity } from './entities/LootDrop.js';
import { HubWorld } from './world/HubWorld.js';
import { mountHUD, type HUDState } from './ui/HUD.js';
import { mountNPCDialog, showNPCDialog, hideNPCDialog } from './ui/NPCDialog.js';
import { mountMiniMap, type MinimapData } from './ui/MiniMap.js';
import { mountShopPanel, showShopPanel, hideShopPanel } from './ui/ShopPanel.js';
import { mountInventoryPanel, toggleInventoryPanel, hideInventoryPanel } from './ui/InventoryPanel.js';
import { mountSettingsMenu, showSettings, hideSettings, isSettingsOpen } from './ui/SettingsMenu.js';
import { MusicSystem } from './systems/MusicSystem.js';
import { inventoryManager } from './systems/InventoryManager.js';
import { setNetworkManager } from './network/actions.js';
import { CLIENT_INPUT_RATE } from '@saab/shared';

export class Game {
  private renderer: Renderer;
  private sceneManager: SceneManager;
  private camera: CameraController;
  private input: InputManager;
  private network: NetworkManager;

  private localPlayer: LocalPlayer | null = null;
  private remotePlayers = new Map<string, RemotePlayer>();
  private monsters = new Map<string, MonsterEntity>();
  private lootDrops = new Map<string, LootDropEntity>();

  private hubWorld: HubWorld | null = null;
  private music = new MusicSystem();

  private clock = new THREE.Clock();
  private elapsedTime = 0;
  private inputTimer = 0;
  private inputInterval = 1 / CLIENT_INPUT_RATE;
  private fps = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  private currentRoom: RoomType = 'hub';
  private hudState: HUDState | null = null;
  private playerName = 'Adventurer';
  private playerGender: Gender = 'male';

  private portalCooldown = 0; // prevent spam
  private npcCooldown = 0;
  private isMoving = false;
  private paused = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.sceneManager = new SceneManager();
    this.camera = new CameraController();
    this.input = new InputManager(canvas);
    this.network = new NetworkManager();

    // Wire up network actions helper
    setNetworkManager(this.network);

    // Setup UI
    const uiOverlay = document.getElementById('ui-overlay')!;
    mountHUD(uiOverlay, () => this.hudState);
    mountNPCDialog(uiOverlay);
    mountMiniMap(uiOverlay, () => this.getMinimapData());
    mountShopPanel(uiOverlay);
    mountInventoryPanel(uiOverlay);
    mountSettingsMenu(uiOverlay, {
      onSoundToggle: (muted) => {
        if (muted) this.music.mute();
        else this.music.unmute();
      },
      onResume: () => this.unpause(),
    });

    // ESC to close panels / toggle pause
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (isSettingsOpen()) {
          hideSettings();
        } else if (this.isAnyPanelOpen()) {
          hideNPCDialog();
          hideShopPanel();
          hideInventoryPanel();
        } else {
          this.pause();
        }
      }
      if (e.code === 'KeyI' || e.code === 'KeyB') {
        if (!this.paused) toggleInventoryPanel();
      }
    });
  }

  private isAnyPanelOpen(): boolean {
    // Check if any UI panels are currently shown (by DOM visibility)
    const npcRoot = document.getElementById('npc-dialog-root');
    const shopRoot = document.getElementById('shop-panel-root');
    const invRoot = document.getElementById('inventory-panel-root');
    return !!(
      (npcRoot && npcRoot.children.length > 0 && npcRoot.innerHTML.length > 10) ||
      (shopRoot && shopRoot.children.length > 0 && shopRoot.innerHTML.length > 10) ||
      (invRoot && invRoot.children.length > 0 && invRoot.innerHTML.length > 10)
    );
  }

  private pause() {
    this.paused = true;
    showSettings();
    document.exitPointerLock();
  }

  private unpause() {
    this.paused = false;
    this.canvas.requestPointerLock();
  }

  async connect(playerName: string, gender: Gender = 'male') {
    this.playerName = playerName;
    this.playerGender = gender;
    this.network.onMessage = (type, data) => this.handleMessage(type, data);

    // Build hub world
    this.hubWorld = new HubWorld(this.sceneManager.scene);

    const room = await this.network.joinRoom('hub', { name: playerName });
    this.localPlayer = new LocalPlayer(this.sceneManager.scene, gender);
    this.setupRoomListeners(room);
    this.currentRoom = 'hub';
    this.music.playHub();

    // Initialize post-processing after scene is set up
    this.renderer.setupPostProcessing(this.sceneManager.scene, this.camera.camera);

    this.startLoop();
  }

  private setupRoomListeners(room: any) {
    room.state.players.onAdd((player: any, sessionId: string) => {
      if (sessionId === this.network.getSessionId()) return;
      const remote = new RemotePlayer(this.sceneManager.scene, sessionId, player.name);
      remote.targetPosition.set(player.position.x, player.position.y, player.position.z);
      this.remotePlayers.set(sessionId, remote);

      player.position.onChange(() => {
        remote.targetPosition.set(player.position.x, player.position.y, player.position.z);
        remote.targetRotation = player.rotation;
      });
    });

    room.state.players.onRemove((_player: any, sessionId: string) => {
      const remote = this.remotePlayers.get(sessionId);
      if (remote) {
        remote.dispose(this.sceneManager.scene);
        this.remotePlayers.delete(sessionId);
      }
    });

    // Dungeon-specific listeners
    if (room.state.monsters) {
      room.state.monsters.onAdd((monster: any, id: string) => {
        const entity = new MonsterEntity(this.sceneManager.scene, id, monster.defId);
        entity.targetPosition.set(monster.position.x, monster.position.y, monster.position.z);
        entity.hp = monster.hp;
        entity.maxHp = monster.maxHp;
        this.monsters.set(id, entity);

        monster.position.onChange(() => {
          entity.targetPosition.set(monster.position.x, monster.position.y, monster.position.z);
          entity.targetRotation = monster.rotation;
        });
        monster.onChange(() => {
          entity.hp = monster.hp;
          entity.maxHp = monster.maxHp;
        });
      });

      room.state.monsters.onRemove((_monster: any, id: string) => {
        const entity = this.monsters.get(id);
        if (entity) {
          entity.dispose(this.sceneManager.scene);
          this.monsters.delete(id);
        }
      });
    }

    if (room.state.lootDrops) {
      room.state.lootDrops.onAdd((loot: any, id: string) => {
        const entity = new LootDropEntity(
          this.sceneManager.scene, id, loot.itemDefId, loot.rarity,
          loot.x, loot.y, loot.z,
        );
        this.lootDrops.set(id, entity);
      });

      room.state.lootDrops.onRemove((_loot: any, id: string) => {
        const entity = this.lootDrops.get(id);
        if (entity) {
          entity.dispose(this.sceneManager.scene);
          this.lootDrops.delete(id);
        }
      });
    }
  }

  async switchRoom(roomType: RoomType, options: Record<string, any> = {}) {
    // Clean up
    this.remotePlayers.forEach(p => p.dispose(this.sceneManager.scene));
    this.remotePlayers.clear();
    this.monsters.forEach(m => m.dispose(this.sceneManager.scene));
    this.monsters.clear();
    this.lootDrops.forEach(l => l.dispose(this.sceneManager.scene));
    this.lootDrops.clear();

    // Toggle hub world
    if (this.hubWorld) {
      this.hubWorld.group.visible = roomType === 'hub';
    }

    const room = await this.network.joinRoom(roomType, { ...options, name: this.playerName });
    this.setupRoomListeners(room);

    if (this.localPlayer) {
      this.localPlayer.position.set(0, roomType === 'hub' ? 0.91 : 0, roomType === 'dungeon' ? -8 : 16);
    }

    this.currentRoom = roomType;
    this.portalCooldown = 1;

    // Switch music
    if (roomType === 'hub') this.music.playHub();
    else this.music.playDungeon();
  }

  private handleMessage(type: string, data: any) {
    if (type === 'damage') {
      // TODO: floating damage text
    } else if (type === 'level_up') {
      console.log(`Level up! Now level ${data.level}`);
    } else if (type === 'loot_acquired') {
      // data.item is full ItemInstance from server
      if (data.item) {
        inventoryManager.addItem(data.item);
        console.log(`Picked up: ${data.item.defId} (${data.item.rarity})`);
      }
    } else if (type === 'player_died') {
      if (data.playerId === this.network.getSessionId() && this.localPlayer) {
        this.localPlayer.position.set(0, 0, -8);
      }
    } else if (type === 'inventory_full') {
      inventoryManager.setFull(data.items, data.gold);
    } else if (type === 'gold_gained') {
      inventoryManager.setGold(data.total);
    } else if (type === 'shop_buy_ok') {
      inventoryManager.addItem(data.item);
      inventoryManager.setGold(data.gold);
    } else if (type === 'shop_buy_fail') {
      console.log(`Shop buy failed: ${data.error}`);
    } else if (type === 'shop_sell_ok') {
      inventoryManager.removeItem(data.instanceId);
      inventoryManager.setGold(data.gold);
    } else if (type === 'shop_sell_fail') {
      console.log(`Shop sell failed: ${data.error}`);
    }
  }

  private startLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      this.elapsedTime += dt;
      this.update(dt);
      this.renderer.render(this.sceneManager.scene, this.camera.camera);
    };
    loop();
  }

  private update(dt: number) {
    // FPS
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // Skip game logic when paused (rendering continues)
    if (this.paused) return;

    // Cooldowns
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    this.npcCooldown = Math.max(0, this.npcCooldown - dt);

    // Mouse look
    const mouse = this.input.consumeMouse();
    this.camera.onMouseMove(mouse.dx, mouse.dy);

    // Input
    this.inputTimer += dt;
    if (this.inputTimer >= this.inputInterval && this.localPlayer) {
      this.inputTimer = 0;
      const input = this.input.getInput(this.camera.getYaw(), this.inputInterval);
      this.localPlayer.applyInput(input);
      this.network.sendInput(input);

      this.isMoving = input.forward || input.backward || input.left || input.right;
    }

    // Reconcile
    const room = this.network.getRoom();
    if (room && this.localPlayer) {
      const myState = room.state.players?.get(this.network.getSessionId());
      if (myState) {
        this.localPlayer.reconcile(
          myState.position.x,
          myState.position.z,
          myState.lastProcessedInput,
        );

        this.hudState = {
          hp: myState.stats?.hp ?? 100,
          maxHp: myState.stats?.maxHp ?? 100,
          mana: myState.stats?.mana ?? 50,
          maxMana: myState.stats?.maxMana ?? 50,
          level: myState.stats?.level ?? 1,
          xp: myState.stats?.xp ?? 0,
          xpToNext: myState.stats?.xpToNext ?? 100,
          gold: inventoryManager.getGold(),
          playerCount: room.state.players?.size ?? 0,
          roomType: this.currentRoom,
          fps: this.fps,
        };
      }
    }

    // Update entities
    this.localPlayer?.update(dt, this.elapsedTime, this.isMoving);
    this.remotePlayers.forEach(p => p.update(dt));
    this.monsters.forEach(m => m.update(dt));
    this.lootDrops.forEach(l => l.update(dt));

    // Camera (Fortnite-style smooth follow)
    if (this.localPlayer) {
      this.camera.update(this.localPlayer.position, dt);
    }

    // Hub world animations
    if (this.hubWorld && this.currentRoom === 'hub') {
      this.hubWorld.update(this.elapsedTime, this.localPlayer?.position);
    }

    // Interaction checks
    this.checkInteractions();
  }

  private checkInteractions() {
    if (!this.localPlayer) return;
    const pos = this.localPlayer.position;

    if (this.currentRoom === 'hub' && this.hubWorld) {
      // Portal: E to enter
      if (this.input.isKey('KeyE') && this.portalCooldown <= 0) {
        const portalDist = pos.distanceTo(this.hubWorld.forestPortalPosition);
        if (portalDist < 4) {
          this.switchRoom('dungeon', { dungeonId: 'forest' });
          return;
        }
      }

      // NPC: E to interact
      if (this.input.isKey('KeyE') && this.npcCooldown <= 0) {
        for (const npc of this.hubWorld.npcPositions) {
          const dist = pos.distanceTo(npc.position);
          if (dist < 3) {
            if (npc.name === 'Blacksmith Toivo') {
              showShopPanel();
            } else {
              showNPCDialog(npc.name, npc.dialog);
            }
            this.npcCooldown = 0.5;
            break;
          }
        }
      }
    }

    if (this.currentRoom === 'dungeon') {
      // F to pick up loot
      if (this.input.isKey('KeyF')) {
        let closestId: string | null = null;
        let closestDist = 3;
        this.lootDrops.forEach((loot, id) => {
          const dist = pos.distanceTo(loot.mesh.position);
          if (dist < closestDist) {
            closestDist = dist;
            closestId = id;
          }
        });
        if (closestId) {
          this.network.sendMessage('pickup', { lootId: closestId });
        }
      }

      // ESC or portal back to hub (for now, walk to edge)
      if (this.input.isKey('KeyQ') && this.portalCooldown <= 0) {
        this.switchRoom('hub');
      }
    }
  }

  private getMinimapData(): MinimapData | null {
    if (!this.localPlayer) return null;

    const remotePlayers: { x: number; z: number }[] = [];
    this.remotePlayers.forEach(rp => {
      remotePlayers.push({ x: rp.targetPosition.x, z: rp.targetPosition.z });
    });

    const npcs: { x: number; z: number; name: string }[] = [];
    const portals: { x: number; z: number; color: string }[] = [];

    if (this.currentRoom === 'hub' && this.hubWorld) {
      for (const npc of this.hubWorld.npcPositions) {
        npcs.push({ x: npc.position.x, z: npc.position.z, name: npc.name });
      }
      portals.push(
        { x: 0, z: -25, color: '#ff8800' },    // Forest portal
        { x: -10, z: -25, color: '#ff8800' },   // Ice Caves
        { x: 10, z: -25, color: '#ff8800' },    // Volcano
        { x: -12, z: -5, color: '#ffdd00' },    // Shop
        { x: 15, z: -8, color: '#ff4444' },     // PvP Arena
      );
    }

    const monsters: { x: number; z: number }[] = [];
    this.monsters.forEach(m => {
      monsters.push({ x: m.targetPosition.x, z: m.targetPosition.z });
    });

    return {
      playerX: this.localPlayer.position.x,
      playerZ: this.localPlayer.position.z,
      playerYaw: this.camera.getYaw(),
      remotePlayers,
      npcs,
      portals,
      monsters,
      roomType: this.currentRoom,
    };
  }
}
