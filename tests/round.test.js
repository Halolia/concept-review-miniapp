/**
 * 评审批次开启/关闭逻辑测试
 * 运行：node tests/round.test.js
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ═══ 被测函数（从云函数 index.js 与 localFallback 提取的纯逻辑） ═══

/**
 * 开启评审批次
 * 规则：
 *   - 只有 draft 状态可以开启
 *   - 不能有其他 open 的批次
 *   - 批次下必须有指派
 * 来源：adminOpenReviewRound（云函数）+ localFallback 的 adminOpenReviewRound
 */
function openRound(round, allRounds, assignments) {
  if (!round) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };
  if (round.status !== 'draft') {
    return { ok: false, code: 'STATUS_ERROR', message: '只有草稿状态才能开启' };
  }
  // 检查是否有其他 open 批次
  const otherOpen = allRounds.filter(r => r._id !== round._id && r.status === 'open');
  if (otherOpen.length > 0) {
    return { ok: false, code: 'ANOTHER_OPEN', message: '已有其他开放批次，请先关闭' };
  }
  // 检查是否有指派
  const hasAssignments = assignments.some(a => a.roundId === round._id && a.status !== 'removed');
  if (!hasAssignments) {
    return { ok: false, code: 'NO_ASSIGNMENTS', message: '批次下没有指派，无法开启' };
  }
  round.status = 'open';
  round.startAt = Date.now();
  return { ok: true, data: { ...round } };
}

/**
 * 关闭评审批次
 * 规则：
 *   - 只有 open 状态可以关闭
 *   - 所有非 removed 指派必须全部已提交
 * 来源：adminCloseReviewRound（云函数）+ localFallback 的 adminCloseReviewRound
 */
function closeRound(round, assignments) {
  if (!round) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };
  if (round.status !== 'open') {
    return { ok: false, code: 'STATUS_ERROR', message: '只有开放状态才能关闭' };
  }
  const activeAssignments = assignments.filter(a => a.roundId === round._id && a.status !== 'removed');
  if (activeAssignments.length === 0) {
    return { ok: false, code: 'NO_ASSIGNMENTS', message: '批次下没有有效指派' };
  }
  const submitted = activeAssignments.filter(a => ['submitted', 'resubmitted', 'locked'].includes(a.status)).length;
  if (submitted < activeAssignments.length) {
    return {
      ok: false,
      code: 'UNFINISHED_ASSIGNMENTS',
      message: '存在未完成的评审',
      data: { total: activeAssignments.length, completed: submitted, unfinished: activeAssignments.length - submitted }
    };
  }
  round.status = 'closed';
  round.closedAt = Date.now();
  return { ok: true, data: { ...round } };
}

/**
 * 强制关闭评审批次（跳过未完成校验）
 * 来源：localFallback 的 adminForceCloseReviewRound
 */
function forceCloseRound(round, assignments, reason) {
  if (!round) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };
  if (round.status !== 'open') {
    return { ok: false, code: 'STATUS_ERROR', message: '只有开放状态才能强制关闭' };
  }
  round.status = 'closed';
  round.closedAt = Date.now();
  // 未提交的指派标记为 closed_unsubmitted
  assignments.forEach(a => {
    if (a.roundId === round._id && !['submitted', 'resubmitted', 'locked', 'removed'].includes(a.status)) {
      a.status = 'closed_unsubmitted';
    }
  });
  return { ok: true, data: { ...round }, reason };
}

// ═══ 辅助函数 ═══

function makeRound(id, name, status) {
  return { _id: id, name, status, roundNo: 1, startAt: null, closedAt: null };
}

function makeAssignment(id, roundId, status) {
  return { _id: id, roundId, status };
}

// ═══ 开启批次测试 ═══

test('开启: draft 可以开启', () => {
  const round = makeRound('r1', '第一批评审', 'draft');
  const allRounds = [round];
  const assignments = [makeAssignment('a1', 'r1', 'assigned')];
  const result = openRound(round, allRounds, assignments);
  assert.ok(result.ok);
  assert.strictEqual(result.data.status, 'open');
  assert.ok(result.data.startAt > 0);
});

test('开启: 批次不存在返回 NOT_FOUND', () => {
  const result = openRound(null, [], []);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'NOT_FOUND');
});

