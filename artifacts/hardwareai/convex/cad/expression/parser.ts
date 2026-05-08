// artifacts/hardwareai/convex/cad/expression/parser.ts
//
// Tiny precedence-climbing parser for parameter expressions.
// Grammar:
//   expr   := term (('+' | '-') term)*
//   term   := unary (('*' | '/') unary)*
//   unary  := '-' unary | atom
//   atom   := number | ident | '(' expr ')'

export type ExprNode =
  | { kind: "num"; value: number }
  | { kind: "ref"; name: string }
  | { kind: "neg"; inner: ExprNode }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; lhs: ExprNode; rhs: ExprNode };

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" } | { t: "rp" } | { t: "eof" };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (c === "(") { out.push({ t: "lp" }); i++; continue; }
    if (c === ")") { out.push({ t: "rp" }); i++; continue; }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ t: "op", v: c }); i++; continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: Number.parseFloat(src.slice(i, j)) });
      i = j; continue;
    }
    if (/[a-z_]/i.test(c)) {
      let j = i;
      while (j < src.length && /[a-z0-9_]/i.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    throw new Error(`unexpected char '${c}' at ${i} in expression "${src}"`);
  }
  out.push({ t: "eof" });
  return out;
}

export function parseExpression(src: string): ExprNode {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (t: Tok["t"]) => {
    const tk = toks[p];
    if (tk.t !== t) throw new Error(`expected ${t}, got ${tk.t}`);
    p++; return tk;
  };

  function parseAtom(): ExprNode {
    const tk = peek();
    if (tk.t === "num") { p++; return { kind: "num", value: tk.v }; }
    if (tk.t === "id")  { p++; return { kind: "ref", name: tk.v }; }
    if (tk.t === "lp")  { p++; const e = parseExpr(); eat("rp"); return e; }
    throw new Error(`unexpected token ${tk.t}`);
  }
  function parseUnary(): ExprNode {
    const tk = peek();
    if (tk.t === "op" && tk.v === "-") { p++; return { kind: "neg", inner: parseUnary() }; }
    return parseAtom();
  }
  function parseTerm(): ExprNode {
    let lhs = parseUnary();
    while (true) {
      const tk = peek();
      if (tk.t === "op" && (tk.v === "*" || tk.v === "/")) {
        p++;
        lhs = { kind: "bin", op: tk.v, lhs, rhs: parseUnary() };
      } else return lhs;
    }
  }
  function parseExpr(): ExprNode {
    let lhs = parseTerm();
    while (true) {
      const tk = peek();
      if (tk.t === "op" && (tk.v === "+" || tk.v === "-")) {
        p++;
        lhs = { kind: "bin", op: tk.v, lhs, rhs: parseTerm() };
      } else return lhs;
    }
  }

  const tree = parseExpr();
  if (peek().t !== "eof") throw new Error(`trailing tokens in "${src}"`);
  return tree;
}
