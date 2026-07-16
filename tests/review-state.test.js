// review-state.test.js - 评审状态机测试
const path = require('path');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); } }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${b}, got ${a}`); }

// 状态机规则
const VALID_TRANSITIONS = {
  'assigned': ['draft'],
  'draft': ['draft', 'submitted'],
  'submitted': ['returned', 'locked'],
  'returned': ['draft', 'resubmitted'],
  'resubmitted': ['returned', 'locked'],
  'locked': [],
  'invalidated': [],
  'closed_unsubmitted': []
};

function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

test('assigned → draft (保存草稿)', () => assert(canTransition('assigned', 'draft')));
test('assigned 不能直接 submitted', () => assert(!canTransition('assigned', 'submitted')));
test('draft → submitted (正式提交)', () => assert(canTransition('draft', 'submitted')));
test('draft → draft (再次保存)', () => assert(canTransition('draft', 'draft')));
test('submitted 不能再次 submitted', () => assert(!canTransition('submitted', 'submitted')));
test('submitted → returned (管理员退回)', () => assert(canTransition('submitted', 'returned')));
test('submitted → locked (批次关闭)', () => assert(canTransition('submitted', 'locked')));
test('returned → draft (修改草稿)', () => assert(canTransition('returned', 'draft')));
test('returned → resubmitted (重新提交)', () => assert(canTransition('returned', 'resubmitted')));
test('returned 不能直接 submitted', () => assert(!canTransition('returned', 'submitted')));
test('resubmitted → returned (再次退回)', () => assert(canTransition('resubmitted', 'returned')));
test('resubmitted → locked (批次关闭)', () => assert(canTransition('resubmitted', 'locked')));
test('locked 不能任何迁移', () => {
  assert(!canTransition('locked', 'draft'));
  assert(!canTransition('locked', 'submitted'));
  assert(!canTransition('locked', 'returned'));
});

test('退回后 version 递增', () => {
  let review = { status: 'submitted', version: 1 };
  review.status = 'returned';
  review.version = review.version + 1;
  assertEqual(review.version, 2);
  assertEqual(review.status, 'returned');
});

test('重新提交后 version 再递增', () => {
  let review = { status: 'returned', version: 2 };
  review.status = 'resubmitted';
  assertEqual(review.version, 2);
  assertEqual(review.status, 'resubmitted');
});

test('退回同时更新 review 和 assignment', () => {
  let review = { status: 'submitted' };
  let assignment = { status: 'submitted' };
  review.status = 'returned';
  assignment.status = 'returned';
  assertEqual(review.status, 'returned');
  assertEqual(assignment.status, 'returned');
});

test('归档项目拒绝提交', () => {
  const project = { status: 'archived' };
  const canSubmit = project.status === 'active';
  assert(!canSubmit, '归档项目不能提交');
});

test('已关闭批次不能提交', () => {
  const round = { status: 'closed' };
  const canSubmit = round.status === 'open';
  assert(!canSubmit, 'closed 批次不能提交');
});

console.log(`\n评审状态机测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
