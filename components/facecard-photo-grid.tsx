import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';

const GRID_COLUMNS = 3;
const SLOT_GAP = 10;
const SLOT_ASPECT_RATIO = 4 / 5;
const MAX_VISIBLE_SLOTS = 6;

type FacecardPhotoGridProps = {
  photoUris: string[];
  maxPhotos?: number;
  disabled?: boolean;
  cardBorderColor: string;
  cardBackgroundColor: string;
  mutedTextColor: string;
  onPickPhotoAt: (index: number) => void;
  onRemovePhotoAt: (index: number) => void;
  onReorderPhotos: (fromIndex: number, toIndex: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function FacecardPhotoGrid({
  photoUris,
  maxPhotos = MAX_VISIBLE_SLOTS,
  disabled = false,
  cardBorderColor,
  cardBackgroundColor,
  mutedTextColor,
  onPickPhotoAt,
  onRemovePhotoAt,
  onReorderPhotos,
}: FacecardPhotoGridProps) {
  const slotCount = Math.min(MAX_VISIBLE_SLOTS, maxPhotos);
  const filledUris = useMemo(() => photoUris.slice(0, slotCount), [photoUris, slotCount]);
  const filledCount = filledUris.length;
  const [gridWidth, setGridWidth] = useState(0);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragTranslate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const slotWidth = useMemo(() => {
    if (gridWidth <= 0) return 0;
    return (gridWidth - SLOT_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  }, [gridWidth]);

  const slotHeight = useMemo(() => {
    if (slotWidth <= 0) return 0;
    return slotWidth / SLOT_ASPECT_RATIO;
  }, [slotWidth]);

  const resolveDropIndex = useCallback(
    (startIndex: number, dx: number, dy: number): number => {
      if (filledCount <= 1) return startIndex;
      if (slotWidth <= 0 || slotHeight <= 0) return startIndex;
      const maxRow = Math.max(0, Math.ceil(slotCount / GRID_COLUMNS) - 1);
      const row = Math.floor(startIndex / GRID_COLUMNS);
      const col = startIndex % GRID_COLUMNS;
      const stepX = slotWidth + SLOT_GAP;
      const stepY = slotHeight + SLOT_GAP;
      const nextRow = clamp(row + Math.round(dy / stepY), 0, maxRow);
      const nextCol = clamp(col + Math.round(dx / stepX), 0, GRID_COLUMNS - 1);
      return clamp(nextRow * GRID_COLUMNS + nextCol, 0, filledCount - 1);
    },
    [filledCount, slotCount, slotHeight, slotWidth]
  );

  const finishDrag = useCallback(
    (startIndex: number, dx: number, dy: number) => {
      const target = resolveDropIndex(startIndex, dx, dy);
      if (target !== startIndex) {
        onReorderPhotos(startIndex, target);
      }
      setDraggingIndex(null);
      setDropTargetIndex(null);
      Animated.spring(dragTranslate, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
        speed: 24,
        bounciness: 0,
      }).start(() => {
        dragTranslate.setValue({ x: 0, y: 0 });
      });
    },
    [dragTranslate, onReorderPhotos, resolveDropIndex]
  );

  const panResponders = useMemo(
    () =>
      Array.from({ length: slotCount }, (_, index) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponder: (_event, gesture) =>
            !disabled
            && index < filledCount
            && (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6),
          onPanResponderGrant: () => {
            setDraggingIndex(index);
            setDropTargetIndex(index);
            dragTranslate.setValue({ x: 0, y: 0 });
          },
          onPanResponderMove: (_event, gesture) => {
            dragTranslate.setValue({ x: gesture.dx, y: gesture.dy });
            setDropTargetIndex(resolveDropIndex(index, gesture.dx, gesture.dy));
          },
          onPanResponderRelease: (_event, gesture) => {
            finishDrag(index, gesture.dx, gesture.dy);
          },
          onPanResponderTerminate: (_event, gesture) => {
            finishDrag(index, gesture.dx, gesture.dy);
          },
        })
      ),
    [disabled, dragTranslate, filledCount, finishDrag, resolveDropIndex, slotCount]
  );

  const slots = useMemo(
    () => Array.from({ length: slotCount }, (_, idx) => filledUris[idx] ?? null),
    [filledUris, slotCount]
  );

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.floor(event.nativeEvent.layout.width);
    if (width > 0) {
      setGridWidth(width);
    }
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.grid} onLayout={handleGridLayout}>
        {slots.map((uri, index) => {
          const isFilled = Boolean(uri);
          const isDragging = draggingIndex === index;
          const isDropTarget =
            dropTargetIndex === index && draggingIndex !== null && draggingIndex !== index;
          const sharedSlotStyles = [
            styles.slot,
            {
              width: slotWidth > 0 ? slotWidth : undefined,
              height: slotHeight > 0 ? slotHeight : undefined,
              borderColor: cardBorderColor,
              backgroundColor: cardBackgroundColor,
            },
            isDropTarget && styles.slotDropTarget,
          ];

          if (!isFilled) {
            return (
              <Pressable
                key={`slot-${index}`}
                onPress={() => onPickPhotoAt(index)}
                disabled={disabled}
                style={({ pressed }) => [
                  ...sharedSlotStyles,
                  styles.emptySlot,
                  (pressed || disabled) && styles.slotPressed,
                ]}
              >
                <ThemedText style={[styles.plusText, { color: mutedTextColor }]}>+</ThemedText>
              </Pressable>
            );
          }

          return (
            <Animated.View
              key={`slot-${index}`}
              {...panResponders[index].panHandlers}
              style={[
                ...sharedSlotStyles,
                isDragging && styles.draggingSlot,
                isDragging && { transform: dragTranslate.getTranslateTransform() },
              ]}
            >
              <Pressable
                style={styles.filledSlotPressable}
                onPress={() => onPickPhotoAt(index)}
                disabled={disabled}
              >
                <Image source={{ uri: uri || '' }} style={styles.slotImage} contentFit="cover" />
              </Pressable>
              {filledCount > 1 ? (
                <Pressable
                  style={[styles.removeButton, { borderColor: cardBorderColor }]}
                  onPress={() => onRemovePhotoAt(index)}
                  disabled={disabled}
                >
                  <ThemedText style={[styles.removeText, { color: mutedTextColor }]}>x</ThemedText>
                </Pressable>
              ) : null}
            </Animated.View>
          );
        })}
      </View>
      <ThemedText style={[styles.helpText, { color: mutedTextColor }]}>
        Drag photos to reorder. Tap any box to add or replace.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SLOT_GAP,
  },
  slot: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    aspectRatio: SLOT_ASPECT_RATIO,
  },
  emptySlot: {
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '600',
    opacity: 0.7,
  },
  filledSlotPressable: {
    flex: 1,
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  removeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  draggingSlot: {
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  slotDropTarget: {
    borderWidth: 2,
  },
  slotPressed: {
    opacity: 0.75,
  },
  helpText: {
    fontSize: 12,
    opacity: 0.75,
  },
});
