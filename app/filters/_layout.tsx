import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { Alert, Pressable } from 'react-native';

import { FiltersDraftProvider } from '@/lib/filters-draft';
import { ThemedText } from '@/components/themed-text';
import { useFiltersDraft } from '@/lib/filters-draft';

function FiltersStack() {
  const router = useRouter();
  const { dirty, saveAll, status } = useFiltersDraft();

  const handleBack = () => {
    if (!dirty || status === 'saving') {
      router.back();
      return;
    }

    Alert.alert('Unsaved changes', 'Save your changes before leaving?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => router.back(),
      },
      {
        text: 'Save',
        onPress: async () => {
          await saveAll();
          router.back();
        },
      },
    ]);
  };

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Filters',
          headerLeft: () => (
            <Pressable onPress={handleBack}>
              <ThemedText>Back</ThemedText>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="[category]"
        options={{
          headerShown: false,
          presentation: 'transparentModal',
        }}
      />
    </Stack>
  );
}

export default function FiltersLayout() {
  return (
    <FiltersDraftProvider>
      <FiltersStack />
    </FiltersDraftProvider>
  );
}
