import * as ImagePicker from "expo-image-picker";
import type { LocalImage } from "../api/client";

// Shared by compose (post media) and profile edit (avatar/cover) — both
// need the same "ask permission, launch the library picker, hand back a
// LocalImage" flow with nothing screen-specific in it.
export async function pickImage(options?: { aspect?: [number, number] }): Promise<LocalImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: Boolean(options?.aspect),
    aspect: options?.aspect,
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName };
}
