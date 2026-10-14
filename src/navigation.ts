import { LayoutGrid, ListMusic, Settings2, Trophy, UserCog } from 'lucide-vue-next'
// 纯前端构建没有账号功能，设置页保留原名称
const account = import.meta.env.VITE_SERVER === '1'
export const navigation = [
    { id: 'home', icon: LayoutGrid, label: 'nav.home', intro: 'app.intro.home' },
    { id: 'scores', icon: ListMusic, label: 'nav.scores', intro: 'app.intro.scores' },
    { id: 'b30', icon: Trophy, label: 'nav.b30', intro: 'app.intro.b30' },
    {
        id: 'settings',
        icon: account ? UserCog : Settings2,
        label: account ? 'nav.account' : 'nav.settings',
        intro: account ? 'app.intro.account' : 'app.intro.settings',
    },
] as const
export type Page = (typeof navigation)[number]['id']
