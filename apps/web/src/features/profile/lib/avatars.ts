export interface PersonaAvatar {
  id: string;
  name: string;
  category: 'Executive' | 'Operations' | 'Specialist' | 'Admin';
  svgUrl: string;
}

// Curated high-resolution SVG avatars generated via modern clean SVG data URIs
function makeSvgAvatar(bgColor1: string, bgColor2: string, iconColor: string, initialsOrEmoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgColor1}" />
        <stop offset="100%" stop-color="${bgColor2}" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="50" fill="url(#grad)" />
    <text x="50" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="bold" fill="${iconColor}" text-anchor="middle" dominant-baseline="middle">${initialsOrEmoji}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const PERSONA_AVATARS: PersonaAvatar[] = [
  {
    id: 'avatar-admin-crown',
    name: 'Super Admin',
    category: 'Admin',
    svgUrl: makeSvgAvatar('#4f46e5', '#7c3aed', '#ffffff', '👑'),
  },
  {
    id: 'avatar-executive',
    name: 'Executive Lead',
    category: 'Executive',
    svgUrl: makeSvgAvatar('#1e293b', '#0f172a', '#ffffff', '👔'),
  },
  {
    id: 'avatar-procurement',
    name: 'Procurement Head',
    category: 'Operations',
    svgUrl: makeSvgAvatar('#059669', '#10b981', '#ffffff', '📋'),
  },
  {
    id: 'avatar-contractor',
    name: 'Lead Supplier',
    category: 'Specialist',
    svgUrl: makeSvgAvatar('#ea580c', '#f97316', '#ffffff', '🏭'),
  },
  {
    id: 'avatar-engineer',
    name: 'Technical Officer',
    category: 'Specialist',
    svgUrl: makeSvgAvatar('#0284c7', '#38bdf8', '#ffffff', '⚙️'),
  },
  {
    id: 'avatar-auditor',
    name: 'Governance Chair',
    category: 'Executive',
    svgUrl: makeSvgAvatar('#be185d', '#ec4899', '#ffffff', '⚖️'),
  },
  {
    id: 'avatar-facility',
    name: 'Facility Secretary',
    category: 'Operations',
    svgUrl: makeSvgAvatar('#0d9488', '#14b8a6', '#ffffff', '🏢'),
  },
  {
    id: 'avatar-sourcing',
    name: 'Sourcing Specialist',
    category: 'Specialist',
    svgUrl: makeSvgAvatar('#d97706', '#fbbf24', '#ffffff', '🤝'),
  },
];

/**
 * Reads a user-uploaded image file, crops it centered to a 1:1 square,
 * resizes it down to maxSize x maxSize (default 256x256),
 * and compresses it to a lightweight WebP/JPEG data URI (~15-25 KB).
 */
export async function compressAndCropAvatar(file: File, maxSize = 256): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload a valid image file (JPEG, PNG, WebP).');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image size must be less than 10MB.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to process image format.'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = maxSize;
          canvas.height = maxSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas rendering context not available.'));
            return;
          }

          // Center crop calculation
          const minDim = Math.min(img.width, img.height);
          const startX = (img.width - minDim) / 2;
          const startY = (img.height - minDim) / 2;

          // High quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          ctx.drawImage(
            img,
            startX,
            startY,
            minDim,
            minDim,
            0,
            0,
            maxSize,
            maxSize
          );

          // Export as JPEG with 0.88 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
