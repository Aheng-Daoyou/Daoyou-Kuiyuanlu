import { useSectResourceQuery } from '@app/components/feature/sect/SectQueryProvider';
import { SectTaskInteractionProvider } from '@app/components/feature/sect/SectTaskInteractionProvider';
import { fetchSectTasks } from '@app/lib/sect/sectClient';
import {
  SectPageLoading,
  SectPermissionBoundary,
  SectQueryError,
  SectScene,
} from '@app/routes/game/sect/components/SectScene';
import { SectAffairsRoom } from './components/SectAffairsRoom';

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

  if (error) return <SectQueryError error={error} retry={() => void retry()} />;
  if (!tasks) return <SectPageLoading sceneKey="affairs" />;

  return (
    <SectTaskInteractionProvider refreshTasks={reload}>
      <SectScene sceneKey="affairs" mood="affairs">
        <SectAffairsRoom tasks={tasks.items} />
      </SectScene>
    </SectTaskInteractionProvider>
  );
}
