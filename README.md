# Groove Archive · FP 成绩管理

一期核心功能已接入，并完成页面、弹窗与业务逻辑的结构整理。现有曲库为 124 首歌曲、992 张谱面，保留维护者提供的原始数据与稳定 ID。

## 运行

使用 Node.js 24.21.0，启用 Corepack 后：

```sh
corepack enable
yarn install
yarn dev
```

默认地址 http://127.0.0.1:5173 。验证命令：

```sh
yarn test
yarn build
```

## 当前功能

- 日／英标题、歌手及别名的 Fuse.js 搜索，按模式、难度和分类筛选。
- 从真实曲库选谱；新增、编辑、删除通过 Dexie 写入 IndexedDB，刷新保留，列表实时订阅变更。
- 编辑支持 Score、FC / AP 与可选 Max Chain；分数限制 0～1,050,000 整数，降分须显示曲名并勾选确认。重复手动新增提示使用编辑。
- 首页无成绩时隐藏 RT 和收录谱面数卡片；手机底栏隐藏成绩数量，图标与文字垂直居中。
- 仅修改、补录或清空 Max Chain 不改变成绩更新时间；修改 Score 或 FC / AP 才更新时间。
- Rank／Rating 自动计算，首页和 B30 页面使用实际成绩；BASIC 与 ADV 独立选取前 30 张谱面并计算 Groove Rating、Floor，支持模式卡片切换榜单。
- 曲库或计算规则版本变更时事务重算；失败保留数据及旧版本，提示重试。
- 浅色／深色／系统主题及日英元数据切换。UI 语言按钮保留预览选择：选择英语自动切换英文元数据，其他选项切换日文；实际 UI 仍为简体中文。
- 设置页可二次确认清空全部本地成绩，保留曲库与偏好。封面使用 coverSourceUrl，失败时显示占位图。新增弹窗的已选曲目可展开搜索，选中后自动收起。

支持完整 16:9 结算页和选曲页，在浏览器 Worker 内通过 PaddleOCR 识别，成功后直接入库。MISSION CLEAR（含 MISSON 拼写）、游玩中画面与未游玩占位跳过。图片仅在内存中处理，进行中的任务关闭或切页即取消；完成后保留空闲 Worker／模型供后续批次复用，切页不保留截图，应用卸载时释放模型；首次识别需联网下载模型。每批最多 30 张，每张不超过 20 MiB。FC／AP 和 Max Chain 随成绩保存，选曲页及手动新增可无 Max Chain。无云端、导入导出或备份恢复功能。成绩保存在当前浏览器，清除站点数据会删除成绩。

## 曲库维护

曲库位于 `src/data/songs.json`，模型及展示 helper 位于 `src/core/song/`，搜索位于 `src/core/search/`。Song ID 分配后不变，Chart ID 为 `{songId}-{mode}-{difficulty}`；不得因排序、改名或下架重新分配／删除 ID。分类字段使用 genre；英文缺失回退日文，演唱者与本地封面可选。

曲库变更须递增 `src/data/metadata.json` 的 songLibraryVersion；Rating 规则变更须递增 ratingRuleVersion。详细写入、搜索与更新规则见设计文档第 20 节。本次接入未逐首重新核验社区资料或下载封面。

## 验证范围

使用 fake-indexeddb 验证真实 Dexie schema 与事务，包括并发唯一性和重算回滚；Rank／Rating 测试覆盖边界。构建执行 vue-tsc。Edge 独立上下文已实测新增、刷新持久化、编辑锁谱、降分确认、重复新增和删除，并检查 390px 手机宽度布局。既有浏览器验收已由用户确认完成；本次重构执行针对性回归，不扩大兼容性承诺。

OCR 真实样本验证：将 21 张本地样本保留在 `src/data/test/{result,select,playing}`，启动 `yarn dev` 后运行 `yarn test:ocr`（默认系统 Edge）。逐图预期位于 `tests/ocr-samples.json`；15 张有效成绩、6 张跳过、批量去重为 11 条。模型和本地运行时为较大资源，首次加载可能较慢。实现范围及 ROI 见设计文档第 21 节。

## 模块结构

- `src/App.vue` 负责 hash 导航、唯一成绩订阅、共享 B30 模式和持久于切页过程的筛选条件
- `src/pages/` 包含 HomePage、ScoresPage、B30Page、SettingsPage，通过 props 和事件连接根部
- `src/components/app/` 包含导航、顶部栏、通知与共用外观按钮
- `src/components/dialogs/` 包含常驻的新增／编辑、OCR、删除及清空弹窗，各自维护操作状态
- `src/core/score/` 提供统一校验与筛选，`src/core/search/songText.ts` 提供共用曲名归一化；特殊别名只维护在曲库的 searchAliases
- 仓储提供 `addManual(songId, chartId, score, achievements?)` 和 `addOcr(songId, chartId, score, achievements?, signal?)`，前者返回 ID，后者返回 `{ id, skipped }`；`edit/list/remove/clear` 保留原职责

不引入 Pinia、后台队列、路由库或新的成绩缓存；数据库 schema、曲库和计算版本保持不变。

启动开发服务后运行 `yarn test:ui`，验证表单、更新时间、筛选保留、B30 稳定排序、语言联动、首页空状态及 390/680/681px 导航布局。`yarn test:ocr` 同时验证跨批次和跨页面空闲模型复用、进行中取消、初始化失败恢复及卸载释放。浏览器测试默认使用独立 Edge 上下文；可通过 `OCR_URL` 指定开发服务地址，通过 `OCR_BROWSER` 指定浏览器通道。

本次重构验证结果：33 项单元测试通过，生产构建通过；Edge 页面回归与 21 张真实 OCR 样本回归通过，包含超时后继续处理和旧完成回调不关闭新批次。

Windows 下先完成 `yarn build`，再启动 `yarn dev` 执行浏览器回归。dev/build 共用 `public/ocr` 资源准备脚本，同时执行可能因文件监听锁定而导致开发服务退出。
