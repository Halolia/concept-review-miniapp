/**
 * 审计日志
 */

/**
 * 记录操作日志
 * @param {object} db
 * @param {object} operator - { _id, name }
 * @param {string} action
 * @param {string} targetType
 * @param {string} targetId
 * @param {object} [beforeData]
 * @param {object} [afterData]
 * @param {string} [reason]
 */
async function log(db, operator, action, targetType, targetId, beforeData, afterData, reason) {
  try {
    await db.collection('audit_logs').add({
      data: {
        operatorId: operator._id,
        operatorName: operator.name,
        action,
        targetType,
        targetId,
        beforeData: beforeData || null,
        afterData: afterData || null,
        reason: reason || '',
        createdAt: db.serverDate()
      }
    });
  } catch (e) {
    console.error('审计日志写入失败:', e);
  }
}

module.exports = { log };
