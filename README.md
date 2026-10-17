# Groove Archive · FP 成绩管理

一期已完成验收，二期已接入 Excel、B30 成绩图、历史成绩与 Rating 趋势、曲库查询及多语言界面。现有曲库为 124 首歌曲、992 张谱面，保留维护者提供的原始数据与稳定 ID。

后续开发以 [二期设计文档](docs/FP_B30_二期设计文档.md) 为主；共同业务规则和已完成的验收记录见 [一期设计与验收归档](docs/FP_B30_一期设计文档.md)。

Nintendo 相册方案见 [三期设计文档](docs/FP_B30_三期设计文档.md)。Cloudflare 版通过同源 Worker 绑定 Nintendo 账号、读取相册，前端 OCR 识别后直接录入；用户于 2026-10-17 确认 3A、3B 实际使用正常。首页截图与相册识别统一由 Pinia 管理，支持切页后后台处理、右下角进度提示及重新打开识别弹窗。3C 站内账号、多设备同步未开放。默认构建保持纯前端，设置页仍为「偏好设置」。

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
- 从真实曲库选谱；新增、编辑及历史删除通过 Dexie 写入 IndexedDB，刷新保留，列表实时订阅变更。
- 编辑支持 Score、FC / AP 与可选 Max Chain；分数限制 0～1,050,000 整数，降分须显示曲名并勾选确认。重复手动新增提示使用编辑。
- 首页无成绩时隐藏 RT 和收录谱面数卡片；手机底栏隐藏成绩数量，图标与文字垂直居中。
- 手动编辑修正关联历史，保留导入时间并更新成绩更新时间；只重选相关谱面的最佳成绩，Rating 变化记在今天。
- Rank／Rating 自动计算，首页和 B30 页面使用实际成绩；BASIC 与 ADV 独立选取前 30 张谱面并计算 Groove Rating、Floor，支持模式卡片切换榜单。
- 曲库或计算规则版本变更时事务重算；失败保留数据及旧版本，提示重试。
- 浅色／深色／系统主题及日英元数据切换。界面支持简体中文、繁体中文、日文和英文：首次访问按浏览器语言匹配，无法匹配时使用简体中文；手动选择后保存在本机。切换界面语言时，英语联动英文元数据，其他语言联动日文；之后单独切换的曲目信息语言同样保存，刷新后不被界面语言覆盖。
- 设置页可二次确认清空全部本地成绩、历史及趋势，保留曲库与偏好。封面统一由 coverSourceUrl 生成同源缩略图，缺失时回退来源原图，再失败显示占位图。新增弹窗的已选曲目可展开搜索，选中后自动收起。
- 设置页支持下载 Excel 导入模板、导出全部成绩、预览后批量导入；Excel 每谱面取文件最高分，同分按更新时间和行序选择；历史去重后保存，当前最佳保留高分，错误行阻止整批写入。

支持完整 16:9 结算页和选曲页，在浏览器 Worker 内通过 PaddleOCR 识别，成功后直接入库。MISSION CLEAR（含 MISSON 拼写）、游玩中画面与未游玩占位跳过。首页与相册共用串行 OCR 模型；关闭识别弹窗或切页后继续处理，右下角提示可重新打开弹窗，明确取消才停止批次。相册读取、截图下载或任一识别任务进行中，首页录入区改为「查看详情」，暂停选择、拖入截图和 Excel；点击打开对应任务，结束或取消后恢复录入。原图只在当前页面会话内处理，缩略图和最近一次结果保存在本机；刷新或关闭网页会停止任务，相册未完成项下次更新恢复，首页未完成图片需重新上传。完成后复用空闲 Worker／模型；首次识别需联网下载模型。首页每批最多 60 张，每张不超过 20 MiB。FC／AP 和 Max Chain 随成绩保存，选曲页及手动新增可无 Max Chain。无云端同步，支持 Excel 成绩导入导出。成绩保存在当前浏览器，清除站点数据会删除成绩。

## 曲库维护

曲库位于 `src/data/songs.json`，模型及展示 helper 位于 `src/core/song/`，搜索位于 `src/core/search/`。Song ID 分配后不变，Chart ID 为 `{songId}-{mode}-{difficulty}`；不得因排序、改名或下架重新分配／删除 ID。分类字段使用 genre；英文缺失回退日文，歌手可选。封面只维护 coverSourceUrl，不再保存本地封面路径。

