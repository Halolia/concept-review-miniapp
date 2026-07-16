# 概念验证项目专家评审系统

基于微信小程序的概念验证项目评审打分系统，严格对齐《概念验证项目专家评审意见表》。

支持管理员和多名专家在不同手机上通过云数据库共同完成评审。

## 📋 评审维度（满分 100）

| 评审内容 | 权重 | 子项数 |
|---------|------|--------|
| 一、立项依据 | 5 分 | 1 |
| 二、市场分析 | 20 分 | 2 |
| 三、技术可行性 | 30 分 | 3 |
| 四、实施方案 | 15 分 | 3 |
| 五、保障条件 | 20 分 | 4 |
| 六、风险分析 | 10 分 | 2 |

等级：优秀(≥90) | 良好(80~89.99) | 一般(70.01~79.99) | 不推荐(≤70)

## 🏗 项目结构

```
concept-review-miniapp/
├── project.config.json
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   ├── utils/
│   │   ├── scoring.js              # 评分常量与计算（客户端+云函数共享）
│   │   ├── request.js              # 云函数调用封装（含 DEBUG 降级）
│   │   ├── constants.js            # Mock 数据（仅开发用）
│   │   └── util.js                 # 工具函数
│   ├── services/                   # 统一数据访问层
│   │   ├── authService.js          # 身份认证
│   │   ├── projectService.js       # 项目 CRUD
│   │   ├── reviewerService.js      # 专家管理
│   │   ├── assignmentService.js    # 指派管理
│   │   ├── reviewService.js        # 评审提交
│   │   └── summaryService.js       # 汇总统计
│   ├── components/
│   │   └── loading/
│   └── pages/
│       ├── index/                  # 首页 · 仪表盘
│       ├── projects/               # 项目列表
│       ├── project-detail/         # 项目材料详情
│       ├── review/                 # ★ 核心评分页
│       ├── result/                 # 单项目评审详情
│       ├── summary/                # 全部排名汇总
│       └── admin/                  # 管理后台
├── cloudfunctions/
│   └── reviewFunctions/            # 业务云函数
│       ├── index.js                # 所有 action 入口
│       ├── lib/auth.js             # 权限校验
│       ├── lib/audit.js            # 审计日志
│       └── lib/scoring.js          # 评分计算
├── scripts/
│   └── initData.js                 # 数据初始化
└── docs/                           # 文档
```

## 🔄 V1.0.1 更新（2026-07-16）

### 修复
- 评分字段名统一 `max` → `maxScore`
- 修复 0~100 分均可提交（不再强制必须100分）
- WXML 进度条改用预计算字段（不再直接调 Page 方法）
- 修复项目详情页导入路径错误
- 新增 `expertGetMyReview` 支持查询所有状态评审
- 评审状态机完善：draft/submitted/returned/resubmitted/locked/invalidated
- 防重复提交：review `_id` = `assignmentId` 保证幂等
- 汇总重写：遍历所有项目，正确显示 0/3、1/3、3/3
- 首页统计基于指派数据，不再依赖 `project.reviewers`

### 新增
- 管理后台评审批次 Tab（创建/选择/开启/关闭）
- 指派软删除 + 评审作废（不产生孤儿数据）
- 截止日期校验（超时阻止保存和提交）
- OPENID 绑定/解绑（替代 placeholder openid）
- leader 角色只读查看汇总和详情
- 环境配置 `config/env.js`（正式环境 ID 不提交）
- 自动化测试：评分 24 项全部通过

### 删除
- 旧云函数 `quickstartFunctions`（通用 CRUD 接口）

## 🚀 本地运行（DEBUG 模式）

1. 下载[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 注册微信小程序，获取 AppID
3. 在 `project.config.json` 中将 `appid` 改为你的 AppID
4. 打开本项目，确保 `miniprogram/utils/request.js` 中 `DEBUG_MODE = true`
5. 点击开发者工具「编译」即可运行

DEBUG 模式下：
- 数据使用本地 localStorage，无需云开发
- 首页显示角色切换和专家选择器
- 所有功能可用，适合开发调试和演示

## ☁️ 云开发部署

将 `DEBUG_MODE` 改为 `false`，然后按 [docs/CLOUD_SETUP.md](docs/CLOUD_SETUP.md) 配置云开发环境。

## 📱 角色说明

| 角色 | 功能 |
|------|------|
| **管理员** | 项目管理、专家管理、评委指派、查看汇总排名、开启/关闭批次 |
| **评审专家** | 查看被分配的项目、填写评分表、保存草稿、提交评审、退回复审 |
| **领导** | 查看评审结果汇总和排名 |
| **未绑定用户** | 显示"账号待管理员开通"，不可访问业务功能 |

## 🔄 评审状态流

```
assigned → draft → submitted → (returned → resubmitted) → locked
```

## 🧪 运行测试

```bash
node tests/scoring.test.js
# 或
node tests/run-all.js
```

## 📖 更多文档

- [云开发部署指南](docs/CLOUD_SETUP.md)
- [数据库结构说明](docs/DATABASE_SCHEMA.md)
- [角色权限矩阵](docs/ROLE_PERMISSION.md)
- [数据迁移指南](docs/MIGRATION.md)
- [V1.0.1 测试报告](docs/V1.0.1_TEST_REPORT.md)
- [已知限制](docs/KNOWN_LIMITATIONS.md)
