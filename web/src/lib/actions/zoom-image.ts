import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
import type { ZoomImageWheelState } from '@zoom-image/core';
import { createZoomImageWheel } from '@zoom-image/core';

export const MAX_ZOOM = 10;

export const zoomImageAction = (node: HTMLElement, options?: { zoomTarget?: HTMLElement }) => {
  let zoomInstance = createZoomImageWheel(node, {
    maxZoom: MAX_ZOOM,
    initialState: assetViewerManager.zoomState,
    zoomTarget: options?.zoomTarget,
  });

  let needsResync = false;

  const createInstance = () => {
    zoomInstance.cleanup();
    zoomInstance = createZoomImageWheel(node, {
      maxZoom: MAX_ZOOM,
      initialState: { ...assetViewerManager.zoomState, enable: true },
      zoomTarget: options?.zoomTarget,
    });
    node.style.overflow = 'visible';
    unsubscribeStore?.();
    unsubscribeStore = zoomInstance.subscribe(({ state }) => assetViewerManager.onZoomChange(state));
    needsResync = false;
  };

  const applyDirectTransform = (state: ZoomImageWheelState) => {
    const target = options?.zoomTarget ?? node.querySelector('img');
    if (target) {
      (target as HTMLElement).style.transformOrigin = '0 0';
      (target as HTMLElement).style.transform =
        `translate(${state.currentPositionX}px, ${state.currentPositionY}px) scale(${state.currentZoom})`;
      needsResync = true;
    }
  };

  const resyncIfNeeded = () => {
    if (needsResync) {
      createInstance();
    }
  };

  let unsubscribeStore = zoomInstance.subscribe(({ state }) => assetViewerManager.onZoomChange(state));

  const unsubscribeManager = assetViewerManager.on({
    ZoomChange: (state) => zoomInstance.setState(state),
    DirectTransform: (state) => applyDirectTransform(state),
    ZoomEnabled: (enabled) => {
      if (enabled && needsResync) {
        createInstance();
      } else {
        zoomInstance.setState({ enable: enabled });
      }
    },
  });

  const cancelAnimation = () => assetViewerManager.cancelZoomAnimation();

  const controller = new AbortController();
  const { signal } = controller;

  node.addEventListener('pointerdown', cancelAnimation, { capture: true, signal });
  node.addEventListener('pointerdown', resyncIfNeeded, { signal });
  node.addEventListener('wheel', resyncIfNeeded, { signal });

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
      unsubscribeManager();
      unsubscribeStore?.();
      zoomInstance.cleanup();
    },
  };
};
