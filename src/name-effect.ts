import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ============================================
// TOPOGRAPHIC PATTERN
// ============================================
const topoPatternShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;
  #define PI 3.14159265359

  // Simplex noise for smooth terrain
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Smooth FBM for gentle, flowing terrain
  float fbm(vec2 p, float time) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    vec2 drift = vec2(time * 0.012, time * 0.008);

    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(p * frequency + drift);
      amplitude *= 0.5;
      frequency *= 2.0;
      drift *= 1.1;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 p = uv * aspect;
    float t = uTime;

    // Smooth terrain with multiple scales
    vec2 topoCoord = p * 1.8 + vec2(2.0, 1.0);

    // Layer smooth noise for organic feel
    float terrain = fbm(topoCoord, t) * 0.7;
    terrain += fbm(topoCoord * 0.5 + vec2(5.0, 3.0), t * 0.8) * 0.3;

    // Normalize to 0-1
    terrain = terrain * 0.5 + 0.5;

    // Create crisp contour lines using gradient for anti-aliasing
    float contourInterval = 0.04;
    float contourPhase = terrain / contourInterval;
    float contourLine = fract(contourPhase);

    // Use fwidth for resolution-independent crisp lines
    float fw = fwidth(terrain) / contourInterval;
    float lineWidth = 0.02; // Thin uniform lines

    // Crisp anti-aliased line
    float contour = smoothstep(lineWidth + fw, lineWidth - fw, contourLine) +
                    smoothstep(1.0 - lineWidth - fw, 1.0 - lineWidth + fw, contourLine);

    contour = clamp(contour, 0.0, 1.0);

    // Colors - cream lines on dark (matches diagonal pattern style)
    vec3 bgColor = vec3(0.98, 0.97, 0.96);
    vec3 textColor = vec3(0.227, 0.227, 0.22);

    // Invert: dark background with cream contour lines
    vec3 color = mix(bgColor, textColor, 1.0 - contour);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const topoCompositeShader = `
  uniform sampler2D uPattern;
  uniform sampler2D uTextMask;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform float uTime;

  uniform vec2 uRipples[10];
  uniform float uRippleTimes[10];
  uniform int uRippleCount;

  // Ambient spots that peek through the background
  uniform vec2 uAmbientSpots[3];
  uniform float uAmbientSpotTimes[3];
  uniform int uAmbientSpotCount;

  varying vec2 vUv;

  // Simplex noise for organic shapes
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Sample expanded mask - dilates the text boundary
  float sampleExpandedMask(vec2 uv, vec2 texelSize, float radius) {
    float maxVal = texture2D(uTextMask, uv).r;
    // Sample in circle for smooth expansion
    for (float a = 0.0; a < 6.28; a += 0.52) { // 12 samples
      vec2 offset = vec2(cos(a), sin(a)) * texelSize * radius;
      maxVal = max(maxVal, texture2D(uTextMask, uv + offset).r);
    }
    return maxVal;
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 texelSize = 1.0 / uResolution;

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

    // Mouse proximity - smooth magnetic pull toward cursor
    vec2 mouseDelta = (uv - uMouse) * aspect;
    float mouseDist = length(mouseDelta);
    float mouseInfluence = smoothstep(0.45, 0.0, mouseDist);

    // Pattern reveal near cursor
    totalRipple += mouseInfluence * 0.4;

    // Magnetic pull distortion
    vec2 mouseDistortion = normalize(mouseDelta + 0.001) * mouseInfluence * 0.015;

    // Combine distortions
    vec2 totalDistortion = baseDistortion + rippleDistortion + mouseDistortion;

    vec2 textUv = uv + totalDistortion;
    vec2 patternUv = uv + totalDistortion * 0.5;

    // Sample textures
    vec4 pattern = texture2D(uPattern, patternUv);
    float textMask = texture2D(uTextMask, textUv).r;

    // Extract contour presence from pattern (1 = on a contour line, 0 = between lines)
    float patternLum = (pattern.r + pattern.g + pattern.b) / 3.0;
    float isContour = 1.0 - smoothstep(0.25, 0.6, patternLum);

    // Colors
    vec3 bgColor = vec3(0.98, 0.97, 0.96);
    vec3 textColor = vec3(0.227, 0.227, 0.22);

    // How much to dissolve (0 = solid text, 1 = fully dissolved into topo)
    float dissolve = totalRipple * 2.5;
    dissolve = clamp(dissolve, 0.0, 1.0);

    // Expand the mask boundary - contours extend beyond original letter edges
    float expandRadius = dissolve * 20.0;
    float expandedMask = sampleExpandedMask(textUv, texelSize, expandRadius);

    // The letter boundary becomes defined by contour lines, not the sharp font edge
    // Where there's a contour line near the edge, the letter extends to it
    float contourEdge = expandedMask * (isContour * 0.7 + 0.3);

    // Original mask area gets the full treatment
    float coreMask = textMask;

    // Combined: core stays solid longer, edges dissolve into contour lines
    float finalMask = max(coreMask * (1.0 - dissolve * 0.5), contourEdge * dissolve);
    finalMask = clamp(finalMask, 0.0, 1.0);

    // Solid fill fades away, replaced by contour-defined letters
    float solidFill = coreMask * (1.0 - dissolve * 1.5);
    solidFill = clamp(solidFill, 0.0, 1.0);

    // Start with cream background
    vec3 color = bgColor;

    // Layer 1: Show topo pattern where the expanded/dissolved mask exists
    color = mix(color, pattern.rgb, finalMask);

    // Layer 2: Overlay remaining solid fill (fades as dissolve increases)
    color = mix(color, textColor, solidFill);

    // Ambient spots - topo peeks through background with continuous pattern transition
    float textPresence = max(textMask, finalMask);

    // Calculate combined spot influence first
    float totalSpotInfluence = 0.0;

    for (int i = 0; i < 3; i++) {
      if (i >= uAmbientSpotCount) break;

      vec2 spotPos = uAmbientSpots[i];
      float spotBirth = uAmbientSpotTimes[i];
      float spotAge = uTime - spotBirth;

      // Lifespan fade
      float fadeIn = smoothstep(0.0, 1.5, spotAge);
      float fadeOut = 1.0 - smoothstep(3.5, 5.0, spotAge);
      float spotFade = fadeIn * fadeOut;

      // Organic amoeba shape
      vec2 delta = (uv - spotPos) * aspect;
      float dist = length(delta);
      float angle = atan(delta.y, delta.x);
      float spotOffset = float(i) * 17.3;
      float morphTime = uTime * 0.15 + spotOffset;

      float blob1 = snoise(vec2(angle * 0.5 + morphTime, spotOffset)) * 0.5;
      float blob2 = snoise(vec2(angle * 0.8 - morphTime * 0.6, spotOffset + 5.0)) * 0.3;
      float blob3 = snoise(vec2(angle * 1.2 + morphTime * 0.4, spotOffset + 10.0)) * 0.2;
      float boundaryNoise = blob1 + blob2 + blob3;

      float baseRadius = 0.14;
      float organicRadius = baseRadius + boundaryNoise * 0.06;
      float edgeSoftness = 0.06;
      float spotInfluence = smoothstep(organicRadius + edgeSoftness, organicRadius - edgeSoftness * 0.5, dist);

      float internalNoise = snoise(uv * 4.0 + vec2(morphTime * 0.5, spotOffset)) * 0.5 + 0.5;
      spotInfluence *= mix(0.7, 1.0, internalNoise);

      totalSpotInfluence = max(totalSpotInfluence, spotInfluence * spotFade);
    }

    // Pattern colors - extract contour from pattern luminance
    float patternLuminance = (pattern.r + pattern.g + pattern.b) / 3.0;
    float contourPresence = 1.0 - smoothstep(0.3, 0.7, patternLuminance);

    // Two color modes (contourPresence = 0 on lines, 1 on background):
    // - Background (spots): dark/gray contour lines on cream
    // - Text (reveal): cream contour lines on dark
    vec3 darkOnCream = mix(textColor * 0.7, bgColor, contourPresence);  // dark on lines, cream on bg
    vec3 creamOnDark = mix(bgColor, textColor, contourPresence);        // cream on lines, dark on bg

    // Determine where we are relative to text boundary
    float boundaryGradient = smoothstep(0.0, 0.3, textMask);

    // When cursor is near AND spot is present, allow continuity
    float cursorSpotInteraction = mouseInfluence * totalSpotInfluence;

    // Base spot effect on background (masked by text presence)
    float bgSpotStrength = totalSpotInfluence * (1.0 - textPresence) * 0.25;

    // Continuous pattern effect when hovering near text with spot nearby
    float continuousStrength = cursorSpotInteraction * 0.5;

    // Apply background spots (dark lines on cream)
    color = mix(color, darkOnCream, bgSpotStrength);

    // Apply continuous pattern transitioning into text
    // Uses boundaryGradient to shift from darkOnCream to creamOnDark
    vec3 transitionColor = mix(darkOnCream, creamOnDark, boundaryGradient);
    color = mix(color, transitionColor, continuousStrength);

    gl_FragColor = vec4(color, 1.0);
  }
`;