曲库变更须递增 `src/data/metadata.json` 的 songLibraryVersion；Rating 规则变更须递增 ratingRuleVersion。详细写入、搜索与更新规则见一期设计文档第 20 节。本次接入未逐首重新核验社区资料。

`yarn dev` / `yarn build` 会先运行 `scripts/prepare-covers.mjs`：按 coverSourceUrl 下载曲绘，用 sharp 生成 128px JPEG 缩略图到 `public/covers/`（不提交），文件名为来源地址哈希，同图多曲只生成一份；已存在的文件跳过，曲库移除的文件自动清理。下载失败只警告，不阻止构建。成绩列表与 Excel 导出共用这批缩略图。

## 验证范围

测试围绕用户操作、真实文件和资源交互；内部计算、解析和状态逻辑通过代码审查检查。`yarn test` 只运行 6 项 XLSX 文件验收，包含模板生成、双模式文件往返、删减及重排模板、错误文件和输入单元格、文件及行列限制，不维护数字、布尔值和日期的解析边界枚举。`yarn build` 执行 Vue／TypeScript 检查及生产构建。

OCR 真实样本验证以 `tests/ocr-samples.json` 的逐张标注为准，当前有 22 张：result 11 张、select 8 张、playing 3 张，默认位于 `tests/score images/{result,select,playing}`，也可设置 `OCR_SAMPLES_DIR` 指向包含这三个子目录的样本目录。启动 `yarn dev:local` 后运行 `yarn test:ocr`（默认系统 Edge）。通过页面实际上传，检查 16 张有效成绩、6 张跳过及批量处理后的 12 条谱面最佳成绩；脚本额外追加首张重复截图，共上传 23 张，验证不相邻去重。样本数量和成绩预期从清单生成，缺少图片会在启动浏览器前列出缺失文件。模型和本地运行时为较大资源，首次加载可能较慢。实现范围及 ROI 见一期设计文档第 21 节。

## 模块结构

- `src/App.vue` 负责 hash 导航、唯一成绩订阅、共享 B30 模式和持久于切页过程的筛选条件
- `src/pages/` 包含 HomePage、ScoresPage、B30Page、SettingsPage，通过 props 和事件连接根部
- `src/components/app/` 包含导航、顶部栏、通知与共用外观按钮
- `src/components/dialogs/` 包含常驻的新增／编辑、OCR、删除及清空弹窗，各自维护操作状态
- `src/stores/recognition.ts` 统一管理首页与相册批次、进度和结果；`src/components/recognition/` 共用识别弹窗与右下角提示
- `src/core/ocr/importer.ts` 运行首页上传任务，`src/core/album/controller.ts` 负责相册下载、去重与恢复，二者共用 `src/core/ocr/shared.ts` 的串行识别引擎
- `src/core/score/` 提供统一校验与筛选，`src/core/search/songText.ts` 提供共用曲名归一化；特殊别名只维护在曲库的 searchAliases
- 仓储提供 `addManual(songId, chartId, score, achievements?)` 和 `addOcr(songId, chartId, score, achievements?, signal?, datasetEpoch?)`，前者返回 ID，后者返回 `{ id, skipped }`；后台 OCR 入库时校验数据代次，`edit/list/remove/clear` 保留原职责

Pinia 保存当前页面会话内的识别状态，成绩和相册恢复记录继续由 Dexie／IndexedDB 持久化；服务器后台队列和路由库未引入。数据库 groove-archive-fp-history 当前为 schema 6，历史为成绩事实来源，当前最佳可重建，过去日期的 Rating 快照固定保存。schema 6 将旧快照按本地日期保留每天最后一条，增加唯一 day 索引与 chartId + playedAt 历史索引；schema 5 为相册计数和重试查询增加索引，schema 4 增加 songId + playedAt。历史非时间排序在当前视图内复用匹配数据和排序结果，翻页只截取结果，关闭或切回时间排序时释放。

启动 `yarn dev:local` 后运行 `yarn test:ui`，验证手动表单、AP 联动 FC、空 Max Chain、更新时间、分页与跨页筛选保留、界面语言切换、浏览器语言匹配、语言偏好刷新后保留、首页空状态及 390px 布局。历史删除和清空集中在 `yarn test:history` 验收。浏览器测试固定以简体中文环境启动。`yarn test:ocr` 同时验证重复上传、后台识别与切页后重新打开进度、进行中取消，以及模拟初始化失败和超时后的恢复。服务端构建下的 `yarn test:recognition` 验收两个来源同时运行、各自取消和重新打开、任务期间首页禁用上传并切换详情入口及跨标签页清空拦截。浏览器测试默认使用独立 Edge 上下文；可通过 `OCR_URL` 指定开发服务地址，通过 `OCR_BROWSER` 指定浏览器通道。

