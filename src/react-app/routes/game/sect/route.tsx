import { SectMap } from '@app/components/feature/sect/SectMap';
import {
  useSectCurrentQuery,
  useSectPresentation,
  useSectResourceQuery,
} from '@app/components/feature/sect/SectQueryProvider';
import { GameSceneFrame, GameSceneLoading } from '@app/components/game-shell';
import { formatDocumentTitle } from '@app/lib/router/routeTitle';
import { fetchSectCatalog } from '@app/lib/sect/sectClient';
import { getSectPresentation } from '@app/lib/sect/sectPresentation';
import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { SectQueryError } from './components/SectScene';

export default function SectPage() {
  const navigate = useNavigate();

  const {
    data: catalog,
    error: catalogError,
    retry,
  } = useSectResourceQuery('catalog', fetchSectCatalog);
  const current = useSectCurrentQuery();
  const currentPresentation = useSectPresentation();
  const data = current.data;
  const error = catalogError ?? current.error;

  const facilities = useMemo(
    () => new Map(data?.overview?.facilities.map((item) => [item.key, item])),
    [data?.overview?.facilities],
  );

  if (error)
    return (
      <SectQueryError
        error={error}
        retry={() => void Promise.all([retry(), current.retry()])}
      />
    );
  if (!catalog || !data)
    return (
      <GameSceneLoading message={currentPresentation.scenes.map.loadingText} />
    );

  if (!data.sect || !data.definition) {
    return <Navigate to="/game/sect/onboarding" replace />;
  }

  const presentation = getSectPresentation(data.definition.id);
  const mapScene = presentation.scenes.map;
  return (
    <GameSceneFrame
      title={`【${mapScene.title}】`}
      description={mapScene.description}
      identityOverride={{
        label: mapScene.title,
        summary: mapScene.description,
      }}
      contentClassName="lg:max-w-none"
    >
      <title>{formatDocumentTitle(mapScene.title)}</title>
      {presentation.map.image ? (
        <SectMap
          image={presentation.map.image}
          alt={presentation.map.alt}
          hotspots={presentation.map.hotspots}
          facilities={facilities}
          permissions={data.overview?.permissions}
          onNavigate={(route) => navigate(route)}
        />
      ) : (
        <div className="border-ink/15 bg-ink/10 grid gap-px border sm:grid-cols-2 lg:grid-cols-3">
          {presentation.map.hotspots.map((spot) => {
            const access = spot.permission
              ? data.overview?.permissions?.[spot.permission]
              : undefined;
            const disabled =
              spot.locked || !spot.route || access?.granted === false;
            return (
              <button
                key={spot.id}
                type="button"
                disabled={disabled}
                onClick={() => spot.route && navigate(spot.route)}
                className="bg-paper/90 min-h-24 p-4 text-left transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <strong>{spot.label}</strong>
                <p className="text-ink-secondary mt-2 text-sm">
                  {access?.granted === false ? access.reason : spot.note}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </GameSceneFrame>
  );
}
