import { describe, expect, it } from 'vitest'
import {
  MAX_ITEMS,
  MAX_SHIM,
  MAX_TARGET,
  parseInput,
  solve,
  type ShimInput,
} from './solver'

/**
 * 朴素参考实现：直接枚举 A×B 全部数对建立可达集合。
 * 仅用于小样本与中等规模随机样本的交叉校验。
 */
function bruteForce(input: ShimInput): Set<number> {
  const setB = new Set(input.b)
  const reachable = new Set<number>()
  for (const x of new Set(input.a)) {
    for (const y of setB) {
      reachable.add(x + y)
    }
  }
  return reachable
}

function check(input: ShimInput): void {
  const expected = bruteForce(input)
  const { reachable } = solve(input)
  expect(reachable).toHaveLength(input.targets.length)
  input.targets.forEach((t, i) => {
    expect(reachable[i]).toBe(expected.has(t))
  })
}

describe('朴素小样本', () => {
  it('处理含零、单个规格、空目标以外的基本情形', () => {
    check({ a: [0], b: [0], targets: [0, 1, -0, MAX_TARGET] })
    check({ a: [1, 2, 3], b: [10, 20], targets: [11, 12, 13, 21, 22, 23, 10, 30, 0, 3] })
    check({ a: [0, 0, 0], b: [5, 5], targets: [5, 0, 10, 5, 5] })
  })

  it('重复垫片值视为同一规格，重复目标结论一致', () => {
    const input: ShimInput = {
      a: [7, 7, 7, 3, 3],
      b: [4, 4, 9],
      targets: [11, 11, 16, 12, 3, 0, 11],
    }
    check(input)
    const { reachable } = solve(input)
    expect(reachable[0]).toBe(reachable[1])
    expect(reachable[0]).toBe(reachable[6])
  })

  it('边界目标 0 与 400000 判定正确', () => {
    const reach0 = solve({ a: [0, 1], b: [0, 2], targets: [0] }).reachable[0]
    expect(reach0).toBe(true)
    // 目标 0 不可达且重复出现：缓存初态不得与“不可达”混淆
    expect(
      solve({ a: [1, 2], b: [3, 4], targets: [0, 0, 0, 1] }).reachable,
    ).toEqual([false, false, false, false])
    const reachMax = solve({
      a: [MAX_SHIM],
      b: [MAX_SHIM],
      targets: [MAX_TARGET],
    }).reachable[0]
    expect(reachMax).toBe(true)
    const missMax = solve({
      a: [MAX_SHIM - 1],
      b: [MAX_SHIM],
      targets: [MAX_TARGET],
    }).reachable[0]
    expect(missMax).toBe(false)
  })

  it('结果顺序与目标原序一致', () => {
    const input: ShimInput = {
      a: [100],
      b: [200],
      targets: [300, 299, 300, 0, MAX_TARGET],
    }
    expect(solve(input).reachable).toEqual([true, false, true, false, false])
  })

  it('与朴素实现交叉校验随机小样本', () => {
    let seed = 123456789
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let round = 0; round < 30; round++) {
      const n = 1 + Math.floor(rand() * 20)
      const m = 1 + Math.floor(rand() * 20)
      const a = Array.from({ length: n }, () => Math.floor(rand() * 50))
      const b = Array.from({ length: m }, () => Math.floor(rand() * 50))
      const targets = Array.from({ length: 30 }, () => Math.floor(rand() * 100))
      check({ a, b, targets })
    }
  })
})

describe('稠密集合', () => {
  it('垫片覆盖全区间 0..200000，目标全部可达', () => {
    const a = Array.from({ length: 2001 }, (_, i) => i * 100)
    const b = Array.from({ length: 2001 }, (_, i) => i * 100)
    const targets = [0, 100, 50, MAX_TARGET, MAX_TARGET - 100, 200000, 300000, 399900]
    const { reachable } = solve({ a, b, targets })
    expect(reachable).toEqual([true, true, false, true, true, true, true, true])
  })

  it('两个完整整数区间等于朴素和集（采样交叉校验）', () => {
    const a = Array.from({ length: 500 }, (_, i) => i + 100) // 100..599
    const b = Array.from({ length: 400 }, (_, i) => i * 2 + 50) // 偶数 50..848
    const targets = Array.from({ length: 1000 }, (_, i) => i) // 0..999 全覆盖
    const expected = bruteForce({ a, b, targets })
    const { reachable } = solve({ a, b, targets })
    targets.forEach((t, i) => expect(reachable[i]).toBe(expected.has(t)))
  })
})

