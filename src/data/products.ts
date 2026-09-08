import type { ImageMetadata } from 'astro';
import blanketImage from '../assets/sunlit-cream-throw.png';
import bagImage from '../assets/patchwork-tote.png';
import scarfImage from '../assets/plum-striped-scarf.png';

export const categories = [
  { id: 'all', label: 'All the good things' },
  { id: 'crochet', label: 'Crochet' },
  { id: 'knitwear', label: 'Knitwear' },
  { id: 'sewn', label: 'Sewn goods' },
] as const;

export type Category = Exclude<(typeof categories)[number]['id'], 'all'>;
export interface Product {
  slug: string;
  name: string;
  category: Category;
  craft: string;
  color: string;
  samplePrice: number;
  description: string;
  detail: string;
  image: ImageMetadata;
  imageAlt: string;
  imagePosition?: string;
}

/** Illustrative prelaunch content only: these are not real inventory or offers. */
export const products: Product[] = [
  {
    slug: 'sunday-blanket', name: 'The Sunday blanket', category: 'crochet',
    craft: 'Crocheted comfort', color: 'Oat milk', samplePrice: 185,
    description: 'For the long way through a Sunday. A generous, textured throw imagined in the softest shade of cream.',
    detail: 'Big, open stitches and a little extra texture. The sort of piece you leave over the arm of your favorite chair, always within reach.',
    image: blanketImage,
    imageAlt: 'Concept photo of a chunky cream throw draped over a wooden chair in afternoon sunlight',
    imagePosition: '70% center',
  },
  {
    slug: 'gathering-bag', name: 'The gathering bag', category: 'sewn',
    craft: 'Patchwork & little adventures', color: 'Garden remnants', samplePrice: 98,
    description: 'A happy gathering of prints, colors, and places to go. An everyday tote with a patchwork point of view.',
    detail: 'Plum, olive, and golden gingham come together in an easygoing quilted shape. An idea for carrying a book, a project, or a little bit of everything.',
    image: bagImage,
    imageAlt: 'Concept photo of a quilted patchwork tote in plum, olive, cream, and ochre with ivory handles',
  },
  {
    slug: 'afterglow-scarf', name: 'The afterglow scarf', category: 'knitwear',
    craft: 'Knitted warmth', color: 'Mulberry & cream', samplePrice: 120,
    description: 'One more reason to take the evening walk. A generous knit, a deep berry hue, and a few quiet stripes.',
    detail: 'A simple shape with the stitches doing the talking. Imagined as a soft layer for cool mornings and the first hint of autumn.',
    image: scarfImage,
    imageAlt: 'Concept photo of a folded plum knitted scarf with fine cream stripes and visible stitch texture',
  },
];

export const formatPrice = (price: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(price);
