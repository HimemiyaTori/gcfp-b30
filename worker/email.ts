import { ApiError, bytes, type Env } from './types'

export async function digest(value: string) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

// 单条条件写入同时检查和消耗额度，避免不同 Worker 实例并发放行
export async function consumeLimit(env: Env, key: string, seconds: number, max: number) {
    const now = Date.now()
    const row = await env.DB.prepare(`
        INSERT INTO account_limits (key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
            expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
        WHERE expires_at <= ? OR count < ? RETURNING expires_at
    `).bind(key, now + seconds * 1000, now, now, now, max).first<{ expires_at: number }>()
    if (row) return { allowed: true, retryAfter: null }
    const current = await env.DB.prepare('SELECT expires_at FROM account_limits WHERE key = ?').bind(key).first<{ expires_at: number }>()
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(((current?.expires_at ?? now + seconds * 1000) - now) / 1000)) }
}

export async function emailCooldown(env: Env, email: string) {
    const result = await consumeLimit(env, `email:${await digest(email)}`, 60, 1)
    if (!result.allowed) throw new ApiError('email_cooldown', 429, result.retryAfter ?? 60)
}

function quota(value: string | undefined, fallback: number, ceiling: number) {
    const parsed = value === undefined ? fallback : Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > ceiling) throw new ApiError('not_configured', 503)
    return parsed
}

export async function sendLoginEmail(env: Env, email: string, otp: string, purpose: 'sign-in' | 'registration' = 'sign-in') {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new ApiError('email_not_configured', 503)
    const now = new Date()
    const day = `resend:day:${now.toISOString().slice(0, 10)}`
    const month = `resend:month:${now.toISOString().slice(0, 7)}`
    const dayEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    const daily = quota(env.EMAIL_DAILY_LIMIT, 90, 100)
    const monthly = quota(env.EMAIL_MONTHLY_LIMIT, 2900, 3000)
    const id = crypto.randomUUID()
    // 日预算、月预算和发送回执在同一事务中预占，发送结果不明时保留占用
    const results = await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO email_send_budgets (key, used, resets_at) VALUES (?, 0, ?)').bind(day, dayEnd),
        env.DB.prepare('INSERT OR IGNORE INTO email_send_budgets (key, used, resets_at) VALUES (?, 0, ?)').bind(month, monthEnd),
        env.DB.prepare(`INSERT INTO email_send_attempts (id, status, created_at)
            SELECT ?, 'reserved', ? WHERE
            (SELECT used FROM email_send_budgets WHERE key = ?) < ? AND
            (SELECT used FROM email_send_budgets WHERE key = ?) < ? RETURNING id`).bind(id, now.getTime(), day, daily, month, monthly),
        env.DB.prepare(`UPDATE email_send_budgets SET used = used + 1 WHERE key IN (?, ?)
            AND EXISTS (SELECT 1 FROM email_send_attempts WHERE id = ?)`).bind(day, month, id),
    ])
    if (!results[2]!.results.length) {
        const exhausted = await env.DB.prepare(`SELECT MAX(resets_at) AS resets_at FROM email_send_budgets
            WHERE (key = ? AND used >= ?) OR (key = ? AND used >= ?)`).bind(day, daily, month, monthly).first<{ resets_at: number }>()
        throw new ApiError('email_budget_exhausted', 429, Math.max(60, Math.ceil(((exhausted?.resets_at ?? dayEnd) - now.getTime()) / 1000)))
    }
    let response: Response
    try {
        response = await fetch('https://api.resend.com/emails', {
            method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': id },
            body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject: `Groove Archive ${purpose === 'registration' ? '注册' : '登录'}验证码`,
                text: `你的 Groove Archive ${purpose === 'registration' ? '注册' : '登录'}验证码是 ${otp}，10 分钟内有效。请勿将验证码告诉他人。如果不是你本人操作，请忽略此邮件。` }),
        })
    } catch {
        await env.DB.prepare("UPDATE email_send_attempts SET status = 'unknown' WHERE id = ?").bind(id).run()
        throw new ApiError('email_send_uncertain', 503, 60)
    }
    if (!response.ok) {
        await response.body?.cancel()
        await env.DB.prepare("UPDATE email_send_attempts SET status = 'failed' WHERE id = ?").bind(id).run()
        throw new ApiError(response.status === 429 ? 'email_provider_limited' : 'email_send_failed', response.status === 429 ? 429 : 503, 60)
    }
    const result = JSON.parse(new TextDecoder().decode(await bytes(response, 4096))) as { id?: string }
    await env.DB.prepare("UPDATE email_send_attempts SET status = 'sent', provider_id = ? WHERE id = ?").bind(result.id ?? null, id).run()
}
