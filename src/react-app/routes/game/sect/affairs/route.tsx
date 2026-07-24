import { useSectResourceQuery } from '@app/components/feature/sect/SectQueryProvider';
import { SectTaskDetailDialog } from '@app/components/feature/sect/SectTaskDetailDialog';
import { SectTaskInteractionProvider } from '@app/components/feature/sect/SectTaskInteractionProvider';
import { SectTaskOutcomeHost } from '@app/components/feature/sect/SectTaskOutcomeHost';
import { fetchSectTasks } from '@app/lib/sect/sectClient';
import {
  SectPageLoading,
  SectPermissionBoundary,
  SectQueryError,
  SectScene,
} from '@app/routes/game/sect/components/SectScene';
import type { SectTaskViewData } from '@shared/contracts/sect';
import { useMemo, useState } from 'react';
import { SectTaskNoticeBoard } from './components/SectTaskNoticeBoard';
import { sortSectTaskNotices } from './sectTaskNoticeModel';

export default function SectAffairsPage() {
  return (
    <SectPermissionBoundary permission="sect.tasks.use" sceneKey="affairs">
      <SectAffairsBody />
    </SectPermissionBoundary>
  );
}

function SectAffairsBody() {
  const {
    data: tasks,
    error,
    reload,
    retry,
  } = useSectResourceQuery('tasks', fetchSectTasks);
  const [selectedId, setSelectedId] = useState<string>();
  const notices = useMemo(
    () => sortSectTaskNotices(tasks?.items ?? []),
    [tasks?.items],
  );
  const selected = notices.find(
    (task) => `${task.periodKey}:${task.definitionId}` === selectedId,
  );

  if (error) return <SectQueryError error={error} retry={() => void retry()} />;
  if (!tasks) return <SectPageLoading sceneKey="affairs" />;

  return (
    <SectTaskInteractionProvider refreshTasks={reload}>
      <SectScene
        sceneKey="affairs"
        mood="affairs"
        aside={
          <p className="text-sm leading-7">
            告示随日月更替，揭榜、交卷与领赏皆在此处办理。
          </p>
        }
      >
        <SectTaskNoticeBoard
          tasks={notices}
          onOpen={(task: SectTaskViewData) =>
            setSelectedId(`${task.periodKey}:${task.definitionId}`)
          }
        />
        <SectTaskDetailDialog
          task={selected}
          onClose={() => setSelectedId(undefined)}
        />
        <SectTaskOutcomeHost />
      </SectScene>
    </SectTaskInteractionProvider>
  );
}
