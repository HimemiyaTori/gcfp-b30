import { mkdir, readdir, copyFile } from 'node:fs/promises'
// The SDK's prebuilt worker embeds ORT 1.24.3. Serve matching WASM locally.
const target = new URL('../public/ocr/', import.meta.url)
await mkdir(target, { recursive: true })
const assets = new URL('../node_modules/@paddleocr/paddleocr-js/dist/assets/', import.meta.url)
const worker = (await readdir(assets)).find(name => /^worker-entry-.*\.js$/.test(name))
if (!worker) throw new Error('PaddleOCR worker asset missing')
await copyFile(new URL(worker, assets), new URL('worker.js', target))
const ort = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url)
for (const name of await readdir(ort)) {
    if (name.startsWith('ort-wasm') && /\.(mjs|wasm)$/.test(name))
        await copyFile(new URL(name, ort), new URL(name, target))
}
