import { reactive } from 'vue'
import { ACCOUNT_KEY, accountContext, storedAccount, type AccountProfile } from '../../db/accountContext'
import { AccountError } from '../errors'
import { accountRequest } from './api'
import { errorMessage } from '../../i18n'

interface AccountResponse { user: AccountProfile; expiresAt?: string }
export const siteAccount = reactive({ user: storedAccount(), authenticated: false, loading: false, error: '', expired: false })
let initialized: Promise<void> | undefined

async function applyAccount(user?: AccountProfile) {
    const changing = user?.id !== accountContext.userId
    try {
        if (user) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user))
        else localStorage.removeItem(ACCOUNT_KEY)
    } catch { throw new AccountError('storage_unavailable') }
    if (changing) {
        const [album, manual] = await Promise.all([import('../album/controller'), import('../ocr/importer')])
        album.cancel()
        manual.cancelManualImport()
        // 账号数据库实例不在运行中替换，刷新同时销毁旧弹窗、模型任务和 liveQuery 订阅
        location.reload()
        return
    }
    siteAccount.user = user
    siteAccount.authenticated = !!user
    siteAccount.expired = false
}

export async function refreshAccount() {
    siteAccount.loading = true
    siteAccount.error = ''
    try {
        const response = await accountRequest<AccountResponse>('account')
        await applyAccount(response.user)
    } catch (error) {
        if (error instanceof AccountError && error.code === 'account_changed') {
            siteAccount.authenticated = false
            // 会话在其他标签页切换后，通过不携带旧账号提示的只读请求恢复身份
            try {
                const response = await accountRequest<AccountResponse>('account', 'GET', undefined, false)
                await applyAccount(response.user)
            } catch (cause) {
                siteAccount.error = errorMessage(cause)
                siteAccount.expired = cause instanceof AccountError && cause.code === 'login_required'
            }
        } else if (error instanceof AccountError && error.code === 'login_required') {
            siteAccount.authenticated = false
            siteAccount.expired = !!siteAccount.user
        } else {
            siteAccount.error = errorMessage(error)
        }
    } finally { siteAccount.loading = false }
}

export function initializeAccount() {
    initialized ??= (async () => {
        window.addEventListener('storage', event => {
            if (event.key === ACCOUNT_KEY && storedAccount()?.id !== accountContext.userId) location.reload()
        })
        window.addEventListener('online', () => { if (siteAccount.user) void refreshAccount() })
        if (siteAccount.user) await refreshAccount()
    })()
    return initialized
}

export async function sendCode(email: string) {
    await accountRequest('auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' })
}
export async function login(email: string, otp: string) {
    await accountRequest('auth/sign-in/email-otp', 'POST', { email, otp })
    const response = await accountRequest<AccountResponse>('account', 'GET', undefined, false)
    await applyAccount(response.user)
}
export async function logout() {
    if (siteAccount.user) {
        try { await accountRequest('auth/sign-out', 'POST', {}) } catch (error) {
            if (!(error instanceof AccountError) || error.code !== 'login_required') throw error
        }
    }
    await applyAccount()
}
export async function saveNickname(nickname: string) {
    const response = await accountRequest<AccountResponse>('account', 'PATCH', { nickname })
    await applyAccount(response.user)
}
export async function saveAvatar(blob?: Blob) {
    const response = await accountRequest<AccountResponse>('account/avatar', blob ? 'PUT' : 'DELETE', blob)
    await applyAccount(response.user)
}
