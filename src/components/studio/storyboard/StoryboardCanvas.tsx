"use client";

import "@xyflow/react/dist/style.css";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyNodeChanges, Background, ConnectionMode, Controls, Handle, NodeResizeControl, Position, ReactFlow, ResizeControlVariant, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { Clapperboard, Maximize2, Rows3, Sparkles, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAgentSelection } from "@/components/desktop/ProjectReviewDock";
import { EffectPicker } from "./EffectPicker";
import { StoryboardCardMedia } from "./StoryboardCardMedia";
import { ShotNote } from "./ShotNote";
import { CANVAS_CARD_WIDTH, CANVAS_MAX_WIDTH, CANVAS_MIN_WIDTH, canvasCardWidth, markNote, markNumbers, reconcileCanvas, type CanvasNode } from "@/lib/storyboard/canvas";
import { templateId } from "@/lib/effects/agent-request";
import type { GuideEffect } from "@/lib/effects/guide";
import type { StoryboardAsset, StoryboardMark } from "@/lib/storyboard/model";
import type { useStoryboard } from "./useStoryboard";
import styles from "./storyboard.module.css";

type Controller = ReturnType<typeof useStoryboard>;
const nodeTypes = { moment: MomentCardNode, effect: EffectCardNode, text: TextCardNode };
function MomentCardNode(props: NodeProps<Card>) { return <MomentCard {...props} />; }
function EffectCardNode(props: NodeProps<Card>) { return <EffectCard {...props} />; }
function TextCardNode(props: NodeProps<Card>) { return <TextCard {...props} />; }
type CardData = { card: CanvasNode; mark?: StoryboardMark; number?: number; asset?: StoryboardAsset; effect?: GuideEffect };
type Card = Node<CardData>;
type Host = { projectId: string; api: Controller; openClip: (source: string, at: number) => void };
// Cards read the host through context, so their components stay the same across renders (typing keeps its place).
const HostContext = createContext<{ current: Host } | null>(null);
const useHost = () => useContext(HostContext)!.current;
// Fit never zooms past life size, so one card does not fill the canvas.
const FIT = { maxZoom: 1, padding: 0.15 };
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;

/** Lines attach anywhere along a card: a handle on each side, each able to start or end a line.
 *  The left and right edges also drag to change the card's width; its height follows the content. */
function Handles({ id }: { id: string }) {
  const host = useHost();
  return <>
    {([Position.Left, Position.Right, Position.Top, Position.Bottom] as const).map(side =>
      <Handle key={side} id={side} type="source" position={side} className={styles.canvasHandle} />)}
    {([Position.Left, Position.Right] as const).map(side => <NodeResizeControl key={`size-${side}`} position={side} variant={ResizeControlVariant.Line} minWidth={CANVAS_MIN_WIDTH} maxWidth={CANVAS_MAX_WIDTH}
      className={styles.canvasResize} onResizeEnd={(_, size) => void host.api.canvas.place([{ id, x: Math.round(size.x), y: Math.round(size.y), width: size.width }])} />)}
  </>;
}

function MomentCard({ data }: NodeProps<Card>) {
  const host = useHost();
  const { mark, asset, number } = data;
  if (!mark) return null;
  const length = mark.end !== null ? mark.end - mark.start : Math.min(2, Math.max(1 / 30, (asset?.duration ?? 2) - mark.start));
  return <div className={styles.canvasCard} data-kind="moment">
    <Handles id={data.card.id} />
    <div className={styles.canvasCardHead}>
      <strong className={styles.canvasNumber}>M{number}</strong>
      <span className={styles.canvasCardTitle} title={asset?.name}>{asset?.name ?? mark.source}</span>
      <Button size="icon-xs" variant="ghost" className="nodrag" aria-label={`Open ${asset?.name ?? "clip"} at M${number}`} title="Open the clip here" onClick={() => host.openClip(mark.source, mark.start)}><Maximize2 aria-hidden="true" /></Button>
    </div>
    <div className={`nodrag ${styles.canvasMedia}`}><StoryboardCardMedia asset={asset} start={mark.start} duration={length} label={asset?.name} /></div>
    <span className={`tabular-nums ${styles.canvasTime}`}>{time(mark.start)}{mark.end !== null ? `–${time(mark.end)}` : ""}</span>
    <div className="nodrag nowheel">
      <ShotNote value={markNote(mark)} label={`What happens at M${number}`} placeholder="What happens here?" maxLength={2000} projectId={host.projectId}
        save={note => void host.api.saveMark({ ...mark, note })} />
    </div>
  </div>;
}

function EffectCard({ data }: NodeProps<Card>) {
  const host = useHost();
  const { card, effect } = data;
  return <div className={styles.canvasCard} data-kind="effect">
    <Handles id={data.card.id} />
    <div className={styles.canvasCardHead}><Sparkles aria-hidden="true" size={14} /><span className={styles.canvasCardTitle}>{card.template?.title}</span></div>
    {effect?.video && <video className={`nodrag ${styles.canvasMedia}`} src={effect.video} poster={effect.poster} muted loop playsInline controls preload="metadata" aria-label={`${card.template?.title} example`} />}
    <div className="nodrag nowheel">
      <ShotNote value={card.text ?? ""} label={`How to use ${card.template?.title}`} placeholder="How should it be used?" maxLength={4000} projectId={host.projectId}
        save={text => void host.api.canvas.update(card.id, { text })} />
    </div>
  </div>;
}

