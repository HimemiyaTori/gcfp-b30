export function localDay(time: number) {
    const date = new Date(time)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dayDate(day: string) {
    const [year, month, date] = day.split('-').map(Number)
    return new Date(year!, month! - 1, date!)
}
