import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, Trash2, Save, Heart, Sparkles, BrainCircuit, Loader2, 
  CheckSquare, Square, Link2, Share2, User, Magnet, Home, 
  Skull, LayoutTemplate, RotateCcw, X, FolderOpen, Image as ImageIcon,
  Type, MinusCircle, PlusCircle, ArrowRightLeft, CheckCircle,
  Undo, Redo, Tag, Wand2, ZoomIn, ZoomOut, Maximize2, Copy, Check,
  FileText, HelpCircle, Layers
} from 'lucide-react';

// =====================================================================
// 1. 설정 및 유틸리티 (Constants & Utils)
// =====================================================================
const CURRENT_YEAR = new Date().getFullYear();
const GRID_SIZE = 20;
const STORAGE_KEY = 'sw_genogram_v5_autosave'; 

const THEME_CONFIG = {
  colors: {
    primary: '#4f46e5',
    secondary: '#64748b',
    danger: '#e11d48',
    success: '#10b981',
    warning: '#f59e0b',
    background: '#f8fafc',
    nodeFill: '#ffffff',
    selection: '#4f46e5',
    indexNode: '#2563eb',
    envStroke: '#059669',
  },
  sizes: {
    defaultFont: 15,
    familyNode: { w: 40, h: 40, r: 20 },
    envNode: { rx: 52, ry: 30 }
  }
};

const RELATION_CONFIG = {
  GENOGRAM: {
    MARRIAGE: { id: 'marriage', label: '결혼', color: '#475569', style: 'solid', logic: 'horizontal' },
    COHABITATION: { id: 'cohabitation', label: '동거(사실혼)', color: '#475569', style: 'dashed', logic: 'horizontal' }, 
    DIVORCE: { id: 'divorce', label: '이혼', color: '#475569', style: 'solid', marker: 'double-slash', logic: 'horizontal' },
    SEPARATION: { id: 'separation', label: '별거', color: '#475569', style: 'solid', marker: 'single-slash', logic: 'horizontal' }, 
    PARENT_CHILD: { id: 'parent-child', label: '부모-자녀', color: '#475569', style: 'solid', logic: 'orthogonal' },
    SIBLING: { id: 'siblings', label: '형제·자매', color: '#475569', style: 'solid', logic: 'bracket' },
    CONFLICT: { id: 'conflict', label: '갈등·적대', color: THEME_CONFIG.colors.danger, style: 'zigzag', logic: 'direct' },
    CLOSE: { id: 'close', label: '친밀·밀착', color: THEME_CONFIG.colors.success, style: 'double', logic: 'direct' },
    CUTOFF: { id: 'cutoff', label: '단절', color: '#1e293b', style: 'solid', marker: 'bar', logic: 'direct' },
  },
  ECOMAP: {
    NORMAL: { id: 'normal', label: '보통 관계', color: '#64748b', width: 2, style: 'solid', logic: 'direct' },
    STRONG: { id: 'strong', label: '강한/지지 관계', color: '#2563eb', width: 4, style: 'solid', logic: 'direct' },
    STRESS: { id: 'stress', label: '스트레스/갈등', color: THEME_CONFIG.colors.danger, width: 2, style: 'zigzag', logic: 'direct' },
    WEAK: { id: 'weak', label: '소원/약한 관계', color: '#94a3b8', width: 2, style: 'dashed', logic: 'direct' },
  }
};

const ALL_RELATION_MAP = [...Object.values(RELATION_CONFIG.GENOGRAM), ...Object.values(RELATION_CONFIG.ECOMAP)].reduce((acc, cur) => {
  acc[cur.id] = cur;
  return acc;
}, {});

const COUPLE_EDGE_TYPES = ['marriage', 'cohabitation', 'divorce', 'separation'];

const getNodeDimensions = (node) => {
  if (!node) return { rx: 20, ry: 20 };
  if (node.type === 'family') {
    const scale = node.isIndex ? 1.3 : 1;
    return { rx: THEME_CONFIG.sizes.familyNode.r * scale, ry: THEME_CONFIG.sizes.familyNode.r * scale };
  }
  const textLen = node.name ? node.name.length : 0;
  return { rx: Math.max(THEME_CONFIG.sizes.envNode.rx, textLen * 10 + 16), ry: THEME_CONFIG.sizes.envNode.ry };
};

const getBoundaryPoint = (node, targetX, targetY, gap = 0) => {
  if (!node) return { x: targetX, y: targetY };
  const dx = targetX - node.x, dy = targetY - node.y;
  if (dx === 0 && dy === 0) return { x: node.x, y: node.y };
  const angle = Math.atan2(dy, dx);
  const { rx, ry } = getNodeDimensions(node);
  const dist = (rx * ry) / Math.sqrt(Math.pow(ry * Math.cos(angle), 2) + Math.pow(rx * Math.sin(angle), 2));
  return { x: node.x + Math.cos(angle) * (dist + gap), y: node.y + Math.sin(angle) * (dist + gap) };
};

const getManhattanPath = (x1, y1, x2, y2, type = 'default') => {
  const midY = (y1 + y2) / 2;
  if (type === 'parent-child') {
    return (y2 < y1)
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
  }
  if (type === 'bracket') {
    const topY = Math.min(y1, y2) - 44;
    return `M ${x1} ${y1} L ${x1} ${topY} L ${x2} ${topY} L ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`;
};

const getZigzagPath = (x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 24) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const steps = Math.max(2, Math.floor(len / 10));
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const offset = i % 2 === 0 ? 5.5 : -5.5;
    d += ` L ${(x1 + dx * t) + (-dy / len * offset)} ${(y1 + dy * t) + (dx / len * offset)}`;
  }
  return d + ` L ${x2} ${y2}`;
};

// 친밀(double) 관계선을 위한 평행 이중 경로 생성
const getDoubleLinePaths = (x1, y1, x2, y2, gap = 3) => {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / len) * gap;
  const ny = (dx / len) * gap;
  return [
    `M ${x1 + nx} ${y1 + ny} L ${x2 + nx} ${y2 + ny}`,
    `M ${x1 - nx} ${y1 - ny} L ${x2 - nx} ${y2 - ny}`
  ];
};

// 동거 가구(isCohabiting) 클러스터링: 인접한 동거 가족끼리 묶어 비동거인이 포함되지 않도록 분리
const computeCohabitingClusters = (nodes) => {
  const cohabNodes = nodes.filter(n => n.isCohabiting && n.type === 'family');
  if (cohabNodes.length === 0) return [];

  // 가구 그룹(cohabGroup)이 지정되어 있으면 그룹별로 묶고, 없으면 거리 기반(320px 이내) 클러스터링
  const visited = new Set();
  const clusters = [];

  for (const node of cohabNodes) {
    if (visited.has(node.id)) continue;
    const cluster = [];
    const queue = [node];
    visited.add(node.id);

    while (queue.length > 0) {
      const curr = queue.shift();
      cluster.push(curr);
      for (const other of cohabNodes) {
        if (visited.has(other.id)) continue;
        const sameGroup = (curr.cohabGroup || '1가구') === (other.cohabGroup || '1가구');
        const dist = Math.hypot(curr.x - other.x, curr.y - other.y);
        if (sameGroup && dist < 380) {
          visited.add(other.id);
          queue.push(other);
        }
      }
    }
    clusters.push(cluster);
  }

  return clusters.map((cluster, idx) => {
    const pad = 42;
    const minX = Math.min(...cluster.map(n => n.x)) - pad;
    const maxX = Math.max(...cluster.map(n => n.x)) + pad;
    const minY = Math.min(...cluster.map(n => n.y)) - pad;
    const maxY = Math.max(...cluster.map(n => n.y)) + pad + 26;
    const groupLabel = cluster[0]?.cohabGroup || (clusters.length > 1 ? `동거 ${idx + 1}가구` : '동거 가구');
    return {
      id: `cluster_${idx}`,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      label: groupLabel
    };
  });
};

const snapToGrid = (val) => Math.round(val / GRID_SIZE) * GRID_SIZE;

const CircleIcon = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const TriangleIcon = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="12 3 22 21 2 21" />
  </svg>
);


