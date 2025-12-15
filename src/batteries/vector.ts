/**
 * Vector Capability Battery
 * Provides local embeddings using Xenova/transformers.
 * Lazy-loaded to avoid heavy initialization cost on startup.
 */

// Define the interface locally to avoid circular deps if needed, 
// or import from a shared types definition.
// For this battery, we export a factory.

interface VectorCapability {
  embed(text: string): Promise<number[]>
}

let embedder: any = null

async function getEmbedder() {
  if (embedder) return embedder

  // Dynamic import to keep startup fast
  const { pipeline } = await import('@xenova/transformers')
  
  // Initialize the pipeline
  // 'feature-extraction' task, using a small, efficient model by default
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  return embedder
}

export function getVectorCapability(): VectorCapability {
  return {
    async embed(text: string): Promise<number[]> {
      const pipe = await getEmbedder()
      const output = await pipe(text, { pooling: 'mean', normalize: true })
      // output is a Tensor, we want a plain array
      return Array.from(output.data)
    }
  }
}