interface Ripple {
  position: THREE.Vector2;
  time: number;
}

interface AmbientSpot {
  position: THREE.Vector2;
  birthTime: number;
  lifespan: number; // How long until it fully fades out
}

export const FONT_OPTIONS: Record<string, string> = {
  'junction': 'Junction',
  'junction-stroked': 'Junction (stroked)',
  'oswald': 'Oswald',
  'bebas': 'Bebas Neue',
  'montserrat': 'Montserrat',
  'poppins': 'Poppins'
};

const FONT_WEIGHTS: Record<string, number> = {
  'junction': 700,
  'junction-stroked': 700,
  'oswald': 700,
  'bebas': 400,
  'montserrat': 900,
  'poppins': 900
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
  private ambientSpots: AmbientSpot[] = [];
  private nextSpotTime: number = 0;
  private fontFamily: string;
  private fontKey: string;
  private resizeTimeout: number | null = null;

  constructor(canvas: HTMLCanvasElement, fontKey: string = 'junction') {
    this.fontKey = fontKey;
    this.fontFamily = this.getFontFamily(fontKey);
    this.clock = new THREE.Clock();
    this.mouse = new THREE.Vector2(0.5, 0.5);
    this.targetMouse = new THREE.Vector2(0.5, 0.5);

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
      fragmentShader: topoPatternShader,
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

    // Ambient spot uniforms
    const ambientSpotPositions: THREE.Vector2[] = [];
    const ambientSpotTimes: number[] = [];
    for (let i = 0; i < 3; i++) {
      ambientSpotPositions.push(new THREE.Vector2(-10, -10)); // Off-screen
      ambientSpotTimes.push(-100);
    }

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: topoCompositeShader,
      uniforms: {
        uPattern: { value: this.patternTarget.texture },
        uTextMask: { value: this.textTexture },
        uResolution: { value: new THREE.Vector2(width, height) },
        uMouse: { value: this.mouse },
        uTime: { value: 0 },
        uRipples: { value: ripplePositions },
        uRippleTimes: { value: rippleTimes },
        uRippleCount: { value: 0 },
        uAmbientSpots: { value: ambientSpotPositions },
        uAmbientSpotTimes: { value: ambientSpotTimes },
        uAmbientSpotCount: { value: 0 }
      }
    });
    this.compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial));

    this.setupEventListeners();
  }

  private getFontFamily(key: string): string {
    if (key === 'junction-stroked') return 'Junction';
    return FONT_OPTIONS[key] || 'Junction';
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

    const fontWeight = FONT_WEIGHTS[this.fontKey] || 700;
    const padding = 4 * 16 * dpr; // 4rem padding on each side
    const availableWidth = width - (padding * 2);

    // Measure "Mateer" at a reference size to calculate scale
    const referenceSize = 100 * dpr;
    ctx.font = `${fontWeight} ${referenceSize}px "${this.fontFamily}", sans-serif`;
    const measuredWidth = ctx.measureText('Mateer').width;

    // Scale font to fill available width
    const fontSize = (availableWidth / measuredWidth) * referenceSize;
    ctx.font = `${fontWeight} ${fontSize}px "${this.fontFamily}", sans-serif`;

    const lineHeight = fontSize * 0.82;

    // Position Mateer so bottom ~30% is cut off
    const mateerY = height + fontSize * 0.25;
    const sY = mateerY - lineHeight;

    // Apply stroke for bolder effect if stroked variant
    if (this.fontKey === 'junction-stroked') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = fontSize * 0.03;
      ctx.lineJoin = 'round';
      ctx.strokeText('Mateer', padding, mateerY);
      ctx.strokeText('S', padding, sY);
    }

    ctx.fillText('Mateer', padding, mateerY);
    ctx.fillText('S', padding, sY);

    this.textTexture.needsUpdate = true;
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
  }

  private onResize(): void {
    // Clear any pending resize
    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }

    // Debounce: wait for resize to settle before re-rendering
    this.resizeTimeout = window.setTimeout(() => {
      this.handleResize();
      this.resizeTimeout = null;
    }, 100);
  }

  private handleResize(): void {
    this.reinitialize();
  }

  private reinitialize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);

    // Update renderer size
    this.renderer.setSize(width, height);

    // Dispose old render target and create new one
    this.patternTarget.dispose();
    this.patternTarget = new THREE.WebGLRenderTarget(width * dpr, height * dpr);

    // Dispose old text texture and create new one
    this.textTexture.dispose();
    this.textCanvas.width = width * dpr;
    this.textCanvas.height = height * dpr;
    this.textTexture = new THREE.CanvasTexture(this.textCanvas);
    this.textTexture.minFilter = THREE.LinearFilter;
    this.textTexture.magFilter = THREE.LinearFilter;
    this.renderTextMask();

    // Update all uniforms with new textures and resolution
    this.patternMaterial.uniforms.uResolution.value.set(width, height);
    this.compositeMaterial.uniforms.uPattern.value = this.patternTarget.texture;
    this.compositeMaterial.uniforms.uTextMask.value = this.textTexture;
    this.compositeMaterial.uniforms.uResolution.value.set(width, height);
  }

  private onMouseMove(event: MouseEvent): void {
    const x = event.clientX / window.innerWidth;
    const y = 1.0 - event.clientY / window.innerHeight;
    this.targetMouse.set(x, y);
    // Ripples no longer triggered on move - just smooth magnetic proximity effect
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

  private updateAmbientSpots(time: number): void {
    // Remove expired spots (lifespan is 5 seconds total: 1s fade in, 3s hold, 1s fade out)
    this.ambientSpots = this.ambientSpots.filter(spot => time - spot.birthTime < 5.0);

    // Spawn new spots if we have fewer than 2-3 and it's time
    const maxSpots = 2 + Math.floor(Math.random() * 2); // 2-3 spots
    if (this.ambientSpots.length < maxSpots && time >= this.nextSpotTime) {
      // Random position, avoiding center where text likely is
      // Prefer edges and corners
      let x: number, y: number;
      const region = Math.random();
      if (region < 0.4) {
        // Right side
        x = 0.6 + Math.random() * 0.35;
        y = Math.random();
      } else if (region < 0.7) {
        // Top area
        x = Math.random();
        y = 0.6 + Math.random() * 0.35;
      } else {
        // Bottom right corner
        x = 0.5 + Math.random() * 0.45;
        y = Math.random() * 0.4;
      }

      this.ambientSpots.push({
        position: new THREE.Vector2(x, y),
        birthTime: time,
        lifespan: 5.0
      });

      // Next spot spawns in 2-4 seconds
      this.nextSpotTime = time + 2.0 + Math.random() * 2.0;
    }

    // Update uniforms
    const positions = this.compositeMaterial.uniforms.uAmbientSpots.value as THREE.Vector2[];
    const times = this.compositeMaterial.uniforms.uAmbientSpotTimes.value as number[];

    for (let i = 0; i < 3; i++) {
      if (i < this.ambientSpots.length) {
        positions[i].copy(this.ambientSpots[i].position);
        times[i] = this.ambientSpots[i].birthTime;
      } else {
        positions[i].set(-10, -10);
        times[i] = -100;
      }
    }
    this.compositeMaterial.uniforms.uAmbientSpotCount.value = this.ambientSpots.length;
  }

  start(): void {
    const animate = () => {
      requestAnimationFrame(animate);

      const time = this.clock.getElapsedTime();

      this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.1;
      this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.1;

      // Update ambient spots for topo pattern
      this.updateAmbientSpots(time);

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

  setFont(fontKey: string): void {
    this.fontKey = fontKey;
    this.fontFamily = this.getFontFamily(fontKey);
    this.renderTextMask();
    console.log('Switched to font:', this.fontFamily);
  }

  dispose(): void {
    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }
    this.renderer.dispose();
    this.patternMaterial.dispose();
    this.compositeMaterial.dispose();
    this.patternTarget.dispose();
    this.textTexture.dispose();
  }
}
