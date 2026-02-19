import { NPCBrainManager } from './NPCBrainManager';
import { NPCVoiceManager } from './NPCVoiceManager';
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
  setSpeaking,
} from './ui/AINPCDialog';
import {
  updateLLMProgress,
  updateTTSProgress,
} from './ui/AILoadingOverlay';

// Matches sentence-ending punctuation followed by a space or end-of-string
const SENTENCE_BOUNDARY = /[.!?](?:\s|$)/;

export class NPCAIManager {
  private brain = new NPCBrainManager();
  private voice = new NPCVoiceManager();
  private memory = new NPCMemoryManager();

  private modelsLoaded = false;
  private loadPromise: Promise<boolean> | null = null;
  private currentNpcId: string | null = null;
  private activeProfile: NPCProfile | null = null;
  private revealAborted = false;

  hasProfile(npcId: string): boolean {
    return npcId in NPC_PROFILES;
  }

  isReady(): boolean {
    return this.modelsLoaded;
  }

  isDialogVisible(): boolean {
    return isAINPCDialogVisible();
  }

  hideDialog(): void {
    this.voice.stopPlayback();
    this.revealAborted = true;
    this.currentNpcId = null;
    this.activeProfile = null;
    hideAINPCDialog();
  }

  /** Start loading models in background. Call early (e.g. at game start). */
  preload(): void {
    if (this.modelsLoaded || this.loadPromise) return;
    console.log('[NPC-AI] Starting background preload...');
    console.log('[NPC-AI] WebGPU available:', !!navigator.gpu);
    this.ensureModelsLoading();
  }

