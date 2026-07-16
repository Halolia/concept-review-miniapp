const { SCORING_DIMENSIONS, getGrade } = require('./constants');

/**
 * 计算总分和等级
 */
function calcScore(scores) {
  let total = 0;
  SCORING_DIMENSIONS.forEach(dim => {
    dim.items.forEach(item => {
      total += (scores && scores[item.id]) || 0;
    });
  });
  return { total, grade: getGrade(total) };
}

/**
 * 生成唯一 ID
 */
function uid() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * 格式化时间
 */
function fmtDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = { calcScore, uid, fmtDate };
