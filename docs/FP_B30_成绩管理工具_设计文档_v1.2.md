# Groove Coaster: Future Performers 成绩管理工具设计文档

> 版本：v1.2  
> 状态：一期设计稿  
> 最后更新：2026-09-21

---

## 1. 项目概述

本项目用于管理《Groove Coaster: Future Performers》（以下简称 FP）的个人成绩。

一期目标以“快速录入成绩 + 基础 Rating / B30 查看”为核心：用户上传游戏成绩截图，系统通过 OCR 自动识别曲目与 Score，识别成功后直接写入本地数据库。Rank 与单谱 Rating 均由 Score 和谱面信息自动推导，用户如发现识别错误，可在成绩管理页面中事后修改曲目、谱面或 Score。

一期同时完成 Groove Rating 计算和简单 B30 列表展示。二期再增加 B30 成绩图、Excel 导入导出、历史变化等扩展功能。

项目采用纯前端 Web 架构，尽量避免不必要的后端服务与复杂依赖。PWA 仅作为二期之后的未来设计选项，不属于一期或二期的交付范围。

---

## 2. 项目目标与边界

### 2.1 一期目标

一期实现以下功能：

1. 上传一张或多张 FP 成绩截图。
2. 使用 OCR 识别截图中的：
    - 曲目名称
    - Score
    - 难度 / 谱面信息（根据实际截图结构决定最终识别字段）
3. 根据 OCR 曲名在本地曲库中进行模糊匹配。
4. OCR 成功后直接写入本地数据库。
5. 不提供“录入前确认/修改”步骤。
6. 在成绩管理页面中支持手动新增与事后修改，二者一并实现，录入 / 修改字段包括：
    - Score
7. Rank 不允许用户修改，统一根据 Score 自动推导。
8. 根据 Score 与谱面等级自动计算单谱 Rating。
9. 计算 Groove Rating，并提供简单 B30 列表展示。
10. 支持成绩搜索、筛选与删除。
11. 支持中文、日文、英文 UI。
12. 支持亮色、深色、跟随系统主题。
13. 支持曲目名称和歌手信息在日文 / 英文之间切换。
14. 截图仅在 OCR 处理期间驻留内存，不做任何持久化；只持久化结构化成绩数据。
15. Pinia 不作为一期前置依赖；如一期末尾确认 OCR 跨页面后台队列确有必要，再引入，否则延后到二期。

### 2.2 二期目标

二期及后续计划实现：

1. B30 成绩图生成与导出。
2. Excel 导入。
3. Excel 导出。
4. Rating 提升空间分析。
5. 更完整的曲目信息查询与统计。
6. 历史成绩 / Rating 变化记录（具体数据模型与交互待后续单独设计）。
7. 根据实际需求完善 OCR 后台任务队列。
8. 如有明确跨页面全局状态需求，再正式引入 Pinia。

### 2.3 暂不实现

一期暂不实现：

- 登录 / 注册
- 云端数据库
- 多设备同步
- 好友系统
- 在线排行榜
- OpenCV.js 图像处理
- 歌曲封面比对
- Excel
- B30 成绩图生成
- ECharts 图表
- 服务端 OCR
- PWA（仅作为二期之后的未来设计选项）

---

## 3. 技术栈

### 3.1 核心框架

| 分类       | 技术                 | 用途                   |
| ---------- | -------------------- | ---------------------- |
| 前端框架   | Vue 3                | 页面及组件             |
| 开发语言   | TypeScript           | 类型安全与核心逻辑     |
| 构建工具   | Vite                 | 开发和打包             |
| CSS        | UnoCSS               | 页面布局与主要视觉样式 |
| UI 组件    | Naive UI（按需）     | 复杂交互组件           |
| 国际化     | vue-i18n             | 中文 / 日文 / 英文 UI  |
| 本地数据库 | Dexie.js + IndexedDB | 成绩持久化             |
| OCR        | PaddleOCR.js         | 浏览器端文字识别       |
| 图像裁剪   | Canvas API           | 固定区域裁剪与缩放     |
| 模糊搜索   | Fuse.js              | 曲名匹配和曲库搜索     |

### 3.2 一期末尾 / 二期按需引入

| 技术          | 用途                                                            |
| ------------- | --------------------------------------------------------------- |
| Pinia         | 当 OCR 队列或其他状态需要跨页面长期存在时，引入统一全局状态管理 |
| SheetJS       | Excel 导入 / 导出                                               |
| html-to-image | B30 成绩图 PNG 导出                                             |
| ECharts       | 统计图表（如后续确有需求）                                      |

### 3.3 暂不引入 OpenCV.js

一期识别目标均为文字和数字，并且 FP 成绩截图 UI 结构相对固定。

一期图像处理需求主要为：

- 按归一化坐标裁剪固定区域
- 缩放识别区域
- 将裁剪结果转为 Canvas / ImageData

上述功能均可由浏览器原生 Canvas API 完成，因此暂不引入 OpenCV.js。

只有以后出现以下需求时再考虑：

