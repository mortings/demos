import { nativeImage, type NativeImage } from 'electron';
import { encodePng, renderAppIcon, renderMic } from './icon-render';

export function trayIcon(recording: boolean): NativeImage {
  const color: [number, number, number] = recording ? [235, 68, 68] : [0, 0, 0];
  const image = nativeImage.createEmpty();
  for (const scale of [1, 2]) {
    const size = 18 * scale;
    image.addRepresentation({ scaleFactor: scale, width: size, height: size, buffer: encodePng(size, size, renderMic(size, { color, background: null, inset: 0.05 })) });
  }
  if (process.platform === 'darwin' && !recording) image.setTemplateImage(true);
  return image;
}

export function appIcon(size = 512): NativeImage {
  return nativeImage.createFromBuffer(encodePng(size, size, renderAppIcon(size)));
}
