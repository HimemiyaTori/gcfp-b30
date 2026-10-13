import { spawnSync } from 'node:child_process'
const env = { ...process.env, VITE_SERVER: '1' }
delete env.GITHUB_ACTIONS
for (const [file, args] of [
    ['scripts/prepare-ocr.mjs', []], ['scripts/prepare-covers.mjs', []],
    ['node_modules/vue-tsc/bin/vue-tsc.js', ['--noEmit']],
    ['node_modules/typescript/bin/tsc', ['-p', 'worker/tsconfig.json']],
    ['node_modules/vite/bin/vite.js', ['build']],
]) {
    const result = spawnSync(process.execPath, [file, ...args], { env, stdio: 'inherit' })
    if (result.status !== 0) process.exit(result.status ?? 1)
}
