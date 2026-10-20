import { seal, unseal } from './cookies'
import type { AuthSession } from './auth'
import type { CoralCache, Session } from './nintendo'
import { ApiError, type Env } from './types'

export interface NintendoBinding {
    user_id: string
    nintendo_account_id: string | null
    binding_id: string
    generation: number
    nickname: string | null
    avatar_url: string | null
    credentials: string | null
    coral_cache: string | null
    next_allowed_at: number
    last_checked_at: number | null
    status: 'active' | 'unbound'
}

export async function getBinding(env: Env, userId: string) {
    return env.DB.prepare('SELECT * FROM nintendo_bindings WHERE user_id = ?').bind(userId).first<NintendoBinding>()
}

export function bindingView(binding: NintendoBinding | null, configured: boolean, legacyAvailable = false) {
    return binding?.status === 'active' ? {
        status: 'active', configured, accountId: binding.nintendo_account_id, bindingId: binding.binding_id,
        generation: binding.generation, nickname: binding.nickname, avatarUrl: binding.avatar_url,
        nextAllowedAt: binding.next_allowed_at, lastCheckedAt: binding.last_checked_at, legacyAvailable,
    } : { status: 'unbound', configured, legacyAvailable }
}

export async function saveBinding(env: Env, owner: AuthSession, session: Session, migrationId?: string) {
    const existing = await getBinding(env, owner.user.id)
    if (migrationId) {
        const receipt = await env.DB.prepare('SELECT binding_id FROM nintendo_binding_migrations WHERE user_id = ? AND migration_id = ?').bind(owner.user.id, migrationId).first<{ binding_id: string }>()
        if (receipt) {
            if (existing?.status !== 'active' || existing.binding_id !== receipt.binding_id) throw new ApiError('binding_changed', 409)
            return existing
        }
    }
    if (existing?.status === 'active' && existing.nintendo_account_id !== session.accountId) throw new ApiError('binding_conflict', 409)
    const credential = await seal(env, `nintendo-binding:${owner.user.id}:${session.bindingId}`, session, Date.now() + 3650 * 86400000)
    const expected = existing?.generation ?? 0
    const statement = env.DB.prepare(`INSERT INTO nintendo_bindings
        (user_id, nintendo_account_id, binding_id, generation, nickname, avatar_url, credentials, coral_cache, status, consent_version, next_allowed_at)
        SELECT ?, ?, ?, 1, ?, ?, ?, NULL, 'active', '2026-10-20', 0
        WHERE EXISTS (SELECT 1 FROM session WHERE id = ? AND userId = ? AND expiresAt > ?)
        ON CONFLICT(user_id) DO UPDATE SET nintendo_account_id = excluded.nintendo_account_id,
            binding_id = excluded.binding_id, generation = generation + 1, nickname = excluded.nickname,
            avatar_url = excluded.avatar_url, credentials = excluded.credentials, coral_cache = NULL,
            status = 'active', consent_version = excluded.consent_version, next_allowed_at = 0, last_checked_at = NULL
        WHERE generation = ? AND (status = 'unbound' OR nintendo_account_id = excluded.nintendo_account_id)
        RETURNING *`).bind(owner.user.id, session.accountId, session.bindingId, session.nickname, session.avatarUrl ?? null, credential,
            owner.session.id, owner.user.id, Date.now(), expected)
    try {
        const results = await env.DB.batch([
            statement,
            ...(migrationId ? [env.DB.prepare(`INSERT INTO nintendo_binding_migrations (user_id, migration_id, binding_id)
                SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM nintendo_bindings WHERE user_id = ? AND binding_id = ?)
                ON CONFLICT(user_id, migration_id) DO NOTHING`).bind(owner.user.id, migrationId, session.bindingId, owner.user.id, session.bindingId)] : []),
        ])
        const binding = results[0]!.results[0] as NintendoBinding | undefined
        if (!binding) throw new ApiError('binding_changed', 409)
        await fillNintendoAvatar(env, owner.user.id, binding)
        return binding
    } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed: nintendo_bindings.nintendo_account_id')) throw new ApiError('nintendo_in_use', 409)
        throw error
    }
}

export async function fillNintendoAvatar(env: Env, userId: string, binding: NintendoBinding) {
    if (!binding.avatar_url) return
    // 仅补齐空头像或刷新原来的 Nintendo 头像，用户自定义头像始终优先
    await env.DB.prepare(`UPDATE user SET image = ?, updatedAt = ? WHERE id = ?
        AND NOT EXISTS (SELECT 1 FROM account_avatars WHERE user_id = ?)
        AND (image IS NULL OR image = '' OR image LIKE 'https://%')
        AND EXISTS (SELECT 1 FROM nintendo_bindings WHERE user_id = ? AND binding_id = ? AND status = 'active')
    `).bind(binding.avatar_url, Date.now(), userId, userId, userId, binding.binding_id).run()
}

export async function bindingCredentials(env: Env, binding: NintendoBinding) {
    if (binding.status !== 'active' || !binding.credentials) throw new ApiError('reauth_required', 401)
    const session = await unseal<Session>(env, `nintendo-binding:${binding.user_id}:${binding.binding_id}`, binding.credentials)
    if (!session || session.accountId !== binding.nintendo_account_id || session.bindingId !== binding.binding_id) throw new ApiError('reauth_required', 401)
    const cache = binding.coral_cache ? await unseal<CoralCache>(env, `nintendo-coral:${binding.user_id}:${binding.binding_id}`, binding.coral_cache) : undefined
    return { session, cache }
}

export async function reserveScan(env: Env, binding: NintendoBinding, owner: AuthSession) {
    const now = Date.now()
    const result = await env.DB.prepare(`UPDATE nintendo_bindings SET next_allowed_at = ?
        WHERE user_id = ? AND binding_id = ? AND generation = ? AND status = 'active' AND next_allowed_at <= ?
        AND EXISTS (SELECT 1 FROM session WHERE id = ? AND expiresAt > ?) RETURNING user_id`)
        .bind(now + 10000, binding.user_id, binding.binding_id, binding.generation, now, owner.session.id, now).first()
    if (!result) {
        const current = await getBinding(env, binding.user_id)
        if (current?.binding_id !== binding.binding_id || current.status !== 'active') throw new ApiError('binding_changed', 409)
        throw new ApiError('rate_limited', 429, Math.max(1, Math.ceil((current.next_allowed_at - now) / 1000)))
    }
}

export async function saveCoral(env: Env, binding: NintendoBinding, owner: AuthSession, cache: CoralCache) {
    const encrypted = await seal(env, `nintendo-coral:${binding.user_id}:${binding.binding_id}`, cache, cache.expiresAt)
    const avatar = cache.avatarUrl || binding.avatar_url
    const updated = await env.DB.prepare(`UPDATE nintendo_bindings SET coral_cache = ?, avatar_url = ?, last_checked_at = ?
        WHERE user_id = ? AND binding_id = ? AND generation = ? AND status = 'active'
        AND EXISTS (SELECT 1 FROM session WHERE id = ? AND expiresAt > ?) RETURNING *`)
        .bind(encrypted, avatar, Date.now(), binding.user_id, binding.binding_id, binding.generation, owner.session.id, Date.now()).first<NintendoBinding>()
    if (!updated) throw new ApiError('binding_changed', 409)
    await fillNintendoAvatar(env, binding.user_id, updated)
    return updated
}
