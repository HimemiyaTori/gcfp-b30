import type { ImportedScore } from '../score/import'

export const MAX_EXCEL_BYTES = 5 * 1024 * 1024
export const MAX_EXCEL_ROWS = 5000
export const MAX_HEADER_ROWS = 10

export interface ExcelIssue {
    sheet: string
    row: number
    message: string
}
export interface ExcelPreview {
    rows: ImportedScore[]
    issues: ExcelIssue[]
    empty: number
}