- 非标准截图、裁切截图
- 拍照导致的透视变形
- 旋转校正
- 二值化、锐化、去噪
- 模板匹配
- 复杂封面视觉匹配

---

## 4. UI 与状态管理设计

### 4.1 UnoCSS 与 Naive UI 分工

UI 以 UnoCSS 为主。

UnoCSS 负责：

- 页面整体布局
- 导航
- 卡片
- 标题
- 间距
- 响应式布局
- 亮 / 暗主题下的主要视觉样式

Naive UI 仅按需用于复杂交互组件，例如：

- `NDataTable`
- `NSelect`
- `NInputNumber`
- `NModal`
- `NMessage`
- `NPopconfirm`
- `NSpin`

简单按钮、卡片、标签等优先自行使用 Vue + UnoCSS 实现，避免网站整体呈现典型后台管理系统风格。

### 4.2 一期状态管理策略

一期不将 Pinia 作为前置依赖。

初期状态可按以下方式管理：

- 页面局部状态：Vue `ref` / `reactive`
- 可复用逻辑：Composable
- UI 语言：vue-i18n 自身状态 + localStorage
- Theme / 曲目信息显示语言：轻量 `useSettings()` composable + localStorage
- 成绩数据：Dexie / IndexedDB
- OCR 当前页面任务：`useOcrImport()` composable

建议结构：

```text
composables/
├─ useSettings.ts
├─ useScoreList.ts
└─ useOcrImport.ts
```

如果一期末尾出现明确的跨页面 OCR 后台任务需求，例如：

```text
上传 30 张截图
 ↓
切换到成绩 / B30 页面
 ↓
OCR 仍在后台继续
 ↓
全站都需要显示统一任务进度
```

则再引入 Pinia，并建立 `ocr` Store。否则将 Pinia 延后至二期。

### 4.3 成绩数据不进入全局状态副本

无论后续是否引入 Pinia，成绩持久化数据都由 Dexie / IndexedDB 负责。

不维护：

```text
Dexie Scores
+
Pinia Scores[]
```

两套成绩副本。

成绩数据的唯一真实来源应为 IndexedDB。

---

## 5. 国际化与主题

### 5.1 UI 国际化

使用 `vue-i18n`。

目录：

```text
src/locales/
├─ zh-CN.json
├─ ja-JP.json
└─ en-US.json
```

示例：

```json
{
    "score": {
        "title": "成绩",
        "upload": "上传成绩截图"
    }
}
```

### 5.2 曲目信息语言

曲名与歌手信息不使用 vue-i18n 翻译文件，而来自曲库数据。

建议：

```ts
interface LocalizedText {
    ja: string
    en?: string
}
```

```ts
interface Song {
    id: string
    title: LocalizedText
    artist: LocalizedText
}
```

统一通过 helper 获取：

```ts
getSongTitle(song)
getSongArtist(song)
```

如果目标语言缺少内容，则回退到已有语言。

### 5.3 主题

主题选项：

```text
Light
Dark
System
```

UnoCSS 使用 `dark:` 处理主要样式。

当选择 `system` 时，通过：

```ts
window.matchMedia('(prefers-color-scheme: dark)')
```

获取实际主题。

Naive UI 的 theme 同步跟随最终解析出的亮 / 暗状态。

---

## 6. 曲库设计

### 6.1 曲库用途

曲库不仅用于 OCR。

一期及后续至少用于：

1. OCR 曲名匹配。
2. 成绩页搜索。
3. 手动新增 / 编辑成绩时选择曲目。
4. 曲目信息查询。
5. Rating 计算时读取谱面等级。
6. 后续 B30 展示。

### 6.2 结构

```ts
interface Song {
    id: string

    title: {
        ja: string
        en: string
    }

    artist: {
        ja: string
        en: string
    }

    vocal: {
        ja: string
        en: string
    }

    bpm?: number

    pack?: string

    searchAliases?: string[]

    charts: Chart[]
}

interface Chart {
    id: string
    difficulty: 'easy' | 'normal' | 'hard' | 'master'
    mode: 'basic' | 'advanced'
    level: number
    target?: number
    combo?: number
    note?: number
    goldNote?: number
    hold?: number
    goldHold?: number
    arrow?: number
    goldArrow?: number
    square?: number
    goldSquare?: number
}
```

level 为谱面定数表示；整数代表普通等级，.5 代表游戏中的 + 等级。除明确展示定数的场景，UI 展示时要将 N.5 格式化为 N+。

### 6.3 曲名搜索

#### （1）注意事项

1. 搜索应无视当前语言选项，搜索结果应同时匹配日文 / 英文 / 别名曲名。
2. 特殊曲名，需要添加别名。如下方的 Wire&Ring，& 应替换为 and：

```text
FREE CONNECTION 2 -G.C.スペシャルエディットVer.-
↓
FREE CONNECTION 2 GCスペシャルエディットVer、
FREE CONNECTION 2 GC スペシャルエディット Ver、
FREE CONNECTION 2 GC スペシャル エディット Ver
```

```text
Wire&Ring
↓
wirering、
wire and ring
```

```text
1nfinite 5tellar Chronicle
↓
infinite stellar chronicle
```