// =====================================================================
// 2. 캔버스 요소 컴포넌트 (Node & Edge)
// =====================================================================
const NodeComponent = React.memo(({ node, isSelected, onMouseDown, onContextMenu }) => {
  const isMale = node.gender === 'male';
  const isFemale = node.gender === 'female';
  const isPregnancy = node.gender === 'pregnancy';
  const isFamily = node.type === 'family';

  const strokeColor = isSelected
    ? THEME_CONFIG.colors.selection
    : (node.isIndex ? THEME_CONFIG.colors.indexNode : (isFamily ? '#1e293b' : THEME_CONFIG.colors.envStroke));
  const strokeWidth = isSelected ? 3 : (node.isIndex ? 2.8 : 2);
  const fillColor = isFamily ? THEME_CONFIG.colors.nodeFill : '#ecfdf5';
  const fontSize = node.fontSize || THEME_CONFIG.sizes.defaultFont;
  const nameYOffset = isFamily ? 34 + (fontSize - 12) : 5;
  const { rx, ry } = getNodeDimensions(node);

  const ageText = isFamily && node.birthYear !== null && node.birthYear !== undefined
    ? `${CURRENT_YEAR - node.birthYear}세`
    : null;

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onPointerDown={(e) => onMouseDown(e, node.id)}
      onContextMenu={(e) => onContextMenu(e, node.id)}
      className="cursor-move hover:opacity-95 transition-opacity"
    >
      {isSelected && (
        <ellipse
          rx={isFamily ? 32 : rx + 10}
          ry={isFamily ? 32 : ry + 10}
          fill="none"
          stroke={THEME_CONFIG.colors.primary}
          strokeWidth="2"
          strokeDasharray="4,4"
          className="animate-spin-slow opacity-60"
        />
      )}

      {/* 도형 렌더링 */}
      {isFamily ? (
        isMale ? (
          <rect x={-20} y={-20} width={40} height={40} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} rx={2} />
        ) : isFemale ? (
          <circle r={20} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        ) : isPregnancy ? (
          <polygon points="0,-22 21,18 -21,18" fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} strokeLinejoin="round" />
        ) : (
          <rect x={-18} y={-18} width={36} height={36} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} strokeDasharray="4,2" />
        )
      ) : (
        <ellipse rx={rx} ry={ry} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
      )}

      {/* 클라이언트(Index Person) 이중 테두리 표시 */}
      {node.isIndex && isFamily && (
        isMale ? (
          <rect x={-26} y={-26} width={52} height={52} fill="none" stroke={strokeColor} strokeWidth="1.8" rx={3} />
        ) : (
          <circle r={26} fill="none" stroke={strokeColor} strokeWidth="1.8" />
        )
      )}

      {/* 사망(X) 표시 */}
      {node.isDeceased && (
        <g stroke={strokeColor} strokeWidth="2.5">
          <line x1={-17} y1={-17} x2={17} y2={17} />
          <line x1={17} y1={-17} x2={-17} y2={17} />
        </g>
      )}

      {/* 이름 및 나이 표시 */}
      <text
        y={nameYOffset}
        textAnchor="middle"
        style={{ fontSize: `${fontSize}px` }}
        className={`font-bold select-none pointer-events-none ${node.isIndex ? 'fill-blue-600' : 'fill-slate-800'}`}
      >
        {node.name}
      </text>

      {ageText && (
        <text
          y={nameYOffset + fontSize * 0.95}
          textAnchor="middle"
          style={{ fontSize: `${Math.max(10, Math.round(fontSize * 0.78))}px` }}
          className="fill-slate-500 font-medium select-none pointer-events-none"
        >
          {ageText}
        </text>
      )}

      {/* 실무 메모(특이사항/질환 등) 표시 */}
      {node.note && (
        <text
          y={isFamily ? nameYOffset + (ageText ? fontSize * 1.85 : fontSize * 0.95) : ry + 18}
          textAnchor="middle"
          style={{ fontSize: `${Math.max(10, Math.round(fontSize * 0.72))}px` }}
          className="fill-indigo-600 font-medium select-none pointer-events-none"
        >
          [{node.note}]
        </text>
      )}
    </g>
  );
});

const EdgeComponent = React.memo(({ edge, sourceNode, targetNode, nodeMap, edges, sharedEdgesMap, isSelected, onClick, showLabels }) => {
  if (!sourceNode || !targetNode) return null;
  const config = ALL_RELATION_MAP[edge.type];
  if (!config) return null;

  const pairKey = [sourceNode.id, targetNode.id].sort().join('__');
  const sharedEdges = sharedEdgesMap.get(pairKey) || [edge];
  const edgeIndex = sharedEdges.findIndex(e => e.id === edge.id);
  const totalShared = sharedEdges.length;

  let rawSX = sourceNode.x, rawSY = sourceNode.y, rawTX = targetNode.x, rawTY = targetNode.y;

  if (config.logic === 'horizontal') {
    const isSourceLeft = sourceNode.x <= targetNode.x;
    const leftNode = isSourceLeft ? sourceNode : targetNode;
    const rightNode = isSourceLeft ? targetNode : sourceNode;
    rawSX = leftNode.x + getNodeDimensions(leftNode).rx;
    rawSY = leftNode.y;
    rawTX = rightNode.x - getNodeDimensions(rightNode).rx;
    rawTY = rightNode.y;
  } else if (config.logic === 'orthogonal' && edge.type === 'parent-child') {
    // 부모 노드가 부부 관계(결혼/동거/이혼/별거)에 속해 있으면 부부 중간 지점에서 수직으로 분기 (표준 가계도 T자형 연결)
    const coupleEdge = edges.find(
      e => COUPLE_EDGE_TYPES.includes(e.type) && (e.source === sourceNode.id || e.target === sourceNode.id)
    );
    if (coupleEdge) {
      const spouseId = coupleEdge.source === sourceNode.id ? coupleEdge.target : coupleEdge.source;
      const spouseNode = nodeMap.get(spouseId);
      if (spouseNode) {
        rawSX = (sourceNode.x + spouseNode.x) / 2;
        rawSY = (sourceNode.y + spouseNode.y) / 2;
      }
    } else {
      rawSY += getNodeDimensions(sourceNode).ry;
    }
    rawTY -= getNodeDimensions(targetNode).ry;
  } else if (config.logic === 'bracket') {
    rawSY -= getNodeDimensions(sourceNode).ry;
    rawTY -= getNodeDimensions(targetNode).ry;
  } else {
    const startPt = getBoundaryPoint(sourceNode, targetNode.x, targetNode.y, 6);
    const endPt = getBoundaryPoint(targetNode, sourceNode.x, sourceNode.y, 6);
    rawSX = startPt.x;
    rawSY = startPt.y;
    rawTX = endPt.x;
    rawTY = endPt.y;
  }

  let sX = rawSX, sY = rawSY, tX = rawTX, tY = rawTY;
  if (totalShared > 1) {
    const offsetMag = (edgeIndex - (totalShared - 1) / 2) * 20;
    if (!config.logic || config.logic === 'horizontal' || config.logic === 'direct') {
      const dx = rawTX - rawSX, dy = rawTY - rawSY;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      sX += (-dy / len) * offsetMag;
      sY += (dx / len) * offsetMag;
      tX += (-dy / len) * offsetMag;
      tY += (dx / len) * offsetMag;
    } else if (config.logic === 'orthogonal') {
      sX += offsetMag;
      tX += offsetMag;
    } else if (config.logic === 'bracket') {
      sY += offsetMag;
      tY += offsetMag;
    }
  }

  let pathData = '';
  let doublePaths = null;
  let midX = (sX + tX) / 2;
  let midY = (sY + tY) / 2;

  if (config.logic === 'horizontal') {
    pathData = `M ${sX} ${sY} L ${tX} ${tY}`;
    midY = (sY + tY) / 2 - 14;
  } else if (config.logic === 'orthogonal') {
    pathData = getManhattanPath(sX, sY, tX, tY, 'parent-child');
    midX = tX + 18;
    midY = (sY + tY) / 2;
  } else if (config.logic === 'bracket') {
    pathData = getManhattanPath(sX, sY, tX, tY, 'bracket');
    midY = Math.min(sY, tY) - 44 - 12;
  } else {
    if (config.style === 'zigzag') {
      pathData = getZigzagPath(sX, sY, tX, tY);
    } else if (config.style === 'double') {
      pathData = `M ${sX} ${sY} L ${tX} ${tY}`;
      doublePaths = getDoubleLinePaths(sX, sY, tX, tY, 3);
    } else {
      pathData = `M ${sX} ${sY} L ${tX} ${tY}`;
    }
    midY = (sY + tY) / 2 - 14;
  }

  const strokeColor = isSelected ? THEME_CONFIG.colors.primary : config.color;
  const strokeWidth = isSelected ? 3.5 : (config.width || 2);
  const displayLabel = edge.note ? `${config.label} (${edge.note})` : config.label;

  return (
    <g onClick={(e) => { e.stopPropagation(); onClick(edge.id); }} className="cursor-pointer group">
      {/* 클릭 영역 확보용 투명 경로 */}
      <path d={pathData} stroke="transparent" strokeWidth="16" fill="none" />

      {/* 친밀(double) 스타일이면 평행 이중선 렌더링, 아니면 단일선 렌더링 */}
      {doublePaths ? (
        <>
          <path d={doublePaths[0]} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 2} fill="none" />
          <path d={doublePaths[1]} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 2} fill="none" />
        </>
      ) : (
        <path
          d={pathData}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={config.style === 'dashed' ? '6,4' : 'none'}
          fill="none"
          markerEnd={(edge.direction === 'single' || edge.direction === 'both') ? `url(#arrow-${edge.type})` : undefined}
          markerStart={edge.direction === 'both' ? `url(#arrow-start-${edge.type})` : undefined}
          className="transition-colors duration-150"
        />
      )}

      {/* 이혼(//), 별거(/), 단절(|) 마커 */}
      {config.marker === 'double-slash' && (
        <g transform={`translate(${(sX + tX) / 2}, ${(sY + tY) / 2})`}>
          <line x1="-2" y1="-9" x2="-8" y2="9" stroke={strokeColor} strokeWidth="2.2" />
          <line x1="8" y1="-9" x2="2" y2="9" stroke={strokeColor} strokeWidth="2.2" />
        </g>
      )}
      {config.marker === 'single-slash' && (
        <g transform={`translate(${(sX + tX) / 2}, ${(sY + tY) / 2})`}>
          <line x1="5" y1="-9" x2="-5" y2="9" stroke={strokeColor} strokeWidth="2.2" />
        </g>
      )}
      {config.marker === 'bar' && (
        <g transform={`translate(${(sX + tX) / 2}, ${(sY + tY) / 2})`}>
          <line x1="-6" y1="-8" x2="-6" y2="8" stroke={strokeColor} strokeWidth="2.5" />
          <line x1="6" y1="-8" x2="6" y2="8" stroke={strokeColor} strokeWidth="2.5" />
        </g>
      )}

      {/* 라벨 표시 */}
      {showLabels && (
        <g transform={`translate(${midX}, ${midY})`}>
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11.5"
            fill={strokeColor}
            stroke="white"
            strokeWidth="4"
            strokeLinejoin="round"
            className="font-bold pointer-events-none select-none opacity-95"
          >
            {displayLabel}
          </text>
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11.5"
            fill={strokeColor}
            className="font-bold pointer-events-none select-none"
          >
            {displayLabel}
          </text>
        </g>
      )}
    </g>
  );
});


