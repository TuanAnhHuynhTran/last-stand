import type { CharacterAppearance } from '@cityverse/shared';
import { Tag } from 'antd';

interface CharacterAvatarPreviewProps {
  name?: string;
  appearance: CharacterAppearance;
  size?: 'sm' | 'lg';
}

export function CharacterAvatarPreview({
  name,
  appearance,
  size = 'lg',
}: CharacterAvatarPreviewProps) {
  const isLarge = size === 'lg';
  const boxSize = isLarge ? 180 : 112;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: boxSize,
          height: boxSize,
          borderRadius: 20,
          background: `radial-gradient(circle at 50% 25%, ${appearance.outfitPrimaryColor}33, #0b1424 78%)`,
          border: `2px solid ${appearance.outfitPrimaryColor}88`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
        aria-label={name ? `Nhan vat ${name}` : 'Xem truoc nhan vat'}
      >
        <svg
          width={boxSize * 0.78}
          height={boxSize * 0.85}
          viewBox="0 0 120 130"
          role="img"
          aria-hidden="true"
        >
          {/* Shoulders / Outfit */}
          <path
            d="M24 124 C24 92, 42 82, 60 82 C78 82, 96 92, 96 124 Z"
            fill={appearance.outfitPrimaryColor}
          />
          <path d="M44 84 L60 112 L76 84 Z" fill={appearance.outfitSecondaryColor} />

          {/* Scarf accessory */}
          {appearance.accessory === 'scarf' && (
            <rect x="42" y="76" width="36" height="10" rx="5" fill="#f8fafc" />
          )}

          {/* Neck & Head */}
          <rect x="52" y="66" width="16" height="18" rx="6" fill={appearance.skinTone} />
          <circle cx="60" cy="48" r="22" fill={appearance.skinTone} />

          {/* Hair */}
          <path
            d="M38 45 C38 26, 82 26, 82 45 C77 35, 43 35, 38 45 Z"
            fill={appearance.hairColor}
          />

          {/* Hard Hat */}
          {appearance.accessory === 'hard_hat' && (
            <g>
              <path d="M36 38 C38 20, 82 20, 84 38 Z" fill="#f59e0b" />
              <rect x="33" y="36" width="54" height="5" rx="2.5" fill="#fbbf24" />
            </g>
          )}

          {/* Eyes */}
          <circle cx="52" cy="50" r="2.5" fill="#0f172a" />
          <circle cx="68" cy="50" r="2.5" fill="#0f172a" />

          {/* Glasses */}
          {appearance.accessory === 'glasses' && (
            <g stroke="#e2e8f0" strokeWidth="2" fill="rgba(56, 189, 248, 0.25)">
              <rect x="44" y="45" width="14" height="9" rx="3" />
              <rect x="62" y="45" width="14" height="9" rx="3" />
              <line x1="58" y1="49" x2="62" y2="49" />
            </g>
          )}

          {/* Visor */}
          {appearance.accessory === 'visor' && (
            <rect
              x="42"
              y="44"
              width="36"
              height="10"
              rx="4"
              fill="#38bdf8"
              fillOpacity="0.7"
              stroke="#e0f2fe"
              strokeWidth="1.5"
            />
          )}

          {/* Smile */}
          <path
            d="M53 59 Q60 64 67 59"
            fill="none"
            stroke="#3f2a1d"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {isLarge && (
        <Tag color="geekblue" style={{ margin: 0 }}>
          3D Asset Key: {appearance.modelKey}
        </Tag>
      )}
    </div>
  );
}