```text
III
↓
3
```

#### （2）归一化

为了提高 OCR 与手动搜索命中率，应在进入 Fuse.js 前统一 normalize。

建议处理：

- Unicode normalize
- 英文字母转小写
- 全角字符转半角（如需要）
- 合并连续空格
- 去除部分无意义标点
- 保留原始曲名用于展示

例如：

```text
ouroboros -twin stroke of the end-
```

归一化后：

```text
ouroboros twin stroke of the end
```

---

## 7. Fuse.js 设计

Fuse.js 在一期即引入。

主要用途：

### 7.1 OCR 曲名匹配

OCR 文本可能存在：

- 少字
- 多字
- 字符误识别
- 标点差异
- 空格差异

流程：

```text
OCR 原始曲名
    ↓
normalize
    ↓
Fuse.js 搜索 songs
    ↓
候选曲目
    ↓
业务规则校验
```

### 7.2 成绩搜索

用户在成绩列表中可通过曲名模糊搜索。

### 7.3 曲库查询

后续增加曲目查询页时复用相同搜索模块。

### 7.4 统一封装

建议：

```text
src/core/search/songSearch.ts
```

避免页面自行实例化 Fuse。

---

## 8. OCR 设计

### 8.1 原则

一期 OCR 目标不是实现通用图片识别，而是针对 FP 固定成绩 UI 进行结构化识别。

不要：

```text
整张截图 → OCR → 从所有文字中猜字段
```

而是：

```text
截图
 ↓
Canvas 按固定比例裁剪 ROI
 ↓
分别识别各字段
 ↓
字段级 Parser
 ↓
曲库匹配 / 规则校验
 ↓
入库
```

### 8.2 ROI 坐标

裁剪坐标使用 0~1 的归一化比例：

```ts
interface Rect {
    x: number
    y: number
    width: number
    height: number
}
```

不同分辨率但同 UI 比例的截图可以复用同一套规则。

### 8.3 字段解析

每类字段应有独立 Parser。

#### Score

仅允许：

```text
0-9
,
```

可根据 OCR 常见错误进行纠正，例如：

```text
O → 0
I / l → 1（仅限数字字段）
```

最终转换为整数，并校验 `0 <= score <= 1,050,000`。OCR 识别出的 Score 超出范围时判定为识别失败，不入库，不截断为边界值。手动新增与编辑使用相同的整数及范围校验，不合法时不允许保存。

#### Rank

Rank 不进行 OCR，不允许用户编辑，也不作为独立持久化字段。

统一使用：

```ts
getRankByScore(score)
```

根据 Score 推导，用于成绩列表、B30 列表和后续导出显示。

#### 曲名

使用 Fuse.js 匹配曲库。

#### 难度

使用可选难度集合和当前歌曲已有谱面信息交叉校验。

### 8.4 OCR 结果处理

仅区分识别成功与识别失败，不设置存疑 / 待复核状态。

通过字段解析、曲库匹配和业务规则校验的结果直接入库，不增加录入前确认页；未通过的结果按识别失败处理，不创建成绩记录，仅在失败后提示用户。

OCR 置信度仅可作为识别过程中的辅助信息，不持久化到成绩记录。具体识别通过条件与阈值仍待后续确定。

### 8.5 截图生命周期与隐私

截图仅在 OCR 处理期间驻留浏览器内存。

明确约束：

- 不将原始截图写入 IndexedDB。
- 不将原始截图写入 localStorage。
- 不将截图转换为 Base64 后持久化。
- 不在成绩记录中保存截图路径、Blob 或缩略图。
- OCR 完成或任务结束后释放 `File` / `Blob` / `ImageBitmap` / Canvas / Object URL 等引用。
- 页面刷新或关闭后，未完成任务中的截图无需恢复。

---

## 9. 成绩录入流程

### 9.1 单张 / 批量上传

用户可选择一张或多张成绩截图。

流程：

```text
选择截图
 ↓
加入 OCR 任务
 ↓
裁剪字段
 ↓
OCR
 ↓
曲名匹配
 ↓
字段校验
 ↓
写入 IndexedDB
 ↓
显示录入结果
```

### 9.2 识别失败

失败情况包括：

- 曲名无法匹配
- Score 无法解析
- Score 超出 `0 <= score <= 1,050,000` 的合法范围
- 谱面无法确定或业务规则校验未通过
- 截图结构无法识别
- OCR 异常

失败任务不创建成绩记录，也不修改已有成绩；仅在识别失败后向用户提示。失败状态与错误信息只用于当前运行时提示，不持久化。截图仍只在处理期间驻留内存，不做持久化。

不保留存疑标记，不提供待复核成绩列表。用户可通过手动新增录入未识别成功的成绩。

### 9.3 重复成绩

唯一逻辑键建议为：

```text
songId + chartId
```

对于同一曲目同一谱面再次通过 OCR 录入：

默认策略：

```text
新 Score > 已有 Score
    → 更新最高成绩

新 Score <= 已有 Score
    → 保留已有最高成绩
```

一期只维护当前最高成绩，不记录每次上传或成绩变化历史。

