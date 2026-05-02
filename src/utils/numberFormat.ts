export const getLatnLocale = (language?: string): string => {
  const normalized = (language || "en-US").trim();
  return normalized.startsWith("ar") ? "ar-u-nu-latn" : normalized;
};

export const formatLatnNumber = (
  value: number,
  language?: string,
  options?: Intl.NumberFormatOptions
): string => {
  return new Intl.NumberFormat(getLatnLocale(language), {
    numberingSystem: "latn",
    ...options,
  }).format(value);
};

export const formatLatnDateTime = (
  value: Date | string | number,
  language?: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  return new Intl.DateTimeFormat(getLatnLocale(language), options).format(new Date(value));
};