import type { Faces } from '$lib/stores/people.store';
import type { ContentMetrics } from '$lib/utils/container-utils';
import { getBoundingBox, scaleFaceRectOnResize, type FaceRectState, type ResizeContext } from '$lib/utils/people-utils';

const makeFace = (overrides: Partial<Faces> = {}): Faces => ({
  id: 'face-1',
  imageWidth: 4000,
  imageHeight: 3000,
  boundingBoxX1: 1000,
  boundingBoxY1: 750,
  boundingBoxX2: 2000,
  boundingBoxY2: 1500,
  ...overrides,
});

describe('getBoundingBox', () => {
  it('should scale face coordinates to display dimensions', () => {
    const face = makeFace();
    const metrics: ContentMetrics = { contentWidth: 800, contentHeight: 600, offsetX: 0, offsetY: 0 };

    const boxes = getBoundingBox([face], metrics);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toEqual({
      id: 'face-1',
      top: Math.round(600 * (750 / 3000)),
      left: Math.round(800 * (1000 / 4000)),
      width: Math.round(800 * (2000 / 4000) - 800 * (1000 / 4000)),
      height: Math.round(600 * (1500 / 3000) - 600 * (750 / 3000)),
    });
  });

  it('should apply offsets for letterboxed display', () => {
    const face = makeFace({
      imageWidth: 1000,
      imageHeight: 1000,
      boundingBoxX1: 0,
      boundingBoxY1: 0,
      boundingBoxX2: 1000,
      boundingBoxY2: 1000,
    });
    const metrics: ContentMetrics = { contentWidth: 600, contentHeight: 600, offsetX: 100, offsetY: 0 };

    const boxes = getBoundingBox([face], metrics);

    expect(boxes[0]).toEqual({
      id: 'face-1',
      top: 0,
      left: 100,
      width: 600,
      height: 600,
    });
  });

  it('should handle zoom by pre-scaled metrics', () => {
    const face = makeFace({
      imageWidth: 1000,
      imageHeight: 1000,
      boundingBoxX1: 0,
      boundingBoxY1: 0,
      boundingBoxX2: 500,
      boundingBoxY2: 500,
    });
    const metrics: ContentMetrics = {
      contentWidth: 1600,
      contentHeight: 1200,
      offsetX: -200,
      offsetY: -100,
    };

    const boxes = getBoundingBox([face], metrics);

    expect(boxes[0]).toEqual({
      id: 'face-1',
      top: -100,
      left: -200,
      width: 800,
      height: 600,
    });
  });

  it('should return empty array for empty faces', () => {
    const metrics: ContentMetrics = { contentWidth: 800, contentHeight: 600, offsetX: 0, offsetY: 0 };
    expect(getBoundingBox([], metrics)).toEqual([]);
  });

  it('should handle multiple faces', () => {
    const faces = [
      makeFace({ id: 'face-1', boundingBoxX1: 0, boundingBoxY1: 0, boundingBoxX2: 1000, boundingBoxY2: 1000 }),
      makeFace({ id: 'face-2', boundingBoxX1: 2000, boundingBoxY1: 1500, boundingBoxX2: 3000, boundingBoxY2: 2500 }),
    ];
    const metrics: ContentMetrics = { contentWidth: 800, contentHeight: 600, offsetX: 0, offsetY: 0 };

    const boxes = getBoundingBox(faces, metrics);

    expect(boxes).toHaveLength(2);
    expect(boxes[0].left).toBeLessThan(boxes[1].left);
  });
});

describe('scaleFaceRectOnResize', () => {
  const makeRect = (overrides: Partial<FaceRectState> = {}): FaceRectState => ({
    left: 300,
    top: 400,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  });

  const makePrevious = (overrides: Partial<ResizeContext> = {}): ResizeContext => ({
    previousOffsetX: 100,
    previousOffsetY: 50,
    previousContentWidth: 800,
    ...overrides,
  });

  it('should preserve relative position when container doubles in size', () => {
    const rect = makeRect({ left: 300, top: 250 });
    const previous = makePrevious({ previousOffsetX: 100, previousOffsetY: 50, previousContentWidth: 800 });

    const result = scaleFaceRectOnResize(rect, previous, 200, 100, 1600);

    // imageRelLeft = (300 - 100) * 2 = 400, new left = 200 + 400 = 600
    // imageRelTop = (250 - 50) * 2 = 400, new top = 100 + 400 = 500
    expect(result.left).toBe(600);
    expect(result.top).toBe(500);
    expect(result.scaleX).toBe(2);
    expect(result.scaleY).toBe(2);
  });

  it('should preserve relative position when container halves in size', () => {
    const rect = makeRect({ left: 300, top: 250 });
    const previous = makePrevious({ previousOffsetX: 100, previousOffsetY: 50, previousContentWidth: 800 });

    const result = scaleFaceRectOnResize(rect, previous, 50, 25, 400);

    // imageRelLeft = (300 - 100) * 0.5 = 100, new left = 50 + 100 = 150
    // imageRelTop = (250 - 50) * 0.5 = 100, new top = 25 + 100 = 125
    expect(result.left).toBe(150);
    expect(result.top).toBe(125);
    expect(result.scaleX).toBe(0.5);
    expect(result.scaleY).toBe(0.5);
  });

  it('should handle no change in dimensions', () => {
    const rect = makeRect({ left: 300, top: 250, scaleX: 1.5, scaleY: 1.5 });
    const previous = makePrevious({ previousOffsetX: 100, previousOffsetY: 50, previousContentWidth: 800 });

    const result = scaleFaceRectOnResize(rect, previous, 100, 50, 800);

    expect(result.left).toBe(300);
    expect(result.top).toBe(250);
    expect(result.scaleX).toBe(1.5);
    expect(result.scaleY).toBe(1.5);
  });

  it('should handle offset changes without content width change', () => {
    const rect = makeRect({ left: 300, top: 250 });
    const previous = makePrevious({ previousOffsetX: 100, previousOffsetY: 50, previousContentWidth: 800 });

    const result = scaleFaceRectOnResize(rect, previous, 150, 75, 800);

    // scale = 1, imageRelLeft = 200, imageRelTop = 200
    // new left = 150 + 200 = 350, new top = 75 + 200 = 275
    expect(result.left).toBe(350);
    expect(result.top).toBe(275);
    expect(result.scaleX).toBe(1);
    expect(result.scaleY).toBe(1);
  });

  it('should compound existing scale factors', () => {
    const rect = makeRect({ left: 300, top: 250, scaleX: 2, scaleY: 3 });
    const previous = makePrevious({ previousContentWidth: 800 });

    const result = scaleFaceRectOnResize(rect, previous, previous.previousOffsetX, previous.previousOffsetY, 1600);

    expect(result.scaleX).toBe(4);
    expect(result.scaleY).toBe(6);
  });

  it('should handle rect at image origin (top-left of content area)', () => {
    const rect = makeRect({ left: 100, top: 50 });
    const previous = makePrevious({ previousOffsetX: 100, previousOffsetY: 50, previousContentWidth: 800 });

    const result = scaleFaceRectOnResize(rect, previous, 200, 100, 1600);

    // imageRelLeft = (100 - 100) * 2 = 0, new left = 200
    // imageRelTop = (50 - 50) * 2 = 0, new top = 100
    expect(result.left).toBe(200);
    expect(result.top).toBe(100);
  });
});
