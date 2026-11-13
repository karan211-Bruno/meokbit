import React, { useState } from 'react';
import { AiSettings, MindMapDoc, MindNode } from '../types';
import { runAiMindMapGenerate } from '../lib/aiAssistant';

interface MindMapEditorProps {
  mindMaps: MindMapDoc[];
  settings: AiSettings;
  onSaveMindMap: (doc: MindMapDoc) => void;
  onInsertMarkdownToNote: (markdown: string) => void;
}

export const MindMapEditor: React.FC<MindMapEditorProps> = ({
  mindMaps,
  settings,
  onSaveMindMap,
  onInsertMarkdownToNote,
}) => {
  const [selectedId, setSelectedId] = useState<string>(mindMaps[0]?.id || '');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root');
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [busy, setBusy] = useState(false);

  const activeMap = mindMaps.find((m) => m.id === selectedId) || mindMaps[0] || null;

  const createNewMap = () => {
    const id = `mm_${Date.now()}`;
    const doc: MindMapDoc = {
      id,
      title: '새 마인드맵',
      updatedAt: Date.now(),
      nodes: [{ id: 'root', label: '중심 주제', parentId: null, x: 420, y: 260 }],
    };
    onSaveMindMap(doc);
    setSelectedId(id);
    setSelectedNodeId('root');
  };

  const addChildNode = () => {
    if (!activeMap || !newNodeLabel.trim()) return;
    const parent = activeMap.nodes.find((n) => n.id === selectedNodeId) || activeMap.nodes[0];
    const siblingCount = activeMap.nodes.filter((n) => n.parentId === parent.id).length;
    const angle = (siblingCount * 0.9 - 1.2) * 0.7;
    const dist = parent.parentId === null ? 210 : 160;
    const node: MindNode = {
      id: `mn_${Date.now()}`,
      label: newNodeLabel.trim(),
      parentId: parent.id,
      x: Math.max(70, Math.min(770, Math.round(parent.x + Math.cos(angle) * dist))),
      y: Math.max(50, Math.min(470, Math.round(parent.y + Math.sin(angle) * dist))),
    };
    onSaveMindMap({
      ...activeMap,
      updatedAt: Date.now(),
      nodes: [...activeMap.nodes, node],
    });
    setNewNodeLabel('');
  };

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) return;
    setBusy(true);
    try {
      const generatedNodes = await runAiMindMapGenerate(settings, aiTopic.trim(), '');
      const id = `mm_${Date.now()}`;
      const doc: MindMapDoc = {
        id,
        title: `${aiTopic.trim()} 마인드맵`,
        nodes: generatedNodes,
        updatedAt: Date.now(),
      };
      onSaveMindMap(doc);
      setSelectedId(id);
      setSelectedNodeId(generatedNodes[0]?.id || 'mm-root');
      setAiTopic('');
    } finally {
      setBusy(false);
    }
  };

  const exportAsMarkdown = () => {
    if (!activeMap) return;
    const renderBranch = (parentId: string | null, depth: number): string[] => {
      return activeMap.nodes
        .filter((n) => n.parentId === parentId)
        .flatMap((node) => [
          `${'  '.repeat(depth)}- ${node.label}`,
          ...renderBranch(node.id, depth + 1),
        ]);
    };
    const md = `# ${activeMap.title}\n\n${renderBranch(null, 0).join('\n')}`;
    onInsertMarkdownToNote(md);
  };

  return (
    <div className="mindmap-panel">
      <div className="panel-header-bar">
        <div className="panel-title-group">
          <h2>마인드맵 스튜디오</h2>
          <select
            value={activeMap?.id || ''}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="마인드맵 선택"
          >
            {mindMaps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn-outline-sm" onClick={createNewMap}>
            + 새 마인드맵
          </button>
        </div>

        <div className="panel-actions-group">
          <input
            type="text"
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder="AI로 생성할 주제 입력..."
          />
          <button
            type="button"
            className="btn-ink-sm"
            onClick={handleAiGenerate}
            disabled={busy || !aiTopic.trim()}
          >
            {busy ? '생성 중...' : 'AI 가지 생성'}
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={exportAsMarkdown}
            disabled={!activeMap}
          >
            노트로 삽입
          </button>
        </div>
      </div>

      {activeMap && (
        <>
          <div className="mindmap-toolbar">
            <span>
              선택된 노드:{' '}
              <strong>
                {activeMap.nodes.find((n) => n.id === selectedNodeId)?.label || '없음'}
              </strong>
            </span>
            <input
              type="text"
              value={newNodeLabel}
              onChange={(e) => setNewNodeLabel(e.target.value)}
              placeholder="하위 가지 이름..."
            />
            <button
              type="button"
              className="btn-ink-sm"
              onClick={addChildNode}
              disabled={!newNodeLabel.trim()}
            >
              하위 노드 추가
            </button>
          </div>

          <div className="mindmap-svg-wrap">
            <svg viewBox="0 0 840 520" className="mindmap-svg">
              {activeMap.nodes
                .filter((n) => n.parentId !== null)
                .map((node) => {
                  const parent = activeMap.nodes.find((p) => p.id === node.parentId);
                  if (!parent) return null;
                  const midX = (parent.x + node.x) / 2;
                  return (
                    <path
                      key={`edge_${node.id}`}
                      d={`M ${parent.x} ${parent.y} C ${midX} ${parent.y}, ${midX} ${node.y}, ${node.x} ${node.y}`}
                      fill="none"
                      stroke="#2b2b2b"
                      strokeWidth={parent.parentId === null ? 2.4 : 1.5}
                    />
                  );
                })}

              {activeMap.nodes.map((node) => {
                const isRoot = node.parentId === null;
                const isSelected = node.id === selectedNodeId;
                const boxW = Math.max(96, Math.min(180, node.label.length * 12 + 28));
                const boxH = isRoot ? 44 : 34;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={-boxW / 2}
                      y={-boxH / 2}
                      width={boxW}
                      height={boxH}
                      rx={isRoot ? 10 : 6}
                      fill={isSelected ? '#141414' : '#ffffff'}
                      stroke="#141414"
                      strokeWidth={isRoot ? 2.5 : 1.5}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={isSelected ? '#ffffff' : '#141414'}
                      fontSize={isRoot ? 14 : 12.5}
                      fontWeight={isRoot ? 700 : 500}
                    >
                      {node.label.slice(0, 14)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}
    </div>
  );
};
