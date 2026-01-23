export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Image reveal shader with diagonal line animation
export const imageRevealShader = `
  uniform sampler2D uImage;
  uniform float uProgress;
  uniform float uTime;
  uniform vec2 uResolution;

  varying vec2 vUv;

  #define PI 3.14159265359

  void main() {
    vec2 uv = vUv;

    // Diagonal line pattern
    float angle = PI * 0.25;
    vec2 rotUv = vec2(
      uv.x * cos(angle) - uv.y * sin(angle),
      uv.x * sin(angle) + uv.y * cos(angle)
    );

    // Animated lines that reveal the image
    float lineFreq = 80.0;
    float linePhase = rotUv.x * lineFreq;

    // Progress-based reveal (0 = all lines, 1 = full image)
    float revealThreshold = uProgress * 1.2; // Slightly overshoot for full reveal

    // Create line pattern
    float line = sin(linePhase + uTime * 2.0);
    line = smoothstep(-0.2, 0.2, line);

    // Lines expand as progress increases
    float lineReveal = smoothstep(0.0, revealThreshold, line);

    // Also reveal based on position (diagonal wipe)
    float posReveal = smoothstep(0.0, 1.0, (rotUv.x + rotUv.y + 1.0) * 0.5);
    posReveal = smoothstep(uProgress - 0.3, uProgress + 0.1, posReveal);

    // Combine reveals
    float reveal = max(lineReveal * uProgress, posReveal);
    reveal = clamp(reveal, 0.0, 1.0);

    // Sample image (grayscale)
    vec4 img = texture2D(uImage, uv);
    float gray = dot(img.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bwImage = vec3(gray);

    // Background (cream color)
    vec3 bg = vec3(0.98, 0.97, 0.96);

    // Line color (dark gray)
    vec3 lineColor = vec3(0.23, 0.23, 0.22);

    // During reveal: show lines first, then fade to image
    float imageAppear = smoothstep(0.5, 1.0, uProgress);

    // Mix between line pattern and image
    vec3 pattern = mix(bg, lineColor, line * uProgress * (1.0 - imageAppear * 0.7));
    vec3 color = mix(pattern, bwImage, reveal * imageAppear);

    // Final alpha
    float alpha = uProgress > 0.01 ? 1.0 : 0.0;

    gl_FragColor = vec4(color, alpha);
  }
`;

// Keep the pattern shader for potential future use
export const patternFragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;

  varying vec2 vUv;

  #define PI 3.14159265359

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

    float lines = sin((rotUv.x + t * 0.1) * 40.0);
    lines = smoothstep(0.0, 0.1, abs(lines));

    float wave = sin(rotUv.y * 5.0 + t * 0.5) * 0.02;
    float lines2 = sin((rotUv.x + wave + t * 0.05) * 60.0);
    lines2 = smoothstep(0.0, 0.15, abs(lines2));

    float pattern = min(lines, lines2);

    vec3 dark = vec3(0.23, 0.23, 0.22);
    vec3 light = vec3(0.98, 0.97, 0.96);

    vec3 color = mix(dark, light, pattern);

    gl_FragColor = vec4(color, 1.0);
  }
`;
