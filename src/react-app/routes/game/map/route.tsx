import {
  MapNode,
  MapNodeDetail,
  MapSatellite,
  MapSectLandmark,
  SectLandmarkDetail,
} from '@app/components/feature/map';
import { usePlayerSession } from '@app/lib/resources/player';
import {
  getAllMapNodes,
  getAllSatelliteNodes,
  getAllSectLandmarks,
  getMapNode,
  getWorldMapLocation,
  type MapNodeInfo,
  type SectLandmark,
  type WorldMapLocation,
} from '@shared/lib/game/mapSystem';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  TransformComponent,
  TransformWrapper,
  useControls,
} from 'react-zoom-pan-pinch';
import {
  buildNodeActions,
  buildSectLandmarkActions,
  resolveMapIntent,
} from './mapActions';

const MAP_WIDTH = 3056;
const MAP_HEIGHT = 2143;

const getInitPosition = (targetNode?: WorldMapLocation | null) => {
  if (typeof window === 'undefined') return { x: -2382, y: -1224 };
  if (targetNode) {
    return {
      x: window.innerWidth * 0.5 - (MAP_WIDTH * targetNode.x) / 100,
      y: window.innerHeight * 0.45 - (MAP_HEIGHT * targetNode.y) / 100,
    };
  }

  return window.innerWidth < 768
    ? { x: -2382, y: -1224 }
    : { x: -1318, y: -1262 };
};

type ManualNodeSelection = {
  nodeId: string | null;
  requestedNodeId: string | null;
};

/** 地图缩放控件：放大 / 缩小 / 复位（须置于 TransformWrapper 内部） */
function MapZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const buttonClass =
    'border-ink/25 bg-background/90 text-ink hover:border-crimson/60 hover:text-crimson flex h-9 w-9 items-center justify-center border text-lg leading-none shadow-sm transition-colors';

  return (
    <div className="border-ink/20 bg-background/70 pointer-events-auto absolute right-3 bottom-3 z-40 flex flex-col gap-1.5 border p-1.5">
      <button
        type="button"
        aria-label="放大地图"
        title="放大"
        className={buttonClass}
        onClick={() => zoomIn(0.4)}
      >
        ＋
      </button>
      <button
        type="button"
        aria-label="缩小地图"
        title="缩小"
        className={buttonClass}
        onClick={() => zoomOut(0.4)}
      >
        －
      </button>
      <button
        type="button"
        aria-label="复位地图视图"
        title="复位"
        className={`${buttonClass} text-sm`}
        onClick={() => resetTransform(0.3)}
      >
        复位
      </button>
    </div>
  );
}

function isSectLandmark(location: WorldMapLocation): location is SectLandmark {
  return 'kind' in location && location.kind === 'sect';
}

