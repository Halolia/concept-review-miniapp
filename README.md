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

## 📖 更多文档

- [云开发部署指南](docs/CLOUD_SETUP.md)
- [数据库结构说明](docs/DATABASE_SCHEMA.md)
- [角色权限矩阵](docs/ROLE_PERMISSION.md)
- [数据迁移指南](docs/MIGRATION.md)
