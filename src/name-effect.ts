import * as THREE from 'three';

const MAX_AMBIENT_SPOTS = 3;
const MAX_CURSOR_TRAIL_SPOTS = 20;
const SPOT_LIFESPAN = 5.0;
const CURSOR_TRAIL_LIFESPAN = 1.5;
const CURSOR_TRAIL_MIN_DISTANCE_PX = 10;
const CURSOR_TRAIL_MIN_SPEED = 120;
const CURSOR_TRAIL_SPEED_RANGE = 900;
const CURSOR_TRAIL_MIN_RADIUS = 0.05;
const CURSOR_TRAIL_MAX_RADIUS = 0.09;
const CURSOR_TRAIL_MIN_STRENGTH = 0.08;
const CURSOR_TRAIL_MAX_STRENGTH = 0.20;
const CURSOR_TRAIL_LAG_SECONDS = 0.06;
const CURSOR_TRAIL_MAX_DELAY_DISTANCE_PX = 60;
const CURSOR_TRAIL_SAMPLE_WINDOW_SECONDS = 0.3;

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

    for (int i = 0; i < 4; i++) {
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

    // Smooth terrain with multiple scales (higher = smaller/denser pattern)
    vec2 topoCoord = p * 2.25 + vec2(2.0, 1.0);

    // Layer smooth noise for organic feel
    float terrain = fbm(topoCoord, t) * 0.7;
    terrain += fbm(topoCoord * 0.5 + vec2(5.0, 3.0), t * 0.8) * 0.3;

    // Normalize to 0-1
    terrain = terrain * 0.5 + 0.5;

    // Create crisp contour lines using gradient for anti-aliasing
    float contourInterval = 0.03;
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

  // Ambient spots that peek through the background
  uniform vec2 uAmbientSpots[3];
  uniform float uAmbientSpotTimes[3];
  uniform int uAmbientSpotCount;

  // Cursor trails that briefly expose the pattern while the pointer moves
  uniform vec2 uCursorTrailSpots[${MAX_CURSOR_TRAIL_SPOTS}];
  uniform float uCursorTrailTimes[${MAX_CURSOR_TRAIL_SPOTS}];
  uniform float uCursorTrailStrengths[${MAX_CURSOR_TRAIL_SPOTS}];
  uniform float uCursorTrailRadii[${MAX_CURSOR_TRAIL_SPOTS}];
  uniform int uCursorTrailCount;

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
    // Sample in circle for smooth expansion (8 samples at 45-degree intervals)
    for (float a = 0.0; a < 6.28; a += 0.785) {
      vec2 offset = vec2(cos(a), sin(a)) * texelSize * radius;
      maxVal = max(maxVal, texture2D(uTextMask, uv + offset).r);
    }
    return maxVal;
  }

  float organicSpotInfluence(vec2 uv, vec2 aspect, vec2 spotPos, float baseRadius, float edgeSoftness, float seed, float morphSpeed) {
    vec2 delta = (uv - spotPos) * aspect;
    float dist = length(delta);
    float angle = atan(delta.y, delta.x);
    float boundaryNoise = snoise(vec2(angle * 0.7 + uTime * morphSpeed + seed, seed)) * 0.7;
    float organicRadius = baseRadius + boundaryNoise * baseRadius * 0.35;
    return smoothstep(organicRadius + edgeSoftness, organicRadius - edgeSoftness * 0.5, dist);
  }

  float cursorTrailFade(float age) {
    float fadeIn = smoothstep(0.0, 0.18, age);
    float lifeProgress = clamp(age / ${CURSOR_TRAIL_LIFESPAN}, 0.0, 1.0);
    float fadeOut = pow(1.0 - lifeProgress, 1.8);
    return fadeIn * fadeOut;
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 texelSize = 1.0 / uResolution;

    // Constant subtle text movement
    float baseWave1 = sin(uv.x * 6.0 + uTime * 0.6) * cos(uv.y * 4.0 + uTime * 0.4);
    float baseWave2 = sin(uv.y * 8.0 - uTime * 0.4) * cos(uv.x * 5.0 + uTime * 0.5);
    vec2 baseDistortion = vec2(baseWave1, baseWave2) * 0.002;

    vec2 textUv = uv + baseDistortion;
    vec2 patternUv = uv + baseDistortion * 0.5;

    // Sample textures
    vec4 pattern = texture2D(uPattern, patternUv);
    float textMask = texture2D(uTextMask, textUv).r;

    // Extract contour presence from pattern (1 = on a contour line, 0 = between lines)
    float patternLum = (pattern.r + pattern.g + pattern.b) / 3.0;
    float isContour = 1.0 - smoothstep(0.25, 0.6, patternLum);

    // Colors
    vec3 bgColor = vec3(0.98, 0.97, 0.96);
    vec3 textColor = vec3(0.227, 0.227, 0.22);

    // Keep the hidden text mask stable; cursor trails only affect background reveal.
    float dissolve = 0.0;

    // Expand the mask boundary - contours extend beyond original letter edges
    float expandRadius = dissolve * 20.0;
    float expandedMask = sampleExpandedMask(textUv, texelSize, expandRadius);

    // The letter boundary becomes defined by contour lines, not the sharp font edge
    float contourEdge = expandedMask * (isContour * 0.7 + 0.3);

    // Original mask area gets the full treatment
    float coreMask = textMask;

    // Combined: core stays solid longer, edges dissolve into contour lines
    float finalMask = max(coreMask * (1.0 - dissolve * 0.5), contourEdge * dissolve);
    finalMask = clamp(finalMask, 0.0, 1.0);

    // Solid fill fades away, replaced by contour-defined letters
    float solidFill = coreMask * (1.0 - dissolve * 1.5);
    solidFill = clamp(solidFill, 0.0, 1.0);

    // Pattern colors - extract contour from pattern luminance
    float patternLuminance = (pattern.r + pattern.g + pattern.b) / 3.0;
    float contourPresence = 1.0 - smoothstep(0.3, 0.7, patternLuminance);

    // Two color modes:
    // - Background: dark/gray contour lines on cream
    // - Text: cream contour lines on dark
    vec3 darkOnCream = mix(textColor * 0.7, bgColor, contourPresence);
    vec3 creamOnDark = mix(bgColor, textColor, contourPresence);
    vec3 bgLayer = bgColor;

    // === CURSOR RADIAL FADE ===
    vec2 cursorDelta = (uv - uMouse) * aspect;
    float cursorDist = length(cursorDelta);

    // Fade radius - text starts fading at this distance from cursor
    float fadeRadius = 0.25;
    float fadeStrength = smoothstep(fadeRadius, 0.0, cursorDist);

    // Near cursor, fade the text based on how close to the edge we are
    float edgeDistance = 2.5 - smoothstep(0.0, 0.8, coreMask);
    float cursorFade = fadeStrength * edgeDistance;

    // Text visibility: reduced by cursor proximity fade
    float textVisibility = finalMask * (1.0 - cursorFade * 0.9);
    textVisibility = clamp(textVisibility, 0.0, 1.0);

    // Text layer - at edges near cursor, blend toward background
    vec3 textLayer = mix(creamOnDark, bgLayer, cursorFade * 0.7);

    // Blend: background layer, then text pattern on top
    vec3 color = mix(bgLayer, textLayer, textVisibility);

    // Solid text core (fades with dissolve AND cursor proximity)
    float adjustedSolidFill = solidFill * (1.0 - cursorFade * 0.8);
    color = mix(color, textColor, adjustedSolidFill);

    float ambientReveal = 0.0;
    for (int i = 0; i < 3; i++) {
      if (i >= uAmbientSpotCount) break;

      float spotAge = uTime - uAmbientSpotTimes[i];
      float fadeIn = smoothstep(0.0, 1.5, spotAge);
      float fadeOut = 1.0 - smoothstep(3.5, 5.0, spotAge);
      float spotFade = fadeIn * fadeOut;
      float spotInfluence = organicSpotInfluence(uv, aspect, uAmbientSpots[i], 0.14, 0.06, float(i) * 17.3, 0.15);

      ambientReveal = max(ambientReveal, spotInfluence * spotFade * 0.3);
    }

    float cursorTrailReveal = 0.0;
    for (int i = 0; i < ${MAX_CURSOR_TRAIL_SPOTS}; i++) {
      if (i >= uCursorTrailCount) break;

      float trailAge = uTime - uCursorTrailTimes[i];
      if (trailAge < 0.0 || trailAge > ${CURSOR_TRAIL_LIFESPAN}) continue;

      float spotFade = cursorTrailFade(trailAge);
      float spotInfluence = organicSpotInfluence(
        uv,
        aspect,
        uCursorTrailSpots[i],
        uCursorTrailRadii[i],
        0.045,
        float(i) * 29.7 + 101.0,
        0.0
      );

      cursorTrailReveal = max(cursorTrailReveal, spotInfluence * spotFade * uCursorTrailStrengths[i]);
    }

    // Reveal the background pattern in either ambient or cursor-driven patches without stacking opacity.
    float textPresence = max(textMask, finalMask);
    float bgReveal = max(ambientReveal, cursorTrailReveal) * (1.0 - textPresence);
    color = mix(color, darkOnCream, bgReveal);

    gl_FragColor = vec4(color, 1.0);
  }
