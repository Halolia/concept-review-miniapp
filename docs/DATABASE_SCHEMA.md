# 数据库结构说明 (DATABASE_SCHEMA)

## 概览

共 6 个集合，全部使用服务端时间戳 `db.serverDate()`。

---

## 1. users — 用户

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档ID |
| `openid` | string | 是 | 微信 OPENID，唯一索引 |
| `name` | string | 是 | 用户姓名 |
| `role` | string | 是 | 角色：`admin` / `expert` / `leader` |
| `organization` | string | 否 | 所属单位 |
| `title` | string | 否 | 职称 |
| `phone` | string | 否 | 联系电话 |
| `status` | string | 是 | 状态：`active` / `disabled` / `terminated` |
| `createdAt` | Date | 是 | 创建时间 |
| `updatedAt` | Date | 是 | 更新时间 |

**状态枚举**：
- `active` — 正常可用
- `disabled` — 已停用（不可访问业务数据）
- `terminated` — 已删除（逻辑删除）

---

## 2. projects — 项目

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档ID |
| `name` | string | 是 | 项目名称 |
| `institution` | string | 否 | 依托单位 |
| `leader` | string | 否 | 项目负责人 |
| `description` | string | 否 | 项目简介 |
| `status` | string | 是 | 状态：`active` / `archived` / `terminated` |
| `createdBy` | string | 是 | 创建者 ID（关联 users._id） |
| `createdAt` | Date | 是 | 创建时间 |
| `updatedAt` | Date | 是 | 更新时间 |

**状态枚举**：
- `active` — 活跃（参与评审）
- `archived` — 已归档（不参与新批次，历史数据保留）
- `terminated` — 终止（逻辑删除）

> ⚠️ 有评审数据的项目不可物理删除，只能用 `archived`。

---

## 3. review_rounds — 评审批次

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档ID |
| `name` | string | 是 | 批次名称 |
| `roundNo` | number | 是 | 批次编号 |
| `status` | string | 是 | 状态：`draft` / `open` / `closed` |
| `startAt` | Date | 否 | 开放时间 |
| `deadline` | Date | 否 | 截止日期 |
| `closedAt` | Date | 否 | 关闭时间 |
| `createdBy` | string | 是 | 创建者 ID |
| `createdAt` | Date | 是 | 创建时间 |
| `updatedAt` | Date | 是 | 更新时间 |

**状态枚举**：
- `draft` — 草稿（不可评审）
- `open` — 开放中（专家可提交评审）
- `closed` — 已关闭（所有评审锁定，正式排名生效）

---

## 4. review_assignments — 指派关系

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档ID |
| `projectId` | string | 是 | 项目 ID |
| `roundId` | string | 是 | 批次 ID |
| `expertId` | string | 是 | 专家 ID（users._id） |
| `status` | string | 是 | 状态 |
| `assignedAt` | Date | 是 | 指派时间 |
| `submittedAt` | Date | 否 | 提交时间 |
| `updatedAt` | Date | 是 | 更新时间 |

**状态枚举**：
- `assigned` — 已指派（待评审）
- `draft` — 草稿中
- `submitted` — 已提交
- `returned` — 已退回
- `resubmitted` — 已重新提交
- `locked` — 已锁定（批次关闭后）

---

## 5. reviews — 评审记录

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档ID |
| `projectId` | string | 是 | 项目 ID |
| `roundId` | string | 是 | 批次 ID |
| `assignmentId` | string | 是 | 指派 ID（唯一，用于幂等） |
| `expertId` | string | 是 | 专家 ID |
| `expertName` | string | 是 | 专家姓名（冗余） |
| `scores` | object | 是 | 15 项评分 { key: number } |
| `totalScore` | number | 是 | 总分（服务端计算） |
| `grade` | string | 是 | 等级（服务端计算） |
| `comments` | string | 是 | 评审意见 |
| `recommendedFunding` | number | 是 | 建议经费（万元） |
| `fundingComment` | string | 否 | 经费说明 |
| `status` | string | 是 | 状态 |
| `version` | number | 是 | 版本号（退回重提后递增） |
| `returnReason` | string | 否 | 退回原因 |
| `returnedAt` | Date | 否 | 退回时间 |
| `submittedAt` | Date | 否 | 提交时间 |
| `createdAt` | Date | 是 | 创建时间 |
| `updatedAt` | Date | 是 | 更新时间 |

**scores 字段**（15 项，总分 100）：

| key | 名称 | 满分 |
|-----|------|------|
| `economicSignificance` | 项目的经济社会意义 | 5 |
| `marketForecast` | 市场分析预测的合理性 | 5 |
| `marketCompetitiveness` | 产品的市场竞争优势和成长性 | 15 |
| `technicalInnovation` | 技术前瞻性、创新性、引领性和颠覆性 | 10 |
| `technicalMaturity` | 项目成熟度（现状及所处阶段） | 10 |
| `industrializationRoute` | 产业化路线的可行性 | 10 |
| `implementationMethod` | 项目实施方式可行性 | 5 |
| `implementationSchedule` | 实施进度安排合理性 | 5 |
| `milestoneFeasibility` | 节点目标与考核指标可行性 | 5 |
| `leaderCapability` | 项目负责人综合能力水平 | 5 |
| `teamCapability` | 团队成员能力及结构合理性 | 5 |
| `fundingReasonableness` | 资金需求及筹措方案合理性 | 5 |
| `equipmentMaterialFeasibility` | 主要设备和原料的可行性 | 5 |
| `economicBenefitProbability` | 实现预期经济效益的可能性 | 5 |
| `technicalRiskControl` | 技术风险和规避措施的合理性 | 5 |

**状态枚举**：
- `draft` — 草稿（未提交）
- `submitted` — 已提交
- `returned` — 已退回
- `resubmitted` — 已重新提交
- `locked` — 已锁定（批次关闭后）

---

## 6. audit_logs — 操作日志

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档ID |
| `operatorId` | string | 是 | 操作者 ID |
| `operatorName` | string | 是 | 操作者姓名 |
| `action` | string | 是 | 操作类型 |
| `targetType` | string | 是 | 目标类型 |
| `targetId` | string | 是 | 目标 ID |
| `beforeData` | object | 否 | 操作前数据 |
| `afterData` | object | 否 | 操作后数据 |
| `reason` | string | 否 | 操作原因 |
| `createdAt` | Date | 是 | 操作时间 |

**action 枚举**：
- `CREATE_PROJECT`、`UPDATE_PROJECT`、`ARCHIVE_PROJECT`
- `CREATE_USER`、`UPDATE_USER`、`DISABLE_USER`、`ENABLE_USER`
- `CREATE_ROUND`、`OPEN_ROUND`、`CLOSE_ROUND`
- `ASSIGN_EXPERT`、`REMOVE_ASSIGNMENT`
- `SUBMIT_REVIEW`、`RESUBMIT_REVIEW`、`RETURN_REVIEW`
