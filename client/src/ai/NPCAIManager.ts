import { NPCBrainManager } from './NPCBrainManager';
import { NPCMemoryManager } from './NPCMemoryManager';
import { NPC_PROFILES, type NPCProfile } from './npc-profiles';
import {
  showAINPCDialog,
  hideAINPCDialog,
  isAINPCDialogVisible,
  addPlayerMessage,
  startNPCStreaming,
  appendNPCToken,
  finishNPCStreaming,
} from './ui/AINPCDialog';

export type AIStatus = 'idle' | 'loading' | 'ready';

export class NPCAIManager {
  private brain = new NPCBrainManager();
  private memory = new NPCMemoryManager();

  private modelsLoaded = false;
  private loadPromise: Promise<boolean> | null = null;
  private currentNpcId: string | null = null;
  private activeProfile: NPCProfile | null = null;

  hasProfile(npcId: string): boolean {
    return npcId in NPC_PROFILES;
  }

  isReady(): boolean {
    return this.modelsLoaded;
  }

  getStatus(): AIStatus {
    if (this.modelsLoaded) return 'ready';
    if (this.loadPromise) return 'loading';
    return 'idle';
  }

  isDialogVisible(): boolean {
    return isAINPCDialogVisible();
  }

  hideDialog(): void {
    this.currentNpcId = null;
    this.activeProfile = null;
    hideAINPCDialog();
  }

  /** Load LLM model. Called from Settings button. */
  loadModel(onProgress?: (progress: number, text: string) => void): Promise<boolean> {
    return this.ensureModelLoading(onProgress);
  }

  private ensureModelLoading(onProgress?: (progress: number, text: string) => void): Promise<boolean> {
    if (this.modelsLoaded) return Promise.resolve(true);
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        console.log('[NPC-AI] Loading LLM model...');
        console.log('[NPC-AI] WebGPU available:', !!navigator.gpu);
        let lastLog = 0;
        await this.brain.init((progress, text) => {
          onProgress?.(progress, text);
          const now = Date.now();
          if (now - lastLog > 3000 || progress >= 1) {
            console.log(`[NPC-AI] LLM progress: ${(progress * 100).toFixed(0)}% - ${text}`);
            lastLog = now;
          }
        });
        this.modelsLoaded = true;
        console.log('[NPC-AI] LLM model ready');
        return true;
      } catch (err) {
        console.error('[NPC-AI] Failed to load model:', err);
        this.loadPromise = null;
        return false;
      }
    })();

    return this.loadPromise;
  }

  /** Returns false if models aren't ready (caller should use static dialog). */
  async interact(npcId: string): Promise<boolean> {
    if (this.currentNpcId) return true;

    const profile = NPC_PROFILES[npcId];
    if (!profile) {
      console.log('[NPC-AI] No profile for:', npcId);
      return false;
    }

    if (!this.modelsLoaded) {
      console.log('[NPC-AI] Models not ready, falling back to static dialog');
      return false;
    }

    this.currentNpcId = npcId;
    this.activeProfile = profile;

    showAINPCDialog(profile.name, '', (text) => {
      this.handlePlayerMessage(text);
    });

    startNPCStreaming();
    appendNPCToken(profile.greeting);
    finishNPCStreaming();

    return true;
  }

  private async handlePlayerMessage(text: string): Promise<void> {
    if (!this.activeProfile || !this.currentNpcId) return;

    const profile = this.activeProfile;
    const npcId = this.currentNpcId;

    addPlayerMessage(text);

    const history = await this.memory.getHistory(npcId);
    const chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'assistant', content: profile.greeting },
      ...this.memory.formatHistoryForChat(history),
    ];

    startNPCStreaming();

    let fullResponse = '';

    try {
      for await (const token of this.brain.generateResponse(
        profile.systemPrompt,
        chatHistory,
        text,
      )) {
        if (this.currentNpcId !== npcId) break;
        fullResponse += token;
        appendNPCToken(token);
      }
    } catch (err) {
      console.error('LLM generation error:', err);
      if (fullResponse.length === 0) {
        appendNPCToken('I... seem to have lost my train of thought. Could you say that again?');
        fullResponse = 'fallback';
      }
    }

    finishNPCStreaming();

    if (fullResponse.trim()) {
      await this.memory.addEntry(npcId, text, fullResponse.trim());
    }
  }
}
