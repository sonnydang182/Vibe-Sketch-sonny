import { CharacterId, Language } from '../types';

// Vite glob import: bundle all 40 PNGs as URLs.
const allImages = import.meta.glob('../assets/characters/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const lookup = (id: CharacterId, kind: 'thumb' | 'ref'): string => {
  const suffix = kind === 'ref' ? '@ref' : '';
  const key = `../assets/characters/${id}${suffix}.png`;
  return allImages[key] || '';
};

export interface CharacterDef {
  id: CharacterId;
  /** Number shown in the picker grid (1-20 for doodles, 0 for stickman). */
  index: number;
  /** Visual style hint for the prompt. */
  styleHint: string;
  /** Personality / pose hint for the prompt. */
  personalityHint: string;
  /** Name shown in UI (per language). */
  labels: Record<Language, string>;
  /** URL of full tile (for picker UI). Empty for stickman. */
  thumbUrl: string;
  /** URL of 512×512 reference image (for AI). Empty for stickman. */
  refUrl: string;
}

const STICKMAN_SVG_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#FDF6E3"/>
      <g fill="none" stroke="#1a1a1a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="100" cy="55" r="24" fill="#FDF6E3"/>
        <circle cx="92" cy="52" r="3" fill="#1a1a1a"/>
        <circle cx="108" cy="52" r="3" fill="#1a1a1a"/>
        <path d="M93 64 Q100 70 107 64"/>
        <line x1="100" y1="79" x2="100" y2="135"/>
        <line x1="100" y1="95" x2="65" y2="115"/>
        <line x1="100" y1="95" x2="135" y2="115"/>
        <line x1="100" y1="135" x2="78" y2="170"/>
        <line x1="100" y1="135" x2="122" y2="170"/>
      </g>
    </svg>
  `);

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'stickman', index: 0,
    styleHint: 'a classic minimalist STICK FIGURE: perfect circle head, simple thin black stick limbs, no clothing details',
    personalityHint: 'expressive face with simple eyes and mouth that match the scene emotion',
    labels: {
      Vietnamese: 'Stickman cổ điển',
      English: 'Classic Stickman',
      Japanese: 'クラシック棒人間',
    },
    thumbUrl: STICKMAN_SVG_DATA_URL,
    refUrl: '', // No reference image — pure prompt-driven
  },
  {
    id: '01-curious', index: 1,
    styleHint: 'doodle character with brown short hair and green hoodie',
    personalityHint: 'curious and inquisitive, often holding a magnifying glass, with a small "?" near their head',
    labels: { Vietnamese: 'Tò mò', English: 'Curious', Japanese: '好奇心' },
    thumbUrl: lookup('01-curious', 'thumb'),
    refUrl: lookup('01-curious', 'ref'),
  },
  {
    id: '02-hyperactive', index: 2,
    styleHint: 'doodle character with messy black hair, red T-shirt, energetic posture',
    personalityHint: 'hyperactive, jumping with arms thrown up, big open-mouth smile',
    labels: { Vietnamese: 'Tăng động', English: 'Hyperactive', Japanese: 'ハイパー' },
    thumbUrl: lookup('02-hyperactive', 'thumb'),
    refUrl: lookup('02-hyperactive', 'ref'),
  },
  {
    id: '03-sleepy', index: 3,
    styleHint: 'doodle character with bun hair, light blue pajamas, holding a pillow',
    personalityHint: 'sleepy, yawning with closed eyes, "Zzz" floating nearby',
    labels: { Vietnamese: 'Buồn ngủ', English: 'Sleepy', Japanese: '眠そう' },
    thumbUrl: lookup('03-sleepy', 'thumb'),
    refUrl: lookup('03-sleepy', 'ref'),
  },
  {
    id: '04-confident', index: 4,
    styleHint: 'doodle character with long black hair, pink jacket, hands on hips',
    personalityHint: 'confident, calm proud smile, small sparkle stars around',
    labels: { Vietnamese: 'Tự tin', English: 'Confident', Japanese: '自信' },
    thumbUrl: lookup('04-confident', 'thumb'),
    refUrl: lookup('04-confident', 'ref'),
  },
  {
    id: '05-anxious', index: 5,
    styleHint: 'doodle character with short black hair, gray-blue shirt, hands clasped',
    personalityHint: 'anxious, worried sweat drop, scribble cloud above head',
    labels: { Vietnamese: 'Lo âu', English: 'Anxious', Japanese: '不安' },
    thumbUrl: lookup('05-anxious', 'thumb'),
    refUrl: lookup('05-anxious', 'ref'),
  },
  {
    id: '06-mischievous', index: 6,
    styleHint: 'doodle character with brown hair, yellow T-shirt, finger pointing slyly',
    personalityHint: 'mischievous, sly grin, sparkle in the eye',
    labels: { Vietnamese: 'Tinh quái', English: 'Mischievous', Japanese: 'いたずら' },
    thumbUrl: lookup('06-mischievous', 'thumb'),
    refUrl: lookup('06-mischievous', 'ref'),
  },
  {
    id: '07-introvert', index: 7,
    styleHint: 'doodle character with long straight black hair, gray top, sitting cross-legged',
    personalityHint: 'introverted, calmly reading a green book, quiet expression',
    labels: { Vietnamese: 'Hướng nội', English: 'Introvert', Japanese: '内向的' },
    thumbUrl: lookup('07-introvert', 'thumb'),
    refUrl: lookup('07-introvert', 'ref'),
  },
  {
    id: '08-inventor', index: 8,
    styleHint: 'doodle character with curly brown hair, round glasses, white lab coat',
    personalityHint: 'inventor, holding a glowing light bulb and a wrench, bright eureka face',
    labels: { Vietnamese: 'Nhà phát minh', English: 'Inventor', Japanese: '発明家' },
    thumbUrl: lookup('08-inventor', 'thumb'),
    refUrl: lookup('08-inventor', 'ref'),
  },
  {
    id: '09-athlete', index: 9,
    styleHint: 'doodle character with high ponytail, blue basketball jersey #7, headband',
    personalityHint: 'energetic athlete, dribbling a basketball, mid-stride run',
    labels: { Vietnamese: 'Vận động viên', English: 'Athlete', Japanese: 'アスリート' },
    thumbUrl: lookup('09-athlete', 'thumb'),
    refUrl: lookup('09-athlete', 'ref'),
  },
  {
    id: '10-dreamer', index: 10,
    styleHint: 'doodle character with brown wavy hair, blue shirt, hand on chin',
    personalityHint: 'dreamer, looking up at a thought-cloud with a fairy castle',
    labels: { Vietnamese: 'Mộng mơ', English: 'Dreamer', Japanese: '夢見がち' },
    thumbUrl: lookup('10-dreamer', 'thumb'),
    refUrl: lookup('10-dreamer', 'ref'),
  },
  {
    id: '11-strict-teacher', index: 11,
    styleHint: 'doodle character with bun hair, black blazer, square glasses, holding a pointer and red book',
    personalityHint: 'strict teacher, frowning slightly, authoritative pose',
    labels: { Vietnamese: 'Giáo viên khó tính', English: 'Strict Teacher', Japanese: '厳しい先生' },
    thumbUrl: lookup('11-strict-teacher', 'thumb'),
    refUrl: lookup('11-strict-teacher', 'ref'),
  },
  {
    id: '12-gamer', index: 12,
    styleHint: 'doodle character with black hair, red gaming headphones, blue shirt, in a black-and-red gaming chair',
    personalityHint: 'gamer, holding a controller, focused happy face',
    labels: { Vietnamese: 'Game thủ', English: 'Gamer', Japanese: 'ゲーマー' },
    thumbUrl: lookup('12-gamer', 'thumb'),
    refUrl: lookup('12-gamer', 'ref'),
  },
  {
    id: '13-cheerful', index: 13,
    styleHint: 'doodle character with pigtails, yellow polka-dot dress, jumping',
    personalityHint: 'extremely cheerful, big closed-eye smile, confetti around',
    labels: { Vietnamese: 'Cực vui vẻ', English: 'Super Cheerful', Japanese: '超ハッピー' },
    thumbUrl: lookup('13-cheerful', 'thumb'),
    refUrl: lookup('13-cheerful', 'ref'),
  },
  {
    id: '14-overthinker', index: 14,
    styleHint: 'doodle character with black hair, blue hoodie, finger on chin',
    personalityHint: 'overthinking, multiple swirly thought clouds with "?" floating around head',
    labels: { Vietnamese: 'Hay nghĩ', English: 'Overthinker', Japanese: '考えすぎ' },
    thumbUrl: lookup('14-overthinker', 'thumb'),
    refUrl: lookup('14-overthinker', 'ref'),
  },
  {
    id: '15-detective', index: 15,
    styleHint: 'doodle character with brown trench coat and detective deerstalker hat, holding a magnifying glass',
    personalityHint: 'detective, serious focused expression, investigating',
    labels: { Vietnamese: 'Thám tử', English: 'Detective', Japanese: '探偵' },
    thumbUrl: lookup('15-detective', 'thumb'),
    refUrl: lookup('15-detective', 'ref'),
  },
  {
    id: '16-artist', index: 16,
    styleHint: 'doodle character with brown hair, black beret, white apron, holding a paint palette and brush',
    personalityHint: 'artist, dreamy creative smile',
    labels: { Vietnamese: 'Nghệ sĩ', English: 'Artist', Japanese: 'アーティスト' },
    thumbUrl: lookup('16-artist', 'thumb'),
    refUrl: lookup('16-artist', 'ref'),
  },
  {
    id: '17-leader', index: 17,
    styleHint: 'doodle character with short black hair, white shirt, red tie, planting a red flag on a rock',
    personalityHint: 'leader, pointing forward decisively, victorious smile',
    labels: { Vietnamese: 'Lãnh đạo', English: 'Leader', Japanese: 'リーダー' },
    thumbUrl: lookup('17-leader', 'thumb'),
    refUrl: lookup('17-leader', 'ref'),
  },
  {
    id: '18-bookworm', index: 18,
    styleHint: 'doodle character with bun hair, large round glasses, beige cardigan, holding a green book',
    personalityHint: 'bookworm / top student, raising a finger as if explaining, sparkle nearby',
    labels: { Vietnamese: 'Học bá', English: 'Bookworm', Japanese: '勉強家' },
    thumbUrl: lookup('18-bookworm', 'thumb'),
    refUrl: lookup('18-bookworm', 'ref'),
  },
  {
    id: '19-dramatic', index: 19,
    styleHint: 'doodle character with long wavy brown hair, red dress, theatrical pose',
    personalityHint: 'dramatic, hand on chest, mouth open in opera-style declamation, the other hand reaching outward',
    labels: { Vietnamese: 'Kịch tính', English: 'Dramatic', Japanese: 'ドラマチック' },
    thumbUrl: lookup('19-dramatic', 'thumb'),
    refUrl: lookup('19-dramatic', 'ref'),
  },
  {
    id: '20-gentle', index: 20,
    styleHint: 'doodle character with black bob hair, soft pink top, holding a small pink flower',
    personalityHint: 'gentle, soft warm smile, tiny hearts floating around',
    labels: { Vietnamese: 'Dịu dàng', English: 'Gentle', Japanese: '優しい' },
    thumbUrl: lookup('20-gentle', 'thumb'),
    refUrl: lookup('20-gentle', 'ref'),
  },
];

export const getCharacter = (id: CharacterId): CharacterDef =>
  CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

/**
 * Fetch a static asset URL and return its base64 + mime type, suitable for
 * Gemini inlineData. Returns null for stickman (no ref image).
 */
export const loadCharacterRefAsBase64 = async (
  id: CharacterId
): Promise<{ data: string; mimeType: string } | null> => {
  const c = getCharacter(id);
  if (!c.refUrl) return null;
  const res = await fetch(c.refUrl);
  if (!res.ok) return null;
  const blob = await res.blob();
  const mimeType = blob.type || 'image/png';
  const buf = await blob.arrayBuffer();
  // base64 encode
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return { data: btoa(binary), mimeType };
};

/** Fetch the static ref URL as a Blob (for Coachio uploads). */
export const fetchCharacterRefBlob = async (id: CharacterId): Promise<Blob | null> => {
  const c = getCharacter(id);
  if (!c.refUrl) return null;
  const res = await fetch(c.refUrl);
  if (!res.ok) return null;
  return await res.blob();
};
