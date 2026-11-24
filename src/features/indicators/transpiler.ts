/**
 * Basic Pine Script v5 -> JavaScript transpiler.
 *
 * It covers the declarative subset used by 95% of indicators:
 *  - `indicator(...)` / `strategy(...)` metadata
 *  - typed and untyped variable declarations, `:=` reassignment
 *  - keyword arguments (`plot(x, "X", color=color.red)`)
 *  - indentation-based `if` / `else` / `for` / `while`
 *  - `and` / `or` / `not`, `na`, `#rrggbb` literals
 *  - line continuations inside parentheses
 *
 * Stateful per-bar constructs (`var`, drawing objects, `request.security`) are
 * reported as warnings and left to the runtime to reject.
 */

export interface TranspileResult {
  code: string;
  warnings: string[];
  title?: string;
  overlay: boolean;
}

const KEYWORD_ARG_FUNCTIONS = new Set([
  'plot',
  'hline',
  'fill',
  'bgcolor',
  'plotshape',
  'plotchar',
  'indicator',
  'strategy',
  'input',
  'alertcondition',
  'label.new',
  'line.new',
  'box.new',
  'table.new',
]);

function mapOutsideStrings(code: string, transform: (chunk: string) => string): string {
  const parts: string[] = [];
  let i = 0;
  let start = 0;
  let quote: string | null = null;

  while (i < code.length) {
    const char = code[i]!;
    if (quote) {
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === quote) {
        parts.push(code.slice(start, i + 1));
        quote = null;
        start = i + 1;
      }
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      if (i > start) parts.push(transform(code.slice(start, i)));
      quote = char;
      start = i;
    }
    i += 1;
  }
  if (start < code.length) parts.push(transform(code.slice(start)));
  return parts.join('');
}

function splitArguments(source: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quote) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      args.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = source.slice(start).trim();
  if (last) args.push(last);
  return args;
}

function findMatchingParen(code: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < code.length; i += 1) {
    const char = code[i]!;
    if (quote) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Converts `plot(x, "X", color=color.red)` into `plot(x, "X", { color: color.red })`. */
function convertKeywordArguments(code: string): string {
  const match = code.match(/^([A-Za-z_][\w.]*)\s*\(/);
  if (!match) return code;
  const name = match[1]!;
  if (!KEYWORD_ARG_FUNCTIONS.has(name)) return code;

  const open = code.indexOf('(', match.index! + name.length);
  const close = findMatchingParen(code, open);
  if (close === -1) return code;

  const args = splitArguments(code.slice(open + 1, close));
  const positional: string[] = [];
  const keyword: string[] = [];

  for (const arg of args) {
    const kw = arg.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]*)$/);
    if (kw) keyword.push(`${kw[1]}: ${kw[2]}`);
    else positional.push(arg);
  }

  let output = `${name}(${positional.join(', ')}`;
  if (keyword.length) {
    output += `${positional.length ? ', ' : ''}{ ${keyword.join(', ')} }`;
  }
  return `${output})${code.slice(close + 1)}`;
}

interface Statement {
  indent: number;
  code: string;
  comment: string;
}

function splitComment(line: string): { code: string; comment: string } {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quote) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '/' && line[i + 1] === '/') {
      return { code: line.slice(0, i).trim(), comment: line.slice(i).trim() };
    }
  }
  return { code: line.trim(), comment: '' };
}

function parenDepth(code: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < code.length; i += 1) {
    const char = code[i]!;
    if (quote) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
  }
  return depth;
}

