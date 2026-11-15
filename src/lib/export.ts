import { brushPath, pathOf } from './geometry';
import type { Annotation, ExportScope, Group, Session } from './types';

export function inScope(group: Group, scope: ExportScope): boolean {
  return scope === 'all' || scope.includes(group.id);
}

export function buildPrompt(
  session: Session,
  scope: ExportScope,
  url: string,
  title: string,
): string {
  const groups = session.groups.filter(
    (group) =>
      inScope(group, scope) &&
      (group.note.trim() || session.annotations.some((a) => a.groupId === group.id)),
  );
  const lines = [
    `Website feedback: ${title}`,
    url,
    '',
    'Please apply the following changes. The highlighted regions in the accompanying image correspond to these notes.',
  ];
  for (const group of groups) {
    const annotations = session.annotations.filter((a) => a.groupId === group.id);
    lines.push(
      '',
      `${group.kind === 'number' ? `#${group.label}` : `${group.label} (${group.color})`}`,
    );
    lines.push(group.note.trim() || '(No note added.)');
    for (const annotation of annotations) {
      if (annotation.element)
        lines.push(
          `Element: ${annotation.element.selector}${annotation.element.text ? ` — “${annotation.element.text}”` : ''}`,
        );
      if (annotation.tool === 'move' && annotation.delta)
        lines.push(
          `Move ${Math.round(annotation.delta.x)}px horizontally and ${Math.round(annotation.delta.y)}px vertically.`,
        );
    }
  }
  return lines.join('\n');
}

export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  group: Group,
) {
  ctx.save();
  ctx.strokeStyle = group.color;
  ctx.fillStyle = group.color;
  ctx.lineWidth = 1.25;
  const { x, y, width, height } = annotation.bounds;
  if (annotation.tool === 'pencil') {
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = annotation.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (annotation.points.length === 1) {
      const p = annotation.points[0]!;
      ctx.beginPath();
      ctx.arc(p.x, p.y, annotation.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.stroke(new Path2D(pathOf(annotation.points)));
  } else if (annotation.tool === 'brush') {
    ctx.globalAlpha = 0.28;
    ctx.fill(new Path2D(brushPath(annotation.points, annotation.size, annotation.orientation)));
  } else if (annotation.tool === 'polygon') {
    const path = new Path2D(pathOf(annotation.points, true));
    ctx.globalAlpha = 0.16;
    ctx.fill(path);
    ctx.globalAlpha = 0.9;
    ctx.stroke(path);
  } else if (annotation.tool === 'move' && annotation.delta) {
    ctx.globalAlpha = 0.14;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(x - annotation.delta.x, y - annotation.delta.y, width, height);
    ctx.setLineDash([]);
    const start = { x: x - annotation.delta.x + width / 2, y: y - annotation.delta.y + height / 2 };
    const end = { x: x + width / 2, y: y + height / 2 };
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(end.x - 10 * Math.cos(angle - 0.5), end.y - 10 * Math.sin(angle - 0.5));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 10 * Math.cos(angle + 0.5), end.y - 10 * Math.sin(angle + 0.5));
    ctx.stroke();
  } else {
    ctx.globalAlpha = 0.16;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(x, y, width, height);
  }
  if (group.kind === 'number') {
    const labelX = x + Math.min(18, width / 2);
    const labelY = y + Math.min(18, height / 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#323232';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(labelX, labelY, 13, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(group.label, labelX, labelY + 0.5);
  }
  ctx.restore();
}

export async function composeImage(
  dataUrl: string,
  annotations: Annotation[],
  groups: Group[],
  viewport: { width: number; height: number; x: number; y: number },
  scope: ExportScope,
): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create the image.');
  ctx.drawImage(image, 0, 0);
  ctx.scale(canvas.width / viewport.width, canvas.height / viewport.height);
  ctx.translate(-viewport.x, -viewport.y);
  for (const annotation of annotations) {
    const group = groups.find((g) => g.id === annotation.groupId);
    if (group && inScope(group, scope)) drawAnnotation(ctx, annotation, group);
  }
  return canvas.toDataURL('image/png');
}
