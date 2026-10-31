// Drag-and-drop and paste: images and clips go into the active preset; a .json opens as a setup.
export function acceptFiles(onSetup: (f: File) => void, onMedia: (f: File) => void) {
  const drop = document.getElementById('drop')!;
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files'); // not dragged text or links
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    drop.style.display = 'flex';
  });
  // dragleave also fires each time the drag crosses from one element to another (onto the overlay,
  // say); it has left the window only when there's nothing it went to.
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.style.display = 'none'; });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.style.display = 'none';
    const f = e.dataTransfer?.files[0];
    if (!f) return;
    if (f.type === 'application/json' || f.name.endsWith('.json')) onSetup(f);
    else if (f.type.startsWith('image/') || f.type.startsWith('video/')) onMedia(f);
  });
  window.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (f) onMedia(f);
  });
}
