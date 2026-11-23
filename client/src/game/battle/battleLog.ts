import { BATTLE_SKILLS, BATTLE_STATUS_LABELS, type BattleEvent, type BattleState } from '@cityverse/shared';

/** Readable battle log lines (Vietnamese) for the events of one action. */
export function describeEvents(events: readonly BattleEvent[], s: BattleState): string[] {
  const name = (id: string) => s.units.find((u) => u.id === id)?.name ?? id;
  const out: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'turn':
        out.push(e.side === 'player' ? `— Lượt ${e.turn}: quân ta —` : `— Lượt ${e.turn}: kẻ địch —`);
        break;
      case 'move':
        out.push(`${name(e.unitId)} di chuyển ${e.path.length - 1} ô`);
        break;
      case 'attack': {
        const how = e.counter ? 'phản đòn' : e.reaction ? 'chặn đánh' : e.skill ? BATTLE_SKILLS[e.skill].name : 'tấn công';
        out.push(
          e.hit
            ? `${name(e.unitId)} ${how} ${name(e.targetId)}: -${e.damage}${e.crit ? ' (chí mạng)' : ''}${e.blocked ? ' (đỡ bằng khiên)' : ''}${e.ko ? ' — gục!' : ''}`
            : `${name(e.unitId)} ${how} ${name(e.targetId)}: trượt`
        );
        break;
      }
      case 'skill':
        out.push(`${name(e.unitId)} dùng ${BATTLE_SKILLS[e.skill].name}`);
        break;
      case 'status':
        out.push(`${name(e.unitId)}: ${BATTLE_STATUS_LABELS[e.status]}`);
        break;
      case 'poison':
        out.push(`${name(e.unitId)} trúng độc -${e.damage}${e.ko ? ' — gục!' : ''}`);
        break;
      case 'heal':
        out.push(`${name(e.by)} băng bó ${name(e.unitId)}: +${e.amount}`);
        break;
      case 'defend':
        out.push(`${name(e.unitId)} phòng thủ`);
        break;
      case 'reload':
        out.push(`${name(e.unitId)} nạp tên nỏ`);
        break;
      case 'free':
        out.push(`${name(e.unitId)} giải cứu ${name(e.captiveId)}!`);
        break;
      case 'stunned':
        out.push(`${name(e.unitId)} bị choáng, mất lượt`);
        break;
      case 'outcome':
        out.push(e.result === 'victory' ? `🏆 Chiến thắng (${e.stars}★)` : '💀 Thất bại');
        break;
      default:
    }
  }
  return out;
}
