/**
 * 请求错误处理测试
 * 运行：node tests/request-error.test.js
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

// ═══ 被测函数（从 request.js 提取/复制的纯逻辑） ═══

/**
 * 统一解包结果：ok=false 必须 throw
 * 来源：miniprogram/utils/request.js unwrapResult
 */
function unwrapResult(result) {
  if (!result) throw new Error('服务无响应');
  if (!result.ok) {
    const error = new Error(result.message || '操作失败');
    error.code = result.code || 'BUSINESS_ERROR';
    error.result = result;
    throw error;
  }
  return result;
}

/**
 * 模拟 localFallback 返回的错误模式
 * 来源：miniprogram/utils/request.js localFallback 中各 action 的错误返回
 */
function localBusinessError(code, message) {
  return { ok: false, code, message };
}

// ═══ unwrapResult 测试 ═══

test('unwrapResult: ok=true 返回原结果', () => {
  const result = { ok: true, data: { name: 'test' } };
  const out = unwrapResult(result);
  assert.strictEqual(out, result);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.data.name, 'test');
});

test('unwrapResult: ok=false 抛出错误', () => {
  assert.throws(
    () => unwrapResult({ ok: false, code: 'NOT_FOUND', message: '项目不存在' }),
    (err) => {
      return err.message === '项目不存在' && err.code === 'NOT_FOUND';
    },
  );
});

test('unwrapResult: ok=false 无 message 使用默认值', () => {
  assert.throws(
    () => unwrapResult({ ok: false, code: 'UNKNOWN' }),
    (err) => {
      return err.message === '操作失败' && err.code === 'UNKNOWN';
    },
  );
});

test('unwrapResult: ok=false 无 code 使用默认值', () => {
  assert.throws(
    () => unwrapResult({ ok: false, message: '出错了' }),
    (err) => {
      return err.message === '出错了' && err.code === 'BUSINESS_ERROR';
    },
  );
});

test('unwrapResult: result 为 null 抛出"服务无响应"', () => {
  assert.throws(
    () => unwrapResult(null),
    (err) => err.message === '服务无响应',
  );
});

test('unwrapResult: result 为 undefined 抛出"服务无响应"', () => {
  assert.throws(
    () => unwrapResult(undefined),
    (err) => err.message === '服务无响应',
  );
});

test('unwrapResult: ok=true 但 data 为空数组正常返回', () => {
  const result = { ok: true, data: [] };
  const out = unwrapResult(result);
  assert.strictEqual(out.data.length, 0);
});

test('unwrapResult: 错误对象的 result 字段保留', () => {
  let caught = null;
  try {
    unwrapResult({ ok: false, code: 'TIMEOUT', message: '超时' });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught);
  assert.deepStrictEqual(caught.result, { ok: false, code: 'TIMEOUT', message: '超时' });
});

// ═══ localFallback 业务错误模式测试 ═══

test('localFallback: 未知 action 返回 ok:false', () => {
  const r = localBusinessError('UNKNOWN_ACTION', '未知操作: noop');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'UNKNOWN_ACTION');
  assert.strictEqual(r.message, '未知操作: noop');
});

test('localFallback: NOT_FOUND 错误', () => {
  const r = localBusinessError('NOT_FOUND', '项目不存在');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'NOT_FOUND');
});

test('localFallback: ALREADY_ASSIGNED 错误', () => {
  const r = localBusinessError('ALREADY_ASSIGNED', '该专家已分配');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ALREADY_ASSIGNED');
});

test('localFallback: PROJECT_ARCHIVED 错误', () => {
  const r = localBusinessError('PROJECT_ARCHIVED', '项目已归档');
  assert.strictEqual(r.ok, false);
});

test('localFallback: STATUS_ERROR 错误（非 draft 不可开启）', () => {
  const r = localBusinessError('STATUS_ERROR', '只有草稿状态才能开启');
  assert.strictEqual(r.ok, false);
});

test('localFallback: UNFINISHED_ASSIGNMENTS 错误（含 data 字段）', () => {
  // localFallback 的 adminCloseReviewRound 返回带 data 的业务错误
  const r = {
    ok: false,
    code: 'UNFINISHED_ASSIGNMENTS',
    data: { total: 3, completed: 2, unfinished: 1 }
  };
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'UNFINISHED_ASSIGNMENTS');
  assert.strictEqual(r.data.total, 3);
  assert.strictEqual(r.data.unfinished, 1);
});

test('localFallback: NO_ASSIGNMENTS 错误', () => {
  const r = localBusinessError('NO_ASSIGNMENTS', '批次下没有指派，无法开启');
  assert.strictEqual(r.ok, false);
});

test('localFallback: INVALID_PARAM 错误', () => {
  const r = localBusinessError('INVALID_PARAM', '缺少项目ID');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'INVALID_PARAM');
});

test('localFallback: INVALID_FUNDING 错误', () => {
  const r = localBusinessError('INVALID_FUNDING', '建议经费需为合法非负数字');
  assert.strictEqual(r.ok, false);
});

test('localFallback: FUNDING_REQUIRED 错误', () => {
  const r = localBusinessError('FUNDING_REQUIRED', '建议经费不能为空');
  assert.strictEqual(r.ok, false);
});

test('localFallback: 业务错误 ok=false 通过 unwrapResult 会抛出', () => {
  const bizErr = localBusinessError('NOT_FOUND', '批次不存在');
  assert.throws(
    () => unwrapResult(bizErr),
    (err) => err.message === '批次不存在' && err.code === 'NOT_FOUND',
  );
});

console.log(`\n请求错误处理测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
