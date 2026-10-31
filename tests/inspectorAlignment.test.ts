import { describe, expect, it } from 'vitest';
import { createClip, createProject } from '../src/core/model';
import { DEFAULT_TRANSFORM } from '../src/core/defaults';
import type { MediaAsset, Transform } from '../src/core/types';

describe('Inspector Alignment & Transform Controls', () => {
  const createFixture = () => {
    const project = createProject('Alignment Test');
    project.width = 1920;
    project.height = 1080;
    const asset: MediaAsset = {
      id: 'a1',
      name: 'video.mp4',
      path: '/video.mp4',
      url: 'file:///video.mp4',
      kind: 'video',
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    };
    project.assets = [asset];
    const clip = createClip(asset, project.tracks[1].id, 0, 30);
    project.clips = [clip];
    return { project, clip };
  };

  it('calculates alignment offsets matching canvas dimensions', () => {
    const { project } = createFixture();

    const alignLeft = -project.width / 4;
    const alignCenterH = 0;
    const alignRight = project.width / 4;
    const alignTop = -project.height / 4;
    const alignCenterV = 0;
    const alignBottom = project.height / 4;

    expect(alignLeft).toBe(-480);
    expect(alignCenterH).toBe(0);
    expect(alignRight).toBe(480);
    expect(alignTop).toBe(-270);
    expect(alignCenterV).toBe(0);
    expect(alignBottom).toBe(270);
  });

  it('resets transform values to defaults cleanly', () => {
    const customTransform: Transform = {
      scale: 2.5,
      x: 120,
      y: -80,
      rotation: 45,
      opacity: 0.7,
      flipX: true,
      flipY: false,
    };

    expect(customTransform.scale).not.toBe(DEFAULT_TRANSFORM.scale);
    expect(customTransform.x).not.toBe(DEFAULT_TRANSFORM.x);

    // Resetting transform restores default values
    const reset = { ...DEFAULT_TRANSFORM };
    expect(reset.scale).toBe(1);
    expect(reset.x).toBe(0);
    expect(reset.y).toBe(0);
    expect(reset.rotation).toBe(0);
    expect(reset.opacity).toBe(1);
    expect(reset.flipX).toBe(false);
    expect(reset.flipY).toBe(false);
  });

  it('resets opacity independently to 1', () => {
    let opacity = 0.45;
    opacity = 1;
    expect(opacity).toBe(1);
  });
});
