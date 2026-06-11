import { View, type ViewProps, type ViewStyle } from 'react-native';

import { flattenStyle } from '@/components/style-utils';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
  const resolvedStyle = flattenStyle<ViewStyle>([{ backgroundColor }, style]);

  return <View {...otherProps} style={resolvedStyle} />;
}
