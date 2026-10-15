// 识别弹窗里的缩小预览，随最近一次识别结果保存在本地

const PREVIEW_EDGE = 960

export async function createPreview(source: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(source)
    try {
        const scale = Math.min(1, PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height))
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('preview')
        context.drawImage(bitmap, 0, 0, width, height)
        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (result) => (result ? resolve(result) : reject(new Error('preview'))),
                'image/jpeg',
                0.82,
            )
        })
    } finally {
        bitmap.close()
    }
}

export function releasePreviews(jobs: { preview?: string }[]) {
    for (const job of jobs) {
        if (!job.preview) continue
        URL.revokeObjectURL(job.preview)
        job.preview = undefined
    }
}
