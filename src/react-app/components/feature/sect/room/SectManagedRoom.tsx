import {
  NpcConversation,
  RoomView,
  type RoomActorView,
} from '@app/components/feature/room';
import { useSectPresentation } from '@app/components/feature/sect/SectQueryProvider';
import { createElement, useMemo, useState } from 'react';
import type { SectNpcConversationRegistry } from './SectNpcConversationRegistry';

export interface SectManagedRoomProps {
  roomKey: string;
  registry: SectNpcConversationRegistry;
  eyebrow?: string;
  prompt?: string;
  selection?: {
    roleKey: string | undefined;
    onChange(roleKey: string | undefined): void;
  };
}

export function SectManagedRoom({
  roomKey,
  registry,
  eyebrow,
  prompt = '点击人物，与其交谈',
  selection,
}: SectManagedRoomProps) {
  const room = useSectPresentation().rooms[roomKey];
  const [internalRoleKey, setInternalRoleKey] = useState<string>();
  const selectedRoleKey = selection ? selection.roleKey : internalRoleKey;
  const setSelectedRoleKey = selection
    ? selection.onChange
    : setInternalRoleKey;
  const actors = useMemo<RoomActorView[]>(
    () =>
      room?.actors.map((actor) => ({
        id: actor.id,
        sigil: actor.sigil,
        name: actor.name,
        identity: actor.identity,
        responsibility: actor.responsibility,
      })) ?? [],
    [room],
  );
  const selectedActor = room?.actors.find(
    (actor) => actor.roleKey === selectedRoleKey,
  );

  if (!room)
    return (
      <NpcConversation
        actor={{
          sigil: '候',
          name: '当值弟子',
          identity: '当值弟子',
          responsibility: '负责接待来客。',
        }}
        messages={[
          {
            id: 'missing-room',
            speaker: '当值弟子',
            body: '此处的经办人尚未到值，请稍后再来。',
            tone: 'attention',
          },
        ]}
      />
    );

  const renderer = selectedActor
    ? registry.get(selectedActor.conversation.renderer)
    : undefined;
  if (selectedActor && !renderer)
    console.error(
      `未注册宗门 NPC 会话展示器：${selectedActor.conversation.renderer}`,
    );

  return (
    <RoomView
      eyebrow={eyebrow}
      description={room.description}
      actors={actors}
      selectedId={selectedActor?.id}
      onSelect={(actorId) => {
        const actor = room.actors.find((candidate) => candidate.id === actorId);
        if (actor) setSelectedRoleKey(actor.roleKey);
      }}
      prompt={prompt}
      detail={
        selectedActor ? (
          renderer ? (
            createElement(renderer, {
              actor: selectedActor,
              parameters: selectedActor.conversation.parameters ?? {},
              onExit: () => setSelectedRoleKey(undefined),
            })
          ) : (
            <NpcConversation
              actor={selectedActor}
              messages={[
                {
                  id: 'missing-renderer',
                  speaker: selectedActor.name,
                  body: '这项事务眼下还无法办理，请稍后再来。',
                  tone: 'attention',
                },
              ]}
              options={[
                {
                  id: 'leave',
                  label: '弟子告退',
                  tone: 'muted',
                },
              ]}
              onSelectOption={() => setSelectedRoleKey(undefined)}
            />
          )
        ) : undefined
      }
    />
  );
}
