import { CreateWebWorkerMLCEngine, type WebWorkerMLCEngine, type InitProgressReport } from '@mlc-ai/web-llm';

const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

// Persist engine across Vite HMR so it doesn't reload on code changes
const HMR_KEY = '__vaultborn_llm_engine';
declare global {
  interface Window { [HMR_KEY]?: WebWorkerMLCEngine }
}

export class NPCBrainManager {
  private engine: WebWorkerMLCEngine | null = null;
  private loading = false;

  async init(onProgress?: (progress: number, text: string) => void): Promise<void> {
    if (this.engine || this.loading) return;

    // Reuse engine that survived HMR
    if (window[HMR_KEY]) {
      this.engine = window[HMR_KEY];
      onProgress?.(1, 'Loaded from memory');
      return;
    }

    this.loading = true;

    try {
      const worker = new Worker(
        new URL('./workers/llm-worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.engine = await CreateWebWorkerMLCEngine(worker, MODEL_ID, {
        initProgressCallback: (report: InitProgressReport) => {
          onProgress?.(report.progress, report.text);
        },
      });

      // Stash for HMR survival
      window[HMR_KEY] = this.engine;
    } finally {
      this.loading = false;
    }
  }

  get isReady(): boolean {
    return this.engine !== null;
  }

  async *generateResponse(
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string,
  ): AsyncGenerator<string, void, unknown> {
    if (!this.engine) throw new Error('LLM not initialized');

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const stream = await this.engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.8,
      top_p: 0.9,
      max_tokens: 200,
      frequency_penalty: 1.2,
      presence_penalty: 0.6,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }
}
