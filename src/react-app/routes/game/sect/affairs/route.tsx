import { useSectResourceQuery } from '@app/components/feature/sect/SectQueryProvider';
import { SectTaskInteractionProvider } from '@app/components/feature/sect/SectTaskInteractionProvider';
import { fetchSectTasks } from '@app/lib/sect/sectClient';
import {
  SectPermissionBoundary,
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
  const { reload } = useSectResourceQuery('tasks', fetchSectTasks);

  return (
    <SectTaskInteractionProvider refreshTasks={reload}>
      <SectScene sceneKey="affairs" mood="affairs">
        <SectAffairsRoom />
      </SectScene>
    </SectTaskInteractionProvider>
  );
}
