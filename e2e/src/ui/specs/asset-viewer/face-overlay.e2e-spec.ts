import { expect, test } from '@playwright/test';
import { toAssetResponseDto } from 'src/ui/generators/timeline';
import {
  createMockFaceData,
  createMockPeople,
  type MockFaceSpec,
  setupFaceEditorMockApiRoutes,
  setupFaceOverlayMockApiRoutes,
} from 'src/ui/mock-network/face-editor-network';
import { assetViewerUtils } from '../timeline/utils';
import { ensureDetailPanelVisible, setupAssetViewerFixture } from './utils';

test.describe.configure({ mode: 'parallel' });

const FACE_SPECS: MockFaceSpec[] = [
  {
    personId: 'person-alice',
    personName: 'Alice Johnson',
    faceId: 'face-alice',
    boundingBoxX1: 1000,
    boundingBoxY1: 500,
    boundingBoxX2: 1500,
    boundingBoxY2: 1200,
  },
  {
    personId: 'person-bob',
    personName: 'Bob Smith',
    faceId: 'face-bob',
    boundingBoxX1: 2000,
    boundingBoxY1: 800,
    boundingBoxX2: 2400,
    boundingBoxY2: 1600,
  },
];

test.describe('face overlay bounding boxes', () => {
  const fixture = setupAssetViewerFixture(901);
  const mockPeople = createMockPeople(4);

  test.beforeEach(async ({ context }) => {
    const faceData = createMockFaceData(
      FACE_SPECS,
      fixture.primaryAssetDto.width ?? 3000,
      fixture.primaryAssetDto.height ?? 4000,
    );
    const assetDtoWithFaces = toAssetResponseDto(fixture.primaryAsset, undefined, faceData);
    await setupFaceOverlayMockApiRoutes(context, assetDtoWithFaces);
    await setupFaceEditorMockApiRoutes(context, mockPeople, { requests: [] });
  });

  test('face overlay divs render with correct aria labels', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const aliceOverlay = page.getByLabel('Person: Alice Johnson');
    const bobOverlay = page.getByLabel('Person: Bob Smith');

    await expect(aliceOverlay).toBeVisible();
    await expect(bobOverlay).toBeVisible();
  });

  test('face overlay shows border on hover', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const aliceOverlay = page.getByLabel('Person: Alice Johnson');
    await expect(aliceOverlay).toBeVisible();

    await expect(aliceOverlay).not.toHaveClass(/border-solid/);

    await aliceOverlay.hover();
    await expect(aliceOverlay).toHaveClass(/border-solid/);
    await expect(aliceOverlay).toHaveClass(/border-white/);
    await expect(aliceOverlay).toHaveClass(/border-3/);
  });

  test('face name tooltip appears on hover', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const aliceOverlay = page.getByLabel('Person: Alice Johnson');
    await expect(aliceOverlay).toBeVisible();

    await aliceOverlay.hover();

    const nameTooltip = aliceOverlay.locator('div', { hasText: 'Alice Johnson' });
    await expect(nameTooltip).toBeVisible();
  });

  test('face overlays hidden in face edit mode', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const aliceOverlay = page.getByLabel('Person: Alice Johnson');
    await expect(aliceOverlay).toBeVisible();

    await ensureDetailPanelVisible(page);
    await page.getByLabel('Tag people').click();
    await page.locator('#face-selector').waitFor({ state: 'visible' });

    await expect(aliceOverlay).toBeHidden();
  });
});

test.describe('zoom and face editor interaction', () => {
  const fixture = setupAssetViewerFixture(902);
  const mockPeople = createMockPeople(4);

  test.beforeEach(async ({ context }) => {
    const faceData = createMockFaceData(
      FACE_SPECS,
      fixture.primaryAssetDto.width ?? 3000,
      fixture.primaryAssetDto.height ?? 4000,
    );
    const assetDtoWithFaces = toAssetResponseDto(fixture.primaryAsset, undefined, faceData);
    await setupFaceOverlayMockApiRoutes(context, assetDtoWithFaces);
    await setupFaceEditorMockApiRoutes(context, mockPeople, { requests: [] });
  });

  test('zoom is preserved when entering face edit mode', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const { width, height } = page.viewportSize()!;
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, -1);
    await page.waitForTimeout(300);

    const zoomedTransform = await page.getByTestId('preview').evaluate((element) => {
      return getComputedStyle(element.closest('[style*="transform"]') ?? element).transform;
    });
    const isZoomed = zoomedTransform !== 'none' && zoomedTransform !== '';

    await ensureDetailPanelVisible(page);
    await page.getByLabel('Tag people').click();
    await page.locator('#face-selector').waitFor({ state: 'visible' });

    await expect(page.locator('#face-editor')).toBeVisible();

    if (isZoomed) {
      const afterTransform = await page.getByTestId('preview').evaluate((element) => {
        return getComputedStyle(element.closest('[style*="transform"]') ?? element).transform;
      });
      expect(afterTransform).not.toBe('none');
    }
  });
});
