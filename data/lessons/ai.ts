import type { Track } from '../types';
import { mlFoundationsModule } from './ai/m1-foundations';
import { classicalModule } from './ai/m2-classical';
import { deepLearningModule } from './ai/m3-deep-learning';
import { tokensEmbeddingsModule } from './ai/m4-tokens-embeddings';
import { transformersModule } from './ai/m5-transformers';
import { inferenceModule } from './ai/m6-inference';
import { finetuningModule } from './ai/m7-finetuning';
import { promptContextModule } from './ai/m8-prompt-context';
import { ragModule } from './ai/m9-rag';
import { agentsModule } from './ai/m10-agents';
import { evalsSecurityModule } from './ai/m11-evals-security';

/**
 * AI / ML & LLM Engineering — a complete zero-to-production curriculum.
 * Each module lives in its own file under ./ai/ so chapters are easy to extend.
 * Every chapter is fully authored (no locked/"coming soon" placeholders).
 *
 *  1. ML Math & Evaluation Foundations
 *  2. Classical Machine Learning
 *  3. Deep Learning & Backpropagation From Scratch
 *  4. Tokenization & Embeddings
 *  5. Transformer Internals
 *  6. Inference, Sampling & Reasoning Models
 *  7. Fine-Tuning & Alignment
 *  8. Prompt & Context Engineering
 *  9. Production RAG & Vector Search
 * 10. Agents, Tool Calling & MCP
 * 11. Evals, Observability & AI Security
 */
export const aiTrack: Track = {
  id: 'ai',
  title: 'AI / ML & LLM Engineering',
  short: 'AI/ML',
  tagline: 'From vectors and backprop to transformers, fine-tuning, production RAG, agents with MCP, evals and AI security.',
  accent: 'cyan',
  icon: 'brain',
  modules: [
    mlFoundationsModule,
    classicalModule,
    deepLearningModule,
    tokensEmbeddingsModule,
    transformersModule,
    inferenceModule,
    finetuningModule,
    promptContextModule,
    ragModule,
    agentsModule,
    evalsSecurityModule,
  ],
};