export function transpilePine(source: string): TranspileResult {
  const warnings: string[] = [];
  const normalized = source.replace(/\r\n?/g, '\n').replace(/^\t+/gm, (tabs) => '    '.repeat(tabs.length));
  const lines = normalized.split('\n');

  if (!/\/\/@version\s*=/.test(normalized)) {
    warnings.push('Нет директивы //@version — код интерпретируется как Pine v5');
  }

  const metaMatch = normalized.match(/\b(?:indicator|strategy)\s*\(\s*["']([^"']+)["']([^)]*)\)/);
  const title = metaMatch?.[1];
  const overlay = /overlay\s*=\s*true/.test(metaMatch?.[2] ?? '');

  const statements: Statement[] = [];
  let pendingCode = '';
  let pendingIndent = 0;
  let pendingDepth = 0;

  for (const raw of lines) {
    if (/^\s*\/\/@version\s*=/.test(raw)) continue;
    const withoutTrailing = raw.replace(/\s+$/, '');
    const indent = withoutTrailing.length - withoutTrailing.trimStart().length;
    const { code, comment } = splitComment(withoutTrailing.trim());

    if (!code && !comment) {
      statements.push({ indent, code: '', comment: '' });
      continue;
    }

    if (pendingDepth > 0) {
      pendingCode += ` ${code}`;
      pendingDepth += parenDepth(code);
      if (pendingDepth <= 0) {
        statements.push({ indent: pendingIndent, code: pendingCode, comment: '' });
        pendingCode = '';
        pendingDepth = 0;
      }
      continue;
    }

    if (!code) {
      statements.push({ indent, code: '', comment });
      continue;
    }

    pendingCode = code;
    pendingIndent = indent;
    pendingDepth = parenDepth(code);
    if (pendingDepth <= 0) {
      statements.push({ indent: pendingIndent, code: pendingCode, comment });
      pendingCode = '';
      pendingDepth = 0;
    }
  }
  if (pendingCode) statements.push({ indent: pendingIndent, code: pendingCode, comment: '' });

  const declared = new Set<string>();
  const output: string[] = [];
  const stack: number[] = [0];

  const flushBlocks = (indent: number) => {
    while (stack.length > 1 && indent < stack[stack.length - 1]!) {
      output.push('}');
      stack.pop();
    }
  };

  for (const statement of statements) {
    if (!statement.code) {
      if (statement.comment) output.push(statement.comment);
      else output.push('');
      continue;
    }

    let code = convertKeywordArguments(statement.code);

    // Function definitions: `name(args) =>` (inline body only).
    const fnMatch = code.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*=>\s*(.*)$/);
    if (fnMatch) {
      const [, name, args, body] = fnMatch;
      warnings.push(`Функция ${name} выполняется один раз для всей серии, а не по барам`);
      if (body && body.trim()) {
        code = `function ${name}(${args}) { return ${body}; }`;
      } else {
        warnings.push('Многострочные тела функций не поддерживаются');
      }
    }

    // `for i = 0 to 10 [by step]`
    const forMatch = code.match(
      /^for\s+([A-Za-z_]\w*)\s*=\s*(-?[\w.]+)\s+to\s+(-?[\w.]+)(?:\s+by\s+(-?[\w.]+))?$/,
    );
    if (forMatch) {
      const [, variable, from, to, step] = forMatch;
      const fromValue = Number(from);
      const toValue = Number(to);
      const descending = Number.isFinite(fromValue) && Number.isFinite(toValue) && fromValue > toValue;
      const increment = step ?? '1';
      code = descending
        ? `for (let ${variable} = ${from}; ${variable} >= ${to}; ${variable} -= ${increment})`
        : `for (let ${variable} = ${from}; ${variable} <= ${to}; ${variable} += ${increment})`;
      warnings.push('Циклы выполняются один раз для всей серии, а не по барам');
    }

    // `while cond` -> `while (cond)`
    const whileMatch = code.match(/^while\s+(.+)$/);
    if (whileMatch) code = `while (${whileMatch[1]})`;

    if (/^switch\b/.test(code)) warnings.push('switch не поддерживается — перепишите через if/else');
    if (/^method\b/.test(code)) warnings.push('method не поддерживается');
    if (/^import\b/.test(code)) warnings.push('import не поддерживается');

    // Tuple destructuring: `[macd, signal, hist] = ta.macd(...)`
    const tuple = code.match(/^(\s*)\[([^\]]+)\]\s*=\s*([\s\S]+)$/);
    if (tuple) {
      const [, space, names, value] = tuple;
      const list = names!.split(',').map((name) => name.trim()).filter(Boolean);
      for (const name of list) declared.add(name);
      code = `${space}const [${list.join(', ')}] = ${value};`;
    }

    // Typed declarations: `var float x = 1`
    const typed = code.match(
      /^(\s*)(?:(var|varip)\s+)?(?:(series|simple)\s+)?(float|int|bool|string|color|line|label|box|array<[^>]*>)\s+([A-Za-z_]\w*)\s*(?::=|=)(?!=)\s*([\s\S]*)$/,
    );
    if (typed) {
      const [, space, storage, , , name, value] = typed;
      if (storage) warnings.push(`\`${storage}\` — состояние между барами не поддерживается`);
      declared.add(name!);
      code = `${space}let ${name} = ${value};`;
    } else {
      const assignment = code.match(/^(\s*)([A-Za-z_]\w*)\s*(?::=|=)(?!=)\s*([\s\S]*)$/);
      if (assignment) {
        const [, space, name, value] = assignment;
        const declaration = declared.has(name!) ? '' : 'let ';
        declared.add(name!);
        code = `${space}${declaration}${name} = ${value};`;
      }
    }

    code = mapOutsideStrings(code, (chunk) =>
      chunk
        .replace(/\band\b/g, '&&')
        .replace(/\bor\b/g, '||')
        .replace(/\bnot\s*/g, '!')
        .replace(/\bna\b(?!\s*\()/g, 'NaN')
        .replace(/(?<!['"\w])#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g, "'#$1'"),
    );

    const isBlockStatement =
      /^else\b/.test(code) || /^if\s/.test(code) || /^(for|while|switch)\b/.test(code);
    if (!isBlockStatement && !code.endsWith(';') && !code.endsWith('{') && !code.endsWith('}')) {
      code += ';';
    }

    // `else` closes the previous block before opening a new one.
    if (/^else\b/.test(code)) {
      flushBlocks(statement.indent);
      const elseBranch = code.replace(/^else\s+if\s+([\s\S]+)$/, 'else if ($1)');
      output.push(`${elseBranch} {`);
      stack.push(statement.indent + 1);
      continue;
    }

    flushBlocks(statement.indent);

    const ifStatement = code.match(/^if\s+([\s\S]+)$/);
    if (ifStatement) {
      output.push(`if (${ifStatement[1]}) {`);
      stack.push(statement.indent + 1);
      continue;
    }

    const opensBlock = /^(for|while|switch)\b/.test(code);
    if (opensBlock) {
      output.push(`${code} {`);
      stack.push(statement.indent + 1);
    } else {
      output.push(code);
    }
  }

  while (stack.length > 1) {
    output.push('}');
    stack.pop();
  }

  if (/\brequest\.security\b/.test(normalized)) warnings.push('request.security() не поддерживается');
  if (/\b(var|varip)\s+\w/.test(normalized)) {
    warnings.push('`var`/`varip` не сохраняют состояние по барам в векторном движке');
  }

  return {
    code: output.join('\n'),
    warnings,
    title,
    overlay,
  };
}

export function pineSummary(source: string): { title?: string; overlay: boolean } {
  const meta = source.match(/\b(?:indicator|strategy)\s*\(\s*["']([^"']+)["']([^)]*)\)/);
  return {
    title: meta?.[1],
    overlay: /overlay\s*=\s*true/.test(meta?.[2] ?? ''),
  };
}
