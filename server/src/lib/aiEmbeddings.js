import { fileURLToPath } from 'node:url';

const modelId = 'Xenova/bge-small-en-v1.5';
const revision = 'ea104dacec62c0de699686887e3f920caeb4f3e3';
const dtype = 'q8';
const cacheDir = fileURLToPath(new URL('../../.embedding-model/', import.meta.url));
export const embeddingModelVersion = `${modelId}@${revision}:${dtype}`;

let modelPromise;
export function loadEmbeddingModel() {
  modelPromise ??= import('@huggingface/transformers').then(({ pipeline }) => pipeline('feature-extraction', modelId, {
    revision,
    dtype,
    device: 'cpu',
    cache_dir: cacheDir,
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1, enableCpuMemArena: false },
  })).catch(error => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}

let inferenceQueue = Promise.resolve();
export async function embedTexts(texts) {
  const model = await loadEmbeddingModel();
  const vectors = [];
  for (const text of texts) {
    // One inference at a time. A question can run between documents being indexed.
    const inference = inferenceQueue.then(() => model(text, { pooling: 'cls', normalize: true }));
    inferenceQueue = inference.catch(() => {});
    const { data } = await inference;
    const vector = Array.from(data);
    if (vector.length !== 384 || !vector.every(Number.isFinite) || !vector.some(value => value !== 0)) {
      throw new Error('Embedding model returned an invalid vector');
    }
    vectors.push(vector);
  }
  return vectors;
}
