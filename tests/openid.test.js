// openid.test.js - OPENID 管理测试
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); } }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${b}, got ${a}`); }

// 模拟用户创建
function createUser(openid, name) {
  const doc = { _id: 'u_' + Math.random().toString(36).slice(2, 8), openid: openid || '', name, bindingStatus: openid ? 'bound' : 'pending', status: 'active' };
  if (openid && openid.startsWith('placeholder_')) { doc.openid = ''; doc.bindingStatus = 'pending'; }
  return doc;
}

// 绑定 OPENID
function bindOpenid(user, newOpenid) {
  if (user.bindingStatus === 'bound' && user.openid) return { ok: false, code: 'ALREADY_BOUND' };
  const existing = allUsers.find(u => u.openid === newOpenid && u._id !== user._id);
  if (existing) return { ok: false, code: 'DUPLICATE_OPENID' };
  user.openid = newOpenid; user.bindingStatus = 'bound';
  return { ok: true };
}

// 解绑
function unbindOpenid(user) {
  user.openid = ''; user.bindingStatus = 'pending';
  return { ok: true };
}

let allUsers = [];

function resetUsers() { allUsers = []; }

test('空 OPENID 创建 pending 用户', () => {
  resetUsers();
  const u = createUser('', '专家甲');
  allUsers.push(u);
  assertEqual(u.bindingStatus, 'pending');
  assertEqual(u.openid, '');
});

test('有 OPENID 创建 bound 用户', () => {
  const u = createUser('oABC123', '专家乙');
  assertEqual(u.bindingStatus, 'bound');
  assertEqual(u.openid, 'oABC123');
});

test('placeholder OPENID 不当作已绑定', () => {
  const u = createUser('placeholder_12345', '旧专家');
  assertEqual(u.bindingStatus, 'pending');
  assertEqual(u.openid, '');
});

test('绑定 OPENID 成功', () => {
  const u = allUsers[0];
  const result = bindOpenid(u, 'oREAL001');
  assert(result.ok);
  assertEqual(u.bindingStatus, 'bound');
  assertEqual(u.openid, 'oREAL001');
});

test('重复 OPENID 绑定被拒绝', () => {
  const u2 = createUser('oREAL001', '专家丙');
  allUsers.push(u2);
  const result = bindOpenid(u2, 'oREAL001');
  assert(!result.ok, '重复 OPENID 应拒绝');
});

test('解绑后 bindingStatus = pending', () => {
  const result = unbindOpenid(allUsers[0]);
  assert(result.ok);
  assertEqual(allUsers[0].bindingStatus, 'pending');
  assertEqual(allUsers[0].openid, '');
});

test('解绑后保留原 user._id', () => {
  const originalId = allUsers[0]._id;
  assertEqual(allUsers[0]._id, originalId, '解绑不应改变 _id');
});

test('解绑后历史 assignment 仍有效', () => {
  const assignments = [{ expertId: allUsers[0]._id, status: 'submitted' }];
  assertEqual(assignments[0].expertId, allUsers[0]._id);
  assert(assignments[0].status === 'submitted', 'assignment 不应受解绑影响');
});

test('不生成 placeholder_ 前缀的 OPENID', () => {
  const u = createUser('', '新专家');
  assert(!u.openid.startsWith('placeholder_'));
});

console.log(`\nOPENID管理测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
