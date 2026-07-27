import {
  NpcConversation,
  useConversationSession,
  type NpcConversationMessage,
} from '@app/components/feature/room';
import { useSectCurrentQuery } from '@app/components/feature/sect/SectQueryProvider';
import {
  SectManagedRoom,
  SectNpcConversationRegistry,
  type SectNpcConversationRendererProps,
} from '@app/components/feature/sect/room';
import { InkButton } from '@app/components/ui';
import { useActiveCultivatorProfile } from '@app/lib/player-state/selectors';
import { useState } from 'react';
import { MethodsTab } from '../components/MethodsTab';
import {
  SectPermissionBoundary,
  SectScene,
  useSectMutation,
} from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  { key: 'sect.archive.methods', renderer: ArchiveConversation },
]);

export default function SectArchivePage() {
  return (
    <SectPermissionBoundary permission="sect.archive.use" sceneKey="archive">
      <SectScene sceneKey="archive" mood="archive">
        <SectManagedRoom
          roomKey="archive"
          registry={registry}
          eyebrow="传承经卷 · 研习次第"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}

function ArchiveConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const current = useSectCurrentQuery();
  const cultivator = useActiveCultivatorProfile();
  const mutation = useSectMutation(current.reload);
  const [topic, setTopic] = useState<'limit' | 'workspace'>();
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: current.data,
    load: current.reload,
    perform: async () => undefined,
    onReset: () => setTopic(undefined),
  });
  const data = current.data;
  if (topic === 'workspace' && data)
    return (
      <div className="min-h-[34rem] px-5 py-7 sm:px-8 md:px-10">
        <div className="mb-5 flex justify-end border-b border-current/10 pb-4">
          <InkButton
            onClick={() => {
              setTopic(undefined);
              void session.reload();
            }}
          >
            合上经卷
          </InkButton>
        </div>
        <MethodsTab
          data={data}
          busy={mutation.busy}
          action={async (url, init) => {
            await mutation.run(url, init, '心法研习完成');
          }}
          realm={cultivator?.realm ?? '炼气'}
        />
      </div>
    );
  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actor.name, body: actor.greeting },
  ];
  if (data?.definition)
    messages.push({
      id: 'catalog',
      speaker: actor.name,
      body: `阁中现有${data.definition.methods.map((method) => `${method.name}`).join('、')}，都可逐卷查问。`,
    });
  if (topic === 'limit' && data)
    messages.push({
      id: 'limit',
      speaker: actor.name,
      body: (
        <>
          你当前最多可将宗门心法研习至
          <span className="text-crimson font-medium">
            {data.methodLevelCap}级
          </span>
          ，其中境界所允许的上限是
          {data.overview?.realmMethodLevelCap ?? data.methodLevelCap}级。
          若经卷、身份或境界有所不足，展开经卷时会逐项说明。
        </>
      ),
    });
  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={[
        { id: 'limit', label: '请长老说说我当前的研习上限' },
        { id: 'workspace', label: '弟子想展开经卷研习' },
        { id: 'leave', label: '弟子告退', tone: 'muted' },
      ]}
      busy={session.phase === 'loading'}
      error={session.error ?? current.error}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (optionId === 'limit' || optionId === 'workspace')
          setTopic(optionId);
      }}
    />
  );
}
