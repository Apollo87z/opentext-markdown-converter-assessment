function parseScalar(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
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

function parseNestedList(lines) {
  const items = [];
  let currentItem = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (currentItem) {
        items.push(currentItem);
      }

      const content = trimmed.slice(2).trim();
      currentItem = content ? { value: parseScalar(content) } : {};
      continue;
    }

    if (!currentItem) {
      continue;
    }

    const match = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    currentItem[key.trim()] = rawValue ? parseScalar(rawValue) : '';
  }

  if (currentItem) {
    items.push(currentItem);
  }

  return items;
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

        if (nextLine.startsWith('  - ')) {
          nestedLines.push(nextLine.trim());
          nextIndex += 1;
          continue;
        }

        if (nextLine.startsWith('    ')) {
          nestedLines.push(nextLine.trim());
          nextIndex += 1;
          continue;
        }

        break;
      }

      if (nestedLines.length > 0) {
        metadata[normalizedKey] = parseNestedList(nestedLines);
        index = nextIndex - 1;
      } else {
        metadata[normalizedKey] = '';
      }

      continue;
    }

    metadata[normalizedKey] = parseScalar(rawValue);
  }

  return {
    metadata,
    body,
  };
}
