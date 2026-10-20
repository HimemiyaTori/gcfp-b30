import { AccountError } from '../errors'
import { accountContext } from '../../db/accountContext'

export async function accountRequest<T>(path: string, method = 'GET', body?: object | Blob, includeOwner = true): Promise<T> {
    const work = () => sendRequest<T>(path, method, body, includeOwner)
    // 登录、退出和会话续期共用跨标签页锁，避免晚到的旧响应覆盖新会话 Cookie
    if (navigator.locks && (path === 'account' || path.startsWith('auth/'))) return navigator.locks.request('groove-site-session', work)
    return work()
}

async function sendRequest<T>(path: string, method: string, body: object | Blob | undefined, includeOwner: boolean): Promise<T> {
    try {
        const headers: Record<string, string> = { 'X-App-Protocol-Version': '1' }
        if (includeOwner && accountContext.userId) headers['X-App-Account-Id'] = accountContext.userId
        if (body) headers['Content-Type'] = body instanceof Blob ? body.type : 'application/json'
        const response = await fetch(`/api/${path}`, {
            method, credentials: 'same-origin', cache: 'no-store', headers,
            body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(30000),
        })
        const result = await response.json()
        if (!response.ok) throw new AccountError(typeof result.error === 'string' ? result.error : 'request_failed', Date.now() + Math.max(0, Number(response.headers.get('retry-after')) || 0) * 1000)
        return result as T
    } catch (error) {
        if (error instanceof AccountError) throw error
        throw new AccountError('network_error')
    }
}
