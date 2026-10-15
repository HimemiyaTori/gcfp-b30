import { workbookBytes } from './template'

export async function downloadWorkbook(book: Parameters<typeof workbookBytes>[0], filename: string) {
    const blob = new Blob([await workbookBytes(book)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
}