describe('稀疏集合', () => {
  it('大数值稀疏点与朴素实现一致（含越界负样本）', () => {
    const a = [0, 1, 99999, 100000, 200000]
    const b = [0, 7, 123456, 200000]
    const targets = [
      0, 1, 7, 8, 123456, 123457, 223455, 223456, 400000, 399999, 200000,
      200001, 100007, 99999, 13, 14,
    ]
    check({ a, b, targets })
  })

  it('满规模 100k×100k 稀疏集合、100k 目标在时限内返回布尔数组', () => {
    const a = Array.from({ length: MAX_ITEMS }, (_, i) => i * 2) // 0..199998 偶数
    const b = Array.from({ length: MAX_ITEMS }, (_, i) => i * 2 + 1) // 1..199999 奇数
    const targets = Array.from({ length: MAX_ITEMS }, (_, i) => i * 4) // 0..399996 4 的倍数
    const started = performance.now()
    const { reachable } = solve({ a, b, targets })
    const elapsed = performance.now() - started
    expect(reachable).toHaveLength(MAX_ITEMS)
    // 偶+奇=奇，4 的倍数为偶，全部不可达
    expect(reachable.every((v) => v === false)).toBe(true)
    // 六秒预算；留余量，CI 上限设 6000ms
    expect(elapsed).toBeLessThan(6000)
  })

  it('满规模稠密目标：偶数集合之和覆盖全部偶数目标', () => {
    const a = Array.from({ length: MAX_ITEMS }, (_, i) => i * 2)
    const b = Array.from({ length: MAX_ITEMS }, (_, i) => i * 2)
    const targets = Array.from({ length: MAX_ITEMS }, (_, i) => i * 4)
    const { reachable } = solve({ a, b, targets })
    // i*4 = (2x)+(2y)，取 x=i, y=i 即可（i<=99999）
    expect(reachable.every(Boolean)).toBe(true)
  })
})

describe('parseInput 输入校验', () => {
  const valid = JSON.stringify({
    a: [0, 1],
    b: [200000],
    targets: [0, 400000],
  })

  it('合法输入解析成功并保留目标顺序与重复', () => {
    const result = parseInput(valid)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ a: [0, 1], b: [200000], targets: [0, 400000] })
    }
  })

  const invalidCases: Array<[string, string]> = [
    ['{', '非法 JSON'],
    ['null', '根为 null'],
    ['[]', '根为数组'],
    ['"x"', '根为字符串'],
    ['1', '根为数字'],
    [JSON.stringify({ a: [1], b: [1] }), '缺少 targets'],
    [JSON.stringify({ a: [1], b: [1], targets: [1], c: 2 }), '额外字段'],
    [JSON.stringify({ a: [1], targets: [1] }), '缺少 b'],
    [JSON.stringify({ a: [], b: [1], targets: [1] }), '空数组 a'],
    [JSON.stringify({ a: [1], b: [], targets: [1] }), '空数组 b'],
    [JSON.stringify({ a: [1], b: [1], targets: [] }), '空目标数组'],
    [JSON.stringify({ a: [1.5], b: [1], targets: [1] }), '非整数垫片'],
    [JSON.stringify({ a: [1], b: [1], targets: [1.2] }), '非整数目标'],
    [JSON.stringify({ a: [-1], b: [1], targets: [1] }), '负垫片'],
    [JSON.stringify({ a: [1], b: [200001], targets: [1] }), '垫片超上限'],
    [JSON.stringify({ a: [1], b: [1], targets: [-1] }), '负目标'],
    [JSON.stringify({ a: [1], b: [1], targets: [400001] }), '目标超上限'],
    [JSON.stringify({ a: [true], b: [1], targets: [1] }), '布尔值'],
    [JSON.stringify({ a: [null], b: [1], targets: [1] }), 'null 元素'],
    [JSON.stringify({ a: ['1'], b: [1], targets: [1] }), '字符串元素'],
    [JSON.stringify({ a: {}, b: [1], targets: [1] }), 'a 不是数组'],
    [JSON.stringify({ a: [1], b: 1, targets: [1] }), 'b 不是数组'],
  ]

  invalidCases.forEach(([text, label]) => {
    it(`拒绝非法输入：${label}`, () => {
      expect(parseInput(text).ok).toBe(false)
    })
  })

  it('拒绝超过 100000 个元素的数组', () => {
    const big = new Array(MAX_ITEMS + 1).fill(0)
    expect(parseInput(JSON.stringify({ a: big, b: [1], targets: [1] })).ok).toBe(false)
  })

  it('接受 NaN/Infinity 的 JSON 形式为非法（JSON.parse 直接失败）', () => {
    expect(parseInput('{"a":[NaN],"b":[1],"targets":[1]}').ok).toBe(false)
  })
})
