import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export default function PromptsLayout() {
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Prompts',
          headerBackTitleVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()}>
              <ThemedText>Back</ThemedText>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="[promptId]"
        options={{
          title: 'Edit prompt',
          headerBackTitleVisible: false,
        }}
      />
    </Stack>
  );
}
