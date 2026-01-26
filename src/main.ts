import './style.css';
import { NameEffect } from './name-effect';

function init(): void {
  const nameCanvas = document.getElementById('name-canvas') as HTMLCanvasElement;

  if (!nameCanvas) {
    console.error('Canvas element not found');
    return;
  }

  // Wait for fonts to load
  document.fonts.ready.then(() => {
    const nameEffect = new NameEffect(nameCanvas, 'junction-stroked');
    nameEffect.start();

    // Expose for debugging
    (window as any).nameEffect = nameEffect;
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
