import * as THREE from 'three';
import { vertexShader, imageRevealShader } from './shaders';

// Placeholder images (using picsum for grayscale placeholders)
const IMAGES: Record<string, string> = {
  hex: 'https://picsum.photos/800/1000?grayscale&random=1',
  colorado: 'https://picsum.photos/800/1000?grayscale&random=2',
  work: 'https://picsum.photos/800/1000?grayscale&random=3',
  work2: 'https://picsum.photos/800/1000?grayscale&random=4'
};

export class ImageReveal {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;
  private clock: THREE.Clock;

  private currentImage: string | null = null;
  private targetProgress: number = 0;
  private currentProgress: number = 0;
  private textures: Map<string, THREE.Texture> = new Map();
  private textureLoader: THREE.TextureLoader;
  private container: HTMLElement;
  private isAnimating: boolean = false;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.canvas = canvas;
    this.container = container;
    this.clock = new THREE.Clock();
    this.textureLoader = new THREE.TextureLoader();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(400, 500);

    // Scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Create placeholder texture
    const placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = 2;
    placeholderCanvas.height = 2;
    const ctx = placeholderCanvas.getContext('2d')!;
    ctx.fillStyle = '#E5E5E3';
    ctx.fillRect(0, 0, 2, 2);
    const placeholderTexture = new THREE.CanvasTexture(placeholderCanvas);

    // Material
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: imageRevealShader,
      uniforms: {
        uImage: { value: placeholderTexture },
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(400, 500) }
      },
      transparent: true
    });

    // Quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(mesh);

    // Preload images
    this.preloadImages();

    // Start animation loop
    this.animate();
  }

  private preloadImages(): void {
    Object.entries(IMAGES).forEach(([key, url]) => {
      this.textureLoader.load(url, (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        this.textures.set(key, texture);
      });
    });
  }

  show(imageKey: string): void {
    if (this.currentImage === imageKey && this.targetProgress > 0) return;

    this.currentImage = imageKey;
    this.targetProgress = 1;
    this.container.classList.add('visible');

    // Set texture if loaded
    const texture = this.textures.get(imageKey);
    if (texture) {
      this.material.uniforms.uImage.value = texture;
    }

    if (!this.isAnimating) {
      this.animate();
    }
  }

  hide(): void {
    this.targetProgress = 0;
    this.currentImage = null;

    // Delay hiding container until animation completes
    setTimeout(() => {
      if (this.targetProgress === 0) {
        this.container.classList.remove('visible');
      }
    }, 400);
  }

  private animate = (): void => {
    this.isAnimating = true;
    const loop = () => {
      const time = this.clock.getElapsedTime();

      // Smooth progress interpolation
      const speed = this.targetProgress > this.currentProgress ? 0.08 : 0.12;
      this.currentProgress += (this.targetProgress - this.currentProgress) * speed;

      // Update uniforms
      this.material.uniforms.uProgress.value = this.currentProgress;
      this.material.uniforms.uTime.value = time;

      // Render
      this.renderer.render(this.scene, this.camera);

      // Continue animating if there's movement or if showing
      if (Math.abs(this.targetProgress - this.currentProgress) > 0.001 || this.targetProgress > 0) {
        requestAnimationFrame(loop);
      } else {
        this.isAnimating = false;
      }
    };

    loop();
  };

  dispose(): void {
    this.renderer.dispose();
    this.material.dispose();
    this.textures.forEach(t => t.dispose());
  }
}
