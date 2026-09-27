import { LayoutGrid, ListMusic, Settings2, Trophy } from 'lucide-vue-next'
export const navigation = [
    { id: 'home', icon: LayoutGrid },
    { id: 'scores', icon: ListMusic },
    { id: 'b30', icon: Trophy },
    { id: 'settings', icon: Settings2 },
] as const
export type Page = (typeof navigation)[number]['id']