export default function MapPage() {
  const navigate = useNavigate();
  const session = usePlayerSession();
  const activeSectId = session.data?.activeCultivator?.sectId ?? null;
  const [searchParams] = useSearchParams();
  const requestedNodeId = searchParams.get('nodeId');
  const requestedNode = requestedNodeId
    ? (getWorldMapLocation(requestedNodeId) ?? null)
    : null;
  const [manualSelection, setManualSelection] =
    useState<ManualNodeSelection | null>(null);
  const selectedNodeId =
    manualSelection?.requestedNodeId === requestedNodeId
      ? manualSelection.nodeId
      : (requestedNode?.id ?? null);
  const initPosition = getInitPosition(requestedNode);
  const intent = resolveMapIntent(searchParams.get('intent'));

  const allNodes = getAllMapNodes();
  const allSatellites = getAllSatelliteNodes();
  const allSectLandmarks = getAllSectLandmarks();
  const selectedNode: WorldMapLocation | null = selectedNodeId
    ? (getWorldMapLocation(selectedNodeId) ?? null)
    : null;

  const handleNodeClick = (id: string) => {
    setManualSelection({ nodeId: id, requestedNodeId });
  };

  const nodeContext = useMemo(() => {
    if (!selectedNode || !selectedNodeId) {
      return {
        isMainNode: false,
        marketEnabled: false,
      };
    }
    if (isSectLandmark(selectedNode)) {
      return {
        isMainNode: false,
        marketEnabled: false,
      };
    }
    const isMainNode = 'region' in selectedNode;
    return {
      isMainNode,
      marketEnabled: isMainNode && Boolean(selectedNode.market_config?.enabled),
    };
  }, [selectedNode, selectedNodeId]);

  const nodeActions = useMemo(() => {
    if (!selectedNodeId || !selectedNode || isSectLandmark(selectedNode)) {
      return [];
    }
    return buildNodeActions(
      intent,
      {
        selectedNodeId,
        isMainNode: nodeContext.isMainNode,
        marketEnabled: nodeContext.marketEnabled,
      },
      (path) => navigate(path),
    );
  }, [
    intent,
    nodeContext.isMainNode,
    nodeContext.marketEnabled,
    navigate,
    selectedNode,
    selectedNodeId,
  ]);
  const sectLandmarkActions = useMemo(() => {
    if (!selectedNode || !isSectLandmark(selectedNode)) return [];
    return buildSectLandmarkActions(
      selectedNode.sect_id,
      activeSectId,
      (path) => navigate(path),
    );
  }, [activeSectId, navigate, selectedNode]);

  return (
    <div className="relative h-full overflow-hidden">
      <div className="relative h-full w-full flex-1 cursor-grab active:cursor-grabbing">
        <TransformWrapper
          key={requestedNode?.id ?? 'default'}
          initialScale={1}
          minScale={0.5}
          maxScale={4}
          limitToBounds={false}
          initialPositionX={initPosition.x}
          initialPositionY={initPosition.y}
        >
          <TransformComponent
            wrapperClass="w-full h-full"
            contentClass="w-full h-full"
          >
            <div
              className="relative"
              style={{
                width: `${MAP_WIDTH}px`,
                height: `${MAP_HEIGHT}px`,
              }}
            >
              <div className="bgi-map absolute inset-0 opacity-80" />

              <div className="text-ink/40 pointer-events-none absolute top-[2%] left-[62%] text-6xl tracking-widest select-none">
                北荒
              </div>
              <div className="text-ink/40 writing-vertical pointer-events-none absolute top-[36%] left-[46%] text-6xl tracking-widest select-none">
                雍州
              </div>
              <div className="text-ink/40 pointer-events-none absolute top-[26%] left-[80%] text-6xl tracking-widest select-none">
                泽州
              </div>
              <div className="text-ink/40 pointer-events-none absolute top-[64%] left-[85%] text-6xl tracking-widest select-none">
                京畿
              </div>
              <div className="text-ink/40 pointer-events-none absolute top-[22%] left-[7%] rotate-6 text-6xl tracking-widest select-none">
                幽都
              </div>
              <div className="text-ink/40 pointer-events-none absolute top-[87%] left-[66%] text-6xl tracking-widest select-none">
                南疆
              </div>
              <div className="text-ink/40 pointer-events-none absolute top-[42%] left-[3%] rotate-6 text-6xl tracking-widest select-none">
                灯外海
              </div>

              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {allNodes.flatMap((node) =>
                  node.connections.map((targetId) => {
                    const target = getMapNode(targetId);
                    if (!target) return null;
                    if (node.id > targetId) return null;

                    return (
                      <line
                        key={`${node.id}-${targetId}`}
                        x1={`${node.x}%`}
                        y1={`${node.y}%`}
                        x2={`${target.x}%`}
                        y2={`${target.y}%`}
                        stroke="#2c1810"
                        strokeWidth="2"
                        strokeOpacity="0.2"
                        strokeDasharray="5,5"
                      />
                    );
                  }),
                )}
              </svg>

              {allNodes.map((node) => (
                <MapNode
                  key={node.id}
                  id={node.id}
                  name={node.name}
                  x={node.x}
                  y={node.y}
                  marketEnabled={Boolean(node.market_config?.enabled)}
                  selected={selectedNodeId === node.id}
                  onClick={handleNodeClick}
                />
              ))}

              {allSatellites.map((sat) => (
                <MapSatellite
                  key={sat.id}
                  id={sat.id}
                  name={sat.name}
                  x={sat.x}
                  y={sat.y}
                  selected={selectedNodeId === sat.id}
                  onClick={handleNodeClick}
                />
              ))}

              {allSectLandmarks.map((landmark) => (
                <MapSectLandmark
                  key={landmark.id}
                  id={landmark.id}
                  name={landmark.name}
                  x={landmark.x}
                  y={landmark.y}
                  emphasized={intent === 'sect'}
                  selected={selectedNodeId === landmark.id}
                  onClick={handleNodeClick}
                />
              ))}
            </div>
          </TransformComponent>
          <MapZoomControls />
        </TransformWrapper>
      </div>

      {selectedNode && isSectLandmark(selectedNode) ? (
        <SectLandmarkDetail
          landmark={selectedNode}
          onClose={() => setManualSelection({ nodeId: null, requestedNodeId })}
          actions={sectLandmarkActions}
        />
      ) : selectedNode ? (
        <MapNodeDetail
          node={selectedNode as MapNodeInfo}
          onClose={() => setManualSelection({ nodeId: null, requestedNodeId })}
          actions={nodeActions}
        />
      ) : null}
    </div>
  );
}
