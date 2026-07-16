/**
 * ID / Token 生成工具
 * 用于生成邀请 token（adminRegenerateToken 时使用）
 */

const crypto = require('crypto');

/**
 * 生成随机 token 字符串（24 字符十六进制）
 */
function getNewId() {
  return crypto.randomBytes(12).toString('hex');
}

module.exports = { getNewId };