function TextCard({ data }: NodeProps<Card>) {
  const host = useHost();
  return <div className={styles.canvasCard} data-kind="text">
    <Handles id={data.card.id} />
    <div className="nodrag nowheel">
      <ShotNote value={data.card.text ?? ""} label="Note" placeholder="Write anything: a direction, a line to say…" maxLength={4000} projectId={host.projectId}
        save={text => void host.api.canvas.update(data.card.id, { text })} />
    </div>
  </div>;
}

/**
 * The storyboard canvas: marked moments, effects and notes placed freely and joined by lines. Every mark
 * is a moment card; effects come from Templates. Moves, lines and deletions each save as one Undo step,
 * and the agent reads the same graph (storyboard_get canvas) to assemble the edit.
 */
export function StoryboardCanvas(props: Host & { lookup: (source: string) => StoryboardAsset | undefined; addMoment: () => void }) {
  return <ReactFlowProvider><CanvasSurface {...props} /></ReactFlowProvider>;
}

function CanvasSurface({ projectId, api, lookup, openClip, addMoment }: Host & { lookup: (source: string) => StoryboardAsset | undefined; addMoment: () => void }) {
  const board = api.snapshot?.content;
  const view = useMemo(() => board ? reconcileCanvas(board) : null, [board]);
  const [effects, setEffects] = useState<GuideEffect[]>([]);
  const [picking, setPicking] = useState(false), [pickingAll, setPickingAll] = useState(false);
  const flow = useReactFlow<Card>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/guide/effects", { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data) setEffects(data.effects); }).catch(() => {});
    return () => controller.abort();
  }, []);

  const host = useRef<Host>({ projectId, api, openClip });
  host.current = { projectId, api, openClip };

  const saved = useMemo<Card[]>(() => {
    if (!view?.canvas) return [];
    const marks = new Map(view.marks.map(m => [m.id, m])), numbers = markNumbers(view);
    const byTemplate = new Map(effects.map(e => [templateId(e), e]));
    return view.canvas.nodes.map(card => {
      const mark = card.markId ? marks.get(card.markId) : undefined;
      return { id: card.id, type: card.kind, position: { x: card.x, y: card.y }, width: canvasCardWidth(card),
        data: { card, mark, number: mark ? numbers.get(mark.id) : undefined, asset: mark ? lookup(mark.source) : undefined, effect: card.template ? byTemplate.get(card.template.id) : undefined } };
    });
  }, [view, effects, lookup]);
  // Cards follow the saved board; while dragging, the local copy moves and the drop saves.
  const [nodes, setNodes] = useState<Card[]>(saved);
  useEffect(() => setNodes(current => saved.map(node => { const was = current.find(c => c.id === node.id); return { ...node, selected: was?.selected, measured: was?.measured?.width === node.width ? was?.measured : undefined }; })), [saved]);
  // A line leaves the side of a card facing the other card, so it never crosses its own card.
  const edges = useMemo<Edge[]>(() => {
    const at = new Map(nodes.map(node => [node.id, { x: node.position.x + (node.measured?.width ?? CANVAS_CARD_WIDTH) / 2, y: node.position.y + (node.measured?.height ?? 240) / 2 }]));
    const links = (view?.canvas?.edges ?? []).flatMap(edge => {
      const a = at.get(edge.from), b = at.get(edge.to);
      if (!a || !b) return [];
      const across = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      const [out, into] = across ? (b.x >= a.x ? [Position.Right, Position.Left] : [Position.Left, Position.Right]) : (b.y >= a.y ? [Position.Bottom, Position.Top] : [Position.Top, Position.Bottom]);
      return [{ id: edge.id, source: edge.from, target: edge.to, sourceHandle: out, targetHandle: into, label: edge.label, className: styles.canvasEdge }];
    });
    // The order line: each moment runs down into the next, the way the edit plays. Drawn, not stored.
    const moments = (view?.marks ?? []).map(mark => view?.canvas?.nodes.find(node => node.kind === "moment" && node.markId === mark.id)).filter(Boolean) as CanvasNode[];
    const order = moments.slice(1).map((next, index): Edge => ({ id: `order-${next.id}`, source: moments[index].id, target: next.id, sourceHandle: Position.Bottom, targetHandle: Position.Top,
      selectable: false, deletable: false, focusable: false, className: styles.canvasOrderEdge }));
    return [...order, ...links];
  }, [view, nodes]);

  // Selected cards become chat pills, so "these" in chat means them.
  const replaceSelectionGroup = useAgentSelection()?.replaceSelectionGroup;
  const selected = nodes.filter(node => node.selected);
  const selectedKey = selected.map(node => node.id).join(",");
  useEffect(() => {
    if (!replaceSelectionGroup) return;
    replaceSelectionGroup("storyboard-canvas", selected.map(({ data: { card, mark, number, asset } }) => {
      const label = card.kind === "moment" ? `M${number} · ${asset?.name ?? mark?.source}` : card.kind === "effect" ? card.template!.title : (card.text || "Note").slice(0, 60);
      return { id: `storyboard-canvas:${card.id}`, group: "storyboard-canvas", kind: card.kind === "moment" ? "Moment" : card.kind === "effect" ? "Effect" : "Note", label,
        agentText: `Storyboard canvas card ${card.id} (${card.kind}${card.kind === "moment" ? ` M${number}, ${mark?.source} at ${mark?.start}s` : card.kind === "effect" ? `, template ${card.template!.id}` : ""}); read storyboard_get canvas for its connections.` };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the selection is keyed by its ids
  }, [replaceSelectionGroup, selectedKey]);
  useEffect(() => () => replaceSelectionGroup?.("storyboard-canvas", []), [replaceSelectionGroup]);

  // New cards land in the middle of what the creator is looking at.
  const centre = () => {
    const box = document.querySelector(`.${styles.canvas}`)?.getBoundingClientRect();
    const point = box ? flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }) : { x: 0, y: 0 };
    // Step down and right from the middle until the card would not cover another one.
    const taken = flow.getNodes().map(node => ({ x: node.position.x, y: node.position.y, w: node.measured?.width ?? CANVAS_CARD_WIDTH, h: node.measured?.height ?? 240 }));
    let at = { x: Math.round(point.x - CANVAS_CARD_WIDTH / 2), y: Math.round(point.y - 80) };
    for (let step = 0; step < 40 && taken.some(t => at.x < t.x + t.w && at.x + CANVAS_CARD_WIDTH > t.x && at.y < t.y + t.h && at.y + 200 > t.y); step++) at = { x: at.x + 40, y: at.y + 60 };
    return at;
  };
  const addEffect = (effect: GuideEffect) => { void api.canvas.add({ kind: "effect", template: { id: templateId(effect), title: effect.title }, text: "", ...centre() }); setPicking(false); };

  if (!board) return null;
  return <HostContext.Provider value={host}><section className={styles.canvasWrap} aria-label="Storyboard canvas">
    <div className={styles.canvasToolbar} role="toolbar" aria-label="Add to canvas">
      <Button size="sm" variant="ghost" onClick={addMoment}><Clapperboard aria-hidden="true" />Moment</Button>
      <Button size="sm" variant="ghost" onClick={() => setPicking(true)}><Sparkles aria-hidden="true" />Effect</Button>
      <Button size="sm" variant="ghost" onClick={() => void api.canvas.add({ kind: "text", text: "", ...centre() })}><Type aria-hidden="true" />Note</Button>
      <Button size="sm" variant="ghost" disabled={!view?.marks.length} aria-label="Effect on every moment" title="Give every moment its own copy of an effect" onClick={() => setPickingAll(true)}><Sparkles aria-hidden="true" />Effect on every moment</Button>
      <Button size="sm" variant="ghost" aria-label="Arrange" title="Moments down the page in order, each with its cards beside it" onClick={() => void api.canvas.arrange(new Map(flow.getNodes().map(node => [node.id, node.measured?.height ?? 0])))}><Rows3 aria-hidden="true" />Arrange</Button>
      <Button size="sm" variant="ghost" onClick={() => void flow.fitView({ ...FIT, duration: 250 })}>Fit</Button>
    </div>
    <div className={styles.canvas}>
      {!saved.length && <p className={styles.canvasEmpty}>Open a clip and press M to mark a moment. Add effects and notes, then drag between cards to connect them.</p>}
      <ReactFlow<Card> nodes={nodes} edges={edges} nodeTypes={nodeTypes} defaultViewport={{ x: 24, y: 24, zoom: 0.9 }} panOnScroll zoomOnScroll={false} zoomOnPinch minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }}
        // Removals save through onDelete; every other change (moves, selection, measured size) is local until a drop.
        onNodesChange={changes => setNodes(current => applyNodeChanges(changes.filter(change => change.type !== "remove"), current))}
        onNodeDragStop={(_, __, moved) => void api.canvas.place(moved.map(node => ({ id: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) })))}
        onConnect={connection => { if (connection.source && connection.target) void api.canvas.connect(connection.source, connection.target); }}
        onDelete={({ nodes: gone, edges: cut }) => void api.canvas.remove(gone.map(node => node.id), cut.filter(edge => !edge.id.startsWith("order-")).map(edge => edge.id))}
        deleteKeyCode={["Backspace", "Delete"]} connectionRadius={30} connectionMode={ConnectionMode.Loose}>
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <EffectPicker projectId={projectId} open={picking} onOpenChange={setPicking} onPick={addEffect} actionLabel="Add to canvas" />
    <EffectPicker projectId={projectId} open={pickingAll} onOpenChange={setPickingAll} title="Add an effect to every moment" actionLabel="Add to every moment"
      onPick={effect => { void api.canvas.linkEffect(view?.marks.map(mark => mark.id) ?? [], { id: templateId(effect), title: effect.title }); setPickingAll(false); }} />
  </section></HostContext.Provider>;
}