  private ensureModelsLoading(): Promise<boolean> {
    if (this.modelsLoaded) return Promise.resolve(true);
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        console.log('[NPC-AI] Loading LLM and TTS models...');
        let lastLLMLog = 0;
        await Promise.all([
          this.brain.init((progress, text) => {
            updateLLMProgress(progress, text);
            const now = Date.now();
            if (now - lastLLMLog > 3000 || progress >= 1) {
              console.log(`[NPC-AI] LLM progress: ${(progress * 100).toFixed(0)}% - ${text}`);
              lastLLMLog = now;
            }
          }),
          this.voice.init((progress, status) => {
            updateTTSProgress(progress, status);
            if (status === 'ready' || progress === 1) console.log('[NPC-AI] TTS loaded');
          }),
        ]);
        this.modelsLoaded = true;
        console.log('[NPC-AI] All models ready');
        return true;
      } catch (err) {
        console.error('[NPC-AI] Failed to load models:', err);
        this.loadPromise = null;
        return false;
      }
    })();

    return this.loadPromise;
  }

  /** Returns false if models aren't ready (caller should use static dialog). */
  async interact(npcId: string): Promise<boolean> {
    // Prevent re-entry if a conversation is already active
    if (this.currentNpcId) {
      return true;
    }

    const profile = NPC_PROFILES[npcId];
    if (!profile) {
      console.log('[NPC-AI] No profile for:', npcId);
      return false;
    }

    // If models aren't loaded yet, fall back to static dialog
    if (!this.modelsLoaded) {
      console.log('[NPC-AI] Models not ready, falling back to static dialog');
      return false;
    }

    this.currentNpcId = npcId;
    this.activeProfile = profile;
    this.revealAborted = false;

    // Show dialog, then reveal greeting words in sync with voice
    showAINPCDialog(profile.name, '', (text) => {
      this.handlePlayerMessage(text);
    });

    startNPCStreaming();
    setSpeaking(true);
    const duration = await this.voice.speakSentence(profile.greeting, profile.voiceId);
    await this.revealWords(profile.greeting, duration);
    finishNPCStreaming();
    setSpeaking(false);

    return true;
  }

  /**
   * Reveals words one by one into the current NPC message bubble,
   * timed to match audio playback duration. Words are weighted by
   * character count so longer words display longer.
   */
  private revealWords(sentence: string, durationSec: number): Promise<void> {
    const words = sentence.match(/\S+\s*/g) || [sentence];
    if (words.length === 0) return Promise.resolve();

    // If TTS failed (duration 0), show all at once
    if (durationSec <= 0) {
      appendNPCToken(sentence + ' ');
      return Promise.resolve();
    }

    const totalChars = words.reduce((sum, w) => sum + w.trimEnd().length, 0);

    return new Promise((resolve) => {
      let i = 0;

      const showNext = () => {
        if (this.revealAborted || i >= words.length) {
          // If aborted, dump remaining text so nothing is lost
          if (this.revealAborted) {
            for (; i < words.length; i++) appendNPCToken(words[i]);
          }
          resolve();
          return;
        }

        appendNPCToken(words[i]);
        const wordLen = Math.max(words[i].trimEnd().length, 1);
        const wordMs = (wordLen / totalChars) * durationSec * 1000;
        i++;

        if (i < words.length) {
          setTimeout(showNext, wordMs);
        } else {
          resolve();
        }
      };

      // Show first word immediately (audio is already starting)
      showNext();
    });
  }

  private async handlePlayerMessage(text: string): Promise<void> {
    if (!this.activeProfile || !this.currentNpcId) return;

    const profile = this.activeProfile;
    const npcId = this.currentNpcId;
    this.revealAborted = false;

    // Stop any lingering voice (e.g. greeting still playing)
    this.voice.stopPlayback();

    addPlayerMessage(text);

    // Load conversation history and prepend the greeting so the LLM
    // knows it already said it and doesn't repeat itself
    const history = await this.memory.getHistory(npcId);
    const chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'assistant', content: profile.greeting },
      ...this.memory.formatHistoryForChat(history),
    ];

    // Create empty NPC message bubble with thinking indicator
    startNPCStreaming();
    setSpeaking(true);

    let fullResponse = '';
    let sentenceBuffer = '';

    // Pipeline: LLM produces sentences + fires TTS eagerly,
    // consumer awaits TTS results and reveals words.
    // TTS for sentence N+1 runs while sentence N words are revealing.
    interface QueuedSentence {
      text: string;
      ttsPromise: Promise<number>;
    }

    const queue: QueuedSentence[] = [];
    let waitResolve: (() => void) | null = null;
    let producerDone = false;

    const signal = () => { if (waitResolve) { waitResolve(); waitResolve = null; } };
    const waitForItem = (): Promise<void> => {
      if (queue.length > 0 || producerDone) return Promise.resolve();
      return new Promise(r => { waitResolve = r; });
    };

    const pushSentence = (s: string) => {
      queue.push({
        text: s,
        ttsPromise: s.length > 2
          ? this.voice.speakSentence(s, profile.voiceId)
          : Promise.resolve(0),
      });
      signal();
    };

    // Producer: LLM streams tokens, detects sentences, fires TTS immediately
    const producer = (async () => {
      try {
        for await (const token of this.brain.generateResponse(
          profile.systemPrompt,
          chatHistory,
          text,
        )) {
          if (this.currentNpcId !== npcId) break;

          fullResponse += token;
          sentenceBuffer += token;

          const match = sentenceBuffer.match(SENTENCE_BOUNDARY);
          if (match && match.index !== undefined) {
            const endIdx = match.index + match[0].length;
            const sentence = sentenceBuffer.slice(0, endIdx).trim();
            sentenceBuffer = sentenceBuffer.slice(endIdx);
            if (sentence.length > 0) pushSentence(sentence);
          }
        }

        const remainder = sentenceBuffer.trim();
        if (remainder.length > 0 && this.currentNpcId === npcId) {
          pushSentence(remainder);
        }
      } catch (err) {
        console.error('LLM generation error:', err);
        if (fullResponse.length === 0) {
          pushSentence('I... seem to have lost my train of thought. Could you say that again?');
          fullResponse = 'fallback';
        }
      }
      producerDone = true;
      signal();
    })();

    // Consumer: awaits TTS (often already done) + reveals words
    const consumer = (async () => {
      while (true) {
        await waitForItem();
        if (queue.length === 0 && producerDone) break;
        if (queue.length === 0) continue;

        const item = queue.shift()!;
        const duration = await item.ttsPromise;
        if (duration > 0) {
          await this.revealWords(item.text + ' ', duration);
        } else {
          appendNPCToken(item.text);
        }
      }
    })();

    await Promise.all([producer, consumer]);

    finishNPCStreaming();
    setSpeaking(false);

    // Save to memory
    if (fullResponse.trim()) {
      await this.memory.addEntry(npcId, text, fullResponse.trim());
    }
  }
}
