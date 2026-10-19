import { localDay } from './rating/calendar'

type DatePrecision = 'day' | 'month' | 'year'
type DateTimeOptions = Pick<Intl.DateTimeFormatOptions, 'dateStyle' | 'timeStyle' | 'hour12'>

export function formatDisplayDate(time: number, language: string, precision: DatePrecision = 'day') {
    if (language === 'en') {
        return localDay(time).slice(0, precision === 'day' ? 10 : precision === 'month' ? 7 : 4)
    }
    return new Intl.DateTimeFormat(language, {
        year: 'numeric',
        ...(precision !== 'year' ? { month: 'numeric' } : {}),
        ...(precision === 'day' ? { day: 'numeric' } : {}),
    }).format(time)
}

export function formatDisplayDateTime(time: number, language: string, options: DateTimeOptions = {}) {
    const date = new Date(time)
    if (language !== 'en') return date.toLocaleString(language, options)
    const timeOptions: Intl.DateTimeFormatOptions = options.timeStyle
        ? { timeStyle: options.timeStyle, hour12: options.hour12 }
        : { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: options.hour12 }
    return `${formatDisplayDate(time, language)} ${date.toLocaleTimeString(language, timeOptions)}`
}
