import {
  NpcConversation,
  useConversationSession,
  type NpcConversationMessage,
  type NpcConversationOption,
} from '@app/components/feature/room';
import {
  useSectCurrentQuery,
  useSectResourceQuery,
} from '@app/components/feature/sect/SectQueryProvider';
import {
  SectManagedRoom,
  SectNpcConversationRegistry,
  type SectNpcConversationRendererProps,
} from '@app/components/feature/sect/room';
import { InkButton } from '@app/components/ui';
import { usePlayerStateActions } from '@app/lib/player-state/store';
import { fetchSectMembers } from '@app/lib/sect/sectClient';
import type { SectMembersData } from '@shared/contracts/sect';
import { SECT_RANK_LABELS } from '@shared/engine/sect';
import { useState } from 'react';
import {
  postJson,
  SectPermissionBoundary,
  SectScene,
} from '../components/SectScene';

const fetchFirstMembersPage = (signal: AbortSignal) =>
  fetchSectMembers(1, 20, signal);

const registry = new SectNpcConversationRegistry([
  { key: 'sect.hall.registry', renderer: HallRegistryConversation },
  { key: 'sect.hall.stipend', renderer: HallStipendConversation },
]);

export default function SectHallPage() {
  return (
    <SectPermissionBoundary permission="sect.hall.view" sceneKey="hall">
      <SectScene sceneKey="hall" mood="hall">
        <SectManagedRoom
          roomKey="hall"
          registry={registry}
          eyebrow="身份玉牒 · 俸册名录"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}

function HallRegistryConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const current = useSectCurrentQuery();
  const members = useSectResourceQuery('members:1:20', fetchFirstMembersPage);
  const [topic, setTopic] = useState<'identity' | 'members'>();
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: { current: current.data, members: members.data },
    load: async () => {
      await Promise.all([current.reload(), members.reload()]);
    },
    perform: async () => undefined,
    onReset: () => setTopic(undefined),
  });
  const sect = current.data?.sect;

  if (topic === 'members' && members.data)
    return (
      <MemberRegistryWorkspace
        members={members.data}
        onBack={() => {
          setTopic(undefined);
          void session.reload();
        }}
      />
    );

  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actor.name, body: actor.greeting },
  ];
  if (topic === 'identity' && sect) {
    const rank = sect.discipleRank ?? 'registered';
    messages.push({
      id: 'identity',
      speaker: actor.name,
      body: (
        <>
          玉牒上记的是
          <span className="text-crimson font-medium">
            {SECT_RANK_LABELS[rank]}
          </span>
          ，功簿尚余
          <span className="text-crimson font-medium">
            {sect.contribution.toLocaleString('zh-CN')}点贡献
          </span>
          。若要问晋升条件或正式晋升，去事务堂请教传功长老即可。
        </>
      ),
    });
  }
  const options: NpcConversationOption[] = [
    { id: 'identity', label: '请执事替我查验身份玉牒' },
    { id: 'members', label: '我想翻看同门名录' },
    { id: 'leave', label: '弟子告退', tone: 'muted' },
  ];
  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={options}
      busy={session.phase === 'loading'}
      error={session.error ?? current.error ?? members.error}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (optionId === 'identity' || optionId === 'members')
          setTopic(optionId);
      }}
    />
  );
}

function MemberRegistryWorkspace({
  members,
  onBack,
}: {
  members: SectMembersData;
  onBack(): void;
}) {
  return (
    <div className="min-h-[34rem] px-5 py-7 sm:px-8 md:px-10">
      <div className="flex items-center justify-between gap-3 border-b border-current/10 pb-4">
        <p className="text-ink-secondary text-sm">
          同门名录 · 共 {members.total} 人
        </p>
        <InkButton onClick={onBack}>合上名录</InkButton>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-ink/20 border-b">
            <tr>
              <th className="p-2">名号</th>
              <th className="p-2">境界</th>
              <th className="p-2">身份</th>
              <th className="p-2">职务</th>
            </tr>
          </thead>
          <tbody>
            {members.items.map((member) => (
              <tr key={member.cultivatorId} className="border-ink/10 border-b">
                <td className="p-2 font-semibold">{member.name}</td>
                <td className="p-2">
                  {member.realm}
                  {member.realmStage}
                </td>
                <td className="p-2">{SECT_RANK_LABELS[member.discipleRank]}</td>
                <td className="p-2">
                  {member.office === 'none' ? '无' : member.office}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HallStipendConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const current = useSectCurrentQuery();
  const { mutate } = usePlayerStateActions();
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: current.data,
    load: async () => {
      await current.reload();
    },
    perform: async ({ intent }: { intent: 'claim'; signal: AbortSignal }) => {
      if (intent !== 'claim') return undefined;
      await mutate(fetch('/api/sects/current/stipend/claim', postJson()));
      await current.reload();
      return 'claimed' as const;
    },
  });
  const stipend = current.data?.overview?.stipend;
  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actor.name, body: actor.greeting },
  ];
  if (stipend) {
    messages.push({
      id: 'stipend',
      speaker: actor.name,
      body: stipend.claimed ? (
        session.result === 'claimed' ? (
          <>
            本周周俸已经入账，实际领取
            <span className="text-crimson font-medium">
              {stipend.spiritStones.toLocaleString('zh-CN')}枚灵石
            </span>
            {stipend.rewards
              .filter((reward) => reward.kind !== 'sect.reward.spirit-stones')
              .map((reward) => `，${reward.summary}`)
              .join('')}
            。
          </>
        ) : (
          '本周周俸已经入账，俸册上没有欠项。'
        )
      ) : (
        <>
          本周应发
          <span className="text-crimson font-medium">
            {stipend.spiritStones.toLocaleString('zh-CN')}枚灵石
          </span>
          {stipend.rewards
            .filter((reward) => reward.kind !== 'sect.reward.spirit-stones')
            .map((reward) => `，${reward.summary}`)
            .join('')}
          。核对无误便可领取。
        </>
      ),
      tone: session.result === 'claimed' ? 'attention' : 'normal',
    });
  }
  const options: NpcConversationOption[] = [
    ...(!stipend?.claimed
      ? [{ id: 'claim', label: '有劳执事将本周俸禄入账' }]
      : []),
    { id: 'leave', label: '弟子告退', tone: 'muted' as const },
  ];
  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={options}
      busy={session.phase === 'loading' || session.phase === 'submitting'}
      error={session.error ?? current.error}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (optionId === 'claim') void session.dispatch('claim');
      }}
    />
  );
}
