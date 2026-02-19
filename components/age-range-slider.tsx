import React, { useMemo } from 'react';
import { StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import MultiSlider from '@ptomasroos/react-native-multi-slider';

import { ThemedText } from '@/components/themed-text';

type AgeRangeSliderProps = {
  values: [number, number];
  minAge: number;
  maxAge: number;
  onValuesChange: (values: [number, number]) => void;
  label?: string;
  labelColor: string;
  selectedColor: string;
  unselectedColor: string;
  markerBorderColor: string;
  blockStyle?: StyleProp<ViewStyle>;
  headerStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  trackStyle?: StyleProp<ViewStyle>;
};

const LINEAR_BLEND = 0.3;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AgeRangeSlider({
  values,
  minAge,
  maxAge,
  onValuesChange,
  label = 'Age range',
  labelColor,
  selectedColor,
  unselectedColor,
  markerBorderColor,
  blockStyle,
  headerStyle,
  labelStyle,
  containerStyle,
  trackStyle,
}: AgeRangeSliderProps) {
  const min = Math.min(minAge, maxAge);
  const max = Math.max(minAge, maxAge);
  const span = Math.max(1, max - min);
  const logBase = Math.log(span + 1);

  const ageToPosition = useMemo(() => {
    const mapAge = (age: number) => {
      const safeAge = clamp(age, min, max);
      const tLog = Math.log(safeAge - min + 1) / logBase;
      const tLin = (safeAge - min) / span;
      return (tLog * (1 - LINEAR_BLEND) + tLin * LINEAR_BLEND) * span;
    };
    return Array.from({ length: span + 1 }, (_, idx) => mapAge(min + idx));
  }, [logBase, min, max, span]);

  const sliderValues = useMemo(() => {
    const mapAge = (age: number) => ageToPosition[clamp(age, min, max) - min];
    return [mapAge(values[0]), mapAge(values[1])] as [number, number];
  }, [ageToPosition, max, min, values]);

  const handleValuesChange = (positions: number[]) => {
    const mapPosition = (pos: number) => {
      const normalized = clamp(pos, 0, span);
      let closestAge = min;
      let closestDistance = Infinity;
      for (let age = min; age <= max; age += 1) {
        const candidate = ageToPosition[age - min];
        const distance = Math.abs(candidate - normalized);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestAge = age;
        }
      }
      return closestAge;
    };
    const first = mapPosition(positions[0]);
    const second = mapPosition(positions[1]);
    const next: [number, number] = [Math.min(first, second), Math.max(first, second)];
    if (next[0] !== values[0] || next[1] !== values[1]) {
      onValuesChange(next);
    }
  };

  return (
    <View style={blockStyle}>
      <View style={headerStyle}>
        <ThemedText style={[labelStyle, { color: labelColor }]}>{label}</ThemedText>
        <ThemedText style={[labelStyle, { color: labelColor }]}>
          {values[0]} - {values[1]}
        </ThemedText>
      </View>
      <MultiSlider
        values={sliderValues}
        min={0}
        max={span}
        step={1}
        allowOverlap
        minMarkerOverlapDistance={0}
        onValuesChange={handleValuesChange}
        selectedStyle={{ backgroundColor: selectedColor }}
        unselectedStyle={{ backgroundColor: unselectedColor }}
        markerStyle={{ backgroundColor: selectedColor, borderColor: markerBorderColor }}
        trackStyle={trackStyle}
        containerStyle={containerStyle}
      />
    </View>
  );
}
