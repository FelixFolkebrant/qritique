export function freezePage(host: HTMLElement): () => void {
  const style = document.createElement('style');
  style.textContent = `html { scroll-behavior: auto !important; } body *, body *::before, body *::after { animation-play-state: paused !important; caret-color: transparent !important; }`;
  document.head.append(style);
  const media = new Map<HTMLMediaElement, boolean>();
  const animations = new Set<Animation>();
  const pause = () => {
    for (const animation of document.getAnimations()) {
      if (animation.playState === 'running') {
        animations.add(animation);
        animation.pause();
      }
    }
    for (const video of document.querySelectorAll('video, audio')) {
      if (video instanceof HTMLMediaElement && !media.has(video)) {
        media.set(video, !video.paused);
        video.pause();
      }
    }
  };
  pause();
  const observer = new MutationObserver((records) => {
    if (records.some((r) => !host.contains(r.target) && r.target !== host)) pause();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    style.remove();
    for (const animation of animations) {
      try {
        animation.play();
      } catch {
        /* The page may have removed an animated node. */
      }
    }
    for (const [video, wasPlaying] of media)
      if (wasPlaying && video.isConnected) void video.play().catch(() => {});
  };
}
