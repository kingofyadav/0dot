import * as ImagePicker from "expo-image-picker";
import type { LocalImage } from "../api/client";

// Shared by compose (post media) and profile edit (avatar/cover) — both
// need the same "ask permission, launch the library picker, hand back a
// LocalImage" flow with nothing screen-specific in it.

// Mirrors saveUploadedImage's default maxBytes (src/lib/uploads.ts) — kept
// in sync manually since that module is server-only and can't be imported
// here. Checking it up front (when the picker tells us the size) means a
// too-big photo gets a clear message immediately instead of a five-second
// upload that ends in the same rejection.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type PickImageResult =
  | { status: "picked"; image: LocalImage }
  | { status: "cancelled" }
  | { status: "permission_denied" }
  | { status: "too_large" };

export async function pickImage(options?: { aspect?: [number, number] }): Promise<PickImageResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  // Denied/restricted permission used to resolve to a plain `null` here,
  // identical to the user just cancelling the picker — callers had no way
  // to tell the two apart, so "change avatar" would silently do nothing on
  // a device without library access. Returning a distinct status lets the
  // caller show an actual message only in this case.
  if (!permission.granted) return { status: "permission_denied" };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: Boolean(options?.aspect),
    aspect: options?.aspect,
  });
  if (result.canceled || result.assets.length === 0) return { status: "cancelled" };

  const asset = result.assets[0];
  // fileSize isn't guaranteed by every platform/library provider — when
  // present, it's an exact pre-upload check; when absent, the upload
  // proceeds and the server's own maxBytes check is the backstop.
  if (asset.fileSize !== undefined && asset.fileSize > MAX_IMAGE_BYTES) {
    return { status: "too_large" };
  }

  return { status: "picked", image: { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName } };
}
