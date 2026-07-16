# 数据迁移指南

从本地 Storage / Mock 版本迁移到云数据库版本。

## 迁移概览

当前项目有两套数据来源：

- **constants.js** — `MOCK_PROJECTS`、`MOCK_REVIEWERS` 等硬编码数据
- **localStorage** — `wx.getStorageSync` / `wx.setStorageSync` 存储的用户操作数据

迁移目标：
- 所有数据从云数据库读取
- Mock 数据仅作为初始化种子
- 本地存储仅用于 DEBUG 模式

## 迁移步骤

### 第一步：备份本地数据

如果已有评审记录需要保留，先在微信开发者工具中导出：

```javascript
// 在 app.js onLaunch 中临时添加
const allReviews = wx.getStorageSync('cr_reviews_all');
const allProjects = wx.getStorageSync('cr_projects_all');
const allReviewers = wx.getStorageSync('cr_reviewers_all');
console.log('=== 导出现有数据 ===');
console.log('reviews:', JSON.stringify(allReviews));
console.log('projects:', JSON.stringify(allProjects));
console.log('reviewers:', JSON.stringify(allReviewers));
```

复制控制台输出保存到本地文件。

### 第二步：创建云数据库集合

按 `docs/CLOUD_SETUP.md` 中的步骤创建 6 个集合。

### 第三步：执行初始化

使用 `scripts/initData.js` 中的逻辑初始化基础数据。

### 第四步：迁移评审记录（可选）

如果第一步中导出了评审记录，需要手动将数据写入 `reviews` 集合。

⚠️ **注意**：
- 迁移的评审记录需要关联正确的 `projectId`（云数据库中的 `_id`，而非 Mock 的 `p1/p2...`）
- `assignmentId` 需要匹配云数据库中的 `review_assignments._id`
- `totalScore` 和 `grade` 建议由服务端重新计算

建议迁移策略：

1. 先执行 `initData.js` 创建基础数据
2. 记录 Mock ID → 云数据库 ID 的映射关系
3. 逐条将旧评审记录写入云数据库，使用新的 ID 映射

### 第五步：切换正式模式

```javascript
// miniprogram/utils/request.js
const DEBUG_MODE = false;
```

### 第六步：验证

切换后验证：

- [ ] 管理员能正常登录
- [ ] 项目数据同步正确
- [ ] 专家能看到被指派的项目
- [ ] 历史评审记录可查看
- [ ] 新建评审可正常提交
- [ ] 汇总排名计算正确

## 数据映射关系

| 旧字段 | 新字段 | 说明 |
|--------|--------|------|
| `MOCK_PROJECTS[].id` (p1, p2...) | `projects._id` | 云数据库自动生成 |
| `MOCK_REVIEWERS[].id` (r1, r2...) | `users._id` | 云数据库自动生成 |
| `project.reviewers[]` | `review_assignments` 集合 | 独立集合管理 |
| `localStorage.cr_reviews_all` | `reviews` 集合 | 云数据库 |
| `localStorage.cr_role` | `users.role` | 由服务端根据 OPENID 返回 |
| `app.globalData.role` | `getCurrentUser().role` | 不可被前端篡改 |

## 回滚方案

如需回滚到本地 Storage 版本：

```javascript
// miniprogram/utils/request.js
const DEBUG_MODE = true;
```

重新编译即可。

## 注意事项

1. 迁移期间不要同时使用 DEBUG 和正式模式写入数据
2. 建议在非工作时间执行迁移
3. 迁移前通知所有用户暂停使用
4. 保留备份直到新系统稳定运行 1 周以上
