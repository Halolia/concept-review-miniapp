// 云函数入口文件
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 核心云函数 - 处理数据库操作
 */
exports.main = async (event, context) => {
  const { action, collection, data, id, query } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      // 获取用户 openid
      case 'getOpenId':
        return { openid, appid: wxContext.APPID };

      // 通用查询
      case 'list':
        return await listData(collection, query || {});

      // 通用保存
      case 'save':
        return await saveData(collection, data, id);

      // 通用删除
      case 'remove':
        return await removeData(collection, id);

      // 提交评审
      case 'submitReview':
        return await submitReview(data, openid);

      // 获取评审汇总
      case 'getSummary':
        return await getSummary(query);

      // 获取项目列表（带评审状态）
      case 'getProjects':
        return await getProjects(openid, query);

      default:
        return { error: '未知操作: ' + action };
    }
  } catch (err) {
    return { error: err.message, stack: err.stack };
  }
};

/**
 * 提交评审
 */
async function submitReview(data, openid) {
  const { projectId, scores, totalScore, grade, comments, reviewerName } = data;

  // 检查是否已提交过
  const exist = await db.collection('reviews')
    .where({ projectId, expertId: openid })
    .get();

  const reviewData = {
    projectId,
    expertId: openid,
    expertName: reviewerName,
    scores,
    totalScore,
    grade,
    comments,
    updatedAt: Date.now()
  };

  if (exist.data.length > 0) {
    await db.collection('reviews').doc(exist.data[0]._id).update({ data: reviewData });
  } else {
    reviewData.createdAt = Date.now();
    await db.collection('reviews').add({ data: reviewData });
  }

  return { ok: true };
}

/**
 * 获取评审汇总（按项目聚合）
 */
async function getSummary(query) {
  const reviews = await db.collection('reviews').get();
  const projects = await db.collection('projects').get();

  // 按项目聚合
  const projectMap = {};
  projects.data.forEach(p => {
    projectMap[p._id] = { ...p, reviews: [], avgScore: 0 };
  });

  reviews.data.forEach(r => {
    if (projectMap[r.projectId]) {
      projectMap[r.projectId].reviews.push(r);
    }
  });

  const rankings = Object.values(projectMap)
    .filter(p => p.reviews.length > 0)
    .map(p => {
      const sum = p.reviews.reduce((s, r) => s + r.totalScore, 0);
      return {
        ...p,
        avgScore: (sum / p.reviews.length).toFixed(1),
        reviewCount: p.reviews.length
      };
    })
    .sort((a, b) => parseFloat(b.avgScore) - parseFloat(a.avgScore));

  return { rankings, total: rankings.length };
}

/**
 * 获取项目列表（包含当前用户评审状态）
 */
async function getProjects(openid, query) {
  const projects = await db.collection('projects').get();

  // 查询当前用户的评审记录
  const myReviews = await db.collection('reviews')
    .where({ expertId: openid })
    .get();

  const reviewedMap = {};
  myReviews.data.forEach(r => { reviewedMap[r.projectId] = r; });

  const result = projects.data.map(p => ({
    ...p,
    reviewed: !!reviewedMap[p._id],
    myScore: reviewedMap[p._id] ? reviewedMap[p._id].totalScore : null
  }));

  return { projects: result };
}

async function listData(collection, query) {
  const res = await db.collection(collection).where(query).get();
  return res.data;
}

async function saveData(collection, data, id) {
  if (id) {
    await db.collection(collection).doc(id).update({ data });
    return { _id: id, updated: true };
  }
  const res = await db.collection(collection).add({ data });
  return { _id: res._id, created: true };
}

async function removeData(collection, id) {
  await db.collection(collection).doc(id).remove();
  return { removed: id };
}
