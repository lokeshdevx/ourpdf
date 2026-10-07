// Downloads the optional on-device AI models (Whisper speech recognition and MiniLM sentence embeddings) into
// /public/models so they are served from this origin. Run once: `npm run models`. Without them, Audio → PDF is
// unavailable and Chat with PDF falls back to keyword (BM25) retrieval.
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS = {
  'whisper-base': {
    repo: 'Xenova/whisper-base',
    files: ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
  },
  'all-MiniLM-L6-v2': {
    repo: 'Xenova/all-MiniLM-L6-v2',
    files: ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'],
  },
}

for (const [id, m] of Object.entries(MODELS)) {
  for (const f of m.files) {
    const dest = join(root, 'public/models', id, f)
    if (existsSync(dest) && statSync(dest).size > 0) continue
    mkdirSync(dirname(dest), { recursive: true })
    const url = `https://huggingface.co/${m.repo}/resolve/main/${f}`
    process.stdout.write(`↓ ${id}/${f} … `)
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    writeFileSync(dest, buf)
    console.log(`${(buf.length / 1048576).toFixed(1)} MB`)
  }
}
console.log('models ready in /public/models')
