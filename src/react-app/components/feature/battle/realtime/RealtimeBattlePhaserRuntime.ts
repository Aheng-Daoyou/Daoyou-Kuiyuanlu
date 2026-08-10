import type {
  CombatControlVisual,
  CombatImpactCue,
  CombatVisualActionInput,
  CombatVisualFact,
  CombatVisualSpec,
  CombatVisualTimeline,
} from '@shared/engine/battle-v5/presentation';
import type {
  BattlePresentationEntityV1,
  BattlePresentationSnapshotV1,
  BattlePresentationTeamV1,
} from '@shared/online-battle/BattlePresentation';
import * as Phaser from 'phaser';
import { realtimeBattleResourceAsset } from './realtimeBattleResourceAssets';

type RealtimeBattleEntity = BattlePresentationEntityV1;
type RealtimeBattleSnapshot = BattlePresentationSnapshotV1;
type RealtimeBattleTeam = BattlePresentationTeamV1;

type BattleStageProfile = 'portrait' | 'compact-landscape' | 'wide';

interface StageSize {
  width: number;
  height: number;
  profile: BattleStageProfile;
}

interface StageSafeBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const PORTRAIT_STAGE: StageSize = {
  width: 720,
  height: 1080,
  profile: 'portrait',
};
const COMPACT_LANDSCAPE_STAGE: StageSize = {
  width: 1200,
  height: 800,
  profile: 'compact-landscape',
};
const WIDE_STAGE: StageSize = {
  width: 1440,
  height: 810,
  profile: 'wide',
};
const FONT_FAMILY = 'LXGWWenKai, serif';
const TEXT_OUTLINE_COLOR = '#eee7d6';
const UNIT_CORE_TEXTURE = 'realtime-unit-core';
const UNIT_VITAL_FRAME_TEXTURE = 'realtime-unit-vital-frame';
const UNIT_SHIELD_TEXTURE = 'realtime-unit-shield';

function outlinedText(strokeThickness: number) {
  return {
    stroke: TEXT_OUTLINE_COLOR,
    strokeThickness,
  };
}

type FormationPoint = { x: number; y: number };

interface FormationRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const FORMATION_OWNER_ORDER = [
  'sikong-ye',
  'shen-yanqiu',
  'gu-tingchuan',
  'qing-li',
  'xie-wujiu',
  'lu-xingzhou',
];

interface RealtimeBattlePhaserArguments {
  root: HTMLElement;
  initialSnapshot: RealtimeBattleSnapshot;
  onState: (snapshot: RealtimeBattleSnapshot) => void;
  onFocus: (entityId: string) => void;
}

export interface RealtimeBattlePhaserController {
  syncSnapshot: (snapshot: RealtimeBattleSnapshot) => void;
  playTimeline: (timeline: CombatVisualTimeline, offsetMs?: number) => void;
  focus: (entityId: string) => void;
  setCommandSelection: (state: {
    actorUnitId?: string;
    legalTargetIds: readonly string[];
    lockedUnitIds: readonly string[];
    submitting: boolean;
  }) => void;
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: number) => void;
  destroy: () => void;
}

interface EntityVisual {
  container: Phaser.GameObjects.Container;
  selection: Phaser.GameObjects.Arc;
  actorSelection: Phaser.GameObjects.Arc;
  targetSelection: Phaser.GameObjects.Arc;
  commandStateText: Phaser.GameObjects.Text;
  vitalRings: Phaser.GameObjects.Graphics;
  shieldArt: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  resourceDom: Phaser.GameObjects.DOMElement;
  resourceNode: HTMLDivElement;
  combatResourceSteady: HTMLDivElement;
  combatResourcePips: HTMLDivElement;
  combatResourceDelta: HTMLDivElement;
  combatResourceDeltaIcon: HTMLImageElement;
  combatResourceDeltaValue: HTMLSpanElement;
  actionStateText: Phaser.GameObjects.Text;
  buffText: Phaser.GameObjects.Text;
  debuffText: Phaser.GameObjects.Text;
  nameControlFx: Phaser.GameObjects.Graphics;
  controlMode?: CombatControlVisual;
  isPet: boolean;
  baseRadius: number;
  radius: number;
}

interface ResourceCueState {
  actionId: string;
  hideTimer?: Phaser.Time.TimerEvent;
}

interface QueuedImpactCue {
  cue: CombatImpactCue;
  action: CombatVisualActionInput;
}

function visualColor(visual: CombatVisualSpec) {
  const elementColors: Partial<
    Record<NonNullable<CombatVisualSpec['element']>, number>
  > = {
    fire: 0xa43c2d,
    water: 0x356f80,
    wood: 0x3d8063,
    metal: 0x8b4a50,
    earth: 0x8a682c,
    wind: 0x477768,
    ice: 0x4d7988,
    thunder: 0x665795,
  };
  if (visual.element && visual.element !== 'none') {
    return elementColors[visual.element] ?? 0x356f80;
  }
  if (visual.discipline === 'true') return 0x74517f;
  if (visual.discipline === 'physical') return 0x982d38;
  if (visual.impact === 'heal') return 0x3d8063;
  if (visual.impact === 'shield') return 0xa87918;
  return 0x356f80;
}

function colorHex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function damageColor(
  damageType: Extract<CombatImpactCue, { kind: 'damage' }>['damageType'],
) {
  switch (damageType) {
    case 'physical':
      return 0x9c2f3b;
    case 'magical':
      return 0x28758d;
    case 'true':
      return 0x74517f;
    case 'dot':
      return 0x7f405d;
  }
}

function selectStage(width: number, height: number): StageSize {
  const aspect = width / Math.max(height, 1);
  if (aspect < 0.9) return { ...PORTRAIT_STAGE };
  if (height < 680 || aspect < 1.55) return { ...COMPACT_LANDSCAPE_STAGE };
  return { ...WIDE_STAGE };
}

function stageSafeBounds(stage: StageSize): StageSafeBounds {
  const portrait = stage.profile === 'portrait';
  const compact = stage.profile === 'compact-landscape';
  const sideRatio = portrait ? 0.07 : compact ? 0.055 : 0.05;
  const topRatio = portrait ? 0.145 : compact ? 0.14 : 0.13;
  const bottomRatio = portrait ? 0.26 : compact ? 0.27 : 0.235;
  return {
    left: stage.width * sideRatio,
    right: stage.width * (1 - sideRatio),
    top: stage.height * topRatio,
    bottom: stage.height * (1 - bottomRatio),
  };
}

function formationRadius(
  entity: RealtimeBattleEntity,
  stage: StageSize,
  teamSize: number,
) {
  const base =
    stage.profile === 'portrait'
      ? 58
      : stage.profile === 'compact-landscape'
        ? 66
        : 76;
  const rosterScale = teamSize <= 1 ? 1.18 : teamSize === 2 ? 1.1 : 1;
  const cultivatorRadius = base * rosterScale;
  return entity.kind === 'spirit-pet'
    ? Math.round(cultivatorRadius * 0.68)
    : Math.round(cultivatorRadius);
}

function formationBackY(team: RealtimeBattleTeam, stage: StageSize) {
  const safe = stageSafeBounds(stage);
  const available = safe.bottom - safe.top;
  const teamRatio = team === 'enemies' ? 0.2 : 0.8;
  return safe.top + available * teamRatio;
}

function formationPetOffset(team: RealtimeBattleTeam, stage: StageSize) {
  const distance =
    stage.profile === 'portrait'
      ? 116
      : stage.profile === 'compact-landscape'
        ? 126
        : 142;
  const angle = (35 * Math.PI) / 180;
  const frontDirection = team === 'enemies' ? 1 : -1;
  const sideDirection = team === 'enemies' ? 1 : -1;
  return {
    x: sideDirection * Math.sin(angle) * distance,
    y: frontDirection * Math.cos(angle) * distance,
  };
}

function formationSlotX(slot: number, count: number, stage: StageSize) {
  const safe = stageSafeBounds(stage);
  const center = (safe.left + safe.right) / 2;
  if (count <= 1) return center;
  const widthRatio = count === 2 ? 0.34 : count === 3 ? 0.58 : 0.7;
  const span = (safe.right - safe.left) * widthRatio;
  return center - span / 2 + (span * slot) / (count - 1);
}

