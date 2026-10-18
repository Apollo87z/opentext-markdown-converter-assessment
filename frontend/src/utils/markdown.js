function parseScalar(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

function countIndent(line) {
  return line.length - line.trimStart().length;
}

function parseBlock(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [];
  }

  const normalizedLines = lines
    .filter((line) => typeof line === 'string')
    .map((line) => line.replace(/\t/g, '  '))
    .filter((line) => line.trim());

  if (!normalizedLines.length) {
    return [];
  }

  const firstIndent = countIndent(normalizedLines[0]);
  const isList = normalizedLines[0].trim().startsWith('- ');

  if (isList) {
    const items = [];
    let index = 0;

    while (index < normalizedLines.length) {
      const raw = normalizedLines[index];
      const trimmed = raw.trim();

      if (!trimmed.startsWith('- ')) {
        index += 1;
        continue;
      }

      const remainder = trimmed.slice(2).trim();
      const item = {};
      index += 1;

      if (remainder) {
        const match = remainder.match(/^([^:]+):\s*(.*)$/);

        if (match) {
          const [, key, rawValue] = match;
          if (rawValue.trim() === '') {
            const nested = [];
            while (index < normalizedLines.length) {
              const next = normalizedLines[index];
              const nextTrim = next.trim();

              if (!nextTrim) {
                index += 1;
                continue;
              }

              const nextIndent = countIndent(next);
              if (nextIndent <= firstIndent || nextTrim.startsWith('- ')) {
                break;
              }

              nested.push(next);
              index += 1;
            }

            item[key.trim()] = nested.length ? parseBlock(nested) : '';
          } else {
            item[key.trim()] = parseScalar(rawValue);
          }
        } else {
          items.push(parseScalar(remainder));
          continue;
        }
      }

      while (index < normalizedLines.length) {
        const next = normalizedLines[index];
        const nextTrim = next.trim();

        if (!nextTrim) {
          index += 1;
          continue;
        }

        if (nextTrim.startsWith('- ')) {
          break;
        }

        const nextIndent = countIndent(next);
        if (nextIndent <= firstIndent) {
          break;
        }

        const nextMatch = nextTrim.match(/^([^:]+):\s*(.*)$/);
        if (!nextMatch) {
          index += 1;
          continue;
        }

        const [, nestedKey, nestedValue] = nextMatch;
        index += 1;

        if (nestedValue.trim() === '') {
          const nested = [];
          while (index < normalizedLines.length) {
            const nestedLine = normalizedLines[index];
            const nestedTrim = nestedLine.trim();

            if (!nestedTrim) {
              index += 1;
              continue;
            }

            const nestedIndent = countIndent(nestedLine);
            if (nestedIndent <= nextIndent) {
              break;
            }

            nested.push(nestedLine);
            index += 1;
          }

          item[nestedKey.trim()] = nested.length ? parseBlock(nested) : '';
        } else {
          item[nestedKey.trim()] = parseScalar(nestedValue);
        }
      }

      items.push(item);
    }

    return items;
  }

  const object = {};
  let index = 0;

  while (index < normalizedLines.length) {
    const raw = normalizedLines[index];
    const trimmed = raw.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const match = trimmed.match(/^([^:]+):\s*(.*)$/);

    if (!match) {
      index += 1;
      continue;
    }

    const [, key, rawValue] = match;
    index += 1;

    if (rawValue.trim() === '') {
      const nested = [];
      while (index < normalizedLines.length) {
        const next = normalizedLines[index];
        const nextTrim = next.trim();

        if (!nextTrim) {
          index += 1;
          continue;
        }

        const nextIndent = countIndent(next);
        if (nextIndent <= firstIndent) {
          break;
        }

        nested.push(next);
        index += 1;
      }

      object[key.trim()] = nested.length ? parseBlock(nested) : '';
    } else {
      object[key.trim()] = parseScalar(rawValue);
    }
  }

  return object;
}

function parseStructuredValue(lines) {
  return parseBlock(lines);
}

export function parseMarkdownMetadata(markdown = '') {
  const normalized = markdown ?? '';

  if (!normalized.trim().startsWith('---')) {
    return {
      metadata: {},
      body: normalized,
    };
  }

  const firstBreak = normalized.indexOf('\n---', 4);

  if (firstBreak === -1) {
    return {
      metadata: {},
      body: normalized,
    };
  }

  const frontMatter = normalized.slice(4, firstBreak).split('\n');
  const body = normalized.slice(firstBreak + 5).trimStart();
  const metadata = {};

  for (let index = 0; index < frontMatter.length; index += 1) {
    const rawLine = frontMatter[index];
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const match = line.match(/^([^:]+):\s*(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const normalizedKey = key.trim();

    if (rawValue.trim() === '') {
      const nestedLines = [];
      let nextIndex = index + 1;

      while (nextIndex < frontMatter.length) {
        const nextLine = frontMatter[nextIndex];

        if (!nextLine.trim()) {
          nextIndex += 1;
          continue;
        }

        const nextIndent = nextLine.match(/^\s*/)?.[0].length ?? 0;

        if (nextIndent <= 0) {
          break;
        }

        nestedLines.push(nextLine);
        nextIndex += 1;
      }

      metadata[normalizedKey] = nestedLines.length ? parseStructuredValue(nestedLines) : '';
      index = nextIndex - 1;
      continue;
    }

    metadata[normalizedKey] = parseScalar(rawValue);
  }

  return {
    metadata,
    body,
  };
}
