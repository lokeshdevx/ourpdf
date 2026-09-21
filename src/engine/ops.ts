import type { Block, BlocksToPdfOptions, ImageInput, ImagesToPdfOptions } from './generate'
import type { CompressOptions, CompressResult } from './compress'
import type { ExportPlan, ProgressFn } from './types'
import type { AbortSignalLike } from './assemble'

/** Operation table shared by the worker and the inline fallback. */
export interface EngineOps {
  assemble: { payload: { plan: ExportPlan }; result: Uint8Array }
  imagesToPdf: { payload: { images: ImageInput[]; options: ImagesToPdfOptions }; result: Uint8Array }
  blocksToPdf: { payload: { blocks: Block[]; options: BlocksToPdfOptions }; result: Uint8Array }
  compress: { payload: { bytes: Uint8Array; options: CompressOptions }; result: CompressResult }
}
export type EngineOp = keyof EngineOps

export async function runOp<K extends EngineOp>(op: K, payload: EngineOps[K]['payload'], onProgress: ProgressFn, signal?: AbortSignalLike): Promise<EngineOps[K]['result']> {
  switch (op) {
    case 'assemble': {
      const { assemble } = await import('./assemble')
      return (await assemble((payload as EngineOps['assemble']['payload']).plan, onProgress, signal)) as EngineOps[K]['result']
    }
    case 'imagesToPdf': {
      const { imagesToPdf } = await import('./generate')
      const p = payload as EngineOps['imagesToPdf']['payload']
      return (await imagesToPdf(p.images, p.options, onProgress)) as EngineOps[K]['result']
    }
    case 'blocksToPdf': {
      const { blocksToPdf } = await import('./generate')
      const p = payload as EngineOps['blocksToPdf']['payload']
      return (await blocksToPdf(p.blocks, p.options, onProgress)) as EngineOps[K]['result']
    }
    case 'compress': {
      const { compressPdf } = await import('./compress')
      const p = payload as EngineOps['compress']['payload']
      return (await compressPdf(p.bytes, p.options, onProgress)) as EngineOps[K]['result']
    }
    default:
      throw new Error(`Unknown engine operation: ${String(op)}`)
  }
}
