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
  SectNpcConversationRegistry,
  SectRoutedRoom,
  type SectNpcConversationRendererProps,
} from '@app/components/feature/sect/room';
import { fetchSectTasks } from '@app/lib/sect/sectClient';
import { STANDARD_SECT_PRESENTATION } from '@shared/engine/sect';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SectPermissionBoundary, SectScene } from '../components/SectScene';
import {
  resolveSweepActivityMode,
  sweepActivityMessage,
} from './sweep/sweepActivityState';
import { requestSweepImmersiveMode } from './sweep/sweepImmersive';

const registry = new SectNpcConversationRegistry([
  { key: 'sect.gate.duties', renderer: GateConversation },
]).assertRoom(STANDARD_SECT_PRESENTATION.rooms.gate);

export default function SectGatePage() {
  return (
    <SectPermissionBoundary permission="sect.gate.view" sceneKey="gate">
      <SectScene sceneKey="gate" mood="gate">
        <SectRoutedRoom
          roomKey="gate"
          registry={registry}
          eyebrow="山门值录 · 当日勤务"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}

function GateConversation({ actor, onExit }: SectNpcConversationRendererProps) {
  const current = useSectCurrentQuery();
  const tasks = useSectResourceQuery('tasks', fetchSectTasks);
  const navigate = useNavigate();
  const [showNews, setShowNews] = useState(false);
  const [entering, setEntering] = useState(false);
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: { current: current.data, tasks: tasks.data },
    load: async () => {
      await Promise.all([current.reload(), tasks.reload()]);
    },
    perform: async () => undefined,
    onReset: () => {
      setShowNews(false);
      setEntering(false);
    },
  });
  const mode = resolveSweepActivityMode(tasks.data);
  const project = current.data?.overview?.project;
  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actor.name, body: actor.greeting },
    {
      id: 'sweep',
      speaker: actor.name,
      body: sweepActivityMessage(mode),
    },
  ];
  if (showNews)
    messages.push({
      id: 'news',
      speaker: actor.name,
      body: project
        ? `今日山门内外无事，公共工程正在推进${project.targetLevel}级设施，已经积累${project.progress}点建设进度。`
        : '今日山门内外无事，宗门工程尚在议定。',
    });
  const options: NpcConversationOption[] = [
    {
      id: 'sweep',
      label:
        mode.kind === 'reward'
          ? '弟子这就开始今日勤务'
          : '弟子想再练一遍山门洒扫',
      tone: mode.kind === 'reward' ? 'primary' : 'normal',
      disabled: entering,
    },
    { id: 'news', label: '请执事说说今日山门动静' },
    { id: 'leave', label: '弟子告退', tone: 'muted' },
  ];
  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={options}
      busy={session.phase === 'loading' || entering}
      error={session.error ?? current.error ?? tasks.error}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (optionId === 'news') setShowNews(true);
        else if (optionId === 'sweep') {
          setEntering(true);
          void requestSweepImmersiveMode().then(() =>
            navigate('/game/sect/gate/sweep'),
          );
        }
      }}
    />
  );
}
