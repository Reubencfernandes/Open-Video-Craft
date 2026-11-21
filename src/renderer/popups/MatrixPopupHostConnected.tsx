/** Connected host: subscribes to the global popup store for every renderer view. */
import { useEffect, useSyncExternalStore } from "react";
import type { MatrixPopupRequest } from "../../shared/types";

import { matrixPopupStore } from "./matrix-popup-api";
import { MatrixPopupHost } from "./MatrixPopupHost";

export function MatrixPopupHostConnected(props: { children: React.ReactNode }) {
  const popups = useSyncExternalStore(
    matrixPopupStore.subscribe,
    matrixPopupStore.getSnapshot,
    matrixPopupStore.getSnapshot
  );

  useEffect(() => {
    const unsubscribeShow = window.openVideoCraft.popups.onShow((request: MatrixPopupRequest) => {
      matrixPopupStore.show(request);
    });
    const unsubscribeClear = window.openVideoCraft.popups.onClear(() => {
      matrixPopupStore.clear();
    });
    return () => {
      unsubscribeShow();
      unsubscribeClear();
    };
  }, []);

  return (
    <>
      {props.children}
      <MatrixPopupHost
        popups={popups}
        onDismiss={matrixPopupStore.dismiss}
        onPause={matrixPopupStore.pause}
        onResume={matrixPopupStore.resume}
      />
    </>
  );
}
