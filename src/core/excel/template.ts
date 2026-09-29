import ExcelJS from 'exceljs'
import type { ScoreRecord } from '../../db/models'
import { getSongTitle, songService } from '../song/songService'
import { getRankByScore, rankThresholds } from '../rating/rank'
import { getChartRating, ratingNodes } from '../rating/calculator'

export const MODE_SHEETS = ['BASIC', 'ADVANCED'] as const
export const TEMPLATE_HEADER_ROW = 5
export const TEMPLATE_HEADERS = ['曲绘', '曲名', '难度', '等级', 'Score', 'Rank', 'RT', 'FC', 'AP', 'Max Chain', '创建时间', '更新时间', 'Chart ID', 'Song ID']
const difficultyColors = {
    easy: ['FFDCFCE7', 'FF166534'], normal: ['FFFEF3C7', 'FF92400E'],
    hard: ['FFFEE2E2', 'FFB91C1C'], master: ['FFF3E8FF', 'FF7E22CE'],
} as const
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

export function scoreFormulas(row: number) {
    const score = `E${row}`, level = `D${row}`
    const guard = (formula: string) => `IF(${score}="","",IF(NOT(ISNUMBER(${score})),"检查分数",IF(OR(${score}<0,${score}>1050000,MOD(${score},1)<>0),"检查分数",${formula})))`
    const rank = rankThresholds.slice(0, -1).reduceRight((next, [minimum, label]) => `IF(${score}>=${minimum},"${label}",${next})`, '"E"')
    let rating = `${level}+2.5`
    for (let index = ratingNodes.length - 1; index > 0; index--) {
        const [end, endOffset] = ratingNodes[index]!
        const [start, startOffset] = ratingNodes[index - 1]!
        const width = end - start
        // 与业务算法共享节点，整数百分位插值后截断，避免小数边界误差
        const segment = `QUOTIENT(MAX(0,(${level}*100${startOffset < 0 ? '' : '+'}${startOffset})*${width}+(${score}-${start})*${endOffset - startOffset}),${width})/100`
        rating = `IF(${score}<${end},${segment},${rating})`
    }
    rating = `IF(${score}<=500000,0,IF(${score}<700000,QUOTIENT((${score}-500000)*MAX(0,${level}*100-350),200000)/100,${rating}))`
    return { rank: guard(rank), rating: guard(rating) }
}

