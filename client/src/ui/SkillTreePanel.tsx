import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MELEE_SKILL_TREE, type SkillNodeDef } from '@saab/shared';
import { skillManager } from '../systems/SkillManager.js';
import { allocateSkill, setHotbar } from '../network/actions.js';

interface SkillTreeState { visible: boolean; }
let setSkillTreeState: ((s: SkillTreeState | ((prev: SkillTreeState) => SkillTreeState)) => void) | null = null;

const NODE_SIZE = 54;
const CENTER_X = 175;
const START_Y = 30;
const SPACING_X = 110;
const SPACING_Y = 130;

function getNodePos(node: SkillNodeDef) {
  return {
    px: CENTER_X + node.position.x * SPACING_X - NODE_SIZE / 2,
    py: START_Y + node.position.y * SPACING_Y,
  };
}

function canAllocate(node: SkillNodeDef, sp: number): boolean {
  if (sp <= 0) return false;
  if (skillManager.getPointsInSkill(node.id) >= node.maxPoints) return false;
  for (const prereq of node.prerequisites) {
    if (skillManager.getPointsInSkill(prereq) <= 0) return false;
  }
  return true;
}

function SkillTreePanelComponent() {
  const [state, setState] = useState<SkillTreeState>({ visible: false });
  const [, setTick] = useState(0);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hotbarAssignMode, setHotbarAssignMode] = useState(false);
  setSkillTreeState = setState;

  useEffect(() => {
    return skillManager.subscribe(() => setTick(t => t + 1));
  }, []);

  // Listen for hotbar assignment keys when in assign mode
  useEffect(() => {
    if (!hotbarAssignMode || !selectedNode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
        e.preventDefault();
        e.stopPropagation();
        const slot = parseInt(e.code.replace('Digit', '')) - 1;
        setHotbar(slot, selectedNode);
        setHotbarAssignMode(false);
      }
      if (e.code === 'Escape') {
        setHotbarAssignMode(false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [hotbarAssignMode, selectedNode]);

  if (!state.visible) return null;

  const skillPoints = skillManager.getSkillPoints();
  const nodes = MELEE_SKILL_TREE;
  const selected = selectedNode ? nodes.find(n => n.id === selectedNode) : null;
  const selectedPoints = selectedNode ? skillManager.getPointsInSkill(selectedNode) : 0;

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      background: 'rgba(15,10,5,0.95)', border: '2px solid #555',
      borderRadius: '12px', padding: '16px', pointerEvents: 'auto',
      width: '400px', minHeight: '420px', userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ color: '#ccc', fontSize: '14px', fontWeight: 'bold' }}>
          Skill Tree — Melee
        </div>
        <div style={{ color: '#ffd700', fontSize: '13px' }}>
          Skill Points: {skillPoints}
        </div>
      </div>

      {/* Tree Canvas */}
      <div style={{ position: 'relative', width: '350px', height: '290px', margin: '0 auto' }}>
        {/* Prerequisite Lines */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {nodes.map(node => node.prerequisites.map(prereqId => {
            const prereqNode = nodes.find(n => n.id === prereqId);
            if (!prereqNode) return null;
            const from = getNodePos(prereqNode);
            const to = getNodePos(node);
            const allocated = skillManager.getPointsInSkill(prereqId) > 0;
            return (
              <line
                key={`${prereqId}-${node.id}`}
                x1={from.px + NODE_SIZE / 2} y1={from.py + NODE_SIZE / 2}
                x2={to.px + NODE_SIZE / 2} y2={to.py + NODE_SIZE / 2}
                stroke={allocated ? '#888' : '#333'} strokeWidth={2}
              />
            );
          }))}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const { px, py } = getNodePos(node);
          const points = skillManager.getPointsInSkill(node.id);
          const allocatable = canAllocate(node, skillPoints);
          const isMaxed = points >= node.maxPoints;
          const isSelected = node.id === selectedNode;

          let borderColor = '#444';
          if (isMaxed) borderColor = '#ffd700';
          else if (points > 0) borderColor = '#44bb44';
          else if (allocatable) borderColor = '#4488cc';

          const isPassive = node.effects.every(e => e.type === 'passive');

          return (
            <div
              key={node.id}
              onClick={() => setSelectedNode(node.id)}
              onDblClick={() => { if (allocatable) allocateSkill(node.id); }}
              style={{
                position: 'absolute', left: px, top: py,
                width: NODE_SIZE, height: NODE_SIZE,
                background: points > 0
                  ? 'rgba(68,187,68,0.15)'
                  : allocatable ? 'rgba(68,136,204,0.1)' : 'rgba(255,255,255,0.03)',
                border: `2px solid ${borderColor}`,
                borderRadius: isPassive ? '50%' : '8px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                outline: isSelected ? '2px solid #fff' : 'none',
                outlineOffset: '2px',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ fontSize: '10px', color: '#ddd', textAlign: 'center', lineHeight: '1.1' }}>
                {node.name}
              </div>
              <div style={{ fontSize: '10px', color: borderColor, marginTop: '2px' }}>
                {points}/{node.maxPoints}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Node Detail */}
      {selected && (
        <div style={{
          marginTop: '8px', padding: '10px',
          background: 'rgba(0,0,0,0.5)', borderRadius: '6px',
          border: '1px solid #555',
        }}>
          <div style={{ color: '#ffd700', fontSize: '13px', fontWeight: 'bold' }}>
            {selected.name}
          </div>
          <div style={{ color: '#aaa', fontSize: '11px', marginTop: '4px' }}>
            {selected.description}
          </div>
          <div style={{ color: '#888', fontSize: '10px', marginTop: '4px' }}>
            {selected.effects[0]?.cooldown ? `CD: ${selected.effects[0].cooldown}s` : ''}
            {selected.effects[0]?.manaCost ? ` | Mana: ${selected.effects[0].manaCost}` : ''}
            {selected.effects[0]?.type === 'passive' ? 'Passive' : ''}
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            {canAllocate(selected, skillPoints) && (
              <button
                onClick={() => allocateSkill(selected.id)}
                style={{
                  padding: '4px 12px',
                  background: '#336633', border: '1px solid #44bb44',
                  borderRadius: '4px', color: '#fff', fontSize: '11px', cursor: 'pointer',
                }}
              >
                Allocate ({selectedPoints}/{selected.maxPoints})
              </button>
            )}

            {/* Hotbar button — only for non-passive skills with at least 1 point */}
            {selectedPoints > 0 && !selected.effects.every(e => e.type === 'passive') && (
              <button
                onClick={() => setHotbarAssignMode(true)}
                style={{
                  padding: '4px 12px',
                  background: hotbarAssignMode ? '#664400' : '#333366',
                  border: `1px solid ${hotbarAssignMode ? '#ff8800' : '#6666bb'}`,
                  borderRadius: '4px', color: '#fff', fontSize: '11px', cursor: 'pointer',
                }}
              >
                {hotbarAssignMode ? 'Press 1-4...' : 'Set Hotbar'}
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ color: '#555', fontSize: '9px', marginTop: '6px', textAlign: 'center' }}>
        Double-click to allocate | K to close
      </div>
    </div>
  );
}

export function mountSkillTreePanel(container: HTMLElement) {
  const div = document.createElement('div');
  div.id = 'skill-tree-root';
  container.appendChild(div);
  render(<SkillTreePanelComponent />, div);
}

export function toggleSkillTreePanel() {
  setSkillTreeState?.((prev: SkillTreeState) => ({ visible: !prev.visible }));
}

export function hideSkillTreePanel() {
  setSkillTreeState?.({ visible: false });
}

export function showSkillTreePanel() {
  setSkillTreeState?.({ visible: true });
}