// =====================================================================
// 3. UI 레이아웃 컴포넌트 (Sidebar, Header, Panels)
// =====================================================================
const Sidebar = ({
  mode, setMode, addNode, startLinking, snapEnabled, setSnapEnabled,
  applyAutoLayout, showLabels, setShowLabels, setIsResetModalOpen, interaction
}) => (
  <aside className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-5 gap-3 z-20 shadow-sm select-none">
    <div className="p-2.5 bg-indigo-600 rounded-xl text-white mb-2 shadow-md shadow-indigo-200" title="스마트 가계도·생태도 v5.0">
      <BrainCircuit size={22} />
    </div>

    {/* 모드 선택 탭 */}
    <div className="flex flex-col gap-1.5 w-full px-2">
      <button
        onClick={() => setMode('genogram')}
        className={`p-2.5 rounded-xl flex flex-col items-center gap-1 transition-all ${mode === 'genogram' ? 'bg-indigo-50 text-indigo-600 font-bold ring-1 ring-indigo-200' : 'text-slate-400 hover:bg-slate-50'}`}
      >
        <Users size={18} />
        <span className="text-[10px]">가계도</span>
      </button>
      <button
        onClick={() => setMode('ecomap')}
        className={`p-2.5 rounded-xl flex flex-col items-center gap-1 transition-all ${mode === 'ecomap' ? 'bg-emerald-50 text-emerald-600 font-bold ring-1 ring-emerald-200' : 'text-slate-400 hover:bg-slate-50'}`}
      >
        <Share2 size={18} />
        <span className="text-[10px]">생태도</span>
      </button>
      <button
        onClick={() => setMode('integrated')}
        className={`p-2.5 rounded-xl flex flex-col items-center gap-1 transition-all ${mode === 'integrated' ? 'bg-violet-50 text-violet-600 font-bold ring-1 ring-violet-200' : 'text-slate-400 hover:bg-slate-50'}`}
        title="가계도와 생태도 도구를 한 화면에서 모두 사용합니다"
      >
        <Layers size={18} />
        <span className="text-[10px]">통합모드</span>
      </button>
    </div>

    <div className="w-10 h-px bg-slate-200 my-1" />

    {/* 도형 추가 버튼 */}
    {(mode === 'genogram' || mode === 'integrated') && (
      <div className="flex flex-col gap-2 items-center">
        <button onClick={() => addNode('family', 'male')} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-indigo-400 transition-all" title="남성 추가">
          <Square size={18} className="text-slate-700" />
        </button>
        <button onClick={() => addNode('family', 'female')} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-indigo-400 transition-all" title="여성 추가">
          <CircleIcon size={18} className="text-slate-700" />
        </button>
        <button onClick={() => addNode('family', 'pregnancy')} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-indigo-400 transition-all" title="태아/임신 추가">
          <TriangleIcon size={18} className="text-slate-700" />
        </button>
      </div>
    )}

    {(mode === 'ecomap' || mode === 'integrated') && (
      <button onClick={() => addNode('env')} className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-xl hover:bg-emerald-100 hover:border-emerald-400 transition-all" title="외부 체계/기관 추가">
        <LayoutTemplate size={18} className="text-emerald-700" />
      </button>
    )}

    <button
      onClick={startLinking}
      className={`p-2.5 border rounded-xl transition-all relative ${interaction.state === 'linking' ? 'bg-indigo-600 text-white border-indigo-600 animate-pulse' : 'bg-white border-slate-200 hover:border-indigo-400 text-slate-700'}`}
      title="관계선 연결 (노드 선택 후 클릭)"
    >
      <Link2 size={18} />
    </button>

    <div className="flex-1" />

    {/* 유틸리티 도구 */}
    <button
      onClick={() => setSnapEnabled(!snapEnabled)}
      className={`p-2.5 rounded-xl transition-all ${snapEnabled ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}
      title={`그리드 스냅 (${snapEnabled ? '켜짐' : '꺼짐'})`}
    >
      <Magnet size={18} />
    </button>
    <button
      onClick={applyAutoLayout}
      className="p-2.5 rounded-xl transition-all bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:scale-95 shadow-sm"
      title="겹침 자동 해결 및 세대 줄맞춤"
    >
      <Wand2 size={18} />
    </button>
    <button
      onClick={() => setShowLabels(!showLabels)}
      className={`p-2.5 rounded-xl transition-all ${showLabels ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}
      title={`관계선 텍스트 라벨 (${showLabels ? '표시 중' : '숨김'})`}
    >
      <Tag size={18} />
    </button>
    <button
      onClick={() => setIsResetModalOpen(true)}
      className="p-2.5 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-all"
      title="전체 초기화"
    >
      <RotateCcw size={18} />
    </button>
  </aside>
);

const Header = ({
  mode, projectTitle, setProjectTitle, historyIdx, historyLength,
  handleUndo, handleRedo, generateAIAnalysis, fileInputRef,
  handleLoadProject, saveProject, downloadImage, loadSampleTemplate, setShowHelpModal
}) => (
  <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 z-10 select-none">
    <div className="flex items-center gap-3">
      <input
        value={projectTitle}
        onChange={(e) => setProjectTitle(e.target.value)}
        className="font-bold text-slate-800 text-base bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none px-1 py-0.5 transition-colors"
        placeholder="사례 대상자명 / 프로젝트 제목"
      />
      <span className="text-xs font-semibold text-indigo-600 px-2.5 py-0.5 bg-indigo-50 rounded-full border border-indigo-100">
        Pro v5.0
      </span>
      <span className="text-xs text-slate-400 hidden sm:inline">
        {mode === 'genogram' ? '가계도 모드' : mode === 'ecomap' ? '생태도 모드' : '가계·생태도 통합 모드'}
      </span>
    </div>

    <div className="flex items-center gap-2">
      <button
        onClick={loadSampleTemplate}
        className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        title="사례관리 샘플 가계·생태도 불러오기"
      >
        <FileText size={14} /> 샘플 예시
      </button>

      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
        <button
          onClick={handleUndo}
          disabled={historyIdx <= 0}
          className={`p-1.5 rounded-md transition-colors ${historyIdx <= 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
          title="실행 취소 (Ctrl+Z)"
        >
          <Undo size={16} />
        </button>
        <button
          onClick={handleRedo}
          disabled={historyIdx >= historyLength - 1}
          className={`p-1.5 rounded-md transition-colors ${historyIdx >= historyLength - 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
          title="다시 실행 (Ctrl+Y)"
        >
          <Redo size={16} />
        </button>
      </div>

      <div className="h-4 w-px bg-slate-200 mx-1" />

      <button
        onClick={generateAIAnalysis}
        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs font-bold shadow-sm"
      >
        <Sparkles size={14} /> AI 사정 리포트
      </button>

      <div className="h-4 w-px bg-slate-200 mx-1" />

      <button
        onClick={() => fileInputRef.current.click()}
        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-indigo-600 transition-colors"
        title="프로젝트 JSON 불러오기"
      >
        <FolderOpen size={18} />
      </button>
      <input type="file" ref={fileInputRef} onChange={handleLoadProject} className="hidden" accept=".json" />

      <button
        onClick={saveProject}
        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-indigo-600 transition-colors"
        title="프로젝트 JSON 저장"
      >
        <Save size={18} />
      </button>

      <button
        onClick={downloadImage}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors text-xs font-bold"
        title="고해상도 PNG 이미지 다운로드"
      >
        <ImageIcon size={15} /> 이미지 저장
      </button>

      <button
        onClick={() => setShowHelpModal(true)}
        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
        title="사용 가이드 및 단축키"
      >
        <HelpCircle size={18} />
      </button>
    </div>
  </header>
);

const PropertyPanel = ({ selection, setSelection, nodes, setNodes, edges, setEdges, saveToHistory, deleteSelection, mode }) => {
  const node = selection.type === 'node' ? nodes.find(n => n.id === selection.id) : null;
  const edge = selection.type === 'edge' ? edges.find(e => e.id === selection.id) : null;
  if (!node && !edge) return null;

  // 비동기 상태 참조 버그 해결: nextNodes / nextEdges를 즉시 계산하여 setState와 saveToHistory에 동시 반영
  const updateFontSize = (delta) => {
    const nextNodes = nodes.map(n =>
      n.id === selection.id
        ? { ...n, fontSize: Math.max(10, Math.min(36, (n.fontSize || THEME_CONFIG.sizes.defaultFont) + delta)) }
        : n
    );
    setNodes(nextNodes);
    saveToHistory(nextNodes, edges);
  };

  const swapEdgeDirection = () => {
    const nextEdges = edges.map(e =>
      e.id === selection.id ? { ...e, source: e.target, target: e.source } : e
    );
    setEdges(nextEdges);
    saveToHistory(nodes, nextEdges);
  };

  // 통합 모드에서는 가계도/생태도 관계 유형을 모두 선택 가능하도록 제공
  const relationOptions = mode === 'genogram'
    ? Object.values(RELATION_CONFIG.GENOGRAM)
    : mode === 'ecomap'
      ? Object.values(RELATION_CONFIG.ECOMAP)
      : [...Object.values(RELATION_CONFIG.GENOGRAM), ...Object.values(RELATION_CONFIG.ECOMAP)];

  return (
    <aside className="w-80 bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col animate-slide-in-right">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
          {node ? <User size={17} className="text-indigo-600" /> : <Link2 size={17} className="text-indigo-600" />}
          {node ? '대상자 / 체계 속성 편집' : '관계선 상세 설정'}
        </h2>
        <button onClick={() => setSelection({ type: null, id: null })}>
          <X size={16} className="text-slate-400 hover:text-slate-600" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-5">
        {node ? (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">이름 / 기관·체계명</label>
              <input
                value={node.name}
                onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, name: e.target.value } : n))}
                onBlur={() => saveToHistory(nodes, edges)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 outline-none"
              />
            </div>

            {node.type === 'family' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">성별 / 유형</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'male', label: '남성' },
                      { id: 'female', label: '여성' },
                      { id: 'pregnancy', label: '태아' }
                    ].map(g => (
                      <button
                        key={g.id}
                        onClick={() => {
                          const next = nodes.map(n => n.id === node.id ? { ...n, gender: g.id } : n);
                          setNodes(next);
                          saveToHistory(next, edges);
                        }}
                        className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${node.gender === g.id ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">출생년도 (연령 자동 계산)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="예: 1960"
                      value={node.birthYear ?? ''}
                      onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, birthYear: e.target.value ? parseInt(e.target.value, 10) : null } : n))}
                      onBlur={() => saveToHistory(nodes, edges)}
                      className="flex-1 p-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 outline-none"
                    />
                    <div className="flex items-center justify-center bg-slate-100 rounded-lg px-3 text-xs text-slate-600 font-bold min-w-[60px]">
                      {(node.birthYear !== null && node.birthYear !== undefined) ? `${CURRENT_YEAR - node.birthYear}세` : '-'}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 실무 메모 필드 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">실무 메모 (질환·역할·특이사항)</label>
              <input
                value={node.note || ''}
                placeholder="예: 고혈압, 주돌봄자, 2022년 사망"
                onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, note: e.target.value } : n))}
                onBlur={() => saveToHistory(nodes, edges)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 flex items-center justify-between">
                <span>텍스트 크기</span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">{node.fontSize || THEME_CONFIG.sizes.defaultFont}px</span>
              </label>
              <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                <button onClick={() => updateFontSize(-1)} className="p-1.5 hover:bg-white rounded-md text-slate-600 transition-all shadow-sm">
                  <MinusCircle size={15} />
                </button>
                <div className="flex-1 text-center text-xs font-bold text-slate-500">
                  <Type size={13} className="inline mx-1" /> 글자 크기 조절
                </div>
                <button onClick={() => updateFontSize(1)} className="p-1.5 hover:bg-white rounded-md text-indigo-600 transition-all shadow-sm">
                  <PlusCircle size={15} />
                </button>
              </div>
            </div>

            {node.type === 'family' && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="text-xs font-bold text-slate-500 block mb-1">상태 설정</label>
                {/* 클라이언트(Index Person) 단일 지정 보장 */}
                <button
                  onClick={() => {
                    const targetState = !node.isIndex;
                    const next = nodes.map(n => ({
                      ...n,
                      isIndex: n.id === node.id ? targetState : false
                    }));
                    setNodes(next);
                    saveToHistory(next, edges);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${node.isIndex ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                >
                  <CheckSquare size={16} />
                  <span className="text-xs">주요 클라이언트 (Index Person)</span>
                </button>

                <button
                  onClick={() => {
                    const next = nodes.map(n => n.id === node.id ? { ...n, isDeceased: !n.isDeceased } : n);
                    setNodes(next);
                    saveToHistory(next, edges);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${node.isDeceased ? 'border-slate-600 bg-slate-100 text-slate-800 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                >
                  <Skull size={16} />
                  <span className="text-xs">사망 여부 (X 표시)</span>
                </button>

                <button
                  onClick={() => {
                    const next = nodes.map(n => n.id === node.id ? { ...n, isCohabiting: !n.isCohabiting, cohabGroup: n.cohabGroup || '동거 가구' } : n);
                    setNodes(next);
                    saveToHistory(next, edges);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${node.isCohabiting ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                >
                  <Home size={16} />
                  <span className="text-xs">동거 가구 포함</span>
                </button>

                {node.isCohabiting && (
                  <div className="pl-2 pt-1">
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">가구 구분명 (다중 가구 분리용)</label>
                    <input
                      value={node.cohabGroup || '동거 가구'}
                      onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, cohabGroup: e.target.value } : n))}
                      onBlur={() => saveToHistory(nodes, edges)}
                      placeholder="예: 동거 가구, 원가족 가구"
                      className="w-full p-1.5 border border-indigo-200 rounded-md text-xs focus:border-indigo-500 outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">관계 보충 메모 (선택)</label>
              <input
                value={edge.note || ''}
                placeholder="예: 주 1회 통화, 2019년 이혼"
                onChange={(e) => setEdges(prev => prev.map(ed => ed.id === edge.id ? { ...ed, note: e.target.value } : ed))}
                onBlur={() => saveToHistory(nodes, edges)}
                className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:border-indigo-500 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 block">관계 유형 선택</label>
              <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto pr-1">
                {relationOptions.map(conf => (
                  <button
                    key={conf.id}
                    onClick={() => {
                      const next = edges.map(e => {
                        if (e.id === edge.id) {
                          let ns = e.source, nt = e.target;
                          if (conf.id === 'parent-child') {
                            const sn = nodes.find(n => n.id === e.source);
                            const tn = nodes.find(n => n.id === e.target);
                            if (sn && tn && sn.y > tn.y) { ns = e.target; nt = e.source; }
                          }
                          return { ...e, type: conf.id, source: ns, target: nt };
                        }
                        return e;
                      });
                      setEdges(next);
                      saveToHistory(nodes, next);
                    }}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${edge.type === conf.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: conf.color }} />
                    <div className="text-xs font-bold text-slate-700">{conf.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label className="text-xs font-bold text-slate-500 block">에너지 / 자원 흐름 방향 (화살표)</label>
              <div className="flex gap-1.5">
                {[
                  { id: 'none', label: '없음' },
                  { id: 'single', label: '단방향 (→)' },
                  { id: 'both', label: '양방향 (↔)' }
                ].map(dir => (
                  <button
                    key={dir.id}
                    onClick={() => {
                      const next = edges.map(e => e.id === edge.id ? { ...e, direction: dir.id } : e);
                      setEdges(next);
                      saveToHistory(nodes, next);
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${edge.direction === dir.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {dir.label}
                  </button>
                ))}
              </div>

              {edge.direction === 'single' && (
                <button
                  onClick={swapEdgeDirection}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-xs border border-slate-200 mt-1"
                >
                  <ArrowRightLeft size={14} /> 화살표 방향 반전
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
        <button
          onClick={() => setSelection({ type: null, id: null })}
          className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 text-xs shadow-sm"
        >
          <CheckCircle size={15} /> 편집 완료
        </button>
        <button
          onClick={deleteSelection}
          className="w-full py-2.5 bg-white border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 hover:border-rose-300 transition-all flex items-center justify-center gap-2 text-xs"
        >
          <Trash2 size={15} /> 삭제하기
        </button>
      </div>
    </aside>
  );
};

const AIPanel = ({ setShowAiPanel, isLoading, aiResult, aiPromptText }) => {
  const [copiedType, setCopiedType] = useState(null);

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-30 border-l border-slate-200 flex flex-col animate-slide-in-right">
      <div className="p-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex justify-between items-center">
        <h2 className="font-bold flex items-center gap-2 text-sm">
          <Sparkles size={17} /> 사례관리 가계·생태도 사정 리포트
        </h2>
        <button onClick={() => setShowAiPanel(false)}>
          <X size={18} className="opacity-80 hover:opacity-100" />
        </button>
      </div>

      <div className="flex-1 p-5 overflow-y-auto space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <Loader2 size={30} className="animate-spin text-indigo-500" />
            <span className="text-xs font-medium">도식 데이터를 기반으로 사정 리포트를 생성하고 있습니다...</span>
          </div>
        ) : (
          <>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 whitespace-pre-wrap text-slate-700 leading-relaxed text-xs font-sans">
              {aiResult}
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => handleCopy(aiResult, 'report')}
                className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 text-xs shadow-sm"
              >
                {copiedType === 'report' ? <Check size={15} /> : <Copy size={15} />}
                {copiedType === 'report' ? '사정 리포트 복사 완료!' : '사정 리포트 초안 복사하기'}
              </button>
              <button
                onClick={() => handleCopy(aiPromptText, 'prompt')}
                className="w-full py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2 text-xs border border-slate-200"
              >
                {copiedType === 'prompt' ? <Check size={15} /> : <Sparkles size={15} className="text-indigo-600" />}
                {copiedType === 'prompt' ? 'AI 프롬프트 복사 완료!' : '심층 분석용 AI 프롬프트 복사 (Gemini/GPT용)'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};


// =====================================================================
// 4. 메인 App 컴포넌트 (상태 및 캔버스 로직 관장)
// =====================================================================
const App = () => {
  const [projectTitle, setProjectTitle] = useState('신규 사례 가계·생태도');
  const [mode, setMode] = useState('integrated'); // 'genogram' | 'ecomap' | 'integrated'
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [selection, setSelection] = useState({ type: null, id: null });
  const [interaction, setInteraction] = useState({ state: 'idle', data: null });
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiPromptText, setAiPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null });
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const fileInputRef = useRef(null);
  const svgRef = useRef(null);

  // History State
  const [history, setHistory] = useState([{ nodes: [], edges: [] }]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // 성능 최적화: 노드 맵 및 공유 엣지 맵 메모이제이션
  const nodeMap = useMemo(() => {
    const map = new Map();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  const sharedEdgesMap = useMemo(() => {
    const map = new Map();
    edges.forEach(e => {
      const key = [e.source, e.target].sort().join('__');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    map.forEach(list => list.sort((a, b) => a.id.localeCompare(b.id)));
    return map;
  }, [edges]);

  const cohabClusters = useMemo(() => computeCohabitingClusters(nodes), [nodes]);

  // 히스토리 기록 함수
  const saveToHistory = useCallback((newNodes, newEdges) => {
    const current = {
      nodes: JSON.parse(JSON.stringify(newNodes)),
      edges: JSON.parse(JSON.stringify(newEdges))
    };
    setHistory(prev => {
      const sliced = prev.slice(0, historyIdx + 1);
      sliced.push(current);
      if (sliced.length > 40) sliced.shift();
      return sliced;
    });
    setHistoryIdx(prev => Math.min(prev + 1, 39));
  }, [historyIdx]);

  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      const prevIdx = historyIdx - 1;
      setNodes(history[prevIdx].nodes);
      setEdges(history[prevIdx].edges);
      setHistoryIdx(prevIdx);
      setSelection({ type: null, id: null });
    }
  }, [history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const nextIdx = historyIdx + 1;
      setNodes(history[nextIdx].nodes);
      setEdges(history[nextIdx].edges);
      setHistoryIdx(nextIdx);
      setSelection({ type: null, id: null });
    }
  }, [history, historyIdx]);

  const deleteSelection = useCallback(() => {
    let nextNodes = nodes, nextEdges = edges;
    const targetNodeId = selection.type === 'node' ? selection.id : contextMenu.nodeId;

    if (targetNodeId) {
      nextNodes = nodes.filter(n => n.id !== targetNodeId);
      nextEdges = edges.filter(e => e.source !== targetNodeId && e.target !== targetNodeId);
    } else if (selection.type === 'edge' && selection.id) {
      nextEdges = edges.filter(e => e.id !== selection.id);
    } else {
      return;
    }

    setNodes(nextNodes);
    setEdges(nextEdges);
    saveToHistory(nextNodes, nextEdges);
    setSelection({ type: null, id: null });
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
  }, [selection, contextMenu.nodeId, nodes, edges, saveToHistory]);

  // 초기 로드 및 자동 저장
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.nodes) setNodes(parsed.nodes);
        if (parsed.edges) setEdges(parsed.edges);
        if (parsed.mode) setMode(parsed.mode);
        if (parsed.projectTitle) setProjectTitle(parsed.projectTitle);
        if (parsed.showLabels !== undefined) setShowLabels(parsed.showLabels);
        setHistory([{ nodes: parsed.nodes || [], edges: parsed.edges || [] }]);
        setHistoryIdx(0);
      } catch (e) {
        console.error('Failed to load autosave:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectTitle, nodes, edges, mode, showLabels }));
  }, [projectTitle, nodes, edges, mode, showLabels]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.id) deleteSelection();
      }
      if (e.key === 'Escape') {
        setInteraction({ state: 'idle', data: null });
        setSelection({ type: null, id: null });
        setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selection, deleteSelection]);

  // 자동 정렬 (세대 줄맞춤 및 겹침 해소)
  const applyAutoLayout = () => {
    if (nodes.length === 0) return;
    let simNodes = JSON.parse(JSON.stringify(nodes));
    let isModified = false;

    simNodes.forEach(n => {
      if (n.type === 'family') {
        const snappedY = Math.round(n.y / 140) * 140;
        if (Math.abs(n.y - snappedY) > 4) {
          n.y = snappedY;
          isModified = true;
        }
      }
    });

    for (let step = 0; step < 50; step++) {
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const n1 = simNodes[i], n2 = simNodes[j];
          const dx = n1.x - n2.x, dy = n1.y - n2.y;
          if (Math.abs(dy) < 55 && Math.abs(dx) < 140) {
            isModified = true;
            const push = (140 - Math.abs(dx)) / 2 + 5;
            if (dx >= 0) { n1.x += push; n2.x -= push; }
            else { n1.x -= push; n2.x += push; }
          }
        }
      }
    }

    if (snapEnabled) {
      simNodes = simNodes.map(n => ({ ...n, x: snapToGrid(n.x), y: snapToGrid(n.y) }));
    }
    if (isModified) {
      setNodes(simNodes);
      saveToHistory(simNodes, edges);
    }
  };

  // 노드 생성 함수 (commitHistory 옵션으로 중복 히스토리 적재 방지)
  const createNodeObject = (type, gender = 'none', x = null, y = null, existingNodes = nodes) => {
    const centerX = x !== null ? x : (-view.x + (svgRef.current?.clientWidth || 800) / 2) / view.scale;
    const centerY = y !== null ? y : (-view.y + (svgRef.current?.clientHeight || 600) / 2) / view.scale;
    const defaultName = type === 'family'
      ? (gender === 'male' ? '남성' : gender === 'female' ? '여성' : gender === 'pregnancy' ? '태아' : '가족')
      : '외부 체계';

    const hasIndexAlready = existingNodes.some(n => n.isIndex);

    return {
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      gender,
      x: snapEnabled ? snapToGrid(centerX) : centerX,
      y: snapEnabled ? snapToGrid(centerY) : centerY,
      name: defaultName,
      birthYear: type === 'family' ? CURRENT_YEAR - 40 : null,
      note: '',
      fontSize: THEME_CONFIG.sizes.defaultFont,
      isIndex: !hasIndexAlready && type === 'family',
      isDeceased: false,
      isCohabiting: false,
      cohabGroup: '동거 가구'
    };
  };

  const addNode = (type, gender = 'none', x = null, y = null) => {
    const newNode = createNodeObject(type, gender, x, y, nodes);
    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    saveToHistory(nextNodes, edges);
    setSelection({ type: 'node', id: newNode.id });
    return newNode;
  };

  // 스마트 노드 추가 (단일 히스토리 트랜잭션 + 부부 중앙 아래 자녀 배치)
  const smartAddNode = (sourceId, relationType, specificGender = null) => {
    const sourceNode = nodeMap.get(sourceId);
    if (!sourceNode) return;

    let targetX = sourceNode.x;
    let targetY = sourceNode.y;
    let newGender = sourceNode.gender === 'male' ? 'female' : 'male';
    let linkType = 'marriage';

    if (relationType === 'spouse') {
      targetX = sourceNode.x + (sourceNode.gender === 'male' ? 160 : -160);
    } else if (relationType === 'child') {
      // 배우자가 있으면 부부 중간 X좌표 아래에 자녀 생성
      const coupleEdge = edges.find(
        e => COUPLE_EDGE_TYPES.includes(e.type) && (e.source === sourceNode.id || e.target === sourceNode.id)
      );
      if (coupleEdge) {
        const spouseId = coupleEdge.source === sourceNode.id ? coupleEdge.target : coupleEdge.source;
        const spouseNode = nodeMap.get(spouseId);
        if (spouseNode) targetX = (sourceNode.x + spouseNode.x) / 2;
      }
      targetY = sourceNode.y + 160;
      newGender = specificGender || 'male';
      linkType = 'parent-child';
    }

    let attempt = 0;
    while (attempt < 8) {
      if (!nodes.some(n => Math.abs(n.x - targetX) < 70 && Math.abs(n.y - targetY) < 70)) break;
      targetX += 100;
      attempt++;
    }

    const newNode = createNodeObject('family', newGender, targetX, targetY, nodes);
    if (relationType === 'child' && sourceNode.birthYear) {
      newNode.birthYear = Math.min(CURRENT_YEAR, sourceNode.birthYear + 28);
      newNode.name = newGender === 'male' ? '아들' : '딸';
    } else if (relationType === 'spouse' && sourceNode.birthYear) {
      newNode.birthYear = sourceNode.birthYear;
      newNode.name = '배우자';
    }

    const newEdge = {
      id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: sourceId,
      target: newNode.id,
      type: linkType,
      direction: 'none',
      note: ''
    };

    const nextNodes = [...nodes, newNode];
    const nextEdges = [...edges, newEdge];
    setNodes(nextNodes);
    setEdges(nextEdges);
    saveToHistory(nextNodes, nextEdges);
    setSelection({ type: 'node', id: newNode.id });
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
  };

  // 포인터 및 마우스 핸들러
  const handlePointerDown = (e, nodeId = null) => {
    if (!nodeId) setSelection(prev => prev.type === 'node' ? { type: null, id: null } : prev);
    if (e.button === 2 || e.button === 1 || e.altKey) return;
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });

    if (nodeId) {
      e.stopPropagation();
      if (interaction.state === 'linking') {
        const sourceId = interaction.data.sourceId;
        if (sourceId === nodeId) return;
        const sourceNode = nodeMap.get(sourceId);
        const targetNode = nodeMap.get(nodeId);
        const isEcoEdge = mode === 'ecomap' || sourceNode?.type === 'env' || targetNode?.type === 'env';

        const newEdge = {
          id: `e_${Date.now()}`,
          source: sourceId,
          target: nodeId,
          type: isEcoEdge ? 'normal' : 'marriage',
          direction: 'none',
          note: ''
        };
        const nextEdges = [...edges, newEdge];
        setEdges(nextEdges);
        saveToHistory(nodes, nextEdges);
        setInteraction({ state: 'idle', data: null });
        setSelection({ type: 'edge', id: newEdge.id });
      } else {
        const targetNode = nodeMap.get(nodeId);
        if (!targetNode) return;
        setInteraction({
          state: 'dragging',
          data: {
            id: nodeId,
            startX: e.clientX,
            startY: e.clientY,
            initialX: targetNode.x,
            initialY: targetNode.y,
            hasMoved: false
          }
        });
        setSelection({ type: 'node', id: nodeId });
      }
    } else {
      if (interaction.state === 'linking') {
        setInteraction({ state: 'idle', data: null });
        return;
      }
      setInteraction({
        state: 'panning',
        data: { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y }
      });
    }
  };

  const handlePointerMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({
        x: (e.clientX - rect.left - view.x) / view.scale,
        y: (e.clientY - rect.top - view.y) / view.scale
      });
    }

    if (interaction.state === 'dragging') {
      const rawDx = e.clientX - interaction.data.startX;
      const rawDy = e.clientY - interaction.data.startY;
      if (Math.abs(rawDx) < 2 && Math.abs(rawDy) < 2 && !interaction.data.hasMoved) return;

      const dx = rawDx / view.scale;
      const dy = rawDy / view.scale;
      setInteraction(prev => ({ ...prev, data: { ...prev.data, hasMoved: true } }));

      setNodes(prev => prev.map(n => {
        if (n.id === interaction.data.id) {
          let nx = interaction.data.initialX + dx;
          let ny = interaction.data.initialY + dy;
          if (snapEnabled) { nx = snapToGrid(nx); ny = snapToGrid(ny); }
          return { ...n, x: nx, y: ny };
        }
        return n;
      }));
    } else if (interaction.state === 'panning') {
      setView(prev => ({
        ...prev,
        x: interaction.data.viewX + (e.clientX - interaction.data.startX),
        y: interaction.data.viewY + (e.clientY - interaction.data.startY)
      }));
    }
  };

  const handlePointerUp = () => {
    // 실제 좌표 이동(hasMoved)이 발생했을 때만 히스토리에 저장
    if (interaction.state === 'dragging' && interaction.data?.hasMoved) {
      saveToHistory(nodes, edges);
    }
    if (interaction.state !== 'linking') {
      setInteraction({ state: 'idle', data: null });
    }
  };

  const handleContextMenu = (e, nodeId) => {
    e.preventDefault();
    e.stopPropagation();
    setSelection({ type: 'node', id: nodeId });
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, nodeId });
  };

  // 마우스 커서 위치를 기준으로 확대/축소 보정
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.25, Math.min(3.5, view.scale * zoomFactor));

      const newX = mouseX - ((mouseX - view.x) / view.scale) * newScale;
      const newY = mouseY - ((mouseY - view.y) / view.scale) * newScale;
      setView({ x: newX, y: newY, scale: newScale });
    }
  };

  const zoomByButton = (factor) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const cx = (rect?.width || 800) / 2;
    const cy = (rect?.height || 600) / 2;
    const newScale = Math.max(0.25, Math.min(3.5, view.scale * factor));
    const newX = cx - ((cx - view.x) / view.scale) * newScale;
    const newY = cy - ((cy - view.y) / view.scale) * newScale;
    setView({ x: newX, y: newY, scale: newScale });
  };

  const fitToScreen = () => {
    if (nodes.length === 0) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const rect = svgRef.current?.getBoundingClientRect();
    const width = rect?.width || 900;
    const height = rect?.height || 650;
    const pad = 100;
    const minX = Math.min(...nodes.map(n => n.x)) - pad;
    const maxX = Math.max(...nodes.map(n => n.x)) + pad;
    const minY = Math.min(...nodes.map(n => n.y)) - pad;
    const maxY = Math.max(...nodes.map(n => n.y)) + pad;

    const boxW = Math.max(200, maxX - minX);
    const boxH = Math.max(200, maxY - minY);
    const scale = Math.max(0.4, Math.min(1.5, Math.min(width / boxW, height / boxH)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setView({
      x: width / 2 - centerX * scale,
      y: height / 2 - centerY * scale,
      scale
    });
  };

  const startLinking = () => {
    if (selection.type === 'node') {
      setInteraction({ state: 'linking', data: { sourceId: selection.id } });
    } else {
      alert('관계선을 연결할 시작 대상(노드)을 먼저 클릭해 선택해주세요.');
    }
  };

  // 사례관리 사정(Assessment) 리포트 및 프롬프트 자동 생성
  const generateAIAnalysis = () => {
    setIsLoading(true);
    setShowAiPanel(true);

    setTimeout(() => {
      const clientNode = nodes.find(n => n.isIndex) || nodes.find(n => n.type === 'family');
      const familyNodes = nodes.filter(n => n.type === 'family');
      const envNodes = nodes.filter(n => n.type === 'env');
      const cohabMembers = familyNodes.filter(n => n.isCohabiting);

      const clientSummary = clientNode
        ? `${clientNode.name} (${clientNode.gender === 'male' ? '남' : clientNode.gender === 'female' ? '여' : '기타'}, ${clientNode.birthYear ? `${CURRENT_YEAR - clientNode.birthYear}세` : '연령 미상'}${clientNode.note ? `, 특이사항: ${clientNode.note}` : ''})`
        : '미지정';

      const familyListText = familyNodes.map(n => {
        const age = n.birthYear ? `${CURRENT_YEAR - n.birthYear}세` : '연령미상';
        const tags = [
          n.isIndex ? '클라이언트' : null,
          n.isCohabiting ? `동거(${n.cohabGroup || '동거가구'})` : '비동거',
          n.isDeceased ? '사망' : null,
          n.note || null
        ].filter(Boolean).join(', ');
        return `- ${n.name} (${n.gender === 'male' ? '남' : n.gender === 'female' ? '여' : '태아'}, ${age}) [${tags}]`;
      }).join('\n');

      const relationLines = edges.map(e => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        const conf = ALL_RELATION_MAP[e.type];
        if (!s || !t || !conf) return null;
        const dirText = e.direction === 'single' ? '→' : e.direction === 'both' ? '↔' : '—';
        return `- ${s.name} ${dirText} ${t.name}: ${conf.label}${e.note ? ` (${e.note})` : ''}`;
      }).filter(Boolean).join('\n');

      const stressEdges = edges.filter(e => ['conflict', 'stress', 'cutoff', 'divorce', 'separation'].includes(e.type));
      const supportEdges = edges.filter(e => ['close', 'strong', 'normal'].includes(e.type));

      const reportText = `[${projectTitle} - 가계도·생태도 사정 요약]\n\n` +
        `1. 주요 클라이언트\n- ${clientSummary}\n\n` +
        `2. 가구 및 가족 체계 (${familyNodes.length}명 / 동거 ${cohabMembers.length}명)\n` +
        (familyListText || '- 등록된 가족 구성원이 없습니다.') + `\n\n` +
        `3. 생태 체계 및 지역사회 자원 (${envNodes.length}개처)\n` +
        (envNodes.length > 0 ? envNodes.map(n => `- ${n.name}${n.note ? ` (${n.note})` : ''}`).join('\n') : '- 등록된 외부 체계가 없습니다.') + `\n\n` +
        `4. 주요 관계 역동 및 자원 흐름\n` +
        (relationLines || '- 등록된 관계선이 없습니다.') + `\n\n` +
        `5. 사회복지사 사정(Assessment) 소견 초안\n` +
        `- 지지 체계: ${supportEdges.length > 0 ? `총 ${supportEdges.length}건의 긍정·지지 관계가 확인되어 사례관리 개입 시 강점 자원으로 활용 가능합니다.` : '공식·비공식 지지체계 발굴 및 관계망 강화가 필요합니다.'}\n` +
        `- 스트레스/위기 요인: ${stressEdges.length > 0 ? `갈등·단절·스트레스 관계가 ${stressEdges.length}건 파악되어 심리·정서적 중재 및 가족/체계 간 관계 조율이 요구됩니다.` : '명시적인 갈등·스트레스선은 관찰되지 않았으나 지속적인 모니터링이 필요합니다.'}`;

      const promptText = `당신은 종합사회복지관의 전문 사례관리 사회복지사입니다. 아래 가계도 및 생태도 구조 데이터를 바탕으로 사례회의 보고서용 [1. 가족 및 가구 구조 사정], [2. 생태체계 및 사회적 지지망 사정], [3. 주요 욕구 및 위기 요인], [4. 사례관리 개입 계획(단기/장기)]을 전문적인 서술형 문장으로 작성해주세요.\n\n` + reportText;

      setAiResult(reportText);
      setAiPromptText(promptText);
      setIsLoading(false);
    }, 350);
  };

  // 프로젝트 JSON 저장 및 불러오기
  const saveProject = () => {
    const payload = {
      projectTitle,
      nodes,
      edges,
      mode,
      showLabels,
      version: '5.0',
      savedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectTitle.replace(/\s+/g, '_')}_v5.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.nodes && data.edges) {
          setNodes(data.nodes);
          setEdges(data.edges);
          if (data.mode) setMode(data.mode);
          if (data.projectTitle) setProjectTitle(data.projectTitle);
          if (data.showLabels !== undefined) setShowLabels(data.showLabels);
          setHistory([{ nodes: data.nodes, edges: data.edges }]);
          setHistoryIdx(0);
          setSelection({ type: null, id: null });
        }
      } catch (err) {
        alert('올바른 프로젝트 JSON 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  // 고해상도 PNG 이미지 다운로드 (완전 구현)
  const downloadImage = () => {
    if (!svgRef.current || nodes.length === 0) {
      alert('캔버스에 출력할 도식이 없습니다.');
      return;
    }

    const pad = 90;
    const minX = Math.min(...nodes.map(n => n.x)) - pad;
    const maxX = Math.max(...nodes.map(n => n.x)) + pad;
    const minY = Math.min(...nodes.map(n => n.y)) - pad;
    const maxY = Math.max(...nodes.map(n => n.y)) + pad + 40;
    const exportWidth = Math.max(600, maxX - minX);
    const exportHeight = Math.max(450, maxY - minY);

    const clonedSvg = svgRef.current.cloneNode(true);
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('width', exportWidth);
    clonedSvg.setAttribute('height', exportHeight);
    clonedSvg.setAttribute('viewBox', `${minX} ${minY} ${exportWidth} ${exportHeight}`);

    // 내부 transform 초기화 (viewBox 기준으로 정확히 캡처)
    const mainGroup = clonedSvg.querySelector('g[data-canvas-group="true"]');
    if (mainGroup) {
      mainGroup.setAttribute('transform', 'translate(0, 0) scale(1)');
    }

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const scaleFactor = 2; // 고해상도 2배율 출력
      const canvas = document.createElement('canvas');
      canvas.width = exportWidth * scaleFactor;
      canvas.height = exportHeight * scaleFactor;
      const ctx = canvas.getContext('2d');

      ctx.scale(scaleFactor, scaleFactor);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, exportWidth, exportHeight);
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

      // 상단 좌측 제목 워터마크 표기
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${projectTitle} (${new Date().toLocaleDateString('ko-KR')})`, 20, 28);

      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${projectTitle.replace(/\s+/g, '_')}_가계생태도.png`;
      downloadLink.click();
    };
    img.src = url;
  };

  // 조직 공유용 샘플 템플릿 불러오기
  const loadSampleTemplate = () => {
    const sampleNodes = [
      { id: 'n_1', type: 'family', gender: 'male', x: 340, y: 280, name: '김철수', birthYear: CURRENT_YEAR - 72, note: '고혈압·관절염', fontSize: 15, isIndex: true, isDeceased: false, isCohabiting: true, cohabGroup: '동거 1인가구' },
      { id: 'n_2', type: 'family', gender: 'female', x: 520, y: 280, name: '박영희', birthYear: CURRENT_YEAR - 69, note: '2019년 사별', fontSize: 15, isIndex: false, isDeceased: true, isCohabiting: false, cohabGroup: '' },
      { id: 'n_3', type: 'family', gender: 'male', x: 360, y: 440, name: '장남(김민수)', birthYear: CURRENT_YEAR - 44, note: '타지역 거주', fontSize: 15, isIndex: false, isDeceased: false, isCohabiting: false, cohabGroup: '' },
      { id: 'n_4', type: 'family', gender: 'female', x: 500, y: 440, name: '장녀(김지영)', birthYear: CURRENT_YEAR - 41, note: '월 1회 안부연락', fontSize: 15, isIndex: false, isDeceased: false, isCohabiting: false, cohabGroup: '' },
      { id: 'n_5', type: 'env', gender: 'none', x: 140, y: 200, name: '종합사회복지관', birthYear: null, note: '밑반찬·사례관리', fontSize: 15, isIndex: false, isDeceased: false, isCohabiting: false },
      { id: 'n_6', type: 'env', gender: 'none', x: 140, y: 360, name: '동주민센터', birthYear: null, note: '기초연금·맞춤돌봄', fontSize: 15, isIndex: false, isDeceased: false, isCohabiting: false },
      { id: 'n_7', type: 'env', gender: 'none', x: 660, y: 180, name: '인근 정형외과', birthYear: null, note: '주 2회 물리치료', fontSize: 15, isIndex: false, isDeceased: false, isCohabiting: false }
    ];
    const sampleEdges = [
      { id: 'e_1', source: 'n_1', target: 'n_2', type: 'marriage', direction: 'none', note: '' },
      { id: 'e_2', source: 'n_1', target: 'n_3', type: 'parent-child', direction: 'none', note: '' },
      { id: 'e_3', source: 'n_1', target: 'n_4', type: 'parent-child', direction: 'none', note: '' },
      { id: 'e_4', source: 'n_1', target: 'n_3', type: 'cutoff', direction: 'none', note: '연락두절' },
      { id: 'e_5', source: 'n_5', target: 'n_1', type: 'strong', direction: 'single', note: '정기방문' },
      { id: 'e_6', source: 'n_6', target: 'n_1', type: 'normal', direction: 'single', note: '' },
      { id: 'e_7', source: 'n_1', target: 'n_7', type: 'normal', direction: 'both', note: '' }
    ];

    setProjectTitle('김철수 어르신 사례 (샘플)');
    setMode('integrated');
    setNodes(sampleNodes);
    setEdges(sampleEdges);
    saveToHistory(sampleNodes, sampleEdges);
    setSelection({ type: null, id: null });
    setView({ x: 40, y: 20, scale: 1 });
  };

  const confirmReset = () => {
    setNodes([]);
    setEdges([]);
    setHistory([{ nodes: [], edges: [] }]);
    setHistoryIdx(0);
    setSelection({ type: null, id: null });
    localStorage.removeItem(STORAGE_KEY);
    setIsResetModalOpen(false);
  };

  const selectedNode = selection.type === 'node' ? nodeMap.get(selection.id) : null;

  return (
    <div
      className="flex h-screen w-full bg-slate-100 overflow-hidden font-sans text-slate-800"
      onPointerDown={() => setContextMenu({ visible: false, x: 0, y: 0, nodeId: null })}
    >
      <Sidebar
        mode={mode}
        setMode={setMode}
        addNode={addNode}
        startLinking={startLinking}
        snapEnabled={snapEnabled}
        setSnapEnabled={setSnapEnabled}
        applyAutoLayout={applyAutoLayout}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        setIsResetModalOpen={setIsResetModalOpen}
        interaction={interaction}
      />

      <main className="flex-1 relative flex flex-col">
        <Header
          mode={mode}
          projectTitle={projectTitle}
          setProjectTitle={setProjectTitle}
          historyIdx={historyIdx}
          historyLength={history.length}
          handleUndo={handleUndo}
          handleRedo={handleRedo}
          generateAIAnalysis={generateAIAnalysis}
          fileInputRef={fileInputRef}
          handleLoadProject={handleLoadProject}
          saveProject={saveProject}
          downloadImage={downloadImage}
          loadSampleTemplate={loadSampleTemplate}
          setShowHelpModal={setShowHelpModal}
        />

        <div
          className="flex-1 bg-slate-50 overflow-hidden relative cursor-crosshair touch-none outline-none"
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          {/* 배경 그리드 */}
          <div
            className="absolute inset-0 pointer-events-none opacity-25"
            style={{
              backgroundImage: `linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)`,
              backgroundSize: `${GRID_SIZE * view.scale}px ${GRID_SIZE * view.scale}px`,
              backgroundPosition: `${view.x}px ${view.y}px`
            }}
          />

          {/* 빈 캔버스 안내 배너 */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-400 gap-3">
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center gap-2 pointer-events-auto">
                <Users size={28} className="text-indigo-500" />
                <p className="text-sm font-bold text-slate-700">가계도·생태도 캔버스가 비어 있습니다</p>
                <p className="text-xs text-slate-500 text-center">
                  좌측 도구 모음에서 인물을 추가하거나, 아래 버튼으로 샘플 사례를 불러와보세요.
                </p>
                <button
                  onClick={loadSampleTemplate}
                  className="mt-1 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  사례관리 샘플 불러오기
                </button>
              </div>
            </div>
          )}

          {/* 연결 모드 안내 배너 */}
          {interaction.state === 'linking' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-indigo-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-bounce">
              <Link2 size={14} /> 연결할 대상 노드를 클릭하세요 (취소: ESC 또는 빈 공간 클릭)
            </div>
          )}

          {/* 선택된 노드 상단 퀵 액션 툴바 */}
          {selectedNode && interaction.state === 'idle' && (
            <div
              className="absolute z-40 flex flex-col items-center gap-1"
              style={{
                left: selectedNode.x * view.scale + view.x,
                top: selectedNode.y * view.scale + view.y - (selectedNode.type === 'family' ? 56 : 48),
                transform: 'translate(-50%, -100%)'
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-800 text-white rounded-full p-1.5 shadow-xl flex items-center gap-1 border border-slate-600">
                <button
                  onClick={startLinking}
                  className="p-1.5 hover:bg-slate-700 rounded-full transition-colors flex items-center gap-1 text-xs font-bold px-2.5"
                >
                  <Link2 size={13} className="text-indigo-400" /> 관계 연결
                </button>
                {selectedNode.type === 'family' && (
                  <>
                    <div className="w-px h-4 bg-slate-600 mx-0.5" />
                    <button
                      onClick={() => smartAddNode(selectedNode.id, 'spouse')}
                      className="p-1.5 hover:bg-slate-700 rounded-full text-rose-300 transition-colors"
                      title="배우자 바로 추가"
                    >
                      <Heart size={15} />
                    </button>
                    <button
                      onClick={() => smartAddNode(selectedNode.id, 'child', 'male')}
                      className="p-1.5 hover:bg-slate-700 rounded-full text-blue-300 transition-colors"
                      title="아들 바로 추가"
                    >
                      <Square size={14} />
                    </button>
                    <button
                      onClick={() => smartAddNode(selectedNode.id, 'child', 'female')}
                      className="p-1.5 hover:bg-slate-700 rounded-full text-pink-300 transition-colors"
                      title="딸 바로 추가"
                    >
                      <CircleIcon size={14} />
                    </button>
                  </>
                )}
                <div className="w-px h-4 bg-slate-600 mx-0.5" />
                <button
                  onClick={deleteSelection}
                  className="p-1.5 hover:bg-slate-700 rounded-full text-rose-400 hover:text-rose-300"
                  title="삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-800" />
            </div>
          )}

          {/* 메인 SVG 캔버스 */}
          <svg ref={svgRef} className="w-full h-full block">
            <defs>
              {Object.values(ALL_RELATION_MAP).map((config) => (
                <React.Fragment key={config.id}>
                  <marker id={`arrow-${config.id}`} markerWidth="7" markerHeight="7" refX="6.5" refY="2.5" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,5 L6.5,2.5 z" fill={config.color} />
                  </marker>
                  <marker id={`arrow-start-${config.id}`} markerWidth="7" markerHeight="7" refX="0" refY="2.5" orient="auto" markerUnits="strokeWidth">
                    <path d="M6.5,0 L6.5,5 L0,2.5 z" fill={config.color} />
                  </marker>
                </React.Fragment>
              ))}
            </defs>

            <g data-canvas-group="true" transform={`translate(${view.x}, ${view.y}) scale(${view.scale})`}>
              {/* 동거 가구(클러스터별) 경계선 */}
              {cohabClusters.map(cluster => (
                <g key={cluster.id} className="pointer-events-none">
                  <rect
                    x={cluster.x}
                    y={cluster.y}
                    width={cluster.width}
                    height={cluster.height}
                    rx={24}
                    ry={24}
                    fill="rgba(79, 70, 229, 0.03)"
                    stroke={THEME_CONFIG.colors.primary}
                    strokeWidth="2"
                    strokeDasharray="6,4"
                  />
                  <text
                    x={cluster.x + 14}
                    y={cluster.y + 18}
                    fontSize="11"
                    fill={THEME_CONFIG.colors.primary}
                    className="font-bold select-none opacity-80"
                  >
                    {cluster.label}
                  </text>
                </g>
              ))}

              {/* 관계선(Edge) 렌더링 */}
              {edges.map(edge => (
                <EdgeComponent
                  key={edge.id}
                  edge={edge}
                  sourceNode={nodeMap.get(edge.source)}
                  targetNode={nodeMap.get(edge.target)}
                  nodeMap={nodeMap}
                  edges={edges}
                  sharedEdgesMap={sharedEdgesMap}
                  isSelected={selection.id === edge.id}
                  onClick={(id) => setSelection({ type: 'edge', id })}
                  showLabels={showLabels}
                />
              ))}

              {/* 노드(Node) 렌더링 */}
              {nodes.map(node => (
                <NodeComponent
                  key={node.id}
                  node={node}
                  isSelected={selection.id === node.id}
                  onMouseDown={handlePointerDown}
                  onContextMenu={handleContextMenu}
                />
              ))}

              {/* 연결 진행 중 가이드 선 */}
              {interaction.state === 'linking' && interaction.data?.sourceId && (() => {
                const s = nodeMap.get(interaction.data.sourceId);
                return s ? (
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={mousePos.x}
                    y2={mousePos.y}
                    stroke={THEME_CONFIG.colors.primary}
                    strokeWidth="2"
                    strokeDasharray="4,4"
                    className="pointer-events-none opacity-70"
                  />
                ) : null;
              })()}
            </g>
          </svg>

          {/* 하단 줌/네비게이션 컨트롤 바 */}
          <div className="absolute bottom-5 left-5 flex items-center gap-2 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-xs font-mono text-slate-600 border border-slate-200 shadow-sm">
            <button onClick={() => zoomByButton(0.85)} className="p-1 hover:bg-slate-100 rounded-full" title="축소">
              <ZoomOut size={14} />
            </button>
            <span className="min-w-[48px] text-center font-bold">{Math.round(view.scale * 100)}%</span>
            <button onClick={() => zoomByButton(1.15)} className="p-1 hover:bg-slate-100 rounded-full" title="확대">
              <ZoomIn size={14} />
            </button>
            <div className="w-px h-3 bg-slate-300 mx-1" />
            <button onClick={fitToScreen} className="flex items-center gap-1 px-2 py-0.5 hover:bg-slate-100 rounded-full font-sans font-semibold text-slate-700" title="전체 도식 화면 맞춤">
              <Maximize2 size={12} /> 화면 맞춤
            </button>
          </div>
        </div>
      </main>

      {/* 전체 초기화 확인 모달 */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-80 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800">전체 초기화</h3>
              <p className="text-xs text-slate-500 mt-1">
                캔버스의 모든 가계도·생태도 데이터가 삭제됩니다.<br />정말 초기화하시겠습니까?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => setIsResetModalOpen(false)} className="py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-xs">
                취소
              </button>
              <button onClick={confirmReset} className="py-2.5 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 text-xs">
                초기화 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사용 가이드 모달 */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowHelpModal(false)}>
          <div className="bg-white p-6 rounded-2xl shadow-2xl w-[440px] space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <HelpCircle size={18} className="text-indigo-600" /> 가계도·생태도 Pro v5.0 사용 안내
              </h3>
              <button onClick={() => setShowHelpModal(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <ul className="text-xs text-slate-600 space-y-2.5 leading-relaxed">
              <li>• <b>빠른 가족 추가</b>: 인물 노드를 클릭하거나 우클릭하면 상단 팝업에서 <b>배우자(♥), 아들(□), 딸(○)</b>을 즉시 연결·생성할 수 있습니다.</li>
              <li>• <b>표준 T자형 부모-자녀선</b>: 부부 관계가 맺어진 부모 중 한 명에게 자녀를 연결하면 자동으로 부부 결혼선 중앙에서 분기됩니다.</li>
              <li>• <b>동거 가구 분리 표기</b>: 우측 속성창에서 '동거 가구 포함'을 체크하고 가구 구분명을 입력하면 가구별로 독립된 점선 경계가 표시됩니다.</li>
              <li>• <b>화면 이동 및 확대</b>: 빈 공간을 드래그하면 화면이 이동하며, <b>Ctrl(또는 ⌘) + 마우스 휠</b> 또는 좌측 하단 버튼으로 확대/축소할 수 있습니다.</li>
              <li>• <b>단축키</b>: 실행 취소(<b>Ctrl+Z</b>), 다시 실행(<b>Ctrl+Y</b>), 선택 삭제(<b>Delete / Backspace</b>), 작업 취소(<b>ESC</b>)</li>
            </ul>
            <button onClick={() => setShowHelpModal(false)} className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700">
              확인
            </button>
          </div>
        </div>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="p-1">
            {nodeMap.get(contextMenu.nodeId)?.type === 'family' && (
              <>
                <button
                  onClick={() => smartAddNode(contextMenu.nodeId, 'spouse')}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 rounded-lg flex items-center gap-2"
                >
                  <Heart size={14} className="text-rose-400" /> 배우자 추가
                </button>
                <button
                  onClick={() => smartAddNode(contextMenu.nodeId, 'child', 'male')}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 rounded-lg flex items-center gap-2"
                >
                  <Square size={14} className="text-blue-500" /> 아들 추가
                </button>
                <button
                  onClick={() => smartAddNode(contextMenu.nodeId, 'child', 'female')}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 rounded-lg flex items-center gap-2"
                >
                  <CircleIcon size={14} className="text-pink-500" /> 딸 추가
                </button>
                <div className="h-px bg-slate-100 my-1" />
              </>
            )}
            <button
              onClick={deleteSelection}
              className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-2"
            >
              <Trash2 size={14} /> 삭제
            </button>
          </div>
        </div>
      )}

      {selection.id && (
        <PropertyPanel
          selection={selection}
          setSelection={setSelection}
          nodes={nodes}
          setNodes={setNodes}
          edges={edges}
          setEdges={setEdges}
          saveToHistory={saveToHistory}
          deleteSelection={deleteSelection}
          mode={mode}
        />
      )}

      {showAiPanel && (
        <AIPanel
          setShowAiPanel={setShowAiPanel}
          isLoading={isLoading}
          aiResult={aiResult}
          aiPromptText={aiPromptText}
        />
      )}

      <style>{`
        .animate-spin-slow { animation: spin 6s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-slide-in-right { animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
};

export default App;