function formationVisualRects(
  entity: RealtimeBattleEntity,
  point: FormationPoint,
  stage: StageSize,
  teamSize: number,
): FormationRect[] {
  const radius = formationRadius(entity, stage, teamSize);
  const isPet = entity.kind === 'spirit-pet';
  const bodyPadding = isPet ? 22 : 30;
  const upperHalfWidth = isPet ? Math.max(78, radius) : Math.max(112, radius);
  const lowerHalfWidth = isPet ? Math.max(62, radius) : Math.max(104, radius);
  return [
    {
      left: point.x - radius - bodyPadding,
      right: point.x + radius + bodyPadding,
      top: point.y - radius - bodyPadding,
      bottom: point.y + radius + bodyPadding,
    },
    {
      left: point.x - upperHalfWidth,
      right: point.x + upperHalfWidth,
      top: point.y - radius - (isPet ? 78 : 102),
      bottom: point.y - radius + 4,
    },
    {
      left: point.x - lowerHalfWidth,
      right: point.x + lowerHalfWidth,
      top: point.y + radius + 2,
      bottom: point.y + radius + (isPet ? 82 : 100),
    },
  ];
}

function formationRectsOverlap(
  left: FormationRect,
  right: FormationRect,
  gap: number,
) {
  return !(
    left.right + gap <= right.left ||
    right.right + gap <= left.left ||
    left.bottom + gap <= right.top ||
    right.bottom + gap <= left.top
  );
}

function formationIsReadable(
  entities: readonly RealtimeBattleEntity[],
  positions: ReadonlyMap<string, FormationPoint>,
  stage: StageSize,
) {
  const safe = stageSafeBounds(stage);
  const teamSizes = new Map<RealtimeBattleTeam, number>();
  const rectsByTeam = new Map<RealtimeBattleTeam, FormationRect[]>();
  for (const team of ['enemies', 'allies'] as const) {
    teamSizes.set(
      team,
      entities.filter(
        (entity) => entity.team === team && entity.kind === 'cultivator',
      ).length,
    );
    rectsByTeam.set(team, []);
  }
  for (const entity of entities) {
    const point = positions.get(entity.id);
    if (!point) continue;
    const rects = formationVisualRects(
      entity,
      point,
      stage,
      teamSizes.get(entity.team) ?? 1,
    );
    if (
      rects.some((rect) => rect.left < safe.left || rect.right > safe.right)
    ) {
      return false;
    }
    rectsByTeam.get(entity.team)?.push(...rects);
  }
  const enemies = rectsByTeam.get('enemies') ?? [];
  const allies = rectsByTeam.get('allies') ?? [];
  const readabilityGap = stage.profile === 'wide' ? 18 : 14;
  return !enemies.some((enemy) =>
    allies.some((ally) => formationRectsOverlap(enemy, ally, readabilityGap)),
  );
}

function projectFormation(
  entities: readonly RealtimeBattleEntity[],
  stage: StageSize,
) {
  const groupsByTeam = new Map<
    RealtimeBattleTeam,
    Array<{ owner?: RealtimeBattleEntity; pet?: RealtimeBattleEntity }>
  >();
  for (const team of ['enemies', 'allies'] as const) {
    const teamEntities = entities.filter((entity) => entity.team === team);
    const owners = teamEntities
      .filter((entity) => entity.kind === 'cultivator')
      .sort(
        (left, right) =>
          (left.slot ?? FORMATION_OWNER_ORDER.indexOf(left.id)) -
          (right.slot ?? FORMATION_OWNER_ORDER.indexOf(right.id)),
      )
      .slice(0, 4);
    const ownerIds = new Set(owners.map((owner) => owner.id));
    const groups: Array<{
      owner?: RealtimeBattleEntity;
      pet?: RealtimeBattleEntity;
    }> = owners.map((owner) => ({
      owner,
      pet: teamEntities.find((entity) => entity.ownerId === owner.id),
    }));
    const unownedPets = teamEntities.filter(
      (entity) =>
        entity.kind === 'spirit-pet' &&
        (!entity.ownerId || !ownerIds.has(entity.ownerId)),
    );
    groups.push(
      ...unownedPets
        .slice(0, Math.max(0, 4 - groups.length))
        .map((pet) => ({ owner: undefined, pet })),
    );

    groupsByTeam.set(team, groups);
  }

  const maxGroupCount = Math.max(
    1,
    groupsByTeam.get('enemies')?.length ?? 0,
    groupsByTeam.get('allies')?.length ?? 0,
  );
  const safe = stageSafeBounds(stage);
  const formationSpanRatio =
    maxGroupCount === 2 ? 0.34 : maxGroupCount === 3 ? 0.58 : 0.7;
  const slotGap =
    maxGroupCount <= 1
      ? stage.width * 0.28
      : ((safe.right - safe.left) * formationSpanRatio) / (maxGroupCount - 1);
  const staggerDistance =
    maxGroupCount <= 1 ? slotGap : Math.min(slotGap * 0.55, stage.width * 0.14);

  const positionsForStagger = (stagger: number) => {
    const positions = new Map<string, FormationPoint>();
    for (const team of ['enemies', 'allies'] as const) {
      const groups = groupsByTeam.get(team) ?? [];
      const backY = formationBackY(team, stage);
      const petOffset = formationPetOffset(team, stage);
      const teamOffset = team === 'enemies' ? stagger / 2 : -stagger / 2;
      groups.forEach(({ owner, pet }, slot) => {
        const x = formationSlotX(slot, groups.length, stage) + teamOffset;
        if (owner) positions.set(owner.id, { x, y: backY });
        if (pet) {
          positions.set(pet.id, {
            x: x + petOffset.x,
            y: backY + petOffset.y,
          });
        }
      });
    }
    return positions;
  };

  const candidates = [0, staggerDistance, -staggerDistance];
  for (const stagger of candidates) {
    const positions = positionsForStagger(stagger);
    if (formationIsReadable(entities, positions, stage)) return positions;
  }
  return positionsForStagger(staggerDistance);
}

