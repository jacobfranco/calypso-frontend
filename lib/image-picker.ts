import * as ImagePicker from 'expo-image-picker';

export async function pickPhotoFromLibrary(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.85,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const uri = result.assets[0]?.uri?.trim();
  return uri || null;
}
