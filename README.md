# Groove Archive · FP 成绩管理

已接入设计文档阶段 5：真实截图 OCR、批量上传与本地成绩入库。现有曲库为 124 首歌曲、992 张谱面，保留维护者提供的原始数据与稳定 ID。

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
- Rank／Rating 自动计算，首页和已有 B30 页面使用实际成绩。
- 曲库或计算规则版本变更时事务重算；失败保留数据及旧版本，提示重试。
- 浅色／深色／系统主题及日英元数据切换。
- 设置页可二次确认清空全部本地成绩，保留曲库与偏好。封面使用 coverSourceUrl，失败时显示占位图。新增弹窗的已选曲目可展开搜索，选中后自动收起。

支持完整 16:9 结算页和选曲页，在浏览器 Worker 内通过 PaddleOCR 识别，成功后直接入库。MISSION CLEAR（含 MISSON 拼写）、游玩中画面与未游玩占位跳过。图片仅在内存中处理，关闭或切页即取消；首次识别需联网下载模型。每批最多 30 张，每张不超过 20 MiB。FC／AP 和 Max Chain 随成绩保存，选曲页及手动新增可无 Max Chain。无云端、导入导出或备份恢复功能。成绩保存在当前浏览器，清除站点数据会删除成绩。

## 曲库维护

曲库位于 `src/data/songs.json`，模型及展示 helper 位于 `src/core/song/`，搜索位于 `src/core/search/`。Song ID 分配后不变，Chart ID 为 `{songId}-{mode}-{difficulty}`；不得因排序、改名或下架重新分配／删除 ID。分类字段使用 genre；英文缺失回退日文，演唱者与本地封面可选。

曲库变更须递增 `src/data/metadata.json` 的 songLibraryVersion；Rating 规则变更须递增 ratingRuleVersion。详细写入、搜索与更新规则见设计文档第 20 节。本次接入未逐首重新核验社区资料或下载封面。

## 验证范围

使用 fake-indexeddb 验证真实 Dexie schema 与事务，包括并发唯一性和重算回滚；Rank／Rating 测试覆盖边界。构建执行 vue-tsc。Edge 独立上下文已实测新增、刷新持久化、编辑锁谱、降分确认、重复新增和删除，并检查 390px 手机宽度布局。浏览器及移动端完整兼容矩阵留待后续验收。

OCR 真实样本验证：将 21 张本地样本保留在 `src/data/test/{result,select,playing}`，启动 `yarn dev` 后运行 `yarn test:ocr`（默认系统 Edge）。逐图预期位于 `tests/ocr-samples.json`；15 张有效成绩、6 张跳过、批量去重为 11 条。模型和本地运行时为较大资源，首次加载可能较慢。实现范围及 ROI 见设计文档第 21 节。
