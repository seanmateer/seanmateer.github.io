import './style.css';
import { NameEffect } from './name-effect';
import { ImageReveal } from './image-reveal';

function init(): void {
  const nameCanvas = document.getElementById('name-canvas') as HTMLCanvasElement;
  const imageCanvas = document.getElementById('image-canvas') as HTMLCanvasElement;
  const imageContainer = document.getElementById('image-reveal') as HTMLElement;

  if (!nameCanvas || !imageCanvas || !imageContainer) {
    console.error('Required elements not found');
    return;
  }

  // Wait for fonts to load
  document.fonts.ready.then(() => {
    // Initialize name effect (WebGL ripple on Sean/Mateer)
    const nameEffect = new NameEffect(nameCanvas, 'junction-stroked');
    nameEffect.start();

    // Initialize image reveal effect
    const imageReveal = new ImageReveal(imageCanvas, imageContainer);

    // Set up hover triggers for bio keywords
    const triggers = document.querySelectorAll('.hover-trigger');

    triggers.forEach((trigger) => {
      const imageKey = (trigger as HTMLElement).dataset.image;

      if (imageKey) {
        trigger.addEventListener('mouseenter', () => {
          imageReveal.show(imageKey);
        });

        trigger.addEventListener('mouseleave', () => {
          imageReveal.hide();
        });
      }
    });

    // Expose for debugging
    (window as any).nameEffect = nameEffect;
    (window as any).imageReveal = imageReveal;
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