手动编辑属于纠错操作，允许将已有 Score 调低，保存时必须警告用户并显示对应的曲目，Rank / Rating 将随之重新计算；不受上述 OCR 仅保留较高分的规则限制。

历史成绩、Rating 变化、更新时间线等能力待二期或后续单独设计，目前不提前固定数据模型。

---

## 10. 本地数据库设计

使用 Dexie.js 管理 IndexedDB。

### 10.1 scores

```ts
interface ScoreRecord {
    id?: number

    songId: string
    chartId: string

    score: number
    rating: number

    source: 'ocr' | 'manual'

    createdAt: number
    updatedAt: number
}
```

### 10.2 数据唯一性

同一：

```text
songId + chartId
```

只保存一条当前最高成绩；手动纠错允许将该记录的 Score 调低，保存时须警告用户。

### 10.3 派生字段不持久化

以下数据优先根据基础数据实时计算，不作为用户可编辑的独立事实字段：

- Rank：由 Score 推导
- 是否进入 B30：取前30位rating最高的单曲。

这样可以避免修改 Score 后出现 Rank / Rating 不同步。

另外，Chart Rating 持久化为已截断到两位小数的值；录入或修改 Score / 谱面时重新计算并写回，列表与 B30 读取存储值，不作为用户可编辑的字段。规则或曲库等级变更后的存量 Rating 更新策略见第 19 节待定事项。

### 10.4 不保存冗余曲目信息

成绩表原则上不重复保存：

- 曲名
- 歌手
- 等级

这些信息来自曲库，通过 `songId` / `chartId` 关联。

这样曲库修正翻译后不需要批量迁移历史成绩。

---

## 11. 一期页面设计

### 11.1 首页 / 识别页

功能：

- 拖入图片
- 点击选择图片
- 批量识别
- OCR 处理进度
- 成功 / 失败数量
- 识别失败后提示用户
- 跳转成绩管理

### 11.2 成绩管理页

功能：

- 显示当前最高成绩
- 搜索曲名
- 按模式 / 难度等筛选
- 手动新增成绩
- 编辑成绩
- 删除成绩

实现时视情况使用 Naive UI `NDataTable`。

### 11.3 成绩新增与编辑

一期一并实现手动新增与编辑。新增、编辑时仅可修改：

- Score

不可直接修改：

- Rank
- Rating

编辑时只显示目前已录入的曲目，新增时显示所有曲目的所有模式的所有难度，并使用可搜索 Select 筛选曲目、模式和难度。

Rank 与 Rating 在 Score 或谱面发生变化后自动重新计算。

Score 必须为 `0 <= score <= 1,050,000` 范围内的整数，不合法时不允许保存。

手动编辑允许调低 Score。保存时若新 Score 低于该记录编辑前的 Score，必须警告用户并显示对应的曲目，Rank / Rating 将重新计算。

手动新增记录的 `source` 为 `manual`。

曲目选择使用可搜索 Select，并复用 Fuse.js / SongSearch。

### 11.4 B30 页面

一期提供简单 B30 列表，不制作分享成绩图。

建议至少显示：

- 排名（#1 ～ #30）
- 曲名
- 模式
- 难度
- Score
- Rank
- 单谱 Rating

页面顶部显示当前 Groove Rating。

一期以清晰可查为目标，不要求复杂卡片排版、封面拼图或图片导出。

### 11.5 设置页

设置：

- UI Language
    - 简体中文
    - 繁体中文（二期引入）
    - 日本語（二期引入）
    - English（二期引入）
- Theme
    - Light
    - Dark
    - System
- Song metadata language
    - 日本語
    - English

---

## 12. 数据来源与规则定义

### 12.1 主要数据来源

当前计划使用社区站点 GrooveCoaster.Link 作为主要参考数据源：

- FP 曲库：  
  `https://groovecoaster.link/fp`
- Groove Rating 规则：  
  `https://groovecoaster.link/a/groove-rating`

截至 2026-09-20，该站 FP 页面列出 120 首歌曲，并包含日 / 英曲名、艺术家、谱面难度等资料。

### 12.2 曲库版本信息

在曲库数据旁维护 metadata：

```json
{
    "source": "GrooveCoaster.Link",
    "sourceUrl": "https://groovecoaster.link/fp",
    "verifiedAt": "2026-09-20",
    "game": "Groove Coaster: Future Performers"
}
```

后续新增 DLC / 游戏更新时更新曲库及 `verifiedAt`。

### 12.3 Rating 基础规则

> 以下规则在一期实现，用于成绩列表的单谱 Rating、Groove Rating 与简单 B30 列表。

单谱 Rating：

```text
truncate2(x) = floor(x * 100) / 100（本文 Rating 均为非负数）

Raw Rating =
    0                                                   当 0 <= score <= 500,000
    (score - 500,000) / 200,000 * max(0, Chart Base - 3.5) 当 500,000 < score < 700,000
    max(0, Chart Base + Score Offset)                     当 700,000 <= score <= 1,050,000

Chart Rating = truncate2(Raw Rating)
```

其中 Chart Base 有如下换算规则，举例：