验收脚本允许直接准备样本数据和读取实际操作结果；被测的录入、导入、删除和下载通过页面执行。不再维护计算边界、模拟数据库、Worker 数量或生命周期计数等内部验证，也不绑定无明确要求的像素位置和 CSS 实现。B30、头像展示、部署模式和旧数据库迁移的自动化验收已移除。历史验收结果保留在设计文档中，不代表当前测试范围。

Windows 下先完成 `yarn build`，再启动 `yarn dev:local` 执行普通浏览器回归。dev/build 共用 `public/ocr` 资源准备脚本，同时执行可能因文件监听锁定而导致开发服务退出。

Excel 的读取位于 `src/core/excel/reader.ts`，生成位于 `template.ts`，浏览器下载位于 `download.ts`；表头、文件限制和预览模型单独共享，导入不加载 ExcelJS，导出不加载 SheetJS。OCR 任务模型位于 `src/core/ocr/models.ts`，仓储不反向依赖 composable；相册请求和任务错误通过稳定错误码判断，展示时翻译。生产构建中的 OCR Worker 与 WASM 统一输出到 `ocr/`，与资源准备脚本共用地址，避免重复发布。

启动 `yarn dev:local` 后运行 `yarn test:limits`，通过真实表单、下载与重新上传验收谱面上限、2000 兜底、超限阻止写入、旧数据库升级与刷新持久化；超过 2000 的谱面总连击数由真实 XLSX 文件验收覆盖。

## Excel 使用与验证

打开「偏好设置 → 本地数据」，下载模板。BASIC / ADVANCED 两张表已包含当前曲库的全部歌曲、谱面与曲绘，第一行即表头，随当前界面语言使用简体中文、繁体中文、日文或英文；中文和英文使用「Rating」表头，日语使用「レーティング」，Max Chain 在所有语言中保留英文。Level 列居中，Rank、Rating 两列与分数列等宽。直接在黄色区域填写分数；FC / AP 达成时填写或下拉选择「√」，默认留空表示未达成；Max Chain 为 0～谱面总连击数（combo）的整数，缺少该资料时以 2000 兜底，未知时留空；总连击数超过 2000 的谱面按实际值限制。手动新增、编辑、OCR、相册和 Excel 共用此规则，模板每行也设置对应上限。既有超限历史保留原值，编辑时须修正，避免新规则阻断成绩库读取或其他成绩录入。Rank / Rating 随分数自动计算。Excel 中的输入报错标题、正文及公式错误提示随表头语言本地化；分数无效时分别显示「检查分数」「檢查分數」「スコアを確認」或「Check」。未填分数的谱面不导入，0 分正常导入。时间及 ID 列默认隐藏，请保留以便读取。

首页上传区也可选择或拖入单个 Excel，先检查并预览，再确认导入；截图继续走 OCR，Excel 与截图需分别上传。仅支持 .xlsx，最大 5 MB，每张表最多 5000 行数据，只读取 BASIC / ADVANCED 表，不兼容旧版「成绩」表。

可以删除未游玩行、参考列、可选字段，或删除／清空其中一张表。请保留分数、谱面 ID 表头（英文为 Score、Chart ID）及对应谱面 ID；曲目 ID（Song ID）删除或留空时可自动恢复。不同表头语言均可重新导入，也兼容带有前置说明行的旧模板。错误提示工作表与行号，修正后重新选择文件。文件内每谱面仅取最高分，去重后保存历史；即使低于数据库最佳也可记入历史，任何写入失败整批回滚。导出保留完成信息和时间，可重新导入；不包含截图、偏好或历史记录。曲绘加载失败显示音符占位，下载仍会完成。

启动开发服务后运行 `yarn test:excel`，覆盖真实下载、上传、取消、错误行阻止提交、重复导入、刷新持久化、独立浏览器恢复和 390px 手机布局。下载文件存放于系统临时目录，避免 Windows 开发服务监听下载中的文件导致 EBUSY；页面截图存放于 `.preview/`。

