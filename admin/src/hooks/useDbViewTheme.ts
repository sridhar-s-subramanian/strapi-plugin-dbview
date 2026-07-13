import { useTheme, type DefaultTheme } from 'styled-components';

type ThemeColors = DefaultTheme['colors'];

/**
 * The design system exposes no explicit light/dark flag, so we derive it from
 * the relative luminance of the base surface colour.
 */
function isDarkSurface(hex: string | undefined): boolean {
  if (!hex) return false;
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized;
  if (full.length !== 6) return false;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Theme colours plus a light/dark flag, for the places we style raw elements. */
export const useDbViewTheme = (): { colors: ThemeColors; isDark: boolean } => {
  const theme = useTheme();
  const colors = theme.colors;

  return { colors, isDark: isDarkSurface(colors?.neutral0) };
};
