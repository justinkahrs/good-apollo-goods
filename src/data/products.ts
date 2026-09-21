import type { ImageMetadata } from 'astro';
import comingSoonImage from '../assets/good-apollo-coming-soon.png';

export const shopCategories = [
  { id: 'all', label: 'All pieces', href: '/shop/' },
  { id: 'wearables', label: 'Wearables', href: '/shop/wearables/' },
  { id: 'art', label: 'Art', href: '/shop/art/' },
] as const;

export type ProductKind = Exclude<(typeof shopCategories)[number]['id'], 'all'>;
export type ProductStatus = 'Ready to ship';

export interface ProductImage {
  src: ImageMetadata;
  alt: string;
  position?: string;
}

export interface Product {
  slug: string;
  name: string;
  kind: ProductKind;
  price: number;
  color: string;
  materials: string[];
  lining: string;
  sizes: string[];
  status: ProductStatus;
  isListed: boolean;
  description: string;
  detail: string;
  images: ProductImage[];
}

const placeholder = (name: string): ProductImage => ({
  src: comingSoonImage,
  alt: `${name} photography coming soon`,
});

/** Initial collection. Replace placeholders as finished photography arrives. */
export const products: Product[] = [
  {
    slug: 'mulberry-corduroy-hat',
    name: 'Mulberry corduroy hat',
    kind: 'wearables',
    price: 72,
    color: 'Mulberry',
    materials: ['Cotton corduroy', 'Cotton'],
    lining: 'Fully lined in soft cotton',
    sizes: ['S', 'M', 'L', 'XL'],
    status: 'Ready to ship',
    isListed: false,
    description: 'A softly structured everyday hat in deep mulberry corduroy, finished with a comfortable cotton lining.',
    detail: 'Cut and sewn one at a time in the Good Apollo studio. Small variations are part of the character of a handmade piece.',
    images: [placeholder('Mulberry corduroy hat')],
  },
  {
    slug: 'ochre-cotton-twill-hat',
    name: 'Ochre cotton twill hat',
    kind: 'wearables',
    price: 68,
    color: 'Warm ochre',
    materials: ['Cotton twill', 'Cotton'],
    lining: 'Fully lined in soft cotton',
    sizes: ['S', 'M', 'L', 'XL'],
    status: 'Ready to ship',
    isListed: false,
    description: 'A clean, versatile shape in sturdy cotton twill with a warm ochre color and an easy cotton-lined interior.',
    detail: 'Made in a small batch with close attention to the brim, seams, and the way the hat settles into shape with wear.',
    images: [placeholder('Ochre cotton twill hat')],
  },
  {
    slug: 'moss-corduroy-hat',
    name: 'Moss corduroy hat',
    kind: 'wearables',
    price: 58,
    color: 'Garden moss',
    materials: ['Cotton corduroy', 'Cotton'],
    lining: 'Fully lined in soft cotton',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    status: 'Ready to ship',
    isListed: false,
    description: 'A comfortable child-sized hat in soft moss corduroy, made for everyday wear and lined in breathable cotton.',
    detail: 'Each hat is cut and sewn by one maker in Grand Rapids. Choose size by actual head circumference for the best fit.',
    images: [placeholder('Moss corduroy hat')],
  },
  {
    slug: 'oat-cotton-hat',
    name: 'Oat cotton hat',
    kind: 'wearables',
    price: 56,
    color: 'Natural oat',
    materials: ['Cotton', 'Cotton twill'],
    lining: 'Fully lined in soft cotton',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    status: 'Ready to ship',
    isListed: false,
    description: 'A light, softly structured hat in natural cotton with a practical twill outer and a smooth cotton lining.',
    detail: 'Made in a limited run in the Good Apollo studio, with durable seams and a simple shape that works season after season.',
    images: [placeholder('Oat cotton hat')],
  },
];

export const formatPrice = (price: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(price);