`yarn test:excel` 另覆盖首行多语言表头、FC / AP 的 √ 与留空、跨语言导入、删减模板、首页选择／拖入 Excel、混选提示与截图分流。中文主流程下载模板和成绩，繁体中文、日文、英文各下载一份成绩文件，共 5 次下载；英文成绩在中文界面执行一次跨语言导入预览。`yarn test:covers` 验证真实下载文件中的图片嵌入、缺图占位、恢复请求后的重新下载，以及页面原图回退。`yarn test` 检查 XLSX 文件写入和读取结果，不启动 Excel 软件，也不验证公式的原生重算。

## 历史成绩与 Rating 趋势

- 首页“最近成绩”默认按成绩时间倒序，每页 10 条，支持排序和分页。相册使用拍摄时间，既有历史及手动导入保留原录入时间口径。同一谱面可保留多条不同历史
- 点击首页、成绩管理或 B30 的曲名／封面查看歌曲信息；按模式显示全部谱面和历史，每页 30 条。缺失资料显示 `--`
- 成绩管理只提供编辑和歌曲信息。删除只在歌曲详情逐条操作；删除后从该谱面剩余历史重选最佳成绩，删光后该谱面退出 B30，过去日期的趋势保留
- 编辑修正最佳成绩所关联的历史，不新增记录，也不改变导入时间；降分后其他历史可能成为最佳
- OCR 同批次按谱面、分数、Max Chain、FC/AP 去重，跨批次仅比较该谱面最近一条保留历史。未知 FC/AP 按 false，未记录 Max Chain 与 0 不同；A→B→A 的不同批次可保留三条
- Excel 导出每谱面的当前最高成绩及更新时间，删除创建时间列；更新时间、Chart ID、Song ID 位于隐藏的 K:M 列。导入先取文件内最高分，同分选更新时间最新者，时间相同或均缺失取最后一行，随后与最近历史去重
- 首页 SVG Rating 折线图提供日／月／年粒度，默认日，切页保留选择。每天最多保存一条双模式快照，首次建立基线，之后仅在总 Rating 变化时创建或更新今天；跨天后固定，不保存日内峰值。月／年取周期末值，无记录日期延续上一值
- 快照按保存时的浏览器本地日期标记，改变时区不重新归组过去记录。曲库／规则版本变化重算历史 Rating 与当前最佳，只按规则更新今天；历史默认长期保留，Excel 不作为历史备份

相册截图的历史使用拍摄时间，旧图补录只重放相关谱面，Rating 变化记在录入当天；修改和删除同样不改写过去日期。非重复低分截图可记入历史，不降低最佳成绩；FC/AP 未知统一为 false，同分仅补未记录的 Max Chain。相册历史人工纠错保留拍摄时间；仅修改 Max Chain 不改成绩更新时间。删光历史后保留趋势并按规则更新今天为零，清空全部数据才连同快照删除。完整备份迁移暂不提供，GitHub Pages 与 Cloudflare 的本地数据不互通，Excel 只迁移当前成绩。

`yarn test:history` 使用独立 Edge 上下文，验收真实 XLSX 导入、去重、候选选择、回滚、双标签并发、编辑回退、逐条删除、历史分页、跨年月曲线、刷新持久化及手机布局。数据准备可使用 IndexedDB，所测写入、编辑、删除和清空通过真实页面执行。未新增内部逻辑单元测试。

`yarn test:daily-rating` 验收真实 schema 5 升级、每日快照合并与回落、无变化不写入、跨天冻结、同日双标签写入、计算版本重算、删光历史后的零 Rating、跨时区持久化及清空全部数据。`test:history` 同时覆盖排序结果复用、跨标签页更新和读取错误重试。

## Nintendo 相册配置与验收（3A / 3B）

