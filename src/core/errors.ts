export class DomainError extends Error {
    constructor(public code: string, public params: Record<string, string | number> = {}) {
        super(code)
        this.name = 'DomainError'
    }
}

export class AlbumError extends Error {
    constructor(public code: string, public retryAt = 0) {
        super(code)
        this.name = 'AlbumError'
    }
}