`;

interface AmbientSpot {
  position: THREE.Vector2;
  birthTime: number;
  lifespan: number;
}

interface CursorTrailSpot {
  position: THREE.Vector2;
  birthTime: number;
  strength: number;
  radius: number;
}

interface PointerSample {
  position: THREE.Vector2;
  time: number;
}

const FONT_WEIGHTS: Record<string, number> = {
  'junction': 700,
  'junction-stroked': 700
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
  private ambientSpots: AmbientSpot[] = [];
  private cursorTrailSpots: CursorTrailSpot[] = [];
  private cursorTrailDirty = false;
  private nextSpotTime = 0;
  private fontFamily: string;
  private fontKey: string;
  private resizeTimeout: number | null = null;
  private readonly dpr: number;
  private readonly finePointerQuery: MediaQueryList;
  private hasFinePointer: boolean;
  private lastPointerPosition: THREE.Vector2 | null = null;
  private lastPointerTime: number | null = null;
  private lastCursorTrailEmitPosition: THREE.Vector2 | null = null;
  private recentPointerSamples: PointerSample[] = [];
  private readonly boundResize: () => void;
  private readonly boundMouseMove: (event: MouseEvent) => void;
  private readonly boundPointerTypeChange: (event: MediaQueryListEvent) => void;

  constructor(canvas: HTMLCanvasElement, fontKey: string = 'junction') {
    this.fontKey = fontKey;
    this.fontFamily = 'Junction'; // Only Junction font is used
    this.clock = new THREE.Clock();
    this.mouse = new THREE.Vector2(0.5, 0.5);
    this.targetMouse = new THREE.Vector2(0.5, 0.5);
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.finePointerQuery = window.matchMedia('(pointer: fine)');
    this.hasFinePointer = this.finePointerQuery.matches;
    this.boundResize = this.onResize.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundPointerTypeChange = this.onPointerTypeChange.bind(this);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(width, height);

    this.patternTarget = new THREE.WebGLRenderTarget(width * this.dpr, height * this.dpr);

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
    this.textCanvas.width = width * this.dpr;
    this.textCanvas.height = height * this.dpr;
    this.textTexture = new THREE.CanvasTexture(this.textCanvas);
    this.textTexture.minFilter = THREE.LinearFilter;
    this.textTexture.magFilter = THREE.LinearFilter;
    this.renderTextMask();

    // Composite scene
    this.compositeScene = new THREE.Scene();
    this.compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const ambientSpotPositions: THREE.Vector2[] = [];
    const ambientSpotTimes: number[] = [];
    for (let i = 0; i < MAX_AMBIENT_SPOTS; i++) {
      ambientSpotPositions.push(new THREE.Vector2(-10, -10));
      ambientSpotTimes.push(-100);
    }

    const cursorTrailPositions: THREE.Vector2[] = [];
    const cursorTrailTimes: number[] = [];
    const cursorTrailStrengths: number[] = [];
    const cursorTrailRadii: number[] = [];
    for (let i = 0; i < MAX_CURSOR_TRAIL_SPOTS; i++) {
      cursorTrailPositions.push(new THREE.Vector2(-10, -10));
      cursorTrailTimes.push(-100);
      cursorTrailStrengths.push(0);
      cursorTrailRadii.push(0);
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
        uAmbientSpots: { value: ambientSpotPositions },
        uAmbientSpotTimes: { value: ambientSpotTimes },
        uAmbientSpotCount: { value: 0 },
        uCursorTrailSpots: { value: cursorTrailPositions },
        uCursorTrailTimes: { value: cursorTrailTimes },
        uCursorTrailStrengths: { value: cursorTrailStrengths },
        uCursorTrailRadii: { value: cursorTrailRadii },
        uCursorTrailCount: { value: 0 }
      }
    });
    this.compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial));

    this.setupEventListeners();
  }

  private renderTextMask(): void {
    const ctx = this.textCanvas.getContext('2d')!;
    const width = this.textCanvas.width;
    const height = this.textCanvas.height;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    const fontWeight = FONT_WEIGHTS[this.fontKey] || 700;

    this.renderVerticalLayout(ctx, width, height, fontWeight);

    this.textTexture.needsUpdate = true;
  }

  private renderVerticalLayout(ctx: CanvasRenderingContext2D, width: number, height: number, fontWeight: number): void {
    const hideText = true;

    // For now, name is hidden all the time
    if (hideText) return;

    ctx.textBaseline = 'middle';

    const heightScale = 0.7;
    const cutoffPercent = 0.45;

    // Calculate font size based on height
    const referenceSize = 100 * this.dpr;
    ctx.font = `${fontWeight} ${referenceSize}px "${this.fontFamily}", sans-serif`;

    // Measure text width at reference size (which becomes height when rotated)
    const seanWidth = ctx.measureText('Sean').width;
    const mateerWidth = ctx.measureText('Mateer').width;

    // Scale to fit target percentage of screen height
    const targetHeight = height * heightScale;
    const seanFontSize = (targetHeight / seanWidth) * referenceSize;
    const mateerFontSize = (targetHeight / mateerWidth) * referenceSize;

    // "Sean" on left side, running bottom to top
    ctx.save();
    ctx.font = `${fontWeight} ${seanFontSize}px "${this.fontFamily}", sans-serif`;

    // Position: left edge minus cutoff percentage of the text height
    const seanX = -seanFontSize * cutoffPercent;
    const seanY = height / 2;

    ctx.translate(seanX + seanFontSize * 0.5, seanY);
    ctx.rotate(-Math.PI / 2); // Rotate -90 degrees (text reads bottom to top)
    ctx.textAlign = 'center';

    if (this.fontKey === 'junction-stroked') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = seanFontSize * 0.03;
      ctx.lineJoin = 'round';
      ctx.strokeText('Sean', 0, 0);
    }
    ctx.fillText('Sean', 0, 0);
    ctx.restore();

    // "Mateer" on right side, running top to bottom
    ctx.save();
    ctx.font = `${fontWeight} ${mateerFontSize}px "${this.fontFamily}", sans-serif`;

    // Position: right edge plus cutoff percentage of the text height
    const mateerX = width + mateerFontSize * cutoffPercent;
    const mateerY = height / 2;

    ctx.translate(mateerX - mateerFontSize * 0.5, mateerY);
    ctx.rotate(Math.PI / 2); // Rotate 90 degrees (text reads top to bottom)
    ctx.textAlign = 'center';

    if (this.fontKey === 'junction-stroked') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = mateerFontSize * 0.03;
      ctx.lineJoin = 'round';
      ctx.strokeText('Mateer', 0, 0);
    }
    ctx.fillText('Mateer', 0, 0);
    ctx.restore();
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('mousemove', this.boundMouseMove);
    this.finePointerQuery.addEventListener('change', this.boundPointerTypeChange);
  }

  private onResize(): void {
    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = window.setTimeout(() => {
      this.handleResize();
      this.resizeTimeout = null;
    }, 100);
  }

  private onPointerTypeChange(event: MediaQueryListEvent): void {
    this.hasFinePointer = event.matches;
    this.resetPointerTracking();

    if (!event.matches) {
      this.cursorTrailSpots = [];
      this.cursorTrailDirty = true;
      this.syncCursorTrailUniforms();
      this.cursorTrailDirty = false;
    }
  }

  private handleResize(): void {
    this.reinitialize();
    this.resetPointerTracking();
  }

  private reinitialize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setSize(width, height);

    this.patternTarget.dispose();
    this.patternTarget = new THREE.WebGLRenderTarget(width * this.dpr, height * this.dpr);

    this.textTexture.dispose();
    this.textCanvas.width = width * this.dpr;
    this.textCanvas.height = height * this.dpr;
    this.textTexture = new THREE.CanvasTexture(this.textCanvas);
    this.textTexture.minFilter = THREE.LinearFilter;
    this.textTexture.magFilter = THREE.LinearFilter;
    this.renderTextMask();

    this.patternMaterial.uniforms.uResolution.value.set(width, height);
    this.compositeMaterial.uniforms.uPattern.value = this.patternTarget.texture;
    this.compositeMaterial.uniforms.uTextMask.value = this.textTexture;
    this.compositeMaterial.uniforms.uResolution.value.set(width, height);
  }

  private onMouseMove(event: MouseEvent): void {
    const x = event.clientX / window.innerWidth;
    const y = 1.0 - event.clientY / window.innerHeight;
    this.targetMouse.set(x, y);

    if (!this.hasFinePointer) {
      return;
    }

    const time = this.clock.getElapsedTime();
    const currentPointer = new THREE.Vector2(event.clientX, event.clientY);
    this.recordPointerSample(currentPointer, time);

    if (this.lastPointerPosition === null || this.lastPointerTime === null) {
      this.lastPointerPosition = currentPointer;
      this.lastPointerTime = time;
      this.lastCursorTrailEmitPosition = currentPointer.clone();
      return;
    }

    const deltaDistance = currentPointer.distanceTo(this.lastPointerPosition);
    const deltaTime = Math.max(time - this.lastPointerTime, 1 / 240);
    const speedPxPerSec = deltaDistance / deltaTime;
    const delayedPointer = this.getDelayedTrailPointer(currentPointer, time);
    const lastEmitPosition = this.lastCursorTrailEmitPosition ?? delayedPointer;

    if (
      speedPxPerSec >= CURSOR_TRAIL_MIN_SPEED &&
      delayedPointer.distanceTo(lastEmitPosition) >= CURSOR_TRAIL_MIN_DISTANCE_PX
    ) {
      this.emitCursorTrailSpot(delayedPointer, time, speedPxPerSec);
      this.lastCursorTrailEmitPosition = delayedPointer.clone();
    }

    this.lastPointerPosition = currentPointer;
    this.lastPointerTime = time;
  }

  private recordPointerSample(position: THREE.Vector2, time: number): void {
    this.recentPointerSamples.push({
      position: position.clone(),
      time
    });

    const cutoff = time - CURSOR_TRAIL_SAMPLE_WINDOW_SECONDS;
    while (this.recentPointerSamples.length > 0 && this.recentPointerSamples[0].time < cutoff) {
      this.recentPointerSamples.shift();
    }
  }

  private getLaggedPointerSample(time: number): THREE.Vector2 | null {
    const targetTime = time - CURSOR_TRAIL_LAG_SECONDS;

    for (let i = this.recentPointerSamples.length - 1; i >= 0; i--) {
      if (this.recentPointerSamples[i].time <= targetTime) {
        return this.recentPointerSamples[i].position;
      }
    }

    return this.recentPointerSamples.length > 0
      ? this.recentPointerSamples[0].position
      : null;
  }

  private getDelayedTrailPointer(currentPointer: THREE.Vector2, time: number): THREE.Vector2 {
    const laggedPointer = this.getLaggedPointerSample(time);
    if (laggedPointer === null) {
      return currentPointer;
    }

    const delayVector = laggedPointer.clone().sub(currentPointer);
    const delayDistance = delayVector.length();

    if (delayDistance <= CURSOR_TRAIL_MAX_DELAY_DISTANCE_PX) {
      return laggedPointer.clone();
    }

    return currentPointer.clone().add(
      delayVector.multiplyScalar(CURSOR_TRAIL_MAX_DELAY_DISTANCE_PX / delayDistance)
    );
  }

  private emitCursorTrailSpot(pointerPosition: THREE.Vector2, birthTime: number, speedPxPerSec: number): void {
    const speedT = THREE.MathUtils.clamp(
      (speedPxPerSec - CURSOR_TRAIL_MIN_SPEED) / CURSOR_TRAIL_SPEED_RANGE,
      0,
      1
    );

    this.cursorTrailSpots.push({
      position: new THREE.Vector2(
        pointerPosition.x / window.innerWidth,
        1.0 - pointerPosition.y / window.innerHeight
      ),
      birthTime,
      strength: THREE.MathUtils.lerp(CURSOR_TRAIL_MIN_STRENGTH, CURSOR_TRAIL_MAX_STRENGTH, speedT),
      radius: THREE.MathUtils.lerp(CURSOR_TRAIL_MIN_RADIUS, CURSOR_TRAIL_MAX_RADIUS, speedT)
    });

    if (this.cursorTrailSpots.length > MAX_CURSOR_TRAIL_SPOTS) {
      this.cursorTrailSpots.splice(0, this.cursorTrailSpots.length - MAX_CURSOR_TRAIL_SPOTS);
    }

    this.cursorTrailDirty = true;
  }

  private updateAmbientSpots(time: number): void {
    let spotsChanged = false;

    const prevCount = this.ambientSpots.length;
    if (prevCount > 0 && time - this.ambientSpots[0].birthTime >= SPOT_LIFESPAN) {
      this.ambientSpots = this.ambientSpots.filter(spot => time - spot.birthTime < spot.lifespan);
      spotsChanged = this.ambientSpots.length !== prevCount;
    }

    if (this.ambientSpots.length < MAX_AMBIENT_SPOTS && time >= this.nextSpotTime) {
      let x: number;
      let y: number;
      const region = Math.random();

      if (region < 0.4) {
        x = 0.6 + Math.random() * 0.35;
        y = Math.random();
      } else if (region < 0.7) {
        x = Math.random();
        y = 0.6 + Math.random() * 0.35;
      } else {
        x = 0.5 + Math.random() * 0.45;
        y = Math.random() * 0.4;
      }

      this.ambientSpots.push({
        position: new THREE.Vector2(x, y),
        birthTime: time,
        lifespan: SPOT_LIFESPAN
      });
      spotsChanged = true;

      this.nextSpotTime = time + 2.0 + Math.random() * 2.0;
    }

    if (spotsChanged) {
      this.syncAmbientSpotUniforms();
    }
  }

  private updateCursorTrailSpots(time: number): void {
    let spotsChanged = this.cursorTrailDirty;

    const prevCount = this.cursorTrailSpots.length;
    if (prevCount > 0 && time - this.cursorTrailSpots[0].birthTime >= CURSOR_TRAIL_LIFESPAN) {
      this.cursorTrailSpots = this.cursorTrailSpots.filter(
        spot => time - spot.birthTime < CURSOR_TRAIL_LIFESPAN
      );
      spotsChanged = spotsChanged || this.cursorTrailSpots.length !== prevCount;
    }

    if (spotsChanged) {
      this.syncCursorTrailUniforms();
      this.cursorTrailDirty = false;
    }
  }

  private syncAmbientSpotUniforms(): void {
    const positions = this.compositeMaterial.uniforms.uAmbientSpots.value as THREE.Vector2[];
    const times = this.compositeMaterial.uniforms.uAmbientSpotTimes.value as number[];

    for (let i = 0; i < MAX_AMBIENT_SPOTS; i++) {
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

  private syncCursorTrailUniforms(): void {
    const positions = this.compositeMaterial.uniforms.uCursorTrailSpots.value as THREE.Vector2[];
    const times = this.compositeMaterial.uniforms.uCursorTrailTimes.value as number[];
    const strengths = this.compositeMaterial.uniforms.uCursorTrailStrengths.value as number[];
    const radii = this.compositeMaterial.uniforms.uCursorTrailRadii.value as number[];

    for (let i = 0; i < MAX_CURSOR_TRAIL_SPOTS; i++) {
      if (i < this.cursorTrailSpots.length) {
        positions[i].copy(this.cursorTrailSpots[i].position);
        times[i] = this.cursorTrailSpots[i].birthTime;
        strengths[i] = this.cursorTrailSpots[i].strength;
        radii[i] = this.cursorTrailSpots[i].radius;
      } else {
        positions[i].set(-10, -10);
        times[i] = -100;
        strengths[i] = 0;
        radii[i] = 0;
      }
    }

    this.compositeMaterial.uniforms.uCursorTrailCount.value = this.cursorTrailSpots.length;
  }

  private resetPointerTracking(): void {
    this.lastPointerPosition = null;
    this.lastPointerTime = null;
    this.lastCursorTrailEmitPosition = null;
    this.recentPointerSamples = [];
  }

  start(): void {
    const animate = () => {
      requestAnimationFrame(animate);

      const time = this.clock.getElapsedTime();

      this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.1;
      this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.1;

      this.updateAmbientSpots(time);
      this.updateCursorTrailSpots(time);

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
    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }

    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('mousemove', this.boundMouseMove);
    this.finePointerQuery.removeEventListener('change', this.boundPointerTypeChange);

    this.renderer.dispose();
    this.patternMaterial.dispose();
    this.compositeMaterial.dispose();
    this.patternTarget.dispose();
    this.textTexture.dispose();
  }
}
