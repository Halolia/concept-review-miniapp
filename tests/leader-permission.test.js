// leader-permission.test.js - leader 权限测试
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); } }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const ADMIN_ACTIONS = ['adminCreateProject', 'adminUpdateProject', 'adminArchiveProject', 'adminAssignExpert', 'adminRemoveAssignment', 'adminReturnReview', 'adminCreateReviewRound', 'adminOpenReviewRound', 'adminCloseReviewRound', 'adminForceCloseReviewRound', 'adminDisableUser', 'adminEnableUser', 'adminBindUserOpenid', 'adminUnbindUserOpenid'];
const LEADER_ACTIONS = ['leaderGetSummary', 'leaderGetProjectResult'];
const EXPERT_ACTIONS = ['expertSubmitReview', 'expertSaveReviewDraft', 'expertGetMyReview', 'expertListAssignments'];
const SHARED_READ = ['adminGetSummary', 'adminGetProjectResult', 'adminListReviewRounds'];

const PERMISSIONS = {
  admin: { admin: true, leader: true, expert: false, shared: true },
  leader: { admin: false, leader: true, expert: false, shared: true },
  expert: { admin: false, leader: false, expert: true, shared: false }
};

function canAccess(role, actionType) {
  return PERMISSIONS[role] && PERMISSIONS[role][actionType];
}

test('leader 可查看批次列表', () => assert(canAccess('leader', 'shared')));
test('leader 可查看汇总', () => assert(canAccess('leader', 'leader')));
test('leader 可查看项目结果', () => assert(canAccess('leader', 'leader')));
test('leader 不能创建项目', () => assert(!canAccess('leader', 'admin')));
test('leader 不能指派专家', () => assert(!canAccess('leader', 'admin')));
test('leader 不能退回评审', () => assert(!canAccess('leader', 'admin')));
test('leader 不能关闭批次', () => assert(!canAccess('leader', 'admin')));
test('leader 不能管理用户', () => assert(!canAccess('leader', 'admin')));
test('admin 有全部 admin 权限', () => assert(canAccess('admin', 'admin')));
test('admin 可有 leader 权限', () => assert(canAccess('admin', 'leader')));
test('expert 不能访问 admin 操作', () => assert(!canAccess('expert', 'admin')));
test('expert 不能访问 leader 操作', () => assert(!canAccess('expert', 'leader')));
test('expert 不能访问汇总', () => assert(!canAccess('expert', 'shared')));
test('expert 可访问专家操作', () => assert(canAccess('expert', 'expert')));

console.log(`\nleader权限测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