```text
14  → 14.0
14+ → 14.5
```

### 12.4 Rank 推导规则

Rank 只根据 Score 推导，不从 OCR 结果或用户输入获取。

项目采用以下阈值：

|                    Score | Rank |
| -----------------------: | ---- |
|              `< 800,000` | B    |
|     `800,000 ～ 849,999` | A    |
|     `850,000 ～ 899,999` | AA   |
|     `900,000 ～ 949,999` | AAA  |
|     `950,000 ～ 999,999` | S    |
| `1,000,000 ～ 1,009,999` | S+   |
| `1,010,000 ～ 1,019,999` | SS   |
| `1,020,000 ～ 1,029,999` | SS+  |
| `1,030,000 ～ 1,039,999` | SSS  |
|           `>= 1,040,000` | SSS+ |

其中 700,000 以下仍按 B Rank 处理。

### 12.5 Score Offset

当前采用如下分段节点：

|     Score | Rank | Offset |
| --------: | ---- | -----: |
|   700,000 | B    |   -3.5 |
|   800,000 | A    |   -2.0 |
|   850,000 | AA   |   -1.5 |
|   900,000 | AAA  |   -1.0 |
|   950,000 | S    |   -0.5 |
| 1,000,000 | S+   |    0.0 |
| 1,010,000 | SS   |   +0.5 |
| 1,020,000 | SS+  |   +1.0 |
| 1,030,000 | SSS  |   +1.5 |
| 1,040,000 | SSS+ |   +2.0 |
| 1,045,000 | —    |   +2.5 |

相邻节点之间采用线性插值。本表仅用于 Score >= 700,000；更低分数按 12.9 节计算，不向下外推 Offset。

例如：

```text
Score = 1,035,000
```

处于：

```text
1,030,000 → +1.5
1,040,000 → +2.0
```

的中点，因此：

```text
Offset = +1.75
```

若谱面为 Lv.14：

```text
Rating = 14 + 1.75 = 15.75
```

### 12.6 单谱 Rating 上下限

单谱 Rating 最低为 0。先按 12.3 节的分段公式计算非负 Raw Rating，再截断到两位小数；不四舍五入。Score 在 0 至 500,000（含两端）时，单谱 Rating 固定为 0。

在合法 Score 范围内，1,045,000 分及以上获得：

```text
Chart Base + 2.5
```

该值即为最大单谱 Rating。

### 12.7 Groove Rating / B30

最终 Groove Rating 为：

```text
所有谱面已截断到两位小数的 Chart Rating
 ↓
从高到低排序
 ↓
取前 30 个，不足 30 个的部分按 0 计
 ↓
求和后除以 30
 ↓
将结果截断到两位小数，得到 Groove Rating（总 RT）
```

少于 30 条成绩时仍固定除以 30，不足部分按 0 计；没有成绩时 Groove Rating 为 0。空缺 B30 的展示。

单谱 Rating 在存储、排序和求和前截断到两位小数；总 RT 必须使用这些已截断的单谱值计算，求平均后再次截断到两位小数。显示时固定两位小数（例如 `0.00`），不四舍五入。

计算口径：

```text
ratingCents = floor(Raw Rating * 100)
Chart Rating = ratingCents / 100
Groove Rating = floor(sum(B30 的 ratingCents) / 30) / 100
```

实现须避免二进制浮点误差使恰好落在百分位的值被错误截断；可采用精确分数或十进制定点运算，不在插值中间步骤提前截断。

并列排序时根据 Score 排序，若相同，根据谱面难度排序（先根据难度等级，再根据难度，如master比hard优先）。

### 12.8 Rating 计算口径

本工具统一按照理论分段公式正常计算 Rating。

对于 `1,040,000 ～ 1,045,000` 区间：

- 正常进行线性插值。

### 12.9 700,000 以下的 Rating

按照已确定的项目口径：

- Rank 仍为 B。
- `0 <= score <= 500,000`：单谱 Rating 为 `0.00`。
- `500,000 < score < 700,000`：在 `(500,000, 0)` 与 `(700,000, max(0, Chart Base - 3.5))` 两个端点之间，对 Rating 本身进行线性插值。
- `score = 700,000`：衔接 12.5 节的 Offset 节点，Rating 为 `truncate2(max(0, Chart Base - 3.5))`。
- 计算结果统一截断到两位小数，并以截断后的值参与 B30 排序及总 RT 计算。

例如 Lv.14 谱面：

| Score | 截断前 Rating | 最终 Chart Rating |
| ----: | ------------: | ----------------: |
| 0 | 0 | 0.00 |
| 500,000 | 0 | 0.00 |
| 500,001 | 0.0000525 | 0.00 |
| 600,000 | 5.25 | 5.25 |
| 699,999 | 10.4999475 | 10.49 |
| 700,000 | 10.5 | 10.50 |

例如仅有上述 `699,999` 分这一条成绩时，总 RT 为 `truncate2(10.49 / 30) = 0.34`。

### 12.10 判定窗口

FP 判定窗口资料当前不参与本工具核心计算。

因此不写入业务算法，仅作为参考资料保留。

