const NUMERIC_STYLE_KEY = /^\d+$/;

type StyleRecord = Record<string, unknown>;

export function flattenStyle<T extends object>(style: unknown): T {
  const result: StyleRecord = {};

  const visit = (entry: unknown) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (typeof entry !== 'object') return;

    for (const [key, value] of Object.entries(entry as StyleRecord)) {
      if (NUMERIC_STYLE_KEY.test(key)) {
        visit(value);
      } else if (value !== undefined) {
        result[key] = value;
      }
    }
  };

  visit(style);
  return result as T;
}
