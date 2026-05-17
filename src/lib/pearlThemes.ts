export type PearlTheme = {
  id: string
  name: string
  colors: readonly string[]
}

export type ThemeGroup = {
  id: string
  themes: readonly PearlTheme[]
}

export const DEFAULT_THEME_ID = 'rainbow'

export const THEME_GROUPS: readonly ThemeGroup[] = [
  {
    id: 'colors',
    themes: [
      {
        id: 'rainbow',
        name: 'Rainbow',
        colors: [
          '#ff2c2c',
          '#ff8c00',
          '#ffd600',
          '#b5e800',
          '#00c957',
          '#00ddb0',
          '#1ab8ff',
          '#2866ff',
          '#8844ff',
          '#e800ff',
          '#ff1a8c',
          '#ff6040',
        ],
      },
      {
        id: 'pride',
        name: 'Pride',
        colors: [
          // Red — 2 variants
          '#e60000',
          '#ff3344',
          // Orange — 2 variants
          '#f08000',
          '#ff9300',
          // Yellow — 2 variants
          '#e6c800',
          '#ffe100',
          // Green — 2 variants
          '#009900',
          '#00b700',
          // Blue — 2 variants
          '#0000cc',
          '#1a1aff',
          // Violet — 2 variants
          '#660066',
          '#9900aa',
        ],
      },
      {
        id: 'galaxy',
        name: 'Galaxy',
        colors: [
          '#050015',
          '#0d0030',
          '#1a0055',
          '#2b0080',
          '#3d00cc',
          '#5500e6',
          '#8800cc',
          '#bb00aa',
          '#dd0088',
          '#ee0066',
          '#ff3399',
          '#ff66bb',
        ],
      },
      {
        id: 'neon',
        name: 'Neon',
        colors: [
          '#ff003c',
          '#ff4d00',
          '#ffcc00',
          '#aaff00',
          '#00ff44',
          '#00ffcc',
          '#00ccff',
          '#0066ff',
          '#6600ff',
          '#cc00ff',
          '#ff00cc',
          '#ff0088',
        ],
      },
      {
        id: 'pastel',
        name: 'Pastel',
        colors: [
          '#ffb3b3',
          '#ffd0a0',
          '#fff0a0',
          '#d4f0a0',
          '#a0f0c0',
          '#a0f0e8',
          '#a0d8f0',
          '#a0b8f8',
          '#c0a0f8',
          '#e0a0f8',
          '#f8a0d8',
          '#f8a0b8',
        ],
      },
    ],
  },
  {
    id: 'nature',
    themes: [
      {
        id: 'ocean',
        name: 'Ocean',
        colors: [
          '#001a33',
          '#002b5e',
          '#003d8a',
          '#0055b3',
          '#0077cc',
          '#0099e6',
          '#00aadd',
          '#00c5cc',
          '#00d4b8',
          '#00e5a0',
          '#33eecc',
          '#66f5e0',
        ],
      },
      {
        id: 'sunset',
        name: 'Sunset',
        colors: [
          '#1a0040',
          '#4a0050',
          '#8b0060',
          '#c0003a',
          '#e81530',
          '#f04010',
          '#f07000',
          '#f09000',
          '#f5b400',
          '#f5d000',
          '#f5e800',
          '#f5f040',
        ],
      },
      {
        id: 'forest',
        name: 'Forest',
        colors: [
          '#0d2200',
          '#1a3c00',
          '#2a5200',
          '#3d6b00',
          '#4d8000',
          '#5e9900',
          '#70b300',
          '#82cc00',
          '#94e000',
          '#a6f200',
          '#bbff33',
          '#ccff66',
        ],
      },
      {
        id: 'sakura',
        name: 'Sakura',
        colors: [
          '#c0005a',
          '#d41a6e',
          '#e03382',
          '#e85599',
          '#f07ab5',
          '#f59dcb',
          '#f8b8d8',
          '#faccdf',
          '#fcdde8',
          '#fce8f0',
          '#fdf0f5',
          '#fff5f8',
        ],
      },
      {
        id: 'arctic',
        name: 'Arctic',
        colors: [
          '#001433',
          '#002255',
          '#003377',
          '#004499',
          '#1a6699',
          '#3388bb',
          '#55aacc',
          '#77ccdd',
          '#99ddee',
          '#bbecf5',
          '#d4f4fa',
          '#eafaff',
        ],
      },
    ],
  },
  {
    id: 'seasons',
    themes: [
      {
        id: 'spring',
        name: 'Spring',
        colors: [
          // Blossom pink — 4 variants
          '#b3004d',
          '#cc0066',
          '#e60080',
          '#ff1a99',
          // Fresh green — 4 variants
          '#1a6600',
          '#248c00',
          '#2eb300',
          '#38d900',
          // Spring sky — 4 variants
          '#0066bb',
          '#0080dd',
          '#1a99ee',
          '#33b3ff',
        ],
      },
      {
        id: 'summer',
        name: 'Summer',
        colors: [
          // Hot gold — 4 variants
          '#cc7700',
          '#e68a00',
          '#ff9d00',
          '#ffb300',
          // Coral — 4 variants
          '#cc2200',
          '#e62b00',
          '#ff3300',
          '#ff5522',
          // Tropical sea — 4 variants
          '#007a66',
          '#009980',
          '#00b899',
          '#00d4b3',
        ],
      },
      {
        id: 'autumn',
        name: 'Autumn',
        colors: [
          '#3d0000',
          '#7a1500',
          '#b33000',
          '#cc5500',
          '#d97700',
          '#e6991a',
          '#e6b800',
          '#d4a017',
          '#c8860f',
          '#a8520a',
          '#7a3008',
          '#4d1a05',
        ],
      },
      {
        id: 'winter',
        name: 'Winter',
        colors: [
          // Deep navy — 4 variants
          '#001133',
          '#001e4d',
          '#002966',
          '#003380',
          // Steel blue — 4 variants
          '#1155aa',
          '#1a66bb',
          '#2277cc',
          '#2a88dd',
          // Frost — 4 variants
          '#6699aa',
          '#7ab3bb',
          '#8ecccc',
          '#a2e6dd',
        ],
      },
    ],
  },
  {
    id: 'flags',
    themes: [
      {
        id: 'brazil',
        name: 'Brazil',
        colors: [
          // Green band — 4 variants
          '#006400',
          '#007a00',
          '#009200',
          '#00a800',
          // Gold band — 4 variants
          '#cc9900',
          '#dba800',
          '#f0be00',
          '#ffd000',
          // Blue band — 4 variants
          '#002868',
          '#003399',
          '#0040b3',
          '#1a55cc',
        ],
      },
      {
        id: 'france',
        name: 'France',
        colors: [
          // Blue band — 4 variants
          '#00209f',
          '#0026bb',
          '#002fd4',
          '#1a44d9',
          // White/silver band — 4 variants
          '#d0d0d0',
          '#e0e0e0',
          '#ebebeb',
          '#f5f5f5',
          // Red band — 4 variants
          '#b20021',
          '#cc0026',
          '#e0002b',
          '#f50033',
        ],
      },
      {
        id: 'germany',
        name: 'Germany',
        colors: [
          // Black band — 4 brightness variants
          '#141414',
          '#1a1a1a',
          '#2e2e2e',
          '#424242',
          // Red band — 4 saturation/brightness variants
          '#b30000',
          '#cc0000',
          '#d91a1a',
          '#e60000',
          // Gold band — 4 saturation/brightness variants
          '#ccaa00',
          '#e6b800',
          '#f5c830',
          '#ffd700',
        ],
      },
      {
        id: 'italy',
        name: 'Italy',
        colors: [
          // Green band — 4 variants
          '#007140',
          '#008a4e',
          '#009b58',
          '#00b064',
          // White/silver band — 4 variants
          '#c0c0c0',
          '#d4d4d4',
          '#e8e8e8',
          '#f0f0f0',
          // Red band — 4 variants
          '#b20021',
          '#cc0026',
          '#e0002b',
          '#f50033',
        ],
      },
      {
        id: 'usa',
        name: 'USA',
        colors: [
          // Red band — 4 variants
          '#a00826',
          '#bf0a30',
          '#cc1234',
          '#d91e44',
          // White/silver band — 4 variants (off-white to avoid invisible pearls)
          '#c8c8c8',
          '#d8d8d8',
          '#e8e8e8',
          '#f0f0f0',
          // Blue band — 4 variants
          '#001f5b',
          '#002868',
          '#003399',
          '#0040b3',
        ],
      },
    ],
  },
]

export const PEARL_THEMES: readonly PearlTheme[] = THEME_GROUPS.flatMap((g) => [...g.themes])

export const getThemeColors = (id: string | null | undefined): readonly string[] =>
  PEARL_THEMES.find((t) => t.id === id)?.colors ?? PEARL_THEMES[0].colors
