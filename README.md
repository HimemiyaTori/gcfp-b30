# Groove Archive · FP 成绩管理

一期已完成验收，二期已接入 Excel 导入、导出与模板下载。现有曲库为 124 首歌曲、992 张谱面，保留维护者提供的原始数据与稳定 ID。

后续开发以 [二期设计文档](docs/FP_B30_二期设计文档.md) 为主；共同业务规则和已完成的验收记录见 [一期设计与验收归档](docs/FP_B30_一期设计文档.md)。

账号登录、多设备同步与 Nintendo 相册自动录入的后续方案见 [三期设计文档](docs/FP_B30_三期设计文档.md)：采用访问时触发，由前端读取相册、下载截图并执行 OCR，后端负责账号、认证及成绩同步。当前处于设计阶段，浏览器直连条件待验证，尚未实现。

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
- 设置页可二次确认清空全部本地成绩，保留曲库与偏好。封面统一由 coverSourceUrl 生成同源缩略图，缺失时回退来源原图，再失败显示占位图。新增弹窗的已选曲目可展开搜索，选中后自动收起。
- 设置页支持下载 Excel 导入模板、导出全部成绩、预览后批量导入；导入保留高分，同分仅补未知信息，错误行阻止整批写入。

支持完整 16:9 结算页和选曲页，在浏览器 Worker 内通过 PaddleOCR 识别，成功后直接入库。MISSION CLEAR（含 MISSON 拼写）、游玩中画面与未游玩占位跳过。图片仅在内存中处理，进行中的任务关闭或切页即取消；完成后保留空闲 Worker／模型供后续批次复用，切页不保留截图，应用卸载时释放模型；首次识别需联网下载模型。每批最多 30 张，每张不超过 20 MiB。FC／AP 和 Max Chain 随成绩保存，选曲页及手动新增可无 Max Chain。无云端同步，支持 Excel 成绩导入导出。成绩保存在当前浏览器，清除站点数据会删除成绩。

## 曲库维护

曲库位于 `src/data/songs.json`，模型及展示 helper 位于 `src/core/song/`，搜索位于 `src/core/search/`。Song ID 分配后不变，Chart ID 为 `{songId}-{mode}-{difficulty}`；不得因排序、改名或下架重新分配／删除 ID。分类字段使用 genre；英文缺失回退日文，演唱者可选。封面只维护 coverSourceUrl，不再保存本地封面路径。

曲库变更须递增 `src/data/metadata.json` 的 songLibraryVersion；Rating 规则变更须递增 ratingRuleVersion。详细写入、搜索与更新规则见一期设计文档第 20 节。本次接入未逐首重新核验社区资料。

`yarn dev` / `yarn build` 会先运行 `scripts/prepare-covers.mjs`：按 coverSourceUrl 下载曲绘，用 sharp 生成 128px JPEG 缩略图到 `public/covers/`（不提交），文件名为来源地址哈希，同图多曲只生成一份；已存在的文件跳过，曲库移除的文件自动清理。下载失败只警告，不阻止构建。成绩列表与 Excel 导出共用这批缩略图。

## 验证范围

使用 fake-indexeddb 验证真实 Dexie schema 与事务，包括并发唯一性和重算回滚；Rank／Rating 测试覆盖边界。构建执行 vue-tsc。Edge 独立上下文已实测新增、刷新持久化、编辑锁谱、降分确认、重复新增和删除，并检查 390px 手机宽度布局。既有浏览器验收已由用户确认完成；本次重构执行针对性回归，不扩大兼容性承诺。

OCR 真实样本验证：将 21 张本地样本保留在 `src/data/test/{result,select,playing}`，启动 `yarn dev` 后运行 `yarn test:ocr`（默认系统 Edge）。逐图预期位于 `tests/ocr-samples.json`；15 张有效成绩、6 张跳过、批量去重为 11 条。模型和本地运行时为较大资源，首次加载可能较慢。实现范围及 ROI 见一期设计文档第 21 节。

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


## Excel 使用与验证

打开「偏好设置 → 本地数据」，下载导入模板。BASIC / ADVANCED 两张表已包含当前曲库的全部歌曲、谱面与曲绘，直接在黄色区域填写 Score；FC、AP、Max Chain 可选，未知时留空。Rank / RT 随 Score 自动计算。未填 Score 的谱面不导入，0 分正常导入。时间及 ID 列默认隐藏，请保留以便读取。

首页上传区也可选择或拖入单个 Excel，先检查并预览，再确认导入；截图继续走 OCR，Excel 与截图需分别上传。仅支持 .xlsx，最大 5 MiB，每张表最多 5000 行数据，只读取 BASIC / ADVANCED 表，不兼容旧版「成绩」表。

可以删除未游玩行、标题说明、参考列、可选字段，或删除／清空其中一张表。请保留 Score、Chart ID 表头及对应谱面 ID；Song ID 删除或留空时可自动恢复。错误提示工作表与行号，修正后重新选择文件。低分跳过，同分只补未知信息，任何写入失败整批回滚。导出保留完成信息和时间，可重新导入；不包含截图、偏好或历史记录。曲绘加载失败显示音符占位，下载仍会完成。

启动开发服务后运行 `yarn test:excel`，覆盖真实下载、上传、取消、错误行阻止提交、重复导入、刷新持久化、独立浏览器恢复和 390px 手机布局。下载文件存放于系统临时目录，避免 Windows 开发服务监听下载中的文件导致 EBUSY；页面截图存放于 `.preview/`。

`yarn test:excel` 另覆盖删减模板、首页选择／拖入 Excel、混选提示与截图分流。`yarn test:covers` 验证两张表的图片嵌入、缺图占位、失败重试和重复下载的会话缓存。模板公式另已通过 Excel 原生重算的 392 个边界及非法输入用例，最新单元测试共 48 项通过。
