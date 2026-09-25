import { mkdir, readdir, copyFile, rm, stat } from 'node:fs/promises'
// 清理生成目录，避免部署过时的运行时变体
const target = new URL('../public/ocr/', import.meta.url)
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
const assets = new URL(
    '../node_modules/@paddleocr/paddleocr-js/dist/assets/',
    import.meta.url,
)
const worker = (await readdir(assets)).find((name) =>
    /^worker-entry-.*\.js$/.test(name),
)
if (!worker) throw new Error('PaddleOCR worker asset missing')
const ort = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url)
// PaddleOCR 预构建的工作线程使用 JSEP 运行时，其他变体不会用到
// asyncify 变体超过 Cloudflare Workers 单个资源 25 MiB 的限制
const wasm = await stat(new URL('ort-wasm-simd-threaded.jsep.wasm', ort))
if (wasm.size > 25 * 1024 * 1024)
    throw new Error(
        `OCR WASM is ${wasm.size} bytes; Cloudflare Workers assets must be at most 25 MiB.`,
    )
await copyFile(new URL(worker, assets), new URL('worker.js', target))
for (const name of [
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
])
    await copyFile(new URL(name, ort), new URL(name, target))
