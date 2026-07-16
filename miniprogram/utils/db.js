/**
 * 数据存储抽象层
 * 开发阶段用本地 storage，上线后切云开发
 */

const USE_CLOUD = false; // 上线后改为 true
const DB_PREFIX = 'cr_';

let db = null;
let _ = null;

function initCloud() {
  if (USE_CLOUD && !db) {
    wx.cloud.init({ env: 'your-env-id' });
    db = wx.cloud.database();
    _ = db.command;
  }
}

function storageKey(key) { return DB_PREFIX + key; }

async function get(collection, id) {
  if (USE_CLOUD) {
    const res = await db.collection(collection).doc(id).get();
    return res.data;
  }
  return wx.getStorageSync(storageKey(collection + '_' + id)) || null;
}

async function list(collection, query = {}) {
  if (USE_CLOUD) {
    let cmd = db.collection(collection);
    if (query.where) cmd = cmd.where(query.where);
    if (query.orderBy) cmd = cmd.orderBy(query.orderBy[0], query.orderBy[1]);
    const res = await cmd.get();
    return res.data;
  }
  const all = wx.getStorageSync(storageKey(collection + '_all')) || [];
  return all;
}

async function save(collection, data) {
  if (USE_CLOUD) {
    if (data._id) {
      await db.collection(collection).doc(data._id).update({ data });
    } else {
      const res = await db.collection(collection).add({ data });
      data._id = res._id;
    }
    return data;
  }
  if (!data._id) data._id = collection + '_' + Date.now();
  const all = wx.getStorageSync(storageKey(collection + '_all')) || [];
  const idx = all.findIndex(x => x._id === data._id);
  if (idx >= 0) all[idx] = data;
  else all.push(data);
  wx.setStorageSync(storageKey(collection + '_all'), all);
  return data;
}

async function remove(collection, id) {
  if (USE_CLOUD) {
    await db.collection(collection).doc(id).remove();
    return;
  }
  const all = wx.getStorageSync(storageKey(collection + '_all')) || [];
  const filtered = all.filter(x => x._id !== id);
  wx.setStorageSync(storageKey(collection + '_all'), filtered);
}

module.exports = { initCloud, get, list, save, remove, USE_CLOUD };
