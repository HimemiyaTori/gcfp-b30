export interface AccountProfile { id: string; email: string; nickname: string; avatarUrl?: string; hasPassword?: boolean }
export const ACCOUNT_KEY = 'groove-account-profile'

export function storedAccount(): AccountProfile | undefined {
    if (import.meta.env?.VITE_SERVER !== '1') return
    try {
        const value = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null') as AccountProfile | null
        if (value && /^[\w-]{1,80}$/.test(value.id) && typeof value.email === 'string' && typeof value.nickname === 'string') return value
    } catch {}
}

// 数据上下文在当前页面生命周期内保持不变，切号完整重挂载以释放全部旧订阅与回调
export const accountContext = Object.freeze({ userId: storedAccount()?.id, generation: crypto.randomUUID() })
// 游客和登录账号共用这一份成绩库，不按账号再拆 IndexedDB
export const databaseName = 'groove-archive-fp-history'
