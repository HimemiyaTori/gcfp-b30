export interface Env {
    ASSETS: { fetch(request: Request): Promise<Response> }
    API_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> }
    COOKIE_KEY?: string
    COOKIE_KEY_VERSION?: string
    NXAPI_CLIENT_ID?: string
    NXAPI_CLIENT_SECRET?: string
    NINTENDO_APP_VERSION?: string
    GCFP_APPLICATION_IDS?: string
    MEDIA_HOSTS?: string
    MEDIA_DIRECT?: string
    APP_ORIGIN?: string
}
export class ApiError extends Error {
    constructor(public code: string, public status = 400, public retryAfter?: number, public diagnostic?: { stage: string; upstreamStatus?: number; contentType?: string; upstreamError?: string; coralStatus?: number }) { super(code) }
}
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export function configured(env: Env) {
    return !!(env.COOKIE_KEY && env.NXAPI_CLIENT_ID?.trim() && env.GCFP_APPLICATION_IDS?.trim() && env.MEDIA_HOSTS?.trim())
}
export async function bytes(response: Response, max: number) {
    if (!response.body) throw new ApiError('empty_response', 502)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            length += value.length
            if (length > max) throw new ApiError('too_large', 413)
            chunks.push(value)
        }
    } finally { await reader.cancel().catch(() => {}) }
    const output = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
    return output
}
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError('invalid_request')
    try {
        const data: unknown = JSON.parse(new TextDecoder().decode(await bytes(new Response(request.body), 16384)))
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
        return data as Record<string, unknown>
    } catch { throw new ApiError('invalid_request') }
}
