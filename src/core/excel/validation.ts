import type { ExcelLanguage } from './headers'

interface InputMessages {
    scoreTitle: string
    scoreError: string
    chainTitle: string
    chainError: string
    achievementTitle: string
    achievementError: string
    checkScore: string
}

export const inputMessages = {
    'zh-CN': {
        scoreTitle: '分数无效',
        scoreError: '请填写 0～1050000 的整数，未游玩时留空',
        chainTitle: 'Max Chain 无效',
        chainError: 'Max Chain 必须为 0～{max} 的整数，未知时留空',
        achievementTitle: '完成标记无效',
        achievementError: '达成时填写 √，未达成时留空',
        checkScore: '检查分数',
    },
    'zh-TW': {
        scoreTitle: '分數無效',
        scoreError: '請填寫 0～1050000 的整數，未遊玩時留空',
        chainTitle: 'Max Chain 無效',
        chainError: 'Max Chain 必須為 0～{max} 的整數，未知時留空',
        achievementTitle: '完成標記無效',
        achievementError: '達成時填寫 √，未達成時留空',
        checkScore: '檢查分數',
    },
    ja: {
        scoreTitle: 'スコアが無効です',
        scoreError: '0～1050000 の整数を入力してください。未プレイの場合は空欄にしてください',
        chainTitle: 'Max Chain が無効です',
        chainError: 'Max Chain は 0～{max} の整数を入力してください。不明な場合は空欄にしてください',
        achievementTitle: '達成マークが無効です',
        achievementError: '達成した場合は √ を入力し、未達成の場合は空欄にしてください',
        checkScore: 'スコアを確認',
    },
    en: {
        scoreTitle: 'Invalid score',
        scoreError: 'Enter an integer from 0 to 1050000. Leave blank if unplayed',
        chainTitle: 'Invalid Max Chain',
        chainError: 'Max Chain must be an integer from 0 to {max}. Leave blank if unknown',
        achievementTitle: 'Invalid achievement',
        achievementError: 'Enter √ if achieved. Otherwise, leave blank',
        checkScore: 'Check',
    },
} as const satisfies Record<ExcelLanguage, InputMessages>