test('开启: closed 批次不可开启', () => {
  const round = makeRound('r1', '第一批评审', 'closed');
  const result = openRound(round, [round], [makeAssignment('a1', 'r1', 'submitted')]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'STATUS_ERROR');
  assert.ok(result.message.includes('草稿'));
});

test('开启: 已经 open 的批次不可再次开启', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const result = openRound(round, [round], [makeAssignment('a1', 'r1', 'submitted')]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'STATUS_ERROR');
});

test('开启: 有其他 open 批次时不可开启新批次', () => {
  const round = makeRound('r1', '第一批评审', 'draft');
  const otherRound = makeRound('r2', '第二批评审', 'open');
  const result = openRound(round, [round, otherRound], [makeAssignment('a1', 'r1', 'assigned')]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'ANOTHER_OPEN');
});

test('开启: 无指派时不可开启', () => {
  const round = makeRound('r1', '第一批评审', 'draft');
  const result = openRound(round, [round], []);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'NO_ASSIGNMENTS');
});

test('开启: 只有 removed 指派时不可开启', () => {
  const round = makeRound('r1', '第一批评审', 'draft');
  const assignments = [makeAssignment('a1', 'r1', 'removed')];
  const result = openRound(round, [round], assignments);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'NO_ASSIGNMENTS');
});

test('开启: 同一个批次开启后状态变为 open', () => {
  const round = makeRound('r1', '测试批次', 'draft');
  // 状态在调用前为 draft
  assert.strictEqual(round.status, 'draft');
  const result = openRound(round, [round], [makeAssignment('a1', 'r1', 'assigned')]);
  assert.ok(result.ok);
  assert.strictEqual(round.status, 'open'); // 原对象已被修改
});

// ═══ 关闭批次测试 ═══

test('关闭: 全部提交成功关闭', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'submitted'),
    makeAssignment('a2', 'r1', 'submitted'),
    makeAssignment('a3', 'r1', 'submitted'),
  ];
  const result = closeRound(round, assignments);
  assert.ok(result.ok);
  assert.strictEqual(result.data.status, 'closed');
  assert.ok(result.data.closedAt > 0);
});

test('关闭: 含 resubmitted 状态可以关闭', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'submitted'),
    makeAssignment('a2', 'r1', 'resubmitted'),
    makeAssignment('a3', 'r1', 'locked'),
  ];
  const result = closeRound(round, assignments);
  assert.ok(result.ok);
  assert.strictEqual(result.data.status, 'closed');
});

test('关闭: 有未提交指派时失败', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'submitted'),
    makeAssignment('a2', 'r1', 'assigned'),
    makeAssignment('a3', 'r1', 'draft'),
  ];
  const result = closeRound(round, assignments);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'UNFINISHED_ASSIGNMENTS');
  assert.strictEqual(result.data.total, 3);
  assert.strictEqual(result.data.completed, 1);
  assert.strictEqual(result.data.unfinished, 2);
});

test('关闭: 含 assigned/draft/returned 状态不可关闭', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'submitted'),
    makeAssignment('a2', 'r1', 'submitted'),
    makeAssignment('a3', 'r1', 'returned'), // 退回状态也未完成
  ];
  const result = closeRound(round, assignments);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'UNFINISHED_ASSIGNMENTS');
  assert.strictEqual(result.data.unfinished, 1);
});

test('关闭: 批次不存在返回 NOT_FOUND', () => {
  const result = closeRound(null, []);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'NOT_FOUND');
});

test('关闭: draft 状态不可关闭', () => {
  const round = makeRound('r1', '第一批评审', 'draft');
  const result = closeRound(round, [makeAssignment('a1', 'r1', 'submitted')]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'STATUS_ERROR');
});

test('关闭: closed 状态不可再次关闭', () => {
  const round = makeRound('r1', '第一批评审', 'closed');
  const result = closeRound(round, [makeAssignment('a1', 'r1', 'submitted')]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'STATUS_ERROR');
});

test('关闭: removed 指派不计入未完成', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'submitted'),
    makeAssignment('a2', 'r1', 'submitted'),
    makeAssignment('a3', 'r1', 'removed'), // 已移除，不参与校验
  ];
  const result = closeRound(round, assignments);
  assert.ok(result.ok);
});

