// Foto del post: scelta, ridimensionata e compressa sul dispositivo prima dell'invio.
// Ri-codificare in JPEG elimina anche i metadati EXIF (posizione GPS inclusa).
// La foto resta solo in memoria: non viene salvata né sul dispositivo né sul server.

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export interface PostPhoto {
  /** Anteprima locale (data URI) da mostrare nell'app. */
  previewUri: string;
  mediaType: "image/jpeg";
  /** JPEG in base64, senza prefisso. */
  base64: string;
}

/** Lato lungo massimo: abbastanza per i dettagli, leggero da inviare (~100-300 KB). */
const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.72;

export const CAMERA_AVAILABLE = Platform.OS !== "web";

export class PhotoPermissionDenied extends Error {}

export async function pickPostPhoto(source: "library" | "camera"): Promise<PostPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, allowsEditing: false };
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionDenied();
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_SIDE || asset.height > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  if (!saved.base64) throw new Error("Foto non leggibile");
  const base64 = saved.base64.replace(/^data:image\/\w+;base64,/, "");
  return { previewUri: `data:image/jpeg;base64,${base64}`, mediaType: "image/jpeg", base64 };
}