1. `yarn build:server` 构建包含相册入口的前端，并检查 Worker 类型
2. 将 `.dev.vars.example` 复制为 `.dev.vars`，把注册页给出的 Client ID 填入 `NXAPI_CLIENT_ID`。支持只有 Client ID 的公开客户端；`NXAPI_CLIENT_SECRET` 可留空或删除，仅服务方实际提供 Secret 的机密客户端才填写。Worker 请求 `ca:gf ca:er ca:dr`，客户端必须获准这些权限；在客户端详情的 Scope 表单中配置，若显示 Requires approval 则按服务方提示申请批准，不使用其他应用的身份
3. 为 `COOKIE_KEY` 生成随机 32 字节 base64url 密钥，例如 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`；不要提交或发送该密钥
4. `wrangler.jsonc` 已配置 GCFP 游戏 ID 和媒体主机；部署时核对 `GCFP_APPLICATION_IDS` 和 `MEDIA_HOSTS`，使用逗号分隔的准确游戏 ID 和 HTTPS 主机名，禁止通配符
5. `yarn dev:server` 启动本地 Worker，在同源页面的「账号与设置 → 账号」点击「绑定 Nintendo 账号」，确认须知后按弹窗中的登录、复制链接、回来粘贴三步完成绑定。Cookie 使用 Secure / HttpOnly，正式部署必须 HTTPS；本地使用浏览器认可的 localhost 环境

若本地 `workerd` 出站连接失败，可在 Wrangler 已登录的情况下运行 `yarn wrangler dev --remote --ip 127.0.0.1 --port 8787 --upstream-protocol http`，将 Worker 运行于 Cloudflare 临时预览环境。远程代理会改写 Worker 收到的请求 URL，因此需在 `.dev.vars` 中添加 `APP_ORIGIN="http://127.0.0.1:8787"`，并用该地址打开页面。来源必须精确匹配协议、主机和端口，`localhost` 与 `127.0.0.1` 不能混用。该配置只指定可信来源，不启用跨域访问；正式直连部署可留空，默认仍校验实际请求 URL 的来源。远程模式使用 Cloudflare 上的远程绑定。

原图默认经 Worker 有界流式中转；真实浏览器验证 CDN 可跨域读取后可设 `MEDIA_DIRECT=1`。Nintendo App 协议版本由 `NINTENDO_APP_VERSION` 配置。会话暂用 30 天，Coral 缓存按上游有效期；更换 Cookie 主密钥或版本会要求重新绑定。绑定页提供第三方处理说明和源码链接，协议来源见 [worker/NOTICE.md](worker/NOTICE.md)。上线修改版需把源码链接改为实际部署版本。

普通 `yarn build` / `yarn dev` 不启用相册。GitHub Pages 构建剔除相册前端模块；Cloudflare 未绑定用户日常浏览不发 API 请求，点击「绑定 Nintendo 账号」才查询绑定状态。绑定状态标记不含凭据。服务器故障不会影响本地成绩与手动导入。

验收命令：

```sh
yarn check:worker
yarn test:album-worker
yarn test:album-runtime
# 浏览器验收使用 Vite 开发服务，并在测试中模拟上游 API
# PowerShell: $env:VITE_SERVER='1'; yarn dev:local --port 5175
# sh: VITE_SERVER=1 yarn dev:local --port 5175
yarn test:album
yarn test:recognition
```

`test:album-worker` 通过真实本地 HTTP 请求验收公开接口，Nintendo 和第三方服务为模拟依赖。`test:album-runtime` 在实际 Workerd 中运行同一套 HTTP 验收，覆盖声明 JSON 类型的加密响应、Base64/Base64url、登录单独加密、令牌失效恢复、限流、原图重定向和下载限制。加密请求的响应必须先解密，不能根据 Content-Type 判断为明文。上游错误会记录固定阶段、HTTP 状态或 Coral 错误码，不记录响应正文和凭据。`test:album` 使用仓库里的真实截图、浏览器 OCR 和 IndexedDB，验收风险确认、绑定教程、手动更新进度弹窗与自动录入、拍摄时间、账号信息、10 秒冷却、3 分钟内重开不更新、超时后打开网页自动更新、清空后不重新录入、失败重试及解除绑定；可通过 `ALBUM_URL` 指定带服务端开关的 Vite 地址。上述结果不代替真实授权、上游重放限制、媒体 ID、CDN 跨域和 Cloudflare 出口验证。当前 OCR 样本与逐张预期见 `tests/ocr-samples.json`。

绑定后打开网页时，距上次更新满 3 分钟才自动读取相册，3 分钟内重复打开不更新；设置页「更新成绩」可手动更新，自动与手动更新共用 10 秒冷却，多个标签页共享冷却并只允许一个标签页更新。识别成功的截图直接录入，跳过 MISSION CLEAR、游玩中、非结算页及重复截图；拍摄时间缺失时按录入时间记录。手动与自动更新均通过右下角进度提示查看；点击提示或账号区域的查看入口可打开与首页共用的识别弹窗，关闭弹窗在后台继续。页面切换保留进行中的队列，未完成任务在下次更新时继续。临时下载失败或 OCR 超时下次更新最多自动重试两次，其余失败在设置页显示原因并可手动重试。账号区域显示 Nintendo 昵称、相册中可见的 GCFP 截图数、已录入的相册成绩数和最近更新时间。用户已确认 3A、3B 实际使用正常；CDN 直连须单独实测后启用，当前仍默认 Worker 中转。