如未来增加判定分析、成绩详情分析等功能，再单独建立规则模块。

---

## 13. 目录结构建议

```text
src/
├─ components/
│  ├─ common/
│  ├─ score/
│  └─ ocr/
│
├─ composables/
│  ├─ useScoreList.ts
│  └─ useOcrImport.ts
│
├─ core/
│  ├─ ocr/
│  │  ├─ crop.ts
│  │  ├─ recognizer.ts
│  │  ├─ parser.ts
│  │  └─ validator.ts
│  │
│  ├─ search/
│  │  └─ songSearch.ts
│  │
│  ├─ song/
│  │  └─ songService.ts
│  │
│  └─ rating/
│     ├─ calculator.ts
│     └─ b30.ts
│
├─ data/
│  ├─ songs.json
│  └─ metadata.json
│
├─ db/
│  ├─ database.ts
│  ├─ models.ts
│  └─ scoreRepository.ts
│
├─ locales/
│  ├─ zh-CN.json
│  ├─ ja-JP.json
│  └─ en-US.json
│
├─ views/
│  ├─ Home.vue
│  ├─ Scores.vue
│  ├─ Songs.vue
│  ├─ B30.vue
│  └─ Settings.vue
│
└─ App.vue
```

`rating/` 属于一期功能模块，需要实现单谱 Rating、Rank 推导与 B30 计算。

如一期末尾确认需要跨页面 OCR 后台队列，再新增：

```text
stores/
└─ ocr.ts
```

并引入 Pinia。

---

## 14. 一期开发顺序

### 阶段 1：项目基础

1. Vue 3 + TypeScript + Vite
2. UnoCSS
3. Naive UI 按需
4. vue-i18n
5. `useSettings()` + localStorage
6. Theme
7. Settings

### 阶段 2：曲库

1. 建立 `songs.json`
2. 建立稳定 Song ID / Chart ID
3. 日 / 英曲名与歌手
4. Fuse.js
5. 曲目搜索
6. SongService

### 阶段 3：数据库

1. Dexie
2. Score Schema
3. Score Repository
4. CRUD
5. 成绩管理页面，手动新增与编辑一并实现
6. Score 整数 / 范围校验及编辑调低分数时的保存警告

### 阶段 4：OCR PoC

先使用 10～30 张真实 FP 截图验证：

- 曲名
- Score
- 谱面

重点统计：

- OCR 原始识别正确率
- 曲名 Fuse 修正后正确率
- Score 正确率
- 最终整条成绩正确率

只有 OCR PoC 达到可接受水平后，再继续批量上传体验优化。

### 阶段 5：上传与 OCR 入库

1. Canvas ROI
2. PaddleOCR.js
3. Parser
4. Fuse 匹配
5. Validator
6. 重复成绩规则
7. 识别失败不入库及失败提示
8. 批量任务状态
9. OCR 完成后释放截图相关内存引用

### 阶段 6：Rating 与 B30

1. `getRankByScore()`
2. Score Offset 分段计算
3. 单谱 Rating（0 至 500,000 分为 0；500,000 至 700,000 分按端点插值；结果截断到两位小数）
4. B30 排序
5. Groove Rating（使用已截断的单谱 Rating，不足 30 条按 0 补足，固定除以 30 后再截断到两位小数）
6. 简单 B30 列表页
7. B30 Floor

### 阶段 7：一期收尾（可选）

评估 OCR 是否需要跨页面后台任务队列。

只有确认需要时才：

1. 引入 Pinia
2. 建立 OCR Store
3. 将任务执行与上传页面生命周期解耦

否则不引入 Pinia，留到二期再评估。

---

## 15. 一期验收标准

### 功能

- 可上传 FP 成绩截图
- 支持多图
- OCR 自动识别成绩
- 自动匹配曲目
- 自动保存
- 可手动新增成绩，与编辑功能一并交付
- 可修改错误成绩
- 手动编辑可调低 Score，保存时向用户发出警告
- 可删除成绩
- 可搜索成绩
- 可切换中 / 日 / 英 UI
- 可切换亮 / 暗主题
- 可切换日 / 英曲目元数据
- 自动根据 Score 推导 Rank
- 自动计算单谱 Rating
- 可查看 Groove Rating
- 可查看简单 B30 列表

### 数据

- 刷新页面后成绩不丢失
- OCR 重复录入同曲同谱面仅保留最高成绩；手动纠错允许调低
- OCR、手动新增与编辑均只接受 `0 <= score <= 1,050,000` 范围内的整数
- 单谱 Rating 不低于 0；0 至 500,000 分固定为 0，500,000 至 700,000 分按 Rating 端点线性插值
- 单谱 Rating 先截断到两位小数再存储、排序与求和；总 RT 固定除以 30 后再截断到两位小数
- 少于 30 条成绩时不足部分按 0 计，Groove Rating 固定除以 30
- 曲库 ID 稳定
- 不因语言切换改变成绩关联
- Rank / Rating 修改 Score 后自动同步重新计算
- 原始截图不写入 IndexedDB / localStorage，只在处理期间驻留内存

