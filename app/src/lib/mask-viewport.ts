export interface MaskView { zoom: number; x: number; y: number }
export function limitMaskView(view: MaskView, width: number, height: number): MaskView {
  const zoom = Math.max(1, Math.min(6, view.zoom));
  return { zoom, x: Math.max(width * (1 - zoom), Math.min(0, view.x)), y: Math.max(height * (1 - zoom), Math.min(0, view.y)) };
}
export function zoomMaskView(view: MaskView, zoom: number, cx: number, cy: number, width: number, height: number): MaskView {
  zoom = Math.max(1, Math.min(6, zoom));
  const ratio = zoom / view.zoom;
  return limitMaskView({ zoom, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio }, width, height);
}
export function maskImagePoint(clientX: number, clientY: number, bounds: { left: number; top: number; width: number; height: number }, width: number, height: number) {
  return { x: Math.max(0, Math.min(width, (clientX - bounds.left) * width / bounds.width)), y: Math.max(0, Math.min(height, (clientY - bounds.top) * height / bounds.height)) };
}
