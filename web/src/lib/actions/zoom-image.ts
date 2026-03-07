import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
import { createZoomImageWheel } from '@zoom-image/core';

export const zoomImageAction = (node: HTMLElement, options?: { zoomTarget?: HTMLElement }) => {
  const zoomInstance = createZoomImageWheel(node, {
    maxZoom: 10,
    initialState: assetViewerManager.zoomState,
    zoomTarget: options?.zoomTarget,
  });

  const unsubscribes = [
    assetViewerManager.on({ ZoomChange: (state) => zoomInstance.setState(state) }),
    zoomInstance.subscribe(({ state }) => assetViewerManager.onZoomChange(state)),
  ];

  const cancelAnimation = () => assetViewerManager.cancelZoomAnimation();

  const controller = new AbortController();
  const { signal } = controller;

  node.addEventListener('pointerdown', cancelAnimation, { capture: true, signal });

  // Suppress Safari's synthetic dblclick on double-tap. Without this, zoom-image's touchstart
  // handler zooms to maxZoom (10x), then Safari's synthetic dblclick triggers photo-viewer's
  // handler which conflicts. Chrome does not fire synthetic dblclick on touch.
  let lastPointerWasTouch = false;
  const trackPointerType = (event: PointerEvent) => {
    lastPointerWasTouch = event.pointerType === 'touch';
  };
  const suppressTouchDblClick = (event: MouseEvent) => {
    if (lastPointerWasTouch) {
      event.stopImmediatePropagation();
    }
  };
  node.addEventListener('pointerdown', trackPointerType, { capture: true, signal });
  node.addEventListener('dblclick', suppressTouchDblClick, { capture: true, signal });

  // Allow zoomed content to render outside the container bounds
  node.style.overflow = 'visible';
  // Prevent browser handling of touch gestures so zoom-image can manage them
  node.style.touchAction = 'none';
  return {
    update(newOptions?: { zoomTarget?: HTMLElement }) {
      options = newOptions;
      if (newOptions?.zoomTarget !== undefined) {
        zoomInstance.setState({ zoomTarget: newOptions.zoomTarget });
      }
    },
    destroy() {
      controller.abort();
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      zoomInstance.cleanup();
    },
  };
};