export function attachRealtimeBattlePhaser(
  args: RealtimeBattlePhaserArguments,
): RealtimeBattlePhaserController {
  let stage = selectStage(args.root.clientWidth, args.root.clientHeight);
  const fittedCssScale = Math.min(
    args.root.clientWidth / stage.width,
    args.root.clientHeight / stage.height,
  );
  const renderScale = Phaser.Math.Clamp(
    (window.devicePixelRatio || 1) * Math.max(1, fittedCssScale),
    1,
    2,
  );
  let scene: RealtimeBattleScene | undefined;
  let currentSnapshot = args.initialSnapshot;
  let paused = false;
  let speed = 1;
  let destroyed = false;
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  let formationPositions = projectFormation(currentSnapshot.entities, stage);

  const registerScene = (nextScene: RealtimeBattleScene) => {
    scene = nextScene;
  };

  class RealtimeBattleScene extends Phaser.Scene {
    private visuals = new Map<string, EntityVisual>();
    private castLabels = new Map<string, Phaser.GameObjects.Text>();
    private resourceCues = new Map<string, ResourceCueState>();
    private impactQueues = new Map<string, QueuedImpactCue[]>();
    private activeImpactTargets = new Set<string>();
    private legalTargetIds = new Set<string>();
    private lockedUnitIds = new Set<string>();
    private actorUnitId: string | undefined;
    private commandSubmitting = false;
    private activeTimelineActionIds = new Set<string>();
    private pendingStage?: StageSize;
    private formation?: Phaser.GameObjects.Graphics;

    preload() {
      this.load.image(
        UNIT_CORE_TEXTURE,
        '/assets/battle/realtime/ui/unit/core-disc.png',
      );
      this.load.image(
        UNIT_VITAL_FRAME_TEXTURE,
        '/assets/battle/realtime/ui/unit/vital-ring-frame.png',
      );
      this.load.image(
        UNIT_SHIELD_TEXTURE,
        '/assets/battle/realtime/ui/unit/shield-aegis.png',
      );
    }

    create() {
      registerScene(this);
      this.cameras.main
        .setZoom(renderScale)
        .centerOn(stage.width / 2, stage.height / 2);
      this.createFormationInk();
      for (const entity of currentSnapshot.entities) {
        this.createEntity(entity);
      }
      this.renderSnapshot(currentSnapshot);
      this.game.canvas.setAttribute(
        'aria-label',
        '多人实时字阵战场。点击文字单位选择目标，使用下方文字指令施展招式。',
      );
      this.game.canvas.setAttribute('role', 'application');
      args.onState(currentSnapshot);
    }

    setPlaybackState(nextPaused: boolean, nextSpeed: number) {
      this.time.paused = nextPaused;
      this.time.timeScale = nextSpeed;
      this.tweens.paused = nextPaused;
      this.tweens.timeScale = nextSpeed;
    }

    setCommandSelection(state: {
      actorUnitId?: string;
      legalTargetIds: readonly string[];
      lockedUnitIds: readonly string[];
      submitting: boolean;
    }) {
      this.actorUnitId = state.actorUnitId;
      this.legalTargetIds = new Set(state.legalTargetIds);
      this.lockedUnitIds = new Set(state.lockedUnitIds);
      this.commandSubmitting = state.submitting;
      this.renderSnapshot(currentSnapshot);
    }

    relayout(nextStage: StageSize) {
      stage = nextStage;
      formationPositions = projectFormation(currentSnapshot.entities, stage);
      this.scale.setGameSize(
        Math.round(stage.width * renderScale),
        Math.round(stage.height * renderScale),
      );
      this.cameras.main
        .setZoom(renderScale)
        .centerOn(stage.width / 2, stage.height / 2);
      this.createFormationInk();

      const teamSizes = new Map<RealtimeBattleTeam, number>();
      for (const team of ['allies', 'enemies'] as const) {
        teamSizes.set(
          team,
          currentSnapshot.entities.filter(
            (entity) => entity.team === team && entity.kind === 'cultivator',
          ).length,
        );
      }
      for (const entity of currentSnapshot.entities) {
        const visual = this.visuals.get(entity.id);
        const position = formationPositions.get(entity.id);
        if (!visual || !position) continue;
        const radius = formationRadius(
          entity,
          stage,
          teamSizes.get(entity.team) ?? 1,
        );
        const presentationScale = radius / visual.baseRadius;
        visual.radius = radius;
        visual.container
          .setPosition(position.x, position.y)
          .setScale(presentationScale);
        visual.resourceDom
          .setScale(presentationScale)
          .setPosition(
            position.x,
            position.y + radius + (visual.isPet ? 12 : 16),
          );
      }
      this.renderSnapshot(currentSnapshot);
    }

    requestRelayout(nextStage: StageSize) {
      if (this.activeTimelineActionIds.size > 0) {
        this.pendingStage = nextStage;
        return;
      }
      this.relayout(nextStage);
    }

    playTimeline(timeline: CombatVisualTimeline, offsetMs = 0) {
      const pendingCommands = timeline.commands.filter(
        (command) => command.at + command.duration > offsetMs,
      );
      if (pendingCommands.some((command) => command.kind === 'settle')) {
        this.activeTimelineActionIds.add(timeline.action.id);
      }
      for (const command of pendingCommands) {
        this.time.delayedCall(Math.max(0, command.at - offsetMs), () => {
          if (!this.sys.isActive()) return;
          if (command.kind === 'cast') this.playCast(timeline.action);
          if (command.kind === 'delivery') {
            this.playDelivery(
              timeline.action,
              command.duration,
              command.impactAt - command.at,
            );
          }
          if (command.kind === 'reaction') {
            this.playReaction(command.fact, timeline.action);
          }
          if (command.kind === 'resolve') {
            this.playFact(command.fact, timeline.action);
          }
          if (command.kind === 'impact_cue') {
            this.enqueueImpactCue(command.cue, timeline.action);
          }
          if (command.kind === 'settle') this.settleAction(timeline.action);
        });
      }
    }

    private playCast(action: CombatVisualActionInput) {
      const source = this.visuals.get(action.sourceId);
      if (!source) return;
      const color = visualColor(action.visual);
      source.container.setDepth(6);
      const existing = this.castLabels.get(action.id);
      if (existing?.active) existing.destroy();
      const label = this.add
        .text(0, -source.baseRadius - 72, action.ability.name, {
          fontFamily: FONT_FAMILY,
          fontSize:
            stage.profile === 'portrait'
              ? source.isPet
                ? '26px'
                : '34px'
              : source.isPet
                ? '18px'
                : '24px',
          fontStyle: 'bold',
          color: colorHex(color),
          ...outlinedText(source.isPet ? 3 : 4),
          letterSpacing: 2,
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(0.78)
        .setResolution(renderScale);
      source.container.add(label);
      this.castLabels.set(action.id, label);
      this.tweens.add({
        targets: label,
        alpha: 1,
        scale: 1,
        y: label.y - 5,
        duration: 480,
        ease: 'Back.Out',
      });

      const seal = this.add
        .circle(source.container.x, source.container.y, source.radius + 13)
        .setStrokeStyle(action.visual.weight === 'heavy' ? 3 : 2, color, 0.55)
        .setDepth(2.7);
      this.tweens.add({
        targets: seal,
        scale: 1.22,
        alpha: 0,
        duration: 720,
        ease: 'Cubic.Out',
        onComplete: () => seal.destroy(),
      });
    }

    private playDelivery(
      action: CombatVisualActionInput,
      duration: number,
      impactOffset: number,
    ) {
      const source = this.visuals.get(action.sourceId);
      const targets = action.targetIds
        .map((id) => this.visuals.get(id))
        .filter((target): target is EntityVisual => Boolean(target));
      if (!source || targets.length === 0) return;
      const color = visualColor(action.visual);
      switch (action.visual.delivery) {
        case 'melee':
          {
            const impactTargets = targets.filter((target) => target !== source);
            if (impactTargets.length === 0) break;
            this.playMeleeDelivery(
              source,
              impactTargets,
              action,
              color,
              duration,
              impactOffset,
            );
          }
          break;
        case 'projectile':
          this.playProjectileDelivery(
            source,
            targets,
            action,
            color,
            impactOffset,
          );
          break;
        case 'beam':
          this.playBeamDelivery(source, targets, action, color, impactOffset);
          break;
        case 'field':
          this.playFieldDelivery(source, targets, action, color, impactOffset);
          break;
        case 'self':
          this.playSelfDelivery(source, action, color, impactOffset);
          break;
      }
    }

    private playMeleeDelivery(
      source: EntityVisual,
      targets: EntityVisual[],
      action: CombatVisualActionInput,
      color: number,
      duration: number,
      impactOffset: number,
    ) {
      const origin = { x: source.container.x, y: source.container.y };
      const targetCenter = targets.reduce(
        (point, target) => ({
          x: point.x + target.container.x / targets.length,
          y: point.y + target.container.y / targets.length,
        }),
        { x: 0, y: 0 },
      );
      const targetRadius = Math.max(...targets.map((target) => target.radius));
      const distance = Phaser.Math.Distance.Between(
        origin.x,
        origin.y,
        targetCenter.x,
        targetCenter.y,
      );
      const ratio = Phaser.Math.Clamp(
        (distance - source.radius * 0.5 - targetRadius * 0.72) /
          Math.max(distance, 1),
        0.58,
        0.87,
      );
      this.tweens.add({
        targets: source.container,
        x: origin.x + (targetCenter.x - origin.x) * ratio,
        y: origin.y + (targetCenter.y - origin.y) * ratio,
        duration: Math.max(260, impactOffset),
        ease: action.visual.weight === 'heavy' ? 'Expo.In' : 'Cubic.In',
        onComplete: () => {
          targets.forEach((target) =>
            this.playImpactBurst(target.container, action.visual, color),
          );
          this.cameras.main.shake(
            action.visual.weight === 'heavy' ? 190 : 120,
            action.visual.weight === 'heavy' ? 0.0026 : 0.0012,
          );
          this.tweens.add({
            targets: source.container,
            x: origin.x,
            y: origin.y,
            delay: 120,
            duration: Math.max(380, duration - impactOffset - 120),
            ease: 'Cubic.Out',
          });
        },
      });
    }

    private playProjectileDelivery(
      source: EntityVisual,
      targets: EntityVisual[],
      action: CombatVisualActionInput,
      color: number,
      impactOffset: number,
    ) {
      const start = {
        x: source.container.x,
        y: source.container.y - source.radius - 32,
      };
      targets.forEach((target, index) => {
        const projectile = this.createSkillProjectile(action, color, start);
        const end = {
          x: target.container.x,
          y: target.container.y - target.radius * 0.18,
        };
        const duration = Math.max(420, impactOffset - index * 55);
        const isTrue = action.visual.discipline === 'true';
        const isFanout =
          action.visual.distribution === 'fanout' && targets.length > 1;
        if (isTrue || isFanout) {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const length = Math.max(Math.hypot(dx, dy), 1);
          const bend = isTrue
            ? (index % 2 === 0 ? -1 : 1) * (62 + index * 8)
            : (index - (targets.length - 1) / 2) * 42;
          const control = {
            x: (start.x + end.x) / 2 + (-dy / length) * bend,
            y: (start.y + end.y) / 2 + (dx / length) * bend,
          };
          this.tweens.addCounter({
            from: 0,
            to: 1,
            duration,
            delay: index * 55,
            ease: 'Sine.InOut',
            onUpdate: (tween) => {
              const progress = tween.getValue() ?? 0;
              const inverse = 1 - progress;
              projectile.setPosition(
                inverse * inverse * start.x +
                  2 * inverse * progress * control.x +
                  progress * progress * end.x,
                inverse * inverse * start.y +
                  2 * inverse * progress * control.y +
                  progress * progress * end.y,
              );
              projectile.setAngle(Math.sin(progress * Math.PI * 3) * 5);
            },
            onComplete: () => {
              projectile.destroy(true);
              this.playImpactBurst(target.container, action.visual, color);
            },
          });
        } else {
          this.tweens.add({
            targets: projectile,
            x: end.x,
            y: end.y,
            duration,
            delay: index * 55,
            ease: 'Cubic.InOut',
            onComplete: () => {
              projectile.destroy(true);
              this.playImpactBurst(target.container, action.visual, color);
            },
          });
        }
      });
    }

    private playBeamDelivery(
      source: EntityVisual,
      targets: EntityVisual[],
      action: CombatVisualActionInput,
      color: number,
      impactOffset: number,
    ) {
      targets.forEach((target, index) => {
        const projectile = this.createSkillProjectile(action, color, {
          x: source.container.x,
          y: source.container.y,
        });
        this.tweens.add({
          targets: projectile,
          x: target.container.x,
          y: target.container.y,
          duration: Math.max(320, impactOffset),
          delay: index * 45,
          ease: 'Expo.In',
          onComplete: () => {
            projectile.destroy(true);
            this.playImpactBurst(target.container, action.visual, color);
          },
        });
      });
    }

    private playFieldDelivery(
      source: EntityVisual,
      targets: EntityVisual[],
      action: CombatVisualActionInput,
      color: number,
      impactOffset: number,
    ) {
      const center = targets.reduce(
        (point, target) => ({
          x: point.x + target.container.x,
          y: point.y + target.container.y,
        }),
        { x: 0, y: 0 },
      );
      center.x /= targets.length;
      center.y /= targets.length;
      const ring = this.add
        .ellipse(center.x, center.y, 380, 500, color, 0.035)
        .setStrokeStyle(action.visual.weight === 'heavy' ? 4 : 2, color, 0.62)
        .setScale(0.36)
        .setDepth(1.8);
      this.tweens.add({
        targets: ring,
        scale: 1,
        alpha: { from: 0.2, to: 0.8 },
        duration: Math.max(420, impactOffset),
        ease: 'Cubic.Out',
        onComplete: () => {
          targets.forEach((target) =>
            this.playImpactBurst(target.container, action.visual, color),
          );
          this.tweens.add({
            targets: ring,
            scale: 1.08,
            alpha: 0,
            duration: 620,
            onComplete: () => ring.destroy(),
          });
        },
      });
    }

    private playSelfDelivery(
      source: EntityVisual,
      action: CombatVisualActionInput,
      color: number,
      impactOffset: number,
    ) {
      const aura = this.add
        .circle(
          source.container.x,
          source.container.y,
          source.radius + 6,
          color,
          0.045,
        )
        .setStrokeStyle(3, color, 0.68)
        .setDepth(2.8);
      this.tweens.add({
        targets: aura,
        scale: 1.48,
        alpha: 0,
        duration: Math.max(420, impactOffset + 260),
        ease: 'Cubic.Out',
        onComplete: () => aura.destroy(),
      });
    }

    private createSkillProjectile(
      action: CombatVisualActionInput,
      color: number,
      start: { x: number; y: number },
    ) {
      const isTrue = action.visual.discipline === 'true';
      const aura = this.add.graphics();
      if (isTrue) {
        aura.lineStyle(2, color, 0.46).strokeCircle(0, 0, 30);
        aura.lineStyle(1, 0x29202f, 0.36).strokeCircle(0, 0, 39);
        aura.lineStyle(2, color, 0.2).lineBetween(-56, 0, -26, 0);
      } else {
        aura.lineStyle(2, color, 0.52).strokeEllipse(0, 0, 92, 40);
        aura.lineStyle(1, 0xe9e1cf, 0.8).strokeCircle(0, 0, 25);
      }
      const label = this.add
        .text(0, 0, action.ability.name, {
          fontFamily: FONT_FAMILY,
          fontSize: '18px',
          fontStyle: 'bold',
          color: colorHex(color),
          ...outlinedText(4),
          letterSpacing: 2,
        })
        .setOrigin(0.5)
        .setResolution(renderScale);
      const projectile = this.add
        .container(start.x, start.y, [aura, label])
        .setDepth(7);
      this.tweens.add({
        targets: aura,
        angle: isTrue ? -360 : 360,
        duration: isTrue ? 1_500 : 1_100,
        repeat: -1,
      });
      return projectile;
    }

    private settleAction(action: CombatVisualActionInput) {
      const source = this.visuals.get(action.sourceId);
      const label = this.castLabels.get(action.id);
      this.castLabels.delete(action.id);
      if (!label?.active) {
        if (source?.container.active) source.container.setDepth(3);
        this.completeTimelineAction(action.id);
        return;
      }
      this.tweens.add({
        targets: label,
        alpha: 0,
        y: label.y - 8,
        duration: 260,
        ease: 'Quad.In',
        onComplete: () => {
          label.destroy();
          if (source?.container.active) source.container.setDepth(3);
          this.completeTimelineAction(action.id);
        },
      });
    }

    private completeTimelineAction(actionId: string) {
      this.activeTimelineActionIds.delete(actionId);
      if (this.activeTimelineActionIds.size > 0 || !this.pendingStage) return;
      const pendingStage = this.pendingStage;
      this.pendingStage = undefined;
      this.relayout(pendingStage);
    }

    private createFormationInk() {
      const formation = this.formation ?? this.add.graphics().setDepth(0.5);
      this.formation = formation;
      formation.clear();
      const enemyPetOffset = formationPetOffset('enemies', stage);
      const allyPetOffset = formationPetOffset('allies', stage);
      const formationHeight =
        Math.abs(enemyPetOffset.y) + (stage.profile === 'portrait' ? 150 : 176);
      formation.lineStyle(2, 0x75474a, 0.075);
      formation.strokeEllipse(
        stage.width / 2,
        formationBackY('enemies', stage) + enemyPetOffset.y / 2,
        stage.width * 0.64,
        formationHeight,
      );
      formation.lineStyle(2, 0x475b50, 0.075);
      formation.strokeEllipse(
        stage.width / 2,
        formationBackY('allies', stage) + allyPetOffset.y / 2,
        stage.width * 0.64,
        formationHeight,
      );
    }

    private createEntity(entity: RealtimeBattleEntity) {
      const position = formationPositions.get(entity.id) ?? {
        x: stage.width / 2,
        y: stage.height / 2,
      };
      const isPet = entity.kind === 'spirit-pet';
      const compact = stage.profile === 'portrait';
      const teamColor = entity.team === 'allies' ? 0x3f6b56 : 0x8e3039;
      const teamSize = currentSnapshot.entities.filter(
        (candidate) =>
          candidate.team === entity.team && candidate.kind === 'cultivator',
      ).length;
      const radius = formationRadius(entity, stage, teamSize);
      const vitalRings = this.add.graphics();
      const nameControlFx = this.add.graphics().setAlpha(0);
      const selection = this.add
        .circle(0, 0, radius + 18, teamColor, 0)
        .setStrokeStyle(2, teamColor, 0)
        .setAlpha(0);
      const actorSelection = this.add
        .circle(0, 0, radius + 12, 0x3f6b56, 0.025)
        .setStrokeStyle(4, 0x3f6b56, 0)
        .setAlpha(0);
      const targetSelection = this.add
        .circle(0, 0, radius + 24, teamColor, 0.035)
        .setStrokeStyle(4, teamColor, 0)
        .setAlpha(0);
      if (!reduceMotion) {
        this.tweens.add({
          targets: targetSelection,
          scale: 1.08,
          duration: 680,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
      const name = this.add
        .text(0, 0, entity.name, {
          fontFamily: FONT_FAMILY,
          fontSize: isPet
            ? compact
              ? '22px'
              : '20px'
            : compact
              ? '29px'
              : '30px',
          color: '#fff8e6',
          fontStyle: 'bold',
          stroke: '#101612',
          strokeThickness: isPet ? 4 : 5,
          letterSpacing: isPet ? 1 : 2,
        })
        .setOrigin(0.5)
        .setResolution(renderScale);
      const namePlate = this.add.graphics();
      namePlate.fillStyle(0x09110e, 0.84);
      namePlate.fillCircle(0, 0, radius - 13);
      namePlate.lineStyle(2, teamColor, 0.72);
      namePlate.strokeCircle(0, 0, radius - 13);
      const coreArt = this.add
        .image(0, 0, UNIT_CORE_TEXTURE)
        .setDisplaySize(radius * 2.12, radius * 2.12)
        .setAlpha(0.86);
      const vitalFrameArt = this.add
        .image(0, 0, UNIT_VITAL_FRAME_TEXTURE)
        .setDisplaySize(radius * 2.45, radius * 2.45)
        .setAlpha(0.9);
      const shieldArt = this.add
        .image(0, 0, UNIT_SHIELD_TEXTURE)
        .setDisplaySize(radius * 2.8, radius * 2.8)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      if (!reduceMotion) {
        this.tweens.add({
          targets: shieldArt,
          angle: 360,
          duration: 12_000,
          repeat: -1,
          ease: 'Linear',
        });
      }

      const resourceNode = document.createElement('div');
      resourceNode.className = `battle-unit-resource-dock battle-unit-resource-dock--${entity.team}${isPet ? ' battle-unit-resource-dock--pet' : ''}`;
      resourceNode.setAttribute('aria-hidden', 'true');
      const combatResourceSteady = document.createElement('div');
      combatResourceSteady.className = 'battle-unit-resources';
      const combatResourcePips = document.createElement('div');
      combatResourcePips.className = 'battle-unit-resources__steady';
      const combatResourceDelta = document.createElement('div');
      combatResourceDelta.className = 'battle-unit-resource-delta';
      const combatResourceDeltaIcon = document.createElement('img');
      combatResourceDeltaIcon.alt = '';
      const combatResourceDeltaValue = document.createElement('span');
      combatResourceSteady.append(combatResourcePips);
      combatResourceDelta.append(
        combatResourceDeltaIcon,
        combatResourceDeltaValue,
      );
      resourceNode.append(combatResourceSteady, combatResourceDelta);
      const resourceDom = this.add
        .dom(position.x, position.y + radius + (isPet ? 12 : 16), resourceNode)
        .setOrigin(0.5, 0)
        .setDepth(4);
      const actionStateText = this.add
        .text(0, radius + 48, '', {
          fontFamily: FONT_FAMILY,
          fontSize: compact
            ? isPet
              ? '14px'
              : '16px'
            : isPet
              ? '11px'
              : '14px',
          color: '#735080',
          ...outlinedText(3),
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setResolution(renderScale);
      const buffText = this.add
        .text(0, radius + 84, '', {
          fontFamily: FONT_FAMILY,
          fontSize: compact
            ? isPet
              ? '14px'
              : '16px'
            : isPet
              ? '11px'
              : '14px',
          color: '#357257',
          ...outlinedText(3),
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setResolution(renderScale);
      const debuffText = this.add
        .text(0, radius + 66, '', {
          fontFamily: FONT_FAMILY,
          fontSize: compact
            ? isPet
              ? '14px'
              : '16px'
            : isPet
              ? '11px'
              : '14px',
          color: '#a32d3b',
          ...outlinedText(3),
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setResolution(renderScale);
      const commandStateText = this.add
        .text(0, -radius - (isPet ? 76 : 92), '', {
          fontFamily: FONT_FAMILY,
          fontSize: compact ? '18px' : '15px',
          fontStyle: 'bold',
          color: '#3f6b56',
          ...outlinedText(3),
          letterSpacing: 2,
        })
        .setOrigin(0.5)
        .setResolution(renderScale);

      const container = this.add
        .container(position.x, position.y, [
          selection,
          actorSelection,
          targetSelection,
          namePlate,
          coreArt,
          vitalFrameArt,
          vitalRings,
          shieldArt,
          nameControlFx,
          name,
          actionStateText,
          buffText,
          debuffText,
          commandStateText,
        ])
        .setSize((radius + 54) * 2, (radius + 48) * 2)
        .setInteractive({ useHandCursor: true })
        .setDepth(3);
      container.on('pointerdown', () => {
        if (
          this.legalTargetIds.size > 0 &&
          !this.legalTargetIds.has(entity.id)
        ) {
          args.onFocus(entity.id);
          return;
        }
        currentSnapshot = { ...currentSnapshot, focusedEntityId: entity.id };
        this.renderSnapshot(currentSnapshot);
        args.onFocus(entity.id);
        args.onState(currentSnapshot);
      });

      this.visuals.set(entity.id, {
        container,
        selection,
        actorSelection,
        targetSelection,
        commandStateText,
        vitalRings,
        shieldArt,
        name,
        resourceDom,
        resourceNode,
        combatResourceSteady,
        combatResourcePips,
        combatResourceDelta,
        combatResourceDeltaIcon,
        combatResourceDeltaValue,
        actionStateText,
        buffText,
        debuffText,
        nameControlFx,
        isPet,
        baseRadius: radius,
        radius,
      });
    }

    renderSnapshot(snapshot: RealtimeBattleSnapshot) {
      for (const entity of snapshot.entities) {
        const visual = this.visuals.get(entity.id);
        if (!visual) continue;
        const isFocused = snapshot.focusedEntityId === entity.id;
        this.drawVitalRings(visual, entity);
        const resourceCueActive = this.resourceCues.has(entity.id);
        const resourceNodes = entity.combatResources.map((resource) => {
          const chip = document.createElement('span');
          chip.className = 'battle-unit-resource';
          chip.title = resource.name;
          const icon = document.createElement('img');
          icon.className = 'battle-unit-resource__icon';
          icon.src = realtimeBattleResourceAsset(resource.id);
          icon.alt = '';
          const value = document.createElement('span');
          value.className = 'battle-unit-resource__value';
          value.textContent = `${resource.name} ${resource.current}/${resource.max}`;
          chip.append(icon, value);
          return chip;
        });
        visual.combatResourcePips.replaceChildren(...resourceNodes);
        visual.combatResourceSteady.style.display = resourceCueActive
          ? 'none'
          : 'flex';
        visual.combatResourceDelta.style.display = resourceCueActive
          ? 'flex'
          : 'none';
        visual.resourceDom
          .setPosition(
            visual.container.x,
            visual.container.y + visual.radius + (visual.isPet ? 12 : 16),
          )
          .setVisible(entity.alive && entity.combatResources.length > 0);
        const controls = entity.effects
          .filter((effect) => effect.statusType === 'control')
          .slice(-2);
        const localStates = entity.actionStates
          .map((state) => state.label)
          .slice(stage.profile === 'portrait' ? -1 : -2);
        visual.actionStateText.setText(
          entity.alive ? localStates.join(' · ') : '',
        );
        const buffEffects = entity.effects.filter(
          (effect) => effect.tone === 'buff',
        );
        const buffs = buffEffects
          .map(
            (effect) =>
              `${effect.label}${effect.layers > 1 ? ` ×${effect.layers}` : ''}`,
          )
          .slice(-1);
        const debuffEffects = entity.effects.filter(
          (effect) =>
            effect.tone === 'debuff' && effect.statusType !== 'control',
        );
        const debuffs = debuffEffects
          .map(
            (effect) =>
              `${effect.label}${effect.layers > 1 ? ` ×${effect.layers}` : ''}`,
          )
          .slice(-1);
        visual.buffText.setText(
          entity.alive && buffs.length > 0
            ? stage.profile === 'portrait'
              ? `益 · ${buffEffects.length}`
              : buffs.join(' / ')
            : '',
        );
        visual.debuffText.setText(
          entity.alive && debuffs.length > 0
            ? stage.profile === 'portrait'
              ? `损 · ${debuffEffects.length}`
              : debuffs.join(' / ')
            : '',
        );
        this.renderNameControlFx(
          visual,
          entity.alive && controls.length > 0
            ? (controls[0].controlVisual ?? 'generic')
            : undefined,
        );
        const isLegalTarget = this.legalTargetIds.has(entity.id);
        const isActor = this.actorUnitId === entity.id;
        const isLocked = this.lockedUnitIds.has(entity.id);
        visual.selection.setAlpha(isFocused && !isLegalTarget ? 0.28 : 0);
        visual.selection.setStrokeStyle(
          isFocused && !isLegalTarget ? 2 : 0,
          entity.team === 'allies' ? 0x3f6b56 : 0x9d303a,
          isFocused && !isLegalTarget ? 0.42 : 0,
        );
        visual.actorSelection
          .setAlpha(isActor ? 0.86 : 0)
          .setStrokeStyle(isActor ? 4 : 0, 0x3f6b56, isActor ? 0.9 : 0);
        visual.targetSelection
          .setAlpha(isLegalTarget ? 0.82 : 0)
          .setStrokeStyle(
            isLegalTarget ? 4 : 0,
            entity.team === 'allies' ? 0x3f6b56 : 0x9d303a,
            isLegalTarget ? 0.92 : 0,
          );
        visual.commandStateText
          .setText(
            isLocked
              ? '已定'
              : isActor && this.commandSubmitting
                ? '提交中'
                : isActor
                  ? '当前出招'
                  : '',
          )
          .setColor(isLocked ? '#735080' : '#3f6b56');
        visual.vitalRings.setAlpha(entity.alive ? 1 : 0.18);
        visual.resourceNode.style.opacity = entity.alive ? '1' : '0.35';
        visual.name
          .setAlpha(entity.alive ? 1 : 0.35)
          .setColor(entity.alive ? '#fff8e6' : '#6f675e');
      }
    }

    private drawVitalRings(visual: EntityVisual, entity: RealtimeBattleEntity) {
      const graphics = visual.vitalRings;
      const radius = visual.baseRadius;
      const hpRatio = Phaser.Math.Clamp(entity.hp / entity.maxHp, 0, 1);
      const qiRatio = Phaser.Math.Clamp(entity.qi / entity.maxQi, 0, 1);
      const ringRadius = radius - 5;
      const ringWidth = visual.isPet ? 8 : 10;
      const gapAngle = 0.085;
      const bottom = Math.PI / 2;
      const topLeft = Math.PI * 1.5;
      const topRight = -Math.PI / 2;
      const drawArc = (
        start: number,
        end: number,
        color: number,
        width: number,
        alpha: number,
        anticlockwise = false,
      ) => {
        graphics.lineStyle(width, color, alpha);
        graphics.beginPath();
        graphics.arc(0, 0, ringRadius, start, end, anticlockwise);
        graphics.strokePath();
      };

      graphics.clear();
      drawArc(
        bottom + gapAngle,
        topLeft - gapAngle,
        0x351316,
        ringWidth + 4,
        0.94,
      );
      drawArc(
        bottom - gapAngle,
        topRight + gapAngle,
        0x102f38,
        ringWidth + 4,
        0.94,
        true,
      );
      if (hpRatio > 0) {
        drawArc(
          bottom + gapAngle,
          bottom + gapAngle + (Math.PI - gapAngle * 2) * hpRatio,
          hpRatio < 0.3 ? 0xf03d4d : 0xc1121f,
          ringWidth,
          1,
        );
      }
      if (qiRatio > 0) {
        drawArc(
          bottom - gapAngle,
          bottom - gapAngle - (Math.PI - gapAngle * 2) * qiRatio,
          0x1685a9,
          ringWidth,
          1,
          true,
        );
      }
      graphics.lineStyle(1.5, 0xfff1d3, 0.42);
      graphics.strokeCircle(0, 0, radius - 12);
      graphics.lineStyle(1.5, 0x110c08, 0.58);
      graphics.strokeCircle(0, 0, radius + 2);

      if (entity.shield > 0) {
        const shieldIntensity = Phaser.Math.Clamp(
          Math.log1p(entity.shield) / Math.log1p(300),
          0.12,
          1,
        );
        const shieldWidth = 2.5 + Math.sqrt(shieldIntensity) * 7.5;
        graphics.lineStyle(
          shieldWidth + 5,
          0xe8b931,
          0.08 + shieldIntensity * 0.12,
        );
        graphics.strokeCircle(0, 0, radius + 12);
        graphics.lineStyle(shieldWidth, 0xf2c84b, 0.42 + shieldIntensity * 0.5);
        graphics.strokeCircle(0, 0, radius + 12);
        graphics.lineStyle(1.5, 0xfff1b0, 0.76);
        graphics.strokeCircle(0, 0, radius + 8);
        visual.shieldArt
          .setVisible(true)
          .setAlpha(0.2 + shieldIntensity * 0.56)
          .setScale(0.96 + shieldIntensity * 0.055);
      } else {
        visual.shieldArt.setVisible(false).setAlpha(0);
      }
    }

    private playReaction(
      fact: CombatVisualFact,
      action: CombatVisualActionInput,
    ) {
      if (!fact.reaction) return;
      const source = this.visuals.get(fact.reaction.sourceId);
      if (!source) return;
      const color = visualColor(action.visual);
      const label = this.add
        .text(0, -source.baseRadius - 48, fact.reaction.label, {
          fontFamily: FONT_FAMILY,
          fontSize:
            stage.profile === 'portrait'
              ? source.isPet
                ? '24px'
                : '29px'
              : source.isPet
                ? '15px'
                : '19px',
          fontStyle: 'bold',
          color: colorHex(color),
          ...outlinedText(source.isPet ? 3 : 4),
          letterSpacing: 2,
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(0.86)
        .setResolution(renderScale);
      source.container.add(label);
      this.tweens.add({
        targets: label,
        alpha: 1,
        scale: 1,
        y: label.y - 4,
        duration: 260,
        ease: 'Back.Out',
        onComplete: () => {
          this.time.delayedCall(720, () => {
            if (!label.active) return;
            this.tweens.add({
              targets: label,
              alpha: 0,
              y: label.y - 8,
              duration: 320,
              onComplete: () => label.destroy(),
            });
          });
        },
      });
    }

    private playFact(fact: CombatVisualFact, action: CombatVisualActionInput) {
      for (const targetId of fact.targetIds) {
        const target = this.visuals.get(targetId);
        if (!target) continue;
        switch (fact.kind) {
          case 'damage':
          case 'recovery':
          case 'status':
          case 'action_state':
          case 'mechanic':
            break;
          case 'shield':
            if (fact.operation === 'break') this.playShieldBreak(target);
            break;
          case 'defense':
            if (fact.defense === 'dodge') {
              this.tweens.add({
                targets: target.container,
                x:
                  target.container.x +
                  (target.container.x < stage.width / 2 ? -32 : 32),
                duration: 130,
                yoyo: true,
                hold: 110,
                ease: 'Sine.Out',
              });
            }
            break;
          case 'resource':
            if (fact.resourceId !== 'mp') {
              this.showResourceCue(targetId, action.id, fact);
            }
            break;
          case 'death_prevented':
            this.tweens.add({
              targets: target.name,
              alpha: 0.18,
              duration: 120,
              yoyo: true,
              repeat: 3,
            });
            break;
          case 'unit_died':
            this.playDeathFragments(target);
            break;
        }
      }
    }

    private showResourceCue(
      entityId: string,
      actionId: string,
      fact: Extract<CombatVisualFact, { kind: 'resource' }>,
    ) {
      const visual = this.visuals.get(entityId);
      const entity = currentSnapshot.entities.find(
        (entry) => entry.id === entityId,
      );
      const resource = entity?.combatResources.find(
        (entry) => entry.id === fact.resourceId,
      );
      if (!visual || !resource) return;

      const previous = this.resourceCues.get(entityId);
      previous?.hideTimer?.remove(false);
      const delta = fact.after - fact.before;
      visual.combatResourceDeltaIcon.src = realtimeBattleResourceAsset(
        resource.id,
      );
      visual.combatResourceDeltaIcon.title = resource.name;
      visual.combatResourceDeltaValue.textContent = `${delta >= 0 ? '+' : ''}${Math.round(delta)}`;
      visual.combatResourceDeltaValue.style.color =
        delta >= 0 ? '#357257' : '#a32d3b';
      visual.combatResourceSteady.style.display = 'none';
      visual.combatResourceDelta.style.display = 'flex';

      const state: ResourceCueState = { actionId };
      this.resourceCues.set(entityId, state);
      state.hideTimer = this.time.delayedCall(1_450, () => {
        if (this.resourceCues.get(entityId) !== state) return;
        this.resourceCues.delete(entityId);
        visual.combatResourceDelta.style.display = 'none';
        visual.combatResourceSteady.style.display = 'flex';
      });
    }

    private enqueueImpactCue(
      cue: CombatImpactCue,
      action: CombatVisualActionInput,
    ) {
      const queue = this.impactQueues.get(cue.targetId) ?? [];
      queue.push({ cue, action });
      this.impactQueues.set(cue.targetId, queue);
      if (!this.activeImpactTargets.has(cue.targetId)) {
        this.playNextImpactCue(cue.targetId);
      }
    }

    private playNextImpactCue(targetId: string) {
      const queue = this.impactQueues.get(targetId);
      const next = queue?.shift();
      if (!next) {
        this.impactQueues.delete(targetId);
        this.activeImpactTargets.delete(targetId);
        return;
      }
      this.activeImpactTargets.add(targetId);
      this.playImpactCue(next, () => {
        this.time.delayedCall(120, () => this.playNextImpactCue(targetId));
      });
    }

    private playImpactCue(entry: QueuedImpactCue, onComplete: () => void) {
      const { cue } = entry;
      const target = this.visuals.get(cue.targetId);
      if (!target) {
        onComplete();
        return;
      }
      const sourcePoint = formationPositions.get(cue.sourceId) ?? {
        x: target.container.x,
        y: target.container.y + 1,
      };
      const targetPoint = formationPositions.get(cue.targetId) ?? {
        x: target.container.x,
        y: target.container.y,
      };
      const rawX = targetPoint.x - sourcePoint.x;
      const rawY = targetPoint.y - sourcePoint.y;
      const length = Math.max(Math.hypot(rawX, rawY), 1);
      const direction =
        cue.sourceId === cue.targetId
          ? { x: 0, y: -1 }
          : { x: rawX / length, y: rawY / length };
      const anchor = {
        x: Phaser.Math.Clamp(
          targetPoint.x - direction.x * (target.radius + 12),
          58,
          stage.width - 58,
        ),
        y: Phaser.Math.Clamp(
          targetPoint.y - direction.y * (target.radius + 12),
          48,
          stage.height - 48,
        ),
      };

      let mainLabel: string;
      let mainColor: number;
      let fontSize = stage.profile === 'portrait' ? 38 : 24;
      if (cue.kind === 'damage') {
        mainLabel = `-${Math.round(cue.amount)}${cue.critical ? '！' : ''}`;
        mainColor = damageColor(cue.damageType);
        fontSize =
          stage.profile === 'portrait'
            ? cue.critical
              ? 46
              : 40
            : cue.critical
              ? 30
              : 25;
      } else if (cue.kind === 'recovery') {
        mainLabel = `+${Math.round(cue.amount)}`;
        mainColor = 0x357257;
      } else {
        mainLabel = cue.label;
        mainColor =
          cue.tone === 'survival'
            ? 0xa87918
            : cue.tone === 'defense'
              ? 0x665795
              : 0x5e5750;
        fontSize = stage.profile === 'portrait' ? 34 : 22;
      }

      const mainText = this.add
        .text(0, 0, mainLabel, {
          fontFamily: FONT_FAMILY,
          fontSize: `${fontSize}px`,
          fontStyle: 'bold',
          color: colorHex(mainColor),
          ...outlinedText(5),
          letterSpacing: 2,
        })
        .setOrigin(0, 0.5)
        .setResolution(renderScale);
      const children: Phaser.GameObjects.GameObject[] = [mainText];
      let shieldText: Phaser.GameObjects.Text | undefined;
      if (cue.kind === 'damage' && cue.shieldAbsorbed > 0) {
        shieldText = this.add
          .text(0, 0, `（${Math.round(cue.shieldAbsorbed)}）`, {
            fontFamily: FONT_FAMILY,
            fontSize: `${Math.max(17, fontSize - 4)}px`,
            fontStyle: 'bold',
            color: '#b47d18',
            ...outlinedText(5),
            letterSpacing: 1,
          })
          .setOrigin(0, 0.5)
          .setResolution(renderScale);
        children.push(shieldText);
      }
      const gap = shieldText ? 2 : 0;
      const totalWidth = mainText.width + gap + (shieldText?.width ?? 0);
      mainText.setX(-totalWidth / 2);
      shieldText?.setX(-totalWidth / 2 + mainText.width + gap);

      const cueContainer = this.add
        .container(
          anchor.x - direction.x * 8,
          anchor.y - direction.y * 8,
          children,
        )
        .setAlpha(0)
        .setScale(0.88)
        .setDepth(9);
      this.tweens.add({
        targets: cueContainer,
        x: anchor.x + direction.x * 22,
        y: anchor.y + direction.y * 22,
        alpha: 1,
        scale: 1,
        duration: 180,
        ease: 'Back.Out',
        onComplete: () => {
          this.time.delayedCall(560, () => {
            if (!cueContainer.active) return;
            this.tweens.add({
              targets: cueContainer,
              y: cueContainer.y - 24,
              alpha: 0,
              duration: 360,
              ease: 'Cubic.In',
              onComplete: () => {
                cueContainer.destroy(true);
                onComplete();
              },
            });
          });
        },
      });
    }

    private renderNameControlFx(
      visual: EntityVisual,
      mode: CombatControlVisual | undefined,
    ) {
      if (visual.controlMode === mode) return;
      visual.controlMode = mode;
      this.tweens.killTweensOf(visual.nameControlFx);
      this.tweens.killTweensOf(visual.name);
      const nameY = visual.isPet ? -9 : -12;
      visual.name.setPosition(0, nameY).setAngle(0).setScale(1);
      const nameFx = visual.nameControlFx;
      nameFx
        .clear()
        .setPosition(0, 0)
        .setAngle(0)
        .setScale(1)
        .setAlpha(mode ? 0.92 : 0);
      if (!mode) return;

      const halfWidth = Math.max(22, visual.name.width / 2);
      const halfHeight = Math.max(10, visual.name.height / 2);
      const top = nameY - halfHeight;
      const bottom = nameY + halfHeight;
      switch (mode) {
        case 'stun':
          nameFx.fillStyle(0xc28a20, 0.94);
          for (let index = 0; index < 3; index += 1) {
            nameFx.fillCircle(
              (index - 1) * Math.min(halfWidth * 0.72, 24),
              top - 8 - (index % 2) * 3,
              index === 1 ? 3.6 : 2.8,
            );
          }
          this.tweens.add({
            targets: nameFx,
            y: -3,
            alpha: 0.52,
            duration: 520,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
          });
          this.tweens.add({
            targets: visual.name,
            x: { from: -2, to: 2 },
            duration: 110,
            yoyo: true,
            repeat: -1,
          });
          break;
        case 'bind':
          nameFx.lineStyle(2.8, 0x74517f, 0.96);
          nameFx.beginPath();
          nameFx.moveTo(-halfWidth - 4, top - 4);
          nameFx.lineTo(-halfWidth - 12, top - 4);
          nameFx.lineTo(-halfWidth - 12, bottom + 4);
          nameFx.lineTo(-halfWidth - 4, bottom + 4);
          nameFx.moveTo(halfWidth + 4, top - 4);
          nameFx.lineTo(halfWidth + 12, top - 4);
          nameFx.lineTo(halfWidth + 12, bottom + 4);
          nameFx.lineTo(halfWidth + 4, bottom + 4);
          nameFx.strokePath();
          this.tweens.add({
            targets: nameFx,
            scaleX: 0.86,
            alpha: 0.55,
            duration: 620,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
          });
          break;
        case 'sleep':
          nameFx.fillStyle(0x665795, 0.9);
          for (let index = 0; index < 3; index += 1) {
            nameFx.fillCircle(
              halfWidth + 8 + index * 6,
              top - 2 - index * 5,
              2.2 + index * 0.5,
            );
          }
          nameFx.lineStyle(2, 0x665795, 0.72);
          nameFx.lineBetween(-halfWidth, bottom + 4, halfWidth, bottom + 4);
          this.tweens.add({
            targets: nameFx,
            y: -4,
            alpha: 0.42,
            duration: 1_100,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
          });
          break;
        case 'freeze':
          nameFx.lineStyle(2.2, 0x4d7988, 0.94);
          nameFx.lineBetween(-halfWidth - 6, top - 3, -halfWidth + 8, top - 3);
          nameFx.lineBetween(
            halfWidth - 8,
            bottom + 3,
            halfWidth + 6,
            bottom + 3,
          );
          nameFx.lineBetween(
            -halfWidth + 4,
            bottom + 3,
            -halfWidth + 12,
            top - 3,
          );
          nameFx.lineBetween(
            halfWidth - 12,
            bottom + 3,
            halfWidth - 4,
            top - 3,
          );
          this.tweens.add({
            targets: nameFx,
            alpha: 0.45,
            duration: 480,
            yoyo: true,
            repeat: -1,
          });
          break;
        case 'generic':
          nameFx.fillStyle(0x74517f, 0.16);
          nameFx.fillRoundedRect(
            -halfWidth - 8,
            top - 4,
            halfWidth * 2 + 16,
            halfHeight * 2 + 8,
            5,
          );
          nameFx.lineStyle(2.2, 0x74517f, 0.84);
          nameFx.lineBetween(-halfWidth - 10, top, -halfWidth - 10, bottom);
          nameFx.lineBetween(halfWidth + 10, top, halfWidth + 10, bottom);
          this.tweens.add({
            targets: nameFx,
            scaleX: 1.06,
            alpha: 0.55,
            duration: 760,
            yoyo: true,
            repeat: -1,
          });
          break;
      }
    }

    private playImpactBurst(
      target: Phaser.GameObjects.Container,
      visual: CombatVisualSpec,
      color: number,
    ) {
      const burst = this.add.graphics({ x: target.x, y: target.y }).setDepth(6);
      if (visual.discipline === 'true') {
        burst.lineStyle(2.5, color, 0.7).strokeCircle(0, 0, 32);
        burst.lineStyle(1.5, 0x302437, 0.48).strokeCircle(0, 0, 48);
        burst.lineStyle(1, color, 0.32).strokeCircle(0, 0, 62);
      } else if (visual.discipline === 'spell') {
        burst.lineStyle(2.2, color, 0.68).strokeCircle(0, 0, 35);
        burst.lineStyle(1.2, color, 0.42).strokeCircle(0, 0, 51);
        burst.fillStyle(color, 0.5);
        for (let mote = 0; mote < 8; mote += 1) {
          const angle = (Math.PI * 2 * mote) / 8 + mote * 0.21;
          burst.fillCircle(Math.cos(angle) * 59, Math.sin(angle) * 59, 2.6);
        }
      } else {
        burst.lineStyle(visual.weight === 'heavy' ? 5 : 4, color, 0.76);
        for (let ray = 0; ray < 9; ray += 1) {
          const angle = (Math.PI * 2 * ray) / 9 + ray * 0.17;
          const inner = 26 + (ray % 3) * 5;
          const outer = inner + 18 + (ray % 2) * 14;
          burst.lineBetween(
            Math.cos(angle) * inner,
            Math.sin(angle) * inner,
            Math.cos(angle) * outer,
            Math.sin(angle) * outer,
          );
        }
      }
      this.tweens.add({
        targets: burst,
        alpha: 0,
        scale: visual.discipline === 'true' ? 1.46 : 1.24,
        angle: visual.discipline === 'true' ? -12 : 0,
        duration: visual.discipline === 'true' ? 1_250 : 1_000,
        ease: 'Cubic.Out',
        onComplete: () => burst.destroy(),
      });
    }

    private playShieldBreak(target: EntityVisual) {
      const fragments = this.add
        .graphics({ x: target.container.x, y: target.container.y })
        .setDepth(7);
      fragments.lineStyle(3, 0xb47d18, 0.82);
      for (let index = 0; index < 10; index += 1) {
        const angle = (Math.PI * 2 * index) / 10;
        const inner = target.radius + 5;
        const outer = target.radius + 18 + (index % 2) * 8;
        fragments.lineBetween(
          Math.cos(angle) * inner,
          Math.sin(angle) * inner,
          Math.cos(angle + 0.1) * outer,
          Math.sin(angle + 0.1) * outer,
        );
      }
      this.tweens.add({
        targets: fragments,
        scale: 1.32,
        alpha: 0,
        angle: 8,
        duration: 850,
        ease: 'Cubic.Out',
        onComplete: () => fragments.destroy(),
      });
    }

    private playDeathFragments(target: EntityVisual) {
      const fragments = this.add.graphics().setDepth(7);
      fragments.fillStyle(0x5e5750, 0.72);
      for (let index = 0; index < 12; index += 1) {
        const angle = (Math.PI * 2 * index) / 12;
        fragments.fillRect(
          target.container.x + Math.cos(angle) * (target.radius + 4),
          target.container.y + Math.sin(angle) * (target.radius + 4),
          3 + (index % 3),
          2,
        );
      }
      this.tweens.add({
        targets: fragments,
        y: 18,
        alpha: 0,
        scale: 1.24,
        duration: 1_300,
        ease: 'Cubic.Out',
        onComplete: () => fragments.destroy(),
      });
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: args.root,
    width: Math.round(stage.width * renderScale),
    height: Math.round(stage.height * renderScale),
    transparent: true,
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
    dom: {
      createContainer: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.round(stage.width * renderScale),
      height: Math.round(stage.height * renderScale),
    },
    scene: RealtimeBattleScene,
  });

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return;
    const nextStage = selectStage(
      args.root.clientWidth,
      args.root.clientHeight,
    );
    if (nextStage.profile === stage.profile) return;
    if (scene) {
      scene.requestRelayout(nextStage);
      return;
    }
    stage = nextStage;
    formationPositions = projectFormation(currentSnapshot.entities, stage);
  });
  resizeObserver.observe(args.root);

  return {
    syncSnapshot: (snapshot) => {
      currentSnapshot = snapshot;
      scene?.renderSnapshot(snapshot);
      args.onState(snapshot);
    },
    playTimeline: (timeline, offsetMs = 0) => {
      scene?.playTimeline(timeline, offsetMs);
    },
    focus: (entityId) => {
      if (!currentSnapshot.entities.some((entity) => entity.id === entityId))
        return;
      currentSnapshot = { ...currentSnapshot, focusedEntityId: entityId };
      scene?.renderSnapshot(currentSnapshot);
      args.onFocus(entityId);
      args.onState(currentSnapshot);
    },
    setCommandSelection: (state) => {
      scene?.setCommandSelection(state);
    },
    setPaused: (nextPaused) => {
      paused = nextPaused;
      scene?.setPlaybackState(paused, speed);
    },
    setSpeed: (nextSpeed) => {
      speed = Math.max(0.5, Math.min(nextSpeed, 2));
      scene?.setPlaybackState(paused, speed);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      resizeObserver.disconnect();
      scene = undefined;
      game.destroy(true);
    },
  };
}
