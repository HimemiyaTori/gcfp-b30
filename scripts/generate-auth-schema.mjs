import { DatabaseSync } from 'node:sqlite'
import { writeFile, mkdir } from 'node:fs/promises'
import { getMigrations } from 'better-auth/db/migration'
import { createAuth } from '../worker/auth.ts'

// 认证表由实际安装的 Better Auth 与插件配置生成，业务表维护独立迁移
const database = new DatabaseSync(':memory:')
try {
    const auth = createAuth({ DB: database, BETTER_AUTH_API_KEY: 'schema-generation-only-not-a-deployment-secret' }, 'https://localhost')
    const migration = await getMigrations({ ...auth.options, database })
    const sql = await migration.compileMigrations()
    await mkdir(new URL('../worker/migrations/', import.meta.url), { recursive: true })
    await writeFile(new URL('../worker/migrations/0001_auth.sql', import.meta.url), `-- 由 Better Auth 1.6.23 配置生成\n${sql}\n`)
} finally {
    database.close()
}