test('关闭: 无有效指派时不可关闭', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'removed'),
    makeAssignment('a2', 'r1', 'removed'),
  ];
  const result = closeRound(round, assignments);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'NO_ASSIGNMENTS');
});

// ═══ 强制关闭测试 ═══

test('强制关闭: 有未提交也能关闭', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'submitted'),
    makeAssignment('a2', 'r1', 'assigned'),
    makeAssignment('a3', 'r1', 'draft'),
  ];
  const result = forceCloseRound(round, assignments, '评审时间截止');
  assert.ok(result.ok);
  assert.strictEqual(result.data.status, 'closed');
  assert.strictEqual(result.reason, '评审时间截止');
});

test('强制关闭: 未提交指派标记为 closed_unsubmitted', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'submitted'),
    makeAssignment('a2', 'r1', 'assigned'),
    makeAssignment('a3', 'r1', 'draft'),
    makeAssignment('a4', 'r1', 'returned'),
  ];
  forceCloseRound(round, assignments, '强制截止');
  assert.strictEqual(assignments[1].status, 'closed_unsubmitted'); // assigned
  assert.strictEqual(assignments[2].status, 'closed_unsubmitted'); // draft
  assert.strictEqual(assignments[3].status, 'closed_unsubmitted'); // returned
  // submitted 保持不变
  assert.strictEqual(assignments[0].status, 'submitted');
});

test('强制关闭: removed 指派不受影响', () => {
  const round = makeRound('r1', '第一批评审', 'open');
  const assignments = [
    makeAssignment('a1', 'r1', 'submitted'),
    makeAssignment('a2', 'r1', 'removed'),
  ];
  forceCloseRound(round, assignments, '强制截止');
  assert.strictEqual(assignments[1].status, 'removed'); // 保持不变
});

test('强制关闭: closed 批次不可强制关闭', () => {
  const round = makeRound('r1', '第一批评审', 'closed');
  const result = forceCloseRound(round, [], '再次强制');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'STATUS_ERROR');
});

test('强制关闭: draft 批次不可强制关闭', () => {
  const round = makeRound('r1', '第一批评审', 'draft');
  const result = forceCloseRound(round, [], '直接强制');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'STATUS_ERROR');
});

test('强制关闭: 批次不存在返回 NOT_FOUND', () => {
  const result = forceCloseRound(null, [], '不存在');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'NOT_FOUND');
});

// ═══ 完整生命周期测试 ═══

test('完整流程: draft → open → close', () => {
  const round = makeRound('r1', '生命周期测试', 'draft');
  const allRounds = [round];
  const assignments = [
    makeAssignment('a1', 'r1', 'assigned'),
    makeAssignment('a2', 'r1', 'assigned'),
    makeAssignment('a3', 'r1', 'assigned'),
  ];

  // 1. 开启
  const openResult = openRound(round, allRounds, assignments);
  assert.ok(openResult.ok);
  assert.strictEqual(round.status, 'open');

  // 2. 全部提交
  assignments.forEach(a => { a.status = 'submitted'; });

  // 3. 关闭
  const closeResult = closeRound(round, assignments);
  assert.ok(closeResult.ok);
  assert.strictEqual(round.status, 'closed');
});

test('完整流程: draft → open → forceClose（含未提交）', () => {
  const round = makeRound('r1', '强制流程测试', 'draft');
  const assignments = [
    makeAssignment('a1', 'r1', 'assigned'),
    makeAssignment('a2', 'r1', 'assigned'),
  ];

  // 开启
  openRound(round, [round], assignments);
  assert.strictEqual(round.status, 'open');

  // 仅 1 条提交
  assignments[0].status = 'submitted';

  // 普通关闭应该失败
  const normalClose = closeRound(round, assignments);
  assert.strictEqual(normalClose.ok, false);

  // 强制关闭应该成功
  const forceClose = forceCloseRound(round, assignments, '超时');
  assert.ok(forceClose.ok);
  assert.strictEqual(round.status, 'closed');
  assert.strictEqual(assignments[1].status, 'closed_unsubmitted');
});

test('完整流程: 关闭后不可重新开启', () => {
  const round = makeRound('r1', '已关闭批次', 'closed');
  const result = openRound(round, [round], [makeAssignment('a1', 'r1', 'submitted')]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'STATUS_ERROR');
});

console.log(`\n评审批次测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
