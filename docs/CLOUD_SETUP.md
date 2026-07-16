# 云开发部署指南

## 前置条件

1. 已注册微信小程序，获取 AppID
2. 已在 `project.config.json` 中填入 AppID

## 第一步：开通云开发

1. 打开微信开发者工具，打开本项目
2. 点击工具栏「云开发」按钮
3. 首次使用需开通：设置环境名称（如 `concept-review`），选择「按量付费」或「免费额度」
4. 等待环境创建完成

## 第二步：配置环境 ID

1. 在云开发控制台顶部查看 **环境 ID**
2. 修改 `miniprogram/app.js` 中的云环境 ID：

```javascript
wx.cloud.init({
  env: 'your-env-id', // ← 替换为你的实际环境 ID
  traceUser: true
});
```

3. 将所有云函数的 `cloud.init()` 保持一致（已使用 `cloud.DYNAMIC_CURRENT_ENV`，无需修改）

## 第三步：创建数据库集合

在云开发控制台 → 数据库 → 创建以下 6 个集合：

| 集合名 | 说明 | 权限 |
|--------|------|------|
| `users` | 用户身份绑定 | 仅创建者可读写 |
| `projects` | 项目数据 | 仅创建者可读写 |
| `review_rounds` | 评审批次 | 仅创建者可读写 |
| `review_assignments` | 专家指派 | 仅创建者可读写 |
| `reviews` | 评审记录 | 仅创建者可读写 |
| `audit_logs` | 操作日志 | 仅创建者可读写 |

> ⚠️ **重要**：所有集合的权限必须设为「仅创建者可读写」，不能设为「所有用户可读写」，因为权限由云函数内部校验。

## 第四步：上传云函数

### 4.1 安装依赖

在微信开发者工具中，右键 `cloudfunctions/reviewFunctions` 文件夹：

1. 选择「在终端中打开」
2. 运行 `npm install`

### 4.2 上传部署

右键 `cloudfunctions/reviewFunctions` → 「上传并部署：云端安装依赖」

等待上传完成。

### 4.3 删除旧云函数

在云开发控制台 → 云函数中，删除 `quickstartFunctions`（如果存在）。该旧函数包含通用 CRUD 接口，不符合当前权限体系。

## 第五步：初始化数据

### 5.1 获取管理员 OPENID

1. 在微信开发者工具中新建一个测试页面，或在云函数中添加临时代码
2. 通过 `cloud.getWXContext().OPENID` 获取当前用户的 OPENID
3. 记录下来

### 5.2 配置管理员 OPENID

修改 `scripts/initData.js` 中的 `getAdminOpenid()` 函数，替换为你的 OPENID。

### 5.3 执行初始化

可在 reviewFunctions 云函数中添加 `initData` action，或通过开发者工具手动执行 `scripts/initData.js` 中的逻辑。

初始化将创建：
- 1 个管理员账号
- 5 个专家账号（待绑定真实 OPENID）
- 11 个 Mock 项目
- 1 个默认评审批次
- 项目与专家的指派关系

## 第六步：切换到正式模式

修改 `miniprogram/utils/request.js`：

```javascript
const DEBUG_MODE = false; // ← 改为 false
```

重新编译小程序。

## 第七步：绑定专家 OPENID

1. 让每位专家使用自己的微信打开小程序
2. 系统会记录他们的 OPENID
3. 管理员在「评委管理」中，将专家的 OPENID 填入对应姓名

> 另一种方式：让专家先打开小程序，在控制台云函数日志中查看 OPENID，然后管理员手动绑定。

## 环境变量

无。所有配置通过云数据库和代码中的常量管理。

## 常见问题

### Q: 云函数调用报错 "PERMISSION_DENIED"
A: 数据库权限设置错误，所有集合须设为「仅创建者可读写」。

### Q: 用户显示"账号待管理员开通"
A: 管理员的 OPENID 未绑定，或该用户的 OPENID 未在 users 集合中创建记录。

### Q: 如何关闭 DEBUG 模式
A: 将 `miniprogram/utils/request.js` 中 `DEBUG_MODE` 改为 `false`。