### OCR

- 错误结果可通过成绩编辑修正
- 不保存存疑标记，不设置待复核状态
- 识别失败（包括 Score 超出范围）不创建成绩记录，仅在失败后提示用户
- OCR 失败不会影响已存在成绩

---

## 16. 二期规划

### 16.1 B30 成绩图

使用 `html-to-image` 将专门设计的 B30 Vue 组件导出为 PNG。

该功能与一期的简单 B30 列表分离，一期不要求实现图片排版或分享图。

### 16.2 Excel

使用 SheetJS。

导入 / 导出建议字段：

```text
Song ID
Chart ID
曲名
模式
等级
Score
Rank
Rating
更新时间
```

其中 Rank 与 Rating 均为派生数据：

- 导入时不作为可信事实。
- 以 Song / Chart / Score 为准重新计算。

### 16.3 历史变化

历史成绩、Rating 变化曲线、每次更新记录等能力待二期或后续单独设计。

当前不提前确定：

- 是否保存每次成绩
- 是否只保存 Personal Best 变化
- 历史表结构
- 数据保留周期

即使未来实现历史变化，仍遵守统一原则：**截图仅在处理期间驻留内存，成绩持久化。**

### 16.4 OCR 后台队列 / Pinia

如果一期末尾未引入，而后续确认需要：

```text
上传多张截图
 ↓
用户切换页面
 ↓
OCR 任务继续
 ↓
全站持续显示统一进度
```

则引入 Pinia 管理 OCR 全局任务状态，并结合 Web Worker 优化执行。

### 16.5 进一步分析

可继续增加：

- Rating 提升空间
- 距离 B30 Floor 所需分数
- 曲目 / 等级分布
- 成绩统计图表

### 16.6 二期之后的未来设计选项：PWA

PWA 仅作为二期之后的未来设计选项，不属于一期或二期交付范围。是否实现及安装、离线使用等能力边界，届时单独设计。

---

## 17. 设计原则

1. **一期完成 OCR 录入、Rating 计算和简单 B30 列表，B30 成绩图留到二期。**
2. **业务数据以 IndexedDB 为唯一真实来源。**
3. **Pinia 不作为一期前置依赖；只有出现明确跨页面任务状态需求时再引入。**
4. **曲库通过稳定 ID 与成绩关联。**
5. **UI 语言与曲目元数据语言分离。**
6. **Rating 等游戏规则独立封装，不散落在组件中。**
7. **第三方社区规则必须记录来源和核对日期。**
8. **不为了未来可能的需求提前引入重型依赖。**
9. **一期同时支持手动新增与编辑；识别错误允许事后修改，调低分数时保存须警告；不增加 OCR 录入前确认流程，Rank / Rating 不提供手动修改。**
10. **截图仅在处理期间驻留内存，成绩持久化。**
11. **历史变化待后续独立设计，不在一期提前固定模型。**
12. **OCR 失败不记录成绩，仅在失败后提示用户；不保存存疑标记。**
13. **Score 为 0 至 1,050,000 的整数；单谱 Rating 最低为 0，0 至 500,000 分为 0，500,000 至 700,000 分按 Rating 端点线性插值；单谱值截断到两位小数后参与总 RT 计算，Groove Rating 不足 30 条按 0 补足、固定除以 30 后再截断到两位小数。**
14. **PWA 仅作为二期之后的未来设计选项。**

---

## 18. 参考资料

- GrooveCoaster.Link — Future Performers 曲库  
  https://groovecoaster.link/fp

- GrooveCoaster.Link — Groove Rating  
  https://groovecoaster.link/a/groove-rating

> 注：上述内容为社区整理资料。项目采用本文定义的正常 Rating 分段公式；不复刻游戏历史版本中曾出现的 104 万～104.5 万区间 Bug。


---

## 19. 定稿前决策清单（2026-09-21）

本节是文档审查结果，建议均未自动转为已确认需求。第 12 节的 Rating 分段、两位小数截断及总 RT 计算口径已确定；以下事项确认并同步正文后，才能将文档状态改为定稿。

### 19.1 一期范围与业务规则待确认

