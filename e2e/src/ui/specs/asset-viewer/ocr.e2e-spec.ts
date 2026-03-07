import type { AssetOcrResponseDto, AssetResponseDto } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { toAssetResponseDto } from 'src/ui/generators/timeline';
import {
  createMockStack,
  createMockStackAsset,
  MockStack,
  setupBrokenAssetMockApiRoutes,
} from 'src/ui/mock-network/broken-asset-network';
import { createMockOcrData, setupOcrMockApiRoutes } from 'src/ui/mock-network/ocr-network';
import { assetViewerUtils } from '../timeline/utils';
import { setupAssetViewerFixture } from './utils';

test.describe.configure({ mode: 'parallel' });

const PRIMARY_OCR_BOXES = [
  { text: 'Hello World', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.1, x3: 0.4, y3: 0.15, x4: 0.1, y4: 0.15 },
  { text: 'Immich Photo', x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.3, x3: 0.6, y3: 0.36, x4: 0.2, y4: 0.36 },
];

const SECONDARY_OCR_BOXES = [
  { text: 'Second Asset Text', x1: 0.15, y1: 0.2, x2: 0.55, y2: 0.2, x3: 0.55, y3: 0.26, x4: 0.15, y4: 0.26 },
];

test.describe('OCR bounding boxes', () => {
  const fixture = setupAssetViewerFixture(920);

  test.beforeEach(async ({ context }) => {
    const primaryAssetDto = toAssetResponseDto(fixture.primaryAsset);
    const ocrDataByAssetId = new Map<string, AssetOcrResponseDto[]>([
      [primaryAssetDto.id, createMockOcrData(primaryAssetDto.id, PRIMARY_OCR_BOXES)],
    ]);

    await setupOcrMockApiRoutes(context, ocrDataByAssetId);
  });

  test('OCR bounding boxes appear when clicking OCR button', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const ocrButton = page.getByLabel('Text recognition');
    await expect(ocrButton).toBeVisible();
    await ocrButton.click();

    const ocrBoxes = page.locator('[data-viewer-content] .border-blue-500');
    await expect(ocrBoxes).toHaveCount(2);

    await expect(ocrBoxes.nth(0)).toContainText('Hello World');
    await expect(ocrBoxes.nth(1)).toContainText('Immich Photo');
  });

  test('OCR bounding boxes toggle off on second click', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const ocrButton = page.getByLabel('Text recognition');
    await ocrButton.click();
    await expect(page.locator('[data-viewer-content] .border-blue-500').first()).toBeVisible();

    await ocrButton.click();
    await expect(page.locator('[data-viewer-content] .border-blue-500')).toHaveCount(0);
  });
});

test.describe('OCR with stacked assets', () => {
  const fixture = setupAssetViewerFixture(921);
  let mockStack: MockStack;
  let primaryAssetDto: AssetResponseDto;
  let secondAssetDto: AssetResponseDto;

  test.beforeAll(async () => {
    primaryAssetDto = toAssetResponseDto(fixture.primaryAsset);
    secondAssetDto = createMockStackAsset(fixture.adminUserId);
    secondAssetDto.originalFileName = 'second-ocr-asset.jpg';
    mockStack = createMockStack(primaryAssetDto, [secondAssetDto], new Set());
  });

  test.beforeEach(async ({ context }) => {
    await setupBrokenAssetMockApiRoutes(context, mockStack);

    const ocrDataByAssetId = new Map<string, AssetOcrResponseDto[]>([
      [primaryAssetDto.id, createMockOcrData(primaryAssetDto.id, PRIMARY_OCR_BOXES)],
      [secondAssetDto.id, createMockOcrData(secondAssetDto.id, SECONDARY_OCR_BOXES)],
    ]);

    await setupOcrMockApiRoutes(context, ocrDataByAssetId);
  });

  test('different OCR boxes shown for different stacked assets', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const ocrButton = page.getByLabel('Text recognition');
    await expect(ocrButton).toBeVisible();
    await ocrButton.click();

    const ocrBoxes = page.locator('[data-viewer-content] .border-blue-500');
    await expect(ocrBoxes).toHaveCount(2);
    await expect(ocrBoxes.nth(0)).toContainText('Hello World');

    const stackThumbnails = page.locator('#stack-slideshow [data-asset]');
    await expect(stackThumbnails).toHaveCount(2);
    await stackThumbnails.nth(1).click();

    // refreshOcr() clears showOverlay when switching assets, so re-enable it
    await expect(ocrBoxes).toHaveCount(0);
    await expect(ocrButton).toBeVisible();
    await ocrButton.click();

    await expect(ocrBoxes).toHaveCount(1);
    await expect(ocrBoxes.first()).toContainText('Second Asset Text');
  });
});

test.describe('OCR boxes and zoom', () => {
  const fixture = setupAssetViewerFixture(922);

  test.beforeEach(async ({ context }) => {
    const primaryAssetDto = toAssetResponseDto(fixture.primaryAsset);
    const ocrDataByAssetId = new Map<string, AssetOcrResponseDto[]>([
      [primaryAssetDto.id, createMockOcrData(primaryAssetDto.id, PRIMARY_OCR_BOXES)],
    ]);

    await setupOcrMockApiRoutes(context, ocrDataByAssetId);
  });

  test('OCR boxes scale with zoom', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const ocrButton = page.getByLabel('Text recognition');
    await expect(ocrButton).toBeVisible();
    await ocrButton.click();

    const ocrBox = page.locator('[data-viewer-content] .border-blue-500').first();
    await expect(ocrBox).toBeVisible();

    const initialBox = await ocrBox.boundingBox();
    expect(initialBox).toBeTruthy();

    const { width, height } = page.viewportSize()!;
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, -3);
    await page.waitForTimeout(500);

    const zoomedBox = await ocrBox.boundingBox();
    expect(zoomedBox).toBeTruthy();

    expect(zoomedBox!.width).toBeGreaterThan(initialBox!.width);
    expect(zoomedBox!.height).toBeGreaterThan(initialBox!.height);
  });
});
