import { Slot, Tabs, usePathname, useRouter, type Href } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { flattenStyle } from '@/components/style-utils';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type WebTabItem = {
  href: Href;
  icon: 'house.fill' | 'heart.fill' | 'person.fill';
  label: string;
  match: (pathname: string) => boolean;
};

const WEB_TABS: WebTabItem[] = [
  {
    href: '/',
    icon: 'house.fill',
    label: 'Feed',
    match: (pathname) => pathname === '/' || pathname === '',
  },
  {
    href: '/matches',
    icon: 'heart.fill',
    label: 'Messages',
    match: (pathname) => pathname.startsWith('/matches'),
  },
  {
    href: '/profile',
    icon: 'person.fill',
    label: 'Profile',
    match: (pathname) => pathname.startsWith('/profile'),
  },
];

export default function TabLayout() {
  const colorScheme = useColorScheme();

  if (Platform.OS === 'web') {
    return <WebTabLayout colorScheme={colorScheme ?? 'light'} />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="heart.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

function WebTabLayout({ colorScheme }: { colorScheme: 'light' | 'dark' }) {
  const pathname = usePathname();
  const router = useRouter();
  const colors = Colors[colorScheme];
  const borderColor = colorScheme === 'dark'
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.08)';

  return (
    <View style={styles.webShell}>
      <View style={styles.webContent}>
        <Slot />
      </View>
      <View
        style={flattenStyle<ViewStyle>([
          styles.webTabBar,
          { backgroundColor: colors.background, borderTopColor: borderColor },
        ])}
      >
        {WEB_TABS.map((tab) => {
          const selected = tab.match(pathname);
          const color = selected ? colors.tabIconSelected : colors.tabIconDefault;
          return (
            <Pressable
              key={tab.label}
              accessibilityRole="link"
              onPress={() => router.push(tab.href)}
              style={flattenStyle<ViewStyle>([
                styles.webTabButton,
                selected && { backgroundColor: colorScheme === 'dark' ? '#202326' : '#eef7fa' },
              ])}
            >
              <IconSymbol name={tab.icon} size={24} color={color} />
              <ThemedText style={flattenStyle<TextStyle>([styles.webTabLabel, { color }])}>
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webShell: {
    flex: 1,
  },
  webContent: {
    flex: 1,
    paddingBottom: 72,
  },
  webTabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  webTabButton: {
    minWidth: 108,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  webTabLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
