/**
 * 垫片补偿可达性精确求解器。
 *
 * 问题：给定两级垫片规格集合 A、B（同一数值重复出现只算一种规格），
 * 对每个目标 t 判断是否存在 a ∈ A、b ∈ B 使 a + b = t。
 *
 * 朴素做法枚举全部数对（最多 1e10 次）必然冻结浏览器。
 *
 * 本实现利用值域有界（垫片 0..200000），把集合编码为单个 BigInt 位集：
 *   - bitA 第 i 位为 1 ⇔ i ∈ A
 *   - bitBreversed 第 i 位为 1 ⇔ (MAX_SHIM - i) ∈ B
 *
 * 判定 t 是否可达，等价于判断位集 bitA 与“按 t 对齐的 B 反向位集”
 * 是否存在任意公共置位：
 *
 *   (bitA & align(bitBreversed, t)) !== 0n
 *
 * 其中对齐移位为：t <= MAX_SHIM 时右移 (MAX_SHIM - t)，
 * t > MAX_SHIM 时左移 (t - MAX_SHIM)（BigInt 移位量不允许为负）。
 *
 * 一次 BigInt AND + 与零比较即完成一个目标的判断，
 * BigInt 的 64 位分块使其成本约为 O(MAX_SHIM / 64) 位运算，
 * 无需也不会枚举任何数对。重复目标走缓存，结果保持原序。
 */

export const MIN_SHIM = 0
export const MAX_SHIM = 200_000
export const MIN_TARGET = 0
export const MAX_TARGET = 400_000
export const MIN_ITEMS = 1
export const MAX_ITEMS = 100_000

export interface ShimInput {
  a: number[]
  b: number[]
  targets: number[]
}

export type ParseResult =
  | { ok: true; value: ShimInput }
  | { ok: false }

/**
 * 解析并严格校验用户粘贴的 JSON 文本。
 *
 * 任何下列情况都判定为 INVALID_INPUT：
 * 非合法 JSON；根不是对象；根对象不是恰好只有 a/b/targets；
 * 三者不全是数组；数组长度不在 1..100000；
 * 元素不是整数（含布尔、null、字符串、NaN/Infinity 等）；
 * 垫片值越界（<0 或 >200000）；目标越界（<0 或 >400000）。
 */
export function parseInput(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false }
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false }
  }

  const root = data as Record<string, unknown>
  const allowed = ['a', 'b', 'targets']
  const keys = Object.keys(root)
  if (keys.length !== allowed.length || !allowed.every((k) => k in root)) {
    return { ok: false }
  }

  const a = parseNumberArray(root.a, MIN_SHIM, MAX_SHIM)
  if (!a) return { ok: false }
  const b = parseNumberArray(root.b, MIN_SHIM, MAX_SHIM)
  if (!b) return { ok: false }
  const targets = parseNumberArray(root.targets, MIN_TARGET, MAX_TARGET)
  if (!targets) return { ok: false }

  return { ok: true, value: { a, b, targets } }
}

function parseNumberArray(value: unknown, min: number, max: number): number[] | null {
  if (!Array.isArray(value)) return null
  if (value.length < MIN_ITEMS || value.length > MAX_ITEMS) return null
  const out: number[] = new Array(value.length)
  for (let i = 0; i < value.length; i++) {
    const n = value[i]
    if (typeof n !== 'number' || !Number.isInteger(n)) return null
    if (n < min || n > max) return null
    out[i] = n
  }
  return out
}

/** 把成员标记数组编码为位集 BigInt：第 i 位为 1 ⇔ mask[i] === 1。 */
function membershipBits(mask: Int8Array): bigint {
  const n = mask.length // === MAX_SHIM + 1 = 200001，不是 4 的倍数
  const hexChars = Math.ceil(n / 4)
  const chars = new Array<string>(hexChars)
  let bit = 0
  for (let c = 0; c < hexChars; c++) {
    let nibble = 0
    const end = Math.min(4, n - bit)
    for (let k = 0; k < end; k++) {
      if (mask[bit + k] === 1) nibble |= 1 << k
    }
    chars[hexChars - 1 - c] = nibble.toString(16)
    if (end < 4) bit += end
    else bit += 4
  }
  return BigInt('0x' + chars.join(''))
}

/**
 * 构造 B 的反向位集：第 i 位为 1 ⇔ (MAX_SHIM - i) ∈ B。
 * 直接复制出反向成员表（200001 字节，可忽略），再按 nibble 编码，
 * 避免在非 4 倍数长度上做边界处理。
 */
function reversedMembershipBits(mask: Int8Array): bigint {
  const n = mask.length
  const reversed = new Int8Array(n)
  for (let i = 0; i < n; i++) {
    reversed[i] = mask[n - 1 - i]
  }
  return membershipBits(reversed)
}

export interface SolveResult {
  /** 与输入 targets 等长、同序；仅包含布尔结论。 */
  reachable: boolean[]
  /** 去重后的垫片规格数量。 */
  uniqueA: number
  uniqueB: number
  /** 全部目标判定耗时（毫秒），仅供界面展示。 */
  elapsedMs: number
}

/**
 * 精确判定每个目标的可达性。
 *
 * 不枚举任何数对：构造两张成员表后，用 BigInt 位集对齐求交。
 */
export function solve(input: ShimInput): SolveResult {
  const started = performance.now()

  const span = MAX_SHIM + 1
  const inA = new Int8Array(span)
  const inB = new Int8Array(span)
  let uniqueA = 0
  let uniqueB = 0
  let minA = MAX_SHIM
  let maxA = 0
  let minB = MAX_SHIM
  let maxB = 0

  for (const v of input.a) {
    if (inA[v] === 0) {
      inA[v] = 1
      uniqueA++
      if (v < minA) minA = v
      if (v > maxA) maxA = v
    }
  }
  for (const v of input.b) {
    if (inB[v] === 0) {
      inB[v] = 1
      uniqueB++
      if (v < minB) minB = v
      if (v > maxB) maxB = v
    }
  }

  const bitA = membershipBits(inA)
  const bitBreversed = reversedMembershipBits(inB)
  const m = BigInt(MAX_SHIM)

  // 同一目标（重复目标）只判定一次；Int8Array 三态：-1 未知 / 1 可达 / 0 不可达。
  // 初始值必须是 -1：目标 0 合法，不能与“不可达”的 0 混淆。
  const cache = new Int8Array(MAX_TARGET + 1).fill(-1)
  const reachable = new Array<boolean>(input.targets.length)

  for (let i = 0; i < input.targets.length; i++) {
    const t = input.targets[i]
    let state = cache[t]
    if (state === -1) {
      // 廉价的必要条件剪枝（稀疏集合下可直接跳过 BigInt 运算）。
      const possible = t >= minA + minB && t <= maxA + maxB
      let hit = false
      if (possible) {
        // t <= MAX_SHIM 右移对齐；t > MAX_SHIM 左移（移位量不可为负）。
        const aligned =
          t <= MAX_SHIM
            ? bitBreversed >> (m - BigInt(t))
            : bitBreversed << (BigInt(t) - m)
        hit = (bitA & aligned) !== 0n
      }
      state = hit ? 1 : 2
      cache[t] = state
    }
    reachable[i] = state === 1
  }

  return { reachable, uniqueA, uniqueB, elapsedMs: performance.now() - started }
}
