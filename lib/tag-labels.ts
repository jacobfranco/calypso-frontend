const TAG_LABEL_OVERRIDES: Record<string, string> = {
  nonbinary: 'Non-binary',
  bahai: "Baha'i",
  doesnt_want_kids: "Doesn't want kids",
};

const TAG_GROUP_LABEL_OVERRIDES: Record<string, string> = {
  kids_current: 'Kids (current)',
  kids_future: 'Kids (future)',
  alcohol_use: 'Alcohol use',
  smoking: 'Smoking',
  drug_use: 'Drug use',
  non_religious: 'Non-religious',
};

export function formatTagLabel(value: string) {
  if (!value) return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return value;
  const override = TAG_LABEL_OVERRIDES[normalized];
  if (override) return override;
  const sentence = normalized.replace(/[_-]+/g, ' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function formatTagGroupLabel(value: string) {
  if (!value) return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return value;
  const override = TAG_GROUP_LABEL_OVERRIDES[normalized];
  if (override) return override;
  return formatTagLabel(normalized);
}
