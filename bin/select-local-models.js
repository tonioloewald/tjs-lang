// Run with: bun select-local-models.ts
import { LocalModels } from '../src/batteries/models'
async function selectModels() {
  console.log('🔥 Auditing local models...')
  const localModels = new LocalModels()
  await localModels.audit()
  console.log('\n✅ Audit complete. Default models selected:')
  try {
    console.log(`   - LLM: ${localModels.getLLM().id}`)
  } catch (e) {
    console.log(`   - LLM: Not available`)
  }
  try {
    console.log(`   - Structured LLM: ${localModels.getStructuredLLM().id}`)
  } catch (e) {
    console.log(`   - Structured LLM: Not available`)
  }
  try {
    console.log(
      `   - Embedding: ${localModels.getEmbedding().id} (Dim: ${
        localModels.getEmbedding().dimension
      })`
    )
  } catch (e) {
    console.log(`   - Embedding: Not available`)
  }
}
await selectModels()
