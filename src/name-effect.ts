import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const patternFragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;

  varying vec2 vUv;

  #define PI 3.14159265359

  // Simple hash for subtle variation
  float hash(float n) {
    return fract(sin(n) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = uv * aspect;
    float t = uTime;

    // Diagonal lines
    float angle = PI * 0.25;
    vec2 rotUv = vec2(
      p.x * cos(angle) - p.y * sin(angle),
      p.x * sin(angle) + p.y * cos(angle)
    );

    // Primary lines - slightly thicker than original with subtle variation
    float freq1 = 45.0;
    float linePos1 = rotUv.x * freq1 + t * 0.1;
    float lineIdx1 = floor(linePos1 / PI);
    float widthVar1 = 0.08 + hash(lineIdx1) * 0.06; // Subtle variation 0.08-0.14
    float lines = sin(linePos1);
    lines = smoothstep(0.0, widthVar1, abs(lines));

    // Secondary lines
    float wave = sin(rotUv.y * 5.0 + t * 0.5) * 0.02;
    float freq2 = 65.0;
    float linePos2 = (rotUv.x + wave) * freq2 + t * 0.05;
    float lineIdx2 = floor(linePos2 / PI);
    float widthVar2 = 0.1 + hash(lineIdx2 + 50.0) * 0.05;
    float lines2 = sin(linePos2);
    lines2 = smoothstep(0.0, widthVar2, abs(lines2));

    float pattern = min(lines, lines2);

    // Cream background color
    vec3 bgColor = vec3(0.98, 0.97, 0.96);
    // Dark text color (matching bio)
    vec3 textColor = vec3(0.227, 0.227, 0.22);

    // Diagonal lines are cream on dark
    vec3 color = mix(bgColor, textColor, pattern);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const compositeFragmentShader = `
  uniform sampler2D uPattern;
  uniform sampler2D uTextMask;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform float uTime;

  uniform vec2 uRipples[10];
  uniform float uRippleTimes[10];
  uniform int uRippleCount;

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

    // Constant subtle text movement
    float baseWave1 = sin(uv.x * 6.0 + uTime * 0.6) * cos(uv.y * 4.0 + uTime * 0.4);
    float baseWave2 = sin(uv.y * 8.0 - uTime * 0.4) * cos(uv.x * 5.0 + uTime * 0.5);
    vec2 baseDistortion = vec2(baseWave1, baseWave2) * 0.002;

    // Ripple distortion
    float totalRipple = 0.0;
    vec2 rippleDistortion = vec2(0.0);

    for (int i = 0; i < 10; i++) {
      if (i >= uRippleCount) break;

      vec2 ripplePos = uRipples[i];
      float rippleTime = uRippleTimes[i];
      float age = uTime - rippleTime;

      if (age < 0.0 || age > 2.5) continue;

      vec2 delta = (uv - ripplePos) * aspect;
      float dist = length(delta);

      float rippleRadius = age * 0.5;
      float rippleWidth = 0.2;

      float wave = smoothstep(rippleRadius - rippleWidth, rippleRadius - rippleWidth * 0.3, dist)
                 - smoothstep(rippleRadius + rippleWidth * 0.3, rippleRadius + rippleWidth, dist);

      float wobble = sin(dist * 25.0 - age * 6.0) * 0.25;
      wave *= (1.0 + wobble);

      float fade = 1.0 - (age / 2.5);
      fade = fade * fade * fade;

      wave *= fade;
      totalRipple += wave;

      vec2 dir = normalize(delta + 0.001);
      rippleDistortion += dir * wave * 0.02;
    }

    // Mouse proximity
    vec2 mouseDelta = (uv - uMouse) * aspect;
    float mouseDist = length(mouseDelta);
    float mouseWave = sin(mouseDist * 15.0 - uTime * 2.5);
    float mouseInfluence = smoothstep(0.35, 0.0, mouseDist) * 0.25;
    totalRipple += mouseInfluence * (1.0 + mouseWave * 0.15);

    vec2 mouseDistortion = normalize(mouseDelta + 0.001) * mouseInfluence * 0.008;

    // Combine distortions
    vec2 totalDistortion = baseDistortion + rippleDistortion + mouseDistortion;

    vec2 textUv = uv + totalDistortion;
    vec2 patternUv = uv + totalDistortion * 0.5;

    // Sample textures
    vec4 pattern = texture2D(uPattern, patternUv);
    float textMask = texture2D(uTextMask, textUv).r;

    // Colors - inverted: dark text on cream background
    vec3 bgColor = vec3(0.98, 0.97, 0.96);
    vec3 textColor = vec3(0.227, 0.227, 0.22); // Dark warm gray like bio

    // Composite - text is dark by default
    float reveal = textMask * totalRipple;
    reveal = smoothstep(0.0, 0.35, reveal);
    reveal = clamp(reveal, 0.0, 1.0);

    // Start with cream background
    vec3 color = bgColor;

    // Add dark text where mask exists
    color = mix(color, textColor, textMask);

    // Reveal pattern (cream diagonals) through the text on ripple
    color = mix(color, pattern.rgb, reveal * textMask);

    gl_FragColor = vec4(color, 1.0);
  }
`;

interface Ripple {
  position: THREE.Vector2;
  time: number;
}

const FONT_OPTIONS: Record<string, string> = {
  'abril': 'Abril Fatface',
  'bodoni': 'Bodoni Moda',
  'fraunces': 'Fraunces',
  'ultra': 'Ultra',
  'playfair': 'Playfair Display'
};

export class NameEffect {
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  private patternScene: THREE.Scene;
  private patternCamera: THREE.OrthographicCamera;
  private patternMaterial: THREE.ShaderMaterial;
  private patternTarget: THREE.WebGLRenderTarget;

  private textCanvas: HTMLCanvasElement;
  private textTexture: THREE.CanvasTexture;

  private compositeScene: THREE.Scene;
  private compositeCamera: THREE.OrthographicCamera;
  private compositeMaterial: THREE.ShaderMaterial;

  private mouse: THREE.Vector2;
  private targetMouse: THREE.Vector2;
  private ripples: Ripple[] = [];
  private boundingRect: DOMRect | null = null;
  private nameSection: HTMLElement;
  private fontFamily: string;

  constructor(canvas: HTMLCanvasElement, nameSection: HTMLElement, fontKey: string = 'abril') {
    this.fontFamily = FONT_OPTIONS[fontKey] || FONT_OPTIONS['abril'];
    this.clock = new THREE.Clock();
    this.mouse = new THREE.Vector2(0.5, 0.5);
    this.targetMouse = new THREE.Vector2(0.5, 0.5);
    this.nameSection = nameSection;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height);

    this.patternTarget = new THREE.WebGLRenderTarget(width * dpr, height * dpr);

    // Pattern scene
    this.patternScene = new THREE.Scene();
    this.patternCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.patternMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: patternFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) }
      }
    });
    this.patternScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.patternMaterial));

    // Text mask
    this.textCanvas = document.createElement('canvas');
    this.textCanvas.width = width * dpr;
    this.textCanvas.height = height * dpr;
    this.textTexture = new THREE.CanvasTexture(this.textCanvas);
    this.textTexture.minFilter = THREE.LinearFilter;
    this.textTexture.magFilter = THREE.LinearFilter;
    this.renderTextMask();

    // Composite scene
    this.compositeScene = new THREE.Scene();
    this.compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const ripplePositions: THREE.Vector2[] = [];
    const rippleTimes: number[] = [];
    for (let i = 0; i < 10; i++) {
      ripplePositions.push(new THREE.Vector2(0, 0));
      rippleTimes.push(-10);
    }

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: compositeFragmentShader,
      uniforms: {
        uPattern: { value: this.patternTarget.texture },
        uTextMask: { value: this.textTexture },
        uResolution: { value: new THREE.Vector2(width, height) },
        uMouse: { value: this.mouse },
        uTime: { value: 0 },
        uRipples: { value: ripplePositions },
        uRippleTimes: { value: rippleTimes },
        uRippleCount: { value: 0 }
      }
    });
    this.compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial));

    this.setupEventListeners();
  }

  private renderTextMask(): void {
    const ctx = this.textCanvas.getContext('2d')!;
    const width = this.textCanvas.width;
    const height = this.textCanvas.height;
    const dpr = Math.min(window.devicePixelRatio, 2);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Large font size
    const vw = window.innerWidth * 0.01;
    const fontSize = Math.min(Math.max(22 * vw, 30 * vw), 38 * vw) * dpr;
    ctx.font = `900 ${fontSize}px "${this.fontFamily}", Georgia, serif`;

    // Position - bottom left, Mateer bleeding off bottom
    const padding = 4 * 16 * dpr; // 4rem
    const lineHeight = fontSize * 0.82;

    // Position Mateer so bottom ~30% is cut off
    const mateerY = height + fontSize * 0.25;
    const sY = mateerY - lineHeight;

    ctx.fillText('Mateer', padding, mateerY);
    ctx.fillText('S', padding, sY);

    this.textTexture.needsUpdate = true;

    console.log('Font:', this.fontFamily); // Debug
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);

    this.renderer.setSize(width, height);
    this.patternTarget.setSize(width * dpr, height * dpr);

    this.textCanvas.width = width * dpr;
    this.textCanvas.height = height * dpr;
    this.renderTextMask();

    this.patternMaterial.uniforms.uResolution.value.set(width, height);
    this.compositeMaterial.uniforms.uResolution.value.set(width, height);
  }

  private onMouseMove(event: MouseEvent): void {
    const x = event.clientX / window.innerWidth;
    const y = 1.0 - event.clientY / window.innerHeight;
    this.targetMouse.set(x, y);

    const now = this.clock.getElapsedTime();
    const lastRipple = this.ripples[this.ripples.length - 1];
    if (!lastRipple || now - lastRipple.time > 0.05) {
      this.addRipple(x, y);
    }
  }

  private addRipple(x: number, y: number): void {
    const time = this.clock.getElapsedTime();
    this.ripples.push({ position: new THREE.Vector2(x, y), time });

    this.ripples = this.ripples.filter(r => time - r.time < 2.5);
    if (this.ripples.length > 10) {
      this.ripples = this.ripples.slice(-10);
    }

    const positions = this.compositeMaterial.uniforms.uRipples.value as THREE.Vector2[];
    const times = this.compositeMaterial.uniforms.uRippleTimes.value as number[];

    for (let i = 0; i < 10; i++) {
      if (i < this.ripples.length) {
        positions[i].copy(this.ripples[i].position);
        times[i] = this.ripples[i].time;
      } else {
        times[i] = -10;
      }
    }
    this.compositeMaterial.uniforms.uRippleCount.value = this.ripples.length;
  }

  start(): void {
    const animate = () => {
      requestAnimationFrame(animate);

      const time = this.clock.getElapsedTime();

      this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.1;
      this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.1;

      this.patternMaterial.uniforms.uTime.value = time;
      this.compositeMaterial.uniforms.uTime.value = time;
      this.compositeMaterial.uniforms.uMouse.value = this.mouse;

      this.renderer.setRenderTarget(this.patternTarget);
      this.renderer.render(this.patternScene, this.patternCamera);

      this.renderer.setRenderTarget(null);
      this.renderer.render(this.compositeScene, this.compositeCamera);
    };

    animate();
  }

  dispose(): void {
    this.renderer.dispose();
    this.patternMaterial.dispose();
    this.compositeMaterial.dispose();
    this.patternTarget.dispose();
    this.textTexture.dispose();
  }
}