| 编号 | 对应章节 | 未确定或冲突的内容 | 建议决策（待确认） |
| ---- | -------- | ---------------- | ------------------ |
| D01 | 2.1、5.1、11.5、15 | 目标与验收要求中 / 日 / 英 UI，设置页却将日 / 英放在二期 | 一期仅简体中文，预留国际化结构；日 / 英 / 繁中二期交付，同步修改目标与验收 |
| D02 | 1、2.1、11.3 | 概述允许纠正曲目 / 谱面，新增与编辑章节却写仅可修改 Score | 新增选择曲目、模式、难度和 Score；编辑允许更换关联谱面并修改 Score |
| D03 | 9.3、10.2、11.3 | OCR 重复策略已明确；手动新增重复谱面、编辑更换为已有谱面的冲突策略未定义 | 新增遇到重复时引导编辑已有记录；编辑更换谱面发生冲突时阻止保存并提示，不静默覆盖 |
| D04 | 10.3、12.7 | “前 30 位 rating 最高的单曲”与“所有谱面”可能导致按歌曲去重的不同实现 | 按谱面取前 30，同一歌曲不同模式 / 难度可同时入选；按截断后 Rating 排序 |
| D05 | 12.7 | 并列排序未明确方向，所有已有字段均相同时无最终顺序 | Rating、Score、level 降序，难度 master > hard > normal > easy；仍相同按 songId、chartId 升序 |
| D06 | 11.4、12.7、14 | 空缺 B30 的展示句未写完；B30 Floor 只出现在开发清单 | 固定展示 30 行，空缺显示占位与 0.00；Floor 为第 30 位 Rating，不足 30 条为 0.00 |
| D07 | 4.2、8、16.4 | 一期 OCR 能否切换页面后继续，仍留到一期末尾判断；队列中断体验未定义 | 一期仅当前页面处理，离开前提示并允许取消离开；确认离开则取消剩余任务、释放截图，已入库结果保留 |
| D08 | 6、7.3、13 | 目录含 Songs.vue，但一期页面和曲库查询范围未明确 | 一期不交付独立曲库查询页，仅复用曲库支持搜索和选谱 |
| D09 | 10.3、12.2 | Rating 持久化后，公式或谱面等级修订时如何更新已有记录未定义 | 记录规则及曲库版本，版本变更时重算存量 Rating；失败时提示并暂停展示可能过期的总 RT |
| D10 | 5、11.5 | 默认 UI 语言、主题和曲目信息语言未定义 | 配合 D01 默认简体中文；主题跟随系统；曲目信息默认日文，缺失翻译回退日文 |

### 19.2 OCR 与数据落地前必须补齐的规格

| 编号 | 对应章节 | 尚缺规格 | 建议处理（待确认） |
| ---- | -------- | -------- | ------------------ |
| T01 | 2.1、8.2、8.3 | 最终识别字段、模式识别方式、截图布局与各字段 ROI 坐标 | 使用真实样本确定曲名、Score、模式和难度的定位及识别规则；无法唯一确定谱面则失败 |
| T02 | 7.1、8.4 | 曲名匹配通过阈值、候选差距阈值、业务校验规则及 OCR 置信度用途 | 用样本校准后写入配置和验收说明；多候选无法唯一判定时不入库 |
| T03 | 14 阶段 4、15 | “可接受水平”缺少数字化验收标准，10～30 张样本缺少覆盖要求 | 固定有人工标注的样本集，覆盖模式、难度、语言及截图分辨率；分别确定整条正确率与错误入库率目标 |
| T04 | 8、9、11.1 | 支持的图片格式 / 分辨率 / 大小、批量数量、并发、取消 / 重试和进度口径未定义 | PoC 后确定明确限制与操作行为，并补充失败提示；运行时状态不持久化 |
| T05 | 5.2、6.2 | en 字段在示例中可选、正式结构中必填；vocal 必填但无缺失值约定 | 以第 6 节为唯一正式模型，日文必填、英文可选并回退，vocal 可选；明确缺失信息的展示方式 |
| T06 | 6.2、10、12.2、14 | Song / Chart ID 生成规则、chartId 唯一范围、曲库更新与下架处理未定义 | 固定稳定 ID；以 songId + chartId 作为强制唯一键；曲库更新保留旧成绩关联所需数据 |
| T07 | 6.3 | 归一化仍为建议，Unicode 形式、标点清单与特殊符号规则未确定 | 确定统一归一化规则并用文中曲名验证；别名只参与匹配，不改变展示文本 |
| T08 | 10.1、11.3 | source 在 OCR 覆盖 / 手动纠错后如何变化，createdAt / updatedAt 何时更新未定义 | source 记录最后有效写入方式；createdAt 保持首次创建时间；updatedAt 仅在记录实际变更时更新 |
| T09 | 3、8、15 | 浏览器 / 移动端支持范围、OCR 模型加载失败、存储写入失败的行为未定义 | 明确一期支持环境；模型或存储失败时明确提示，写入失败不得显示导入成功 |

T01～T04 的具体数值与坐标需要样本验证，不应在没有验证结果时写成已确认事实。

### 19.3 仅为实现建议，可授权开发时决定

- 4.2 的 composable 拆分、7.4 的搜索封装路径及第 13 节目录结构。
- 4.1 的具体 Naive UI 组件选择、11.2 是否使用 NDataTable。
- 11.4 B30 展示字段目前写作“建议至少显示”；建议将所列七个字段正式列为一期必备字段。
- 12.1 数据来源仍写作“当前计划”；需确认采用该站点作为主要曲库参考源及更新方式，文中的 120 首仅为历史记录，未经本次重新核验。

### 19.4 已明确留待后续，无需阻塞一期定稿

- 二期 Excel 字段、导入冲突规则和 B30 导出图样式。
- 历史成绩保存范围、表结构、保留周期与变化曲线。
- 二期 OCR 后台队列、Pinia、Web Worker 及统计图表的最终方案。
- PWA、复杂图像预处理和判定分析等未来功能。

上述内容保留为规划，不应计入一期验收承诺。
