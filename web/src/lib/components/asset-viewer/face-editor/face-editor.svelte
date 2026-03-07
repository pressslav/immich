<script lang="ts">
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import { isFaceEditMode } from '$lib/stores/face-edit.svelte';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { getNaturalSize, scaleToFit } from '$lib/utils/container-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { scaleFaceRectOnResize } from '$lib/utils/people-utils';
  import { createFace, getAllPeople, type PersonResponseDto } from '@immich/sdk';
  import { Button, Input, modalManager, toastManager } from '@immich/ui';
  import { Canvas, InteractiveFabricObject, Rect } from 'fabric';
  import { clamp } from 'lodash-es';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    htmlElement: HTMLImageElement | HTMLVideoElement;
    containerWidth: number;
    containerHeight: number;
    assetId: string;
  }

  let { htmlElement, containerWidth, containerHeight, assetId }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let canvas: Canvas | undefined = $state();
  let faceRect: Rect | undefined = $state();
  let faceSelectorEl: HTMLDivElement | undefined = $state();
  let scrollableListEl: HTMLDivElement | undefined = $state();
  let page = $state(1);
  let candidates = $state<PersonResponseDto[]>([]);

  let searchTerm = $state('');
  let faceBoxPosition = $state({ left: 0, top: 0, width: 0, height: 0 });
  let initialized = false;
  let previousContentWidth = 0;
  let previousOffsetX = 0;
  let previousOffsetY = 0;

  let filteredCandidates = $derived(
    searchTerm
      ? candidates.filter((person) => person.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : candidates,
  );

  const configureControlStyle = () => {
    InteractiveFabricObject.ownDefaults = {
      ...InteractiveFabricObject.ownDefaults,
      cornerStyle: 'circle',
      cornerColor: 'rgb(153,166,251)',
      cornerSize: 10,
      padding: 8,
      transparentCorners: false,
      lockRotation: true,
      hasBorders: true,
    };
  };

  const setupCanvas = () => {
    if (!canvasEl || !htmlElement) {
      return;
    }

    canvas = new Canvas(canvasEl);
    configureControlStyle();

    // eslint-disable-next-line tscompat/tscompat
    faceRect = new Rect({
      fill: 'rgba(66,80,175,0.25)',
      stroke: 'rgb(66,80,175)',
      strokeWidth: 2,
      strokeUniform: true,
      width: 112,
      height: 112,
      objectCaching: true,
      rx: 8,
      ry: 8,
    });

    canvas.add(faceRect);
    canvas.setActiveObject(faceRect);
    setDefaultFaceRectanglePosition(faceRect);
  };

  onMount(() => {
    setupCanvas();
    void getPeople();

    if (!canvas) {
      return;
    }

    canvas.selection = false;

    const upperCanvas = canvas.upperCanvasEl;
    const controller = new AbortController();
    const { signal } = controller;

    const stopIfOnTarget = (event: Event) => {
      if (!canvas) {
        return;
      }
      const { target } = canvas.findTarget(event as PointerEvent);
      if (target) {
        event.stopPropagation();
      }
    };

    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      upperCanvas.addEventListener(type, stopIfOnTarget, { signal });
    }

    return () => {
      controller.abort();
    };
  });

  const imageContentMetrics = $derived.by(() => {
    const natural = getNaturalSize(htmlElement);
    const container = { width: containerWidth, height: containerHeight };
    const { width: contentWidth, height: contentHeight } = scaleToFit(natural, container);
    return {
      contentWidth,
      contentHeight,
      offsetX: (containerWidth - contentWidth) / 2,
      offsetY: (containerHeight - contentHeight) / 2,
    };
  });

  const setDefaultFaceRectanglePosition = (faceRect: Rect) => {
    const { offsetX, offsetY } = imageContentMetrics;

    faceRect.set({
      top: offsetY + 200,
      left: offsetX + 200,
    });

    faceRect.setCoords();
    positionFaceSelector();
  };

  $effect(() => {
    const { offsetX, offsetY, contentWidth } = imageContentMetrics;

    if (!canvas || contentWidth === 0) {
      return;
    }

    if (!initialized) {
      initialized = true;
      canvas.setDimensions({ width: containerWidth, height: containerHeight });

      if (faceRect) {
        faceRect.set({ top: offsetY + 200, left: offsetX + 200 });
        faceRect.setCoords();
      }

      previousContentWidth = contentWidth;
      previousOffsetX = offsetX;
      previousOffsetY = offsetY;
      positionFaceSelector();
      return;
    }

    canvas.setDimensions({ width: containerWidth, height: containerHeight });

    if (faceRect && previousContentWidth > 0) {
      const scaled = scaleFaceRectOnResize(
        { left: faceRect.left, top: faceRect.top, scaleX: faceRect.scaleX, scaleY: faceRect.scaleY },
        { previousOffsetX, previousOffsetY, previousContentWidth },
        offsetX,
        offsetY,
        contentWidth,
      );
      faceRect.set(scaled);
      faceRect.setCoords();
    }

    previousContentWidth = contentWidth;
    previousOffsetX = offsetX;
    previousOffsetY = offsetY;

    canvas.renderAll();
    positionFaceSelector();
  });

  const cancel = () => {
    isFaceEditMode.value = false;
  };

  const getPeople = async () => {
    const { hasNextPage, people, total } = await getAllPeople({ page, size: 1000, withHidden: false });

    if (candidates.length === total) {
      return;
    }

    candidates = [...candidates, ...people];

    if (hasNextPage) {
      page++;
    }
  };

  const MAX_LIST_HEIGHT = 250;

  const positionFaceSelector = () => {
    if (!faceRect || !faceSelectorEl || !scrollableListEl) {
      return;
    }

    const gap = 15;
    const padding = faceRect.padding ?? 0;
    const rawBox = faceRect.getBoundingRect();
    const { currentZoom, currentPositionX, currentPositionY } = assetViewerManager.zoomState;
    const faceBox = {
      left: (rawBox.left - padding) * currentZoom + currentPositionX,
      top: (rawBox.top - padding) * currentZoom + currentPositionY,
      width: (rawBox.width + padding * 2) * currentZoom,
      height: (rawBox.height + padding * 2) * currentZoom,
    };
    const selectorWidth = faceSelectorEl.offsetWidth;
    const chromeHeight = faceSelectorEl.offsetHeight - scrollableListEl.offsetHeight;
    const listHeight = Math.min(MAX_LIST_HEIGHT, containerHeight - gap * 2 - chromeHeight);
    const selectorHeight = listHeight + chromeHeight;

    const clampTop = (top: number) => clamp(top, gap, containerHeight - selectorHeight - gap);
    const clampLeft = (left: number) => clamp(left, gap, containerWidth - selectorWidth - gap);

    const overlapArea = (position: { top: number; left: number }) => {
      const selectorRight = position.left + selectorWidth;
      const selectorBottom = position.top + selectorHeight;
      const faceRight = faceBox.left + faceBox.width;
      const faceBottom = faceBox.top + faceBox.height;

      const overlapX = Math.max(0, Math.min(selectorRight, faceRight) - Math.max(position.left, faceBox.left));
      const overlapY = Math.max(0, Math.min(selectorBottom, faceBottom) - Math.max(position.top, faceBox.top));
      return overlapX * overlapY;
    };

    const faceBottom = faceBox.top + faceBox.height;
    const faceRight = faceBox.left + faceBox.width;

    const positions = [
      { top: clampTop(faceBottom + gap), left: clampLeft(faceBox.left) },
      { top: clampTop(faceBox.top - selectorHeight - gap), left: clampLeft(faceBox.left) },
      { top: clampTop(faceBox.top), left: clampLeft(faceRight + gap) },
      { top: clampTop(faceBox.top), left: clampLeft(faceBox.left - selectorWidth - gap) },
    ];

    let bestPosition = positions[0];
    let leastOverlap = Infinity;

    for (const position of positions) {
      const overlap = overlapArea(position);
      if (overlap < leastOverlap) {
        leastOverlap = overlap;
        bestPosition = position;
        if (overlap === 0) {
          break;
        }
      }
    }

    faceSelectorEl.style.top = `${bestPosition.top}px`;
    faceSelectorEl.style.left = `${bestPosition.left}px`;
    scrollableListEl.style.height = `${listHeight}px`;
    faceBoxPosition = { left: faceBox.left, top: faceBox.top, width: faceBox.width, height: faceBox.height };
  };

  $effect(() => {
    if (!canvas) {
      return;
    }

    const { currentZoom, currentPositionX, currentPositionY } = assetViewerManager.zoomState;
    canvas.setViewportTransform([currentZoom, 0, 0, currentZoom, currentPositionX, currentPositionY]);
    canvas.renderAll();
    positionFaceSelector();
  });

  $effect(() => {
    const rect = faceRect;
    if (rect) {
      rect.on('moving', positionFaceSelector);
      rect.on('scaling', positionFaceSelector);
      return () => {
        rect.off('moving', positionFaceSelector);
        rect.off('scaling', positionFaceSelector);
      };
    }
  });

  const getFaceCroppedCoordinates = () => {
    if (!faceRect || !htmlElement) {
      return;
    }

    const left = faceRect.left;
    const top = faceRect.top;
    const width = faceRect.getScaledWidth();
    const height = faceRect.getScaledHeight();
    const { offsetX, offsetY, contentWidth, contentHeight } = imageContentMetrics;
    const natural = getNaturalSize(htmlElement);

    const scaleX = natural.width / contentWidth;
    const scaleY = natural.height / contentHeight;
    const imageX = (left - offsetX) * scaleX;
    const imageY = (top - offsetY) * scaleY;

    return {
      imageWidth: natural.width,
      imageHeight: natural.height,
      x: Math.floor(imageX),
      y: Math.floor(imageY),
      width: Math.floor(width * scaleX),
      height: Math.floor(height * scaleY),
    };
  };

  const tagFace = async (person: PersonResponseDto) => {
    try {
      const data = getFaceCroppedCoordinates();
      if (!data) {
        toastManager.warning($t('error_tag_face_bounding_box'));
        return;
      }

      const isConfirmed = await modalManager.showDialog({
        prompt: person.name
          ? $t('confirm_tag_face', { values: { name: person.name } })
          : $t('confirm_tag_face_unnamed'),
      });

      if (!isConfirmed) {
        return;
      }

      await createFace({
        assetFaceCreateDto: {
          assetId,
          personId: person.id,
          ...data,
        },
      });

      await assetViewingStore.setAssetId(assetId);
    } catch (error) {
      handleError(error, 'Error tagging face');
    } finally {
      isFaceEditMode.value = false;
    }
  };
