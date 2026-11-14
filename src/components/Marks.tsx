import { brushPath, pathOf } from '../lib/geometry';
import type { Annotation, Group } from '../lib/types';

export function Mark({
  annotation: a,
  group,
  selected = false,
}: {
  annotation: Annotation;
  group: Group;
  selected?: boolean;
}) {
  const { x, y, width, height } = a.bounds;
  const color = group.color;
  const common = {
    stroke: color,
    strokeWidth: 1,
    fill: color,
    fillOpacity: 0.16,
    strokeOpacity: 0.85,
  };
  return (
    <g data-annotation-id={a.id}>
      {a.tool === 'polygon' ? (
        <path d={pathOf(a.points, true)} {...common} />
      ) : a.tool === 'pencil' ? (
        a.points.length === 1 ? (
          <circle
            cx={a.points[0]?.x}
            cy={a.points[0]?.y}
            r={a.size / 2}
            fill={color}
            opacity={0.3}
          />
        ) : (
          <path
            d={pathOf(a.points)}
            fill="none"
            stroke={color}
            strokeOpacity={0.3}
            strokeWidth={a.size}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      ) : a.tool === 'brush' ? (
        <path d={brushPath(a.points, a.size, a.orientation)} fill={color} fillOpacity={0.28} />
      ) : (
        <rect x={x} y={y} width={width} height={height} {...common} />
      )}
      {a.tool === 'move' && a.delta && (
        <>
          <rect
            x={x - a.delta.x}
            y={y - a.delta.y}
            width={width}
            height={height}
            fill="none"
            stroke={color}
            strokeWidth="1"
            strokeDasharray="7 5"
          />
          <path
            d={`M${x - a.delta.x + width / 2},${y - a.delta.y + height / 2} L${x + width / 2},${y + height / 2}`}
            stroke={color}
            strokeWidth="1.5"
            markerEnd={`url(#arrow-${group.id})`}
          />
        </>
      )}
      {group.kind === 'number' && (
        <g transform={`translate(${x + Math.min(18, width / 2)},${y + Math.min(18, height / 2)})`}>
          <circle r="13" fill="#323232" stroke="#ffffff" strokeWidth="1.3" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            fontSize="16"
            fontFamily="Arial, sans-serif"
          >
            {group.label}
          </text>
        </g>
      )}
      {selected && (
        <rect
          x={x - 3}
          y={y - 3}
          width={width + 6}
          height={height + 6}
          fill="none"
          stroke="white"
          strokeOpacity="0.85"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      )}
      {selected &&
        a.tool === 'box' &&
        !a.element &&
        [
          [x, y],
          [x + width / 2, y],
          [x + width, y],
          [x + width, y + height / 2],
          [x + width, y + height],
          [x + width / 2, y + height],
          [x, y + height],
          [x, y + height / 2],
        ].map(([cx, cy]) => (
          <rect
            key={`${cx}-${cy}`}
            x={cx! - 3}
            y={cy! - 3}
            width="6"
            height="6"
            fill="white"
            stroke="#376be8"
            strokeWidth="1"
          />
        ))}
    </g>
  );
}
