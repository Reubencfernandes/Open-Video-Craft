/** Renderer-facing API for showing Matrix-style popups. */
import { createMatrixPopupStore, type MatrixPopupOptions } from "./matrix-popup-store";

export const matrixPopupStore = createMatrixPopupStore();

/** Show a popup from any renderer module without prop drilling. */
export function showMatrixPopup(options: MatrixPopupOptions): string {
  return matrixPopupStore.show(options);
}

export function dismissMatrixPopup(id: string): void {
  matrixPopupStore.dismiss(id);
}

export function clearMatrixPopups(): void {
  matrixPopupStore.clear();
}
