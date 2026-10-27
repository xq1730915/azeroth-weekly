import {
  validateEnvelope,
  type CaptureEnvelope,
} from "@azeroth-weekly/protocol";

/** Parses only the data grammar emitted by WoW. No Lua execution or expressions. */
export function parseSavedVariables(input: string): unknown {
  if (Buffer.byteLength(input) > 16 * 1024 * 1024)
    throw Error("存档超过 16 MiB");
  input = input.replace(/^\uFEFF/, "");
  let p = 0;
  const fail = (): never => {
    throw Error(`存档语法不支持（位置 ${p}）`);
  };
  const longString = (): string | null => {
    const m = /^\[(=*)\[/.exec(input.slice(p));
    if (!m) return null;
    p += m[0].length;
    const end = "]" + m[1] + "]",
      q = input.indexOf(end, p);
    if (q < 0) return fail();
    const value = input.slice(p, q).replace(/^\r?\n/, "");
    p = q + end.length;
    return value;
  };
  const ws = () => {
    for (;;) {
      while (/\s/.test(input[p] ?? "") && p < input.length) p++;
      if (input.slice(p, p + 2) !== "--") return;
      p += 2;
      if (longString() === null) {
        const e = input.indexOf("\n", p);
        p = e < 0 ? input.length : e;
      }
    }
  };
  const take = (s: string) => {
    ws();
    if (input.slice(p, p + s.length) !== s) fail();
    p += s.length;
  };
  const value = (depth = 0): any => {
    if (depth > 32) throw Error("存档嵌套超过 32 层");
    ws();
    const c = input[p];
    if (c === "{") {
      p++;
      const result: Record<string, unknown> = Object.create(null);
      let index = 1;
      ws();
      while (input[p] !== "}") {
        let key: string, v: unknown;
        ws();
        if (input[p] === "[" && !/^\[(=*)\[/.test(input.slice(p))) {
          p++;
          const k = value(depth + 1);
          if (typeof k !== "string" && typeof k !== "number") fail();
          key = String(k);
          take("]");
          take("=");
          v = value(depth + 1);
        } else {
          const name = /^([A-Za-z_][A-Za-z_0-9]*)\s*=/.exec(input.slice(p));
          if (name) {
            key = name[1]!;
            p += name[0].length;
            v = value(depth + 1);
          } else {
            key = String(index++);
            v = value(depth + 1);
          }
        }
        if (Object.hasOwn(result, key)) throw Error("存档包含重复键");
        result[key] = v;
        ws();
        if (input[p] === "," || input[p] === ";") {
          p++;
          ws();
        } else if (input[p] !== "}") fail();
      }
      p++;
      return result;
    }
    if (c === '"' || c === "'") {
      p++;
      const bytes: number[] = [];
      let closed = false;
      while (p < input.length) {
        const ch = input[p++]!;
        if (ch === c) {
          closed = true;
          break;
        }
        if (ch === "\\") {
          const e = input[p++]!;
          const map: Record<string, number> = {
            a: 7,
            b: 8,
            f: 12,
            n: 10,
            r: 13,
            t: 9,
            v: 11,
            "\\": 92,
            '"': 34,
            "'": 39,
          };
          if (/[0-9]/.test(e)) {
            let digits = e;
            while (digits.length < 3 && /[0-9]/.test(input[p] ?? ""))
              digits += input[p++];
            const n = Number(digits);
            if (n > 255) fail();
            bytes.push(n);
          } else if (Object.hasOwn(map, e)) bytes.push(map[e]!);
          else if (e === "\n") bytes.push(10);
          else if (e === "\r") {
            if (input[p] === "\n") p++;
            bytes.push(10);
          } else fail();
        } else {
          let s = ch;
          if (/[\uD800-\uDBFF]/.test(ch) && p < input.length) s += input[p++];
          for (const b of Buffer.from(s)) bytes.push(b);
        }
        if (bytes.length > 1024 * 1024) throw Error("存档字符串过长");
      }
      if (!closed) fail();
      return Buffer.from(bytes).toString("utf8");
    }
    const ls = longString();
    if (ls !== null) {
      if (Buffer.byteLength(ls) > 1024 * 1024) throw Error("存档字符串过长");
      return ls;
    }
    for (const [word, v] of [
      ["true", true],
      ["false", false],
      ["nil", null],
    ] as const) {
      if (
        input.slice(p, p + word.length) === word &&
        !/[\w]/.test(input[p + word.length] ?? "")
      ) {
        p += word.length;
        return v;
      }
    }
    const n = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
      input.slice(p),
    );
    if (n) {
      p += n[0].length;
      const v = Number(n[0]);
      if (!Number.isFinite(v)) fail();
      return v;
    }
    return fail();
  };
  take("AzerothWeeklyDB");
  take("=");
  const result = value();
  ws();
  if (input[p] === ";") {
    p++;
    ws();
  }
  if (p !== input.length) fail();
  return result;
}

const object = (v: any) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const array = (v: any): any[] => {
  if (Array.isArray(v)) return v;
  if (!object(v)) throw Error("存档列表格式错误");
  const keys = Object.keys(v);
  if (
    !keys.every((k, i) => Object.hasOwn(v, String(i + 1))) ||
    keys.some((k) => !/^\d+$/.test(k))
  )
    throw Error("存档列表存在缺项或混合键");
  return Array.from({ length: keys.length }, (_, i) => v[String(i + 1)]);
};
const nulls = (v: any, fields: string[]) => {
  if (object(v)) for (const k of fields) if (v[k] === undefined) v[k] = null;
};
export function normalizeEnvelope(raw: unknown): CaptureEnvelope {
  const x: any = structuredClone(raw);
  if (!object(x) || !object(x.characters) || !object(x.events))
    return validateEnvelope(x);
  for (const c of Object.values(x.characters) as any[]) {
    if (!object(c) || !object(c.identity) || !object(c.vault)) continue;
    nulls(c.identity, ["classId"]);
    nulls(c.vault, ["previousRewardAvailable"]);
    c.vault.slots = array(c.vault.slots);
    c.encounters = array(c.encounters);
    c.balances = array(c.balances);
    for (const s of c.vault.slots) nulls(s, ["progress", "itemLevel"]);
    for (const f of c.encounters) nulls(f, ["killed", "lootEligible"]);
    for (const b of c.balances) nulls(b, ["quantity"]);
  }
  for (const e of Object.values(x.events))
    nulls(e, [
      "quantity",
      "raidId",
      "encounterId",
      "difficultyId",
      "specId",
      "rewardLink",
      "itemLevel",
    ]);
  if (x.diagnostics !== undefined) {
    x.diagnostics = array(x.diagnostics);
    for (const d of x.diagnostics) nulls(d, ["guid"]);
  }
  if (object(x.catalog)) {
    if (x.catalog.currentSeasonRaidIds !== undefined)
      x.catalog.currentSeasonRaidIds = array(x.catalog.currentSeasonRaidIds);
    x.catalog.raids = array(x.catalog.raids);
    for (const r of x.catalog.raids) {
      r.difficulties = array(r.difficulties);
      r.bosses = array(r.bosses);
    }
  }
  return validateEnvelope(x);
}
