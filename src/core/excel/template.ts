import ExcelJS from 'exceljs'
import type { ScoreRecord } from '../../db/models'
import { getSongTitle, songService } from '../song/songService'
import { getRankByScore, rankThresholds } from '../rating/rank'
import { getChartRating, ratingNodes } from '../rating/calculator'
import { TEMPLATE_HEADERS, localizedHeaders, type ExcelLanguage } from './headers'
import { inputMessages, MAX_CHAIN } from './validation'

export const MODE_SHEETS = ['BASIC', 'ADVANCED'] as const
export const TEMPLATE_HEADER_ROW = 1
export { TEMPLATE_HEADERS } from './headers'
const difficultyColors = {
    easy: ['FFDCFCE7', 'FF166534'],
    normal: ['FFFEF3C7', 'FF92400E'],
    hard: ['FFFEE2E2', 'FFB91C1C'],
    master: ['FFF3E8FF', 'FF7E22CE'],
} as const
const fill = (argb: string): ExcelJS.Fill => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
})

export function scoreFormulas(row: number, uiLanguage: ExcelLanguage = 'zh-CN') {
    const score = `E${row}`,
        level = `D${row}`
    const checkScore = inputMessages[uiLanguage].checkScore
    const guard = (formula: string) =>
        `IF(${score}="","",IF(NOT(ISNUMBER(${score})),"${checkScore}",IF(OR(${score}<0,${score}>1050000,MOD(${score},1)<>0),"${checkScore}",${formula})))`
    const rank = rankThresholds
        .slice(0, -1)
        .reduceRight(
            (next, [minimum, label]) =>
                `IF(${score}>=${minimum},"${label}",${next})`,
            '"E"',
        )
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

export function createScoreWorkbook(
    records: ScoreRecord[] = [],
    language: 'ja' | 'en' = 'ja',
    _template = false,
    uiLanguage: ExcelLanguage = 'zh-CN',
): ExcelJS.Workbook {
    const book = new ExcelJS.Workbook()
    book.creator = 'Groove Archive'
    book.calcProperties.fullCalcOnLoad = true
    const byChart = new Map(records.map((record) => [record.chartId, record]))
    const messages = inputMessages[uiLanguage]
    for (const mode of MODE_SHEETS) {
        const sheet = book.addWorksheet(mode, {
            properties: {
                tabColor: { argb: mode === 'BASIC' ? 'FF19CBEA' : 'FFF15BB5' },
            },
        })
        sheet.columns = [
            15, 42, 14, 9, 16, 16, 16, 10, 10, 16, 28, 32, 12,
        ].map((width, index) => ({ width, hidden: index >= 10 }))
        sheet.views = [
            {
                state: 'frozen',
                xSplit: 2,
                ySplit: TEMPLATE_HEADER_ROW,
                topLeftCell: 'C2',
                activeCell: 'E2',
                showGridLines: false,
                zoomScale: 90,
            },
        ]
        sheet.getRow(TEMPLATE_HEADER_ROW).values = [...localizedHeaders[uiLanguage]]
        sheet.getRow(TEMPLATE_HEADER_ROW).height = 28
        sheet.getRow(TEMPLATE_HEADER_ROW).eachCell((cell) => {
            cell.fill = fill('FF24334D')
            cell.font = {
                name: '微软雅黑',
                size: 11,
                bold: true,
                color: { argb: 'FFFFFFFF' },
            }
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
        })
        for (const [songIndex, song] of songService.songs.entries()) {
            const charts = song.charts.filter(
                (chart) => chart.mode.toUpperCase() === mode,
            )
            if (!charts.length) continue
            const first = sheet.rowCount + 1
            for (const chart of charts) {
                const record = byChart.get(chart.id)
                const row = sheet.addRow([
                    '♪',
                    getSongTitle(song, language),
                    chart.difficulty.toUpperCase(),
                    chart.level,
                    record?.score ?? null,
                    null,
                    null,
                    record?.fc ? '√' : null,
                    record?.ap ? '√' : null,
                    record?.maxChain ?? null,
                    record ? new Date(record.updatedAt).toISOString() : null,
                    chart.id,
                    song.id,
                ])
                row.height = 28
                for (
                    let column = 1;
                    column <= TEMPLATE_HEADERS.length;
                    column++
                ) {
                    const cell = row.getCell(column)
                    cell.font = {
                        name: '微软雅黑',
                        size: 11,
                        color: { argb: 'FF24334D' },
                    }
                    cell.alignment = {
                        vertical: 'middle',
                        horizontal: [5, 7, 10].includes(column)
                            ? 'right'
                            : 'center',
                    }
                    cell.fill = fill(songIndex % 2 ? 'FFF1F5F9' : 'FFFFFFFF')
                    if ([5, 8, 9, 10].includes(column))
                        cell.fill = fill('FFFFF7DF')
                    if ([6, 7].includes(column)) cell.fill = fill('FFEAF4FA')
                    if (row.number === first)
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFCDD9E5' } },
                        }
                }
                row.getCell(2).alignment = {
                    vertical: 'middle',
                    horizontal: 'left',
                    wrapText: true,
                }
                row.getCell(2).font = {
                    name: '微软雅黑',
                    size: 11,
                    bold: true,
                    color: { argb: 'FF24334D' },
                }
                const colors = difficultyColors[chart.difficulty]
                row.getCell(3).fill = fill(colors[0])
                row.getCell(3).font = {
                    name: '微软雅黑',
                    size: 10,
                    bold: true,
                    color: { argb: colors[1] },
                }
                row.getCell(4).numFmt = Number.isInteger(chart.level)
                    ? '0'
                    : `"${Math.floor(chart.level)}+"`
                row.getCell(5).numFmt = '#,##0'
                row.getCell(7).numFmt = '0.00'
                row.getCell(10).numFmt = '0'
                const formulas = scoreFormulas(row.number, uiLanguage)
                row.getCell(6).value = {
                    formula: formulas.rank,
                    result: record ? getRankByScore(record.score) : '',
                }
                row.getCell(7).value = {
                    formula: formulas.rating,
                    result: record
                        ? getChartRating(record.score, chart.level)
                        : '',
                }
                row.getCell(5).dataValidation = {
                    type: 'whole',
                    operator: 'between',
                    allowBlank: true,
                    formulae: [0, 1050000],
                    showErrorMessage: true,
                    errorStyle: 'stop',
                    errorTitle: messages.scoreTitle,
                    error: messages.scoreError,
                }
                row.getCell(10).dataValidation = {
                    type: 'whole',
                    operator: 'between',
                    allowBlank: true,
                    formulae: [0, MAX_CHAIN],
                    showErrorMessage: true,
                    errorStyle: 'stop',
                    errorTitle: messages.chainTitle,
                    error: messages.chainError,
                }
                for (const column of [8, 9])
                    row.getCell(column).dataValidation = {
                        type: 'list',
                        allowBlank: true,
                        formulae: ['"√"'],
                        showErrorMessage: true,
                        errorStyle: 'stop',
                        errorTitle: messages.achievementTitle,
                        error: messages.achievementError,
                    }
            }
            if (charts.length > 1) {
                sheet.mergeCells(first, 1, sheet.rowCount, 1)
                sheet.mergeCells(first, 2, sheet.rowCount, 2)
            }
            sheet.getCell(first, 1).font = {
                name: 'Arial',
                size: 26,
                color: { argb: 'FF8B9CB5' },
            }
        }
        sheet.addConditionalFormatting({
            ref: `E2:E${sheet.rowCount}`,
            rules: [
                {
                    type: 'expression',
                    priority: 1,
                    formulae: [
                        'AND(E2<>"",OR(NOT(ISNUMBER(E2)),E2<0,E2>1050000,MOD(E2,1)<>0))',
                    ],
                    style: {
                        fill: fill('FFFEE2E2'),
                        font: { color: { argb: 'FFB91C1C' } },
                    },
                },
            ],
        })
        sheet.addConditionalFormatting({
            ref: `H2:I${sheet.rowCount}`,
            rules: [
                {
                    type: 'expression',
                    priority: 2,
                    formulae: ['AND($H2<>"√",$I2="√")'],
                    style: {
                        fill: fill('FFFEE2E2'),
                        font: { color: { argb: 'FFB91C1C' } },
                    },
                },
            ],
        })
    }
    return book
}

export async function workbookBytes(
    book: ExcelJS.Workbook,
): Promise<ArrayBuffer> {
    const data = await book.xlsx.writeBuffer()
    return Uint8Array.from(new Uint8Array(data)).buffer
}