</script>

<div
  id="face-editor-data"
  class="absolute start-0 top-0 z-5 h-full w-full overflow-hidden"
  data-face-left={faceBoxPosition.left}
  data-face-top={faceBoxPosition.top}
  data-face-width={faceBoxPosition.width}
  data-face-height={faceBoxPosition.height}
>
  <canvas bind:this={canvasEl} id="face-editor" class="absolute top-0 start-0"></canvas>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    id="face-selector"
    bind:this={faceSelectorEl}
    class="absolute top-[calc(50%-250px)] start-[calc(50%-125px)] max-w-[250px] w-[250px] bg-white dark:bg-immich-dark-gray dark:text-immich-dark-fg backdrop-blur-sm px-2 py-4 rounded-xl border border-gray-200 dark:border-gray-800 transition-[top,left] duration-200 ease-out"
    onpointerdown={(e) => e.stopPropagation()}
    onpointermove={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
  >
    <p class="text-center text-sm">{$t('select_person_to_tag')}</p>

    <div class="my-3 relative">
      <Input placeholder={$t('search_people')} bind:value={searchTerm} size="tiny" />
    </div>

    <div bind:this={scrollableListEl} class="h-62.5 overflow-y-auto mt-2">
      {#if filteredCandidates.length > 0}
        <div class="mt-2 rounded-lg">
          {#each filteredCandidates as person (person.id)}
            <button
              onclick={() => tagFace(person)}
              type="button"
              class="w-full flex place-items-center gap-2 rounded-lg ps-1 pe-4 py-2 hover:bg-immich-primary/25"
            >
              <ImageThumbnail
                curve
                shadow
                url={getPeopleThumbnailUrl(person)}
                altText={person.name}
                title={person.name}
                widthStyle="30px"
                heightStyle="30px"
              />
              <p class="text-sm">
                {person.name}
              </p>
            </button>
          {/each}
        </div>
      {:else}
        <div class="flex items-center justify-center py-4">
          <p class="text-sm text-gray-500">{$t('no_people_found')}</p>
        </div>
      {/if}
    </div>

    <Button size="small" fullWidth onclick={cancel} color="danger" class="mt-2">{$t('cancel')}</Button>
  </div>
</div>