export function createScoreWorkbook(records: ScoreRecord[] = [], language: 'ja' | 'en' = 'ja', _template = false): ExcelJS.Workbook {
    const book = new ExcelJS.Workbook()
    book.creator = 'Groove Archive'
    book.calcProperties.fullCalcOnLoad = true
    const byChart = new Map(records.map(record => [record.chartId, record]))
    for (const mode of MODE_SHEETS) {
        const sheet = book.addWorksheet(mode, { properties: { tabColor: { argb: mode === 'BASIC' ? 'FF19CBEA' : 'FFF15BB5' } } })
        sheet.columns = [15, 42, 14, 9, 16, 12, 12, 10, 10, 16, 28, 28, 32, 12].map((width, index) => ({ width, hidden: index >= 10 }))
        sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: TEMPLATE_HEADER_ROW, topLeftCell: 'C6', activeCell: 'E6', showGridLines: false, zoomScale: 90 }]
        sheet.mergeCells('A1:J1')
        sheet.getCell('A1').value = `${mode} · FP 成绩记录`
        sheet.getCell('A1').font = { name: '微软雅黑', size: 18, bold: true, color: { argb: 'FF172039' } }
        sheet.getRow(1).height = 38
        sheet.mergeCells('A2:J2')
        sheet.getCell('A2').value = '填写浅黄色单元格：Score、FC、AP、Max Chain。Score 留空不导入，0 分会导入。'
        sheet.mergeCells('A3:J3')
        sheet.getCell('A3').value = 'Rank / RT 自动计算；FC / AP 填“是 / 否”，未知留空。时间与谱面 ID 已隐藏，请勿删除。'
        for (const row of [2, 3]) {
            sheet.getRow(row).height = 26
            sheet.getCell(`A${row}`).font = { name: '微软雅黑', size: 10, color: { argb: 'FF53627A' } }
        }
        sheet.getRow(4).height = 10
        sheet.getRow(TEMPLATE_HEADER_ROW).values = TEMPLATE_HEADERS
        sheet.getRow(TEMPLATE_HEADER_ROW).height = 28
        sheet.getRow(TEMPLATE_HEADER_ROW).eachCell(cell => {
            cell.fill = fill('FF24334D')
            cell.font = { name: '微软雅黑', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
        })
        for (const [songIndex, song] of songService.songs.entries()) {
            const charts = song.charts.filter(chart => chart.mode.toUpperCase() === mode)
            if (!charts.length) continue
            const first = sheet.rowCount + 1
            for (const chart of charts) {
                const record = byChart.get(chart.id)
                const row = sheet.addRow([
                    '♪', getSongTitle(song, language), chart.difficulty.toUpperCase(), chart.level, record?.score ?? null, null, null,
                    record?.fc === undefined ? null : record.fc ? '是' : '否', record?.ap === undefined ? null : record.ap ? '是' : '否', record?.maxChain ?? null,
                    record ? new Date(record.createdAt).toISOString() : null, record ? new Date(record.updatedAt).toISOString() : null, chart.id, song.id,
                ])
                row.height = 28
                for (let column = 1; column <= TEMPLATE_HEADERS.length; column++) {
                    const cell = row.getCell(column)
                    cell.font = { name: '微软雅黑', size: 11, color: { argb: 'FF24334D' } }
                    cell.alignment = { vertical: 'middle', horizontal: [4, 5, 7, 10].includes(column) ? 'right' : 'center' }
                    cell.fill = fill(songIndex % 2 ? 'FFF1F5F9' : 'FFFFFFFF')
                    if ([5, 8, 9, 10].includes(column)) cell.fill = fill('FFFFF7DF')
                    if ([6, 7].includes(column)) cell.fill = fill('FFEAF4FA')
                    if (row.number === first) cell.border = { top: { style: 'thin', color: { argb: 'FFCDD9E5' } } }
                }
                row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
                row.getCell(2).font = { name: '微软雅黑', size: 11, bold: true, color: { argb: 'FF24334D' } }
                const colors = difficultyColors[chart.difficulty]
                row.getCell(3).fill = fill(colors[0])
                row.getCell(3).font = { name: '微软雅黑', size: 10, bold: true, color: { argb: colors[1] } }
                row.getCell(4).numFmt = Number.isInteger(chart.level) ? '0' : `"${Math.floor(chart.level)}+"`
                row.getCell(5).numFmt = '#,##0'
                row.getCell(7).numFmt = '0.00'
                row.getCell(10).numFmt = '0'
                const formulas = scoreFormulas(row.number)
                row.getCell(6).value = { formula: formulas.rank, result: record ? getRankByScore(record.score) : '' }
                row.getCell(7).value = { formula: formulas.rating, result: record ? getChartRating(record.score, chart.level) : '' }
                row.getCell(5).dataValidation = { type: 'whole', operator: 'between', allowBlank: true, formulae: [0, 1050000], showErrorMessage: true, errorStyle: 'stop', errorTitle: '分数无效', error: '请填写 0～1050000 的整数，未游玩时留空' }
                row.getCell(10).dataValidation = { type: 'whole', operator: 'between', allowBlank: true, formulae: [0, Number.MAX_SAFE_INTEGER], showErrorMessage: true, errorStyle: 'stop', error: '请填写非负整数，未知时留空' }
                for (const column of [8, 9]) row.getCell(column).dataValidation = { type: 'list', allowBlank: true, formulae: ['"是,否"'], showErrorMessage: true, errorStyle: 'stop', error: '请选择是或否，未知时留空' }
            }
            if (charts.length > 1) {
                sheet.mergeCells(first, 1, sheet.rowCount, 1)
                sheet.mergeCells(first, 2, sheet.rowCount, 2)
            }
            sheet.getCell(first, 1).font = { name: 'Arial', size: 26, color: { argb: 'FF8B9CB5' } }
        }
        sheet.addConditionalFormatting({ ref: `E6:E${sheet.rowCount}`, rules: [{ type: 'expression', priority: 1, formulae: ['AND(E6<>"",OR(NOT(ISNUMBER(E6)),E6<0,E6>1050000,MOD(E6,1)<>0))'], style: { fill: fill('FFFEE2E2'), font: { color: { argb: 'FFB91C1C' } } } } ] })
        sheet.addConditionalFormatting({ ref: `H6:I${sheet.rowCount}`, rules: [{ type: 'expression', priority: 2, formulae: ['AND($H6="否",$I6="是")'], style: { fill: fill('FFFEE2E2'), font: { color: { argb: 'FFB91C1C' } } } } ] })
    }
    return book
}

export async function workbookBytes(book: ExcelJS.Workbook): Promise<ArrayBuffer> {
    const data = await book.xlsx.writeBuffer()
    return Uint8Array.from(new Uint8Array(data)).buffer
}


